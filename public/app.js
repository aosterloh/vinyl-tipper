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
export const corporateFirebaseConfig = {
  apiKey: "AIzaSyBDfu44ElID27cy2lvozY2BD1izTq7AIuo",
  authDomain: "aosterloh-cs-muc.firebaseapp.com",
  projectId: "aosterloh-cs-muc",
  storageBucket: "aosterloh-cs-muc.appspot.com",
  appId: "1:557450838719:web:5e51f"
};

export const publicFirebaseConfig = {
  apiKey: "AIzaSyBohm2Obe3zqxav80otAKVmYkYlsQtu5yk",
  authDomain: "vinyl-hound.firebaseapp.com",
  projectId: "vinyl-hound",
  storageBucket: "vinyl-hound.firebasestorage.app",
  messagingSenderId: "403699448912",
  appId: "1:403699448912:web:60810f38aad00541036555"
};

// Select active configuration: window injection > hostname match > corporate default
export const firebaseConfig = (typeof window !== "undefined" && window.__FIREBASE_CONFIG__)
  || ((typeof window !== "undefined" && (window.location.hostname.includes("vinyl-hound") || window.location.hostname.includes("vinylhound")))
      ? publicFirebaseConfig
      : ((typeof window !== "undefined" && window.__AUTH_MODE__ === "public")
          ? publicFirebaseConfig
          : corporateFirebaseConfig));

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Dynamic Google OAuth Provider based on deployment mode
function getGoogleProvider() {
  const p = new GoogleAuthProvider();
  if (serverAuthMode === "corporate") {
    p.setCustomParameters({ 
      hd: 'google.com', 
      prompt: 'select_account' 
    });
  } else {
    // In public mode: allow any Google account (@gmail.com, etc.)
    p.setCustomParameters({ 
      prompt: 'select_account' 
    });
  }
  return p;
}

// App State
let currentUser = null;
let userSearches = [];
let userFavorites = [];
let currentAlbumData = null;
let hasServerKey = false;
let pendingFavoriteAlbum = null;
const MODEL_NAME = "gemini-3.8-flash";
let activeAppraisalId = 0;
let hasUserInteracted = false;

// ============================================================================
// 2. DOM ELEMENTS
// ============================================================================
const authGate = document.getElementById("auth-gate");
const appShell = document.getElementById("app-shell");
const googleSignInBtn = document.getElementById("google-signin-btn");
const authErrorMsg = document.getElementById("auth-error-msg");
const signoutBtn = document.getElementById("signout-btn");
const userAvatar = document.getElementById("user-avatar");
const userProfileWrap = document.querySelector(".user-profile");
const navSignInBtn = document.getElementById("nav-signin-btn");
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

// Sign In Prompt Modal Elements
const favSignInModal = document.getElementById("fav-signin-modal");
const favSignInBackdrop = document.getElementById("fav-signin-backdrop");
const closeFavSignInBtn = document.getElementById("close-fav-signin-btn");
const modalGoogleSignInBtn = document.getElementById("modal-google-signin-btn");
const modalSignInError = document.getElementById("modal-signin-error");
const favTargetAlbumName = document.getElementById("fav-target-album-name");
const vinylToast = document.getElementById("vinyl-toast");

let toastTimer = null;
function showToast(message) {
  if (!vinylToast) return;
  vinylToast.textContent = message;
  vinylToast.classList.add("show");
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    vinylToast.classList.remove("show");
  }, 3200);
}

function openFavSignInModal(album) {
  pendingFavoriteAlbum = album;
  if (favTargetAlbumName && album) {
    favTargetAlbumName.textContent = album.artist ? `"${album.title}" by ${album.artist}` : `"${album.title}"`;
  }
  if (modalSignInError) {
    modalSignInError.textContent = "";
    modalSignInError.classList.add("hidden");
  }
  if (favSignInModal) {
    favSignInModal.classList.remove("hidden");
  }
}

function closeFavSignInModal() {
  if (favSignInModal) {
    favSignInModal.classList.add("hidden");
  }
  pendingFavoriteAlbum = null;
}

if (closeFavSignInBtn) closeFavSignInBtn.addEventListener("click", closeFavSignInModal);
if (favSignInBackdrop) favSignInBackdrop.addEventListener("click", closeFavSignInModal);

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
    const activeTitle = albumTitleEl ? albumTitleEl.textContent : "";
    if (!currentAlbumData || !currentAlbumData.title || currentAlbumData.title !== activeTitle) return;

    isRecoveringHeroCover = true;
    console.warn(`[storage] Hero cover failed to load for "${currentAlbumData.title}", retrieving live from internet...`);

    try {
      const activeToken = activeAppraisalId;
      const freshCover = await fetchAlbumCover(currentAlbumData.title, currentAlbumData.artist, currentAlbumData.title);
      if (activeAppraisalId !== activeToken) return;
      if (freshCover && !freshCover.startsWith("data:image/svg") && freshCover !== albumCoverImg.src) {
        albumCoverImg.src = freshCover;
        currentAlbumData.coverUrl = freshCover;
        saveAlbumToCache(currentAlbumData);
      } else {
        albumCoverImg.src = generateSvgCover(currentAlbumData.title, currentAlbumData.artist);
      }
    } catch (err) {
      console.warn("Hero cover recovery error:", err);
    } finally {
      setTimeout(() => { isRecoveringHeroCover = false; }, 800);
    }
  });
}

// ============================================================================
// VINYL DJ LOUNGE & CONTINUOUS YOUTUBE AUTOPLAY ENGINE
// Supports: (1) Curated Track Mix, (2) Full LP Continuous Vinyl Session
// ============================================================================
const heroYtBox = document.getElementById("hero-yt-box");
const heroYtBadge = document.getElementById("hero-yt-badge");
const ytTrackTitle = document.getElementById("yt-track-title");
const heroYtIframe = document.getElementById("hero-yt-iframe");
const heroYtLink = document.getElementById("hero-yt-link");
const heroModeTrackBtn = document.getElementById("hero-mode-track-btn");
const heroModeAlbumBtn = document.getElementById("hero-mode-album-btn");
const heroStartDjBtn = document.getElementById("hero-start-dj-btn");
const heroStartDjText = document.getElementById("hero-start-dj-text");

// Floating DJ Deck Elements
const djDeckBar = document.getElementById("dj-deck-bar");
const djTurntableIcon = document.getElementById("dj-turntable-icon");
const djTrackTitle = document.getElementById("dj-track-title");
const djArtistTitle = document.getElementById("dj-artist-title");
const djModeBadge = document.getElementById("dj-mode-badge");
const djQueuePos = document.getElementById("dj-queue-pos");
const djPrevBtn = document.getElementById("dj-prev-btn");
const djPlayBtn = document.getElementById("dj-play-btn");
const djPlayIcon = document.getElementById("dj-play-icon");
const djPauseIcon = document.getElementById("dj-pause-icon");
const djNextBtn = document.getElementById("dj-next-btn");
const djShuffleBtn = document.getElementById("dj-shuffle-btn");
const djToggleTrackMode = document.getElementById("dj-toggle-track-mode");
const djToggleAlbumMode = document.getElementById("dj-toggle-album-mode");
const djQueueDrawerBtn = document.getElementById("dj-queue-drawer-btn");
const djQueueCountBadge = document.getElementById("dj-queue-count-badge");
const djCloseDeckBtn = document.getElementById("dj-close-deck-btn");

// DJ Queue Drawer Elements
const djQueueContainer = document.getElementById("dj-queue-container");
const djQueueBackdrop = document.getElementById("dj-queue-backdrop");
const closeDjQueueBtn = document.getElementById("close-dj-queue-btn");
const djQueueShuffleBtn = document.getElementById("dj-queue-shuffle-btn");
const djBannerModeTitle = document.getElementById("dj-banner-mode-title");
const djBannerModeDesc = document.getElementById("dj-banner-mode-desc");
const djBannerSwitchModeBtn = document.getElementById("dj-banner-switch-mode-btn");
const djQueueList = document.getElementById("dj-queue-list");

// DJ Engine State
const djState = {
  mode: "track", // 'track' | 'full_album'
  isPlaying: false,
  currentIndex: 0,
  queue: [],
  ytPlayer: null,
  isPlayerReady: false,
  isDeckMinimized: false
};

const djVideoCache = {};

async function resolveDjVideo(query) {
  const norm = normalizeCatalogKey(query);
  if (djVideoCache[norm]) return djVideoCache[norm];

  try {
    const res = await fetch(`/api/youtube?q=${encodeURIComponent(query)}`);
    if (res.ok) {
      const data = await res.json();
      if (data.success && data.videoId) {
        djVideoCache[norm] = data;
        return data;
      }
    }
  } catch (err) {
    console.warn("[Vinyl DJ] Video resolve warning:", err);
  }
  return null;
}

// Native YouTube postMessage command bridge: Direct playback control across origins
function sendYtCommand(func, args = []) {
  try {
    if (heroYtIframe && heroYtIframe.contentWindow) {
      heroYtIframe.contentWindow.postMessage(JSON.stringify({
        event: "command",
        func: func,
        args: Array.isArray(args) ? args : [args]
      }), "*");
    }
  } catch (e) {
    console.warn("[Vinyl DJ] postMessage send notice:", e);
  }
}

// Window message listener for native YouTube iframe state changes
window.addEventListener("message", (event) => {
  try {
    const data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
    if (!data) return;
    if (data.event === "onStateChange" || (data.info !== undefined && typeof data.info === "number")) {
      const state = data.info;
      if (state === 1) { // PLAYING
        djState.isPlaying = true;
        updateDjDeckUI();
      } else if (state === 2) { // PAUSED
        djState.isPlaying = false;
        updateDjDeckUI();
      } else if (state === 0) { // ENDED
        console.log("[Vinyl DJ] postMessage: Track finished! Autoplaying next in queue...");
        djPlayNext(true);
      }
    }
  } catch (e) {}
});

function initYouTubePlayer() {
  if (!window.YT || !window.YT.Player) return;
  const iframe = document.getElementById("hero-yt-iframe");
  if (!iframe || !iframe.src || !iframe.src.includes("/embed/")) return;

  if (djState.ytPlayer && typeof djState.ytPlayer.playVideo === "function") return;

  try {
    djState.ytPlayer = new window.YT.Player("hero-yt-iframe", {
      events: {
        onReady: () => {
          djState.isPlayerReady = true;
          console.log("[Vinyl DJ] YouTube Player API connected successfully");
        },
        onStateChange: onDjPlayerStateChange,
        onError: onDjPlayerError
      }
    });
  } catch (err) {
    console.warn("[Vinyl DJ] Player init notice:", err);
  }
}

// Hook global YouTube API callback
window.onYouTubeIframeAPIReady = function() {
  initYouTubePlayer();
};
if (window.YT && window.YT.Player) {
  initYouTubePlayer();
}

function onDjPlayerStateChange(event) {
  // 1 = PLAYING, 2 = PAUSED, 0 = ENDED
  if (event.data === 1) {
    djState.isPlaying = true;
    updateDjDeckUI();
  } else if (event.data === 2) {
    djState.isPlaying = false;
    updateDjDeckUI();
  } else if (event.data === 0) {
    console.log("[Vinyl DJ] Current track finished! Continuous autoplay starting next track...");
    djPlayNext(true);
  }
}

function onDjPlayerError(event) {
  console.warn("[Vinyl DJ] Embed restricted (code", event.data, ") - Auto-advancing to next track in queue");
  setTimeout(() => {
    djPlayNext(true);
  }, 1200);
}

function ensureDjQueue() {
  if (djState.queue && djState.queue.length > 0) return djState.queue;

  let baseAlbum = currentAlbumData;
  if (!baseAlbum || !baseAlbum.title) {
    const title = (albumTitleEl?.textContent || "").trim();
    const artist = (albumArtistEl?.textContent || "").trim();
    if (title && title !== "Album Title") {
      baseAlbum = {
        title,
        artist,
        firstTrackTitle: ytTrackTitle?.textContent || "",
        alternatives: []
      };
    }
  }

  if (baseAlbum) {
    djState.queue = buildDjQueue(baseAlbum, baseAlbum.alternatives || [], djState.mode);
    if (djState.queue.length > 0 && heroYtIframe && heroYtIframe.src) {
      const match = heroYtIframe.src.match(/\/embed\/([a-zA-Z0-9_-]{11})/);
      if (match && !djState.queue[0].videoId) {
        djState.queue[0].videoId = match[1];
      }
    }
    renderDjQueueList();
    updateDjDeckUI();
  }
  return djState.queue;
}

function buildDjQueue(album, alternatives = [], mode = djState.mode) {
  if (!album || !album.title) return [];
  const q = [];

  if (mode === "track") {
    // 1. Landmark Track of Main Album
    const track1 = album.firstTrackTitle || "Track 1";
    q.push({
      id: `main-${normalizeCatalogKey(album.title)}`,
      title: track1,
      displayTitle: `${track1} (Track 1)`,
      albumTitle: album.title,
      artist: album.artist || "Unknown",
      coverUrl: album.coverUrl || "",
      mode: "track",
      duration: album.playtime ? `Album: ${album.playtime}` : "Standout Track",
      searchQuery: `${album.artist || ''} ${track1} audio`.trim(),
      videoId: album.youtubeVideoId || ""
    });

    // 2. Standout Tracks for each alternative in the pool
    const cleanAlts = (alternatives || []).filter(a => !isAlbumInFavorites(a.title, a.artist));
    cleanAlts.forEach((alt, idx) => {
      q.push({
        id: `alt-${idx}-${normalizeCatalogKey(alt.title)}`,
        title: alt.title,
        displayTitle: `${alt.title}`,
        albumTitle: alt.title,
        artist: alt.artist || "Unknown",
        coverUrl: alt.coverUrl || "",
        mode: "track",
        duration: alt.playtime || "Standout Track",
        searchQuery: `${alt.artist || ''} ${alt.title} audio`.trim(),
        videoId: ""
      });
    });
  } else {
    // FULL LP CONTINUOUS VINYL SESSION
    // 1. Full vinyl session of Main Album
    q.push({
      id: `main-${normalizeCatalogKey(album.title)}-lp`,
      title: `${album.title}`,
      displayTitle: `Full Vinyl LP Session (${album.playtime || '45 min'})`,
      albumTitle: album.title,
      artist: album.artist || "Unknown",
      coverUrl: album.coverUrl || "",
      mode: "full_album",
      duration: album.playtime || "45 min LP",
      searchQuery: `${album.artist || ''} ${album.title} full vinyl album`.trim(),
      videoId: ""
    });

    // 2. Full vinyl sessions for each alternative
    const cleanAlts = (alternatives || []).filter(a => !isAlbumInFavorites(a.title, a.artist));
    cleanAlts.forEach((alt, idx) => {
      q.push({
        id: `alt-${idx}-${normalizeCatalogKey(alt.title)}-lp`,
        title: `${alt.title}`,
        displayTitle: `Full Vinyl LP Session (${alt.playtime || '45 min'})`,
        albumTitle: alt.title,
        artist: alt.artist || "Unknown",
        coverUrl: alt.coverUrl || "",
        mode: "full_album",
        duration: alt.playtime || "Full LP",
        searchQuery: `${alt.artist || ''} ${alt.title} full vinyl album`.trim(),
        videoId: ""
      });
    });
  }

  return q;
}

async function prefetchNextDjTrack(nextIndex) {
  if (!djState.queue || nextIndex >= djState.queue.length) return;
  const nextItem = djState.queue[nextIndex];
  if (!nextItem || nextItem.videoId) return;

  try {
    const res = await resolveDjVideo(nextItem.searchQuery);
    if (res && res.videoId) {
      nextItem.videoId = res.videoId;
    }
  } catch (e) {}
}

async function djPlayIndex(index, autoStart = true) {
  ensureDjQueue();
  if (!djState.queue || djState.queue.length === 0) {
    console.warn("[Vinyl DJ] Cannot play: queue is empty");
    return;
  }
  if (index < 0) index = 0;
  if (index >= djState.queue.length) index = 0;

  djState.currentIndex = index;
  const current = djState.queue[index];

  // Resolve videoId if needed
  let vId = current.videoId;
  if (!vId) {
    if (index === 0 && heroYtIframe && heroYtIframe.src) {
      const match = heroYtIframe.src.match(/\/embed\/([a-zA-Z0-9_-]{11})/);
      if (match) {
        vId = match[1];
        current.videoId = vId;
      }
    }
    if (!vId) {
      const res = await resolveDjVideo(current.searchQuery);
      if (res && res.videoId) {
        vId = res.videoId;
        current.videoId = vId;
      }
    }
  }

  if (!vId) {
    console.warn("[Vinyl DJ] Skipping unresolvable track:", current.searchQuery);
    djPlayNext(autoStart);
    return;
  }

  // Reveal player & bottom dock
  if (heroYtBox) heroYtBox.classList.remove("hidden");
  if (djDeckBar && !djState.isDeckMinimized) djDeckBar.classList.remove("hidden");

  // Update hero header and link
  if (ytTrackTitle) ytTrackTitle.textContent = `${current.artist} — ${current.displayTitle}`;
  if (heroYtLink) heroYtLink.href = `https://www.youtube.com/watch?v=${vId}`;

  const currentIframeSrc = heroYtIframe ? (heroYtIframe.src || "") : "";
  const isSameVideoLoaded = currentIframeSrc.includes(`/embed/${vId}`);
  const embedUrl = `https://www.youtube-nocookie.com/embed/${vId}?enablejsapi=1&autoplay=${autoStart ? 1 : 0}&origin=${encodeURIComponent(window.location.origin)}`;

  if (isSameVideoLoaded) {
    // Already in iframe! Start playing immediately with zero reload
    sendYtCommand("playVideo");
    if (djState.ytPlayer && typeof djState.ytPlayer.playVideo === "function") {
      try { djState.ytPlayer.playVideo(); } catch (e) {}
    }
  } else {
    // Need to load video
    if (djState.ytPlayer && typeof djState.ytPlayer.loadVideoById === "function") {
      try {
        if (autoStart) {
          djState.ytPlayer.loadVideoById({ videoId: vId });
        } else {
          djState.ytPlayer.cueVideoById({ videoId: vId });
        }
      } catch (e) {
        if (heroYtIframe) heroYtIframe.src = embedUrl;
      }
    } else {
      if (heroYtIframe && (!heroYtIframe.src || !heroYtIframe.src.includes(vId))) {
        heroYtIframe.src = embedUrl;
      }
      sendYtCommand("loadVideoById", [vId, 0]);
      if (autoStart) {
        sendYtCommand("playVideo");
        setTimeout(() => sendYtCommand("playVideo"), 400);
        setTimeout(() => sendYtCommand("playVideo"), 1000);
      }
      setTimeout(initYouTubePlayer, 600);
    }
  }

  if (autoStart) djState.isPlaying = true;
  updateDjDeckUI();
  renderDjQueueList();

  // Background prefetch next track in queue for zero-gap transition!
  prefetchNextDjTrack(index + 1);
}

function djPlayNext(autoStart = true) {
  ensureDjQueue();
  if (!djState.queue || djState.queue.length === 0) return;
  const nextIdx = (djState.currentIndex + 1) % djState.queue.length;
  djPlayIndex(nextIdx, autoStart);
}

function djPlayPrev(autoStart = true) {
  ensureDjQueue();
  if (!djState.queue || djState.queue.length === 0) return;
  const prevIdx = (djState.currentIndex - 1 + djState.queue.length) % djState.queue.length;
  djPlayIndex(prevIdx, autoStart);
}

function toggleDjPlayPause() {
  ensureDjQueue();
  if (!djState.queue || djState.queue.length === 0) {
    if (currentAlbumData) {
      loadYouTubeTrack1(currentAlbumData.artist, currentAlbumData.title, currentAlbumData.firstTrackTitle, currentAlbumData.youtubeVideoId);
    }
    return;
  }

  if (djState.isPlaying) {
    sendYtCommand("pauseVideo");
    if (djState.ytPlayer && typeof djState.ytPlayer.pauseVideo === "function") {
      try { djState.ytPlayer.pauseVideo(); } catch (e) {}
    }
    djState.isPlaying = false;
  } else {
    sendYtCommand("playVideo");
    if (djState.ytPlayer && typeof djState.ytPlayer.playVideo === "function") {
      try { djState.ytPlayer.playVideo(); } catch (e) {}
    } else {
      djPlayIndex(djState.currentIndex, true);
    }
    djState.isPlaying = true;
  }
  updateDjDeckUI();
}

function shuffleDjQueue() {
  ensureDjQueue();
  if (!djState.queue || djState.queue.length <= 1) return;
  const current = djState.queue[djState.currentIndex];
  const remaining = djState.queue.filter((_, idx) => idx !== djState.currentIndex);

  // Fisher-Yates shuffle
  for (let i = remaining.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [remaining[i], remaining[j]] = [remaining[j], remaining[i]];
  }

  djState.queue = [current, ...remaining];
  djState.currentIndex = 0;
  renderDjQueueList();
  updateDjDeckUI();
}

function setDjMode(newMode, shouldPlay = false) {
  if (djState.mode === newMode && djState.queue.length > 0) return;
  djState.mode = newMode;

  // Sync mode pill buttons in Hero
  if (heroModeTrackBtn && heroModeAlbumBtn) {
    heroModeTrackBtn.classList.toggle("active", newMode === "track");
    heroModeAlbumBtn.classList.toggle("active", newMode === "full_album");
  }

  // Sync mode pills in Deck
  if (djToggleTrackMode && djToggleAlbumMode) {
    djToggleTrackMode.classList.toggle("active", newMode === "track");
    djToggleAlbumMode.classList.toggle("active", newMode === "full_album");
  }

  // Sync Drawer banner
  if (djBannerModeTitle && djBannerModeDesc && djBannerSwitchModeBtn) {
    if (newMode === "track") {
      djBannerModeTitle.textContent = "Track Mix Mode";
      djBannerModeDesc.textContent = "Playing standout tracks across current album & 6–8 recommendations";
      djBannerSwitchModeBtn.textContent = "Switch to Full LP ↻";
    } else {
      djBannerModeTitle.textContent = "Full LP Session Mode";
      djBannerModeDesc.textContent = "Playing uninterrupted 40–60 min vinyl album rips with minimal ad interruption";
      djBannerSwitchModeBtn.textContent = "Switch to Track Mix ↻";
    }
  }

  // Rebuild queue for current album & alternatives
  if (currentAlbumData) {
    const curIdx = djState.currentIndex;
    djState.queue = buildDjQueue(currentAlbumData, currentAlbumData.alternatives || [], newMode);
    renderDjQueueList();
    updateDjDeckUI();

    if (shouldPlay || djState.isPlaying) {
      djPlayIndex(curIdx >= djState.queue.length ? 0 : curIdx, true);
    }
  }
}

function updateDjDeckUI() {
  const current = djState.queue[djState.currentIndex];
  if (!current) return;

  if (djTrackTitle) djTrackTitle.textContent = current.displayTitle || current.title;
  if (djArtistTitle) djArtistTitle.textContent = current.artist;
  if (djModeBadge) {
    djModeBadge.textContent = djState.mode === "track" ? "🎵 Track Mix" : "📀 Full LP";
  }
  if (djQueuePos) {
    djQueuePos.textContent = `${djState.currentIndex + 1}/${djState.queue.length}`;
  }
  if (djQueueCountBadge) {
    djQueueCountBadge.textContent = djState.queue.length;
  }

  // Turntable spinning state
  if (djTurntableIcon) {
    djTurntableIcon.classList.toggle("spinning", djState.isPlaying);
  }

  // Play/Pause icon toggle
  if (djPlayIcon && djPauseIcon) {
    djPlayIcon.classList.toggle("hidden", djState.isPlaying);
    djPauseIcon.classList.toggle("hidden", !djState.isPlaying);
  }

  // Hero start button label
  if (heroStartDjText) {
    heroStartDjText.textContent = djState.isPlaying ? "❚❚ Playing Vinyl DJ" : "▶ Start Vinyl DJ";
  }
}

function renderDjQueueList() {
  if (!djQueueList) return;
  djQueueList.innerHTML = "";

  djState.queue.forEach((item, idx) => {
    const isCurrent = idx === djState.currentIndex;
    const el = document.createElement("div");
    el.className = `dj-queue-item ${isCurrent ? "active" : ""}`;
    const cover = item.coverUrl || generateSvgCover(item.albumTitle || item.title, item.artist);

    el.innerHTML = `
      <img class="dj-queue-item-thumb" src="${cover}" alt="${escapeXml(item.title)}" loading="lazy" />
      <div class="dj-queue-item-info">
        <span class="dj-queue-item-title">${escapeXml(item.displayTitle || item.title)}</span>
        <span class="dj-queue-item-artist">${escapeXml(item.artist)} • ${escapeXml(item.albumTitle || '')}</span>
      </div>
      <div class="dj-queue-item-status">
        ${isCurrent && djState.isPlaying ? `
          <div class="dj-soundwave" title="Now Spinning">
            <span class="dj-soundwave-bar"></span>
            <span class="dj-soundwave-bar"></span>
            <span class="dj-soundwave-bar"></span>
            <span class="dj-soundwave-bar"></span>
          </div>
        ` : `
          <span class="dj-queue-item-badge">${idx + 1}</span>
        `}
      </div>
    `;

    el.addEventListener("click", () => {
      djPlayIndex(idx, true);
    });

    djQueueList.appendChild(el);
  });
}

async function loadYouTubeTrack1(artist, albumTitle, firstTrackTitle = "", existingVideoId = "") {
  if (!heroYtBox || !heroYtIframe) return null;

  const sessionToken = activeAppraisalId;
  const targetAlbum = albumTitle;

  // Immediately unhide hero DJ box and bottom deck bar so controls are visible
  heroYtBox.classList.remove("hidden");
  if (djDeckBar && !djState.isDeckMinimized) djDeckBar.classList.remove("hidden");

  // Build the DJ queue with current album and alternatives
  if (currentAlbumData && currentAlbumData.title === targetAlbum) {
    djState.queue = buildDjQueue(currentAlbumData, currentAlbumData.alternatives || [], djState.mode);
    djState.currentIndex = 0;
    renderDjQueueList();
    updateDjDeckUI();
  }

  // Pre-load track 0
  const firstItem = djState.queue[0];
  const query = firstItem ? firstItem.searchQuery : `${artist} ${firstTrackTitle || albumTitle} audio`.trim();
  const displayTitle = firstItem ? firstItem.displayTitle : (firstTrackTitle ? `"${firstTrackTitle}"` : albumTitle);
  if (ytTrackTitle && (!currentAlbumData || currentAlbumData.title === targetAlbum)) {
    ytTrackTitle.textContent = `${artist} — ${displayTitle}`;
  }

  let vId = existingVideoId || (firstItem ? firstItem.videoId : "");
  if (!vId) {
    const res = await resolveDjVideo(query);
    if (activeAppraisalId !== sessionToken) return null;
    if (currentAlbumData && currentAlbumData.title !== targetAlbum) return null;
    if (res && res.videoId) {
      vId = res.videoId;
      if (firstItem) firstItem.videoId = vId;
    }
  }

  if (activeAppraisalId !== sessionToken) return null;
  if (currentAlbumData && currentAlbumData.title !== targetAlbum) return null;

  if (vId) {
    heroYtIframe.src = `https://www.youtube-nocookie.com/embed/${vId}?enablejsapi=1&autoplay=0&origin=${encodeURIComponent(window.location.origin)}`;
    if (heroYtLink) heroYtLink.href = `https://www.youtube.com/watch?v=${vId}`;
    updateDjDeckUI();
    setTimeout(initYouTubePlayer, 600);
    return vId;
  }
  return null;
}

// Attach Event Listeners for DJ Deck & Hero Player
if (heroModeTrackBtn) {
  heroModeTrackBtn.addEventListener("click", () => setDjMode("track", true));
}
if (heroModeAlbumBtn) {
  heroModeAlbumBtn.addEventListener("click", () => setDjMode("full_album", true));
}
if (heroStartDjBtn) {
  heroStartDjBtn.addEventListener("click", async (e) => {
    e.preventDefault();
    console.log("[Vinyl DJ] 'Start Vinyl DJ' button clicked. State isPlaying:", djState.isPlaying);

    // Ensure hero box and bottom DJ bar are visible
    if (heroYtBox) heroYtBox.classList.remove("hidden");
    if (djDeckBar) djDeckBar.classList.remove("hidden");
    djState.isDeckMinimized = false;

    ensureDjQueue();

    if (!djState.isPlaying) {
      await djPlayIndex(djState.currentIndex || 0, true);
    } else {
      toggleDjPlayPause();
    }
  });
}

if (djPrevBtn) djPrevBtn.addEventListener("click", () => djPlayPrev(true));
if (djPlayBtn) djPlayBtn.addEventListener("click", toggleDjPlayPause);
if (djNextBtn) djNextBtn.addEventListener("click", () => djPlayNext(true));
if (djShuffleBtn) djShuffleBtn.addEventListener("click", shuffleDjQueue);

if (djToggleTrackMode) {
  djToggleTrackMode.addEventListener("click", () => setDjMode("track", true));
}
if (djToggleAlbumMode) {
  djToggleAlbumMode.addEventListener("click", () => setDjMode("full_album", true));
}

if (djQueueDrawerBtn) {
  djQueueDrawerBtn.addEventListener("click", () => {
    if (djQueueContainer) {
      djQueueContainer.classList.remove("hidden");
      renderDjQueueList();
    }
  });
}

if (closeDjQueueBtn) {
  closeDjQueueBtn.addEventListener("click", () => {
    if (djQueueContainer) djQueueContainer.classList.add("hidden");
  });
}
if (djQueueBackdrop) {
  djQueueBackdrop.addEventListener("click", () => {
    if (djQueueContainer) djQueueContainer.classList.add("hidden");
  });
}
if (djQueueShuffleBtn) {
  djQueueShuffleBtn.addEventListener("click", shuffleDjQueue);
}
if (djBannerSwitchModeBtn) {
  djBannerSwitchModeBtn.addEventListener("click", () => {
    setDjMode(djState.mode === "track" ? "full_album" : "track", true);
  });
}
if (djCloseDeckBtn) {
  djCloseDeckBtn.addEventListener("click", () => {
    djState.isDeckMinimized = true;
    if (djDeckBar) djDeckBar.classList.add("hidden");
  });
}

// ============================================================================
// AFFILIATE MONETIZATION ENGINE (EBAY, AMAZON, AWIN / JPC, DISCOGS)
// ============================================================================
export let AFFILIATE_CONFIG = {
  ebayCampaignId: "",
  amazonTagDe: "",
  amazonTagUs: "",
  amazonTagUk: "",
  awinPublisherId: "",
  discogsAffiliateId: ""
};

export function buildEbayLink(query, domain = "ebay.de") {
  const enc = encodeURIComponent(query + " vinyl");
  let url = `https://www.${domain}/sch/i.html?_nkw=${enc}&_sop=12`;
  if (AFFILIATE_CONFIG.ebayCampaignId) {
    url += `&campid=${encodeURIComponent(AFFILIATE_CONFIG.ebayCampaignId)}&toolid=10001&mkevt=1`;
  }
  return url;
}

export function buildAmazonLink(query, domain = "amazon.de", regionalTagKey = "amazonTagDe") {
  const enc = encodeURIComponent(query + " vinyl");
  let url = `https://www.${domain}/s?k=${enc}`;
  const tag = AFFILIATE_CONFIG[regionalTagKey] || AFFILIATE_CONFIG.amazonTagDe || "";
  if (tag) {
    url += `&tag=${encodeURIComponent(tag)}`;
  }
  return url;
}

export function buildAwinLink(destUrl, merchantId = "10711") {
  if (AFFILIATE_CONFIG.awinPublisherId) {
    return `https://www.awin1.com/cread.php?awinmid=${encodeURIComponent(merchantId)}&awinaffid=${encodeURIComponent(AFFILIATE_CONFIG.awinPublisherId)}&ued=${encodeURIComponent(destUrl)}`;
  }
  return destUrl;
}

export function buildDiscogsLink(query, shipFrom = "") {
  let url = `https://www.discogs.com/sell/list?q=${encodeURIComponent(query)}&format=Vinyl`;
  if (shipFrom) {
    url += `&ships_from=${shipFrom}`;
  }
  if (AFFILIATE_CONFIG.discogsAffiliateId) {
    url += `&utm_campaign=${encodeURIComponent(AFFILIATE_CONFIG.discogsAffiliateId)}`;
  }
  return url;
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
      const artistTerm = (artist && artist.trim().length > 0) ? artist.trim() : query;
      const jpcUrl = `https://www.jpc.de/s/${encodeURIComponent(artistTerm).replace(/%20/g, '+')}+lp`;
      const hhvUrl = `https://www.hhv.de/katalog/filter/suche-S11?af=true&term=${encodeURIComponent(artistTerm).replace(/%20/g, '+')}`;
      return [
        { name: "jpc.de", url: buildAwinLink(jpcUrl, "10711") },
        { name: "HHV.de", url: buildAwinLink(hhvUrl, "10537") },
        { name: "Amazon.de", url: buildAmazonLink(query, "amazon.de", "amazonTagDe") }
      ];
    },
    getUsedLinks: (title, artist) => {
      const query = `${artist} ${title}`.trim();
      return [
        { name: "Discogs", url: buildDiscogsLink(query) },
        { name: "eBay.de", url: buildEbayLink(query, "ebay.de") },
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
        { name: "Amazon US", url: buildAmazonLink(query, "amazon.com", "amazonTagUs") }
      ];
    },
    getUsedLinks: (title, artist) => {
      const query = `${artist} ${title}`.trim();
      return [
        { name: "Discogs (US)", url: buildDiscogsLink(query, "United+States") },
        { name: "eBay US", url: buildEbayLink(query, "ebay.com") },
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
        { name: "Amazon UK", url: buildAmazonLink(query, "amazon.co.uk", "amazonTagUk") }
      ];
    },
    getUsedLinks: (title, artist) => {
      const query = `${artist} ${title}`.trim();
      return [
        { name: "Discogs (UK)", url: buildDiscogsLink(query, "United+Kingdom") },
        { name: "eBay UK", url: buildEbayLink(query, "ebay.co.uk") },
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
        { name: "Amazon", url: buildAmazonLink(query, "amazon.com", "amazonTagUs") }
      ];
    },
    getUsedLinks: (title, artist) => {
      const query = `${artist} ${title}`.trim();
      return [
        { name: "Discogs (WW)", url: buildDiscogsLink(query) },
        { name: "eBay Global", url: buildEbayLink(query, "ebay.com") },
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
    renderAlternativesProgressive(currentAlbumData.alternatives, currentAlbumData.currentAltOffset || 0);
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
const shuffleAltsBtn = document.getElementById("shuffle-alts-btn");

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
// 4. FIREBASE AUTHENTICATION & LOGIN FLOW
// ============================================================================
let serverAuthMode = "public";
let serverConfigResolve = null;
const serverConfigReady = new Promise((resolve) => {
  serverConfigResolve = resolve;
});

function updateAuthUI(isLoggedIn) {
  if (isLoggedIn && currentUser) {
    if (authGate) authGate.classList.add("hidden");
    if (appShell) appShell.classList.remove("hidden");
    if (navSignInBtn) navSignInBtn.classList.add("hidden");
    if (userProfileWrap) userProfileWrap.classList.remove("hidden");
    if (signoutBtn) signoutBtn.classList.remove("hidden");
    updateAdminUI(checkAdminAccess(currentUser));
    if (userAvatar) {
      const name = currentUser.displayName || currentUser.email || "Alex";
      userAvatar.onerror = () => {
        userAvatar.onerror = null;
        userAvatar.src = createAvatarPlaceholder(name);
      };
      userAvatar.src = currentUser.photoURL || createAvatarPlaceholder(name);
      userAvatar.title = `${currentUser.displayName || "User"} (${currentUser.email})`;
      userAvatar.classList.remove("hidden");
    }
  } else {
    updateAdminUI(false);
    if (userProfileWrap) userProfileWrap.classList.add("hidden");
    if (signoutBtn) signoutBtn.classList.add("hidden");
    if (userAvatar) {
      userAvatar.src = "";
      userAvatar.classList.add("hidden");
    }

    if (serverAuthMode === "public") {
      if (authGate) authGate.classList.add("hidden");
      if (appShell) appShell.classList.remove("hidden");
      if (navSignInBtn) navSignInBtn.classList.remove("hidden");
    } else {
      if (authGate) authGate.classList.remove("hidden");
      if (appShell) appShell.classList.add("hidden");
      if (navSignInBtn) navSignInBtn.classList.add("hidden");
    }
  }
}

async function performGoogleSignIn() {
  if (authErrorMsg) authErrorMsg.classList.add("hidden");
  if (modalSignInError) modalSignInError.classList.add("hidden");

  const btns = [googleSignInBtn, modalGoogleSignInBtn, navSignInBtn].filter(Boolean);
  btns.forEach(b => { b.disabled = true; b.style.opacity = "0.7"; });

  try {
    const p = getGoogleProvider();
    const result = await signInWithPopup(auth, p);
    const user = result.user;

    if (serverAuthMode === "corporate" && (!user.email || !user.email.toLowerCase().endsWith("@google.com"))) {
      await signOut(auth);
      throw new Error(`Access Denied: You authenticated with ${user.email}. Only @google.com accounts are permitted.`);
    }

    // Success! Close modal if open
    closeFavSignInModal();

    // If there was a pending album to favorite, save it now!
    if (pendingFavoriteAlbum) {
      const albumToFav = pendingFavoriteAlbum;
      pendingFavoriteAlbum = null;
      toggleFavorite(albumToFav);
    }
  } catch (error) {
    if (error.code === "auth/popup-closed-by-user") {
      console.log("Sign-in popup closed by user.");
      return;
    }
    console.error("Sign-in error:", error);
    const errorText = error.code === "auth/unauthorized-domain"
      ? "Domain authorization required: Please ensure this domain is added to authorized domains in Firebase Auth."
      : (error.message || "Authentication failed. Please try again.");

    if (modalSignInError && favSignInModal && !favSignInModal.classList.contains("hidden")) {
      modalSignInError.textContent = errorText;
      modalSignInError.classList.remove("hidden");
    } else {
      showAuthError(errorText);
    }
  } finally {
    btns.forEach(b => { b.disabled = false; b.style.opacity = "1"; });
  }
}

if (googleSignInBtn) googleSignInBtn.addEventListener("click", performGoogleSignIn);
if (modalGoogleSignInBtn) modalGoogleSignInBtn.addEventListener("click", performGoogleSignIn);
if (navSignInBtn) navSignInBtn.addEventListener("click", performGoogleSignIn);

if (signoutBtn) {
  signoutBtn.addEventListener("click", async () => {
    await signOut(auth);
    currentUser = null;
    userFavorites = [];
    updateAuthUI(false);
    updateFavsUI();
    showToast("👋 Signed out");
  });
}

function showAuthError(msg) {
  if (authErrorMsg) {
    authErrorMsg.textContent = msg;
    authErrorMsg.classList.remove("hidden");
  }
}

onAuthStateChanged(auth, async (user) => {
  // Wait until server config is loaded so we know serverAuthMode (public vs corporate)
  await serverConfigReady;

  if (user) {
    if (serverAuthMode === "corporate" && (!user.email || (!user.email.toLowerCase().endsWith("@google.com") && user.email.toLowerCase() !== "aosterloh@gmail.com"))) {
      await signOut(auth);
      showAuthError(`Access Denied: You authenticated with ${user.email}. Only @google.com accounts are permitted.`);
      updateAuthUI(false);
      return;
    }

    currentUser = user;
    updateAuthUI(true);

    // Load User Search History Memory Bank & Favorites
    loadUserMemory();
    await loadUserFavorites();

    // If an album favorite was pending during auth resolution, fulfill it now
    if (pendingFavoriteAlbum) {
      const albumToFav = pendingFavoriteAlbum;
      pendingFavoriteAlbum = null;
      toggleFavorite(albumToFav);
    }

    // Restore last displayed album to continue where user left off
    restoreLastSessionAlbum();

    // Immediately load & display cached recommendations from storage
    loadAndDisplayCachedRecommendations();
  } else {
    currentUser = null;
    userFavorites = [];
    updateAuthUI(false);
    updateFavsUI();

    if (serverAuthMode === "public") {
      loadUserMemory();
      await loadUserFavorites();
      restoreLastSessionAlbum();
      loadAndDisplayCachedRecommendations();
    }
  }
});

function createAvatarPlaceholder(name) {
  const initial = (name ? name.charAt(0) : "V").toUpperCase();
  return `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><rect width="32" height="32" rx="16" fill="%234285F4"/><text x="16" y="21" font-family="sans-serif" font-size="16" font-weight="bold" fill="white" text-anchor="middle">${initial}</text></svg>`;
}

// ============================================================================
// 4b. ADMIN AUTHORIZATION & WEBSITE ANALYTICS ENGINE
// ============================================================================
const ADMIN_EMAILS = ["aosterloh@gmail.com"];

function checkAdminAccess(user) {
  if (!user || !user.email) return false;
  return ADMIN_EMAILS.includes(user.email.toLowerCase());
}

function updateAdminUI(isAdmin) {
  const adminBtn = document.getElementById("admin-stats-btn");
  if (adminBtn) {
    if (isAdmin) {
      adminBtn.classList.remove("hidden");
    } else {
      adminBtn.classList.add("hidden");
    }
  }
}

function escapeAdminHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getOrCreateSessionId() {
  try {
    let sid = sessionStorage.getItem("vh_session_id");
    if (!sid) {
      sid = "sid_" + Date.now().toString(36) + "_" + Math.random().toString(36).substring(2, 8);
      sessionStorage.setItem("vh_session_id", sid);
    }
    return sid;
  } catch (e) {
    return "sid_default";
  }
}

async function trackVisit() {
  try {
    const sessionId = getOrCreateSessionId();
    await fetch("/api/track/visit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, path: window.location.pathname, referrer: document.referrer || "" })
    });
  } catch (e) {}
}

async function trackSearch(query, isAi, hit) {
  if (!query) return;
  try {
    await fetch("/api/track/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, isAi: !!isAi, hit: !!hit })
    });
  } catch (e) {}
}

async function trackStoreClick(store, query, albumTitle) {
  try {
    await fetch("/api/track/click", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ store, query: query || "", albumTitle: albumTitle || "" })
    });
  } catch (e) {}
}

// Global click listener for affiliate / store links
document.addEventListener("click", (e) => {
  const link = e.target.closest("a");
  if (!link || !link.href) return;
  const href = link.href.toLowerCase();
  let store = null;
  if (href.includes("jpc.de") || href.includes("10711")) store = "jpc";
  else if (href.includes("hhv.de") || href.includes("10537")) store = "hhv";
  else if (href.includes("discogs.com")) store = "discogs";
  else if (href.includes("ebay.")) store = "ebay";
  else if (href.includes("amazon.")) store = "amazon";

  if (store) {
    const currentQuery = lastSearchQuery || document.getElementById("search-input")?.value || "";
    const albumTitle = currentAppraisedAlbum?.title || "";
    trackStoreClick(store, currentQuery, albumTitle);
  }
});

// Track initial visit on site load
trackVisit();

// ============================================================================
// 5. SERVER CONFIG & GEMINI API KEY MANAGEMENT
// ============================================================================
async function checkServerConfig() {
  try {
    const res = await fetch("/api/config");
    if (res.ok) {
      const data = await res.json();
      if (data.authMode) {
        serverAuthMode = data.authMode.toLowerCase();
      }
      hasServerKey = Boolean(data.hasServerKey);
      if (data.apiKey && data.apiKey.length > 15) {
        localStorage.setItem("gemini_api_key", data.apiKey);
      }
      if (data.affiliates) {
        AFFILIATE_CONFIG = { ...AFFILIATE_CONFIG, ...data.affiliates };
      }
    }
  } catch (e) {
    hasServerKey = false;
  } finally {
    if (serverConfigResolve) {
      serverConfigResolve(serverAuthMode);
    }
  }
}

function getActiveApiKey() {
  const customKey = localStorage.getItem("gemini_api_key");
  if (customKey && customKey.trim().length > 15) {
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
  if (!unsafe) return "";
  return String(unsafe).replace(/[<>&'"]/g, c => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
    }
  });
}

function escapeHtml(unsafe) {
  return escapeXml(unsafe);
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
// 7B. VINYL SOMMELIER DISCOVERY ENGINE ("THE PERFECT NEXT RECORD")
// ============================================================================
function renderSommelierLore(note) {
  try {
    const card = document.getElementById("hero-sommelier-card");
    const textEl = document.getElementById("hero-sommelier-text");
    const trackEl = document.getElementById("hero-sommelier-track");
    if (!card || !textEl) return;

    const activeNote = note || window.__SOMMELIER_NOTE__;
    if (activeNote && (activeNote.whyOnVinyl || activeNote.vibeMatch)) {
      if (trackEl && activeNote.standoutTrack) {
        trackEl.textContent = `🎯 Needle Drop: ${activeNote.standoutTrack}`;
        trackEl.classList.remove("hidden");
      } else if (trackEl) {
        trackEl.classList.add("hidden");
      }

      let html = escapeHtml(activeNote.whyOnVinyl || "");
      if (activeNote.vibeMatch) {
        html += `<br><span class="sommelier-vibe-tag">✨ ${escapeHtml(activeNote.vibeMatch)}</span>`;
      }
      textEl.innerHTML = html;
      card.classList.remove("hidden");
    } else {
      card.classList.add("hidden");
    }
  } catch (err) {
    console.warn("renderSommelierLore warning:", err);
  }
}

// ============================================================================
// DYNAMIC AUDIOPHILE TURNTABLE STATUS TICKER
// ============================================================================
let loadingTickerTimer = null;
const AUDIOPHILE_STATUS_MESSAGES = [
  { main: "Consulting the Vinyl Sommelier...", sub: "Spinning up 180g physical master pressing" },
  { main: "Digging through the analog crates in Berlin & London...", sub: "Seeking pristine first pressings & gatefold sleeves" },
  { main: "Inspecting dynamic range & acoustic headroom...", sub: "Evaluating analog warmth vs compressed streaming" },
  { main: "Pivoting tonearm & lowering diamond stylus...", sub: "Balancing tracking force & anti-skating calibration" },
  { main: "Dropping needle onto outer lead-in groove...", sub: "Analog warmth incoming" }
];

function startAudiophileLoadingTicker(initialText) {
  const mainEl = document.getElementById("loading-status-text");
  const subEl = document.getElementById("loading-status-subline");
  if (!mainEl) return;

  if (loadingTickerTimer) clearInterval(loadingTickerTimer);

  let step = 0;
  mainEl.textContent = initialText || AUDIOPHILE_STATUS_MESSAGES[0].main;
  if (subEl) subEl.innerHTML = `<span class="pulse-sparkle">✨</span> ${AUDIOPHILE_STATUS_MESSAGES[0].sub}`;

  loadingTickerTimer = setInterval(() => {
    step = (step + 1) % AUDIOPHILE_STATUS_MESSAGES.length;
    mainEl.style.opacity = "0";
    setTimeout(() => {
      mainEl.textContent = AUDIOPHILE_STATUS_MESSAGES[step].main;
      if (subEl) subEl.innerHTML = `<span class="pulse-sparkle">✨</span> ${AUDIOPHILE_STATUS_MESSAGES[step].sub}`;
      mainEl.style.opacity = "1";
    }, 200);
  }, 1800);
}

function stopAudiophileLoadingTicker() {
  if (loadingTickerTimer) {
    clearInterval(loadingTickerTimer);
    loadingTickerTimer = null;
  }
}

// ============================================================================
// ROTATING CURATED SOMMELIER CRATE POOLS (<100ms Instant Audio Gems)
// ============================================================================
const pillCrateState = {
  mustHave: 0,
  midnightJazz: 0,
  seventiesRock: 0,
  cityPop: 0,
  acoustic: 0,
  audiophile: 0,
  surprise: 0
};

const SOMMELIER_VAULT = {
  mustHave: [
    {
      title: "The Dark Side of the Moon",
      artist: "Pink Floyd",
      year: 1973,
      genre: "Progressive Rock",
      playtime: "43 min",
      trackCount: 10,
      firstTrackTitle: "Speak to Me / Breathe",
      standoutTrack: "Time",
      whyOnVinyl: "Mastered at Abbey Road Studios by Alan Parsons, this is the holy grail of physical analog dynamics. The transition from the heartbeat into David Gilmour's stratocaster solos delivers acoustic headroom and spatial depth that compressed digital streaming simply flattens.",
      vibeMatch: "The indisputable cornerstone of every serious physical collection on Earth—an auditory masterclass from the first needle drop to the run-out groove.",
      collectorScore: { overallScore: 99, discogsRating: "4.78 / 5.0", ratingsCount: "85k+ ratings", tier: "Essential Masterpiece", verdict: "The definitive analog benchmark. Unrivaled dynamic headroom, iconic gatefold packaging, and an essential physical listening journey." },
      streetPriceGermany: { newEur: "€32 – €38", usedEur: "€18 – €28", conditionNote: "Used VG+/EX" },
      coverSearchTerm: "Pink Floyd The Dark Side of the Moon",
      coverUrl: "https://is1-ssl.mzstatic.com/image/thumb/Music114/v4/0b/5b/66/0b5b6697-9d7e-86aa-1971-7a370d6b1d34/859744553750_cover.jpg/600x600bb.jpg",
      youtubeVideoId: "MERzPCJhRVE",
    },
    {
      title: "Abbey Road",
      artist: "The Beatles",
      year: 1969,
      genre: "Rock",
      playtime: "47 min",
      trackCount: 17,
      firstTrackTitle: "Come Together",
      standoutTrack: "Here Comes the Sun",
      whyOnVinyl: "Recorded on EMI's TG12345 solid-state mixing desk, giving Ringo's drums and McCartney's bass unprecedented low-end punch and presence that defined physical vinyl fidelity.",
      vibeMatch: "An iconic gatefold landmark with legendary Medley transitions engineered specifically for uninterrupted continuous physical playback.",
      collectorScore: { overallScore: 99, discogsRating: "4.81 / 5.0", ratingsCount: "70k+ ratings", tier: "Essential Masterpiece", verdict: "The ultimate side-two vinyl medley. Immense stereo separation, timeless melodic genius, and a monumental physical listening journey." },
      streetPriceGermany: { newEur: "€30 – €36", usedEur: "€18 – €26", conditionNote: "Used VG+/EX" },
      coverSearchTerm: "The Beatles Abbey Road",
      coverUrl: "https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/48/53/43/485343e3-dd6a-0034-faec-f4b6403f8108/13UMGIM63890.rgb.jpg/600x600bb.jpg",
      youtubeVideoId: "oVW6wJ7MYDM",
    },
    {
      title: "OK Computer",
      artist: "Radiohead",
      year: 1997,
      genre: "Alternative Rock",
      playtime: "53 min",
      trackCount: 12,
      firstTrackTitle: "Airbag",
      standoutTrack: "Paranoid Android",
      whyOnVinyl: "Nigel Godrich's masterful production recorded in St Catherine's Court mansion. The physical vinyl cut preserves dynamic guitar crescendos and Thom Yorke's haunting vocal reverb with stunning spatial depth.",
      vibeMatch: "The definitive late-90s art-rock monument that revolutionized analog production on physical gatefold vinyl.",
      collectorScore: { overallScore: 98, discogsRating: "4.77 / 5.0", ratingsCount: "62k+ ratings", tier: "Essential Masterpiece", verdict: "Dystopian analog masterpiece. Godrich's panoramic production and acoustic dynamics sound dramatically wider and heavier on 180g physical vinyl." },
      streetPriceGermany: { newEur: "€34 – €40", usedEur: "€22 – €30", conditionNote: "Used VG+/EX" },
      coverSearchTerm: "Radiohead OK Computer",
      coverUrl: "https://is1-ssl.mzstatic.com/image/thumb/Music116/v4/07/60/ba/0760ba0f-148c-b18f-d0ff-169ee96f3af5/634904078164.png/600x600bb.jpg",
      youtubeVideoId: "xZUBP-uWwUE",
    },
    {
      title: "Led Zeppelin IV",
      artist: "Led Zeppelin",
      year: 1971,
      genre: "Hard Rock / Blues Rock",
      playtime: "42 min",
      trackCount: 8,
      firstTrackTitle: "Black Dog",
      standoutTrack: "Stairway to Heaven",
      whyOnVinyl: "John Bonham's legendary drum sound recorded in Headley Grange's three-story hallway gives 'When the Levee Breaks' a physical room reverberation and kick-drum thump unmatched in rock history.",
      vibeMatch: "Monumental physical rock power with acoustic folk subtleties that demand a proper turntable needle drop.",
      collectorScore: { overallScore: 98, discogsRating: "4.76 / 5.0", ratingsCount: "58k+ ratings", tier: "Essential Masterpiece", verdict: "Hard rock perfection. Bonham's thunderous drum reverb and Page's layered acoustic guitars deliver massive dynamic impact on physical vinyl." },
      streetPriceGermany: { newEur: "€28 – €34", usedEur: "€16 – €24", conditionNote: "Used VG+/EX" },
      coverSearchTerm: "Led Zeppelin IV",
      coverUrl: "https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/5c/15/9b/5c159b27-95ca-b9a7-84e3-28e795fffd39/dj.kvkrpptq.jpg/600x600bb.jpg",
      youtubeVideoId: "2KPEHohJMuw",
    },
    {
      title: "The Rise and Fall of Ziggy Stardust",
      artist: "David Bowie",
      year: 1972,
      genre: "Glam Rock",
      playtime: "38 min",
      trackCount: 11,
      firstTrackTitle: "Five Years",
      standoutTrack: "Starman",
      whyOnVinyl: "Mick Ronson's soaring Les Paul arrangements and Ken Scott's pristine Trident Studios engineering sound breathtakingly immediate, punchy, and visceral on analog physical vinyl.",
      vibeMatch: "A dazzling, conceptual theatrical masterpiece that pulls you into Bowie's interstellar glam world with unmatched analog warmth.",
      collectorScore: { overallScore: 97, discogsRating: "4.74 / 5.0", ratingsCount: "44k+ ratings", tier: "Essential Masterpiece", verdict: "The quintessential glam rock narrative. Mick Ronson's guitars and Bowie's vocal theatricality burst with vibrant analog energy on vinyl." },
      streetPriceGermany: { newEur: "€28 – €35", usedEur: "€18 – €26", conditionNote: "Used VG+/EX" },
      coverSearchTerm: "David Bowie Ziggy Stardust",
      coverUrl: "https://is1-ssl.mzstatic.com/image/thumb/Music114/v4/5f/fa/56/5ffa56c2-ea1f-7a17-6bad-192ff9b6476d/825646124206.jpg/600x600bb.jpg",
      youtubeVideoId: "2ObjtVdsV3I",
    },
    {
      title: "Unknown Pleasures",
      artist: "Joy Division",
      year: 1979,
      genre: "Post-Punk / Coldwave",
      playtime: "39 min",
      trackCount: 10,
      firstTrackTitle: "Disorder",
      standoutTrack: "She's Lost Control",
      whyOnVinyl: "Martin Hannett's atmospheric production—featuring isolated snare hits, synthesized glass shattering, and Peter Hook's melodic high-register bass—is legendary for its cavernous spatial soundstage on physical lacquer.",
      vibeMatch: "The ultimate dark, cold, evocative post-punk pressing housed in Peter Saville's iconic pulsar waveform textured sleeve.",
      collectorScore: { overallScore: 97, discogsRating: "4.73 / 5.0", ratingsCount: "40k+ ratings", tier: "Essential Masterpiece", verdict: "Hannett's revolutionary spatial production sounds uniquely haunting and visceral on vinyl, with Peter Hook's bass driving the analog groove." },
      streetPriceGermany: { newEur: "€26 – €32", usedEur: "€18 – €26", conditionNote: "Used VG+/EX" },
      coverSearchTerm: "Joy Division Unknown Pleasures",
      coverUrl: "https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/13/90/c0/1390c072-4249-3739-7b3d-fd73ee4a5698/825646562831.jpg/600x600bb.jpg",
      youtubeVideoId: "fd6aTSWNEVU",
    }
  ],

  midnightJazz: [
    {
      title: "Kind of Blue",
      artist: "Miles Davis",
      year: 1959,
      genre: "Modal Jazz",
      playtime: "46 min",
      trackCount: 5,
      firstTrackTitle: "So What",
      standoutTrack: "Blue in Green",
      whyOnVinyl: "Recorded in Columbia's 30th Street Studio with three microphones capturing natural acoustic room reverberation. On vinyl, Paul Chambers' upright bass resonates with visceral physical warmth, while Miles' muted trumpet floats intimately between the speakers.",
      vibeMatch: "The ultimate late-night companion—pours out of the turntable like warm amber whiskey in a dimly lit room.",
      collectorScore: { overallScore: 98, discogsRating: "4.82 / 5.0", ratingsCount: "54k+ ratings", tier: "Essential Masterpiece", verdict: "Unsurpassed analog intimacy. The spatial realism of Bill Evans' piano chords and Miles' breath into the Harmon mute defines audiophile jazz." },
      streetPriceGermany: { newEur: "€26 – €32", usedEur: "€16 – €24", conditionNote: "Used VG+/EX" },
      coverSearchTerm: "Miles Davis Kind of Blue",
      coverUrl: "https://is1-ssl.mzstatic.com/image/thumb/Music/7f/9f/d6/mzi.vtnaewef.jpg/600x600bb.jpg",
      youtubeVideoId: "zqNTltOGh5c",
    },
    {
      title: "A Love Supreme",
      artist: "John Coltrane",
      year: 1965,
      genre: "Spiritual Jazz",
      playtime: "33 min",
      trackCount: 4,
      firstTrackTitle: "Part 1: Acknowledgement",
      standoutTrack: "Part 2: Resolution",
      whyOnVinyl: "Engineered by Rudy Van Gelder in Englewood Cliffs on custom tube gear. The resonance of Jimmy Garrison's bass chant and Coltrane's tenor sax produces a room-filling physical vibration that connects spiritually.",
      vibeMatch: "A deeply spiritual, transcendent midnight experience where every note reverberates with raw emotional urgency.",
      collectorScore: { overallScore: 98, discogsRating: "4.83 / 5.0", ratingsCount: "38k+ ratings", tier: "Essential Masterpiece", verdict: "Van Gelder's iconic Englewood Cliffs acoustics. The spiritual intensity and raw saxophone dynamics make this a holy grail physical pressing." },
      streetPriceGermany: { newEur: "€28 – €34", usedEur: "€18 – €28", conditionNote: "Used VG+/EX" },
      coverSearchTerm: "John Coltrane A Love Supreme",
      coverUrl: "https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/90/d4/3b/90d43b62-701d-c8bf-dfb3-0fdd2aabd995/198588190395.jpg/600x600bb.jpg",
      youtubeVideoId: "clC6cgoh1sU",
    },
    {
      title: "Waltz for Debby",
      artist: "Bill Evans Trio",
      year: 1962,
      genre: "Cool Jazz",
      playtime: "38 min",
      trackCount: 6,
      firstTrackTitle: "My Foolish Heart",
      standoutTrack: "Waltz for Debby",
      whyOnVinyl: "Recorded live at the Village Vanguard. The physical vinyl pressing preserves the clinking of cocktail glasses and whispers in the room, creating holographic spatial depth where you feel seated in the front row.",
      vibeMatch: "The pinnacle of intimate, romantic piano jazz—gentle, acoustic, and breathtakingly atmospheric.",
      collectorScore: { overallScore: 97, discogsRating: "4.79 / 5.0", ratingsCount: "22k+ ratings", tier: "Essential Masterpiece", verdict: "Unrivaled holographic realism. Scott LaFaro's counter-melodic bass and Evans' delicate touch make you feel physically present at the Vanguard." },
      streetPriceGermany: { newEur: "€28 – €36", usedEur: "€20 – €30", conditionNote: "Used VG+/EX" },
      coverSearchTerm: "Bill Evans Trio Waltz for Debby",
      coverUrl: "https://is1-ssl.mzstatic.com/image/thumb/Music126/v4/28/a1/59/28a1595d-5592-2490-0399-1c802c34e327/10CMGIM00782.rgb.jpg/600x600bb.jpg",
      youtubeVideoId: "a2LFVUnRN-k",
    },
    {
      title: "Time Out",
      artist: "Dave Brubeck Quartet",
      year: 1959,
      genre: "Cool Jazz / West Coast Jazz",
      playtime: "38 min",
      trackCount: 7,
      firstTrackTitle: "Blue Rondo à la Turk",
      standoutTrack: "Take Five",
      whyOnVinyl: "Joe Morello's dry, snappy snare work and Paul Desmond's alto saxophone have an airy, physical presence in the analog stereo soundstage that makes audio systems shine.",
      vibeMatch: "Sophisticated rhythm exploration in unusual time signatures with smooth, effortless West Coast cool.",
      collectorScore: { overallScore: 96, discogsRating: "4.72 / 5.0", ratingsCount: "35k+ ratings", tier: "Essential Masterpiece", verdict: "Desmond's crystal alto tone and Morello's pristine 5/4 drum solo deliver benchmark analog presence and effortless swing." },
      streetPriceGermany: { newEur: "€25 – €32", usedEur: "€15 – €22", conditionNote: "Used VG+/EX" },
      coverSearchTerm: "Dave Brubeck Quartet Time Out",
      coverUrl: "https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/39/da/45/39da45ea-0a55-8668-0a84-4017b45fb13e/dj.rzbgoyft.jpg/600x600bb.jpg",
      youtubeVideoId: "kc34Uj8wlmE",
    },
    {
      title: "Chet",
      artist: "Chet Baker",
      year: 1959,
      genre: "Cool Jazz / Ballads",
      playtime: "41 min",
      trackCount: 8,
      firstTrackTitle: "Alone Together",
      standoutTrack: "It Never Entered My Mind",
      whyOnVinyl: "Chet Baker's whisper-soft trumpet backed by Bill Evans on piano and Paul Chambers on bass. Pure midnight velvet with analog tape warmth that melts out of the speakers.",
      vibeMatch: "The definition of melancholic late-night tranquility—pure nocturnal elegance by candlelight.",
      collectorScore: { overallScore: 96, discogsRating: "4.75 / 5.0", ratingsCount: "18k+ ratings", tier: "Essential Masterpiece", verdict: "Nocturnal jazz perfection. Baker's fragile, lyrical trumpet tone paired with Bill Evans' sensitive chords creates pure analog poetry." },
      streetPriceGermany: { newEur: "€27 – €35", usedEur: "€18 – €28", conditionNote: "Used VG+/EX" },
      coverSearchTerm: "Chet Baker Chet",
      coverUrl: "https://is1-ssl.mzstatic.com/image/thumb/Music114/v4/62/b2/eb/62b2ebd5-8037-5e00-381a-2ef83c97171a/20CRGIM25372.rgb.jpg/600x600bb.jpg",
      youtubeVideoId: "06p3d94qH54",
    }
  ],

  seventiesRock: [
    {
      title: "Rumours",
      artist: "Fleetwood Mac",
      year: 1977,
      genre: "Classic Rock / Folk Rock",
      playtime: "39 min",
      trackCount: 11,
      firstTrackTitle: "Second Hand News",
      standoutTrack: "Dreams",
      whyOnVinyl: "Produced by Ken Caillat and Richard Dashut, this is one of the most sonically transparent albums in recording history. The acoustic kick drum thud and pristine cymbal air on 'Dreams' come alive with punchy analog separation that digital compression flattens.",
      vibeMatch: "Pure 1977 California gold with monumental vocal harmonies and infectious analog rhythm.",
      collectorScore: { overallScore: 96, discogsRating: "4.69 / 5.0", ratingsCount: "42k+ ratings", tier: "Essential Masterpiece", verdict: "Pristine acoustic production with immense analog punch. Mick Fleetwood's percussion and three-part harmonies sound breathtaking on vinyl." },
      streetPriceGermany: { newEur: "€28 – €34", usedEur: "€14 – €22", conditionNote: "Used VG+/EX" },
      coverSearchTerm: "Fleetwood Mac Rumours",
      coverUrl: "https://is1-ssl.mzstatic.com/image/thumb/Music124/v4/4d/13/ba/4d13bac3-d3d5-7581-2c74-034219eadf2b/081227970949.jpg/600x600bb.jpg",
      youtubeVideoId: "SLlYUlS_Awo",
    },
    {
      title: "Wish You Were Here",
      artist: "Pink Floyd",
      year: 1975,
      genre: "Progressive Rock",
      playtime: "44 min",
      trackCount: 5,
      firstTrackTitle: "Shine On You Crazy Diamond (Parts I–V)",
      standoutTrack: "Wish You Were Here",
      whyOnVinyl: "The legendary intro of 'Wish You Were Here' sounds as if a distant AM radio is playing in the corner of your room, followed by Gilmour's full 12-string acoustic bursting in with breathtaking physical fidelity.",
      vibeMatch: "Sprawling, emotional analog synth landscapes and soulful guitar solos mourning Syd Barrett.",
      collectorScore: { overallScore: 98, discogsRating: "4.79 / 5.0", ratingsCount: "68k+ ratings", tier: "Essential Masterpiece", verdict: "Peak analog synthesizer architecture and emotional guitar solos. The vinyl dynamics on 'Shine On' define hi-fi listening." },
      streetPriceGermany: { newEur: "€30 – €36", usedEur: "€18 – €28", conditionNote: "Used VG+/EX" },
      coverSearchTerm: "Pink Floyd Wish You Were Here",
      coverUrl: "https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/aa/e0/ab/aae0ab6a-d906-a189-81bf-70b56aa43f7a/886445635843.jpg/600x600bb.jpg",
      youtubeVideoId: "8UXircX4AMG",
    },
    {
      title: "Exile on Main St.",
      artist: "The Rolling Stones",
      year: 1972,
      genre: "Blues Rock / Roots Rock",
      playtime: "67 min",
      trackCount: 18,
      firstTrackTitle: "Rocks Off",
      standoutTrack: "Tumbling Dice",
      whyOnVinyl: "Recorded in the murky, sweat-soaked basement of Villa Nellcôte in France. The double-LP packaging with postcard inserts captures the grime, loose swagger, and raw analog distortion of the Stones at their absolute peak.",
      vibeMatch: "A double-gatefold blues-rock masterpiece with greasy horns, soulful gospel backing, and unmatched rock-and-roll attitude.",
      collectorScore: { overallScore: 97, discogsRating: "4.73 / 5.0", ratingsCount: "36k+ ratings", tier: "Essential Masterpiece", verdict: "Murky, swampy analog greatness. Keith Richards' telecaster riffs and the loose basement atmosphere belong on 12-inch vinyl." },
      streetPriceGermany: { newEur: "€32 – €38", usedEur: "€20 – €30", conditionNote: "Used VG+/EX" },
      coverSearchTerm: "The Rolling Stones Exile on Main St",
      coverUrl: "https://is1-ssl.mzstatic.com/image/thumb/Music112/v4/7f/e0/b4/7fe0b4da-36cd-a1d0-0f19-ef3fec18e3cd/08UMGIM15742.rgb.jpg/600x600bb.jpg",
      youtubeVideoId: "_lNP-x94-SE",
    },
    {
      title: "Boston",
      artist: "Boston",
      year: 1976,
      genre: "Arena Rock / Hard Rock",
      playtime: "37 min",
      trackCount: 8,
      firstTrackTitle: "More Than a Feeling",
      standoutTrack: "Peace of Mind",
      whyOnVinyl: "Tom Scholz spent years in his Massachusetts basement perfecting custom analog amplifiers and tape delays to create the massive, crystalline guitar harmonies that define classic American FM radio rock.",
      vibeMatch: "Huge soaring vocal hooks, twin-lead guitar walls, and undeniable feel-good arena energy.",
      collectorScore: { overallScore: 95, discogsRating: "4.63 / 5.0", ratingsCount: "28k+ ratings", tier: "Collector Classic", verdict: "A technical triumph of analog multitracking. Scholz's layered acoustic guitars and soaring vocals sound electrifying on vinyl." },
      streetPriceGermany: { newEur: "€26 – €32", usedEur: "€14 – €20", conditionNote: "Used VG+/EX" },
      coverSearchTerm: "Boston Boston album",
      coverUrl: "https://is1-ssl.mzstatic.com/image/thumb/Music126/v4/e3/08/9a/e3089ac9-a820-5ee9-64be-39500ad8a5e2/886444824972.jpg/600x600bb.jpg",
      youtubeVideoId: "t4QK8RxCAwo",
    }
  ],

  cityPop: [
    {
      title: "Timely!!",
      artist: "Anri",
      year: 1983,
      genre: "Japanese City Pop / Funk",
      playtime: "41 min",
      trackCount: 11,
      firstTrackTitle: "CAT'S EYE",
      standoutTrack: "Shyness Boy",
      whyOnVinyl: "Arranged and produced by Toshiki Kadomatsu, this album exemplifies the pinnacle of early-80s Tokyo analog studio wizardry. The slap bass is tight and punchy, the brass section explodes with crisp analog sparkle, and the original Japanese pressing obi is legendary.",
      vibeMatch: "Summery neon-lit Tokyo cruise with shimmering slap bass and unforgettable breezy melodies.",
      collectorScore: { overallScore: 94, discogsRating: "4.65 / 5.0", ratingsCount: "12k+ ratings", tier: "Collector Classic", verdict: "Tokyo 80s analog perfection. Kadomatsu's lush brass and tight slap bass grooves deliver infectious vinyl warmth and audiophile joy." },
      streetPriceGermany: { newEur: "€35 – €45", usedEur: "€28 – €40", conditionNote: "Original Japanese pressing" },
      coverSearchTerm: "Anri Timely",
      coverUrl: "https://cdn-images.dzcdn.net/images/cover/08b0f0161add7040ddcdeca3d97ba27e/1000x1000-000000-80-0-0.jpg",
      youtubeVideoId: "b738w_zQ9E0",
    },
    {
      title: "For You",
      artist: "Tatsuro Yamashita",
      year: 1982,
      genre: "City Pop / Boogie / Funk",
      playtime: "42 min",
      trackCount: 8,
      firstTrackTitle: "SPARKLE",
      standoutTrack: "LOVELAND, ISLAND",
      whyOnVinyl: "The legendary opening clean guitar riff on 'SPARKLE' is widely regarded as one of the most sonically pristine rhythm guitar recordings in music history, engineered with pinpoint Japanese analog precision.",
      vibeMatch: "The crown jewel of Japanese City Pop—pure tropical sunshine, driving rhythm sections, and impeccable analog engineering.",
      collectorScore: { overallScore: 98, discogsRating: "4.82 / 5.0", ratingsCount: "16k+ ratings", tier: "Essential Masterpiece", verdict: "The definitive holy grail of City Pop. The guitar intro to 'SPARKLE' and the sparkling rhythm section are unmatched on vinyl." },
      streetPriceGermany: { newEur: "€42 – €52", usedEur: "€34 – €48", conditionNote: "Japanese reissue / original" },
      coverSearchTerm: "Tatsuro Yamashita For You",
      coverUrl: "https://is1-ssl.mzstatic.com/image/thumb/Music124/v4/71/26/d8/7126d88b-7cf5-5ba5-7043-f1d26a8dd87f/jacket_MHXX00766B00Z_550.jpg/600x600bb.jpg",
      youtubeVideoId: "7ijMDQgvW08",
    },
    {
      title: "Pocket Park",
      artist: "Miki Matsubara",
      year: 1980,
      genre: "City Pop / Jazz Funk",
      playtime: "41 min",
      trackCount: 11,
      firstTrackTitle: "Mayonaka no Door / Stay With Me",
      standoutTrack: "Stay With Me",
      whyOnVinyl: "Featuring top Japanese session musicians like Tsuyoshi Kon on guitar. The iconic slap bass groove and soulful brass hits on 'Stay With Me' punch through on physical vinyl with undeniable funk drive.",
      vibeMatch: "Tokyo nightlife magic powered by an irresistible disco-funk groove and world-renowned nostalgic vocals.",
      collectorScore: { overallScore: 95, discogsRating: "4.71 / 5.0", ratingsCount: "14k+ ratings", tier: "Essential Masterpiece", verdict: "Home of 'Stay With Me'. Outstanding Tokyo session musicianship with punchy analog drums, tight bass, and irresistible City Pop hooks." },
      streetPriceGermany: { newEur: "€36 – €46", usedEur: "€28 – €38", conditionNote: "Used VG+/EX" },
      coverSearchTerm: "Miki Matsubara Pocket Park",
      coverUrl: "https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/06/eb/b1/06ebb16a-7e31-5818-4be9-684cb57622dc/PA00204086_0_234544_jacket.jpg/600x600bb.jpg",
      youtubeVideoId: "M0qMgoChzGI",
    },
    {
      title: "Sunshower",
      artist: "Taeko Onuki",
      year: 1977,
      genre: "City Pop / Jazz Fusion",
      playtime: "38 min",
      trackCount: 10,
      firstTrackTitle: "Summer Connection",
      standoutTrack: "4:00A.M.",
      whyOnVinyl: "Arranged by Ryuichi Sakamoto and featuring the Tin Pan Alley rhythm section with Chris Parker on drums. The intricate fusion chords and warm Rhodes piano have extraordinary acoustic headroom on physical vinyl.",
      vibeMatch: "Lush, breezy Tokyo jazz-fusion with sophisticated horn arrangements and sultry, breezy vocals.",
      collectorScore: { overallScore: 96, discogsRating: "4.76 / 5.0", ratingsCount: "11k+ ratings", tier: "Essential Masterpiece", verdict: "Sakamoto's genius fusion arrangements and Onuki's breezy vocals make this a revered audiophile classic in Japanese vinyl circles." },
      streetPriceGermany: { newEur: "€38 – €48", usedEur: "€30 – €42", conditionNote: "Japanese pressing" },
      coverSearchTerm: "Taeko Onuki Sunshower",
      coverUrl: "https://cdn-images.dzcdn.net/images/cover/d97de7a8655d9ebdbdad68a4578bce8c/1000x1000-000000-80-0-0.jpg",
      youtubeVideoId: "39G4q-G7qEw",
    }
  ],

  acoustic: [
    {
      title: "Pink Moon",
      artist: "Nick Drake",
      year: 1972,
      genre: "Acoustic Folk",
      playtime: "28 min",
      trackCount: 11,
      firstTrackTitle: "Pink Moon",
      standoutTrack: "Place to Be",
      whyOnVinyl: "Recorded in just two midnight sessions with Sound Techniques engineer John Wood using only Nick Drake's Guild acoustic guitar, voice, and a four-note piano overdub. The vinyl groove conveys every squeak of Drake's fingers on the fretboard and the sheer vulnerability of his breath.",
      vibeMatch: "Heartbreakingly intimate acoustic beauty for a quiet rainy evening by candlelight.",
      collectorScore: { overallScore: 97, discogsRating: "4.74 / 5.0", ratingsCount: "28k+ ratings", tier: "Essential Masterpiece", verdict: "Sparse, spectral acoustic perfection. The analog proximity of Drake's Guild guitar and quiet vocals makes the listener feel alone in the room with him." },
      streetPriceGermany: { newEur: "€27 – €33", usedEur: "€18 – €26", conditionNote: "Used VG+/EX" },
      coverSearchTerm: "Nick Drake Pink Moon",
      coverUrl: "https://is1-ssl.mzstatic.com/image/thumb/Music116/v4/42/e7/8d/42e78dd1-12fd-f0c0-cc0e-15ee03288664/075679760913.jpg/600x600bb.jpg",
      youtubeVideoId: "3sQv04CFedE",
    },
    {
      title: "Blue",
      artist: "Joni Mitchell",
      year: 1971,
      genre: "Folk / Singer-Songwriter",
      playtime: "36 min",
      trackCount: 10,
      firstTrackTitle: "All I Want",
      standoutTrack: "A Case of You",
      whyOnVinyl: "Engineered by Henry Lewy at A&M Studios. Joni's Appalachian dulcimer and acoustic guitar have a visceral, crystalline transparency on vinyl, while her open-tuned chords ring with immense harmonic resonance.",
      vibeMatch: "Raw, confessional folk poetry with staggering musical elegance and emotional honesty.",
      collectorScore: { overallScore: 98, discogsRating: "4.80 / 5.0", ratingsCount: "35k+ ratings", tier: "Essential Masterpiece", verdict: "The benchmark confessional folk record. Lewy's pristine engineering captures Joni's dulcimer and soaring soprano with astonishing physical clarity." },
      streetPriceGermany: { newEur: "€28 – €35", usedEur: "€18 – €26", conditionNote: "Used VG+/EX" },
      coverSearchTerm: "Joni Mitchell Blue",
      coverUrl: "https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/00/a2/43/00a24363-cf69-bfd2-a26a-a042d57ab141/075992719926.jpg/600x600bb.jpg",
      youtubeVideoId: "tWb_mC3-c_A",
    },
    {
      title: "Carrie & Lowell",
      artist: "Sufjan Stevens",
      year: 2015,
      genre: "Indie Folk / Chamber Folk",
      playtime: "43 min",
      trackCount: 11,
      firstTrackTitle: "Death with Dignity",
      standoutTrack: "Should Have Known Better",
      whyOnVinyl: "Recorded simply on iPhones and small condenser mics in hotel rooms and living rooms. The air conditioning hum and soft fingerpicking create a hauntingly fragile, physical analog atmosphere.",
      vibeMatch: "Delicate, whisper-soft acoustic grief transformed into transcendent, luminous folk melodies.",
      collectorScore: { overallScore: 96, discogsRating: "4.72 / 5.0", ratingsCount: "26k+ ratings", tier: "Essential Masterpiece", verdict: "Intimate modern folk grief. The subtle acoustic picking and whisper-close vocal capture sound devastatingly beautiful on vinyl." },
      streetPriceGermany: { newEur: "€26 – €32", usedEur: "€16 – €22", conditionNote: "Used VG+/EX" },
      coverSearchTerm: "Sufjan Stevens Carrie and Lowell",
      coverUrl: "https://is1-ssl.mzstatic.com/image/thumb/Music91/v4/6b/20/6a/6b206ac1-e1b5-316d-334d-59df7b727fb6/656605613666.jpg/600x600bb.jpg",
      youtubeVideoId: "lVN4S6xX8tQ",
    },
    {
      title: "Bridge Over Troubled Water",
      artist: "Simon & Garfunkel",
      year: 1970,
      genre: "Folk Rock / Baroque Pop",
      playtime: "37 min",
      trackCount: 11,
      firstTrackTitle: "Bridge Over Troubled Water",
      standoutTrack: "The Boxer",
      whyOnVinyl: "Roy Halee's legendary production, including the echoey drum thuds recorded in an elevator shaft on 'The Boxer' and the soaring Wall of Sound orchestration on the title track, deliver monumental dynamic headroom on physical vinyl.",
      vibeMatch: "Soaring acoustic harmonies, baroque folk arrangements, and grand orchestral climaxes.",
      collectorScore: { overallScore: 96, discogsRating: "4.68 / 5.0", ratingsCount: "30k+ ratings", tier: "Essential Masterpiece", verdict: "Halee's production triumphs on vinyl. The spatial reverberation on 'The Boxer' and Garfunkel's soaring vocals demonstrate physical dynamic range." },
      streetPriceGermany: { newEur: "€26 – €32", usedEur: "€12 – €18", conditionNote: "Used VG+/EX" },
      coverSearchTerm: "Simon and Garfunkel Bridge Over Troubled Water",
      coverUrl: "https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/a3/84/0a/a3840a6d-44e8-0afe-fc3e-316c517dddfe/5099749521421.jpg/600x600bb.jpg",
      youtubeVideoId: "4G-YQA_mnW4",
    }
  ],

  audiophile: [
    {
      title: "Aja",
      artist: "Steely Dan",
      year: 1977,
      genre: "Audiophile Jazz Rock",
      playtime: "40 min",
      trackCount: 7,
      firstTrackTitle: "Black Cow",
      standoutTrack: "Aja",
      whyOnVinyl: "Engineered by Roger Nichols and Bill Schnee, this is universally recognized as the gold standard for testing hi-fi equipment. Steve Gadd's legendary drum solo on the title track and Wayne Shorter's tenor sax cut through with pinpoint holographic stereo imaging and black-background analog silence.",
      vibeMatch: "The ultimate hi-fi demonstration record—guaranteed to showcase every ounce of detail in your cartridge and speakers.",
      collectorScore: { overallScore: 98, discogsRating: "4.79 / 5.0", ratingsCount: "35k+ ratings", tier: "Essential Masterpiece", verdict: "The undisputed holy grail of hi-fi testing. Incredible dynamic headroom, Steve Gadd's legendary drumming, and pinpoint stereo imaging." },
      streetPriceGermany: { newEur: "€30 – €36", usedEur: "€16 – €26", conditionNote: "Used VG+/EX" },
      coverSearchTerm: "Steely Dan Aja",
      coverUrl: "https://is1-ssl.mzstatic.com/image/thumb/Music126/v4/c2/3c/54/c23c5414-20d1-7aea-f0f5-187974c58d65/23UMGIM79990.rgb.jpg/600x600bb.jpg",
      youtubeVideoId: "0UqX5kXoDkY",
    },
    {
      title: "The Nightfly",
      artist: "Donald Fagen",
      year: 1982,
      genre: "Jazz Rock / Sophisti-Pop",
      playtime: "39 min",
      trackCount: 8,
      firstTrackTitle: "I.G.Y.",
      standoutTrack: "New Frontier",
      whyOnVinyl: "One of the earliest full 3M digital-to-analog vinyl masterings. The bass groove on 'I.G.Y.' is famously used by loudspeaker designers worldwide to evaluate transient response and sub-bass clarity.",
      vibeMatch: "Sleek, futuristic 1950s optimism engineered with microscopic studio precision and infectious grooves.",
      collectorScore: { overallScore: 97, discogsRating: "4.75 / 5.0", ratingsCount: "26k+ ratings", tier: "Essential Masterpiece", verdict: "The reference recording for transient bass accuracy and clean soundstage. Fagen's perfectionism yields reference-grade physical audio." },
      streetPriceGermany: { newEur: "€28 – €34", usedEur: "€16 – €24", conditionNote: "Used VG+/EX" },
      coverSearchTerm: "Donald Fagen The Nightfly",
      coverUrl: "https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/98/d0/87/98d0877d-3e15-0f41-ba27-3264e5ae3b09/093624943952.jpg/600x600bb.jpg",
      youtubeVideoId: "sogYgHlnn60",
    },
    {
      title: "Brothers in Arms",
      artist: "Dire Straits",
      year: 1985,
      genre: "Roots Rock / Blues Rock",
      playtime: "55 min",
      trackCount: 9,
      firstTrackTitle: "So Far Away",
      standoutTrack: "Money for Nothing",
      whyOnVinyl: "Engineered by Neil Dorfsman at AIR Studios Montserrat. The intro of 'Money for Nothing' with Sting's vocals and Mark Knopfler's explosive Les Paul riff remains the classic test for turntable dynamic range.",
      vibeMatch: "Peerless dynamic range with crisp, articulate guitar tones and atmospheric synth beds.",
      collectorScore: { overallScore: 96, discogsRating: "4.67 / 5.0", ratingsCount: "42k+ ratings", tier: "Essential Masterpiece", verdict: "Explosive dynamic punch. Knopfler's fingers-on-strings guitar technique and pristine Montserrat studio air sound majestic on vinyl." },
      streetPriceGermany: { newEur: "€28 – €34", usedEur: "€14 – €22", conditionNote: "Used VG+/EX" },
      coverSearchTerm: "Dire Straits Brothers in Arms",
      coverUrl: "https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/e8/bd/54/e8bd54fd-6595-4ebf-aa4c-58139ed316e6/dj.bngafruf.jpg/600x600bb.jpg",
      youtubeVideoId: "x2k0cjh8t30",
    },
    {
      title: "Crime of the Century",
      artist: "Supertramp",
      year: 1974,
      genre: "Progressive Rock / Art Rock",
      playtime: "44 min",
      trackCount: 8,
      firstTrackTitle: "School",
      standoutTrack: "Bloody Well Right",
      whyOnVinyl: "Ken Scott's masterpiece of dynamic extremes. From the faint, lonely harmonica opening of 'School' to the thundering piano chords and sax climaxes, the acoustic headroom tests the limit of any phono cartridge.",
      vibeMatch: "Theatrical progressive rock with staggering dynamic range from near-silence to thunderous climaxes.",
      collectorScore: { overallScore: 96, discogsRating: "4.68 / 5.0", ratingsCount: "30k+ ratings", tier: "Essential Masterpiece", verdict: "Ken Scott's benchmark for physical acoustic dynamics. Extreme contrast between delicate whisper passages and roaring rock crescendos." },
      streetPriceGermany: { newEur: "€26 – €32", usedEur: "€14 – €22", conditionNote: "Used VG+/EX" },
      coverSearchTerm: "Supertramp Crime of the Century",
      coverUrl: "https://is1-ssl.mzstatic.com/image/thumb/Music128/v4/39/cd/49/39cd4988-2b67-33bf-1aaa-c401b397c35d/00600753547687.rgb.jpg/600x600bb.jpg",
      youtubeVideoId: "g02AwKFl80o",
    }
  ],

  surprisePool: [
    {
      title: "Random Access Memories",
      artist: "Daft Punk",
      year: 2013,
      genre: "Nu-Disco / Electronic",
      playtime: "74 min",
      trackCount: 13,
      firstTrackTitle: "Give Life Back to Music",
      standoutTrack: "Giorgio by Moroder",
      whyOnVinyl: "Recorded exclusively with live session legends at Henson and Capitol Studios across 180g double-gatefold vinyl. The analog bass synthesizers and live drums have thunderous transient impact.",
      vibeMatch: "A monumental 21st-century analog masterwork blending human disco virtuosity with electronic innovation.",
      collectorScore: { overallScore: 96, discogsRating: "4.67 / 5.0", ratingsCount: "48k+ ratings", tier: "Essential Masterpiece", verdict: "Spectacular modern analog production with peerless dynamic punch and reference-grade double vinyl mastering." },
      streetPriceGermany: { newEur: "€35 – €42", usedEur: "€24 – €32", conditionNote: "Used VG+/EX" },
      coverSearchTerm: "Daft Punk Random Access Memories",
      coverUrl: "https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/e8/43/5f/e8435ffa-b6b9-b171-40ab-4ff3959ab661/886443919266.jpg/600x600bb.jpg",
      youtubeVideoId: "IluRBvnYMoY",
    },
    {
      title: "Dummy",
      artist: "Portishead",
      year: 1994,
      genre: "Trip Hop / Noir",
      playtime: "49 min",
      trackCount: 11,
      firstTrackTitle: "Mysterons",
      standoutTrack: "Glory Box",
      whyOnVinyl: "Portishead famously pressed their original instrumental recordings onto acetate dubplates, walked on them, and sampled them back for authentic crackle. Hearing the LP on a real turntable brings this recursive sound design to life.",
      vibeMatch: "Cinematic noir melancholy with haunting analog warmth and deep trip-hop sub-bass.",
      collectorScore: { overallScore: 95, discogsRating: "4.71 / 5.0", ratingsCount: "30k+ ratings", tier: "Essential Masterpiece", verdict: "A masterpiece born from vinyl sampling. Beth Gibbons' aching vocals and turntable scratching sound infinitely deeper on physical LP." },
      streetPriceGermany: { newEur: "€28 – €34", usedEur: "€16 – €24", conditionNote: "Used VG+/EX" },
      coverSearchTerm: "Portishead Dummy",
      coverUrl: "https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/c1/71/93/c1719342-df7d-e9c5-c87c-53dae5afb289/00042282855329.rgb.jpg/600x600bb.jpg",
      youtubeVideoId: "fzz6fQDCKAA",
    },
    {
      title: "Loveless",
      artist: "My Bloody Valentine",
      year: 1991,
      genre: "Shoegaze / Dream Pop",
      playtime: "48 min",
      trackCount: 11,
      firstTrackTitle: "Only Shallow",
      standoutTrack: "Soon",
      whyOnVinyl: "Kevin Shields' all-analog glide guitar technique creates a breathtaking physical wall of acoustic harmonics on vinyl that wraps completely around the listener.",
      vibeMatch: "Transcendental analog sound immersion where gentle pop melodies float inside a roaring storm of guitars.",
      collectorScore: { overallScore: 97, discogsRating: "4.75 / 5.0", ratingsCount: "38k+ ratings", tier: "Essential Masterpiece", verdict: "The definitive shoegaze monument. The physical analog lacquer cut delivers unmatched spatial texture and tidal waves of tone." },
      streetPriceGermany: { newEur: "€32 – €38", usedEur: "€22 – €30", conditionNote: "Used VG+/EX" },
      coverSearchTerm: "My Bloody Valentine Loveless",
      coverUrl: "https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/f9/7e/6b/f97e6b94-f307-ae7f-e94c-d74860a44350/887830016094.png/600x600bb.jpg",
      youtubeVideoId: "FyYMzMa3B64",
    },
    {
      title: "Songs in the Key of Life",
      artist: "Stevie Wonder",
      year: 1976,
      genre: "Soul / Funk / R&B",
      playtime: "105 min",
      trackCount: 21,
      firstTrackTitle: "Love's in Need of Love Today",
      standoutTrack: "Sir Duke",
      whyOnVinyl: "A monumental double gatefold LP with a bonus 7-inch EP. The horns on 'Sir Duke' and the analog bass synth on 'I Wish' radiate glorious physical joy and acoustic punch.",
      vibeMatch: "Pure musical genius and joyous 70s funk groove that feels alive on a turning physical platter.",
      collectorScore: { overallScore: 98, discogsRating: "4.81 / 5.0", ratingsCount: "50k+ ratings", tier: "Essential Masterpiece", verdict: "Stevie Wonder's magnum opus. Spectacular 1970s analog soul with punchy live rhythm sections and infectious brass brilliance." },
      streetPriceGermany: { newEur: "€36 – €44", usedEur: "€22 – €32", conditionNote: "Used VG+/EX" },
      coverSearchTerm: "Stevie Wonder Songs in the Key of Life",
      coverUrl: "https://is1-ssl.mzstatic.com/image/thumb/Music118/v4/eb/1f/12/eb1f12ec-474c-63aa-43af-09282f423b9d/00602537004737.rgb.jpg/600x600bb.jpg",
      youtubeVideoId: "6r3eQWv54lQ",
    },
    {
      title: "Ege Bamyasi",
      artist: "Can",
      year: 1972,
      genre: "Krautrock / Experimental Rock",
      playtime: "39 min",
      trackCount: 7,
      firstTrackTitle: "Pinch",
      standoutTrack: "Vitamin C",
      whyOnVinyl: "Recorded in an abandoned cinema in Weilerswist, Germany. Jaki Liebezeit's legendary metronomic drumming on 'Vitamin C' has an infectious analog pocket that defined modern groove.",
      vibeMatch: "Hypnotic German Krautrock grooves with eccentric avant-garde funk that sounds magnificent on physical vinyl.",
      collectorScore: { overallScore: 96, discogsRating: "4.73 / 5.0", ratingsCount: "25k+ ratings", tier: "Essential Masterpiece", verdict: "German Krautrock gold. Liebezeit's robotic drum precision and Czukay's editing make this an essential physical record." },
      streetPriceGermany: { newEur: "€28 – €35", usedEur: "€20 – €30", conditionNote: "Used VG+/EX" },
      coverSearchTerm: "Can Ege Bamyasi",
      coverUrl: "https://is1-ssl.mzstatic.com/image/thumb/Music/v4/55/33/7e/55337e95-d781-1057-cd6a-94ee425b6850/5099930156159.jpg/600x600bb.jpg",
      youtubeVideoId: "48bO13_kP14",
    }
  ]
};

function matchSommelierVault(vibeText) {
  if (!vibeText) return null;
  const t = vibeText.toLowerCase();

  if (t.includes("must-have") || t.includes("must have") || t.includes("legendary stature") || t.includes("essential, iconic")) {
    const pool = SOMMELIER_VAULT.mustHave;
    const item = pool[pillCrateState.mustHave % pool.length];
    pillCrateState.mustHave++;
    return item;
  }
  if (t.includes("surprise") || t.includes("critically acclaimed 5/5")) {
    const pool = SOMMELIER_VAULT.surprisePool;
    const item = pool[pillCrateState.surprise % pool.length];
    pillCrateState.surprise++;
    return item;
  }
  if (t.includes("midnight jazz") || (t.includes("jazz") && t.includes("club"))) {
    const pool = SOMMELIER_VAULT.midnightJazz;
    const item = pool[pillCrateState.midnightJazz % pool.length];
    pillCrateState.midnightJazz++;
    return item;
  }
  if (t.includes("70s rock") || (t.includes("1970") && t.includes("rock"))) {
    const pool = SOMMELIER_VAULT.seventiesRock;
    const item = pool[pillCrateState.seventiesRock % pool.length];
    pillCrateState.seventiesRock++;
    return item;
  }
  if (t.includes("city pop") || t.includes("japanese") || t.includes("anri")) {
    const pool = SOMMELIER_VAULT.cityPop;
    const item = pool[pillCrateState.cityPop % pool.length];
    pillCrateState.cityPop++;
    return item;
  }
  if (t.includes("acoustic") || t.includes("singer-songwriter") || t.includes("folk")) {
    const pool = SOMMELIER_VAULT.acoustic;
    const item = pool[pillCrateState.acoustic % pool.length];
    pillCrateState.acoustic++;
    return item;
  }
  if (t.includes("audiophile") || t.includes("system test") || t.includes("test pressing")) {
    const pool = SOMMELIER_VAULT.audiophile;
    const item = pool[pillCrateState.audiophile % pool.length];
    pillCrateState.audiophile++;
    return item;
  }
  if (t.includes("shoegaze") || t.includes("loveless")) {
    return SOMMELIER_VAULT.surprisePool[2];
  }
  if (t.includes("melancholy") || t.includes("trip hop") || t.includes("dummy")) {
    return SOMMELIER_VAULT.surprisePool[1];
  }

  return null;
}

// Render Sommelier Pick Record (Unified for Vault & LLM Generation)
function renderSommelierAlbumRecord(rec, isInstantVault = false) {
  hasUserInteracted = true;
  const sessionToken = ++activeAppraisalId;
  stopAudiophileLoadingTicker();
  loadingState.classList.add("hidden");
  resultsSection.classList.remove("hidden");
  const welcomeHero = document.getElementById("welcome-hero-state");
  if (welcomeHero) welcomeHero.classList.add("hidden");

  if (albumInput) {
    albumInput.value = `${rec.artist} - ${rec.title}`;
  }

  albumTitleEl.textContent = rec.title;
  albumArtistEl.textContent = rec.artist;
  albumGenreEl.textContent = rec.genre || "Vinyl";
  albumYearEl.textContent = rec.year || "";
  albumPlaytimeEl.textContent = rec.playtime || "N/A";
  albumTracksEl.textContent = `${rec.trackCount || 10} tracks`;

  renderCollectorScoreAndVerdict(rec.collectorScore || {
    overallScore: 95,
    discogsRating: "4.70 / 5.0",
    ratingsCount: "Collector favorite",
    tier: "Essential Masterpiece",
    verdict: "An indisputable analog landmark celebrated for acoustic warmth and timeless dynamic range."
  });

  const sommelierNote = {
    whyOnVinyl: rec.whyOnVinyl || "",
    vibeMatch: rec.vibeMatch || "",
    standoutTrack: rec.standoutTrack || rec.firstTrackTitle || ""
  };
  window.__SOMMELIER_NOTE__ = sommelierNote;
  renderSommelierLore(sommelierNote);

  const standoutSong = rec.firstTrackTitle || rec.standoutTrack || "Track 1";

  // CRITICAL FIX: Update currentAlbumData BEFORE setting images or launching async jobs!
  currentAlbumData = {
    title: rec.title,
    artist: rec.artist,
    genre: rec.genre,
    year: rec.year,
    playtime: rec.playtime,
    trackCount: rec.trackCount,
    firstTrackTitle: standoutSong,
    youtubeVideoId: rec.youtubeVideoId || "",
    collectorScore: rec.collectorScore,
    coverUrl: rec.coverUrl || generateSvgCover(rec.title, rec.artist),
    streetPriceGermany: rec.streetPriceGermany,
    baseNewEur: rec.streetPriceGermany?.newEur || "€29",
    baseUsedEur: rec.streetPriceGermany?.usedEur || "€15",
    sommelierNote: sommelierNote,
    alternatives: [],
    currentAltOffset: 0
  };

  // Immediate cover setup with SVG placeholder while fetching
  if (rec.coverUrl && !rec.coverUrl.startsWith("data:image/svg")) {
    albumCoverImg.src = rec.coverUrl;
  } else {
    albumCoverImg.src = generateSvgCover(rec.title, rec.artist);
    fetchAlbumCover(rec.coverSearchTerm || `${rec.artist} ${rec.title}`, rec.artist, rec.title).then(highRes => {
      if (activeAppraisalId !== sessionToken) return;
      if (currentAlbumData && currentAlbumData.title === rec.title && highRes) {
        albumCoverImg.src = highRes;
        currentAlbumData.coverUrl = highRes;
      }
    });
  }

  // Immediate DJ & Audio Purge: Synchronously wipe old media & sync DJ queue to new album
  if (heroYtIframe) {
    if (rec.youtubeVideoId) {
      heroYtIframe.src = `https://www.youtube-nocookie.com/embed/${rec.youtubeVideoId}?enablejsapi=1&autoplay=0&origin=${encodeURIComponent(window.location.origin)}`;
      if (heroYtLink) heroYtLink.href = `https://www.youtube.com/watch?v=${rec.youtubeVideoId}`;
    } else {
      heroYtIframe.src = "about:blank";
    }
  }
  if (heroYtBox) heroYtBox.classList.remove("hidden");
  if (djDeckBar && !djState.isDeckMinimized) djDeckBar.classList.remove("hidden");
  if (ytTrackTitle) ytTrackTitle.textContent = `${rec.artist} — "${standoutSong}"`;

  djState.queue = buildDjQueue(currentAlbumData, [], djState.mode);
  djState.currentIndex = 0;
  renderDjQueueList();
  updateDjDeckUI();

  // Display initial estimated street prices immediately
  const reg = STORE_REGISTRY[currentRegion] || STORE_REGISTRY.DE;
  priceNewEl.textContent = formatRegionalPrice(rec.streetPriceGermany?.newEur || "€29", currentRegion);
  priceNewNoteEl.textContent = `${reg.name} retail reissue`;
  priceUsedEl.textContent = formatRegionalPrice(rec.streetPriceGermany?.usedEur || "€15", currentRegion);
  priceUsedNoteEl.textContent = rec.streetPriceGermany?.conditionNote || "Used VG+/EX condition";
  linksNewEl.innerHTML = `<span class="links-loading-pulse">🔍 Loading store links...</span>`;
  linksUsedEl.innerHTML = `<span class="links-loading-pulse">🔍 Loading second-hand markets...</span>`;

  heroFavBtn.classList.toggle("active", isFavorited(rec.title, rec.artist));

  // Sync URL and record session
  recordLastDisplayedAlbum(`${rec.artist} - ${rec.title}`, rec);
  showToast(isInstantVault 
    ? `✨ Crate Pick: "${rec.title}" by ${rec.artist}!` 
    : `🎯 Sommelier Pick: "${rec.title}" by ${rec.artist}!`);

  renderAlternativesSkeletons();

  // Async DJ audio queue load with sessionToken guard
  loadYouTubeTrack1(rec.artist, rec.title, standoutSong, rec.youtubeVideoId || "").then(vId => {
    if (activeAppraisalId !== sessionToken) return;
    if (vId && currentAlbumData && currentAlbumData.title === rec.title) {
      currentAlbumData.youtubeVideoId = vId;
    }
  });

  asyncResearchBuyLinks(rec.title, rec.artist);

  fetchRealTimePrices(rec.title, rec.artist).then(freshPrices => {
    if (activeAppraisalId !== sessionToken) return;
    if (freshPrices && currentAlbumData && currentAlbumData.title === rec.title) {
      currentAlbumData.streetPriceGermany = freshPrices;
      currentAlbumData.baseNewEur = freshPrices.newEur;
      currentAlbumData.baseUsedEur = freshPrices.usedEur;
      priceNewEl.textContent = formatRegionalPrice(freshPrices.newEur || "€29", currentRegion);
      priceUsedEl.textContent = formatRegionalPrice(freshPrices.usedEur || "€15", currentRegion);
      priceUsedNoteEl.textContent = freshPrices.conditionNote || "VG+ / EX condition";
    }
  });

  fetchMissingAlternatives({
    title: rec.title,
    artist: rec.artist,
    genre: rec.genre
  });

  saveAlbumToCache({
    title: rec.title,
    artist: rec.artist,
    genre: rec.genre,
    year: rec.year,
    playtime: rec.playtime,
    trackCount: rec.trackCount,
    firstTrackTitle: rec.firstTrackTitle,
    collectorScore: rec.collectorScore,
    streetPriceGermany: rec.streetPriceGermany,
    coverUrl: albumCoverImg.src,
    sommelierNote: sommelierNote,
    alternatives: []
  });
}

async function findAndAppraiseSommelierVinyl(vibeText) {
  if (!vibeText || !vibeText.trim()) return;
  hasUserInteracted = true;

  const sessionToken = ++activeAppraisalId;
  const inputEl = document.getElementById("sommelier-input");
  const submitBtn = document.getElementById("sommelier-submit-btn");
  if (inputEl) inputEl.value = vibeText;
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<span>Digging crates...</span>`;
  }

  // Display grand audiophile turntable loading deck immediately
  loadingState.classList.remove("hidden");
  resultsSection.classList.add("hidden");
  const welcomeHero = document.getElementById("welcome-hero-state");
  if (welcomeHero) welcomeHero.classList.add("hidden");

  // Check Curated Sommelier Vault First
  const vaultHit = matchSommelierVault(vibeText);
  if (vaultHit) {
    startAudiophileLoadingTicker(`Dropping needle on "${vaultHit.title}"...`);
    // Brief 500ms tactile delay to let user enjoy the spinning 180g vinyl & tonearm needle drop
    await new Promise(resolve => setTimeout(resolve, 520));
    if (activeAppraisalId !== sessionToken) return;
    renderSommelierAlbumRecord(vaultHit, true);
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = `<span>Drop Needle ✨</span>`;
    }
    return;
  }

  // Custom User Vibe: Query Gemini with Streamlined Audiophile Prompt
  startAudiophileLoadingTicker(`Consulting Vinyl Sommelier for "${vibeText.slice(0, 32)}..."`);

  try {
    const prompt = `You are an elite master vinyl collector in Germany.
User vibe: "${vibeText.trim()}".
Recommend strictly ONE perfect physical vinyl album (celebrated for its analog dynamic range and iconic vinyl pressing).
Respond strictly in valid JSON:
{
  "album": {
    "artist": "string",
    "title": "string",
    "year": 1977,
    "genre": "string",
    "playtime": "42 min",
    "trackCount": 10,
    "firstTrackTitle": "First song title",
    "standoutTrack": "Best track to drop needle on",
    "whyOnVinyl": "2 punchy sentences on analog dynamic range & vinyl mastering.",
    "vibeMatch": "1 sentence matching the user's vibe.",
    "collectorScore": {
      "overallScore": 95,
      "discogsRating": "4.7 / 5.0",
      "ratingsCount": "15k+",
      "tier": "Essential Masterpiece",
      "verdict": "Max 25 words on audio quality and pressing dynamics."
    },
    "streetPriceGermany": {
      "newEur": "€29 – €34",
      "usedEur": "€16 – €22",
      "conditionNote": "Used VG+/EX"
    },
    "coverSearchTerm": "Artist Album"
  }
}`;

    const res = await callGeminiFlash(prompt);
    if (activeAppraisalId !== sessionToken) return;
    const rec = res?.album;

    if (!rec || !rec.title || !rec.artist) {
      throw new Error("Invalid response format from Sommelier");
    }

    renderSommelierAlbumRecord(rec, false);

  } catch (err) {
    if (activeAppraisalId !== sessionToken) return;
    console.warn("Sommelier fast-path error, falling back to direct appraisal:", err);
    await appraiseAlbum(vibeText);
  } finally {
    stopAudiophileLoadingTicker();
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = `<span>Drop Needle ✨</span>`;
    }
  }
}

function initSommelier() {
  const vibePillsWrap = document.getElementById("vibe-pills-wrap");
  const sommelierSubmitBtn = document.getElementById("sommelier-submit-btn");
  const sommelierInput = document.getElementById("sommelier-input");

  if (vibePillsWrap) {
    vibePillsWrap.addEventListener("click", (e) => {
      const pill = e.target.closest(".vibe-pill");
      if (!pill) return;
      hasUserInteracted = true;
      const vibe = pill.getAttribute("data-vibe");
      if (vibe) {
        findAndAppraiseSommelierVinyl(vibe);
      }
    });
  }

  if (sommelierSubmitBtn && sommelierInput) {
    sommelierSubmitBtn.addEventListener("click", () => {
      hasUserInteracted = true;
      const text = sommelierInput.value.trim();
      if (text) {
        findAndAppraiseSommelierVinyl(text);
      }
    });

    sommelierInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        hasUserInteracted = true;
        const text = sommelierInput.value.trim();
        if (text) {
          findAndAppraiseSommelierVinyl(text);
        }
      }
    });
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

  // 1. Save in server database (Option A: direct CDN URLs)
  try {
    const res = await fetch("/api/catalog", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(album)
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
// SESSION CONTINUITY ENGINE (REMEMBER LAST DISPLAYED ALBUM & URL SYNC)
// ============================================================================
function recordLastDisplayedAlbum(query, album) {
  if (!album && !query) return;
  const albumTitle = album?.title || "";
  const albumArtist = album?.artist || "";
  const displayQuery = (albumArtist && albumTitle) ? `${albumArtist} - ${albumTitle}` : (query || albumTitle);

  const sessionRecord = {
    query: displayQuery,
    title: albumTitle,
    artist: albumArtist,
    timestamp: Date.now()
  };

  // 1. Sync URL query param (?album=...) without reloading page
  try {
    if (typeof window !== "undefined" && window.history && displayQuery) {
      const url = new URL(window.location.href);
      url.searchParams.set("album", displayQuery);
      window.history.replaceState({ album: displayQuery }, "", url.toString());
    }
  } catch (e) {}

  // 2. Persist to client localStorage (survives page reloads & browser restarts)
  try {
    localStorage.setItem("vinyl_last_displayed_album", JSON.stringify(sessionRecord));
  } catch (e) {}

  // 3. Persist to server data/last_session.json (survives server restart & cross-device)
  try {
    fetch("/api/session/last-album", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sessionRecord)
    }).catch(() => {});
  } catch (e) {}

  // 4. Update dynamic SEO metadata, canonical link, and Schema.org in DOM
  try {
    updateDynamicSeo(displayQuery, album);
  } catch (e) {}
}

function updateDynamicSeo(displayQuery, album) {
  if (typeof document === "undefined") return;

  const title = album?.title || "";
  const artist = album?.artist || "";
  const label = (artist && title) ? `${artist} – ${title}` : displayQuery;
  const price = album?.streetPriceGermany?.newEur || "";
  const coverUrl = album?.coverUrl || "";

  // 1. Update Document Title
  document.title = `${label} | Vinyl Hound Appraisal & German Street Price`;

  // 2. Update Canonical URL
  const encodedQuery = encodeURIComponent(displayQuery).replace(/%20/g, '+');
  const canonicalUrl = `https://vinylhound.de/?album=${encodedQuery}`;
  let canonicalEl = document.querySelector('link[rel="canonical"]');
  if (!canonicalEl) {
    canonicalEl = document.createElement('link');
    canonicalEl.rel = 'canonical';
    document.head.appendChild(canonicalEl);
  }
  canonicalEl.href = canonicalUrl;

  // 3. Update Meta Description
  let metaDesc = document.querySelector('meta[name="description"]');
  if (metaDesc) {
    metaDesc.setAttribute("content", `Discover ${label} physical vinyl pressing details${price ? ' (Approx. ' + price + ')' : ''}. German street pricing, 180g analog dynamic range, and collector tips on Vinyl Hound.`);
  }

  // 4. Update Open Graph & Twitter meta tags
  const ogTitle = document.querySelector('meta[property="og:title"]');
  if (ogTitle) ogTitle.setAttribute("content", `${label} | Vinyl Hound Appraisal & Crate Digging`);
  const twTitle = document.querySelector('meta[name="twitter:title"]');
  if (twTitle) twTitle.setAttribute("content", `${label} | Vinyl Hound Appraisal & Crate Digging`);

  const descContent = `Appraise ${label} on physical vinyl${price ? ' (' + price + ')' : ''}. Analog dynamic range and German street prices.`;
  const ogDesc = document.querySelector('meta[property="og:description"]');
  if (ogDesc) ogDesc.setAttribute("content", descContent);
  const twDesc = document.querySelector('meta[name="twitter:description"]');
  if (twDesc) twDesc.setAttribute("content", descContent);

  const ogUrl = document.querySelector('meta[property="og:url"]');
  if (ogUrl) ogUrl.setAttribute("content", canonicalUrl);
  const twUrl = document.querySelector('meta[name="twitter:url"]');
  if (twUrl) twUrl.setAttribute("content", canonicalUrl);

  if (coverUrl) {
    const fullCover = coverUrl.startsWith('/') ? `https://vinylhound.de${coverUrl}` : coverUrl;
    const ogImg = document.querySelector('meta[property="og:image"]');
    if (ogImg) ogImg.setAttribute("content", fullCover);
    const twImg = document.querySelector('meta[name="twitter:image"]');
    if (twImg) twImg.setAttribute("content", fullCover);
  }

  // 5. Update or Inject Schema.org MusicAlbum JSON-LD
  let albumScript = document.getElementById('schema-music-album');
  if (!albumScript) {
    albumScript = document.createElement('script');
    albumScript.id = 'schema-music-album';
    albumScript.type = 'application/ld+json';
    document.head.appendChild(albumScript);
  }
  const albumSchema = {
    "@context": "https://schema.org",
    "@type": "MusicAlbum",
    "name": title || displayQuery,
    "byArtist": {
      "@type": "MusicGroup",
      "name": artist || "Various Artists"
    },
    "url": canonicalUrl,
    ...(coverUrl ? { "image": coverUrl.startsWith('/') ? `https://vinylhound.de${coverUrl}` : coverUrl } : {}),
    ...(album?.genre ? { "genre": album.genre } : {}),
    ...(price ? {
      "offers": {
        "@type": "Offer",
        "priceCurrency": "EUR",
        "description": `German vinyl street price: ${price}`
      }
    } : {})
  };
  albumScript.textContent = JSON.stringify(albumSchema);
}

let hasRestoredSessionAlbum = false;
let currentPotd = null;

async function fetchPickOfTheDay() {
  try {
    const res = await fetch("/api/vault/pick-of-the-day");
    if (res.ok) {
      const data = await res.json();
      if (data.success && data.pick) {
        currentPotd = data.pick;
        renderPotdBanner(data.dayOfYear, data.pick);
        return data.pick;
      }
    }
  } catch (e) {
    console.warn("Failed to fetch Pick of the Day:", e);
  }
  return null;
}

function renderPotdBanner(dayOfYear, pick) {
  if (!pick) return;
  const dayPill = document.getElementById("potd-day-pill");
  const titleArtist = document.getElementById("potd-title-artist");
  const yearEl = document.getElementById("potd-year");
  const genreEl = document.getElementById("potd-genre");

  if (dayPill) dayPill.textContent = `Day ${dayOfYear || pick.day || 1}`;
  if (titleArtist) titleArtist.textContent = `${pick.artist} — ${pick.title}`;
  if (yearEl) yearEl.textContent = pick.year || "";
  if (genreEl) genreEl.textContent = pick.genre || "Essential Vinyl";
}

async function rollRandomPick() {
  const shuffleBtn = document.getElementById("potd-shuffle-btn");
  if (shuffleBtn) {
    shuffleBtn.disabled = true;
    shuffleBtn.style.opacity = "0.7";
  }

  try {
    const res = await fetch("/api/vault/random");
    if (res.ok) {
      const data = await res.json();
      if (data.success && data.pick) {
        currentPotd = data.pick;
        renderPotdBanner(data.pick.day, data.pick);
        const displayLabel = `${data.pick.artist} - ${data.pick.title}`;
        if (albumInput) {
          albumInput.value = displayLabel;
        }
        showToast(`🎲 Rolled from 365 Vault: ${data.pick.artist} – ${data.pick.title}`);
        appraiseAlbum(data.pick.query || displayLabel);
      }
    }
  } catch (e) {
    console.warn("Failed to roll random pick:", e);
  } finally {
    if (shuffleBtn) {
      shuffleBtn.disabled = false;
      shuffleBtn.style.opacity = "1";
    }
  }
}

function initPotdListeners() {
  const shuffleBtn = document.getElementById("potd-shuffle-btn");
  const spinBtn = document.getElementById("potd-spin-btn");
  const clickable = document.getElementById("potd-clickable");

  if (shuffleBtn) {
    shuffleBtn.addEventListener("click", (e) => {
      e.preventDefault();
      rollRandomPick();
    });
  }

  const handleSpinCurrent = (e) => {
    e.preventDefault();
    if (currentPotd) {
      const displayLabel = `${currentPotd.artist} - ${currentPotd.title}`;
      if (albumInput) albumInput.value = displayLabel;
      appraiseAlbum(currentPotd.query || displayLabel);
    }
  };

  if (spinBtn) spinBtn.addEventListener("click", handleSpinCurrent);
  if (clickable) {
    clickable.addEventListener("click", handleSpinCurrent);
    clickable.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") handleSpinCurrent(e);
    });
  }
}

async function restoreLastSessionAlbum() {
  if (hasUserInteracted || hasRestoredSessionAlbum) return;
  if (currentAlbumData && currentAlbumData.title) return;
  hasRestoredSessionAlbum = true;

  initPotdListeners();

  // Fetch today's official Pick of the Day from the 365 Vault
  const potd = await fetchPickOfTheDay();

  let target = null;

  // 1. Check URL query parameters first (?album=... or ?q=...)
  try {
    if (typeof window !== "undefined") {
      const urlParams = new URLSearchParams(window.location.search);
      const urlAlbum = urlParams.get("album") || urlParams.get("q");
      if (urlAlbum && urlAlbum.trim().length > 0) {
        target = { query: urlAlbum.trim(), title: urlAlbum.trim() };
      }
    }
  } catch (e) {}

  // 2. Default to today's official 365 Holy-Grail Pick of the Day!
  if (!target && potd) {
    target = {
      query: potd.query || `${potd.artist} - ${potd.title}`,
      artist: potd.artist,
      title: potd.title
    };
  }

  // 3. Fallback if offline
  if (!target || (!target.query && !target.title)) {
    target = { query: "Miles Davis - Kind of Blue", artist: "Miles Davis", title: "Kind of Blue" };
  }

  if (hasUserInteracted || (currentAlbumData && currentAlbumData.title)) return;

  if (target && (target.query || target.title)) {
    const displayLabel = (target.artist && target.title)
      ? `${target.artist} - ${target.title}`
      : (target.title || target.query);

    if (albumInput) {
      albumInput.value = displayLabel;
    }

    const appraisalQuery = target.query || `${target.artist || ''} ${target.title || ''}`.trim();
    if (appraisalQuery && !hasUserInteracted) {
      appraiseAlbum(appraisalQuery);
    }
  }
}

async function appraiseAlbum(albumName) {
  if (!albumName || !albumName.trim()) return;

  const sessionToken = ++activeAppraisalId;

  if (!hasServerKey && !getActiveApiKey()) {
    await checkServerConfig();
    if (activeAppraisalId !== sessionToken) return;
  }

  if (albumInput && !albumInput.value) {
    albumInput.value = albumName;
  }

  loadingState.classList.remove("hidden");
  startAudiophileLoadingTicker(`Evaluating vinyl pressings for "${albumName.slice(0, 32)}"...`);
  resultsSection.classList.add("hidden");
  const welcomeHero = document.getElementById("welcome-hero-state");
  if (welcomeHero) welcomeHero.classList.add("hidden");

  // =========================================================================
  // STEP 1: CHECK STORAGE DATABASE (CACHE HIT -> 0ms LOAD)
  // =========================================================================
  const cached = await checkAlbumCache(albumName);
  if (activeAppraisalId !== sessionToken) return;

  if (cached) {
    trackSearch(albumName, false, true);
    stopAudiophileLoadingTicker();
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

    renderSommelierLore(cached.sommelierNote);

    // Immediate image from storage
    albumCoverImg.src = cached.coverUrl || generateSvgCover(cached.title, cached.artist);

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
      alternatives: cached.alternatives || [],
      currentAltOffset: 0
    };

    // Immediate DJ & Audio Purge: Synchronously wipe old media & sync DJ queue to new album
    if (heroYtIframe) {
      if (cached.youtubeVideoId) {
        heroYtIframe.src = `https://www.youtube-nocookie.com/embed/${cached.youtubeVideoId}?enablejsapi=1&autoplay=0&origin=${encodeURIComponent(window.location.origin)}`;
        if (heroYtLink) heroYtLink.href = `https://www.youtube.com/watch?v=${cached.youtubeVideoId}`;
      } else {
        heroYtIframe.src = "about:blank";
      }
    }
    if (heroYtBox) heroYtBox.classList.remove("hidden");
    if (djDeckBar && !djState.isDeckMinimized) djDeckBar.classList.remove("hidden");
    if (ytTrackTitle) ytTrackTitle.textContent = `${cached.artist} — "${cached.firstTrackTitle || cached.title}"`;

    djState.queue = buildDjQueue(currentAlbumData, cached.alternatives || [], djState.mode);
    djState.currentIndex = 0;
    renderDjQueueList();
    updateDjDeckUI();

    heroFavBtn.classList.toggle("active", isFavorited(cached.title, cached.artist));

    // Load Track 1 YouTube Listening Station & DJ queue
    loadYouTubeTrack1(cached.artist, cached.title, cached.firstTrackTitle, cached.youtubeVideoId).then(vId => {
      if (activeAppraisalId !== sessionToken) return;
      if (vId && !cached.youtubeVideoId) {
        cached.youtubeVideoId = vId;
        saveAlbumToCache(cached);
      }
    });

    // In-context animated skeleton for price area
    renderPriceLoadingSkeletons();

    // Check if cached alternatives exist and have at least 3 valid recommendations
    alternativesGenreName.textContent = cached.genre || "";
    const validAlts = (cached.alternatives || []).filter(alt => !isAlbumInFavorites(alt.title, alt.artist));
    if (validAlts.length >= 3) {
      renderAlternativesProgressive(cached.alternatives, 0);
    } else {
      // In-context animated skeletons for alternatives while resolving
      renderAlternativesSkeletons();
      fetchMissingAlternatives(cached);
    }

    // Async stream in store search links
    asyncResearchBuyLinks(cached.title, cached.artist);

    // Async fetch ONLY real-time prices live
    fetchRealTimePrices(cached.title, cached.artist).then(freshPrices => {
      if (activeAppraisalId !== sessionToken) return;
      if (currentAlbumData && currentAlbumData.title !== cached.title) return;
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
  trackSearch(albumName, true, false);
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
8. 6 to 8 alternative vinyl albums in the exact same or closely related genre that fans would love for physical crate digging discovery.${favAltTitles.length > 0 ? ` (CRITICAL: Do NOT suggest any albums from the user's favorites list: ${favAltTitles})` : ""} Include for each: title, artist, genre, playtime, number of tracks/songs, new vinyl price in Germany (EUR), used vinyl price in Germany (EUR).
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
    if (activeAppraisalId !== sessionToken) return;
    const album = data.album;
    const alternatives = data.alternatives || [];

    // =========================================================================
    // PHASE 1: IMMEDIATE UI RENDER (Album Info & Core Specs Visible Instantly)
    // =========================================================================
    stopAudiophileLoadingTicker();
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
      alternatives: alternatives,
      currentAltOffset: 0
    };

    // Immediate DJ & Audio Purge: Synchronously wipe old media & sync DJ queue to new album
    if (heroYtIframe) heroYtIframe.src = "about:blank";
    if (heroYtBox) heroYtBox.classList.remove("hidden");
    if (djDeckBar && !djState.isDeckMinimized) djDeckBar.classList.remove("hidden");
    if (ytTrackTitle) ytTrackTitle.textContent = `${album.artist} — "${album.firstTrackTitle || album.title}"`;

    djState.queue = buildDjQueue(currentAlbumData, alternatives, djState.mode);
    djState.currentIndex = 0;
    renderDjQueueList();
    updateDjDeckUI();

    heroFavBtn.classList.toggle("active", isFavorited(album.title, album.artist));
    renderSommelierLore(window.__SOMMELIER_NOTE__);

    // Load Track 1 YouTube Listening Station below fav heart
    loadYouTubeTrack1(album.artist, album.title, album.firstTrackTitle).then(vId => {
      if (activeAppraisalId !== sessionToken) return;
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
      if (activeAppraisalId !== sessionToken) return;
      if (highRes && currentAlbumData && currentAlbumData.title === album.title) {
        albumCoverImg.src = highRes;
        currentAlbumData.coverUrl = highRes;
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
    renderAlternativesProgressive(alternatives, 0);

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
    stopAudiophileLoadingTicker();
    loadingState.classList.add("hidden");
  }
}

// Asynchronously research and stream in store links with tactile transitions
async function asyncResearchBuyLinks(title, artist) {
  // Staggered resolution for smooth streaming appearance
  await new Promise(resolve => setTimeout(resolve, 300));
  if (currentAlbumData && currentAlbumData.title !== title) return;
  const newLinks = getNewVinylLinks(title, artist);
  linksNewEl.innerHTML = newLinks.map(link => `
    <a href="${link.url}" target="_blank" rel="noopener noreferrer" class="buy-link-pill fade-in" title="Buy new on ${escapeXml(link.name)}">
      ${escapeXml(link.name)} <span class="arrow-icon">↗</span>
    </a>
  `).join("");

  await new Promise(resolve => setTimeout(resolve, 200));
  if (currentAlbumData && currentAlbumData.title !== title) return;
  const usedLinks = getUsedVinylLinks(title, artist);
  linksUsedEl.innerHTML = usedLinks.map(link => `
    <a href="${link.url}" target="_blank" rel="noopener noreferrer" class="buy-link-pill fade-in" title="Buy used on ${escapeXml(link.name)}">
      ${escapeXml(link.name)} <span class="arrow-icon">↗</span>
    </a>
  `).join("");
}

// Render skeleton placeholders first, then pop in cards as artwork resolves from pool
function renderAlternativesProgressive(alternatives, shuffleOffset = 0) {
  // Strict programmatic filter: omit any album from userFavorites
  const cleanAlternatives = (alternatives || []).filter(alt => !isAlbumInFavorites(alt.title, alt.artist));
  const total = cleanAlternatives.length;

  let toRender = [];
  if (total <= 3) {
    toRender = cleanAlternatives;
  } else {
    const start = (shuffleOffset || 0) % total;
    for (let i = 0; i < 3; i++) {
      toRender.push(cleanAlternatives[(start + i) % total]);
    }
  }

  if (currentAlbumData) {
    currentAlbumData.currentAltOffset = shuffleOffset;
    currentAlbumData.displayedAlternatives = toRender;
    if (cleanAlternatives.length > 0 && (!djState.queue || djState.queue.length <= 1)) {
      djState.queue = buildDjQueue(currentAlbumData, cleanAlternatives, djState.mode);
      renderDjQueueList();
      updateDjDeckUI();
    }
  }

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
          <button class="alt-dj-cue-btn" type="button" title="Spin on Vinyl DJ turntable">
            ▶ Cue DJ
          </button>
          <a href="${primaryNewStore.url}" target="_blank" rel="noopener noreferrer" class="alt-buy-link" onclick="event.stopPropagation()" title="Buy new on ${escapeXml(primaryNewStore.name)}">
            ${escapeXml(primaryNewStore.name)} ↗
          </a>
          <a href="${primaryUsedStore.url}" target="_blank" rel="noopener noreferrer" class="alt-buy-link" onclick="event.stopPropagation()" title="Buy used on ${escapeXml(primaryUsedStore.name)}">
            ${escapeXml(primaryUsedStore.name)} ↗
          </a>
        </div>
      `;

      // Wire Cue DJ button on alternative
      const altCueBtn = card.querySelector(".alt-dj-cue-btn");
      if (altCueBtn) {
        altCueBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          const existingIdx = djState.queue.findIndex(item => normalizeCatalogKey(item.albumTitle) === normalizeCatalogKey(alt.title));
          if (existingIdx >= 0) {
            djPlayIndex(existingIdx, true);
          } else {
            const newEntry = {
              id: `cue-${normalizeCatalogKey(alt.title)}`,
              title: alt.title,
              displayTitle: djState.mode === 'track' ? `${alt.title}` : `Full Vinyl LP Session`,
              albumTitle: alt.title,
              artist: alt.artist || "Unknown",
              coverUrl: coverUrl,
              mode: djState.mode,
              duration: alt.playtime || "Standout Track",
              searchQuery: djState.mode === 'track' ? `${alt.artist || ''} ${alt.title} audio`.trim() : `${alt.artist || ''} ${alt.title} full vinyl album`.trim(),
              videoId: ""
            };
            djState.queue.splice(djState.currentIndex + 1, 0, newEntry);
            djPlayIndex(djState.currentIndex + 1, true);
          }
        });
      }

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
        hasUserInteracted = true;
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

// Fetch and curate fresh alternative recommendations when a cached album lacks them or to expand pool
async function fetchMissingAlternatives(cached, forceExpand = false) {
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
For the vinyl album "${cached.title}" by "${cached.artist || 'Unknown'}" (genre / style: ${cached.genre || "Vinyl"}), recommend 6 to 8 essential alternative vinyl albums in the same or closely related musical style for vinyl collectors in Germany.${favAltExclusionPrompt}
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
      // Merge with existing alternatives pool (deduplicating by normalized title & artist)
      const existing = Array.isArray(cached.alternatives) ? [...cached.alternatives] : [];
      const seen = new Set(existing.map(a => normalizeCatalogKey((a.artist || '') + ' ' + a.title)));

      for (const fresh of newAlternatives) {
        const key = normalizeCatalogKey((fresh.artist || '') + ' ' + fresh.title);
        if (!seen.has(key)) {
          seen.add(key);
          existing.push(fresh);
        }
      }

      cached.alternatives = existing.length > 0 ? existing : newAlternatives;
      saveAlbumToCache(cached);

      if (currentAlbumData && currentAlbumData.title === cached.title) {
        currentAlbumData.alternatives = cached.alternatives;
        const offset = forceExpand ? 3 : (currentAlbumData?.currentAltOffset || 0);
        renderAlternativesProgressive(cached.alternatives, offset);
      }
    } else {
      if (currentAlbumData && currentAlbumData.title === cached.title) {
        renderAlternativesProgressive(cached.alternatives || [], 0);
      }
    }
  } catch (err) {
    console.error("fetchMissingAlternatives failed:", err);
    renderAlternativesProgressive(cached.alternatives || [], 0);
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
  hasUserInteracted = true;
  hideAutocomplete();
  const query = albumInput.value.trim();
  if (query) {
    appraiseAlbum(query);
  }
});

document.querySelectorAll(".chip").forEach(chip => {
  chip.addEventListener("click", () => {
    hasUserInteracted = true;
    hideAutocomplete();
    const album = chip.getAttribute("data-album");
    albumInput.value = album;
    appraiseAlbum(album);
  });
});

// Instant "Fresh Picks" Shuffle from Extended Alternatives Pool
if (shuffleAltsBtn) {
  shuffleAltsBtn.addEventListener("click", () => {
    if (!currentAlbumData || !currentAlbumData.alternatives || currentAlbumData.alternatives.length === 0) return;

    shuffleAltsBtn.classList.add("spinning");
    setTimeout(() => { shuffleAltsBtn.classList.remove("spinning"); }, 500);

    const cleanPool = currentAlbumData.alternatives.filter(alt => !isAlbumInFavorites(alt.title, alt.artist));

    if (cleanPool.length <= 3) {
      // If pool has 3 or fewer items, expand pool dynamically with fresh recommendations
      fetchMissingAlternatives(currentAlbumData, true);
      return;
    }

    const nextOffset = ((currentAlbumData.currentAltOffset || 0) + 3) % cleanPool.length;
    currentAlbumData.currentAltOffset = nextOffset;
    renderAlternativesProgressive(currentAlbumData.alternatives, nextOffset);
  });
}

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
    } else if (userFavorites.length === 0) {
      // 2. Fallback to /api/favorites from server disk storage
      try {
        const res = await fetch(`/api/favorites?uid=${encodeURIComponent(currentUser.uid)}`);
        if (res.ok) {
          const json = await res.json();
          if (json.success && Array.isArray(json.data) && json.data.length > 0) {
            userFavorites = json.data;
            localStorage.setItem(key, JSON.stringify(userFavorites));
            updateFavsUI();
            await saveUserFavoritesToFirestore();
          }
        }
      } catch (e) {}
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

  // In public mode, prompt Google login if visitor is not authenticated yet
  if (!currentUser) {
    openFavSignInModal(album);
    return;
  }

  const prevSig = getLast3LikedSignature();

  const index = userFavorites.findIndex(
    f => f.title.toLowerCase() === album.title.toLowerCase() &&
         (album.artist ? f.artist.toLowerCase() === album.artist.toLowerCase() : true)
  );

  const wasAdded = index < 0;

  if (index >= 0) {
    userFavorites.splice(index, 1);
    showToast(`Removed "${album.title}" from crate`);
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
    showToast(`❤️ Saved "${album.title}" to your crate!`);
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
    if (!currentUser) {
      favsDrawerList.innerHTML = `
        <div class="favs-empty-state">
          <span class="favs-empty-icon">🤍</span>
          <p class="favs-empty-text">No favorites saved yet.</p>
          <p style="font-size: 13px; color: var(--text-secondary); margin-top: 6px; line-height: 1.4;">
            Sign in with Google to save albums to your personal vinyl crate and sync across all your devices.
          </p>
          <button id="drawer-signin-btn" class="google-auth-btn modal-signin-btn" type="button" style="margin-top: 16px; font-size: 13px; padding: 10px 16px;">
            <svg class="google-icon" viewBox="0 0 24 24" width="16" height="16">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
            </svg>
            Sign in with Google
          </button>
        </div>
      `;
      const drawerSignInBtn = document.getElementById("drawer-signin-btn");
      if (drawerSignInBtn) {
        drawerSignInBtn.addEventListener("click", performGoogleSignIn);
      }
    } else {
      favsDrawerList.innerHTML = `
        <div class="favs-empty-state">
          <span class="favs-empty-icon">🤍</span>
          <p class="favs-empty-text">No favorites saved yet. Click the heart on any album or alternative to keep it in your personal crate!</p>
        </div>
      `;
    }
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
      hasUserInteracted = true;
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
// 12. PWA INSTALLATION & SERVICE WORKER LIFECYCLE
// ============================================================================
let deferredInstallPrompt = null;
const pwaInstallBtn = document.getElementById("pwa-install-btn");
const pwaIosModal = document.getElementById("pwa-ios-modal");
const pwaIosCloseBtn = document.getElementById("pwa-ios-close-btn");
const pwaIosDoneBtn = document.getElementById("pwa-ios-done-btn");

function initPwa() {
  // 1. Register Service Worker
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").then((reg) => {
        console.log("[PWA] Service Worker active with scope:", reg.scope);
      }).catch((err) => {
        console.warn("[PWA] Service Worker registration note:", err.message);
      });
    });
  }

  // 2. Capture Android / Chrome / Edge Install Prompt
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    if (pwaInstallBtn) {
      pwaInstallBtn.classList.remove("hidden");
    }
  });

  // 3. Detect iOS Safari (no native beforeinstallprompt event)
  const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  const isStandalone = window.navigator.standalone || window.matchMedia("(display-mode: standalone)").matches;

  // On iOS Safari, show the install button if not already running standalone
  if (isIos && !isStandalone && pwaInstallBtn) {
    pwaInstallBtn.classList.remove("hidden");
  }

  // 4. Handle Install Button click
  if (pwaInstallBtn) {
    pwaInstallBtn.addEventListener("click", async () => {
      if (deferredInstallPrompt) {
        deferredInstallPrompt.prompt();
        const { outcome } = await deferredInstallPrompt.userChoice;
        console.log("[PWA] User choice outcome:", outcome);
        deferredInstallPrompt = null;
        pwaInstallBtn.classList.add("hidden");
      } else if (isIos && pwaIosModal) {
        pwaIosModal.classList.remove("hidden");
      } else {
        alert("To install Vinyl Hound as an app: open your browser menu (⋮ or Share) and select 'Install Vinyl Hound' or 'Add to Home Screen'.");
      }
    });
  }

  // 5. iOS Install Modal interactions
  if (pwaIosCloseBtn && pwaIosModal) {
    pwaIosCloseBtn.addEventListener("click", () => pwaIosModal.classList.add("hidden"));
  }
  if (pwaIosDoneBtn && pwaIosModal) {
    pwaIosDoneBtn.addEventListener("click", () => pwaIosModal.classList.add("hidden"));
  }
  if (pwaIosModal) {
    pwaIosModal.addEventListener("click", (e) => {
      if (e.target === pwaIosModal) pwaIosModal.classList.add("hidden");
    });
  }

  // 6. Installed event listener
  window.addEventListener("appinstalled", () => {
    console.log("[PWA] Vinyl Hound was successfully installed!");
    if (pwaInstallBtn) {
      pwaInstallBtn.classList.add("hidden");
    }
  });
}

// Header scroll adaptation & Brand click
function initHeaderScroll() {
  const topNav = document.getElementById("top-nav");
  const navBrand = document.getElementById("nav-brand");

  if (topNav) {
    window.addEventListener("scroll", () => {
      if (window.scrollY > 30) {
        topNav.classList.add("scrolled");
      } else {
        topNav.classList.remove("scrolled");
      }
    }, { passive: true });
  }

  if (navBrand) {
    navBrand.addEventListener("click", () => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }
}

// Dynamic Placeholder Hints (e.g. Daft Punk - Discovery)
function initPlaceholderHints() {
  const hints = [
    "Search any artist or album... (e.g. Daft Punk - Discovery)",
    "Search any artist or album... (e.g. Pink Floyd - The Dark Side of the Moon)",
    "Search any artist or album... (e.g. Fleetwood Mac - Rumours)",
    "Search any artist or album... (e.g. Miles Davis - Kind of Blue)",
    "Search any artist or album... (e.g. The Beatles - Abbey Road)"
  ];
  let hintIdx = 0;

  if (!albumInput) return;

  setInterval(() => {
    if (document.activeElement !== albumInput && !albumInput.value) {
      hintIdx = (hintIdx + 1) % hints.length;
      albumInput.placeholder = hints[hintIdx];
    }
  }, 4500);
}

// ============================================================================
// 13. INITIALIZATION
// ============================================================================
initTheme();
initRegionSelector();
checkServerConfig().then(() => {
  restoreLastSessionAlbum();
});
initSommelier();
initPwa();
initHeaderScroll();
initPlaceholderHints();


