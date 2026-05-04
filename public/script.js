import './js/core/state.js';
import './js/core/db.js';
import './js/pages/profiles.js';
import './js/core/routing.js';
import './js/ui/theme.js';
import './js/pages/search.js';
import './js/pages/video-player.js';
import './js/pages/import.js';
import './js/ui/renderers.js';
import './js/pages/home.js';
import './js/pages/channels.js';
import './js/pages/years.js';
import './js/pages/overview.js';
import './js/ui/charts.js';
import './js/core/utils.js';
import './js/pages/timeline.js';
import './js/pages/saved.js';
import './js/pages/playlists.js';
import './js/pages/management.js';

// ─── INIT ─────────────────────────────────────────────────────────────────
const ALLOWED_SECTIONS = new Set(["YTP nostrane", "YTP fai da te", "YTPMV dimportazione", "YTP da internet", "Internet", "Youtube", "Scraped Channel"]);
const SOURCES_SECTIONS = new Set(["Risorse", "Tutorial per il pooping", "Old Sources"]);

function resetFilters() {
  const inputs = ['search-input', 'filter-status', 'filter-section', 'filter-channel', 'filter-views-min', 'filter-likes-min', 'filter-year-min', 'filter-year-max', 'channel-search', 'channel-year-min', 'channel-year-max'];
  inputs.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = (el.tagName === 'SELECT' ? '' : '');
  });
  const langSel = document.getElementById('filter-language');
  if (langSel) langSel.value = 'any';
}

function initApp() {
  resetFilters();
  syncSearchLayout();

  document.getElementById('app').style.display = 'block';

  // Hide all loaders
  document.querySelectorAll('.page').forEach(el => el.classList.remove('is-loading'));
  document.querySelectorAll('.page-loader').forEach(el => el.style.display = 'none');

  updateBadges();

  buildFilterOptions();
  buildOverview();
  applyFilters();
  renderChannelGrid();
  renderYearGrid();
  buildFirstUploadCache();

  const yearSelectors = [document.getElementById('global-year-selector'), document.getElementById('modern-global-year-selector')];
  if (yearSelectors[0] || yearSelectors[1]) {
    const minYearRes = queryDB("SELECT MIN(CAST(substr(publish_date, 1, 4) AS INTEGER)) as m FROM videos");
    const minYear = (minYearRes && minYearRes[0] && minYearRes[0].m) ? parseInt(minYearRes[0].m) : 2005;
    const currentYear = new Date().getFullYear();
    globalMaxYear = currentYear;

    let optionsHtml = '';
    for (let y = currentYear; y >= minYear; y--) {
      optionsHtml += `<option value="${y}">${y}</option>`;
    }
    optionsHtml += `<option value="9999">All time</option>`;

    yearSelectors.forEach(sel => {
      if (sel) {
        sel.innerHTML = optionsHtml;
        sel.value = globalMaxYear;
      }
    });
  }
  if (appMode === 'videos') {
    renderHomePage();
  }

  // Restore theme and aspect ratio
  const lastMode = localStorage.getItem('lastThemeMode') || 'old';
  const isCurrentlyOld = document.body.classList.contains('theme-old');

  if (lastMode === 'modern' && isCurrentlyOld) {
    toggleThemeMode();
  } else {
    const isOld = document.body.classList.contains('theme-old');
    const ratio = localStorage.getItem(isOld ? 'aspectRatioOld' : 'aspectRatioModern') || (isOld ? '4-3' : '16-9');
    setAspectRatio(ratio, false);
  }

  handleRouting();
}


// Expose functions to global scope
window.resetFilters = resetFilters;
window.initApp = initApp;

// Auto-load logic
async function autoLoad() {
  const isHttp = window.location.protocol.startsWith('http');

  try {
    await initSQLite();
  } catch (e) {
    console.error("Failed to load SQLite DB:", e);
    alert("Errore nel caricamento del database. Ricarica la pagina.");
    return;
  }

  // Load essential metadata for app init
  const channels = queryDB("SELECT * FROM channels");
  window.pooperMap = {};
  channels.forEach(p => {
    if (p.channel_name) window.pooperMap[p.channel_name] = p;
  });


  initApp();

  // Detect server mode for management features
  if (isHttp) {
    try {
      const r = await fetch('/api/ban', { method: 'POST', body: JSON.stringify({ videoIds: [] }) });
      if (r.ok || r.status === 400) {
        window.isServerMode = true;
        console.log("Server mode detected: Management features enabled.");
        const ma = document.getElementById('management-actions');
        if (ma) ma.style.display = 'flex';

        const importBtn = document.getElementById('btn-import');
        const helpBtn = document.getElementById('btn-help');
        if (importBtn) importBtn.style.display = 'inline-block';
        if (helpBtn) helpBtn.style.display = 'none';
      }
    } catch (e) { }
  }

  const ps = document.getElementById('playback-source-container');
  if (ps) ps.style.display = 'inline-block';
}

// Start app
(async () => {
  try {
    await initIndexedDB(); // Renamed from initDB to avoid confusion with sqlDB
    console.log("IndexedDB initialized.");
  } catch (e) {
    console.error("IndexedDB initialization failed:", e);
  }
  await autoLoad();

  try {
    const local = await getLocalPlaylists();
    const server = await getServerPlaylists();
    window.allPlaylists = { local, server };
  } catch (e) { }
})();
