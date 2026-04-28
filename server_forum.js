#!/usr/bin/env node
/**
 * YTP Forum Mirror Server
 *
 * Serves scraped forum pages from site_mirror/ and rewrites every internal
 * forum link to point at the local mirror instead of the live site.
 * When a page has not been scraped yet it triggers scraper.py for that
 * section/thread and returns a "please wait / auto-refresh" page.
 *
 * Usage:
 *   node server.js              # default port 3000
 *   PORT=8080 node server.js    # custom port
 *
 * No npm packages required — pure Node.js built-ins.
 */

'use strict';

const http  = require('http');
const fs    = require('fs');
const path  = require('path');
const { URL }     = require('url');
const { spawn }   = require('child_process');

// ─── Config ───────────────────────────────────────────────────────────────────
const PORT        = parseInt(process.env.PORT || '3001', 10);
const SITE_MIRROR = path.join(__dirname, 'site_mirror');
const STATE_FILE  = path.join(SITE_MIRROR, '.scraper_state.json');
const SCRAPER     = path.join(__dirname, 'scripts', 'forum_scraper.py');
const BASE_DOMAIN = 'youtubepoopita.forumfree.it';
const VIDEO_INDEX = path.join(__dirname, 'db', 'video_index.json');
const EXCLUDED_VIDEOS = path.join(__dirname, 'db', 'excluded_videos.json');
const SOURCES_INDEX = path.join(__dirname, 'db', 'sources_index.json');
const VIDEOS_DIR  = path.join(__dirname, 'db', 'videos');
const SOURCES_DIR = path.join(__dirname, 'sources');

// ─── Video Management Logic ──────────────────────────────────────────────────

function banVideos(videoIds, videoIndexPath, excludedVideosPath, videosDir) {
  let index = {};
  try { index = JSON.parse(fs.readFileSync(videoIndexPath, 'utf8')); } catch (err) {
    return { success: false, error: 'Failed to read video index' };
  }
  let excluded = {};
  try {
    if (fs.existsSync(excludedVideosPath)) {
      excluded = JSON.parse(fs.readFileSync(excludedVideosPath, 'utf8'));
    }
  } catch (err) {}
  const results = { deleted: [], failed: [], skipped: [] };
  for (const id of videoIds) {
    if (!index[id]) { results.skipped.push(id); continue; }
    const entry = index[id];
    if (entry.local_file) {
      const filePath = path.join(__dirname, entry.local_file);
      try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch (err) {}
    }
    excluded[id] = entry;
    delete index[id];
    results.deleted.push(id);
  }
  try {
    fs.writeFileSync(videoIndexPath, JSON.stringify(index, null, 2));
    fs.writeFileSync(excludedVideosPath, JSON.stringify(excluded, null, 2));
    return { success: true, results };
  } catch (err) {
    return { success: false, error: 'Failed to save changes' };
  }
}

function flagAsSource(videoIds, videoIndexPath, sourcesIndexPath) {
  let index = {};
  try { index = JSON.parse(fs.readFileSync(videoIndexPath, 'utf8')); } catch (err) {
    return { success: false, error: 'Failed to read video index' };
  }
  let sources = {};
  try {
    if (fs.existsSync(sourcesIndexPath)) {
      sources = JSON.parse(fs.readFileSync(sourcesIndexPath, 'utf8'));
    }
  } catch (err) {}
  const results = { moved: [], skipped: [] };
  for (const id of videoIds) {
    if (!index[id]) { results.skipped.push(id); continue; }
    const entry = index[id];
    if (entry.local_file) {
      const oldPath = path.join(__dirname, entry.local_file);
      const fileName = path.basename(entry.local_file);
      const newRelPath = path.join('sources', fileName);
      const newPath = path.join(__dirname, newRelPath);
      try {
        if (!fs.existsSync(SOURCES_DIR)) fs.mkdirSync(SOURCES_DIR, { recursive: true });
        if (fs.existsSync(oldPath)) {
          fs.renameSync(oldPath, newPath);
          entry.local_file = newRelPath.replace(/\\/g, '/');
        }
      } catch (err) {
        console.error(`Failed to move file for ${id}:`, err);
      }
    }
    sources[id] = entry;
    delete index[id];
    results.moved.push(id);
  }
  try {
    fs.writeFileSync(videoIndexPath, JSON.stringify(index, null, 2));
    fs.writeFileSync(sourcesIndexPath, JSON.stringify(sources, null, 2));
    return { success: true, results };
  } catch (err) {
    return { success: false, error: 'Failed to save changes' };
  }
}

// ─── Forum sections — must stay in sync with scraper.py SECTIONS ─────────────
const SECTIONS = [
  ['Bacheca messaggi',                'https://youtubepoopita.forumfree.it/?f=9997591'],
  ['Eventi',                          'https://youtubepoopita.forumfree.it/?f=10249277'],
  ['Restyling',                       'https://youtubepoopita.forumfree.it/?f=9997592'],
  ['Risorse',                         'https://youtubepoopita.forumfree.it/?f=6350394'],
  ['Old sources',                     'https://youtubepoopita.forumfree.it/?f=9965080'],
  ['Biografie YTP',                   'https://youtubepoopita.forumfree.it/?f=6970084'],
  ['Ganons pub',                      'https://youtubepoopita.forumfree.it/?f=6844333'],
  ['YTP fai da te',                   'https://youtubepoopita.forumfree.it/?f=6342067'],
  ['Serve aiuto',                     'https://youtubepoopita.forumfree.it/?f=6350346'],
  ['Il significato della cacca',      'https://youtubepoopita.forumfree.it/?f=9999652'],
  ['Tutorial per il pooping',         'https://youtubepoopita.forumfree.it/?f=10003245'],
  ['Poop in progress',                'https://youtubepoopita.forumfree.it/?f=7071597'],
  ['YTP da internet',                 'https://youtubepoopita.forumfree.it/?f=6350374'],
  ['YTP nostrane',                    'https://youtubepoopita.forumfree.it/?f=10149353'],
  ['YTPMV dimportazione',             'https://youtubepoopita.forumfree.it/?f=6416911'],
  ['Collab poopeschi',                'https://youtubepoopita.forumfree.it/?f=10902086'],
  ['Club sportivo della foca grassa', 'https://youtubepoopita.forumfree.it/?f=6844357'],
  ['Internet memes video',            'https://youtubepoopita.forumfree.it/?f=6342829'],
  ['Altri video',                     'https://youtubepoopita.forumfree.it/?f=6448874'],
  ['Off topic',                       'https://youtubepoopita.forumfree.it/?f=6342068'],
  ['Videogames',                      'https://youtubepoopita.forumfree.it/?f=6350347'],
  ['Cinema',                          'https://youtubepoopita.forumfree.it/?f=6414467'],
  ['Sport',                           'https://youtubepoopita.forumfree.it/?f=10304552'],
  ['Musica',                          'https://youtubepoopita.forumfree.it/?f=6574555'],
  ['Arte e grafica',                  'https://youtubepoopita.forumfree.it/?f=6693231'],
  ['Flood fun',                       'https://youtubepoopita.forumfree.it/?f=10037696'],
  ['THE PIT',                         'https://youtubepoopita.forumfree.it/?f=6342069'],
];

// ─── safe_filename — must produce identical output to scraper.py ──────────────
function safeFilename(name, maxLen = 80) {
  name = name.replace(/[<>:"/\\|?*]/g, '_');
  name = name.replace(/\s+/g, ' ').trim();
  if (name.length > maxLen) name = name.slice(0, maxLen);
  name = name.replace(/[. ]+$/, '');
  return name || '_';
}

// ─── Lookup tables (rebuilt after each scraping run) ─────────────────────────
let forumIdToSection = {};   // "6350394"  → "Risorse"
let sectionToIdx     = {};   // "Risorse"  → 3  (index into SECTIONS array)
let threadToSection  = {};   // "64123456" → { sectionName, title }

function buildLookups() {
  forumIdToSection = {};
  sectionToIdx     = {};
  threadToSection  = {};

  SECTIONS.forEach(([name, surl], i) => {
    const fid = new URL(surl).searchParams.get('f');
    forumIdToSection[fid] = name;
    sectionToIdx[name]    = i;
  });

  let state = {};
  try { state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch {}

  for (const [secName, ss] of Object.entries(state)) {
    const found = Array.isArray(ss.threads_found) ? ss.threads_found : [];
    for (let i = 0; i < found.length; i += 2) {
      const turl  = found[i] || '';
      const title = found[i + 1] || '';
      const m = turl.match(/[?&]t=(\d+)/);
      if (m) threadToSection[m[1]] = { sectionName: secName, title };
    }
  }
}

buildLookups();

// ─── Video index (local backup map) ──────────────────────────────────────────

let videoLocalMap = {};   // videoId → '/local/...' URL

function buildVideoMap() {
  let index = {};
  try { index = JSON.parse(fs.readFileSync(VIDEO_INDEX, 'utf8')); } catch {}
  videoLocalMap = {};
  for (const [id, entry] of Object.entries(index)) {
    if (entry.local_file && entry.status === 'downloaded') {
      const rel = entry.local_file.replace(/^videos[\\/]/, '').replace(/\\/g, '/');
      videoLocalMap[id] = '/local/' + rel.split('/').map(encodeURIComponent).join('/');
    }
  }
}

buildVideoMap();

// ─── File-system resolution ───────────────────────────────────────────────────

/** Locate a section index page on disk. Returns absolute path or null. */
function findIndexFile(sectionName, pageNum) {
  const safe = safeFilename(sectionName);
  const dir  = path.join(SITE_MIRROR, safe, 'index');
  const base = pageNum === 1
    ? `${safe}.html`
    : `${safe} - pagina ${pageNum}.html`;
  const full = path.join(dir, base);
  return fs.existsSync(full) ? full : null;
}

/**
 * Locate a thread page on disk.
 * Handles both storage layouts:
 *   {section}/{tid}_{title}.html              — single-page thread
 *   {section}/{tid}_{title}/page_{N}.html     — multi-page thread
 */
function findThreadFile(sectionName, threadId, pageNum) {
  const secDir = path.join(SITE_MIRROR, safeFilename(sectionName));
  let entries;
  try { entries = fs.readdirSync(secDir); } catch { return null; }

  const prefix = `${threadId}_`;

  for (const entry of entries) {
    if (!entry.startsWith(prefix)) continue;
    const fullEntry = path.join(secDir, entry);
    const stat = fs.statSync(fullEntry);

    if (stat.isFile() && entry.endsWith('.html') && pageNum === 1) {
      return fullEntry;
    }
    if (stat.isDirectory()) {
      const p = path.join(fullEntry, `page_${pageNum}.html`);
      if (fs.existsSync(p)) return p;
    }
  }
  return null;
}

// ─── HTML rewriting ───────────────────────────────────────────────────────────

// Both domains the forum uses (main + alternate subdomain seen in scraped pages)
const DOMAIN_RES = [
  new RegExp(`https?://${BASE_DOMAIN.replace(/\./g, '\\.')}/`, 'g'),
  new RegExp(`https?://youtubepoop\\.ita\\.forumfree\\.it/`, 'g'),
  new RegExp(`//${BASE_DOMAIN.replace(/\./g, '\\.')}/`, 'g'),
  new RegExp(`//youtubepoop\\.ita\\.forumfree\\.it/`, 'g'),
];

// Injected before </body>:
//   1. Overrides page_jump() for local pagination navigation.
//   2. Removes the GDPR/consent iframe overlay (#appconsent) that blocks clicks.
//   3. Strips remaining forum-domain hrefs missed by the static rewrite.
//   4. Injects local <video> players next to YouTube links/embeds when available.
function buildInjectJs(videoMap) {
  const mapJson = JSON.stringify(videoMap);
  return `
<style>
/* Remove GDPR consent overlay — it covers the full viewport with z-index max */
#appconsent { display: none !important; }
/* Hide any full-screen fixed iframe injected by consent managers */
iframe[style*="z-index: 2147483647"] { display: none !important; }
/* Hide cookie/notification bars */
.note { display: none !important; }
/* Local video player */
.ytp-local-player {
  margin: 6px 0;
  background: #111;
  border: 1px solid #444;
  border-radius: 4px;
  overflow: hidden;
  display: inline-block;
  max-width: 100%;
}
.ytp-local-player video { display: block; max-width: 100%; }
.ytp-local-player .ytp-local-label {
  font-size: 10px;
  color: #aaa;
  background: #1a1a1a;
  padding: 2px 6px;
  font-family: monospace;
}
</style>
<script>
(function () {
  var M = ${mapJson};

  function ytId(url) {
    if (!url) return null;
    var m = url.match(/[?&]v=([A-Za-z0-9_-]{11})/)
           || url.match(/youtu\\.be\\/([A-Za-z0-9_-]{11})/)
           || url.match(/youtube\\.com\\/embed\\/([A-Za-z0-9_-]{11})/);
    return m ? m[1] : null;
  }

  function makePlayer(src) {
    var wrap  = document.createElement('div');
    wrap.className = 'ytp-local-player';
    var vid   = document.createElement('video');
    vid.controls = true;
    vid.preload  = 'none';
    var src_el = document.createElement('source');
    src_el.src  = src;
    src_el.type = 'video/mp4';
    vid.appendChild(src_el);
    var lbl = document.createElement('div');
    lbl.className = 'ytp-local-label';
    lbl.textContent = 'backup locale';
    wrap.appendChild(vid);
    wrap.appendChild(lbl);
    return wrap;
  }

  /* Remove GDPR overlay node entirely */
  var ac = document.getElementById('appconsent');
  if (ac) ac.parentNode.removeChild(ac);

  /* Override page_jump for local pagination */
  window.page_jump = function (baseUrl, totalPages, perPage) {
    var p = parseInt(window.prompt('Vai alla pagina (1\\u2013' + totalPages + '):', '1'), 10);
    if (p >= 1 && p <= totalPages) {
      var st  = (p - 1) * perPage;
      var sep = baseUrl.indexOf('?') !== -1 ? '&' : '?';
      window.location.href = baseUrl + sep + 'st=' + st;
    }
  };

  /* Rewrite any forum hrefs the server-side pass may have missed */
  var re = /https?:\\/\\/(youtubepoopita|youtubepoop\\.ita)\\.forumfree\\.it\\//g;
  document.querySelectorAll('a[href]').forEach(function (a) {
    var h = a.getAttribute('href');
    if (re.test(h)) a.setAttribute('href', h.replace(re, '/'));
    re.lastIndex = 0;
  });

  /* Inject local players next to YouTube iframes */
  document.querySelectorAll('iframe').forEach(function (iframe) {
    var src = iframe.getAttribute('src') || '';
    if (!/youtube(-nocookie)?\\.com\\/embed\\//.test(src)) return;
    var id = ytId(src);
    if (!id || !M[id]) return;
    iframe.parentNode.insertBefore(makePlayer(M[id]), iframe.nextSibling);
  });

  /* Inject local players next to YouTube links */
  document.querySelectorAll('a[href]').forEach(function (a) {
    var href = a.getAttribute('href') || '';
    if (!/youtube\\.com|youtu\\.be/.test(href)) return;
    var id = ytId(href);
    if (!id || !M[id]) return;
    a.parentNode.insertBefore(makePlayer(M[id]), a.nextSibling);
  });
})();
</script>`;
}

function rewriteHtml(html) {
  // 1. Strip absolute forum domain from every href/action/src in the raw HTML.
  for (const re of DOMAIN_RES) html = html.replace(re, '/');

  // 2. Fix <base target="_top"> — when served standalone (not in a frameset)
  //    _top == the current tab, which is fine, but named-frame targets on links
  //    would open new windows. Change to _self to keep all navigation in-tab.
  html = html.replace(/(<base\b[^>]*)target="_top"/gi, '$1target="_self"');

  // 3. Strip legacy named-frame targets (target="Presentati!" etc.) from links.
  //    Keep _blank (external links), drop everything else.
  html = html.replace(/<a\b([^>]*)\starget="(?!_blank")[^"]*"([^>]*)>/g,
    (_, before, after) => `<a${before}${after}>`);

  // 4. Inject fixes, overrides, and local video players before </body>.
  const inject = buildInjectJs(videoLocalMap);
  if (html.includes('</body>')) {
    html = html.replace('</body>', inject + '\n</body>');
  } else {
    html += inject;
  }
  return html;
}

// ─── On-demand scraping ───────────────────────────────────────────────────────

const activeJobs = new Map();  // jobKey → spawned process

/**
 * Make sure threadUrl appears in the section's threads_found list so that
 * a subsequent `scraper.py --sections N` run will pick it up.
 */
function ensureThreadInState(threadId, threadUrl, sectionName) {
  let state = {};
  try { state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch {}

  const ss = state[sectionName];
  if (!ss) return;

  const known = new Set((ss.threads_found || []).filter((_, i) => i % 2 === 0));
  if (!known.has(threadUrl)) {
    ss.threads_found.push(threadUrl, `Thread ${threadId}`);
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
    buildLookups();
  }
}

/**
 * Spawn scraper.py for a single thread URL (fast path) or a whole section.
 * jobKey prevents duplicate concurrent runs for the same resource.
 */
function triggerScrape(jobKey, sectionIdx, threadUrl) {
  if (activeJobs.has(jobKey)) return;

  const args = ['scraper.py', '--sections', String(sectionIdx)];
  if (threadUrl) args.push('--thread-url', threadUrl);

  console.log(`[scraper] start  key="${jobKey}"  cmd: python ${args.join(' ')}`);

  const proc = spawn('python', args, {
    cwd: __dirname,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  activeJobs.set(jobKey, proc);

  proc.stdout.on('data', d => process.stdout.write('[scraper] ' + d));
  proc.stderr.on('data', d => process.stderr.write('[scraper] ' + d));
  proc.on('close', code => {
    activeJobs.delete(jobKey);
    buildLookups();
    buildVideoMap();
    console.log(`[scraper] finish key="${jobKey}" (exit ${code})`);
  });
}

// ─── HTTP response helpers ────────────────────────────────────────────────────

function sendHtml(res, code, body) {
  res.writeHead(code, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(body);
}

function serveFile(filePath, res) {
  const raw = fs.readFileSync(filePath, 'utf8');
  sendHtml(res, 200, rewriteHtml(raw));
}

function serveWaiting(res, message) {
  sendHtml(res, 202, `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="utf-8">
  <meta http-equiv="refresh" content="10">
  <title>Scraping in corso…</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: sans-serif; background: #111; color: #eee; margin: 0;
           display: flex; flex-direction: column; align-items: center;
           justify-content: center; min-height: 100vh; text-align: center; }
    h2   { margin-bottom: .4em; }
    p    { color: #aaa; margin: .3em 0; }
    .ico { font-size: 3rem; animation: spin 1.5s linear infinite; display: inline-block; }
    @keyframes spin { to { transform: rotate(360deg); } }
    a    { color: #6af; }
  </style>
</head>
<body>
  <div class="ico">⏳</div>
  <h2>Scraping in corso…</h2>
  <p>${message}</p>
  <p style="font-size:.85em">Questa pagina si aggiorna automaticamente ogni 10 secondi.</p>
  <p><a href="/">← Home</a></p>
</body>
</html>`);
}

function serveNotFound(res, detail) {
  sendHtml(res, 404, `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="utf-8"><title>Non trovato</title>
  <style>
    body { font-family: sans-serif; max-width: 640px; margin: 4rem auto; padding: 0 1rem; }
    a    { color: #06c; }
  </style>
</head>
<body>
  <h2>Pagina non trovata</h2>
  <p>${detail}</p>
  <p><a href="/">← Torna alla Home</a></p>
</body>
</html>`);
}

// ─── Local video file serving (with range-request support for seeking) ────────

function serveLocalVideo(filePath, req, res) {
  let stat;
  try { stat = fs.statSync(filePath); } catch {
    res.writeHead(404); res.end('Not found'); return;
  }

  const total = stat.size;
  const range = req.headers['range'];

  if (range) {
    const [, s, e] = range.replace(/bytes=/, '').match(/^(\d*)-(\d*)$/) || [];
    const start = s ? parseInt(s, 10) : 0;
    const end   = e ? parseInt(e, 10) : total - 1;
    res.writeHead(206, {
      'Content-Range':  `bytes ${start}-${end}/${total}`,
      'Accept-Ranges':  'bytes',
      'Content-Length': end - start + 1,
      'Content-Type':   'video/mp4',
    });
    fs.createReadStream(filePath, { start, end }).pipe(res);
  } else {
    res.writeHead(200, {
      'Content-Length': total,
      'Content-Type':   'video/mp4',
      'Accept-Ranges':  'bytes',
    });
    fs.createReadStream(filePath).pipe(res);
  }
}

// ─── Request handler ──────────────────────────────────────────────────────────

function onRequest(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405); res.end(); return;
  }

  let reqUrl;
  try {
    reqUrl = new URL(req.url, `http://localhost:${PORT}`);
  } catch {
    res.writeHead(400); res.end(); return;
  }

  // ── Local video files ─────────────────────────────────────────────────────
  if (reqUrl.pathname.startsWith('/local/')) {
    const rel = reqUrl.pathname.slice('/local/'.length)
      .split('/').map(decodeURIComponent).join(path.sep);
    const filePath = path.join(VIDEOS_DIR, rel);
    // path-traversal guard
    if (!filePath.startsWith(VIDEOS_DIR + path.sep) && filePath !== VIDEOS_DIR) {
      res.writeHead(403); res.end(); return;
    }
    return serveLocalVideo(filePath, req, res);
  }

  // ── Source video files ────────────────────────────────────────────────────
  if (reqUrl.pathname.startsWith('/sources/')) {
    const rel = reqUrl.pathname.slice('/sources/'.length)
      .split('/').map(decodeURIComponent).join(path.sep);
    const filePath = path.join(SOURCES_DIR, rel);
    if (!filePath.startsWith(SOURCES_DIR + path.sep) && filePath !== SOURCES_DIR) {
      res.writeHead(403); res.end(); return;
    }
    return serveLocalVideo(filePath, req, res);
  }

  // ── Static files from db ────────────────────────────────────────────────
  if (reqUrl.pathname.startsWith('/db/')) {
    const rel = reqUrl.pathname.slice('/db/'.length)
      .split('/').map(decodeURIComponent).join(path.sep);
    const filePath = path.join(__dirname, 'db', rel);
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      const mime = {
        '.html': 'text/html',
        '.js':   'application/javascript',
        '.css':  'text/css',
        '.json': 'application/json',
        '.png':  'image/png',
        '.jpg':  'image/jpeg',
        '.webm': 'video/webm',
      }[ext] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': mime });
      return fs.createReadStream(filePath).pipe(res);
    }
  }

  // ── Ban API ──────────────────────────────────────────────────────────────
  if (reqUrl.pathname === '/api/ban' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const { videoIds } = JSON.parse(body);
        if (!Array.isArray(videoIds)) throw new Error('Invalid videoIds');
        
        const result = banVideos(videoIds, VIDEO_INDEX, EXCLUDED_VIDEOS, VIDEOS_DIR);
        buildVideoMap(); // Rebuild server-side map if needed (though it's for mirror)
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // ── Flag as Source API ──────────────────────────────────────────────────
  if (reqUrl.pathname === '/api/flag-source' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const { videoIds } = JSON.parse(body);
        if (!Array.isArray(videoIds)) throw new Error('Invalid videoIds');
        
        const result = flagAsSource(videoIds, VIDEO_INDEX, SOURCES_INDEX);
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  const fid     = reqUrl.searchParams.get('f');
  const tid     = reqUrl.searchParams.get('t');
  const st      = parseInt(reqUrl.searchParams.get('st') || '0', 10);
  // Both section indices and thread pages use st increments of 30 (scraper convention)
  const pageNum = st > 0 ? Math.floor(st / 30) + 1 : 1;

  // ── Home & Dashboard Routes ──────────────────────────────────────────────
  if (!fid && !tid) {
    const frontendRoutes = ['/watch', '/videos', '/sources', '/channels', '/sections', '/overview'];
    const isFrontend = frontendRoutes.some(r => reqUrl.pathname.startsWith(r));
    
    if (isFrontend) {
       const p = path.join(__dirname, 'public', 'index.html');
       if (fs.existsSync(p)) {
         res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
         return res.end(fs.readFileSync(p));
       }
    }

    const p = path.join(SITE_MIRROR, 'Home.html');
    if (fs.existsSync(p)) return serveFile(p, res);
    return serveNotFound(res, 'Home.html non trovato nella mirror.');
  }

  // ── Section index ─────────────────────────────────────────────────────────
  if (fid && !tid) {
    const sectionName = forumIdToSection[fid];
    if (!sectionName) {
      return serveNotFound(res, `Sezione f=${fid} non riconosciuta.`);
    }

    const filePath = findIndexFile(sectionName, pageNum);
    if (filePath) return serveFile(filePath, res);

    // Not yet scraped — trigger and wait
    triggerScrape(`f:${fid}:p${pageNum}`, sectionToIdx[sectionName], null);
    return serveWaiting(res,
      `Download pagina ${pageNum} dell&rsquo;indice &ldquo;${sectionName}&rdquo;&hellip;`);
  }

  // ── Thread page ───────────────────────────────────────────────────────────
  if (tid) {
    const info = threadToSection[tid];

    if (!info) {
      return serveNotFound(res,
        `Thread t=${tid} non presente nella mirror. ` +
        `<a href="https://${BASE_DOMAIN}/?t=${tid}" target="_blank" rel="noopener">` +
        `Apri sul forum ↗</a>`);
    }

    const { sectionName, title } = info;
    const filePath = findThreadFile(sectionName, tid, pageNum);
    if (filePath) return serveFile(filePath, res);

    // Known but not downloaded — ensure it's in state, then scrape
    const threadUrl = `https://${BASE_DOMAIN}/?t=${tid}`;
    ensureThreadInState(tid, threadUrl, sectionName);
    triggerScrape(`t:${tid}`, sectionToIdx[sectionName], threadUrl);

    return serveWaiting(res,
      `Scraping thread &ldquo;${title || 'Thread ' + tid}&rdquo; (pagina ${pageNum})&hellip;`);
  }
}

// ─── Start server ─────────────────────────────────────────────────────────────

const server = http.createServer(onRequest);

server.listen(PORT, () => {
  let state = {};
  try { state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch {}

  const threadCount = Object.values(state).reduce(
    (n, s) => n + Math.floor(((s.threads_found || []).length) / 2), 0
  );
  const doneCount = Object.values(state).reduce(
    (n, s) => n + (s.threads_done || []).length, 0
  );

  console.log(`\nYTP Forum Mirror — server avviato`);
  console.log(`  URL:      http://localhost:${PORT}`);
  console.log(`  Mirror:   ${SITE_MIRROR}`);
  console.log(`  Sezioni:  ${SECTIONS.length}`);
  console.log(`  Thread:   ${doneCount} scaricati / ${threadCount} in stato`);
  console.log();
});
