'use strict';
// TIKUV PRO server: statik fayllar + REST API. Tashqi paketlarsiz ishlaydi.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { openDb, seed } = require('./db');
const { makeRouter, handleApi } = require('./api');

const ROOT = path.join(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const UPLOADS_DIR = path.join(ROOT, 'data', 'uploads');
const SECRET_FILE = path.join(ROOT, 'data', 'secret.key');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

// Capacitor ilova va lokal tarmoq manbalari uchun CORS.
const CORS_ORIGIN = /^(capacitor|ionic):\/\/localhost$|^https?:\/\/(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/;

function loadSecret() {
  try {
    return fs.readFileSync(SECRET_FILE, 'utf8').trim();
  } catch {
    const secret = crypto.randomBytes(32).toString('hex');
    fs.mkdirSync(path.dirname(SECRET_FILE), { recursive: true });
    fs.writeFileSync(SECRET_FILE, secret, { mode: 0o600 });
    return secret;
  }
}

function securityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
}

// ---------- Statik fayl keshi: xotira + ETag/Last-Modified + gzip ----------
const fileCache = new Map(); // filePath -> { buf, gz, etag, lastModified, mtimeMs, size, mime, compressible }

function getFile(filePath) {
  let st;
  try { st = fs.statSync(filePath); } catch { return null; }
  if (!st.isFile()) return null;
  const hit = fileCache.get(filePath);
  if (hit && hit.mtimeMs === st.mtimeMs && hit.size === st.size) return hit;
  const buf = fs.readFileSync(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const mime = MIME[ext] || 'application/octet-stream';
  const entry = {
    buf,
    gz: null,
    mime,
    etag: '"' + crypto.createHash('sha1').update(buf).digest('base64url').slice(0, 20) + '"',
    lastModified: st.mtime.toUTCString(),
    mtimeMs: st.mtimeMs,
    size: st.size,
    compressible: /^(text\/|application\/(json|manifest\+json)|image\/svg)/.test(mime),
  };
  fileCache.set(filePath, entry);
  return entry;
}

function appendVary(res, value) {
  const cur = res.getHeader('Vary');
  res.setHeader('Vary', cur ? (cur + ', ' + value) : value);
}

function serveFile(req, res, filePath) {
  const f = getFile(filePath);
  if (!f) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('404 — topilmadi');
  }
  const isNoCache = f.mime.startsWith('text/html') || filePath.endsWith('sw.js') || filePath.endsWith('.webmanifest');
  const cacheControl = isNoCache ? 'no-cache' : 'public, max-age=86400';

  // Qayta tekshirish: o'zgarmagan bo'lsa 304 (trafikni tejaydi)
  const inm = req.headers['if-none-match'];
  if ((inm && inm === f.etag) || (!inm && req.headers['if-modified-since'] === f.lastModified)) {
    res.writeHead(304, { ETag: f.etag, 'Last-Modified': f.lastModified, 'Cache-Control': cacheControl });
    return res.end();
  }

  const headers = { 'Content-Type': f.mime, 'Cache-Control': cacheControl, ETag: f.etag, 'Last-Modified': f.lastModified };
  let body = f.buf;
  if (f.compressible && f.buf.length > 512 && /\bgzip\b/.test(req.headers['accept-encoding'] || '')) {
    if (!f.gz) f.gz = zlib.gzipSync(f.buf);
    body = f.gz;
    headers['Content-Encoding'] = 'gzip';
    appendVary(res, 'Accept-Encoding');
  }
  headers['Content-Length'] = body.length;
  res.writeHead(200, headers);
  if (req.method === 'HEAD') return res.end();
  res.end(body);
}

function createServer(options = {}) {
  const dbPath = options.dbPath || process.env.TIKUV_DB || path.join(ROOT, 'data', 'tikuvpro.db');
  const db = openDb(dbPath);
  seed(db);
  const secret = options.secret || loadSecret();
  const routes = makeRouter(db, secret, UPLOADS_DIR);

  const server = http.createServer(async (req, res) => {
    securityHeaders(res);
    const url = new URL(req.url, 'http://localhost');
    const pathname = decodeURIComponent(url.pathname);

    // CORS (faqat ruxsat etilgan manbalar)
    const origin = req.headers.origin || '';
    if (origin && CORS_ORIGIN.test(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Vary', 'Origin');
    }
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.writeHead(204);
      return res.end();
    }

    // So'rov tanasini o'qish (JSON, 5 MB gacha)
    if (pathname.startsWith('/api/')) {
      let bodyText = '';
      try {
        for await (const chunk of req) {
          bodyText += chunk;
          if (bodyText.length > 5 * 1024 * 1024) {
            res.writeHead(413, { 'Content-Type': 'application/json; charset=utf-8' });
            return res.end(JSON.stringify({ ok: false, error: "So'rov hajmi juda katta" }));
          }
        }
      } catch { /* ignore */ }
      req.bodyText = bodyText;

      const handled = await handleApi(req, res, pathname, url.searchParams, routes, db, secret);
      if (handled === false) {
        res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, error: 'Sahifa topilmadi (404)' }));
      }
      return;
    }

    // Statik fayllar
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405);
      return res.end();
    }
    if (pathname.startsWith('/uploads/')) {
      const name = path.basename(pathname);
      return serveFile(req, res, path.join(UPLOADS_DIR, name));
    }
    let rel = pathname === '/' ? '/index.html' : pathname;
    const filePath = path.normalize(path.join(PUBLIC_DIR, rel));
    if (!filePath.startsWith(PUBLIC_DIR) || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      // SPA marshrutlari index.html ga tushadi (faqat kengaytirmasiz yo'llar)
      const indexFile = path.join(PUBLIC_DIR, 'index.html');
      if (!path.extname(pathname) && !pathname.startsWith('/.') && fs.existsSync(indexFile)) {
        return serveFile(req, res, indexFile);
      }
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('404 — topilmadi');
    }
    return serveFile(req, res, filePath);
  });

  return { server, db };
}

function start(options = {}) {
  const port = options.port !== undefined ? options.port : Number(process.env.PORT) || 3000;
  const { server, db } = createServer(options);
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`Xato: ${port} port band. Boshqa port bilan ishga tushiring: PORT=3001 npm start`);
    } else {
      console.error('Server xatosi:', err.message);
    }
    process.exit(1);
  });
  server.listen(port, () => {
    console.log(`TIKUV PRO server ishga tushdi: http://localhost:${port}`);
    console.log('Test hisoblar: shaxobiddinumarovadmin/20132011Sh  •  hosilaeshmuminova/20132011Sh  •  901234567/Mijoz123!');
  });
  return { server, db, port };
}

if (require.main === module) {
  start();
}

module.exports = { start, createServer };
