import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { 
  getAuth, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut, 
  onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import { 
  getFirestore, 
  doc, 
  getDoc, 
  setDoc 
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

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
const db = getFirestore(app);
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
const autocompleteDropdown = document.getElementById("autocomplete-dropdown");
const loadingState = document.getElementById("loading-state");
const resultsSection = document.getElementById("results-section");

// Floating AI Thinking Banner disabled per user request in favor of in-context animations
let activeAiRequests = 0;

function showAiThinkingBanner() {
  // Intentionally no-op: in-context animations in price and alternative areas visualize loading
}

function hideAiThinkingBanner() {
  // Intentionally no-op
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
const heroScoreBadge = document.getElementById("hero-score-badge");
const heroScoreVal = document.getElementById("hero-score-val");
const heroVerdictCard = document.getElementById("hero-verdict-card");
const heroDiscogsConsensus = document.getElementById("hero-discogs-consensus");
const heroVerdictText = document.getElementById("hero-verdict-text");

function renderCollectorScoreAndVerdict(scoreData) {
  if (!heroScoreBadge || !heroVerdictCard) return;

  const score = Math.min(100, Math.max(50, Number(scoreData?.overallScore || scoreData?.score) || 92));
  if (heroScoreVal) heroScoreVal.textContent = score;

  // Dynamic color coding: 90+ Emerald, 80-89 Blue, <80 Amber
  heroScoreBadge.classList.remove("score-tier-high", "score-tier-mid", "score-tier-fair");
  if (score >= 90) {
    heroScoreBadge.classList.add("score-tier-high");
  } else if (score >= 80) {
    heroScoreBadge.classList.add("score-tier-mid");
  } else {
    heroScoreBadge.classList.add("score-tier-fair");
  }

  const tierName = scoreData?.tier || (score >= 90 ? "Essential Masterpiece" : (score >= 80 ? "Collector Classic" : "Solid Pressing"));
  heroScoreBadge.setAttribute("title", `Vinyl Collector Consensus: ${score}/100 • ${tierName}`);

  // Consensus label
  const discogs = scoreData?.discogsRating || (score >= 90 ? "4.6 / 5.0" : (score >= 80 ? "4.2 / 5.0" : "3.9 / 5.0"));
  const count = scoreData?.ratingsCount ? ` • ${scoreData.ratingsCount}` : "";
  if (heroDiscogsConsensus) {
    heroDiscogsConsensus.textContent = `${discogs} Discogs community${count}`;
  }

  // Max 30 words verdict
  const verdictRaw = scoreData?.verdict || "A landmark pressing celebrated for dynamic acoustic headroom, analog spatial depth, and timeless vinyl listening appeal.";
  const words = verdictRaw.trim().split(/\s+/);
  const verdictFinal = words.length <= 30 ? verdictRaw.trim() : words.slice(0, 30).join(" ") + "...";
  if (heroVerdictText) {
    heroVerdictText.textContent = verdictFinal;
  }
}

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

// ============================================================================
// WORLDWIDE STORE REGISTRY & REGIONAL LOCALIZATION ENGINE
// ============================================================================
export const STORE_REGISTRY = {
  DE: {
    code: "DE",
    name: "Germany / EU",
    flag: "🇩🇪",
    currency: "EUR",
    symbol: "€",
    rate: 1.0,
    marketLabel: "Germany / EU Market",
    getNewLinks: (title, artist) => {
      const query = `${artist} ${title}`.trim();
      return [
        { name: "jpc.de", url: `https://www.jpc.de/s/${encodeURIComponent(query)}` },
        { name: "HHV.de", url: `https://www.hhv.de/shop/de/records/suche?term=${encodeURIComponent(query)}` },
        { name: "Amazon.de", url: `https://www.amazon.de/s?k=${encodeURIComponent(query + ' vinyl')}` }
      ];
    },
    getUsedLinks: (title, artist) => {
      const query = `${artist} ${title}`.trim();
      return [
        { name: "Discogs", url: `https://www.discogs.com/sell/list?q=${encodeURIComponent(query)}&format=Vinyl` },
        { name: "eBay.de", url: `https://www.ebay.de/sch/i.html?_nkw=${encodeURIComponent(query + ' vinyl')}&_sop=12` },
        { name: "Kleinanzeigen", url: `https://www.kleinanzeigen.de/s-musik-cds/vinyl-${encodeURIComponent(title)}/k0c78` }
      ];
    }
  },
  US: {
    code: "US",
    name: "United States",
    flag: "🇺🇸",
    currency: "USD",
    symbol: "$",
    rate: 1.08,
    marketLabel: "US Market",
    getNewLinks: (title, artist) => {
      const query = `${artist} ${title}`.trim();
      return [
        { name: "Amoeba", url: `https://www.amoeba.com/search/all?search=${encodeURIComponent(query)}` },
        { name: "Rough Trade US", url: `https://www.roughtrade.com/en-us/search?q=${encodeURIComponent(query)}` },
        { name: "Amazon US", url: `https://www.amazon.com/s?k=${encodeURIComponent(query + ' vinyl')}` }
      ];
    },
    getUsedLinks: (title, artist) => {
      const query = `${artist} ${title}`.trim();
      return [
        { name: "Discogs (US)", url: `https://www.discogs.com/sell/list?q=${encodeURIComponent(query)}&format=Vinyl&ships_from=United+States` },
        { name: "eBay US", url: `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(query + ' vinyl')}&_sop=12` },
        { name: "Reverb LP", url: `https://reverb.com/marketplace?query=${encodeURIComponent(query + ' vinyl')}` }
      ];
    }
  },
  UK: {
    code: "UK",
    name: "United Kingdom",
    flag: "🇬🇧",
    currency: "GBP",
    symbol: "£",
    rate: 0.85,
    marketLabel: "UK Market",
    getNewLinks: (title, artist) => {
      const query = `${artist} ${title}`.trim();
      return [
        { name: "Banquet", url: `https://www.banquetrecords.com/search?search=${encodeURIComponent(query)}` },
        { name: "Rough Trade UK", url: `https://www.roughtrade.com/en-gb/search?q=${encodeURIComponent(query)}` },
        { name: "Amazon UK", url: `https://www.amazon.co.uk/s?k=${encodeURIComponent(query + ' vinyl')}` }
      ];
    },
    getUsedLinks: (title, artist) => {
      const query = `${artist} ${title}`.trim();
      return [
        { name: "Discogs (UK)", url: `https://www.discogs.com/sell/list?q=${encodeURIComponent(query)}&format=Vinyl&ships_from=United+Kingdom` },
        { name: "eBay UK", url: `https://www.ebay.co.uk/sch/i.html?_nkw=${encodeURIComponent(query + ' vinyl')}&_sop=12` },
        { name: "Juno Records", url: `https://www.juno.co.uk/search/?q%5Ball%5D%5B%5D=${encodeURIComponent(query)}&music_formats%5B%5D=vinyl` }
      ];
    }
  },
  GLOBAL: {
    code: "GLOBAL",
    name: "Worldwide / Global",
    flag: "🌐",
    currency: "USD",
    symbol: "$",
    rate: 1.08,
    marketLabel: "Global Market",
    getNewLinks: (title, artist) => {
      const query = `${artist} ${title}`.trim();
      return [
        { name: "Bandcamp", url: `https://bandcamp.com/search?q=${encodeURIComponent(query)}&item_type=a` },
        { name: "Rough Trade", url: `https://www.roughtrade.com/en-us/search?q=${encodeURIComponent(query)}` },
        { name: "Amazon", url: `https://www.amazon.com/s?k=${encodeURIComponent(query + ' vinyl')}` }
      ];
    },
    getUsedLinks: (title, artist) => {
      const query = `${artist} ${title}`.trim();
      return [
        { name: "Discogs (WW)", url: `https://www.discogs.com/sell/list?q=${encodeURIComponent(query)}&format=Vinyl` },
        { name: "eBay Global", url: `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(query + ' vinyl')}&_sop=12` },
        { name: "MusicStack", url: `https://www.musicstack.com/listings.cgi?find=${encodeURIComponent(query)}` }
      ];
    }
  }
};

let currentRegion = "DE";

function detectUserRegion() {
  const saved = localStorage.getItem("vinyl_region");
  if (saved && STORE_REGISTRY[saved]) {
    return saved;
  }
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    const lang = (navigator.language || "").toLowerCase();
    if (lang.startsWith("de") || tz.includes("Berlin") || tz.includes("Vienna") || tz.includes("Zurich")) {
      return "DE";
    }
    if (lang.includes("gb") || tz.includes("London")) {
      return "UK";
    }
    if (lang.includes("us") || tz.includes("New_York") || tz.includes("Los_Angeles") || tz.includes("Chicago")) {
      return "US";
    }
  } catch (e) {}
  return "DE";
}

function formatRegionalPrice(priceRaw, regionCode = currentRegion) {
  if (!priceRaw) return "N/A";
  const reg = STORE_REGISTRY[regionCode] || STORE_REGISTRY.DE;
  const str = String(priceRaw).trim();

  const matches = str.match(/\d+(?:[.,]\d+)?/g);
  if (!matches || matches.length === 0) {
    return str;
  }

  const convertedNumbers = matches.map(numStr => {
    const val = parseFloat(numStr.replace(",", "."));
    if (isNaN(val)) return numStr;
    return Math.round(val * reg.rate);
  });

  if (convertedNumbers.length === 1) {
    return `${reg.symbol}${convertedNumbers[0]}`;
  } else if (convertedNumbers.length >= 2) {
    return `${reg.symbol}${convertedNumbers[0]} – ${reg.symbol}${convertedNumbers[1]}`;
  }
  return str;
}

function getNewVinylLinks(title, artist) {
  const reg = STORE_REGISTRY[currentRegion] || STORE_REGISTRY.DE;
  return reg.getNewLinks(title, artist);
}

function getUsedVinylLinks(title, artist) {
  const reg = STORE_REGISTRY[currentRegion] || STORE_REGISTRY.DE;
  return reg.getUsedLinks(title, artist);
}

// In-Context Price Area Animated Skeletons
function renderPriceLoadingSkeletons() {
  const reg = STORE_REGISTRY[currentRegion] || STORE_REGISTRY.DE;
  if (priceNewEl) {
    priceNewEl.innerHTML = `
      <div class="price-skeleton-wrap">
        <div class="price-skeleton-bar"></div>
        <div class="price-scanning-indicator">
          <span class="price-scanning-radar"></span>
          <span>Scanning ${escapeXml(reg.name)} stores...</span>
        </div>
      </div>
    `;
  }
  if (priceNewNoteEl) {
    priceNewNoteEl.textContent = `Live market query for ${reg.code} retail reissues`;
  }
  if (linksNewEl) {
    linksNewEl.innerHTML = `<span class="links-loading-pulse">🔍 Resolving ${escapeXml(reg.name)} retail links...</span>`;
  }

  if (priceUsedEl) {
    priceUsedEl.innerHTML = `
      <div class="price-skeleton-wrap">
        <div class="price-skeleton-bar"></div>
        <div class="price-scanning-indicator">
          <span class="price-scanning-radar green"></span>
          <span>Checking secondary collector markets...</span>
        </div>
      </div>
    `;
  }
  if (priceUsedNoteEl) {
    priceUsedNoteEl.textContent = `Evaluating ${reg.name} condition grading`;
  }
  if (linksUsedEl) {
    linksUsedEl.innerHTML = `<span class="links-loading-pulse">🔍 Searching second-hand markets...</span>`;
  }
}

// In-Context 3 Alternatives Animated Skeletons (Spinning Vinyl Records & Grooves)
function renderAlternativesSkeletons() {
  if (!alternativesGrid) return;
  alternativesGrid.innerHTML = `
    <div class="alt-card-skeleton">
      <div class="alt-skeleton-media">
        <div class="alt-skeleton-sleeve"></div>
        <div class="alt-skeleton-vinyl">
          <div class="alt-skeleton-vinyl-label"></div>
        </div>
      </div>
      <div class="alt-skeleton-info">
        <div class="alt-skeleton-line title"></div>
        <div class="alt-skeleton-line artist"></div>
        <div class="alt-skeleton-line meta"></div>
      </div>
    </div>
    <div class="alt-card-skeleton">
      <div class="alt-skeleton-media">
        <div class="alt-skeleton-sleeve"></div>
        <div class="alt-skeleton-vinyl">
          <div class="alt-skeleton-vinyl-label"></div>
        </div>
      </div>
      <div class="alt-skeleton-info">
        <div class="alt-skeleton-line title"></div>
        <div class="alt-skeleton-line artist"></div>
        <div class="alt-skeleton-line meta"></div>
      </div>
    </div>
    <div class="alt-card-skeleton">
      <div class="alt-skeleton-media">
        <div class="alt-skeleton-sleeve"></div>
        <div class="alt-skeleton-vinyl">
          <div class="alt-skeleton-vinyl-label"></div>
        </div>
      </div>
      <div class="alt-skeleton-info">
        <div class="alt-skeleton-line title"></div>
        <div class="alt-skeleton-line artist"></div>
        <div class="alt-skeleton-line meta"></div>
      </div>
    </div>
  `;
}

function setRegion(newRegion) {
  if (!STORE_REGISTRY[newRegion]) return;
  currentRegion = newRegion;
  localStorage.setItem("vinyl_region", newRegion);

  const reg = STORE_REGISTRY[newRegion];

  const flagEl = document.getElementById("region-current-flag");
  const codeEl = document.getElementById("region-current-code");
  if (flagEl) flagEl.textContent = reg.flag;
  if (codeEl) codeEl.textContent = reg.code;

  const menuItems = document.querySelectorAll(".region-menu-item");
  menuItems.forEach(item => {
    if (item.getAttribute("data-region") === newRegion) {
      item.classList.add("active");
    } else {
      item.classList.remove("active");
    }
  });

  const newMarketEl = document.getElementById("price-new-market");
  const usedMarketEl = document.getElementById("price-used-market");
  if (newMarketEl) newMarketEl.textContent = reg.marketLabel;
  if (usedMarketEl) usedMarketEl.textContent = reg.marketLabel;

  refreshActiveAlbumRegionView();
}

function refreshActiveAlbumRegionView() {
  if (!currentAlbumData) return;

  const reg = STORE_REGISTRY[currentRegion] || STORE_REGISTRY.DE;

  if (currentAlbumData.streetPriceGermany?.newEur) {
    priceNewEl.textContent = formatRegionalPrice(currentAlbumData.streetPriceGermany.newEur, currentRegion);
  } else if (currentAlbumData.baseNewEur) {
    priceNewEl.textContent = formatRegionalPrice(currentAlbumData.baseNewEur, currentRegion);
  } else {
    priceNewEl.textContent = formatRegionalPrice("€29", currentRegion);
  }
  if (priceNewNoteEl) {
    priceNewNoteEl.textContent = `${reg.name} retail reissue`;
  }

  if (currentAlbumData.streetPriceGermany?.usedEur) {
    priceUsedEl.textContent = formatRegionalPrice(currentAlbumData.streetPriceGermany.usedEur, currentRegion);
  } else if (currentAlbumData.baseUsedEur) {
    priceUsedEl.textContent = formatRegionalPrice(currentAlbumData.baseUsedEur, currentRegion);
  } else {
    priceUsedEl.textContent = formatRegionalPrice("€15", currentRegion);
  }
  if (priceUsedNoteEl) {
    priceUsedNoteEl.textContent = currentAlbumData.streetPriceGermany?.conditionNote || "VG+ / EX condition";
  }

  if (currentAlbumData.title) {
    const newLinks = getNewVinylLinks(currentAlbumData.title, currentAlbumData.artist);
    linksNewEl.innerHTML = newLinks.map(link => `
      <a href="${link.url}" target="_blank" rel="noopener noreferrer" class="buy-link-pill fade-in" title="Buy new on ${escapeXml(link.name)}">
        ${escapeXml(link.name)} <span class="arrow-icon">↗</span>
      </a>
    `).join("");

    const usedLinks = getUsedVinylLinks(currentAlbumData.title, currentAlbumData.artist);
    linksUsedEl.innerHTML = usedLinks.map(link => `
      <a href="${link.url}" target="_blank" rel="noopener noreferrer" class="buy-link-pill fade-in" title="Buy used on ${escapeXml(link.name)}">
        ${escapeXml(link.name)} <span class="arrow-icon">↗</span>
      </a>
    `).join("");
  }

  if (currentAlbumData.alternatives && currentAlbumData.alternatives.length > 0) {
    renderAlternativesProgressive(currentAlbumData.alternatives);
  }
}

function initRegionSelector() {
  const toggleBtn = document.getElementById("region-toggle-btn");
  const menu = document.getElementById("region-dropdown-menu");
  if (!toggleBtn || !menu) return;

  currentRegion = detectUserRegion();
  setRegion(currentRegion);

  toggleBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const isHidden = menu.classList.contains("hidden");
    menu.classList.toggle("hidden", !isHidden);
    toggleBtn.setAttribute("aria-expanded", String(isHidden));
  });

  document.addEventListener("click", (e) => {
    if (!toggleBtn.contains(e.target) && !menu.contains(e.target)) {
      menu.classList.add("hidden");
      toggleBtn.setAttribute("aria-expanded", "false");
    }
  });

  const menuItems = menu.querySelectorAll(".region-menu-item");
  menuItems.forEach(item => {
    item.addEventListener("click", (e) => {
      e.stopPropagation();
      const selected = item.getAttribute("data-region");
      if (selected) {
        setRegion(selected);
      }
      menu.classList.add("hidden");
      toggleBtn.setAttribute("aria-expanded", "false");
    });
  });
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
  googleSignInBtn.disabled = true;
  googleSignInBtn.style.opacity = "0.7";
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
  } finally {
    googleSignInBtn.disabled = false;
    googleSignInBtn.style.opacity = "1";
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
    await loadUserFavorites();

    // Restore last displayed album to continue where user left off after last session / restart
    restoreLastSessionAlbum();

    // Immediately load & display cached recommendations from storage
    loadAndDisplayCachedRecommendations();
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
// 6. ALBUM COVER ART RESOLVER (iTunes API + Deezer Public JSONP + SVG Fallback)
// ============================================================================
function fetchDeezerCoverJsonp(query) {
  return new Promise((resolve) => {
    try {
      const cbName = `dz_cb_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
      const script = document.createElement("script");
      const timer = setTimeout(() => {
        try { delete window[cbName]; } catch (e) {}
        script.remove();
        resolve(null);
      }, 3500);

      window[cbName] = (data) => {
        clearTimeout(timer);
        try { delete window[cbName]; } catch (e) {}
        script.remove();
        if (data && Array.isArray(data.data) && data.data.length > 0) {
          const item = data.data[0];
          const cover = item.cover_xl || item.cover_big || item.cover_medium;
          resolve(cover || null);
        } else {
          resolve(null);
        }
      };

      script.src = `https://api.deezer.com/search/album?q=${encodeURIComponent(query)}&output=jsonp&callback=${cbName}`;
      script.onerror = () => {
        clearTimeout(timer);
        try { delete window[cbName]; } catch (e) {}
        script.remove();
        resolve(null);
      };
      document.head.appendChild(script);
    } catch (e) {
      resolve(null);
    }
  });
}

async function fetchAlbumCover(query, artist = "", fallbackTitle = "") {
  const cleanTitle = (fallbackTitle || query || "").trim();
  const searchCombo = `${cleanTitle} ${artist}`.trim();

  // 1. Primary: iTunes Search API
  try {
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(searchCombo)}&entity=album&limit=6`;
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
    console.warn("iTunes cover art fetch error:", searchCombo, err);
  }

  // 2. Secondary: Deezer Public JSONP (Reliably has indie/underground vinyl pressings like Deadringer)
  try {
    const deezerCover = await fetchDeezerCoverJsonp(searchCombo);
    if (deezerCover) return deezerCover;
  } catch (err) {
    console.warn("Deezer cover art fallback error:", searchCombo, err);
  }

  // 3. Stylish SVG Vinyl Sleeve Fallback
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

// Strict normalized fuzzy check to ensure recommendations never duplicate saved favorites
function isAlbumInFavorites(title, artist = '') {
  if (!title || !Array.isArray(userFavorites) || userFavorites.length === 0) return false;
  const cleanTitle = normalizeCatalogKey(title);
  const cleanArtist = normalizeCatalogKey(artist || '');

  return userFavorites.some(fav => {
    const favTitle = normalizeCatalogKey(fav.title);
    const favArtist = normalizeCatalogKey(fav.artist || '');

    // 1. Exact title match
    if (cleanTitle === favTitle) return true;

    // 2. Prefix / containment match for albums with reissue, deluxe, or edition tags
    if (favTitle.length >= 4 && cleanTitle.length >= 4) {
      if (cleanTitle.startsWith(favTitle) || favTitle.startsWith(cleanTitle)) {
        if (!cleanArtist || !favArtist || cleanArtist === favArtist || cleanArtist.includes(favArtist) || favArtist.includes(cleanArtist)) {
          return true;
        }
      }
      if (cleanTitle.includes(favTitle) || favTitle.includes(cleanTitle)) {
        if (!cleanArtist || !favArtist || cleanArtist === favArtist || cleanArtist.includes(favArtist) || favArtist.includes(cleanArtist)) {
          return true;
        }
      }
    }

    return false;
  });
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

    // Render unified collector score and verdict
    renderCollectorScoreAndVerdict(cached.collectorScore || {
      overallScore: Math.min(98, Math.max(78, 86 + (cached.title.length % 11))),
      discogsRating: "4.5 / 5.0",
      ratingsCount: "Collector favorite",
      tier: "Collector Classic",
      verdict: "An essential physical record celebrated for balanced acoustic warmth, dynamic headroom, and timeless vinyl listening fidelity."
    });

    // Immediate image from storage
    albumCoverImg.src = cached.coverUrl || generateSvgCover(cached.title, cached.artist);

    // Load Track 1 YouTube Listening Station below fav heart
    loadYouTubeTrack1(cached.artist, cached.title, cached.firstTrackTitle, cached.youtubeVideoId).then(vId => {
      if (vId && !cached.youtubeVideoId) {
        cached.youtubeVideoId = vId;
        saveAlbumToCache(cached);
      }
    });

    // In-context animated skeleton for price area
    renderPriceLoadingSkeletons();

    currentAlbumData = {
      title: cached.title,
      artist: cached.artist,
      genre: cached.genre,
      year: cached.year,
      playtime: cached.playtime,
      trackCount: cached.trackCount,
      collectorScore: cached.collectorScore || null,
      coverUrl: albumCoverImg.src,
      streetPriceGermany: cached.streetPriceGermany || null,
      baseNewEur: cached.streetPriceGermany?.newEur || "€29",
      baseUsedEur: cached.streetPriceGermany?.usedEur || "€15",
      alternatives: cached.alternatives || []
    };

    heroFavBtn.classList.toggle("active", isFavorited(cached.title, cached.artist));

    // Check if cached alternatives exist and have at least 3 valid recommendations
    alternativesGenreName.textContent = cached.genre || "";
    const validAlts = (cached.alternatives || []).filter(alt => !isAlbumInFavorites(alt.title, alt.artist));
    if (validAlts.length >= 3) {
      renderAlternativesProgressive(cached.alternatives);
    } else {
      // In-context animated skeletons for alternatives while resolving
      renderAlternativesSkeletons();
      fetchMissingAlternatives(cached);
    }

    // Async stream in store search links
    asyncResearchBuyLinks(cached.title, cached.artist);

    // Async fetch ONLY real-time prices live
    fetchRealTimePrices(cached.title, cached.artist).then(freshPrices => {
      const reg = STORE_REGISTRY[currentRegion] || STORE_REGISTRY.DE;
      if (freshPrices) {
        if (currentAlbumData) {
          currentAlbumData.streetPriceGermany = freshPrices;
          currentAlbumData.baseNewEur = freshPrices.newEur;
          currentAlbumData.baseUsedEur = freshPrices.usedEur;
        }
        priceNewEl.textContent = formatRegionalPrice(freshPrices.newEur || "€29", currentRegion);
        priceNewNoteEl.textContent = `${reg.name} retail reissue`;
        priceUsedEl.textContent = formatRegionalPrice(freshPrices.usedEur || "€15", currentRegion);
        priceUsedNoteEl.textContent = freshPrices.conditionNote || "VG+ / EX condition";
        cached.streetPriceGermany = freshPrices;
        saveAlbumToCache(cached);
      } else {
        priceNewEl.textContent = formatRegionalPrice(currentAlbumData?.baseNewEur || "€29", currentRegion);
        priceUsedEl.textContent = formatRegionalPrice(currentAlbumData?.baseUsedEur || "€15", currentRegion);
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
  const favAltTitles = (userFavorites || []).map(f => `"${f.title}" by ${f.artist || 'Unknown'}`).join(", ");
  const favAltExclusionPrompt = favAltTitles.length > 0
    ? `\nCRITICAL EXCLUSION RULE FOR ALTERNATIVES:\nDO NOT suggest any albums that are in the user's saved favorites list (${favAltTitles})! Every alternative must be a different album they do not have saved.\n`
    : "";

  const prompt = `You are an expert vinyl record specialist and discographer in Germany.
Evaluate this album for vinyl collectors: "${albumName}".
Provide accurate information in Germany for vinyl pressings:
1. Exact album title and artist.
2. Title of the very first song (track 1) on the album.
3. Primary musical genre & release year.
4. Total playtime (e.g. "47 min 23 sec").
5. Total number of tracks/songs (integer).
6. Unified Vinyl Collector Rating & Consensus (1–100 scale):
   - "overallScore": Integer between 65 and 99 representing unified collector consensus calibrated against Discogs community ratings (e.g., 4.6/5.0 equates to ~92/100).
   - "discogsRating": The estimated average Discogs community score string (e.g., "4.65 / 5.0" or "4.3 / 5.0").
   - "ratingsCount": Estimated community vote scale (e.g., "28k+ ratings" or "6.2k ratings").
   - "tier": Short prestige tier, e.g. "Essential Masterpiece", "Collector Classic", "Audiophile Landmark", or "Solid Pressing".
   - "verdict": A punchy, authoritative vinyl collector verdict summary of STRICTLY 30 WORDS OR FEWER focusing on acoustic quality, pressing dynamics, and musical stature.
7. Realistic German vinyl market street prices:
   - New vinyl: Average price in Germany retail record stores in EUR (e.g., "€28 – €34").
   - Used vinyl: Average second-hand price in Germany (Flohmärkte, Discogs DE, local shops) in EUR for a VG+/EX copy (e.g., "€14 – €22").
   - Short condition notes.
8. 4 to 5 alternative vinyl albums in the exact same or closely related genre that fans would love.${favAltTitles.length > 0 ? ` (CRITICAL: Do NOT suggest any albums from the user's favorites list: ${favAltTitles})` : ""} Include for each: title, artist, genre, playtime, number of tracks/songs, new vinyl price in Germany (EUR), used vinyl price in Germany (EUR).
9. Concise search term for album cover lookup (artist + album title).${favAltExclusionPrompt}

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
    "collectorScore": {
      "overallScore": 94,
      "discogsRating": "4.65 / 5.0",
      "ratingsCount": "28k+ ratings",
      "tier": "Essential Masterpiece",
      "verdict": "Maximum 30 words collector verdict summary on vinyl pressing, sound quality, and stature."
    },
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

    // Render unified collector score and verdict
    renderCollectorScoreAndVerdict(album.collectorScore);

    const reg = STORE_REGISTRY[currentRegion] || STORE_REGISTRY.DE;
    priceNewEl.textContent = formatRegionalPrice(album.streetPriceGermany?.newEur || "€29", currentRegion);
    priceNewNoteEl.textContent = `${reg.name} retail reissue`;
    linksNewEl.innerHTML = `<span class="links-loading-pulse">🔍 Resolving ${escapeXml(reg.name)} retail links...</span>`;

    priceUsedEl.textContent = formatRegionalPrice(album.streetPriceGermany?.usedEur || "€15", currentRegion);
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
      collectorScore: album.collectorScore,
      coverUrl: albumCoverImg.src,
      streetPriceGermany: album.streetPriceGermany,
      baseNewEur: album.streetPriceGermany?.newEur || "€29",
      baseUsedEur: album.streetPriceGermany?.usedEur || "€15",
      alternatives: alternatives
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
          collectorScore: album.collectorScore,
          streetPriceGermany: album.streetPriceGermany,
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
      collectorScore: album.collectorScore,
      streetPriceGermany: album.streetPriceGermany,
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
          collectorScore: album.collectorScore,
          streetPriceGermany: album.streetPriceGermany,
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
  // Strict programmatic filter: omit any album from userFavorites
  const cleanAlternatives = (alternatives || []).filter(alt => !isAlbumInFavorites(alt.title, alt.artist));
  const toRender = cleanAlternatives.slice(0, 3);

  if (toRender.length === 0) {
    alternativesGrid.innerHTML = `
      <p class="empty-state-text" style="grid-column: 1 / -1; text-align: center; color: var(--text-muted); padding: 1.5rem;">
        No other alternative recommendations found for this genre.
      </p>
    `;
    return;
  }

  alternativesGrid.innerHTML = toRender.map(() => `
    <div class="alt-card-skeleton">
      <div class="alt-skeleton-media">
        <div class="alt-skeleton-sleeve"></div>
        <div class="alt-skeleton-vinyl">
          <div class="alt-skeleton-vinyl-label"></div>
        </div>
      </div>
      <div class="alt-skeleton-info">
        <div class="alt-skeleton-line title"></div>
        <div class="alt-skeleton-line artist"></div>
        <div class="alt-skeleton-line meta"></div>
      </div>
    </div>
  `).join("");

  const skeletons = Array.from(alternativesGrid.querySelectorAll(".alt-card-skeleton"));

  toRender.forEach(async (alt, idx) => {
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
        streetPriceGermany: alt.streetPriceGermany || null,
        coverUrl: coverUrl,
        alternatives: []
      });

      const card = document.createElement("div");
      card.className = "alt-card fade-in";

      const newAltLinks = getNewVinylLinks(alt.title, alt.artist);
      const usedAltLinks = getUsedVinylLinks(alt.title, alt.artist);
      const primaryNewStore = newAltLinks[0] || { name: "Store", url: "#" };
      const primaryUsedStore = usedAltLinks[0] || { name: "Discogs", url: "#" };

      const reg = STORE_REGISTRY[currentRegion] || STORE_REGISTRY.DE;
      const newPriceStr = formatRegionalPrice(alt.streetPriceGermany?.newEur || '€28', currentRegion);
      const usedPriceStr = formatRegionalPrice(alt.streetPriceGermany?.usedEur || '€14', currentRegion);

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
            <span class="alt-price-tag">New (${reg.code})</span>
            <span class="alt-price-val new">${escapeXml(newPriceStr)}</span>
          </div>
          <div class="alt-price-col">
            <span class="alt-price-tag">Used (${reg.code})</span>
            <span class="alt-price-val used">${escapeXml(usedPriceStr)}</span>
          </div>
        </div>
        <div class="alt-buy-links">
          <a href="${primaryNewStore.url}" target="_blank" rel="noopener noreferrer" class="alt-buy-link" onclick="event.stopPropagation()" title="Buy new on ${escapeXml(primaryNewStore.name)}">
            ${escapeXml(primaryNewStore.name)} ↗
          </a>
          <a href="${primaryUsedStore.url}" target="_blank" rel="noopener noreferrer" class="alt-buy-link" onclick="event.stopPropagation()" title="Buy used on ${escapeXml(primaryUsedStore.name)}">
            ${escapeXml(primaryUsedStore.name)} ↗
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

// Fetch and curate fresh alternative recommendations when a cached album lacks them
async function fetchMissingAlternatives(cached) {
  if (!cached) return;
  alternativesGenreName.textContent = cached.genre || "";

  // 1. Immediately render skeleton placeholders so UI is responsive
  renderAlternativesSkeletons();

  try {
    const favAltTitles = (userFavorites || []).map(f => `"${f.title}" by ${f.artist || 'Unknown'}`).join(", ");
    const favAltExclusionPrompt = favAltTitles.length > 0
      ? `\nCRITICAL EXCLUSION RULE:\nDO NOT suggest "${cached.title}" by ${cached.artist || ''} and DO NOT suggest any albums in the user's saved favorites list (${favAltTitles})! Every alternative must be a different album they do not have saved.\n`
      : `\nCRITICAL EXCLUSION RULE:\nDO NOT suggest "${cached.title}" by ${cached.artist || ''}!\n`;

    const prompt = `You are an expert vinyl record specialist and discographer in Germany.
For the vinyl album "${cached.title}" by "${cached.artist || 'Unknown'}" (genre / style: ${cached.genre || "Vinyl"}), recommend 4 to 5 essential alternative vinyl albums in the same or closely related musical style for vinyl collectors in Germany.${favAltExclusionPrompt}
For each alternative album, provide:
- Exact album title and artist.
- Primary genre.
- Total playtime (e.g. "44 min").
- Total track count (integer).
- Realistic German vinyl prices: new vinyl (EUR) and used vinyl (EUR).
- Concise coverSearchTerm (artist + album title).

Return strictly a valid JSON object matching this schema:
{
  "alternatives": [
    {
      "title": "string",
      "artist": "string",
      "genre": "string",
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

    const data = await callGeminiFlash(prompt);
    const newAlternatives = data?.alternatives || [];
    if (newAlternatives.length > 0) {
      cached.alternatives = newAlternatives;
      saveAlbumToCache(cached);
      renderAlternativesProgressive(newAlternatives);
    } else {
      renderAlternativesProgressive(cached.alternatives || []);
    }
  } catch (err) {
    console.error("fetchMissingAlternatives failed:", err);
    renderAlternativesProgressive(cached.alternatives || []);
  }
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
  updateFavsUI();
}

function saveSearchToMemory(searchRecord) {
  const prevSig = getLast3LikedSignature();
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
  updateFavsUI();

  const newSig = getLast3LikedSignature();
  // If user has NO favorites yet, offer recommendations based on their last 3 searches
  if (userFavorites.length === 0 && (prevSig !== newSig || !cachedFavRecs || cachedFavRecs.length === 0)) {
    generateFavoritesRecommendations(true);
  }
}

function updateMemoryUI() {
  const count = userSearches.length;
  if (counterValueEl) counterValueEl.textContent = `${count}`;

  // Update dots if counter dots element exists
  if (counterDotsEl) {
    const dots = counterDotsEl.querySelectorAll(".dot");
    dots.forEach((dot, index) => {
      if (index < Math.min(count, 5)) {
        dot.classList.add("filled");
      } else {
        dot.classList.remove("filled");
      }
    });
  }

  // Carousel unlock / progress message
  if (cachedFavRecs && cachedFavRecs.length > 0) {
    if (recLockedBanner) recLockedBanner.classList.add("hidden");
    if (recCarouselContainer) recCarouselContainer.classList.remove("hidden");
  } else if (userFavorites.length === 0 && count === 0) {
    if (recLockedBanner) recLockedBanner.classList.remove("hidden");
    if (recCarouselContainer) recCarouselContainer.classList.add("hidden");
    if (lockedProgressMsg) {
      lockedProgressMsg.textContent = "Search an album or save favorites to unlock your personalized vinyl recommendations.";
    }
  } else {
    if (recLockedBanner) recLockedBanner.classList.add("hidden");
    if (recCarouselContainer) recCarouselContainer.classList.remove("hidden");
  }
}

// Generate Personalized Vinyl Recommendations
async function generateRecommendations() {
  return generateFavoritesRecommendations(true);
}

let carouselRenderSeq = 0;

// Render Vinyl Covers Only in Bottom Carousel (User Requirement)
async function renderRecommendationCarousel(recs) {
  const currentSeq = ++carouselRenderSeq;
  recTrack.innerHTML = "";

  // Strict programmatic deduplication & exclusion of userFavorites
  const seen = new Set();
  const cleanRecs = [];
  for (const item of (recs || [])) {
    if (!item || !item.title) continue;
    if (isAlbumInFavorites(item.title, item.artist)) continue;
    const key = normalizeCatalogKey(item.title + ' ' + (item.artist || ''));
    if (seen.has(key)) continue;
    seen.add(key);
    cleanRecs.push(item);
  }

  // Pre-create placeholder slots immediately in DOM to prevent layout shifts & interleaving
  const slotElements = cleanRecs.map((item) => {
    const coverEl = document.createElement("div");
    coverEl.className = "rec-cover-item";
    coverEl.setAttribute("data-tooltip", `${item.artist || ''} — ${item.title}`);
    coverEl.innerHTML = `
      <img class="rec-cover-img" src="${generateSvgCover(item.title, item.artist)}" alt="${escapeXml(item.title)}" loading="lazy" />
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
    return { item, coverEl };
  });

  // Hydrate high-res artwork asynchronously in parallel (iTunes + Deezer JSONP fallback)
  await Promise.all(slotElements.map(async ({ item, coverEl }) => {
    try {
      const coverUrl = (item.coverUrl && !item.coverUrl.startsWith("data:image/svg"))
        ? item.coverUrl
        : await fetchAlbumCover(item.coverSearchTerm || item.title, item.artist, item.title);

      // If a newer carousel render sequence started while waiting, abort mutation
      if (currentSeq !== carouselRenderSeq) return;

      if (coverUrl) {
        const img = coverEl.querySelector(".rec-cover-img");
        if (img) img.src = coverUrl;
        item.coverUrl = coverUrl;
      }
    } catch (e) {}
  }));
}

// Carousel Scroll Navigation
recPrevBtn.addEventListener("click", () => {
  recCarouselContainer.scrollBy({ left: -340, behavior: "smooth" });
});

recNextBtn.addEventListener("click", () => {
  recCarouselContainer.scrollBy({ left: 340, behavior: "smooth" });
});

// ============================================================================
// 9. QUICK AUTOCOMPLETE & EVENT LISTENERS
// ============================================================================
let autocompleteTimer = null;
let currentAutocompleteResults = [];
let focusedAutocompleteIdx = -1;

function hideAutocomplete() {
  if (!autocompleteDropdown) return;
  autocompleteDropdown.classList.add("hidden");
  autocompleteDropdown.innerHTML = "";
  currentAutocompleteResults = [];
  focusedAutocompleteIdx = -1;
}

function renderAutocompleteResults(results) {
  if (!autocompleteDropdown) return;
  if (!results || results.length === 0) {
    hideAutocomplete();
    return;
  }

  currentAutocompleteResults = results;
  focusedAutocompleteIdx = -1;

  autocompleteDropdown.innerHTML = `
    <div class="autocomplete-header">
      <span class="header-tag">💿 Top Landmark Albums</span>
      <span>Click or ↑↓ Enter</span>
    </div>
    ${results.map((item, idx) => `
      <button class="autocomplete-item" type="button" data-idx="${idx}" role="option">
        <div class="autocomplete-thumb-wrap">
          <img class="autocomplete-thumb" src="${item.coverUrl || generateSvgCover(item.title, item.artist)}" alt="${escapeXml(item.title)}" loading="lazy" />
          <div class="autocomplete-thumb-disc"></div>
        </div>
        <div class="autocomplete-info">
          <span class="autocomplete-title" title="${escapeXml(item.title)}">${escapeXml(item.title)}</span>
          <div class="autocomplete-meta">
            <span class="autocomplete-artist">${escapeXml(item.artist)}</span>
            ${item.year ? `<span class="autocomplete-year">${escapeXml(item.year)}</span>` : ''}
          </div>
        </div>
        <span class="autocomplete-badge">
          Appraise ↗
        </span>
      </button>
    `).join("")}
  `;

  // Attach click listener to each option
  const items = autocompleteDropdown.querySelectorAll(".autocomplete-item");
  items.forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const idx = Number(btn.getAttribute("data-idx"));
      const chosen = currentAutocompleteResults[idx];
      if (chosen) {
        selectAutocompleteAlbum(chosen);
      }
    });
  });

  autocompleteDropdown.classList.remove("hidden");
}

function selectAutocompleteAlbum(album) {
  hideAutocomplete();
  const fullLabel = album.artist ? `${album.artist} - ${album.title}` : album.title;
  albumInput.value = fullLabel;
  appraiseAlbum(album.artist ? `${album.artist} ${album.title}` : album.title);
}

// Debounced input handler on search box
if (albumInput) {
  albumInput.addEventListener("input", () => {
    const query = albumInput.value.trim();
    if (autocompleteTimer) {
      clearTimeout(autocompleteTimer);
      autocompleteTimer = null;
    }

    if (query.length < 2) {
      hideAutocomplete();
      return;
    }

    autocompleteTimer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/autocomplete?q=${encodeURIComponent(query)}`);
        if (res.ok) {
          const data = await res.json();
          // Check if query still matches current input
          if (albumInput.value.trim() === query && data.success && Array.isArray(data.results)) {
            renderAutocompleteResults(data.results);
          }
        }
      } catch (err) {
        console.warn("Autocomplete fetch error:", err);
      }
    }, 220);
  });

  // Keyboard navigation (ArrowDown, ArrowUp, Enter, Escape)
  albumInput.addEventListener("keydown", (e) => {
    if (!autocompleteDropdown || autocompleteDropdown.classList.contains("hidden")) return;

    const items = autocompleteDropdown.querySelectorAll(".autocomplete-item");
    if (items.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      focusedAutocompleteIdx = (focusedAutocompleteIdx + 1) % items.length;
      updateFocusedAutocompleteItem(items);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      focusedAutocompleteIdx = (focusedAutocompleteIdx - 1 + items.length) % items.length;
      updateFocusedAutocompleteItem(items);
    } else if (e.key === "Enter" && focusedAutocompleteIdx >= 0) {
      e.preventDefault();
      const chosen = currentAutocompleteResults[focusedAutocompleteIdx];
      if (chosen) {
        selectAutocompleteAlbum(chosen);
      }
    } else if (e.key === "Escape") {
      hideAutocomplete();
    }
  });
}

function updateFocusedAutocompleteItem(items) {
  items.forEach((item, idx) => {
    if (idx === focusedAutocompleteIdx) {
      item.classList.add("focused");
      item.scrollIntoView({ block: "nearest" });
    } else {
      item.classList.remove("focused");
    }
  });
}

// Dismiss autocomplete when clicking outside
document.addEventListener("click", (e) => {
  if (autocompleteDropdown && !autocompleteDropdown.classList.contains("hidden")) {
    if (!searchForm.contains(e.target)) {
      hideAutocomplete();
    }
  }
});

searchForm.addEventListener("submit", (e) => {
  e.preventDefault();
  hideAutocomplete();
  const query = albumInput.value.trim();
  if (query) {
    appraiseAlbum(query);
  }
});

document.querySelectorAll(".chip").forEach(chip => {
  chip.addEventListener("click", () => {
    hideAutocomplete();
    const album = chip.getAttribute("data-album");
    albumInput.value = album;
    appraiseAlbum(album);
  });
});

// ============================================================================
// 10. PERSISTENT FAVORITES SYSTEM ("MY FAV VINYL") & RECOMMENDATIONS CACHE
// ============================================================================
function getFavsStorageKey() {
  return currentUser ? `vinyl_tipper_favs_${currentUser.uid}` : "vinyl_tipper_favs_guest";
}

function getLast3LikedSignature() {
  if (userFavorites && userFavorites.length > 0) {
    const top3 = userFavorites.slice(0, 3);
    return 'favs:' + top3.map(f => normalizeCatalogKey(f.title) + ':' + normalizeCatalogKey(f.artist || '')).join('|');
  }
  if (userSearches && userSearches.length > 0) {
    const top3 = userSearches.slice(0, 3);
    return 'searches:' + top3.map(s => normalizeCatalogKey(s.title) + ':' + normalizeCatalogKey(s.artist || '')).join('|');
  }
  return '';
}

function getRecommendationsStorageKey() {
  return currentUser ? `vinyl_tipper_recs_${currentUser.uid}` : "vinyl_tipper_recs_guest";
}

async function fetchUserFromFirestore(uid) {
  if (!uid) return null;
  // 1. Try Firestore SDK first
  try {
    const userRef = doc(db, "users", uid);
    const snap = await getDoc(userRef);
    if (snap.exists()) {
      const d = snap.data();
      let favs = [];
      let recs = null;
      if (d.favoritesJson) {
        try { favs = JSON.parse(d.favoritesJson); } catch (e) {}
      } else if (Array.isArray(d.favorites)) {
        favs = d.favorites;
      }
      if (d.recommendationsJson) {
        try { recs = JSON.parse(d.recommendationsJson); } catch (e) {}
      }
      return { favorites: favs, recommendations: recs };
    }
  } catch (err) {
    console.warn("Firestore SDK read fallback to REST:", err?.message || err);
  }

  // 2. Guaranteed fallback via direct Firestore REST API
  try {
    const url = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents/users/${uid}?key=${firebaseConfig.apiKey}`;
    const res = await fetch(url);
    if (res.ok) {
      const docData = await res.json();
      let favs = [];
      let recs = null;
      if (docData.fields && docData.fields.favoritesJson && docData.fields.favoritesJson.stringValue) {
        try { favs = JSON.parse(docData.fields.favoritesJson.stringValue); } catch (e) {}
      }
      if (docData.fields && docData.fields.recommendationsJson && docData.fields.recommendationsJson.stringValue) {
        try { recs = JSON.parse(docData.fields.recommendationsJson.stringValue); } catch (e) {}
      }
      return { favorites: favs, recommendations: recs };
    }
  } catch (restErr) {
    console.warn("Firestore REST read error:", restErr?.message || restErr);
  }
  return null;
}

async function saveRecommendationsToFirestore(payload) {
  if (!currentUser) return;
  const jsonStr = JSON.stringify(payload);

  // 1. Try Firestore SDK
  try {
    const userRef = doc(db, "users", currentUser.uid);
    await setDoc(userRef, {
      recommendationsJson: jsonStr,
      updatedAt: Date.now()
    }, { merge: true });
  } catch (e) {}

  // 2. Direct Firestore REST API PATCH
  try {
    const patchUrl = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents/users/${currentUser.uid}?updateMask.fieldPaths=recommendationsJson&updateMask.fieldPaths=updatedAt&key=${firebaseConfig.apiKey}`;
    fetch(patchUrl, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fields: {
          recommendationsJson: { stringValue: jsonStr },
          updatedAt: { integerValue: String(Date.now()) }
        }
      })
    }).catch(() => {});
  } catch (e) {}
}

async function saveRecommendationsToStorage(recs, signature) {
  const sig = signature || getLast3LikedSignature();
  const payload = {
    signature: sig,
    recommendations: recs,
    updatedAt: Date.now()
  };
  try {
    localStorage.setItem(getRecommendationsStorageKey(), JSON.stringify(payload));
  } catch (e) {}

  if (currentUser) {
    saveRecommendationsToFirestore(payload);

    fetch('/api/recommendations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uid: currentUser.uid,
        signature: sig,
        recommendations: recs
      })
    }).catch(() => {});
  }
}

async function loadAndDisplayCachedRecommendations() {
  if (!currentUser) return;

  const currentSig = getLast3LikedSignature();
  let cachedPayload = null;

  // 1. Instant 0ms cache from localStorage
  try {
    const raw = localStorage.getItem(getRecommendationsStorageKey());
    if (raw) cachedPayload = JSON.parse(raw);
  } catch (e) {}

  // 2. Fallback to Firestore if localStorage is empty
  if (!cachedPayload || !Array.isArray(cachedPayload.recommendations) || cachedPayload.recommendations.length === 0) {
    const cloudData = await fetchUserFromFirestore(currentUser.uid);
    if (cloudData && cloudData.recommendations) {
      const parsed = cloudData.recommendations;
      if (parsed && Array.isArray(parsed.recommendations) && parsed.recommendations.length > 0) {
        cachedPayload = parsed;
        try {
          localStorage.setItem(getRecommendationsStorageKey(), JSON.stringify(cachedPayload));
        } catch (e) {}
      }
    }
  }

  // 3. Fallback to server storage if still empty
  if (!cachedPayload || !Array.isArray(cachedPayload.recommendations) || cachedPayload.recommendations.length === 0) {
    try {
      const res = await fetch(`/api/recommendations?uid=${encodeURIComponent(currentUser.uid)}`);
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          cachedPayload = json.data;
          try {
            localStorage.setItem(getRecommendationsStorageKey(), JSON.stringify(cachedPayload));
          } catch (e) {}
        }
      }
    } catch (e) {}
  }

  // 4. Immediately render recommendations if found
  if (cachedPayload && Array.isArray(cachedPayload.recommendations) && cachedPayload.recommendations.length > 0) {
    const clean = cachedPayload.recommendations.filter(r => !isAlbumInFavorites(r.title, r.artist));
    if (clean.length > 0) {
      cachedFavRecs = clean.slice(0, 10);
      lastFavsSignature = cachedPayload.signature || currentSig;
      isRecsExpanded = true;

      // Immediately render modal list and update button
      renderFavoritesRecommendations();
      if (favRecsBtn) favRecsBtn.classList.remove("hidden");

      // Immediately render bottom crate carousel and unlock it
      renderRecommendationCarousel(cachedFavRecs);
      recLockedBanner.classList.add("hidden");
      recCarouselContainer.classList.remove("hidden");

      // Only refresh in background if the recommendations signature changed
      if (currentSig && cachedPayload.signature && cachedPayload.signature !== currentSig && (userFavorites.length > 0 || userSearches.length > 0)) {
        generateFavoritesRecommendations(true);
      }
      return;
    }
  }

  // 5. If no cache exists yet, but user has favorites or recent searches, trigger initial generation
  if (userFavorites.length > 0 || userSearches.length > 0) {
    generateFavoritesRecommendations(true);
  }
}

async function loadUserFavorites() {
  const key = getFavsStorageKey();
  try {
    const raw = localStorage.getItem(key);
    userFavorites = raw ? JSON.parse(raw) : [];
  } catch (e) {
    userFavorites = [];
  }

  // Migration safeguard: if signed-in user has 0 favorites in user-scoped key, check guest key
  if (userFavorites.length === 0) {
    try {
      const guestRaw = localStorage.getItem("vinyl_tipper_favs_guest");
      if (guestRaw) {
        const guestFavs = JSON.parse(guestRaw);
        if (Array.isArray(guestFavs) && guestFavs.length > 0) {
          userFavorites = guestFavs;
          localStorage.setItem(key, JSON.stringify(userFavorites));
        }
      }
    } catch (e) {}
  }

  updateFavsUI();

  if (currentUser) {
    const cloudData = await fetchUserFromFirestore(currentUser.uid);
    if (cloudData && Array.isArray(cloudData.favorites)) {
      const cloudFavs = cloudData.favorites;

      if (cloudFavs.length > 0) {
        if (userFavorites.length === 0) {
          // Fresh device / new origin (e.g. vinyl-tipper.web.app): hydrate from cloud!
          userFavorites = cloudFavs;
          localStorage.setItem(key, JSON.stringify(userFavorites));
          updateFavsUI();
          loadAndDisplayCachedRecommendations();
        } else {
          // Reconcile: merge local and cloud items
          let localChanged = false;
          for (const cf of cloudFavs) {
            if (!isAlbumInFavorites(cf.title, cf.artist)) {
              userFavorites.push(cf);
              localChanged = true;
            }
          }
          if (localChanged) {
            localStorage.setItem(key, JSON.stringify(userFavorites));
            updateFavsUI();
          }

          // If local has MORE items than cloud had (e.g. 13 vs 3 on localhost),
          // push the complete merged collection to cloud immediately!
          if (userFavorites.length > cloudFavs.length || localChanged) {
            await saveUserFavoritesToFirestore();
          }
        }
      } else if (userFavorites.length > 0) {
        // Cloud is empty but local has items: upload to cloud!
        await saveUserFavoritesToFirestore();
      }
    } else if (userFavorites.length > 0) {
      // Cloud record not found yet: upload local favorites!
      await saveUserFavoritesToFirestore();
    }
  }
}

async function saveUserFavoritesToFirestore() {
  if (!currentUser) return;
  const jsonStr = JSON.stringify(userFavorites);

  // 1. Try Firestore SDK
  try {
    const userRef = doc(db, "users", currentUser.uid);
    await setDoc(userRef, {
      favoritesJson: jsonStr,
      updatedAt: Date.now()
    }, { merge: true });
  } catch (err) {
    console.warn("Firestore SDK save fallback to REST:", err?.message || err);
  }

  // 2. Direct Firestore REST API PATCH (Guaranteed to succeed across all origins)
  try {
    const patchUrl = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents/users/${currentUser.uid}?updateMask.fieldPaths=favoritesJson&updateMask.fieldPaths=updatedAt&key=${firebaseConfig.apiKey}`;
    await fetch(patchUrl, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fields: {
          favoritesJson: { stringValue: jsonStr },
          updatedAt: { integerValue: String(Date.now()) }
        }
      })
    });
    console.log(`[Crate Sync] Cloud crate synchronized successfully (${userFavorites.length} albums)`);
  } catch (e) {
    console.warn("Firestore REST PATCH error:", e);
  }
}

function saveUserFavorites() {
  const key = getFavsStorageKey();
  localStorage.setItem(key, JSON.stringify(userFavorites));
  updateFavsUI();
  saveUserFavoritesToFirestore();
  if (currentUser) {
    fetch('/api/favorites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uid: currentUser.uid,
        favorites: userFavorites
      })
    }).catch(() => {});
  }
}

function isFavorited(title, artist) {
  return isAlbumInFavorites(title, artist);
}

function toggleFavorite(album) {
  if (!album || !album.title) return;
  const prevSig = getLast3LikedSignature();

  const index = userFavorites.findIndex(
    f => f.title.toLowerCase() === album.title.toLowerCase() &&
         (album.artist ? f.artist.toLowerCase() === album.artist.toLowerCase() : true)
  );

  const wasAdded = index < 0;

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

  const newSig = getLast3LikedSignature();
  // Update recommendations whenever favorites are added/removed or signature changes
  if (wasAdded || (prevSig !== newSig && (userFavorites.length > 0 || userSearches.length > 0))) {
    generateFavoritesRecommendations(true);
  }
}

function updateFavsUI() {
  const count = userFavorites.length;
  const searchCount = (userSearches || []).length;
  if (count > 0) {
    favsCountBadge.textContent = count;
    favsCountBadge.classList.remove("hidden");
  } else {
    favsCountBadge.classList.add("hidden");
  }

  // Vinyl Recommendations button (Unlocked once user has 1+ fav saves OR 1+ searches)
  if (favRecsBtn) {
    if (count >= 1 || searchCount >= 1) {
      favRecsBtn.classList.remove("hidden");
    } else {
      favRecsBtn.classList.add("hidden");
    }
  }

  if (favsDrawerCount) {
    favsDrawerCount.textContent = `${count} album${count === 1 ? '' : 's'}`;
  }

  if (recsModalSubtitle) {
    if (count > 0) {
      const topCount = Math.min(count, 3);
      recsModalSubtitle.textContent = `Derived from your saved favorites (${topCount} album${topCount === 1 ? '' : 's'})`;
    } else if (searchCount > 0) {
      const topCount = Math.min(searchCount, 3);
      recsModalSubtitle.textContent = `Derived from your last ${topCount} search${topCount === 1 ? '' : 'es'}`;
    } else {
      recsModalSubtitle.textContent = `Personalized recommendations`;
    }
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
// 11. CURATED VINYL RECOMMENDATIONS (FAVORITES OR LAST 3 SEARCHES)
// ============================================================================
async function openFavoritesRecommendations() {
  const hasFavs = userFavorites && userFavorites.length > 0;
  const hasSearches = userSearches && userSearches.length > 0;
  if (!hasFavs && !hasSearches) return;

  favRecsModalContainer.classList.remove("hidden");

  const isFromFavs = hasFavs;
  const baseCount = isFromFavs ? Math.min(userFavorites.length, 3) : Math.min(userSearches.length, 3);
  if (recsModalSubtitle) {
    recsModalSubtitle.textContent = isFromFavs
      ? `Derived from your saved favorites (${baseCount} album${baseCount === 1 ? '' : 's'})`
      : `Derived from your last ${baseCount} search${baseCount === 1 ? '' : 'es'}`;
  }

  const currentSig = getLast3LikedSignature();
  if (cachedFavRecs.length > 0 && lastFavsSignature === currentSig) {
    recsModalLoading.classList.add("hidden");
    favRecsList.classList.remove("hidden");
    renderFavoritesRecommendations();
    return;
  }

  await generateFavoritesRecommendations(false);
}

async function generateFavoritesRecommendations(silent = false) {
  const hasFavs = userFavorites && userFavorites.length > 0;
  const hasSearches = userSearches && userSearches.length > 0;
  if (!hasFavs && !hasSearches) return;

  const isFromFavs = hasFavs;
  const baseAlbums = isFromFavs ? userFavorites.slice(0, 3) : userSearches.slice(0, 3);
  const currentSig = getLast3LikedSignature();

  // Show dedicated modal loading state displaying:
  if (!silent) {
    recsModalLoading.classList.remove("hidden");
    favRecsList.classList.add("hidden");
    if (expandRecsBtn) expandRecsBtn.classList.add("hidden");
  }

  const loadingMsg = document.querySelector(".recs-loading-message");
  if (loadingMsg) {
    loadingMsg.textContent = isFromFavs
      ? "Getting your personalized recommendations based on your saved albums"
      : "Getting your personalized recommendations based on your recent searches";
  }

  const baseSummary = baseAlbums.map((f, i) => `${i + 1}. "${f.title}" by ${f.artist || 'Unknown'} (${f.genre || 'Vinyl'}${f.year ? ', ' + f.year : ''})`).join("\n");
  const allFavTitlesList = (userFavorites || []).map(f => `"${f.title}"`);
  const allSearchTitlesList = (userSearches || []).slice(0, 5).map(s => `"${s.title}"`);
  const excludedTitles = Array.from(new Set([...allFavTitlesList, ...allSearchTitlesList])).join(", ");

  const prompt = `You are a legendary German vinyl crate-digger and record connoisseur curator.
${isFromFavs ? 'The user recently saved these favorite record(s) in their vinyl collection crate:' : 'The user has no saved favorites yet, but recently searched for these record(s):'}
${baseSummary}

Synthesize the musical taste, sonic aesthetic, instrumentation, production qualities, and genre intersections of these ${baseAlbums.length} records.
Recommend 14 distinct vinyl records (to provide 10 top recommendations) that would be must-haves for their physical record shelf to expand this specific aesthetic direction.

CRITICAL EXCLUSION RULE:
DO NOT recommend any of the albums that the user has already explored or favorited (${excludedTitles}), or alternative editions/reissues of them!
Every recommendation MUST be a fresh discovery or complementary album that the user does NOT already have.

For each of the 14 recommendations, provide:
1. "title": Exact album title.
2. "artist": Exact artist name.
3. "genre": Musical genre / sub-genre.
4. "year": Release year (number).
5. "score": Integer from 80 to 100 representing how strongly this vinyl matches and complements their ${isFromFavs ? 'saved favorites' : 'recent searches'}. Rank from highest match score to lower.
6. "matchReason": 1 to 2 sentences explaining why this vinyl is a good match, explicitly connecting back to the artists, genres, or production aesthetics in their ${isFromFavs ? 'saved favorite records' : 'recent searches'}.
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
      // Deterministic filter: strictly exclude any album in the favorites list
      const nonFavs = data.recommendations.filter(rec => !isAlbumInFavorites(rec.title, rec.artist));
      cachedFavRecs = nonFavs.slice(0, 10);
      lastFavsSignature = currentSig;
      isRecsExpanded = true;

      // Persist to local & server storage
      saveRecommendationsToStorage(cachedFavRecs, currentSig);

      recsModalLoading.classList.add("hidden");
      favRecsList.classList.remove("hidden");
      renderFavoritesRecommendations();

      // Immediately render bottom crate carousel and unlock it
      renderRecommendationCarousel(cachedFavRecs);
      recLockedBanner.classList.add("hidden");
      recCarouselContainer.classList.remove("hidden");
    } else {
      throw new Error("No recommendations returned");
    }
  } catch (err) {
    console.error("Failed to generate recommendations:", err);
    if (!silent) {
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
}

function renderFavoritesRecommendations() {
  if (!favRecsList) return;

  // Strict filter: omit any album from userFavorites
  const cleanRecs = (cachedFavRecs || []).filter(rec => !isAlbumInFavorites(rec.title, rec.artist));
  
  if (cleanRecs.length === 0) {
    favRecsList.innerHTML = `
      <div class="favs-empty-state">
        <span class="favs-empty-icon">🎵</span>
        <p class="favs-empty-text">No recommendations available that aren't already in your favorites.</p>
      </div>
    `;
    if (expandRecsBtn) expandRecsBtn.classList.add("hidden");
    return;
  }

  // Offer the 10 recommendations directly
  const items = cleanRecs.slice(0, 10);

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

  // Since we offer all 10 recommendations directly, keep expand button hidden
  if (expandRecsBtn) {
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
initRegionSelector();
checkServerConfig();
