#!/usr/bin/env node
/**
 * YTP Archive Dashboard Server
 *
 * Serves the main archive dashboard (docs/index.html) and local video files.
 */

'use strict';

if (process.argv.includes('forum')) {
  require('./server_forum.js');
  return;
}

const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const crypto = require('crypto');

const PORT = parseInt(process.env.PORT || '3000', 10);
const DOCS_DIR = path.join(__dirname, 'docs');
const VIDEOS_DIR = path.join(__dirname, 'videos');
const VIDEO_INDEX = path.join(DOCS_DIR, 'video_index.json');
const EXCLUDED_VIDEOS = path.join(DOCS_DIR, 'excluded_videos.json');
const SOURCES_INDEX = path.join(DOCS_DIR, 'sources_index.json');
const SOURCES_DIR = path.join(__dirname, 'sources');


// ─── Video Management Logic ──────────────────────────────────────────────────

/**
 * Bans a list of videos:
 * 1. Removes local files.
 * 2. Adds to excluded_videos.json.
 * 3. Removes from video_index.json.
 */
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
  } catch (err) { }

  const results = { deleted: [], failed: [], skipped: [] };

  for (const id of videoIds) {
    if (!index[id]) { results.skipped.push(id); continue; }
    const entry = index[id];

    if (entry.local_file) {
      const filePath = path.join(__dirname, entry.local_file);
      try {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      } catch (err) { }
    }

    excluded[id] = entry;
    delete index[id];
    results.deleted.push(id);
  }

  try {
    fs.writeFileSync(videoIndexPath, JSON.stringify(index));
    fs.writeFileSync(excludedVideosPath, JSON.stringify(excluded));
    return { success: true, results };
  } catch (err) {
    return { success: false, error: 'Failed to save changes' };
  }
}

/**
 * Flags a list of videos as sources:
 * 1. Moves from video_index.json to sources_index.json.
 */
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
  } catch (err) { }

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

    // Move individual metadata JSON from docs/videos to docs/sources
    const oldJsonPath = path.join(DOCS_DIR, 'videos', `${id}.json`);
    const newJsonPath = path.join(DOCS_DIR, 'sources', `${id}.json`);
    try {
      const sourcesJsonDir = path.join(DOCS_DIR, 'sources');
      if (!fs.existsSync(sourcesJsonDir)) fs.mkdirSync(sourcesJsonDir, { recursive: true });
      if (fs.existsSync(oldJsonPath)) {
        fs.renameSync(oldJsonPath, newJsonPath);
      }
    } catch (err) {
      console.error(`Failed to move JSON metadata for ${id}:`, err);
    }

    sources[id] = entry;
    delete index[id];
    results.moved.push(id);
  }

  try {
    fs.writeFileSync(videoIndexPath, JSON.stringify(index));
    fs.writeFileSync(sourcesIndexPath, JSON.stringify(sources));
    return { success: true, results };
  } catch (err) {
    return { success: false, error: 'Failed to save changes' };
  }
}

/**
 * Imports a list of YT URLs into the specified index.
 */
function importVideos(urls, target, videoIndexPath, sourcesIndexPath) {
  const filePath = target === 'sources' ? sourcesIndexPath : videoIndexPath;
  let index = {};
  try {
    if (fs.existsSync(filePath)) {
      index = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
  } catch (err) {
    return { success: false, error: 'Failed to read index' };
  }

  const results = { added: [], skipped: [] };

  for (let url of urls) {
    url = url.trim();
    if (!url) continue;

    // Extract ID from YT URL
    const match = url.match(/(?:v=|vi\/|shorts\/|be\/|embed\/|watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    if (!match) {
      results.skipped.push(url);
      continue;
    }

    const id = match[1];
    if (index[id]) {
      results.skipped.push(url);
      continue;
    }

    index[id] = {
      id: id,
      url: `https://www.youtube.com/watch?v=${id}`,
      status: 'available',
      sections: ['Imported']
    };
    results.added.push(id);
  }

  try {
    fs.writeFileSync(filePath, JSON.stringify(index));
    return { success: true, results };
  } catch (err) {
    return { success: false, error: 'Failed to save changes' };
  }
}

/**
 * Sets the language for a list of videos.
 */
function setLanguage(videoIds, language, videoIndexPath, sourcesIndexPath) {
  let vIndex = {};
  let sIndex = {};
  try { if (fs.existsSync(videoIndexPath)) vIndex = JSON.parse(fs.readFileSync(videoIndexPath, 'utf8')); } catch (err) { }
  try { if (fs.existsSync(sourcesIndexPath)) sIndex = JSON.parse(fs.readFileSync(sourcesIndexPath, 'utf8')); } catch (err) { }

  const results = { updated: [], skipped: [] };

  for (const id of videoIds) {
    if (vIndex[id]) {
      vIndex[id].language = language;
      results.updated.push(id);
    } else if (sIndex[id]) {
      sIndex[id].language = language;
      results.updated.push(id);
    } else {
      results.skipped.push(id);
    }
  }

  try {
    fs.writeFileSync(videoIndexPath, JSON.stringify(vIndex));
    fs.writeFileSync(sourcesIndexPath, JSON.stringify(sIndex));
    return { success: true, results };
  } catch (err) {
    return { success: false, error: 'Failed to save changes' };
  }
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.webm': 'video/webm',
  '.mp4': 'video/mp4',
  '.ico': 'image/x-icon',
};

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
    const end = e ? parseInt(e, 10) : total - 1;
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${total}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': end - start + 1,
      'Content-Type': 'video/mp4',
    });
    fs.createReadStream(filePath, { start, end }).pipe(res);
  } else {
    res.writeHead(200, {
      'Content-Length': total,
      'Content-Type': 'video/mp4',
      'Accept-Ranges': 'bytes',
    });
    fs.createReadStream(filePath).pipe(res);
  }
}

// ─── Request handler ──────────────────────────────────────────────────────────

function onRequest(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'POST') {
    res.writeHead(405); res.end(); return;
  }

  let reqUrl;
  try {
    reqUrl = new URL(req.url, `http://localhost:${PORT}`);
  } catch {
    res.writeHead(400); res.end(); return;
  }

  const pathname = reqUrl.pathname;

  // ── API: Ban Videos ──────────────────────────────────────────────────────
  if (pathname === '/api/ban' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const { videoIds } = JSON.parse(body);
        const result = banVideos(videoIds, VIDEO_INDEX, EXCLUDED_VIDEOS, VIDEOS_DIR);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // ── API: Flag as Source ──────────────────────────────────────────────────
  if (pathname === '/api/flag-source' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const { videoIds } = JSON.parse(body);
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

  // ── API: Upload Video ───────────────────────────────────────────────────
  if (pathname === '/api/upload' && req.method === 'POST') {
    const title = decodeURIComponent(req.headers['x-video-title'] || '');
    const channelName = decodeURIComponent(req.headers['x-video-channel-name'] || 'Unknown');
    const channelUrl = decodeURIComponent(req.headers['x-video-channel-url'] || '');
    const videoType = req.headers['x-video-type']; // 'ytp' or 'other'
    let id = decodeURIComponent(req.headers['x-video-id'] || '');
    const publishDate = req.headers['x-video-date'] || '';
    const language = req.headers['x-video-lang'] || '';
    const tagsStr = decodeURIComponent(req.headers['x-video-tags'] || '[]');
    const originalFileName = decodeURIComponent(req.headers['x-file-name'] || 'video.mp4');
    
    let tags = [];
    try { tags = JSON.parse(tagsStr); } catch (e) {}

    if (!id) {
      // YouTube IDs are always 11 characters. 
      // We use 'loc_' prefix + 12 base64url chars to avoid collisions while keeping a similar style.
      id = 'loc_' + crypto.randomBytes(9).toString('base64url');
    }

    const baseDir = videoType === 'ytp' ? VIDEOS_DIR : SOURCES_DIR;
    // Sanitize channel name for directory
    const safeChannelName = channelName.replace(/[<>:"/\\|?*]/g, '_').trim() || 'Unknown';
    const channelDir = path.join(baseDir, safeChannelName);
    
    if (!fs.existsSync(channelDir)) {
      fs.mkdirSync(channelDir, { recursive: true });
    }

    const ext = path.extname(originalFileName) || '.mp4';
    const finalFileName = id + ext;
    const savePath = path.join(channelDir, finalFileName);

    const writeStream = fs.createWriteStream(savePath);
    req.pipe(writeStream);

    writeStream.on('finish', () => {
      // Update Index
      const indexPath = videoType === 'ytp' ? VIDEO_INDEX : SOURCES_INDEX;
      let index = {};
      try {
        if (fs.existsSync(indexPath)) {
          index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
        }
      } catch (err) {}

      index[id] = {
        title,
        channel_name: channelName,
        channel_url: channelUrl,
        publish_date: publishDate,
        tags,
        language,
        view_count: 0,
        like_count: 0,
        status: 'downloaded',
        local_file: path.relative(baseDir, savePath).replace(/\\/g, '/')
      };

      try {
        fs.writeFileSync(indexPath, JSON.stringify(index));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, id }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Failed to update index' }));
      }
    });

    writeStream.on('error', (err) => {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'File save error: ' + err.message }));
    });

    return;
  }

  // ── API: Import Videos ───────────────────────────────────────────────────
  if (pathname === '/api/import' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const { urls, target } = JSON.parse(body);
        const result = importVideos(urls, target, VIDEO_INDEX, SOURCES_INDEX);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }
  // ── API: Set Language ────────────────────────────────────────────────────
  if (pathname === '/api/set-lang' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const { videoIds, language } = JSON.parse(body);
        const result = setLanguage(videoIds, language, VIDEO_INDEX, SOURCES_INDEX);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // ── Local video files ─────────────────────────────────────────────────────
  if (pathname.startsWith('/local/')) {
    const rel = pathname.slice('/local/'.length)
      .split('/').map(decodeURIComponent).join(path.sep);
    const filePath = path.join(VIDEOS_DIR, rel);
    if (!filePath.startsWith(VIDEOS_DIR + path.sep) && filePath !== VIDEOS_DIR) {
      res.writeHead(403); res.end(); return;
    }
    return serveLocalVideo(filePath, req, res);
  }

  // ── Source video files ────────────────────────────────────────────────────
  if (pathname.startsWith('/sources/')) {
    const rel = pathname.slice('/sources/'.length)
      .split('/').map(decodeURIComponent).join(path.sep);
    const filePath = path.join(SOURCES_DIR, rel);
    if (!filePath.startsWith(SOURCES_DIR + path.sep) && filePath !== SOURCES_DIR) {
      res.writeHead(403); res.end(); return;
    }
    return serveLocalVideo(filePath, req, res);
  }

  // ── Static files from docs ────────────────────────────────────────────────
  let relPath = pathname === '/' ? 'index.html' : pathname.replace(/^\//, '');
  let filePath = path.join(DOCS_DIR, relPath);


  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    return fs.createReadStream(filePath).pipe(res);
  }

  // SPA Fallback: if not a file, serve index.html
  const indexFile = path.join(DOCS_DIR, 'index.html');
  if (fs.existsSync(indexFile)) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return fs.createReadStream(indexFile).pipe(res);
  }

  res.writeHead(404);
  res.end('Not Found');
}

// ─── Start server ─────────────────────────────────────────────────────────────
if (fs.existsSync(VIDEO_INDEX)) {
  try {
    fs.copyFileSync(VIDEO_INDEX, VIDEO_INDEX + '.bak');
    // console.log(`  Backup:   ${VIDEO_INDEX}.bak created`);
  } catch (err) {
    console.error(`  [!] Failed to create backup:`, err.message);
  }
}

const server = http.createServer(onRequest);

server.listen(PORT, () => {
  console.log(`\nYTP Archive Dashboard — server avviato`);
  console.log(`  URL:      http://localhost:${PORT}`);
  console.log(`  Docs:     ${DOCS_DIR}`);
  console.log();
});
