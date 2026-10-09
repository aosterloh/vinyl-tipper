const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

// Auto-load .env file if present
try {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        const key = match[1];
        let val = match[2] || '';
        val = val.trim().replace(/^['"]|['"]$/g, '');
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    });
  }
} catch (e) {
  console.warn('Could not read .env file:', e.message);
}

const PORT = parseInt(process.env.PORT || '8088', 10);
const PUBLIC_DIR = path.join(__dirname, 'public');

// Extract all valid AI Studio API keys (starts with AIzaSy)
function getKeyPool() {
  const rawList = [
    ...(process.env.GEMINI_API_KEYS ? process.env.GEMINI_API_KEYS.split(',') : []),
    process.env.GEMINI_API_KEY,
    process.env.GOOGLE_API_KEY
  ].filter(Boolean).map(k => k.trim());

  // Deduplicate and prioritize Google AI Studio keys (AIzaSy...)
  const validKeys = Array.from(new Set(rawList)).filter(k => k.startsWith('AIzaSy'));
  return validKeys;
}

let currentKeyIndex = 0;
function getNextKey() {
  const pool = getKeyPool();
  if (pool.length === 0) return null;
  const key = pool[currentKeyIndex % pool.length];
  currentKeyIndex = (currentKeyIndex + 1) % pool.length;
  return key;
}

const MIME_TYPES = {
  '.html': 'text/html; charset=UTF-8',
  '.js': 'application/javascript; charset=UTF-8',
  '.mjs': 'application/javascript; charset=UTF-8',
  '.css': 'text/css; charset=UTF-8',
  '.json': 'application/json; charset=UTF-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf'
};

const server = http.createServer(async (req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-gemini-key');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = decodeURIComponent(urlObj.pathname);

  // Health check endpoint for Cloud Run and Docker
  if (pathname === '/healthz' || pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'healthy', uptime: process.uptime() }));
    return;
  }

  // API endpoint to retrieve configuration & pre-configured key for frontend
  if (pathname === '/api/config') {
    const pool = getKeyPool();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      hasServerKey: pool.length > 0,
      apiKey: pool[0] || null,
      keyCount: pool.length
    }));
    return;
  }

  // Server-side proxy for Gemini API with multi-key failover
  if (pathname === '/api/gemini' && req.method === 'POST') {
    const clientKey = req.headers['x-gemini-key'];
    const key = (clientKey && clientKey.startsWith('AIzaSy')) ? clientKey : getNextKey();

    if (!key) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing Gemini API key in server and client' }));
      return;
    }

    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const targetUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${encodeURIComponent(key)}`;
        const parsedUrl = new URL(targetUrl);

        const proxyReq = https.request({
          hostname: parsedUrl.hostname,
          path: parsedUrl.pathname + parsedUrl.search,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body)
          }
        }, proxyRes => {
          let proxyBody = '';
          proxyRes.on('data', d => { proxyBody += d; });
          proxyRes.on('end', () => {
            res.writeHead(proxyRes.statusCode, { 'Content-Type': 'application/json' });
            res.end(proxyBody);
          });
        });

        proxyReq.on('error', err => {
          res.writeHead(502, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Proxy request failed', details: err.message }));
        });

        proxyReq.write(body);
        proxyReq.end();
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // Static file serving from public/
  let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      const fallback = path.join(PUBLIC_DIR, 'index.html');
      fs.readFile(fallback, (fErr, content) => {
        if (fErr) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('Not Found');
        } else {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=UTF-8' });
          res.end(content);
        }
      });
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(filePath, (readErr, content) => {
      if (readErr) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Internal Server Error');
      } else {
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(content);
      }
    });
  });
});

server.listen(PORT, '0.0.0.0', () => {
  const pool = getKeyPool();
  console.log(`Vinyl Tipper server running at http://localhost:${PORT}`);
  console.log(`Loaded ${pool.length} Google AI Studio Gemini API key(s) from .env`);
});
