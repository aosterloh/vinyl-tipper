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

function cleanApiKey(k) {
  if (!k || typeof k !== 'string') return '';
  return k.trim().replace(/^["'`]|["'`]$/g, '').trim();
}

// Extract all valid AI Studio / Gemini API keys
function getKeyPool() {
  const rawList = [
    ...(process.env.GEMINI_API_KEYS ? process.env.GEMINI_API_KEYS.split(',') : []),
    process.env.GEMINI_API_KEY,
    process.env.GEMINI_KEY,
    process.env.GOOGLE_API_KEY,
    process.env.API_KEY,
    process.env.AI_STUDIO_KEY
  ].map(cleanApiKey).filter(k => k.length > 15);

  const unique = Array.from(new Set(rawList));
  return unique;
}

let currentKeyIndex = 0;
function getNextKey() {
  const pool = getKeyPool();
  if (pool.length === 0) return null;
  const key = pool[currentKeyIndex % pool.length];
  currentKeyIndex = (currentKeyIndex + 1) % pool.length;
  return key;
}

const DATA_DIR = path.join(__dirname, 'data');
const IMAGES_DIR = path.join(DATA_DIR, 'images');
const CATALOG_FILE = path.join(DATA_DIR, 'catalog.json');
const LAST_SESSION_FILE = path.join(DATA_DIR, 'last_session.json');
const RECOMMENDATIONS_FILE = path.join(DATA_DIR, 'recommendations.json');
const FAVORITES_FILE = path.join(DATA_DIR, 'favorites.json');
const STATS_FILE = path.join(DATA_DIR, 'stats.json');
const VAULT_365_FILE = path.join(DATA_DIR, 'vault_365.json');

const ADMIN_EMAILS = ['aosterloh@gmail.com'];

const CORPORATE_FIREBASE_CONFIG = {
  apiKey: "AIzaSyBDfu44ElID27cy2lvozY2BD1izTq7AIuo",
  authDomain: "aosterloh-cs-muc.firebaseapp.com",
  projectId: "aosterloh-cs-muc",
  storageBucket: "aosterloh-cs-muc.appspot.com",
  appId: "1:557450838719:web:5e51f"
};

const PUBLIC_FIREBASE_CONFIG = {
  apiKey: process.env.FIREBASE_API_KEY || "AIzaSyBohm2Obe3zqxav80otAKVmYkYlsQtu5yk",
  authDomain: process.env.FIREBASE_AUTH_DOMAIN || "vinyl-hound.firebaseapp.com",
  projectId: process.env.FIREBASE_PROJECT_ID || "vinyl-hound",
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "vinyl-hound.firebasestorage.app",
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || "403699448912",
  appId: process.env.FIREBASE_APP_ID || "1:403699448912:web:60810f38aad00541036555"
};

function ensureDataDirs() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(IMAGES_DIR)) {
      fs.mkdirSync(IMAGES_DIR, { recursive: true });
    }
  } catch (e) {
    console.warn('Error creating data directories:', e.message);
  }
}

function loadLastSession() {
  try {
    ensureDataDirs();
    if (fs.existsSync(LAST_SESSION_FILE)) {
      return JSON.parse(fs.readFileSync(LAST_SESSION_FILE, 'utf8'));
    }
  } catch (e) {
    console.warn('Error reading last session file:', e.message);
  }
  return null;
}

function saveLastSession(sessionData) {
  try {
    ensureDataDirs();
    fs.writeFileSync(LAST_SESSION_FILE, JSON.stringify(sessionData, null, 2), 'utf8');
  } catch (e) {
    console.warn('Error saving last session file:', e.message);
  }
}

function loadVault365() {
  try {
    ensureDataDirs();
    if (fs.existsSync(VAULT_365_FILE)) {
      return JSON.parse(fs.readFileSync(VAULT_365_FILE, 'utf8'));
    }
  } catch (e) {
    console.warn('Error reading vault_365 file:', e.message);
  }
  return [];
}

function getPickOfTheDay() {
  const vault = loadVault365();
  if (!vault || vault.length === 0) return null;
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const diff = (now - start) + ((start.getTimezoneOffset() - now.getTimezoneOffset()) * 60 * 1000);
  const oneDay = 1000 * 60 * 60 * 24;
  const dayOfYear = Math.max(1, Math.min(365, Math.floor(diff / oneDay)));
  const index = (dayOfYear - 1) % vault.length;
  return {
    dayOfYear,
    pick: vault[index],
    total: vault.length
  };
}

function loadStoredRecommendations() {
  try {
    ensureDataDirs();
    if (fs.existsSync(RECOMMENDATIONS_FILE)) {
      return JSON.parse(fs.readFileSync(RECOMMENDATIONS_FILE, 'utf8'));
    }
  } catch (e) {
    console.warn('Error reading recommendations file:', e.message);
  }
  return {};
}

function saveStoredRecommendations(allRecs) {
  try {
    ensureDataDirs();
    fs.writeFileSync(RECOMMENDATIONS_FILE, JSON.stringify(allRecs, null, 2), 'utf8');
  } catch (e) {
    console.warn('Error saving recommendations file:', e.message);
  }
}

function loadStoredFavorites() {
  try {
    ensureDataDirs();
    if (fs.existsSync(FAVORITES_FILE)) {
      return JSON.parse(fs.readFileSync(FAVORITES_FILE, 'utf8'));
    }
  } catch (e) {
    console.warn('Error reading favorites file:', e.message);
  }
  return {};
}

function saveStoredFavorites(allFavs) {
  try {
    ensureDataDirs();
    fs.writeFileSync(FAVORITES_FILE, JSON.stringify(allFavs, null, 2), 'utf8');
  } catch (e) {
    console.warn('Error saving favorites file:', e.message);
  }
}

function getInitialStats() {
  return {
    visits: {
      total: 0,
      uniqueSessions: [],
      byDay: {}
    },
    searches: {
      total: 0,
      aiAppraisals: 0,
      recent: [],
      topQueries: {}
    },
    clicks: {
      total: 0,
      byStore: {
        jpc: 0,
        hhv: 0,
        discogs: 0,
        ebay: 0,
        amazon: 0
      },
      recent: []
    },
    createdAt: Date.now(),
    lastUpdated: Date.now()
  };
}

function loadStats() {
  try {
    ensureDataDirs();
    if (fs.existsSync(STATS_FILE)) {
      const data = JSON.parse(fs.readFileSync(STATS_FILE, 'utf8'));
      if (!data.visits) data.visits = { total: 0, uniqueSessions: [], byDay: {} };
      if (!Array.isArray(data.visits.uniqueSessions)) data.visits.uniqueSessions = [];
      if (!data.visits.byDay) data.visits.byDay = {};
      if (!data.searches) data.searches = { total: 0, aiAppraisals: 0, recent: [], topQueries: {} };
      if (!Array.isArray(data.searches.recent)) data.searches.recent = [];
      if (!data.searches.topQueries) data.searches.topQueries = {};
      if (!data.clicks) data.clicks = { total: 0, byStore: { jpc: 0, hhv: 0, discogs: 0, ebay: 0, amazon: 0 }, recent: [] };
      if (!data.clicks.byStore) data.clicks.byStore = { jpc: 0, hhv: 0, discogs: 0, ebay: 0, amazon: 0 };
      if (!Array.isArray(data.clicks.recent)) data.clicks.recent = [];
      return data;
    }
  } catch (e) {
    console.warn('Error reading stats file:', e.message);
  }
  return getInitialStats();
}

function saveStats(stats) {
  try {
    ensureDataDirs();
    stats.lastUpdated = Date.now();
    fs.writeFileSync(STATS_FILE, JSON.stringify(stats, null, 2), 'utf8');
  } catch (e) {
    console.warn('Error saving stats file:', e.message);
  }
}

function normalizeKey(str) {
  return (str || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function loadCatalog() {
  try {
    ensureDataDirs();
    if (fs.existsSync(CATALOG_FILE)) {
      return JSON.parse(fs.readFileSync(CATALOG_FILE, 'utf8'));
    }
  } catch (e) {
    console.warn('Error reading catalog:', e.message);
  }
  return {};
}

function saveCatalog(catalog) {
  try {
    ensureDataDirs();
    fs.writeFileSync(CATALOG_FILE, JSON.stringify(catalog, null, 2), 'utf8');
  } catch (e) {
    console.warn('Error saving catalog:', e.message);
  }
}

// Download or decode image and persist directly to disk storage
async function saveImageToStorage(key, coverUrl, imageData) {
  try {
    ensureDataDirs();
    const safeKey = key.replace(/[^a-z0-9]/gi, '_').substring(0, 60);

    // 1. If base64/data URL image is provided directly by frontend
    if (imageData && typeof imageData === 'string') {
      const match = imageData.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
      if (match) {
        const rawExt = match[1].toLowerCase();
        const ext = rawExt === 'svg+xml' ? 'svg' : (rawExt === 'jpeg' ? 'jpg' : rawExt);
        const filename = `${safeKey}.${ext}`;
        const filePath = path.join(IMAGES_DIR, filename);
        fs.writeFileSync(filePath, Buffer.from(match[2], 'base64'));
        return `/api/images/${filename}`;
      } else if (imageData.startsWith('<svg')) {
        const filename = `${safeKey}.svg`;
        const filePath = path.join(IMAGES_DIR, filename);
        fs.writeFileSync(filePath, imageData, 'utf8');
        return `/api/images/${filename}`;
      }
    }

    // 2. If remote HTTP/HTTPS image URL is provided, download and store locally
    if (coverUrl && typeof coverUrl === 'string' && (coverUrl.startsWith('http://') || coverUrl.startsWith('https://'))) {
      const parsed = new URL(coverUrl);
      const extMatch = parsed.pathname.match(/\.(jpe?g|png|webp|gif|svg)$/i);
      const ext = extMatch ? extMatch[1].toLowerCase() : 'jpg';
      const filename = `${safeKey}.${ext}`;
      const filePath = path.join(IMAGES_DIR, filename);

      const client = coverUrl.startsWith('https:') ? https : http;
      await new Promise((resolve, reject) => {
        const req = client.get(coverUrl, { timeout: 8000 }, (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            const redirectClient = res.headers.location.startsWith('https:') ? https : http;
            redirectClient.get(res.headers.location, { timeout: 8000 }, (rRes) => {
              if (rRes.statusCode === 200) {
                const stream = fs.createWriteStream(filePath);
                rRes.pipe(stream);
                stream.on('finish', () => { stream.close(); resolve(); });
                stream.on('error', reject);
              } else {
                reject(new Error(`Redirect download failed with ${rRes.statusCode}`));
              }
            }).on('error', reject);
            return;
          }
          if (res.statusCode === 200) {
            const stream = fs.createWriteStream(filePath);
            res.pipe(stream);
            stream.on('finish', () => { stream.close(); resolve(); });
            stream.on('error', reject);
          } else {
            reject(new Error(`Download failed with ${res.statusCode}`));
          }
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('Download timeout')); });
      });

      return `/api/images/${filename}`;
    }
  } catch (err) {
    console.warn(`[storage] Image caching notice for ${key}:`, err.message);
  }
  return coverUrl || null;
}

const ytCache = {};

async function resolveYouTubeVideo(query) {
  const norm = normalizeKey(query);
  if (ytCache[norm]) return ytCache[norm];

  const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
  return new Promise((resolve) => {
    let resolved = false;
    const safeResolve = (resVal) => {
      if (resolved) return;
      resolved = true;
      if (resVal) ytCache[norm] = resVal;
      resolve(resVal);
    };

    const req = https.get(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9'
      },
      timeout: 8000
    }, (res) => {
      let html = '';
      res.on('data', chunk => {
        html += chunk;
        const match = html.match(/\/watch\?v=([a-zA-Z0-9_-]{11})/) || html.match(/"videoId":"([a-zA-Z0-9_-]{11})"/);
        if (match) {
          const videoId = match[1];
          const titleMatch = html.match(/"title":\{"runs":\[\{"text":"([^"]+)"\}/) || html.match(/"title":\{"accessibility":\{"accessibilityData":\{"label":"([^"]+)"\}/);
          safeResolve({
            videoId,
            videoTitle: titleMatch ? titleMatch[1] : '',
            embedUrl: `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=0`,
            watchUrl: `https://www.youtube.com/watch?v=${videoId}`
          });
          req.destroy();
        }
      });
      res.on('end', () => {
        const match = html.match(/\/watch\?v=([a-zA-Z0-9_-]{11})/) || html.match(/"videoId":"([a-zA-Z0-9_-]{11})"/);
        if (match) {
          const videoId = match[1];
          const titleMatch = html.match(/"title":\{"runs":\[\{"text":"([^"]+)"\}/) || html.match(/"title":\{"accessibility":\{"accessibilityData":\{"label":"([^"]+)"\}/);
          safeResolve({
            videoId,
            videoTitle: titleMatch ? titleMatch[1] : '',
            embedUrl: `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=0`,
            watchUrl: `https://www.youtube.com/watch?v=${videoId}`
          });
        } else {
          safeResolve(null);
        }
      });
    });

    req.on('error', () => {
      safeResolve(null);
    });

    req.on('timeout', () => {
      req.destroy();
      safeResolve(null);
    });
  });
}

const MIME_TYPES = {
  '.html': 'text/html; charset=UTF-8',
  '.js': 'application/javascript; charset=UTF-8',
  '.mjs': 'application/javascript; charset=UTF-8',
  '.css': 'text/css; charset=UTF-8',
  '.json': 'application/json; charset=UTF-8',
  '.webmanifest': 'application/manifest+json; charset=UTF-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.xml': 'application/xml; charset=UTF-8',
  '.txt': 'text/plain; charset=UTF-8'
};

// ============================================================================
// QUICK AUTOCOMPLETE ENGINE (TOP 3 ALBUMS PER ARTIST / QUERY)
// ============================================================================
const autocompleteCache = {};

function fetchItunesAlbums(query) {
  return new Promise((resolve) => {
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=album&limit=15`;
    const req = https.get(url, {
      headers: {
        'User-Agent': 'VinylTipper/2.6 (Macintosh; AppleWebKit)'
      },
      timeout: 4500
    }, (res) => {
      if (res.statusCode !== 200) {
        resolve([]);
        return;
      }
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json.results || []);
        } catch (e) {
          resolve([]);
        }
      });
    });
    req.on('error', () => resolve([]));
    req.on('timeout', () => { req.destroy(); resolve([]); });
  });
}

async function getAutocompleteAlbums(query) {
  const norm = normalizeKey(query);
  if (!norm || norm.length < 2) return [];
  if (autocompleteCache[norm]) {
    return autocompleteCache[norm];
  }

  const catalog = loadCatalog();
  const candidates = [];
  const seenTitles = new Set();

  // 1. Check local catalog database first (0ms)
  for (const key of Object.keys(catalog)) {
    const item = catalog[key];
    if (!item || !item.title) continue;
    const artNorm = normalizeKey(item.artist || '');
    const titleNorm = normalizeKey(item.title || '');
    const artMatches = (artNorm.length >= 3 && (artNorm.includes(norm) || (norm.length >= 4 && norm.includes(artNorm)))) || (artNorm.length > 0 && artNorm === norm);
    const titleMatches = (titleNorm.length >= 3 && (titleNorm.includes(norm) || (norm.length >= 4 && norm.includes(titleNorm)))) || (titleNorm.length > 0 && titleNorm === norm);
    if (artMatches || titleMatches) {
      const cleanTitleKey = normalizeKey(item.title);
      if (!seenTitles.has(cleanTitleKey)) {
        seenTitles.add(cleanTitleKey);
        candidates.push({
          title: item.title,
          artist: item.artist || '',
          year: item.year ? String(item.year) : '',
          coverUrl: item.coverUrl || '',
          primaryGenre: item.genre || 'Vinyl',
          fromDb: true
        });
      }
    }
    if (candidates.length >= 3) break;
  }

  // 2. Query public iTunes index for top releases
  if (candidates.length < 3) {
    try {
      const itunesResults = await fetchItunesAlbums(query);
      const qLower = query.toLowerCase();
      const wantsInstrumental = qLower.includes('instrumental');
      const wantsRemix = qLower.includes('remix');

      for (const item of itunesResults) {
        if (!item.collectionName) continue;
        const collLower = item.collectionName.toLowerCase();
        const artLower = (item.artistName || '').toLowerCase();

        // Skip singles/EPs and noise formats
        if (collLower.includes(' - single') || collLower.endsWith(' - ep')) continue;
        if (!wantsInstrumental && (collLower.includes('instrumental') || collLower.includes('karaoke'))) continue;
        if (!wantsRemix && (collLower.includes('remix') || collLower.includes('remixed'))) continue;
        if (collLower.includes('tribute') || collLower.includes('originally performed by')) continue;

        // Strip clutter like "(Deluxe Edition)", "(2019 Mix)", "[2011 Remaster]", etc.
        const baseTitle = item.collectionName.replace(/\s*[\(\[].*?(deluxe|remaster|anniversary|expanded|special|edition|bonus|live|mix|stereo|mono|version).*?[\)\]]/gi, '').trim();
        const cleanTitleKey = normalizeKey(baseTitle);

        if (!seenTitles.has(cleanTitleKey) && baseTitle.length > 0) {
          seenTitles.add(cleanTitleKey);
          const year = item.releaseDate ? new Date(item.releaseDate).getFullYear() : '';
          const rawCover = item.artworkUrl100 || '';
          const cover = rawCover ? rawCover.replace('100x100bb.jpg', '200x200bb.jpg') : '';

          candidates.push({
            title: baseTitle,
            artist: item.artistName || '',
            year: year ? String(year) : '',
            coverUrl: cover,
            primaryGenre: item.primaryGenreName || 'Vinyl',
            fromDb: false
          });
        }
        if (candidates.length >= 3) break;
      }
    } catch (err) {
      console.warn('[autocomplete] iTunes fetch warning:', err.message);
    }
  }

  const finalResults = candidates.slice(0, 3);
  autocompleteCache[norm] = finalResults;
  return finalResults;
}

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
    const authMode = (process.env.AUTH_MODE || 'public').toLowerCase();
    const activeFbConfig = authMode === 'public' ? PUBLIC_FIREBASE_CONFIG : CORPORATE_FIREBASE_CONFIG;

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      authMode,
      firebaseConfig: activeFbConfig,
      hasServerKey: pool.length > 0,
      apiKey: pool[0] || null,
      keyCount: pool.length,
      affiliates: {
        ebayCampaignId: process.env.EBAY_CAMPAIGN_ID || '',
        amazonTagDe: process.env.AMAZON_TAG_DE || process.env.AMAZON_TAG || '',
        amazonTagUs: process.env.AMAZON_TAG_US || '',
        amazonTagUk: process.env.AMAZON_TAG_UK || '',
        awinPublisherId: process.env.AWIN_PUBLISHER_ID || '',
        discogsAffiliateId: process.env.DISCOGS_AFFILIATE_ID || ''
      }
    }));
    return;
  }

  // Serve locally cached album covers from persistent storage
  if (pathname.startsWith('/api/images/')) {
    const filename = path.basename(pathname);
    const imagePath = path.join(IMAGES_DIR, filename);

    if (fs.existsSync(imagePath)) {
      const ext = path.extname(imagePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'image/jpeg';
      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable'
      });
      fs.createReadStream(imagePath).pipe(res);
      return;
    } else {
      res.writeHead(404, {
        'Content-Type': 'text/plain',
        'X-Cover-Missing': 'true'
      });
      res.end('Image Not Found in Storage');
      return;
    }
  }

  // POST /api/track/visit -> Log website visit / session
  if (pathname === '/api/track/visit' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        const stats = loadStats();
        stats.visits.total++;
        
        const today = new Date().toISOString().slice(0, 10);
        stats.visits.byDay[today] = (stats.visits.byDay[today] || 0) + 1;

        const sid = payload.sessionId || '';
        if (sid && !stats.visits.uniqueSessions.includes(sid)) {
          stats.visits.uniqueSessions.push(sid);
          if (stats.visits.uniqueSessions.length > 500) {
            stats.visits.uniqueSessions.shift();
          }
        }
        saveStats(stats);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, visits: stats.visits.total }));
        return;
      } catch (err) {
        console.warn('Failed to parse track visit payload:', err.message);
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false }));
    });
    return;
  }

  // POST /api/track/search -> Log search appraisal activity
  if (pathname === '/api/track/search' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        const stats = loadStats();
        stats.searches.total++;
        if (payload.isAi) stats.searches.aiAppraisals++;

        const query = (payload.query || '').trim();
        if (query) {
          const normQ = query.toLowerCase();
          stats.searches.topQueries[normQ] = (stats.searches.topQueries[normQ] || 0) + 1;
          stats.searches.recent.unshift({
            query,
            timestamp: Date.now(),
            hit: !!payload.hit,
            isAi: !!payload.isAi
          });
          if (stats.searches.recent.length > 50) {
            stats.searches.recent.pop();
          }
        }
        saveStats(stats);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
        return;
      } catch (err) {
        console.warn('Failed to parse track search payload:', err.message);
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false }));
    });
    return;
  }

  // POST /api/track/click -> Log outbound affiliate / store link click
  if (pathname === '/api/track/click' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        const store = (payload.store || 'other').toLowerCase();
        const stats = loadStats();
        stats.clicks.total++;
        if (stats.clicks.byStore[store] !== undefined) {
          stats.clicks.byStore[store]++;
        } else {
          stats.clicks.byStore[store] = 1;
        }

        stats.clicks.recent.unshift({
          store,
          query: payload.query || '',
          albumTitle: payload.albumTitle || '',
          timestamp: Date.now()
        });
        if (stats.clicks.recent.length > 50) {
          stats.clicks.recent.pop();
        }

        saveStats(stats);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, store, total: stats.clicks.total }));
        return;
      } catch (err) {
        console.warn('Failed to parse track click payload:', err.message);
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false }));
    });
    return;
  }

  // GET /api/admin/stats -> Admin analytics dashboard metrics
  if (pathname === '/api/admin/stats' && req.method === 'GET') {
    const adminEmail = (req.headers['x-admin-email'] || urlObj.searchParams.get('adminEmail') || '').toLowerCase();
    if (!ADMIN_EMAILS.includes(adminEmail)) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Access denied: Admin credentials required' }));
      return;
    }

    const stats = loadStats();
    const catalog = loadCatalog();
    const catalogCount = Object.keys(catalog).length;

    let imageCount = 0;
    try {
      if (fs.existsSync(IMAGES_DIR)) {
        imageCount = fs.readdirSync(IMAGES_DIR).length;
      }
    } catch (e) {}

    const allFavs = loadStoredFavorites();
    const userCount = Object.keys(allFavs).length;
    let totalFavorites = 0;
    Object.values(allFavs).forEach(list => {
      if (Array.isArray(list)) totalFavorites += list.length;
    });

    const pool = getKeyPool();
    const today = new Date().toISOString().slice(0, 10);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      stats,
      todayVisits: stats.visits.byDay[today] || 0,
      uniqueSessionsCount: stats.visits.uniqueSessions.length,
      catalogCount,
      imageCount,
      totalFavorites,
      userCount,
      keyCount: pool.length,
      uptimeSeconds: Math.floor(process.uptime()),
      nodeVersion: process.version,
      memoryUsage: process.memoryUsage(),
      serverTimestamp: Date.now()
    }));
    return;
  }

  // POST /api/admin/reset-stats -> Reset analytics metrics (Admin only)
  if (pathname === '/api/admin/reset-stats' && req.method === 'POST') {
    const adminEmail = (req.headers['x-admin-email'] || urlObj.searchParams.get('adminEmail') || '').toLowerCase();
    if (!ADMIN_EMAILS.includes(adminEmail)) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Access denied' }));
      return;
    }

    const newStats = getInitialStats();
    saveStats(newStats);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, stats: newStats }));
    return;
  }

  // GET /api/vault/pick-of-the-day -> Return deterministic daily holy-grail vinyl from 365 vault
  if (pathname === '/api/vault/pick-of-the-day' && req.method === 'GET') {
    const potd = getPickOfTheDay();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, ...potd }));
    return;
  }

  // GET /api/vault/random -> Roll another random holy-grail from 365 vault
  if (pathname === '/api/vault/random' && req.method === 'GET') {
    const vault = loadVault365();
    const randomPick = (vault && vault.length > 0) ? vault[Math.floor(Math.random() * vault.length)] : null;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, pick: randomPick, total: vault ? vault.length : 0 }));
    return;
  }

  // GET /api/vault/all -> Retrieve all 365 holy-grail entries
  if (pathname === '/api/vault/all' && req.method === 'GET') {
    const vault = loadVault365();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, total: vault.length, vault }));
    return;
  }

  // GET /api/session/last-album -> Retrieve last displayed album across sessions & server restarts
  if (pathname === '/api/session/last-album' && req.method === 'GET') {
    const lastSession = loadLastSession();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, lastAlbum: lastSession }));
    return;
  }

  // POST /api/session/last-album -> Save last displayed album
  if (pathname === '/api/session/last-album' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        if (payload && (payload.query || payload.title)) {
          saveLastSession({
            query: payload.query,
            title: payload.title,
            artist: payload.artist,
            updatedAt: Date.now()
          });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true }));
          return;
        }
      } catch (err) {
        console.warn('Failed to parse last session payload:', err.message);
      }
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Invalid payload' }));
    });
    return;
  }

  // GET /api/recommendations?uid=... -> Retrieve cached recommendations
  if (pathname === '/api/recommendations' && req.method === 'GET') {
    const uid = urlObj.searchParams.get('uid') || 'default';
    const allRecs = loadStoredRecommendations();
    const userRec = allRecs[uid] || null;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, data: userRec }));
    return;
  }

  // POST /api/recommendations -> Save cached recommendations
  if (pathname === '/api/recommendations' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        const uid = payload.uid || 'default';
        if (payload && Array.isArray(payload.recommendations)) {
          const allRecs = loadStoredRecommendations();
          allRecs[uid] = {
            signature: payload.signature || '',
            recommendations: payload.recommendations,
            updatedAt: Date.now()
          };
          saveStoredRecommendations(allRecs);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true }));
          return;
        }
      } catch (err) {
        console.warn('Failed to parse recommendations payload:', err.message);
      }
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Invalid payload' }));
    });
    return;
  }

  // GET /api/favorites?uid=... -> Retrieve user's saved favorites
  if (pathname === '/api/favorites' && req.method === 'GET') {
    const uid = urlObj.searchParams.get('uid') || 'default';
    const allFavs = loadStoredFavorites();
    const userFavs = allFavs[uid] || [];
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, data: userFavs }));
    return;
  }

  // POST /api/favorites -> Save user's favorites
  if (pathname === '/api/favorites' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        const uid = payload.uid || 'default';
        const favorites = Array.isArray(payload.favorites) ? payload.favorites : [];
        const allFavs = loadStoredFavorites();
        allFavs[uid] = favorites;
        saveStoredFavorites(allFavs);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, count: favorites.length }));
        return;
      } catch (err) {
        console.warn('Failed to parse favorites payload:', err.message);
      }
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Invalid payload' }));
    });
    return;
  }

  // GET /api/autocomplete?q=... -> Return top 3 landmark albums for an artist or album query
  if (pathname === '/api/autocomplete' && req.method === 'GET') {
    const q = (urlObj.searchParams.get('q') || '').trim();
    if (!q || q.length < 2) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, results: [] }));
      return;
    }

    try {
      const results = await getAutocompleteAlbums(q);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, results }));
    } catch (err) {
      console.warn('[autocomplete] Request error:', err.message);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, results: [] }));
    }
    return;
  }

  // GET /api/youtube?q=... -> Resolve YouTube video ID for listening
  if (pathname === '/api/youtube' && req.method === 'GET') {
    const q = urlObj.searchParams.get('q') || '';
    if (!q) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing query' }));
      return;
    }

    const result = await resolveYouTubeVideo(q);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    if (result) {
      res.end(JSON.stringify({ success: true, ...result }));
    } else {
      res.end(JSON.stringify({ success: false, error: 'Video not found' }));
    }
    return;
  }

  // GET /api/catalog?q=... -> Check if album is cached in storage
  if (pathname === '/api/catalog' && req.method === 'GET') {
    const q = urlObj.searchParams.get('q') || '';
    const normQ = normalizeKey(q);
    const catalog = loadCatalog();

    let found = null;
    if (catalog[normQ]) {
      found = catalog[normQ];
    } else {
      for (const key of Object.keys(catalog)) {
        const item = catalog[key];
        const itemFull = normalizeKey((item.artist || '') + ' ' + (item.title || ''));
        const itemTitle = normalizeKey(item.title || '');
        if (key === normQ || itemFull === normQ || itemTitle === normQ || (itemTitle.length > 3 && normQ.includes(itemTitle))) {
          found = item;
          break;
        }
      }
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    if (found) {
      res.end(JSON.stringify({ hit: true, album: found }));
    } else {
      res.end(JSON.stringify({ hit: false }));
    }
    return;
  }

  // POST /api/catalog -> Save album details & image to storage
  if (pathname === '/api/catalog' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const data = JSON.parse(body);
        if (!data.title) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing title' }));
          return;
        }

        const primaryKey = normalizeKey((data.artist || '') + ' ' + data.title);
        const titleKey = normalizeKey(data.title);

        // Storage Strategy (Option A): Direct CDN URLs with PWA client-side caching
        // Direct HTTPS URLs (Apple/iTunes, Deezer, etc.) are kept as-is without consuming server disk or RAM.
        let storedCoverUrl = data.coverUrl || '';
        if (!storedCoverUrl && data.imageData && typeof data.imageData === 'string' && data.imageData.startsWith('data:')) {
          storedCoverUrl = data.imageData;
        }

        // Cache alternative covers and index alternatives in catalog
        const processedAlternatives = [];
        if (Array.isArray(data.alternatives)) {
          for (let i = 0; i < data.alternatives.length; i++) {
            const alt = data.alternatives[i];
            let altCover = alt.coverUrl || '';
            if (!altCover && alt.imageData && typeof alt.imageData === 'string' && alt.imageData.startsWith('data:')) {
              altCover = alt.imageData;
            }
            const altKey = normalizeKey((alt.artist || '') + ' ' + alt.title);
            const altRecord = {
              title: alt.title,
              artist: alt.artist || '',
              genre: alt.genre || '',
              playtime: alt.playtime || '',
              trackCount: alt.trackCount || 0,
              coverUrl: altCover,
              coverSearchTerm: alt.coverSearchTerm || '',
              streetPriceGermany: alt.streetPriceGermany || null
            };
            processedAlternatives.push(altRecord);

            // Also index each alternative in catalog if not already present
            if (altKey) {
              const currentCatalog = loadCatalog();
              if (!currentCatalog[altKey]) {
                currentCatalog[altKey] = {
                  title: alt.title,
                  artist: alt.artist || '',
                  genre: alt.genre || '',
                  playtime: alt.playtime || '',
                  trackCount: alt.trackCount || 0,
                  coverUrl: altCover,
                  alternatives: [],
                  updatedAt: Date.now()
                };
                saveCatalog(currentCatalog);
              }
            }
          }
        }

        const catalog = loadCatalog();
        const record = {
          title: data.title,
          artist: data.artist || '',
          genre: data.genre || '',
          year: data.year || '',
          playtime: data.playtime || '',
          trackCount: data.trackCount || 0,
          firstTrackTitle: data.firstTrackTitle || '',
          youtubeVideoId: data.youtubeVideoId || '',
          collectorScore: data.collectorScore || null,
          coverUrl: storedCoverUrl,
          streetPriceGermany: data.streetPriceGermany || null,
          alternatives: processedAlternatives.length > 0 ? processedAlternatives : (data.alternatives || []),
          updatedAt: Date.now()
        };

        catalog[primaryKey] = record;
        if (titleKey && !catalog[titleKey]) {
          catalog[titleKey] = record;
        }

        saveCatalog(catalog);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, key: primaryKey, coverUrl: storedCoverUrl }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // Server-side proxy for Gemini API with multi-key failover
  if (pathname === '/api/gemini' && req.method === 'POST') {
    const clientKey = cleanApiKey(req.headers['x-gemini-key']);
    const key = (clientKey && clientKey.length > 15) ? clientKey : getNextKey();

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
  let effectivePath = pathname;
  if (pathname === '/' || pathname === '') {
    effectivePath = 'index.html';
  } else if (pathname === '/admin' || pathname === '/admin/') {
    effectivePath = 'admin.html';
  }
  let filePath = path.join(PUBLIC_DIR, effectivePath);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function processHtmlWithSeo(rawHtml, urlObj, authMode, activeFbConfig) {
  let html = rawHtml;
  const albumParam = (urlObj.searchParams.get('album') || urlObj.searchParams.get('q') || '').trim();
  let dynamicSeoTags = '';

  if (albumParam) {
    const catalog = loadCatalog();
    const norm = normalizeKey(albumParam);
    let item = catalog[norm] || null;

    if (!item) {
      for (const k of Object.keys(catalog)) {
        const catItem = catalog[k];
        if (!catItem) continue;
        const fullKey = normalizeKey((catItem.artist || '') + ' ' + (catItem.title || ''));
        const titleKey = normalizeKey(catItem.title || '');
        if (k === norm || fullKey === norm || titleKey === norm) {
          item = catItem;
          break;
        }
      }
    }

    let artist = '';
    let title = albumParam;
    let price = '';
    let coverUrl = '';
    let genre = '';

    if (item) {
      artist = item.artist || '';
      title = item.title || albumParam;
      price = item.streetPriceGermany?.newEur || '';
      coverUrl = item.coverUrl || '';
      genre = item.genre || '';
    } else if (albumParam.includes(' - ')) {
      const parts = albumParam.split(' - ');
      artist = parts[0].trim();
      title = parts.slice(1).join(' - ').trim();
    }

    const label = (artist && title) ? `${artist} – ${title}` : title;
    const pageTitle = `${label} | Vinyl Hound Appraisal & German Street Price`;
    const encodedAlbum = encodeURIComponent(albumParam).replace(/%20/g, '+');
    const canonicalUrl = `https://vinylhound.de/?album=${encodedAlbum}`;
    const desc = `Discover ${label} physical vinyl pressing details${price ? ' (Approx. ' + price + ')' : ''}. German street pricing, 180g analog dynamic range, and collector tips on Vinyl Hound.`;
    const fullCover = coverUrl
      ? (coverUrl.startsWith('/') ? `https://vinylhound.de${coverUrl}` : coverUrl)
      : 'https://vinylhound.de/logo/vinylhound-emblem-dark.jpeg';

    html = html.replace(/<title>.*?<\/title>/i, `<title>${escapeHtml(pageTitle)}</title>`);
    html = html.replace(/<link\s+rel=["']canonical["'][^>]*>/i, `<link rel="canonical" href="${escapeHtml(canonicalUrl)}">`);
    html = html.replace(/<meta\s+name=["']description["'][^>]*>/i, `<meta name="description" content="${escapeHtml(desc)}">`);
    html = html.replace(/<meta\s+property=["']og:title["'][^>]*>/i, `<meta property="og:title" content="${escapeHtml(pageTitle)}">`);
    html = html.replace(/<meta\s+property=["']og:description["'][^>]*>/i, `<meta property="og:description" content="${escapeHtml(desc)}">`);
    html = html.replace(/<meta\s+property=["']og:url["'][^>]*>/i, `<meta property="og:url" content="${escapeHtml(canonicalUrl)}">`);
    html = html.replace(/<meta\s+property=["']og:image["'][^>]*>/i, `<meta property="og:image" content="${escapeHtml(fullCover)}">`);
    html = html.replace(/<meta\s+name=["']twitter:title["'][^>]*>/i, `<meta name="twitter:title" content="${escapeHtml(pageTitle)}">`);
    html = html.replace(/<meta\s+name=["']twitter:description["'][^>]*>/i, `<meta name="twitter:description" content="${escapeHtml(desc)}">`);
    html = html.replace(/<meta\s+name=["']twitter:url["'][^>]*>/i, `<meta name="twitter:url" content="${escapeHtml(canonicalUrl)}">`);
    html = html.replace(/<meta\s+name=["']twitter:image["'][^>]*>/i, `<meta name="twitter:image" content="${escapeHtml(fullCover)}">`);

    const albumSchema = {
      "@context": "https://schema.org",
      "@type": "MusicAlbum",
      "name": title,
      "byArtist": {
        "@type": "MusicGroup",
        "name": artist || "Various Artists"
      },
      "url": canonicalUrl,
      "image": fullCover,
      ...(genre ? { "genre": genre } : {}),
      ...(price ? {
        "offers": {
          "@type": "Offer",
          "priceCurrency": "EUR",
          "description": `German vinyl street price: ${price}`
        }
      } : {})
    };

    dynamicSeoTags = `\n  <script type="application/ld+json" id="schema-music-album">\n  ${JSON.stringify(albumSchema, null, 2)}\n  </script>`;
  }

  const scriptInjection = `<script>window.__AUTH_MODE__=${JSON.stringify(authMode)};window.__FIREBASE_CONFIG__=${JSON.stringify(activeFbConfig)};</script>${dynamicSeoTags}</head>`;
  return html.replace('</head>', scriptInjection);
}

  fs.stat(filePath, (err, stats) => {
    const authMode = (process.env.AUTH_MODE || 'corporate').toLowerCase();
    const activeFbConfig = authMode === 'public' ? PUBLIC_FIREBASE_CONFIG : CORPORATE_FIREBASE_CONFIG;

    if (err || !stats.isFile()) {
      const fallback = path.join(PUBLIC_DIR, 'index.html');
      fs.readFile(fallback, (fErr, content) => {
        if (fErr) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('Not Found');
        } else {
          const html = processHtmlWithSeo(content.toString('utf8'), urlObj, authMode, activeFbConfig);
          res.writeHead(200, { 'Content-Type': 'text/html; charset=UTF-8' });
          res.end(html);
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
        if (ext === '.html') {
          const html = processHtmlWithSeo(content.toString('utf8'), urlObj, authMode, activeFbConfig);
          res.writeHead(200, { 'Content-Type': 'text/html; charset=UTF-8' });
          res.end(html);
          return;
        }
        const headers = { 'Content-Type': contentType };
        if (ext === '.js' || ext === '.css') {
          headers['Cache-Control'] = 'no-cache, must-revalidate';
        }
        res.writeHead(200, headers);
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
