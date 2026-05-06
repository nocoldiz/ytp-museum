#!/usr/bin/env node
/**
 * YTP Archive Dashboard Server
 *
 * Serves the main archive dashboard (public/index.html) and local video files.
 * Now using Python (scripts/db_manager.py) for all SQLite write operations
 * to keep Node.js dependencies minimal.
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
const { execSync } = require('child_process');
const zlib = require('zlib');

const PORT = parseInt(process.env.PORT || '4000', 10);
const PUBLIC_DIR = path.join(__dirname, 'public');
const DB_DIR = path.join(__dirname, 'db');
const VIDEOS_DIR = path.join(DB_DIR, 'videos');
const DB_PATH = path.join(PUBLIC_DIR, 'ytp.db');
const SOURCES_DIR = path.join(__dirname, 'sources');
const DB_MANAGER = path.join(__dirname, 'scripts', 'db_manager.py');

/**
 * Helper to run DB commands via Python
 */
function runDbCommand(command, args) {
  try {
    const argsJson = JSON.stringify(args);
    const output = execSync(`python3 "${DB_MANAGER}" "${command}" '${argsJson.replace(/'/g, "'\\''")}'`, { encoding: 'utf8' });
    return JSON.parse(output);
  } catch (err) {
    console.error(`DB Command Error (${command}):`, err);
    return { success: false, error: err.message };
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
        const result = runDbCommand('ban', { videoIds });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // ── API: Move DB ─────────────────────────────────────────────────────────
  if (pathname === '/api/move-db' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const { videoIds, targetDb } = JSON.parse(body);
        const result = runDbCommand('move-db', { videoIds, targetDb });
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
    try { tags = JSON.parse(tagsStr); } catch (e) { }

    if (!id) {
      id = 'loc_' + crypto.randomBytes(9).toString('base64url');
    }

    const baseDir = videoType === 'ytp' ? VIDEOS_DIR : SOURCES_DIR;
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
      const result = runDbCommand('upload', {
        id, title, channel_name: channelName, channel_url: channelUrl,
        publish_date: publishDate, language,
        is_source: videoType === 'ytp' ? 0 : 1,
        local_file: path.relative(__dirname, savePath).replace(/\\/g, '/'),
        tags
      });

      if (result.success) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, id }));
      } else {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
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
        const result = runDbCommand('import', { urls, target });
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
        const result = runDbCommand('set-lang', { videoIds, language });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // ── API: Playlists ───────────────────────────────────────────────────────
  if (pathname === '/api/playlists' && req.method === 'GET') {
    const result = runDbCommand('get-playlists', {});
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));
    return;
  }

  if (pathname === '/api/home-lite' && req.method === 'GET') {
    const result = runDbCommand('get-home-lite', {});
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));
    return;
  }

  if (pathname === '/api/playlists/create' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const { name } = JSON.parse(body);
        if (!name) throw new Error("Name is required");
        const id = 'pl_' + crypto.randomBytes(6).toString('hex');
        const result = runDbCommand('create-playlist', { name, id });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  if (pathname === '/api/playlists/add' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const { playlistId, videoIds } = JSON.parse(body);
        const result = runDbCommand('add-to-playlist', { playlistId, videoIds });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }
  
  if (pathname === '/api/remove-channel' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const { channelUrl } = JSON.parse(body);
        const result = runDbCommand('remove-channel', { channelUrl });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // ── API: Scrape Single Channel ───────────────────────────────────────────
  if (pathname === '/api/scrape-channel' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const { channelUrl } = JSON.parse(body);
        if (!channelUrl) throw new Error("channelUrl is required");
        
        res.writeHead(200, {
          'Content-Type': 'text/plain; charset=utf-8',
          'Transfer-Encoding': 'chunked',
          'Connection': 'keep-alive'
        });
        
        const { spawn } = require('child_process');
        const scraperPath = path.join(__dirname, 'scripts', 'ytp_scraper.py');
        const scraper = spawn('python3', [
          scraperPath,
          '--scrape-single-channel', channelUrl
        ]);
        
        scraper.stdout.on('data', data => {
          res.write(data);
        });
        
        scraper.stderr.on('data', data => {
          res.write(data);
        });
        
        scraper.on('close', code => {
          res.write(`\n[SCRAPE_END] Process exited with code ${code}\n`);
          res.end();
        });
      } catch (err) {
        if (!res.headersSent) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: err.message }));
        }
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
  let filePath;

  if (pathname.startsWith('/db/')) {
    filePath = path.join(DB_DIR, pathname.substring(4));
    console.log("[DB Debug] Checking path 1: " + filePath + " (Exists: " + fs.existsSync(filePath) + ")");
    if (!fs.existsSync(filePath)) {
      filePath = path.join(PUBLIC_DIR, 'db', pathname.substring(4));
      console.log("[DB Debug] Checking path 2: " + filePath + " (Exists: " + fs.existsSync(filePath) + ")");
    }
  } else {
    filePath = path.join(PUBLIC_DIR, relPath);
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase();
    const stat = fs.statSync(filePath);

    // Cache headers for DB files and static assets
    let headers = {
      'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
      'Cache-Control': ext === '.js' || ext === '.css' || ext === '.html' ? 'no-cache' : 'public, max-age=3600',
      'Accept-Ranges': 'bytes'
    };

    // Very aggressive caching for .db files (they only change when scraper runs)
    if (ext === '.db') {
      headers['Cache-Control'] = 'public, max-age=86400'; // 1 day
    }

    const acceptEncoding = req.headers['accept-encoding'] || '';

    // Compress text and DB files
    const shouldCompress = ['.html', '.js', '.css', '.json'].includes(ext);

    if (shouldCompress && acceptEncoding.includes('gzip')) {
      res.writeHead(200, { ...headers, 'Content-Encoding': 'gzip' });
      const gzip = zlib.createGzip();
      fs.createReadStream(filePath).pipe(gzip).pipe(res);
    } else {
      res.writeHead(200, headers);
      fs.createReadStream(filePath).pipe(res);
    }
    return;
  }

  // SPA Fallback: if not a file, serve index.html (only for page routes, not assets/DBs)
  const isAsset = pathname.includes('.') || pathname.startsWith('/db/') || pathname.startsWith('/local/') || pathname.startsWith('/sources/');
  if (!isAsset) {
    const indexFile = path.join(PUBLIC_DIR, 'index.html');
    if (fs.existsSync(indexFile)) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return fs.createReadStream(indexFile).pipe(res);
    }
  }

  res.writeHead(404);
  res.end('Not Found');
}

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

// ─── Start server ─────────────────────────────────────────────────────────────
const server = http.createServer(onRequest);
server.listen(PORT, () => {
  console.log(`\nYTP Archive Dashboard — server avviato (Python-Manager Mode)`);
  console.log(`  URL:      http://localhost:${PORT}`);
  console.log(`  Public:   ${PUBLIC_DIR}`);
  console.log(`  DB:       ${DB_PATH}`);
  console.log();
});
