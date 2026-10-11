import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { 
  getAuth, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut, 
  onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";

// ============================================================================
// 1. CONFIGURATION & ADMIN AUTHORIZATION
// ============================================================================
const ADMIN_EMAILS = ["aosterloh@gmail.com"];

const DEFAULT_FIREBASE_CONFIG = {
  apiKey: "AIzaSyBohm2Obe3zqxav80otAKVmYkYlsQtu5yk",
  authDomain: "vinyl-hound.firebaseapp.com",
  projectId: "vinyl-hound",
  storageBucket: "vinyl-hound.firebasestorage.app",
  appId: "1:403699448912:web:60810f38aad00541036555"
};

const activeConfig = window.__FIREBASE_CONFIG__ || DEFAULT_FIREBASE_CONFIG;
const app = initializeApp(activeConfig);
const auth = getAuth(app);

let currentUser = null;
let cachedStatsData = null;
let pollTimer = null;

// DOM Elements
const dashboardShell = document.getElementById("admin-dashboard-shell");
const signoutBtn = document.getElementById("admin-signout-btn");
const userAvatar = document.getElementById("admin-user-avatar");
const refreshBtn = document.getElementById("refresh-stats-btn");
const exportBtn = document.getElementById("export-stats-btn");
const resetBtn = document.getElementById("reset-stats-btn");
const lastUpdatedText = document.getElementById("last-updated-text");
const themeToggle = document.getElementById("theme-toggle");

// ============================================================================
// 2. THEME PERSISTENCE & TOGGLING
// ============================================================================
function initTheme() {
  const savedTheme = localStorage.getItem("theme") || 
    (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  applyTheme(savedTheme);

  if (themeToggle) {
    themeToggle.addEventListener("click", () => {
      const current = document.documentElement.getAttribute("data-theme") || "dark";
      const next = current === "dark" ? "light" : "dark";
      applyTheme(next);
      localStorage.setItem("theme", next);
    });
  }
}

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  if (theme === "light") {
    document.body.classList.add("light-theme");
  } else {
    document.body.classList.remove("light-theme");
  }
}

initTheme();

// ============================================================================
// 3. TOAST NOTIFICATIONS
// ============================================================================
function showToast(message) {
  const toast = document.getElementById("vinyl-toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("visible");
  setTimeout(() => {
    toast.classList.remove("visible");
  }, 3200);
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function createAvatarPlaceholder(name) {
  const initial = (name ? name.charAt(0) : "A").toUpperCase();
  return `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><rect width="32" height="32" rx="16" fill="%23d4af37"/><text x="16" y="21" font-family="sans-serif" font-size="16" font-weight="bold" fill="%23111" text-anchor="middle">${initial}</text></svg>`;
}

// ============================================================================
// 4. AUTHENTICATION LIFECYCLE (STEALTH MODE: ONLY aosterloh@gmail.com)
// ============================================================================
function checkAdminAccess(user) {
  if (!user || !user.email) return false;
  return ADMIN_EMAILS.includes(user.email.toLowerCase().trim());
}

onAuthStateChanged(auth, async (user) => {
  if (user && checkAdminAccess(user)) {
    // Admin verified! Reveal dashboard
    currentUser = user;
    document.body.style.display = "block";
    if (dashboardShell) dashboardShell.classList.remove("hidden");

    if (userAvatar) {
      const name = user.displayName || user.email || "Alex";
      userAvatar.onerror = () => {
        userAvatar.onerror = null;
        userAvatar.src = createAvatarPlaceholder(name);
      };
      userAvatar.src = user.photoURL || createAvatarPlaceholder(name);
      userAvatar.title = user.displayName || "Admin";
    }

    // Load live metrics and start polling
    await fetchAndRenderStats();
    startPolling();
  } else {
    // Non-admin or unauthenticated: immediately redirect silently to homepage
    if (user) {
      await signOut(auth);
    }
    currentUser = null;
    stopPolling();
    window.location.replace("/");
  }
});

if (signoutBtn) {
  signoutBtn.addEventListener("click", async () => {
    await signOut(auth);
    window.location.replace("/");
  });
}

// ============================================================================
// 5. STATS RETRIEVAL & RENDERING ENGINE
// ============================================================================
async function fetchAndRenderStats(isManualRefresh = false) {
  if (!currentUser || !currentUser.email) return;

  if (refreshBtn && isManualRefresh) {
    refreshBtn.classList.add("loading");
  }

  try {
    const res = await fetch("/api/admin/stats", {
      headers: {
        "x-admin-email": currentUser.email
      }
    });

    if (res.status === 403) {
      showToast("Access Restricted: Admin credentials required");
      return;
    }

    if (!res.ok) {
      throw new Error(`Server returned status ${res.status}`);
    }

    const data = await res.json();
    if (!data.success) {
      throw new Error(data.error || "Failed to load stats");
    }

    cachedStatsData = data;
    renderStats(data);

    if (lastUpdatedText) {
      const now = new Date();
      lastUpdatedText.textContent = `Updated ${now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`;
    }

    if (isManualRefresh) {
      showToast("Live data refreshed");
    }
  } catch (err) {
    console.error("Failed to fetch admin stats:", err);
    showToast("Error retrieving live stats");
  } finally {
    if (refreshBtn) {
      refreshBtn.classList.remove("loading");
    }
  }
}

function renderStats(data) {
  const stats = data.stats || {};
  const visits = stats.visits || {};
  const searches = stats.searches || {};
  const clicks = stats.clicks || {};
  const byStore = clicks.byStore || {};

  // 1. KPI Cards
  const totalVisitsEl = document.getElementById("stat-total-visits");
  if (totalVisitsEl) totalVisitsEl.textContent = (visits.total || 0).toLocaleString();

  const todayVisitsEl = document.getElementById("stat-today-visits");
  if (todayVisitsEl) {
    todayVisitsEl.textContent = `Today: ${(data.todayVisits || 0).toLocaleString()} (Uniq: ${data.uniqueSessionsCount || 0})`;
  }

  const totalSearchesEl = document.getElementById("stat-total-searches");
  if (totalSearchesEl) totalSearchesEl.textContent = (searches.total || 0).toLocaleString();

  const aiSearchesEl = document.getElementById("stat-ai-searches");
  if (aiSearchesEl) aiSearchesEl.textContent = `AI Sommelier: ${(searches.aiAppraisals || 0).toLocaleString()}`;

  const totalClicksEl = document.getElementById("stat-total-clicks");
  if (totalClicksEl) totalClicksEl.textContent = (clicks.total || 0).toLocaleString();

  let topStoreName = "None";
  let maxClicks = 0;
  for (const [store, count] of Object.entries(byStore)) {
    if (count > maxClicks) {
      maxClicks = count;
      topStoreName = store.toUpperCase();
    }
  }
  const topStoreEl = document.getElementById("stat-top-store");
  if (topStoreEl) topStoreEl.textContent = `Top: ${topStoreName} (${maxClicks})`;

  const catalogCountEl = document.getElementById("stat-catalog-count");
  if (catalogCountEl) catalogCountEl.textContent = (data.catalogCount || 0).toLocaleString();

  const cachedCoversEl = document.getElementById("stat-cached-covers");
  if (cachedCoversEl) cachedCoversEl.textContent = `Covers: ${(data.imageCount || 0).toLocaleString()}`;

  const favsCountEl = document.getElementById("stat-favs-count");
  if (favsCountEl) favsCountEl.textContent = (data.totalFavorites || 0).toLocaleString();

  const activeUsersEl = document.getElementById("stat-active-users");
  if (activeUsersEl) activeUsersEl.textContent = `Users: ${(data.userCount || 0).toLocaleString()}`;

  const uptimeEl = document.getElementById("stat-uptime");
  if (uptimeEl) {
    const mins = Math.floor((data.uptimeSeconds || 0) / 60);
    const hrs = Math.floor(mins / 60);
    uptimeEl.textContent = hrs > 0 ? `${hrs}h ${mins % 60}m` : `${mins}m`;
  }

  const keyPoolEl = document.getElementById("stat-key-pool");
  if (keyPoolEl) keyPoolEl.textContent = `Gemini Keys: ${data.keyCount || 0}`;

  // 2. Store Clicks Breakdown Bars
  const storeBarsContainer = document.getElementById("store-clicks-bars");
  if (storeBarsContainer) {
    storeBarsContainer.innerHTML = "";
    const storeLabels = {
      jpc: { label: "JPC.de (Germany / EU)", color: "#e88024" },
      hhv: { label: "HHV.de (Berlin / Vinyl)", color: "#c94a29" },
      discogs: { label: "Discogs Marketplace", color: "#666666" },
      ebay: { label: "eBay (New & Used)", color: "#0064d2" },
      amazon: { label: "Amazon Vinyl", color: "#ff9900" }
    };

    const totalStoreClicks = clicks.total || 0;
    for (const [key, meta] of Object.entries(storeLabels)) {
      const count = byStore[key] || 0;
      const pct = totalStoreClicks > 0 ? Math.round((count / totalStoreClicks) * 100) : 0;

      const barRow = document.createElement("div");
      barRow.className = "store-bar-row";
      barRow.innerHTML = `
        <div class="store-bar-label-line">
          <span class="store-bar-name">${meta.label}</span>
          <span class="store-bar-count">${count} clicks (${pct}%)</span>
        </div>
        <div class="store-bar-track">
          <div class="store-bar-fill" style="width: ${pct}%; background-color: ${meta.color};"></div>
        </div>
      `;
      storeBarsContainer.appendChild(barRow);
    }
  }

  // 3. Top Searched Vinyl Leaderboard
  const topListContainer = document.getElementById("top-searches-list");
  if (topListContainer) {
    topListContainer.innerHTML = "";
    const topQueries = Object.entries(searches.topQueries || {})
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    if (topQueries.length === 0) {
      topListContainer.innerHTML = `<div class="empty-state-text">No vinyl searches recorded yet.</div>`;
    } else {
      topQueries.forEach(([q, count], idx) => {
        const item = document.createElement("a");
        item.href = `/?album=${encodeURIComponent(q)}`;
        item.className = "top-search-item";
        item.title = `Appraise "${q}" on Vinyl Hound`;
        item.innerHTML = `
          <span class="top-rank">#${idx + 1}</span>
          <span class="top-query-title">${escapeHtml(q)}</span>
          <span class="top-query-count">${count} ${count === 1 ? "search" : "searches"}</span>
          <span class="top-link-arrow">↗</span>
        `;
        topListContainer.appendChild(item);
      });
    }
  }

  // 4. Live Activity Feed Table
  const feedBody = document.getElementById("activity-feed-body");
  if (feedBody) {
    feedBody.innerHTML = "";
    const combinedEvents = [];

    (searches.recent || []).forEach(s => {
      combinedEvents.push({
        type: "SEARCH",
        time: s.timestamp,
        detail: s.query,
        origin: s.hit ? "Catalog Cache Hit" : (s.isAi ? "Gemini Sommelier AI" : "Search")
      });
    });

    (clicks.recent || []).forEach(c => {
      combinedEvents.push({
        type: "CLICK",
        time: c.timestamp,
        detail: c.albumTitle || c.query || "Outbound link",
        origin: c.store.toUpperCase()
      });
    });

    combinedEvents.sort((a, b) => b.time - a.time);
    const recentEvents = combinedEvents.slice(0, 25);

    if (recentEvents.length === 0) {
      feedBody.innerHTML = `<tr><td colspan="4" class="empty-feed-cell">No recent events tracked yet.</td></tr>`;
    } else {
      recentEvents.forEach(evt => {
        const tr = document.createElement("tr");
        const dateStr = new Date(evt.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
        const typeBadge = evt.type === "CLICK"
          ? `<span class="event-badge badge-click">STORE CLICK</span>`
          : `<span class="event-badge badge-search">SEARCH</span>`;
        tr.innerHTML = `
          <td class="event-time">${dateStr}</td>
          <td>${typeBadge}</td>
          <td class="event-detail">${escapeHtml(evt.detail)}</td>
          <td class="event-origin">${escapeHtml(evt.origin)}</td>
        `;
        feedBody.appendChild(tr);
      });
    }
  }

  // 5. Diagnostics
  const nodeVerEl = document.getElementById("diag-node-version");
  if (nodeVerEl) nodeVerEl.textContent = data.nodeVersion || process?.version || "Node.js";

  const memHeapEl = document.getElementById("diag-memory-heap");
  if (memHeapEl && data.memoryUsage?.heapUsed) {
    memHeapEl.textContent = `${Math.round(data.memoryUsage.heapUsed / 1024 / 1024)} MB`;
  }

  const memRssEl = document.getElementById("diag-memory-rss");
  if (memRssEl && data.memoryUsage?.rss) {
    memRssEl.textContent = `${Math.round(data.memoryUsage.rss / 1024 / 1024)} MB`;
  }
}

// ============================================================================
// 6. POLLING & EXPORT UTILITIES
// ============================================================================
function startPolling() {
  stopPolling();
  pollTimer = setInterval(() => {
    fetchAndRenderStats(false);
  }, 15000);
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

if (refreshBtn) {
  refreshBtn.addEventListener("click", () => {
    fetchAndRenderStats(true);
  });
}

if (exportBtn) {
  exportBtn.addEventListener("click", () => {
    if (!cachedStatsData) {
      showToast("No stats data available to export");
      return;
    }
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(cachedStatsData, null, 2));
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `vinylhound-analytics-${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    showToast("Exported analytics report");
  });
}

if (resetBtn) {
  resetBtn.addEventListener("click", async () => {
    if (!currentUser || !currentUser.email) return;
    const confirmReset = window.confirm("⚠️ Are you sure you want to reset all analytics counters to zero? This cannot be undone.");
    if (!confirmReset) return;

    try {
      const res = await fetch("/api/admin/reset-stats", {
        method: "POST",
        headers: {
          "x-admin-email": currentUser.email
        }
      });
      const data = await res.json();
      if (data.success) {
        showToast("Analytics counters reset");
        await fetchAndRenderStats();
      } else {
        showToast("Failed to reset metrics");
      }
    } catch (err) {
      console.error("Reset error:", err);
      showToast("Error resetting metrics");
    }
  });
}
