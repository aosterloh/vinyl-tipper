import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { 
  getAuth, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut, 
  onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";

// ============================================================================
// 1. FIREBASE AUTHENTICATION CONFIGURATION (MANDATORY per gemini.md)
// ============================================================================
export const firebaseConfig = {
  apiKey: "AIzaSyBDfu44ElID27cy2lvozY2BD1izTq7AIuo",
  authDomain: "aosterloh-cs-muc.firebaseapp.com",
  projectId: "aosterloh-cs-muc",
  storageBucket: "aosterloh-cs-muc.appspot.com",
  appId: "1:557450838719:web:5e51f"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();
provider.setCustomParameters({ 
  hd: 'google.com', 
  prompt: 'select_account' 
});

// App State
let currentUser = null;
let userSearches = [];
let userFavorites = [];
let currentAlbumData = null;
let hasServerKey = false;
const MODEL_NAME = "gemini-3.8-flash";

// ============================================================================
// 2. DOM ELEMENTS
// ============================================================================
const authGate = document.getElementById("auth-gate");
const appShell = document.getElementById("app-shell");
const googleSignInBtn = document.getElementById("google-signin-btn");
const authErrorMsg = document.getElementById("auth-error-msg");
const signoutBtn = document.getElementById("signout-btn");
const userAvatar = document.getElementById("user-avatar");
const themeToggle = document.getElementById("theme-toggle");

// Favorites Elements
const favsBtn = document.getElementById("favs-btn");
const favsCountBadge = document.getElementById("favs-count-badge");
const heroFavBtn = document.getElementById("hero-fav-btn");
const favsDrawerContainer = document.getElementById("favs-drawer-container");
const favsDrawerBackdrop = document.getElementById("favs-drawer-backdrop");
const closeFavsDrawerBtn = document.getElementById("close-favs-drawer-btn");
const favsDrawerCount = document.getElementById("favs-drawer-count");
const favsDrawerList = document.getElementById("favs-drawer-list");

const searchForm = document.getElementById("search-form");
const albumInput = document.getElementById("album-input");
const loadingState = document.getElementById("loading-state");
const resultsSection = document.getElementById("results-section");

// Floating AI Thinking Banner Elements & Lifecycle
const aiThinkingBanner = document.getElementById("ai-thinking-banner");
let activeAiRequests = 0;
let aiBannerHideTimer = null;

function showAiThinkingBanner() {
  if (aiBannerHideTimer) {
    clearTimeout(aiBannerHideTimer);
    aiBannerHideTimer = null;
  }
  if (aiThinkingBanner) {
    aiThinkingBanner.classList.remove("hidden");
  }
}

function hideAiThinkingBanner() {
  if (activeAiRequests <= 0 && aiThinkingBanner) {
    aiBannerHideTimer = setTimeout(() => {
      if (activeAiRequests <= 0 && aiThinkingBanner) {
        aiThinkingBanner.classList.add("hidden");
      }
    }, 350);
  }
}

// Hero appraisal elements
const albumCoverImg = document.getElementById("album-cover-img");
const albumTitleEl = document.getElementById("album-title");
const albumArtistEl = document.getElementById("album-artist");
const albumGenreEl = document.getElementById("album-genre-badge");
const albumYearEl = document.getElementById("album-year");
const albumPlaytimeEl = document.getElementById("album-playtime");
const albumTracksEl = document.getElementById("album-tracks");
const priceNewEl = document.getElementById("price-new");
const priceNewNoteEl = document.getElementById("price-new-note");
const linksNewEl = document.getElementById("links-new");
const priceUsedEl = document.getElementById("price-used");
const priceUsedNoteEl = document.getElementById("price-used-note");
const linksUsedEl = document.getElementById("links-used");

// Auto-healing hero cover: If storage cover 404s or fails to load, retrieve live from internet
let isRecoveringHeroCover = false;
if (albumCoverImg) {
  albumCoverImg.addEventListener("error", async () => {
    if (isRecoveringHeroCover) return;
    if (!currentAlbumData || !currentAlbumData.title) return;

    isRecoveringHeroCover = true;
    console.warn(`[storage] Hero cover failed to load for "${currentAlbumData.title}", retrieving live from internet...`);

    try {
      const freshCover = await fetchAlbumCover(currentAlbumData.title, currentAlbumData.artist, currentAlbumData.title);
      if (freshCover && !freshCover.startsWith("data:image/svg") && freshCover !== albumCoverImg.src) {
        albumCoverImg.src = freshCover;
        currentAlbumData.coverUrl = freshCover;
        // Re-persist healed cover to database and server storage
        saveAlbumToCache(currentAlbumData);
      } else {
        albumCoverImg.src = generateSvgCover(currentAlbumData.title, currentAlbumData.artist);
      }
    } catch (err) {
      console.warn("Hero cover recovery error:", err);
    } finally {
      setTimeout(() => { isRecoveringHeroCover = false; }, 1500);
    }
  });
}

// Embedded YouTube Listening Station elements (below fav heart)
const heroYtBox = document.getElementById("hero-yt-box");
const ytTrackTitle = document.getElementById("yt-track-title");
const heroYtIframe = document.getElementById("hero-yt-iframe");
const heroYtLink = document.getElementById("hero-yt-link");

async function loadYouTubeTrack1(artist, albumTitle, firstTrackTitle = "", existingVideoId = "") {
  if (!heroYtBox || !heroYtIframe) return null;

  const displayTitle = firstTrackTitle ? `"${firstTrackTitle}"` : albumTitle;
  ytTrackTitle.textContent = displayTitle;

  // 1. If videoId is already cached/known in storage:
  if (existingVideoId) {
    heroYtIframe.src = `https://www.youtube-nocookie.com/embed/${existingVideoId}?autoplay=0`;
    heroYtLink.href = `https://www.youtube.com/watch?v=${existingVideoId}`;
    heroYtBox.classList.remove("hidden");
    return existingVideoId;
  }

  // 2. Otherwise query /api/youtube to resolve video ID
  const query = `${artist} ${firstTrackTitle || albumTitle}`.trim();
  try {
    const res = await fetch(`/api/youtube?q=${encodeURIComponent(query)}`);
    if (res.ok) {
      const data = await res.json();
      if (data.success && data.videoId) {
        heroYtIframe.src = data.embedUrl || `https://www.youtube-nocookie.com/embed/${data.videoId}?autoplay=0`;
        heroYtLink.href = data.watchUrl || `https://www.youtube.com/watch?v=${data.videoId}`;
        heroYtBox.classList.remove("hidden");
        return data.videoId;
      }
    }
  } catch (e) {
    console.warn("YouTube resolution error:", e);
  }
  return null;
}

// Direct store search link generators for German vinyl market
function getNewVinylLinks(title, artist) {
  const query = `${artist} ${title}`.trim();
  return [
    { name: "jpc.de", url: `https://www.jpc.de/s/${encodeURIComponent(query)}` },
    { name: "HHV.de", url: `https://www.hhv.de/shop/de/records/suche?term=${encodeURIComponent(query)}` },
    { name: "Amazon.de", url: `https://www.amazon.de/s?k=${encodeURIComponent(query + ' vinyl')}` }
  ];
}

function getUsedVinylLinks(title, artist) {
  const query = `${artist} ${title}`.trim();
  return [
    { name: "Discogs", url: `https://www.discogs.com/sell/list?q=${encodeURIComponent(query)}&format=Vinyl` },
    { name: "eBay.de", url: `https://www.ebay.de/sch/i.html?_nkw=${encodeURIComponent(query + ' vinyl')}&_sop=12` },
    { name: "Kleinanzeigen", url: `https://www.kleinanzeigen.de/s-musik-cds/vinyl-${encodeURIComponent(title)}/k0c78` }
  ];
}

// Alternatives elements
const alternativesGenreName = document.getElementById("alternatives-genre-name");
const alternativesGrid = document.getElementById("alternatives-grid");

// Memory & Recommendations elements
const memoryCounter = document.getElementById("memory-counter");
const counterValueEl = document.getElementById("counter-value");
const counterDotsEl = document.getElementById("counter-dots");
const recLockedBanner = document.getElementById("rec-locked-banner");
const lockedProgressMsg = document.getElementById("locked-progress-msg");
const recCarouselContainer = document.getElementById("rec-carousel-container");
const recTrack = document.getElementById("rec-track");
const recPrevBtn = document.getElementById("rec-prev-btn");
const recNextBtn = document.getElementById("rec-next-btn");

// Curated Vinyl Recommendations Elements (3+ Favorites Modal)
const favRecsBtn = document.getElementById("fav-recs-btn");
const favRecsModalContainer = document.getElementById("fav-recs-modal-container");
const favRecsModalBackdrop = document.getElementById("fav-recs-modal-backdrop");
const closeFavRecsModalBtn = document.getElementById("close-fav-recs-modal-btn");
const recsModalTitle = document.getElementById("recs-modal-title");
const recsModalSubtitle = document.getElementById("recs-modal-subtitle");
const recsModalLoading = document.getElementById("recs-modal-loading");
const favRecsList = document.getElementById("fav-recs-list");
const expandRecsBtn = document.getElementById("expand-recs-btn");

let cachedFavRecs = [];
let isRecsExpanded = false;
let lastFavsSignature = "";

// ============================================================================
// 3. THEME MANAGEMENT (LIGHT & DARK MODE PROTOCOL)
// ============================================================================
function initTheme() {
  const savedTheme = localStorage.getItem("vinyl_theme");
  if (savedTheme) {
    document.documentElement.setAttribute("data-theme", savedTheme);
  } else {
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.setAttribute("data-theme", prefersDark ? "dark" : "light");
  }

  themeToggle.addEventListener("click", () => {
    const currentTheme = document.documentElement.getAttribute("data-theme") || "light";
    const newTheme = currentTheme === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", newTheme);
    localStorage.setItem("vinyl_theme", newTheme);
  });
}

// ============================================================================
// 4. FIREBASE AUTHENTICATION FLOW (@google.com ONLY)
// ============================================================================
googleSignInBtn.addEventListener("click", async () => {
  authErrorMsg.classList.add("hidden");
  try {
    const result = await signInWithPopup(auth, provider);
    const user = result.user;
    if (!user.email || !user.email.toLowerCase().endsWith("@google.com")) {
      await signOut(auth);
      showAuthError(`Access Denied: You authenticated with ${user.email}. Only @google.com accounts are permitted.`);
    }
  } catch (error) {
    console.error("Sign-in error:", error);
    if (error.code === "auth/unauthorized-domain") {
      showAuthError(`Domain authorization required: Add current domain to Firebase Auth project (aosterloh-cs-muc).`);
    } else {
      showAuthError(error.message || "Authentication failed. Please try again.");
    }
  }
});

signoutBtn.addEventListener("click", async () => {
  await signOut(auth);
});

function showAuthError(msg) {
  authErrorMsg.textContent = msg;
  authErrorMsg.classList.remove("hidden");
}

onAuthStateChanged(auth, async (user) => {
  if (user) {
    if (!user.email || !user.email.toLowerCase().endsWith("@google.com")) {
      await signOut(auth);
      showAuthError(`Access Denied: You authenticated with ${user.email}. Only @google.com accounts are permitted.`);
      authGate.classList.remove("hidden");
      appShell.classList.add("hidden");
      return;
    }

    currentUser = user;
    userAvatar.src = user.photoURL || createAvatarPlaceholder(user.displayName || user.email);
    userAvatar.title = user.email;
    authGate.classList.add("hidden");
    appShell.classList.remove("hidden");
    
    // Load User Search History Memory Bank & Favorites
    loadUserMemory();
    loadUserFavorites();

    // Restore last displayed album to continue where user left off after last session / restart
    restoreLastSessionAlbum();
  } else {
    currentUser = null;
    userFavorites = [];
    updateFavsUI();
    authGate.classList.remove("hidden");
    appShell.classList.add("hidden");
  }
});

function createAvatarPlaceholder(name) {
  const initial = (name ? name.charAt(0) : "V").toUpperCase();
  return `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><rect width="32" height="32" rx="16" fill="%234285F4"/><text x="16" y="21" font-family="sans-serif" font-size="16" font-weight="bold" fill="white" text-anchor="middle">${initial}</text></svg>`;
}

// ============================================================================
// 5. SERVER CONFIG & GEMINI API KEY MANAGEMENT
// ============================================================================
async function checkServerConfig() {
  try {
    const res = await fetch("/api/config");
    if (res.ok) {
      const data = await res.json();
      hasServerKey = Boolean(data.hasServerKey);
      if (data.apiKey && !localStorage.getItem("gemini_api_key")) {
        localStorage.setItem("gemini_api_key", data.apiKey);
      }
    }
  } catch (e) {
    hasServerKey = false;
  }
}

function getActiveApiKey() {
  const customKey = localStorage.getItem("gemini_api_key");
  if (customKey && customKey.trim().length > 0) {
    return customKey.trim();
  }
  return null;
}

// Graceful error notification without user-facing key prompts
function triggerDiagnosticsError(model, errorType, message) {
  console.warn(`[diagnostics] ${errorType}: ${message}`);
}

// ============================================================================
// 6. ALBUM COVER ART RESOLVER (iTunes API with SVG Vinyl Fallback)
// ============================================================================
async function fetchAlbumCover(query, artist = "", fallbackTitle = "") {
  try {
    const cleanTitle = (fallbackTitle || query || "").trim();
    const searchTerm = `${cleanTitle} ${artist}`.trim();
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(searchTerm)}&entity=album&limit=6`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      if (data.results && data.results.length > 0) {
        const targetTitleLower = cleanTitle.toLowerCase();
        const wantsInstrumental = targetTitleLower.includes("instrumental");
        const wantsRemix = targetTitleLower.includes("remix");
        const wantsLive = targetTitleLower.includes("live");

        let bestResult = null;
        let bestScore = -999;

        for (const item of data.results) {
          const collName = (item.collectionName || "").toLowerCase();
          const artName = (item.artistName || "").toLowerCase();
          let score = 10;

          // Penalize instrumentals/karaoke/tributes unless the user asked for them
          if (!wantsInstrumental && (collName.includes("instrumental") || collName.includes("karaoke"))) score -= 50;
          if (!wantsRemix && (collName.includes("remix") || collName.includes("remixed"))) score -= 25;
          if (collName.includes("tribute")) score -= 50;
          if (!wantsLive && collName.includes("live at") && !targetTitleLower.includes("live at")) score -= 15;

          // Priority for exact or starting title match
          if (collName === targetTitleLower) score += 40;
          else if (collName.startsWith(targetTitleLower)) score += 20;

          // Priority for artist match
          if (artist && artName.includes(artist.toLowerCase())) score += 20;

          if (score > bestScore) {
            bestScore = score;
            bestResult = item;
          }
        }

        const chosen = bestResult || data.results[0];
        const rawArtwork = chosen?.artworkUrl100;
        if (rawArtwork) {
          // Request high resolution 600x600 artwork
          return rawArtwork.replace("100x100bb.jpg", "600x600bb.jpg");
        }
      }
    }
  } catch (err) {
    console.warn("Cover art fetch fallback for", query, err);
  }

  // Stylish SVG Vinyl Sleeve Fallback
  return generateSvgCover(fallbackTitle || query, artist);
}

function generateSvgCover(title, artist) {
  const displayTitle = (title || "Album").slice(0, 24);
  const displayArtist = (artist || "Vinyl").slice(0, 24);
  const bgColors = ["#1a1d20", "#2c1e21", "#1e293b", "#222725", "#2a2438"];
  const color = bgColors[Math.abs(hashString(title)) % bgColors.length];

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600">
    <rect width="600" height="600" fill="${color}"/>
    <circle cx="300" cy="300" r="230" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="2"/>
    <circle cx="300" cy="300" r="180" fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="2"/>
    <circle cx="300" cy="300" r="130" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="2"/>
    <circle cx="300" cy="300" r="70" fill="rgba(0,0,0,0.6)"/>
    <circle cx="300" cy="300" r="20" fill="%23EA4335"/>
    <text x="50" y="520" font-family="'Space Grotesk', sans-serif" font-size="34" font-weight="bold" fill="%23ffffff">${escapeXml(displayTitle)}</text>
    <text x="50" y="555" font-family="'Plus Jakarta Sans', sans-serif" font-size="20" font-weight="500" fill="rgba(255,255,255,0.7)">${escapeXml(displayArtist)}</text>
  </svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

function escapeXml(unsafe) {
  return unsafe.replace(/[<>&'"]/g, c => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
    }
  });
}

// ============================================================================
// 7. GEMINI 3.8 FLASH APPRAISAL ENGINE
// ============================================================================
async function callGeminiFlash(promptText) {
  activeAiRequests++;
  showAiThinkingBanner();

  try {
    const customKey = getActiveApiKey();

    // If client provided a key directly
    if (customKey) {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${encodeURIComponent(customKey)}`;
      const payload = {
        contents: [{ parts: [{ text: promptText }] }],
        generationConfig: {
          response_mime_type: "application/json",
          temperature: 0.2
        }
      };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        const errMsg = errJson.error?.message || `HTTP ${res.status} error`;
        if (res.status === 429) {
          triggerDiagnosticsError(MODEL_NAME, "429: Quota Limit Exceeded", errMsg);
        } else if (res.status === 403 || res.status === 401) {
          triggerDiagnosticsError(MODEL_NAME, `${res.status}: Permission Denied`, errMsg);
        } else {
          triggerDiagnosticsError(MODEL_NAME, `HTTP ${res.status}`, errMsg);
        }
        throw new Error(errMsg);
      }

      const data = await res.json();
      const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawText) throw new Error("No response content from Gemini 3.8 Flash");
      return JSON.parse(rawText);
    }

    // If server has key configured, use server proxy
    if (hasServerKey) {
      const res = await fetch("/api/gemini", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: promptText }] }],
          generationConfig: {
            response_mime_type: "application/json",
            temperature: 0.2
          }
        })
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        const errMsg = errJson.error?.message || `HTTP ${res.status} proxy error`;
        if (res.status === 429) {
          triggerDiagnosticsError(MODEL_NAME, "429: Quota Limit Exceeded", errMsg);
        } else {
          triggerDiagnosticsError(MODEL_NAME, `HTTP ${res.status}`, errMsg);
        }
        throw new Error(errMsg);
      }

      const data = await res.json();
      const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawText) throw new Error("No response content from Gemini proxy");
      return JSON.parse(rawText);
    }

    // No API key configured at all -> prompt user via modal
    triggerDiagnosticsError(
      "", 
      "API_KEY_REQUIRED", 
      "Please paste your API Key to run appraisals."
    );
    throw new Error("Missing API Key");
  } finally {
    activeAiRequests--;
    hideAiThinkingBanner();
  }
}

// ============================================================================
// STORAGE & REAL-TIME PRICE CACHING ENGINE
// ============================================================================
function normalizeCatalogKey(str) {
  return (str || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

async function checkAlbumCache(query) {
  const normKey = normalizeCatalogKey(query);
  
  // 1. Check client-side storage cache first (0ms)
  try {
    const localRaw = localStorage.getItem(`vinyl_catalog_${normKey}`);
    if (localRaw) {
      const parsed = JSON.parse(localRaw);
      if (parsed && parsed.title) return parsed;
    }
  } catch (e) {}

  // 2. Check server-side persistent catalog storage
  try {
    const res = await fetch(`/api/catalog?q=${encodeURIComponent(query)}`);
    if (res.ok) {
      const data = await res.json();
      if (data.hit && data.album) {
        try {
          localStorage.setItem(`vinyl_catalog_${normKey}`, JSON.stringify(data.album));
        } catch (e) {}
        return data.album;
      }
    }
  } catch (e) {
    console.warn("Catalog storage lookup warning:", e);
  }

  return null;
}

// Convert image URL to base64 Data URL for persistent storage caching
async function imageUrlToDataUrl(url) {
  if (!url || typeof url !== 'string' || url.startsWith('data:')) return url;
  if (url.startsWith('/api/images/')) return null; // Already hosted from local storage
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || 400;
        canvas.height = img.naturalHeight || 400;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      } catch (e) {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

async function saveAlbumToCache(album) {
  if (!album || !album.title) return;
  const primaryKey = normalizeCatalogKey((album.artist || '') + ' ' + album.title);
  const titleKey = normalizeCatalogKey(album.title);

  // If album has coverUrl, attempt converting to base64 for persistent disk storage
  let imageData = null;
  if (album.coverUrl && !album.coverUrl.startsWith('/api/images/')) {
    imageData = await imageUrlToDataUrl(album.coverUrl).catch(() => null);
  }

  // 1. Save in server database & persistent storage
  try {
    const res = await fetch("/api/catalog", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...album,
        imageData: imageData
      })
    });
    if (res.ok) {
      const respData = await res.json();
      if (respData.coverUrl) {
        album.coverUrl = respData.coverUrl;
      }
    }
  } catch (e) {
    console.warn("Catalog storage save error:", e);
  }

  // 2. Save in client localStorage
  try {
    const payloadStr = JSON.stringify(album);
    localStorage.setItem(`vinyl_catalog_${primaryKey}`, payloadStr);
    if (titleKey) {
      localStorage.setItem(`vinyl_catalog_${titleKey}`, payloadStr);
    }
  } catch (e) {}
}

// Focused micro-call to Gemini specifically for real-time German vinyl prices
async function fetchRealTimePrices(albumTitle, artist) {
  const prompt = `You are a real-time vinyl market specialist in Germany.
Evaluate the current real-time street prices in EUR in Germany for vinyl record pressing:
Album: "${albumTitle}"
Artist: "${artist}"

Provide realistic current German market prices in EUR:
- New vinyl: Average price in Germany retail record stores (e.g. "€28 – €34").
- Used vinyl: Average second-hand price in Germany for VG+/EX condition (e.g. "€14 – €22").
- Condition note (short).

Return strictly a valid JSON object matching this schema:
{
  "streetPriceGermany": {
    "newEur": "€28 – €34",
    "usedEur": "€14 – €22",
    "conditionNote": "VG+ / EX condition"
  }
}`;

  try {
    const data = await callGeminiFlash(prompt);
    if (data && data.streetPriceGermany) {
      return data.streetPriceGermany;
    }
  } catch (err) {
    console.warn("Real-time price lookup error:", err);
  }
  return null;
}

// ============================================================================
// SESSION CONTINUITY ENGINE (REMEMBER LAST DISPLAYED ALBUM)
// ============================================================================
function recordLastDisplayedAlbum(query, album) {
  if (!album && !query) return;
  const sessionRecord = {
    query: query || (album?.artist ? `${album.artist} ${album.title}` : album?.title) || "",
    title: album?.title || "",
    artist: album?.artist || "",
    timestamp: Date.now()
  };

  // 1. Persist to client localStorage (survives page reloads & browser restarts)
  try {
    localStorage.setItem("vinyl_last_displayed_album", JSON.stringify(sessionRecord));
  } catch (e) {}

  // 2. Persist to server data/last_session.json (survives server restart & cross-device)
  try {
    fetch("/api/session/last-album", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sessionRecord)
    }).catch(() => {});
  } catch (e) {}
}

let hasRestoredSessionAlbum = false;

async function restoreLastSessionAlbum() {
  if (hasRestoredSessionAlbum) return;
  hasRestoredSessionAlbum = true;

  let target = null;

  // 1. Check client localStorage first (0ms instantaneous)
  try {
    const local = localStorage.getItem("vinyl_last_displayed_album");
    if (local) {
      target = JSON.parse(local);
    }
  } catch (e) {}

  // 2. Fallback to server data/last_session.json (if cookies cleared or server restarted)
  if (!target || (!target.query && !target.title)) {
    try {
      const res = await fetch("/api/session/last-album");
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.lastAlbum && (data.lastAlbum.query || data.lastAlbum.title)) {
          target = data.lastAlbum;
        }
      }
    } catch (e) {}
  }

  if (target && (target.query || target.title)) {
    const displayLabel = (target.artist && target.title)
      ? `${target.artist} - ${target.title}`
      : (target.title || target.query);

    if (albumInput) {
      albumInput.value = displayLabel;
    }

    const appraisalQuery = target.query || `${target.artist || ''} ${target.title || ''}`.trim();
    if (appraisalQuery) {
      // Appraise album: loads immediately from persistent storage catalog
      appraiseAlbum(appraisalQuery);
    }
  }
}

async function appraiseAlbum(albumName) {
  if (!albumName || !albumName.trim()) return;

  if (albumInput && !albumInput.value) {
    albumInput.value = albumName;
  }

  loadingState.classList.remove("hidden");
  resultsSection.classList.add("hidden");

  // =========================================================================
  // STEP 1: CHECK STORAGE DATABASE (CACHE HIT -> 0ms LOAD)
  // =========================================================================
  const cached = await checkAlbumCache(albumName);

  if (cached) {
    loadingState.classList.add("hidden");
    resultsSection.classList.remove("hidden");

    // Instantly load all static information from database
    albumTitleEl.textContent = cached.title;
    albumArtistEl.textContent = cached.artist;
    albumGenreEl.textContent = cached.genre || "Vinyl";
    albumYearEl.textContent = cached.year || "";
    albumPlaytimeEl.textContent = cached.playtime || "N/A";
    albumTracksEl.textContent = `${cached.trackCount || 0} tracks`;

    // Immediate image from storage
    albumCoverImg.src = cached.coverUrl || generateSvgCover(cached.title, cached.artist);

    // Load Track 1 YouTube Listening Station below fav heart
    loadYouTubeTrack1(cached.artist, cached.title, cached.firstTrackTitle, cached.youtubeVideoId).then(vId => {
      if (vId && !cached.youtubeVideoId) {
        cached.youtubeVideoId = vId;
        saveAlbumToCache(cached);
      }
    });

    // Initial real-time pricing pulse
    priceNewEl.innerHTML = `<span class="links-loading-pulse">⚡ Live pricing...</span>`;
    priceNewNoteEl.textContent = "Checking German retail reissues";
    linksNewEl.innerHTML = `<span class="links-loading-pulse">🔍 Resolving German shops...</span>`;

    priceUsedEl.innerHTML = `<span class="links-loading-pulse">⚡ Live pricing...</span>`;
    priceUsedNoteEl.textContent = "Checking second-hand collector markets";
    linksUsedEl.innerHTML = `<span class="links-loading-pulse">🔍 Searching second-hand markets...</span>`;

    currentAlbumData = {
      title: cached.title,
      artist: cached.artist,
      genre: cached.genre,
      year: cached.year,
      playtime: cached.playtime,
      trackCount: cached.trackCount,
      coverUrl: albumCoverImg.src,
      streetPriceGermany: null
    };

    heroFavBtn.classList.toggle("active", isFavorited(cached.title, cached.artist));

    // Render cached alternatives immediately from database
    alternativesGenreName.textContent = cached.genre || "";
    renderAlternativesProgressive(cached.alternatives || []);

    // Async stream in store search links
    asyncResearchBuyLinks(cached.title, cached.artist);

    // Async fetch ONLY real-time prices live
    fetchRealTimePrices(cached.title, cached.artist).then(freshPrices => {
      if (freshPrices) {
        priceNewEl.textContent = freshPrices.newEur || "€29";
        priceNewNoteEl.textContent = "German retail reissue";
        priceUsedEl.textContent = freshPrices.usedEur || "€15";
        priceUsedNoteEl.textContent = freshPrices.conditionNote || "VG+ / EX condition";
        if (currentAlbumData) {
          currentAlbumData.streetPriceGermany = freshPrices;
        }
      } else {
        priceNewEl.textContent = "€29";
        priceUsedEl.textContent = "€15";
      }
    });

    // Save to user memory bank
    saveSearchToMemory({
      title: cached.title,
      artist: cached.artist,
      genre: cached.genre,
      year: cached.year,
      playtime: cached.playtime,
      trackCount: cached.trackCount,
      coverUrl: albumCoverImg.src,
      timestamp: Date.now()
    });

    // Remember last displayed album across sessions & server restarts
    recordLastDisplayedAlbum(albumName, cached);

    return;
  }

  // =========================================================================
  // STEP 2: CACHE MISS -> FULL APPRAISAL & WRITE TO STORAGE
  // =========================================================================
  const prompt = `You are an expert vinyl record specialist and discographer in Germany.
Evaluate this album for vinyl collectors: "${albumName}".
Provide accurate information in Germany for vinyl pressings:
1. Exact album title and artist.
2. Title of the very first song (track 1) on the album.
3. Primary musical genre & release year.
4. Total playtime (e.g. "47 min 23 sec").
5. Total number of tracks/songs (integer).
6. Realistic German vinyl market street prices:
   - New vinyl: Average price in Germany retail record stores in EUR (e.g., "€28 – €34").
   - Used vinyl: Average second-hand price in Germany (Flohmärkte, Discogs DE, local shops) in EUR for a VG+/EX copy (e.g., "€14 – €22").
   - Short condition notes.
7. 3 alternative vinyl albums in the exact same or closely related genre that fans would love. Include for each: title, artist, genre, playtime, number of tracks/songs, new vinyl price in Germany (EUR), used vinyl price in Germany (EUR).
8. Concise search term for album cover lookup (artist + album title).

Return strictly a valid JSON object matching this schema:
{
  "album": {
    "title": "string",
    "artist": "string",
    "firstTrackTitle": "First song title on the album (track 1)",
    "genre": "string",
    "year": 1969,
    "playtime": "string",
    "trackCount": 17,
    "streetPriceGermany": {
      "newEur": "€28 – €34",
      "usedEur": "€14 – €22",
      "conditionNote": "Used VG+/EX"
    },
    "coverSearchTerm": "The Beatles Abbey Road"
  },
  "alternatives": [
    {
      "title": "string",
      "artist": "string",
      "genre": "string",
      "playtime": "string",
      "trackCount": 12,
      "streetPriceGermany": {
        "newEur": "€26 – €32",
        "usedEur": "€12 – €18"
      },
      "coverSearchTerm": "Artist Album"
    }
  ]
}`;

  try {
    const data = await callGeminiFlash(prompt);
    const album = data.album;
    const alternatives = data.alternatives || [];

    // =========================================================================
    // PHASE 1: IMMEDIATE UI RENDER (Album Info & Core Specs Visible Instantly)
    // =========================================================================
    loadingState.classList.add("hidden");
    resultsSection.classList.remove("hidden");

    albumTitleEl.textContent = album.title;
    albumArtistEl.textContent = album.artist;
    albumGenreEl.textContent = album.genre || "Vinyl";
    albumYearEl.textContent = album.year || "";
    albumPlaytimeEl.textContent = album.playtime || "N/A";
    albumTracksEl.textContent = `${album.trackCount || 0} tracks`;

    priceNewEl.textContent = album.streetPriceGermany?.newEur || "€29";
    priceNewNoteEl.textContent = "German retail reissue";
    linksNewEl.innerHTML = `<span class="links-loading-pulse">🔍 Finding German retail links...</span>`;

    priceUsedEl.textContent = album.streetPriceGermany?.usedEur || "€15";
    priceUsedNoteEl.textContent = album.streetPriceGermany?.conditionNote || "VG+ / EX condition";
    linksUsedEl.innerHTML = `<span class="links-loading-pulse">🔍 Searching second-hand markets...</span>`;

    // Instant sleeve artwork with asynchronous high-res enhancement
    albumCoverImg.src = generateSvgCover(album.title, album.artist);
    
    currentAlbumData = {
      title: album.title,
      artist: album.artist,
      genre: album.genre,
      year: album.year,
      playtime: album.playtime,
      trackCount: album.trackCount,
      coverUrl: albumCoverImg.src,
      streetPriceGermany: album.streetPriceGermany
    };

    heroFavBtn.classList.toggle("active", isFavorited(album.title, album.artist));

    // Load Track 1 YouTube Listening Station below fav heart
    loadYouTubeTrack1(album.artist, album.title, album.firstTrackTitle).then(vId => {
      if (vId) {
        album.youtubeVideoId = vId;
        saveAlbumToCache({
          title: album.title,
          artist: album.artist,
          genre: album.genre,
          year: album.year,
          playtime: album.playtime,
          trackCount: album.trackCount,
          firstTrackTitle: album.firstTrackTitle,
          youtubeVideoId: vId,
          coverUrl: albumCoverImg.src,
          alternatives: alternatives
        });
      }
    });

    // Save initial record to database
    saveAlbumToCache({
      title: album.title,
      artist: album.artist,
      genre: album.genre,
      year: album.year,
      playtime: album.playtime,
      trackCount: album.trackCount,
      firstTrackTitle: album.firstTrackTitle,
      youtubeVideoId: album.youtubeVideoId || '',
      coverUrl: albumCoverImg.src,
      alternatives: alternatives
    });

    fetchAlbumCover(album.coverSearchTerm || album.title, album.artist, album.title).then(highRes => {
      if (highRes) {
        albumCoverImg.src = highRes;
        if (currentAlbumData && currentAlbumData.title === album.title) {
          currentAlbumData.coverUrl = highRes;
        }
        // Save complete record with high-res image to storage database
        saveAlbumToCache({
          title: album.title,
          artist: album.artist,
          genre: album.genre,
          year: album.year,
          playtime: album.playtime,
          trackCount: album.trackCount,
          firstTrackTitle: album.firstTrackTitle,
          youtubeVideoId: album.youtubeVideoId || '',
          coverUrl: highRes,
          alternatives: alternatives
        });
      }
    });

    alternativesGenreName.textContent = album.genre || "";
    renderAlternativesProgressive(alternatives);

    // =========================================================================
    // PHASE 2: ASYNC MARKET RESEARCH & STORE LINKS
    // =========================================================================
    asyncResearchBuyLinks(album.title, album.artist);

    // =========================================================================
    // PHASE 3: BACKGROUND MEMORY BANK LOGGING
    // =========================================================================
    saveSearchToMemory({
      title: album.title,
      artist: album.artist,
      genre: album.genre,
      year: album.year,
      playtime: album.playtime,
      trackCount: album.trackCount,
      coverUrl: albumCoverImg.src,
      timestamp: Date.now()
    });

    // Remember last displayed album across sessions & server restarts
    recordLastDisplayedAlbum(albumName, album);

  } catch (error) {
    console.error("Appraisal failed:", error);
    loadingState.classList.add("hidden");
  }
}

// Asynchronously research and stream in store links with tactile transitions
async function asyncResearchBuyLinks(title, artist) {
  // Staggered resolution for smooth streaming appearance
  await new Promise(resolve => setTimeout(resolve, 300));
  const newLinks = getNewVinylLinks(title, artist);
  linksNewEl.innerHTML = newLinks.map(link => `
    <a href="${link.url}" target="_blank" rel="noopener noreferrer" class="buy-link-pill fade-in" title="Buy new on ${escapeXml(link.name)}">
      ${escapeXml(link.name)} <span class="arrow-icon">↗</span>
    </a>
  `).join("");

  await new Promise(resolve => setTimeout(resolve, 200));
  const usedLinks = getUsedVinylLinks(title, artist);
  linksUsedEl.innerHTML = usedLinks.map(link => `
    <a href="${link.url}" target="_blank" rel="noopener noreferrer" class="buy-link-pill fade-in" title="Buy used on ${escapeXml(link.name)}">
      ${escapeXml(link.name)} <span class="arrow-icon">↗</span>
    </a>
  `).join("");
}

// Render skeleton placeholders first, then pop in cards as artwork resolves
function renderAlternativesProgressive(alternatives) {
  alternativesGrid.innerHTML = [1, 2, 3].map(() => `
    <div class="alt-card-skeleton">
      <div class="skeleton-box skeleton-cover"></div>
      <div class="skeleton-box skeleton-title"></div>
      <div class="skeleton-box skeleton-artist"></div>
      <div class="skeleton-box skeleton-meta"></div>
    </div>
  `).join("");

  const skeletons = Array.from(alternativesGrid.querySelectorAll(".alt-card-skeleton"));

  alternatives.slice(0, 3).forEach(async (alt, idx) => {
    try {
      const coverUrl = (alt.coverUrl && !alt.coverUrl.startsWith("data:image/svg"))
        ? alt.coverUrl
        : await fetchAlbumCover(alt.coverSearchTerm || alt.title, alt.artist, alt.title);
      alt.coverUrl = coverUrl;

      // Persist alternative record to storage database so subsequent lookups hit storage immediately
      saveAlbumToCache({
        title: alt.title,
        artist: alt.artist || '',
        genre: alt.genre || '',
        playtime: alt.playtime || '',
        trackCount: alt.trackCount || 0,
        coverUrl: coverUrl,
        alternatives: []
      });

      const card = document.createElement("div");
      card.className = "alt-card fade-in";

      const newAltLink = `https://www.jpc.de/s/${encodeURIComponent(alt.artist + ' ' + alt.title)}`;
      const usedAltLink = `https://www.discogs.com/sell/list?q=${encodeURIComponent(alt.artist + ' ' + alt.title)}&format=Vinyl`;

      const isFav = isFavorited(alt.title, alt.artist);

      card.innerHTML = `
        <div class="alt-cover-wrap" style="position: relative;">
          <img class="alt-cover-img" src="${coverUrl}" alt="${escapeXml(alt.title)}" loading="lazy" />
          <button class="alt-fav-btn ${isFav ? 'active' : ''}" type="button" data-title="${escapeXml(alt.title)}" data-artist="${escapeXml(alt.artist)}" title="Favorite this alternative">
            <svg viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
          </button>
        </div>
        <div class="alt-details">
          <h4 class="alt-title" title="${escapeXml(alt.title)}">${escapeXml(alt.title)}</h4>
          <span class="alt-artist" title="${escapeXml(alt.artist)}">${escapeXml(alt.artist)}</span>
        </div>
        <div class="alt-meta-row">
          <span>⏱️ ${escapeXml(alt.playtime || 'N/A')}</span>
          <span>🎵 ${alt.trackCount || 0} songs</span>
        </div>
        <div class="alt-pricing-row">
          <div class="alt-price-col">
            <span class="alt-price-tag">New (DE)</span>
            <span class="alt-price-val new">${escapeXml(alt.streetPriceGermany?.newEur || '€28')}</span>
          </div>
          <div class="alt-price-col">
            <span class="alt-price-tag">Used (DE)</span>
            <span class="alt-price-val used">${escapeXml(alt.streetPriceGermany?.usedEur || '€14')}</span>
          </div>
        </div>
        <div class="alt-buy-links">
          <a href="${newAltLink}" target="_blank" rel="noopener noreferrer" class="alt-buy-link" onclick="event.stopPropagation()" title="Buy new on jpc.de">
            jpc.de ↗
          </a>
          <a href="${usedAltLink}" target="_blank" rel="noopener noreferrer" class="alt-buy-link" onclick="event.stopPropagation()" title="Buy used on Discogs">
            Discogs ↗
          </a>
        </div>
      `;

      // Wire heart button on alternative
      const altFavBtn = card.querySelector(".alt-fav-btn");
      if (altFavBtn) {
        altFavBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          toggleFavorite({
            title: alt.title,
            artist: alt.artist,
            genre: alt.genre,
            playtime: alt.playtime,
            trackCount: alt.trackCount,
            coverUrl: coverUrl,
            streetPriceGermany: alt.streetPriceGermany
          });
        });
      }

      // Auto-healing: If alternative cover fails to load from storage, retrieve from internet
      const altImg = card.querySelector(".alt-cover-img");
      if (altImg) {
        altImg.addEventListener("error", async () => {
          if (altImg.dataset.recovering) return;
          altImg.dataset.recovering = "true";
          console.warn(`[storage] Alternative cover failed for "${alt.title}", retrieving from internet...`);
          try {
            const fresh = await fetchAlbumCover(alt.coverSearchTerm || alt.title, alt.artist, alt.title);
            if (fresh && !fresh.startsWith("data:image/svg")) {
              altImg.src = fresh;
              alt.coverUrl = fresh;
              if (currentAlbumData) {
                saveAlbumToCache(currentAlbumData);
              }
            } else {
              altImg.src = generateSvgCover(alt.title, alt.artist);
            }
          } catch (e) {}
        });
      }

      card.addEventListener("click", () => {
        card.classList.add("card-loading-active");
        showAiThinkingBanner();
        albumInput.value = `${alt.artist} - ${alt.title}`;
        appraiseAlbum(`${alt.artist} ${alt.title}`);
        window.scrollTo({ top: 0, behavior: "smooth" });
        setTimeout(() => { card.classList.remove("card-loading-active"); }, 2500);
      });

      if (skeletons[idx] && skeletons[idx].parentNode) {
        skeletons[idx].parentNode.replaceChild(card, skeletons[idx]);
      } else {
        alternativesGrid.appendChild(card);
      }
    } catch (e) {
      console.warn("Alternative load error:", e);
    }
  });
}

// ============================================================================
// 8. USER MEMORY BANK & 5-SEARCH RECOMMENDATIONS CAROUSEL
// ============================================================================
function getMemoryStorageKey() {
  return currentUser ? `vinyl_tipper_searches_${currentUser.uid}` : "vinyl_tipper_searches_guest";
}

function loadUserMemory() {
  const key = getMemoryStorageKey();
  try {
    const raw = localStorage.getItem(key);
    userSearches = raw ? JSON.parse(raw) : [];
  } catch (e) {
    userSearches = [];
  }

  updateMemoryUI();

  // If returning user has >= 5 searches, generate recommendations
  if (userSearches.length >= 5) {
    generateRecommendations();
  }
}

function saveSearchToMemory(searchRecord) {
  // Prevent duplicate consecutive entries
  const exists = userSearches.find(
    s => s.title.toLowerCase() === searchRecord.title.toLowerCase() && 
         s.artist.toLowerCase() === searchRecord.artist.toLowerCase()
  );

  if (!exists) {
    userSearches.unshift(searchRecord);
    if (userSearches.length > 50) userSearches.pop(); // keep last 50
    localStorage.setItem(getMemoryStorageKey(), JSON.stringify(userSearches));
  }

  updateMemoryUI();

  if (userSearches.length >= 5) {
    generateRecommendations();
  }
}

function updateMemoryUI() {
  const count = userSearches.length;
  counterValueEl.textContent = `${count} / 5`;

  // Update dots
  const dots = counterDotsEl.querySelectorAll(".dot");
  dots.forEach((dot, index) => {
    if (index < Math.min(count, 5)) {
      dot.classList.add("filled");
    } else {
      dot.classList.remove("filled");
    }
  });

  // Progress message in locked state
  if (count < 5) {
    recLockedBanner.classList.remove("hidden");
    recCarouselContainer.classList.add("hidden");
    const remaining = 5 - count;
    lockedProgressMsg.textContent = `Search ${remaining} more album${remaining === 1 ? '' : 's'} to unlock your personalized vinyl crate recommendations.`;
  } else {
    recLockedBanner.classList.add("hidden");
    recCarouselContainer.classList.remove("hidden");
  }
}

// Generate Personalized Vinyl Recommendations (Covers Only)
async function generateRecommendations() {
  if (userSearches.length < 5) return;

  const sampleSearches = userSearches.slice(0, 10).map(s => `${s.artist} - ${s.title} (${s.genre})`).join("; ");

  const recPrompt = `The user is an avid vinyl record collector in Germany with this recent search history:
${sampleSearches}

Based on this musical taste profile, recommend 8 curated must-have vinyl albums for their collection crate.
Return strictly a valid JSON object:
{
  "recommendations": [
    {
      "title": "string",
      "artist": "string",
      "genre": "string",
      "coverSearchTerm": "Artist Album"
    }
  ]
}`;

  try {
    const data = await callGeminiFlash(recPrompt);
    const recs = data.recommendations || [];
    await renderRecommendationCarousel(recs);
  } catch (err) {
    console.warn("Could not generate recommendations yet:", err);
  }
}

// Render Vinyl Covers Only in Bottom Carousel (User Requirement)
async function renderRecommendationCarousel(recs) {
  recTrack.innerHTML = "";

  for (const item of recs) {
    const coverUrl = await fetchAlbumCover(item.coverSearchTerm || item.title, item.artist, item.title);

    const coverEl = document.createElement("div");
    coverEl.className = "rec-cover-item";
    coverEl.setAttribute("data-tooltip", `${item.artist} — ${item.title}`);

    coverEl.innerHTML = `
      <img class="rec-cover-img" src="${coverUrl}" alt="${escapeXml(item.title)}" loading="lazy" />
      <div class="rec-cover-disc-hint"></div>
    `;

    // Clicking a vinyl cover flips/loads that album into main appraiser
    coverEl.addEventListener("click", () => {
      coverEl.classList.add("card-loading-active");
      showAiThinkingBanner();
      albumInput.value = `${item.artist} - ${item.title}`;
      appraiseAlbum(`${item.artist} ${item.title}`);
      window.scrollTo({ top: 0, behavior: "smooth" });
      setTimeout(() => { coverEl.classList.remove("card-loading-active"); }, 2500);
    });

    recTrack.appendChild(coverEl);
  }
}

// Carousel Scroll Navigation
recPrevBtn.addEventListener("click", () => {
  recCarouselContainer.scrollBy({ left: -340, behavior: "smooth" });
});

recNextBtn.addEventListener("click", () => {
  recCarouselContainer.scrollBy({ left: 340, behavior: "smooth" });
});

// ============================================================================
// 9. EVENT LISTENERS & CHIPS
// ============================================================================
searchForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const query = albumInput.value.trim();
  if (query) {
    showAiThinkingBanner();
    appraiseAlbum(query);
  }
});

document.querySelectorAll(".chip").forEach(chip => {
  chip.addEventListener("click", () => {
    showAiThinkingBanner();
    const album = chip.getAttribute("data-album");
    albumInput.value = album;
    appraiseAlbum(album);
  });
});

// ============================================================================
// 10. PERSISTENT FAVORITES SYSTEM ("MY FAV VINYL")
// ============================================================================
function getFavsStorageKey() {
  return currentUser ? `vinyl_tipper_favs_${currentUser.uid}` : "vinyl_tipper_favs_guest";
}

function loadUserFavorites() {
  const key = getFavsStorageKey();
  try {
    const raw = localStorage.getItem(key);
    userFavorites = raw ? JSON.parse(raw) : [];
  } catch (e) {
    userFavorites = [];
  }
  updateFavsUI();
}

function saveUserFavorites() {
  const key = getFavsStorageKey();
  localStorage.setItem(key, JSON.stringify(userFavorites));
  updateFavsUI();
}

function isFavorited(title, artist) {
  if (!title) return false;
  return userFavorites.some(
    f => f.title.toLowerCase() === title.toLowerCase() && 
         (artist ? f.artist.toLowerCase() === artist.toLowerCase() : true)
  );
}

function toggleFavorite(album) {
  if (!album || !album.title) return;
  const index = userFavorites.findIndex(
    f => f.title.toLowerCase() === album.title.toLowerCase() &&
         (album.artist ? f.artist.toLowerCase() === album.artist.toLowerCase() : true)
  );

  if (index >= 0) {
    userFavorites.splice(index, 1);
  } else {
    userFavorites.unshift({
      title: album.title,
      artist: album.artist || "",
      genre: album.genre || "",
      year: album.year || "",
      playtime: album.playtime || "",
      trackCount: album.trackCount || 0,
      coverUrl: album.coverUrl || "",
      streetPriceGermany: album.streetPriceGermany || null,
      timestamp: Date.now()
    });
  }

  saveUserFavorites();
}

function updateFavsUI() {
  const count = userFavorites.length;
  if (count > 0) {
    favsCountBadge.textContent = count;
    favsCountBadge.classList.remove("hidden");
  } else {
    favsCountBadge.classList.add("hidden");
  }

  // 5 Vinyl Recommendations button (Unlocked once user has 3+ fav saves)
  if (favRecsBtn) {
    if (count >= 3) {
      favRecsBtn.classList.remove("hidden");
    } else {
      favRecsBtn.classList.add("hidden");
    }
  }

  if (favsDrawerCount) {
    favsDrawerCount.textContent = `${count} album${count === 1 ? '' : 's'}`;
  }

  if (recsDrawerSubtitle) {
    recsDrawerSubtitle.textContent = `Derived from your ${count} saved favorites`;
  }

  // Update hero button state if current album is loaded
  if (currentAlbumData) {
    const active = isFavorited(currentAlbumData.title, currentAlbumData.artist);
    heroFavBtn.classList.toggle("active", active);
  }

  // Update alternative card buttons
  document.querySelectorAll(".alt-fav-btn").forEach(btn => {
    const title = btn.getAttribute("data-title");
    const artist = btn.getAttribute("data-artist");
    btn.classList.toggle("active", isFavorited(title, artist));
  });

  renderFavsDrawerList();
}

function renderFavsDrawerList() {
  if (!favsDrawerList) return;

  if (userFavorites.length === 0) {
    favsDrawerList.innerHTML = `
      <div class="favs-empty-state">
        <span class="favs-empty-icon">🤍</span>
        <p class="favs-empty-text">No favorites saved yet. Click the heart on any album or alternative to keep it in your personal crate!</p>
      </div>
    `;
    return;
  }

  favsDrawerList.innerHTML = "";
  userFavorites.forEach(fav => {
    const card = document.createElement("div");
    card.className = "fav-card fade-in";
    const cover = fav.coverUrl || generateSvgCover(fav.title, fav.artist);

    card.innerHTML = `
      <img class="fav-card-cover" src="${cover}" alt="${escapeXml(fav.title)}" />
      <div class="fav-card-info">
        <h4 class="fav-card-title">${escapeXml(fav.title)}</h4>
        <span class="fav-card-artist">${escapeXml(fav.artist)}</span>
        <div class="fav-card-meta">
          <span>${escapeXml(fav.genre || 'Vinyl')}</span>
          ${fav.playtime ? `<span>• ⏱️ ${escapeXml(fav.playtime)}</span>` : ''}
        </div>
      </div>
      <button class="fav-card-remove-btn" type="button" title="Remove from favorites">&times;</button>
    `;

    // Clicking card opens appraisal in main view
    card.addEventListener("click", (e) => {
      if (e.target.closest(".fav-card-remove-btn")) return;
      favsDrawerContainer.classList.add("hidden");
      showAiThinkingBanner();
      albumInput.value = `${fav.artist} - ${fav.title}`;
      appraiseAlbum(`${fav.artist} ${fav.title}`);
      window.scrollTo({ top: 0, behavior: "smooth" });
    });

    // Remove button click
    card.querySelector(".fav-card-remove-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      toggleFavorite(fav);
    });

    favsDrawerList.appendChild(card);
  });
}

// Hero Heart Toggle Click
heroFavBtn.addEventListener("click", () => {
  if (currentAlbumData) {
    toggleFavorite(currentAlbumData);
  }
});

// Favorites Drawer Controls
favsBtn.addEventListener("click", () => {
  favsDrawerContainer.classList.remove("hidden");
});

closeFavsDrawerBtn.addEventListener("click", () => {
  favsDrawerContainer.classList.add("hidden");
});

favsDrawerBackdrop.addEventListener("click", () => {
  favsDrawerContainer.classList.add("hidden");
});

// ============================================================================
// 11. CURATED VINYL RECOMMENDATIONS (3+ FAVORITES UNLOCKED POP-UP MODAL)
// ============================================================================
async function openFavoritesRecommendations() {
  if (userFavorites.length < 3) return;
  favRecsModalContainer.classList.remove("hidden");

  if (recsModalSubtitle) {
    recsModalSubtitle.textContent = `Derived from your ${userFavorites.length} saved favorites`;
  }

  const currentSig = userFavorites.map(f => `${f.title}:${f.artist}`).sort().join("|");
  if (cachedFavRecs.length > 0 && lastFavsSignature === currentSig) {
    recsModalLoading.classList.add("hidden");
    favRecsList.classList.remove("hidden");
    renderFavoritesRecommendations();
    return;
  }

  await generateFavoritesRecommendations();
}

async function generateFavoritesRecommendations() {
  if (userFavorites.length < 3) return;

  const currentSig = userFavorites.map(f => `${f.title}:${f.artist}`).sort().join("|");

  // Show dedicated modal loading state displaying:
  // "Getting your personalized recommendations based on your saved albums"
  recsModalLoading.classList.remove("hidden");
  favRecsList.classList.add("hidden");
  expandRecsBtn.classList.add("hidden");

  const favsSummary = userFavorites.map((f, i) => `${i + 1}. "${f.title}" by ${f.artist || 'Unknown'} (${f.genre || 'Vinyl'}${f.year ? ', ' + f.year : ''})`).join("\n");

  const prompt = `You are a legendary German vinyl crate-digger and record connoisseur curator.
The user has saved these favorite records in their personal vinyl collection:
${favsSummary}

Synthesize the musical taste, sonic aesthetic, instrumentation, production qualities, and genre intersections across ALL these saved favorite albums.
Recommend exactly 10 vinyl records that would be must-haves for their physical record shelf.

For each of the 10 recommendations, provide:
1. "title": Exact album title.
2. "artist": Exact artist name.
3. "genre": Musical genre / sub-genre.
4. "year": Release year (number).
5. "score": Integer from 75 to 100 representing how strongly this vinyl matches and complements their specific collection of favorites. Rank from highest match score to lower.
6. "matchReason": 1 to 2 sentences explaining why this vinyl is a good match, explicitly connecting back to the artists, genres, or production aesthetics in their saved favorites.
7. "playtime": Total album runtime (e.g. "44 min").
8. "trackCount": Number of tracks (integer).
9. "streetPriceGermany": { "newEur": "€28 – €34", "usedEur": "€14 – €22" } realistic German vinyl market prices in EUR.
10. "coverSearchTerm": Search query for album sleeve artwork (Artist Album).

Return strictly a valid JSON object matching this schema:
{
  "recommendations": [
    {
      "title": "string",
      "artist": "string",
      "genre": "string",
      "year": 1975,
      "score": 98,
      "matchReason": "string",
      "playtime": "string",
      "trackCount": 10,
      "streetPriceGermany": {
        "newEur": "€28 – €34",
        "usedEur": "€14 – €22"
      },
      "coverSearchTerm": "Artist Album"
    }
  ]
}`;

  try {
    const data = await callGeminiFlash(prompt);
    if (data && Array.isArray(data.recommendations) && data.recommendations.length > 0) {
      cachedFavRecs = data.recommendations;
      lastFavsSignature = currentSig;
      isRecsExpanded = false;
      recsModalLoading.classList.add("hidden");
      favRecsList.classList.remove("hidden");
      renderFavoritesRecommendations();
    } else {
      throw new Error("No recommendations returned");
    }
  } catch (err) {
    console.error("Failed to generate recommendations:", err);
    recsModalLoading.classList.add("hidden");
    favRecsList.classList.remove("hidden");
    favRecsList.innerHTML = `
      <div class="favs-empty-state">
        <span class="favs-empty-icon">⚠️</span>
        <p class="favs-empty-text">Unable to curate recommendations right now. Please try again in a moment.</p>
      </div>
    `;
  }
}

function renderFavoritesRecommendations() {
  if (!favRecsList) return;

  const countToShow = isRecsExpanded ? Math.min(10, cachedFavRecs.length) : Math.min(5, cachedFavRecs.length);
  const items = cachedFavRecs.slice(0, countToShow);

  favRecsList.innerHTML = "";

  items.forEach((rec) => {
    const card = document.createElement("div");
    card.className = "rec-card fade-in";

    const isFav = isFavorited(rec.title, rec.artist);
    const scoreVal = Math.min(100, Math.max(0, rec.score || 95));

    card.innerHTML = `
      <div class="rec-card-top">
        <img class="rec-card-cover" src="${rec.coverUrl || generateSvgCover(rec.title, rec.artist)}" alt="${escapeXml(rec.title)}" loading="lazy" />
        <div class="rec-card-main">
          <div class="rec-card-header-row">
            <h4 class="rec-card-title" title="${escapeXml(rec.title)}">${escapeXml(rec.title)}</h4>
            <span class="rec-score-pill" title="Affinity match score: ${scoreVal}/100">
              🎯 ${scoreVal}/100
            </span>
          </div>
          <span class="rec-card-artist">${escapeXml(rec.artist)}</span>
          <div class="rec-card-meta">
            <span>${escapeXml(rec.genre || 'Vinyl')}</span>
            ${rec.year ? `<span>• ${rec.year}</span>` : ''}
            ${rec.playtime ? `<span>• ⏱️ ${escapeXml(rec.playtime)}</span>` : ''}
            ${rec.trackCount ? `<span>• 🎵 ${rec.trackCount} songs</span>` : ''}
          </div>
        </div>
      </div>

      <div class="rec-match-box">
        <strong>Why it's a good match:</strong> ${escapeXml(rec.matchReason || 'Matches the sonic aesthetic and songwriting style in your collection.')}
      </div>

      <div class="rec-card-bottom">
        <div class="rec-pricing-tags">
          <div class="rec-price-item">
            <span class="rec-price-label">New (DE)</span>
            <span class="rec-price-val">${escapeXml(rec.streetPriceGermany?.newEur || '€28')}</span>
          </div>
          <div class="rec-price-item">
            <span class="rec-price-label">Used (DE)</span>
            <span class="rec-price-val">${escapeXml(rec.streetPriceGermany?.usedEur || '€15')}</span>
          </div>
        </div>
        <div class="rec-card-actions">
          <button class="rec-inspect-btn" type="button" title="Appraise this record">
            Appraise ↗
          </button>
          <button class="rec-fav-btn ${isFav ? 'active' : ''}" type="button" title="Favorite this vinyl">
            <svg viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
          </button>
        </div>
      </div>
    `;

    // Fetch and cache high-res sleeve cover asynchronously
    if (!rec.coverUrl || rec.coverUrl.startsWith("data:image/svg")) {
      fetchAlbumCover(rec.coverSearchTerm || rec.title, rec.artist, rec.title).then(cover => {
        if (cover) {
          rec.coverUrl = cover;
          const coverImg = card.querySelector(".rec-card-cover");
          if (coverImg) coverImg.src = cover;
          // Save recommended album & cover to persistent storage catalog
          saveAlbumToCache({
            title: rec.title,
            artist: rec.artist,
            genre: rec.genre,
            year: rec.year,
            playtime: rec.playtime,
            trackCount: rec.trackCount,
            coverUrl: cover,
            alternatives: []
          });
        }
      });
    }

    // Appraise button or clicking title/cover loads album in main view and closes modal
    const triggerAppraisal = () => {
      favRecsModalContainer.classList.add("hidden");
      showAiThinkingBanner();
      albumInput.value = `${rec.artist} - ${rec.title}`;
      appraiseAlbum(`${rec.artist} ${rec.title}`);
      window.scrollTo({ top: 0, behavior: "smooth" });
    };

    const inspectBtn = card.querySelector(".rec-inspect-btn");
    if (inspectBtn) inspectBtn.addEventListener("click", triggerAppraisal);
    const titleEl = card.querySelector(".rec-card-title");
    if (titleEl) titleEl.addEventListener("click", triggerAppraisal);

    const recCoverImg = card.querySelector(".rec-card-cover");
    if (recCoverImg) {
      recCoverImg.addEventListener("click", triggerAppraisal);
      recCoverImg.addEventListener("error", async () => {
        if (recCoverImg.dataset.recovering) return;
        recCoverImg.dataset.recovering = "true";
        console.warn(`[storage] Recommendation cover failed for "${rec.title}", retrieving from internet...`);
        try {
          const fresh = await fetchAlbumCover(rec.coverSearchTerm || rec.title, rec.artist, rec.title);
          if (fresh && !fresh.startsWith("data:image/svg")) {
            recCoverImg.src = fresh;
            rec.coverUrl = fresh;
            saveAlbumToCache(rec);
          } else {
            recCoverImg.src = generateSvgCover(rec.title, rec.artist);
          }
        } catch (e) {}
      });
    }

    // Heart toggle button on recommendation card
    card.querySelector(".rec-fav-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      toggleFavorite({
        title: rec.title,
        artist: rec.artist,
        genre: rec.genre,
        year: rec.year,
        playtime: rec.playtime,
        trackCount: rec.trackCount,
        coverUrl: rec.coverUrl || "",
        streetPriceGermany: rec.streetPriceGermany
      });
      const newFavState = isFavorited(rec.title, rec.artist);
      card.querySelector(".rec-fav-btn").classList.toggle("active", newFavState);
    });

    favRecsList.appendChild(card);
  });

  // Expand / Collapse button state
  if (cachedFavRecs.length > 5) {
    expandRecsBtn.classList.remove("hidden");
    expandRecsBtn.textContent = isRecsExpanded ? "Show Top 5 ▲" : "Expand to 10 Recommendations ▼";
  } else {
    expandRecsBtn.classList.add("hidden");
  }
}

// Curated Recommendations Pop-up Modal controls
if (favRecsBtn) {
  favRecsBtn.addEventListener("click", openFavoritesRecommendations);
}

if (closeFavRecsModalBtn) {
  closeFavRecsModalBtn.addEventListener("click", () => {
    favRecsModalContainer.classList.add("hidden");
  });
}

if (favRecsModalBackdrop) {
  favRecsModalBackdrop.addEventListener("click", () => {
    favRecsModalContainer.classList.add("hidden");
  });
}

// Close pop-up modal on Escape key press
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && favRecsModalContainer && !favRecsModalContainer.classList.contains("hidden")) {
    favRecsModalContainer.classList.add("hidden");
  }
});

if (expandRecsBtn) {
  expandRecsBtn.addEventListener("click", () => {
    isRecsExpanded = !isRecsExpanded;
    renderFavoritesRecommendations();
  });
}

// ============================================================================
// 12. INITIALIZATION
// ============================================================================
initTheme();
checkServerConfig();
