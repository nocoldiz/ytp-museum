let allVideos = [];       // from video_index.json
let allSources = [];      // from sources_index.json
let allPoopers = {};      // from ytpoopers_index.json
let pooperMap = {};       // channel_name -> pooper data
let filteredVideos = [];
let appMode = 'videos';   // 'videos' or 'sources'
let isServerMode = false;
let currentPage = 1;
const PAGE_SIZE = 50;
let selectedChannel = null;
let selectedSection = null;
let charts = {};
let globalMaxYear = new Date().getFullYear();
let currentVideoMode = "all"; // "all", "ytp", "sources"
let sourceChannels = new Set();
let allSearchIndex = [];    // [id, title, channel, year, views, dur, desc]
let playbackMode = localStorage.getItem('ytp-playback-mode') || 'youtube'; 
let subscriptions = JSON.parse(localStorage.getItem('ytp-subscriptions') || '[]');

// DB Constants (Must be at top for initialization)
const dbName = 'YTPArchiveDB';
const storeName = 'savedVideos';
let db;

function toggleVideoMode() {
  if (currentVideoMode === "all") currentVideoMode = "ytp";
  else if (currentVideoMode === "ytp") currentVideoMode = "sources";
  else currentVideoMode = "all";

  const txt = currentVideoMode === "all" ? "Show all videos" :
    currentVideoMode === "ytp" ? "Show YTP videos" :
      "Show other videos";

  document.querySelectorAll('.btn-video-mode').forEach(btn => btn.textContent = txt);

  if (document.getElementById('page-youtube').classList.contains('active')) {
    renderHomePage();
  }
  const q = document.getElementById('global-search-input').value.trim();
  if (q && document.getElementById('page-search').classList.contains('active')) {
    performSearch(q);
  }
}

function getActiveVideos(forHome = false) {
  const all = [...allVideos, ...allSources];
  if (currentVideoMode === "all") return forHome ? allVideos : all;

  if (currentVideoMode === "ytp") {
    return allVideos.filter(v => !v.channel_name || !sourceChannels.has(v.channel_name));
  }

  const currentYear = new Date().getFullYear();

  // Apply global year limit strictly
  return baseList.filter(v => {
    if (!v.publish_date) {
      // Only allow videos with unknown dates if the filter is set to the present year
      return globalMaxYear === currentYear;
    }
    return parseInt(v.publish_date.slice(0, 4)) <= globalMaxYear;
  });
}

let renderedHomeVideoIds = new Set();
let isFetchingMoreHome = false;
let currentModernTab = 'featured';

function shuffleArray(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
function setGlobalMaxYear(year) {
  globalMaxYear = parseInt(year);

  // Re-render active views
  if (document.getElementById('page-youtube').classList.contains('active')) renderHomePage();
  if (document.getElementById('page-videos').classList.contains('active')) applyFilters();
  if (document.getElementById('page-search').classList.contains('active')) {
    const q = document.getElementById('global-search-input').value.trim();
    if (q) performSearch(q);
  }
  if (document.getElementById('page-channels').classList.contains('active')) renderChannelGrid();

  // Reload profile if open
  if (document.getElementById('page-profile').classList.contains('active')) {
    const url = new URL(window.location);
    let user = url.searchParams.get('user') || url.searchParams.get('c') || url.searchParams.get('channel');
    if (!user && url.pathname.startsWith('/@')) user = url.pathname.slice(2);
    if (!user && (url.pathname.startsWith('/user/') || url.pathname.startsWith('/c/') || url.pathname.startsWith('/channel/'))) {
      user = url.pathname.split('/')[2];
    }
    if (user) openProfile(decodeURIComponent(user), false);
  }
}
document.getElementById('fileInput').addEventListener('change', e => {
  const files = Array.from(e.target.files);
  loadMultipleFiles(files);
});

const dz = document.getElementById('dropZone');
dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('drag-over'); });
dz.addEventListener('dragleave', () => dz.classList.remove('drag-over'));
dz.addEventListener('drop', e => {
  e.preventDefault(); dz.classList.remove('drag-over');
  const files = Array.from(e.dataTransfer.files);
  loadMultipleFiles(files);
});

async function loadMultipleFiles(files) {
  let videoData = null;
  let sourceData = null;
  let pooperData = null;

  for (const f of files) {
    const text = await f.text();
    const json = JSON.parse(text);
    if (f.name.includes('sources')) sourceData = json;
    else if (f.name.includes('ytpoopers')) pooperData = json;
    else videoData = json;
  }
  initApp(videoData, sourceData, pooperData);
}

// Auto-load from same directory
async function autoLoad() {
  const isHttp = window.location.protocol.startsWith('http');
  if (isHttp) {
    // Skip landing page immediately if on a server
    document.getElementById('landing').style.display = 'none';
    document.getElementById('app').style.display = 'block';
  }

  let vData = null;
  let sData = null;
  let pData = null;
  try {
    const rv = await fetch('db/video_index.json');
    if (rv.ok) vData = await rv.json();
    else {
      // Fallback to the old big index if the lite one doesn't exist yet
      const rv2 = await fetch('db/video_index.json');
      if (rv2.ok) vData = await rv2.json();
    }
  } catch (e) { }
  try {
    const rs = await fetch('db/sources_index.json');
    if (rs.ok) sData = await rs.json();
    else {
      const rs2 = await fetch('db/sources_index.json');
      if (rs2.ok) sData = await rs2.json();
    }
  } catch (e) { }
  try {
    const rp = await fetch('db/ytpoopers_index.json');
    if (rp.ok) pData = await rp.json();

    const rsi = await fetch('db/search_index.json');
    if (rsi.ok) allSearchIndex = await rsi.json();
  } catch (e) { }

  initApp(vData, sData, pData);

  // Detect server mode for management features
  if (isHttp) {
    try {
      const r = await fetch('/api/ban', { method: 'POST', body: JSON.stringify({ videoIds: [] }) });
      if (r.ok || r.status === 400) {
        isServerMode = true;
        console.log("Server mode detected: Management features enabled.");
        const ma = document.getElementById('management-actions');
        if (ma) ma.style.display = 'flex';

        // Show import button and hide help
        const importBtn = document.getElementById('btn-import');
        const helpBtn = document.getElementById('btn-help');
        if (importBtn) importBtn.style.display = 'inline-block';
        if (helpBtn) helpBtn.style.display = 'none';

        // Show playback source toggle
        const ps = document.getElementById('playback-source-container');
        const psm = document.querySelector('.playback-source-container-modern');
        if (ps) ps.style.display = 'inline-block';
        if (psm) psm.style.display = 'inline-block';
        updatePlaybackToggleUI();
      }
    } catch (e) { }
  }
}

// Start app
(async () => {
  try {
    await initDB();
    console.log("Database initialized.");
  } catch (e) {
    console.error("Database initialization failed:", e);
  }
  await autoLoad();
})();


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

function initApp(vRaw, sRaw, pRaw) {
  resetFilters();
  syncSearchLayout();
  if (vRaw) {
    allVideos = Object.entries(vRaw).map(([id, v]) => {
      const sections = (v.sections && v.sections.length > 0) ? v.sections : ["Youtube"];
      return { id, ...v, sections };
    }).filter(v => v.sections.some(s => ALLOWED_SECTIONS.has(s)));
  }
  if (sRaw) {
    allSources = Object.entries(sRaw).map(([id, v]) => ({ id, ...v }));
    sourceChannels = new Set(allSources.map(v => v.channel_name).filter(Boolean));
  }
  if (pRaw) {
    allPoopers = pRaw;
    pooperMap = {};
    Object.values(pRaw).forEach(p => {
      if (p.channel_name) {
        pooperMap[p.channel_name] = p;
      }
    });
  }

  if (!vRaw && !sRaw) {
    if (!window.location.protocol.startsWith('http')) {
      document.getElementById('landing').style.display = 'flex';
      document.getElementById('app').style.display = 'none';
    }
    return;
  }

  document.getElementById('landing').style.display = 'none';
  document.getElementById('app').style.display = 'block';

  // Hide all loaders
  document.querySelectorAll('.page').forEach(el => el.classList.remove('is-loading'));
  document.querySelectorAll('.page-loader').forEach(el => el.style.display = 'none');

  // badges
  const totalVideos = allVideos.length;
  const channels = new Set(allVideos.map(v => v.channel_name).filter(Boolean));
  const sections = new Set(allVideos.flatMap(v => v.sections || []));

  const bV = document.getElementById('badge-videos');
  if (bV) bV.textContent = totalVideos;
  const bS = document.getElementById('badge-sources');
  if (bS) bS.textContent = allSources.length;
  const bC = document.getElementById('badge-channels');
  if (bC) bC.textContent = channels.size;

  const years = new Set(allVideos.map(v => v.publish_date ? v.publish_date.slice(0, 4) : null).filter(Boolean));
  const bY = document.getElementById('badge-years');
  if (bY) bY.textContent = years.size;

  buildFilterOptions();
  buildOverview();
  applyFilters();
  renderChannelGrid();
  renderYearGrid();
  buildFirstUploadCache();
  const yearSelector = document.getElementById('global-year-selector');
  if (yearSelector) {
    const yearsSet = new Set([...(allVideos || []), ...(allSources || [])].map(v => v.publish_date ? parseInt(v.publish_date.slice(0, 4)) : null).filter(Boolean));
    const minYear = Math.min(...Array.from(yearsSet)) || 2005;
    const currentYear = new Date().getFullYear();
    globalMaxYear = currentYear;

    let optionsHtml = '';
    for (let y = currentYear; y >= minYear; y--) {
      optionsHtml += `<option value="${y}">${y}</option>`;
    }
    yearSelector.innerHTML = optionsHtml;
    yearSelector.value = globalMaxYear;
  }
  if (appMode === 'videos') {
    renderHomePage();
  }

  // Restore theme and aspect ratio
  const lastMode = localStorage.getItem('lastThemeMode') || 'old';
  if (lastMode === 'modern' && document.body.classList.contains('theme-old')) {
    toggleThemeMode(); // This will also handle aspect ratio restoration
  } else {
    // Already in old mode, just restore its aspect ratio
    const ratio = localStorage.getItem('aspectRatioOld') || '4-3';
    setAspectRatio(ratio, false);
  }

  handleRouting();
}

// ─── ROUTING ──────────────────────────────────────────────────────────────
function getAppRoot() {
  return window.location.pathname.startsWith('/ytp-museum/') ? '/ytp-museum/' : '/';
}

function handleRouting() {
  const url = new URL(window.location);
  const root = getAppRoot();
  let path = url.pathname;
  if (path.startsWith(root)) {
    path = '/' + path.slice(root.length);
  }
  const params = url.searchParams;

  let page = params.get('page');
  let videoId = params.get('v');
  let user = params.get('user') || params.get('c') || params.get('channel');
  let query = params.get('q') || params.get('search_query');

  // Handle YouTube-style paths
  if (path.startsWith('/watch')) {
    videoId = videoId || params.get('v');
  } else if (path.startsWith('/user/') || path.startsWith('/c/') || path.startsWith('/channel/')) {
    user = decodeURIComponent(path.split('/')[2]);
  } else if (path.startsWith('/@')) {
    user = decodeURIComponent(path.slice(2));
  } else if (path === '/videos') {
    page = 'videos';
  } else if (path === '/sources') {
    page = 'sources';
  } else if (path === '/channels') {
    page = 'channels';
  } else if (path === '/overview') {
    page = 'overview';
  }

  if (videoId) {
    openVideo(videoId, false);
  } else if (user) {
    openProfile(user, false);
  } else if (page) {
    showPage(page, false);
  } else if (query) {
    showPage('videos', false);
    document.getElementById('search-input').value = query;
    applyFilters();
  } else {
    showPage('youtube', false);
  }
}

function updateURL(params, path = '/') {
  const root = getAppRoot();
  const appPath = path.startsWith('/') ? path.slice(1) : path;
  const finalPath = root + appPath;

  const newParams = new URLSearchParams();
  for (const [k, v] of Object.entries(params || {})) {
    if (v) newParams.set(k, v);
  }
  const newSearch = newParams.toString();
  const newUrl = finalPath + (newSearch ? '?' + newSearch : '');
  window.history.pushState({ ...params }, '', newUrl);
}

window.addEventListener('popstate', () => {
  handleRouting();
});

function togglePlaybackMode() {
  playbackMode = (playbackMode === 'youtube') ? 'mirror' : 'youtube';
  localStorage.setItem('ytp-playback-mode', playbackMode);
  updatePlaybackToggleUI();
  
  // If we are currently watching a video, reload the player
  const url = new URL(window.location);
  const vidId = url.searchParams.get('v');
  if (vidId && document.getElementById('page-video').classList.contains('active')) {
      openVideo(vidId, false);
  }
}

function updatePlaybackToggleUI() {
  const label = playbackMode === 'youtube' ? 'YouTube Mode' : 'Mirror Mode';
  const toggle = document.getElementById('playback-source-toggle');
  const toggleM = document.querySelector('.playback-source-toggle-modern');
  if (toggle) toggle.textContent = label;
  if (toggleM) toggleM.textContent = label;
}

function toggleSubscription(channelName) {
  if (!channelName) return;
  const index = subscriptions.indexOf(channelName);
  if (index > -1) {
    subscriptions.splice(index, 1);
  } else {
    subscriptions.push(channelName);
  }
  localStorage.setItem('ytp-subscriptions', JSON.stringify(subscriptions));
  updateSubscribeButtons(channelName);
}

function updateSubscribeButtons(channelName) {
  const isSubbed = subscriptions.includes(channelName);
  const label = isSubbed ? 'Subscribed' : 'Subscribe';
  document.querySelectorAll(`.btn-subscribe[data-channel="${escAttr(channelName)}"]`).forEach(btn => {
    btn.textContent = label;
    btn.classList.toggle('active', isSubbed);
  });
  // Also check video page button
  const vSubBtn = document.getElementById('btn-subscribe-video');
  if (vSubBtn && vSubBtn.dataset.channel === channelName) {
    vSubBtn.textContent = label;
    vSubBtn.classList.toggle('active', isSubbed);
  }
}

// ─── NAVIGATION ──────────────────────────────────────────────────────────
function showPage(name, pushToHistory = true) {
  if (pushToHistory) {
    let path = '/';
    if (name === 'videos') path = '/videos';
    else if (name === 'sources') path = '/sources';
    else if (name === 'channels') path = '/channels';
    else if (name === 'sections') path = '/sections';
    else if (name === 'overview') path = '/overview';
    else if (name === 'youtube') path = '/';
    updateURL(name === 'youtube' ? {} : { page: name }, path);
  }
  if (name !== 'video') {
    const player = document.getElementById('watch-player');
    if (player) player.innerHTML = '';
  }
  let targetPage = name;
  if (name === 'years') targetPage = 'overview';
  if (name === 'sources' || name === 'videos') {
    appMode = name;
    targetPage = 'videos';
    document.getElementById('page-videos').querySelector('h2').textContent = appMode === 'sources' ? 'Source Search' : 'Video Search';

    const tabV = document.getElementById('manager-tab-videos');
    const tabS = document.getElementById('manager-tab-sources');
    if (tabV) tabV.classList.toggle('active', name === 'videos');
    if (tabS) tabS.classList.toggle('active', name === 'sources');

    buildFilterOptions();
    applyFilters();
  }

  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));

  // Find the correct nav tab
  const tabs = document.querySelectorAll('.nav-tab');
  tabs.forEach(t => {
    const oc = t.getAttribute('onclick') || '';
    if (oc.includes(`'${name}'`)) t.classList.add('active');
    if (name === 'sources' && oc.includes("'videos'")) t.classList.add('active');
  });

  document.getElementById('page-' + targetPage).classList.add('active');

  // Close sidebar on navigation (mobile)
  document.body.classList.remove('sidebar-open');

  if (name === 'timeline' && typeof initTimeline === 'function') {
    initTimeline();
  }
  if (name === 'youtube') {
    renderHomePage();
  }
  if (name === 'subscriptions') {
    renderSubscriptionsPage();
  }
  if (name === 'saved') {
    renderSavedPage();
  }
}


function setAspectRatio(ratio, save = true) {
  document.body.classList.remove('aspect-ratio-4-3', 'aspect-ratio-16-9');
  document.body.classList.add('aspect-ratio-' + ratio);
  
  // Sync all selectors
  document.querySelectorAll('.aspect-ratio-selector').forEach(sel => {
    sel.value = ratio;
  });

  if (save) {
    const isOld = document.body.classList.contains('theme-old');
    localStorage.setItem(isOld ? 'aspectRatioOld' : 'aspectRatioModern', ratio);
    
    // Re-render the current view to apply structural layout changes
    handleRouting();
  }
}

// ─── THEME TOGGLES & SEARCH ────────────────────────────────────────────────
function toggleThemeMode() {
  const isOld = document.body.classList.toggle('theme-old');
  const btn = document.getElementById('toggle-modern-old');
  if (btn) btn.textContent = isOld ? 'Switch to Modern Mode' : 'Switch to Old Mode';

  localStorage.setItem('lastThemeMode', isOld ? 'old' : 'modern');

  // Restore aspect ratio for this mode
  const ratio = localStorage.getItem(isOld ? 'aspectRatioOld' : 'aspectRatioModern') || (isOld ? '4-3' : '16-9');
  setAspectRatio(ratio, false);

  syncSearchLayout();

  if (typeof updateVideoLayoutForTheme === 'function') updateVideoLayoutForTheme();
}

function syncSearchLayout() {
  const isOld = document.body.classList.contains('theme-old');
  const searchBar = document.getElementById('masthead-search');
  if (searchBar) {
    if (isOld) {
      const nav = document.getElementById('masthead-nav');
      if (nav) nav.appendChild(searchBar);
    } else {
      const navRight = document.getElementById('masthead-nav-right');
      if (navRight) navRight.appendChild(searchBar);
    }
  }
}

function toggleNightDay() {
  const isLight = document.body.classList.toggle('theme-light');
  document.body.classList.toggle('theme-dark', !isLight);
  const btn = document.getElementById('toggle-night-day');
  if (btn) btn.textContent = isLight ? 'Switch to Night Mode' : 'Switch to Day Mode';
}

let searchDebounceTimer;
let selectedSuggestionIndex = -1;

function onGlobalSearchInput() {
  const q = document.getElementById('global-search-input').value.trim();
  const suggestionsBox = document.getElementById('search-suggestions');

  if (!q) {
    suggestionsBox.style.display = 'none';
    return;
  }

  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(() => {
    const queryTokens = tokenize(q);
    if (queryTokens.length === 0) return;

    // Search titles and channel names for suggestions using the index if available
    const isUsingIndex = allSearchIndex.length > 0;
    const data = isUsingIndex ? allSearchIndex : getActiveVideos(false);

    // Get unique titles and channel names that match
    const titleMatches = [];
    const channelMatches = new Set();

    for (const item of data) {
      const title = isUsingIndex ? item[1] : item.title;
      const channel = isUsingIndex ? item[2] : item.channel_name;

      if (title && scoreField(title, queryTokens).score > 0) {
        titleMatches.push({ text: title, type: 'video' });
      }
      if (channel && scoreField(channel, queryTokens).score > 0) {
        channelMatches.add(channel);
      }
      // Stop scanning once we have enough for a good suggestion list
      if (titleMatches.length > 30 && channelMatches.size > 5) break; 
    }

    let results = [
      ...Array.from(channelMatches).map(c => ({ text: c, type: 'channel' })),
      ...titleMatches
    ];

    // Remove duplicates
    const seen = new Set();
    results = results.filter(r => {
      const k = r.text.toLowerCase() + r.type;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    // Sort: channels first, then by match score/length
    results.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'channel' ? -1 : 1;
      return a.text.length - b.text.length;
    });

    results = results.slice(0, 10);

    if (results.length > 0) {
      selectedSuggestionIndex = -1;
      suggestionsBox.innerHTML = results.map((r, i) => `
        <div class="suggestion-item" onclick="selectSuggestion('${escAttr(r.text)}')">
          <span class="suggestion-text">${escHtml(r.text)}</span>
          <span class="suggestion-type">${r.type}</span>
        </div>
      `).join('');
      suggestionsBox.style.display = 'block';
    } else {
      suggestionsBox.style.display = 'none';
    }
  }, 150);
}

function selectSuggestion(text) {
  const input = document.getElementById('global-search-input');
  input.value = text;
  document.getElementById('search-suggestions').style.display = 'none';
  performSearch(text);
}

document.getElementById('global-search-input').addEventListener('keydown', (e) => {
  const suggestionsBox = document.getElementById('search-suggestions');
  const items = suggestionsBox.querySelectorAll('.suggestion-item');

  if (suggestionsBox.style.display === 'block' && items.length > 0) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectedSuggestionIndex = (selectedSuggestionIndex + 1) % items.length;
      updateSuggestionSelection(items);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectedSuggestionIndex = (selectedSuggestionIndex - 1 + items.length) % items.length;
      updateSuggestionSelection(items);
    } else if (e.key === 'Escape') {
      suggestionsBox.style.display = 'none';
    } else if (e.key === 'Enter' && selectedSuggestionIndex >= 0) {
      e.preventDefault();
      items[selectedSuggestionIndex].click();
      return;
    }
  }

  if (e.key === 'Enter') {
    const q = e.target.value.trim();
    performSearch(q);
  }
});

function updateSuggestionSelection(items) {
  items.forEach((item, i) => {
    item.classList.toggle('selected', i === selectedSuggestionIndex);
  });
  if (selectedSuggestionIndex >= 0) {
    // Optionally update input as user arrows through, like Google
    // document.getElementById('global-search-input').value = items[selectedSuggestionIndex].querySelector('.suggestion-text').textContent;
  }
}

// Hide suggestions on outside click
document.addEventListener('click', (e) => {
  if (!e.target.closest('.search-form')) {
    const box = document.getElementById('search-suggestions');
    if (box) box.style.display = 'none';
  }
});

function getChannelAvatar(channelName) {
  const p = pooperMap[channelName];
  if (p && p.thumbnail) {
    return 'db/profile_thumbnails/' + p.thumbnail;
  }
  return 'https://upload.wikimedia.org/wikipedia/commons/8/89/Portrait_Placeholder.png';
}

// ─── WEIGHTED SEARCH ENGINE ──────────────────────────────────────────────
// BM25-inspired scoring with field-level weights. Order-independent: each
// query token is scored independently so "harry potter vera storia" matches
// "storia potter harry" equally well.

const SEARCH_FIELD_WEIGHTS = {
  title: 10,
  tags: 8,
  channel: 6,
  sections: 4,
  threadTitles: 3,
  description: 2,
  id: 1
};

/**
 * Tokenise a string: lowercase, split on whitespace / punctuation, deduplicate.
 */
function tokenize(str) {
  if (!str) return [];
  return str.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(/\s+/).filter(Boolean);
}

function levenshtein(a, b) {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const matrix = Array.from({ length: b.length + 1 }, (_, i) => [i]);
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) matrix[i][j] = matrix[i - 1][j - 1];
      else matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1);
    }
  }
  return matrix[b.length][a.length];
}

function fuzzyScore(s1, s2) {
  const maxLen = Math.max(s1.length, s2.length);
  if (maxLen === 0) return 1.0;
  const dist = levenshtein(s1, s2);
  // Allow 1 typo per 4 characters
  const threshold = Math.floor(maxLen / 4) + 1;
  if (dist > threshold) return 0;
  return (maxLen - dist) / maxLen;
}

/**
 * Score a single field for a set of query tokens.
 * Returns { score, matchedTokens } where matchedTokens is a Set of tokens found.
 *
 * Scoring per token:
 *   • Exact word match            → 1.0
 *   • Field string starts with token → 0.9
 *   • Substring / partial match   → 0.6
 *   • No match                    → 0
 *
 * Uses BM25-style saturation: tf / (tf + 1) so repeating a word has
 * diminishing returns.
 */
function scoreField(fieldValue, queryTokens, allowFuzzy = true) {
  if (!fieldValue) return { score: 0, matchedTokens: new Set() };
  const lower = fieldValue.toLowerCase();
  const fieldTokens = tokenize(fieldValue);
  const fieldTokenSet = new Set(fieldTokens);
  let totalScore = 0;
  const matchedTokens = new Set();

  for (const qt of queryTokens) {
    let bestTermScore = 0;
    // 1. Exact word match
    if (fieldTokenSet.has(qt)) {
      bestTermScore = 1.0;
    }
    // 2. Prefix of a word (e.g. "harr" matches "harry")
    else if (fieldTokens.some(ft => ft.startsWith(qt))) {
      bestTermScore = 0.9;
    }
    // 3. Substring anywhere
    else if (lower.includes(qt)) {
      bestTermScore = 0.6;
    }
    // 4. Fuzzy / typo match (only for tokens >= 3 chars)
    else if (allowFuzzy && qt.length >= 3) {
      let bestFuzzy = 0;
      for (const ft of fieldTokens) {
        if (Math.abs(ft.length - qt.length) > 2) continue;
        const s = fuzzyScore(ft, qt);
        if (s > bestFuzzy) bestFuzzy = s;
      }
      if (bestFuzzy > 0.75) {
        bestTermScore = bestFuzzy * 0.5; // Lower weight for fuzzy matches
      }
    }

    if (bestTermScore > 0) {
      matchedTokens.add(qt);
      let tf = 0;
      for (const ft of fieldTokens) {
        if (ft === qt || ft.startsWith(qt) || ft.includes(qt)) tf++;
      }
      totalScore += bestTermScore * ((tf * 2.2) / (tf + 1.2));
    }
  }
  return { score: totalScore, matchedTokens };
}

/**
 * Score a video against query tokens. Returns a numeric relevance score (0 = no match).
 */
function scoreVideo(video, queryTokens) {
  const fields = [
    { value: video.title, weight: SEARCH_FIELD_WEIGHTS.title },
    { value: (video.tags || []).join(' '), weight: SEARCH_FIELD_WEIGHTS.tags },
    { value: video.channel_name, weight: SEARCH_FIELD_WEIGHTS.channel },
    { value: (video.sections || []).join(' '), weight: SEARCH_FIELD_WEIGHTS.sections },
    { value: (video.thread_titles || []).join(' '), weight: SEARCH_FIELD_WEIGHTS.threadTitles },
    { value: video.description, weight: SEARCH_FIELD_WEIGHTS.description },
    { value: video.id, weight: SEARCH_FIELD_WEIGHTS.id }
  ];

  let totalScore = 0;
  const allMatched = new Set();

  for (const { value, weight } of fields) {
    const { score, matchedTokens } = scoreField(value, queryTokens);
    totalScore += score * weight;
    matchedTokens.forEach(t => allMatched.add(t));
  }

  if (totalScore === 0) return 0;

  // Proportion of query tokens matched across all fields
  const coverage = allMatched.size / queryTokens.length;

  // Strong bonus when ALL query tokens appear somewhere (order-independent)
  const allMatchBonus = coverage === 1.0 ? 2.0 : 0;

  // Mild popularity signal (log-scaled, capped)
  const popBoost = 1 + Math.min(Math.log10(Math.max(video.view_count || 1, 1)) / 10, 0.3);

  return (totalScore + allMatchBonus) * coverage * popBoost;
}

/**
 * Score a channel name against query tokens for the channel results section.
 */
function scoreChannel(channelName, queryTokens) {
  // Stricter matching for channels: fuzzy is okay but needs high coverage
  const { score, matchedTokens } = scoreField(channelName, queryTokens, true);
  if (score === 0) return 0;
  const coverage = matchedTokens.size / queryTokens.length;

  // Require at least 50% coverage for channel names to avoid random results
  if (coverage < 0.5 && queryTokens.length > 1) return 0;

  return score * coverage;
}

function performSearch(query) {
  if (!query) return;
  const suggestionsBox = document.getElementById('search-suggestions');
  if (suggestionsBox) suggestionsBox.style.display = 'none';

  // Only switch page if we aren't already on the search results page
  const searchPage = document.getElementById('page-search');
  if (searchPage && !searchPage.classList.contains('active')) {
    showPage('search');
  }

  document.getElementById('search-query-display').textContent = query;

  // Read advanced filters
  const fStatus = document.getElementById('search-filter-status')?.value || '';
  const fSection = document.getElementById('search-filter-section')?.value || '';
  const fYearMin = document.getElementById('search-filter-year-min')?.value || '';
  const fYearMax = document.getElementById('search-filter-year-max')?.value || '';
  const fLang = document.getElementById('search-filter-language')?.value || 'any';
  const fSort = document.getElementById('search-sort')?.value || 'relevance';

  const ytData = getActiveVideos(false);
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return;

  // ── Search Channels ──────────────────────────────────────────────────
  const allChannels = [...new Set(ytData.map(v => v.channel_name).filter(Boolean))];
  const scoredChannels = allChannels
    .map(c => ({ name: c, score: scoreChannel(c, queryTokens) }))
    .filter(c => c.score > 0.1) // Lower threshold to allow valid matches to show up
    .sort((a, b) => b.score - a.score);

  const channelsSection = document.getElementById('search-channels-section');
  const channelsContainer = document.getElementById('search-channels-results');
  if (scoredChannels.length === 0) {
    if (channelsSection) channelsSection.style.display = 'none';
  } else {
    if (channelsSection) channelsSection.style.display = 'block';
    channelsContainer.innerHTML = scoredChannels.map(({ name: c }) => renderChannelCard(c, 'search')).join('');
  }

  // ── Search Videos ────────────────────────────────────────────────────
  let scoredVideos = [];
  
  if (allSearchIndex.length > 0 && !fStatus && !fSection && fLang === 'any') {
    // Fast path: use minified search index if no complex filters are active
    scoredVideos = allSearchIndex
      .map(entry => {
        const v = {
            id: entry[0], title: entry[1], channel_name: entry[2], 
            publish_date: entry[3] ? entry[3] + '-01-01' : '',
            view_count: entry[4], duration: entry[5], description: entry[6],
            status: 'downloaded'
        };
        return { video: v, score: scoreVideo(v, queryTokens) };
      })
      .filter(r => r.score > 0);
  } else {
    // Fallback to full data search for complex filters
    scoredVideos = ytData
      .map(v => ({ video: v, score: scoreVideo(v, queryTokens) }))
      .filter(r => r.score > 0);

    // Apply filters
    scoredVideos = scoredVideos.filter(({ video: v }) => {
      if (fStatus && v.status !== fStatus) return false;
      if (fSection && !(v.sections || []).includes(fSection)) return false;

      const y = v.publish_date ? parseInt(v.publish_date.slice(0, 4)) : null;
      if (fYearMin && (!y || y < parseInt(fYearMin))) return false;
      if (fYearMax && (!y || y > parseInt(fYearMax))) return false;

      if (fLang !== 'any' && (v.language || '').toLowerCase() !== fLang) return false;
      return true;
    });
  }

  // Sort
  if (fSort === 'relevance') {
    scoredVideos.sort((a, b) => b.score - a.score);
  } else if (fSort === 'publish_date') {
    scoredVideos.sort((a, b) => (b.video.publish_date || '').localeCompare(a.video.publish_date || ''));
  } else if (fSort === 'view_count') {
    scoredVideos.sort((a, b) => (b.video.view_count || 0) - (a.video.view_count || 0));
  }

  filteredVideos = scoredVideos.map(r => r.video);
  currentPage = 1;
  renderSearchVideos(false);
  setupSearchScrollObserver();
}

let searchScrollObserver = null;
function setupSearchScrollObserver() {
  if (searchScrollObserver) searchScrollObserver.disconnect();
  const sentinel = document.getElementById('search-scroll-sentinel');
  if (!sentinel) return;

  searchScrollObserver = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting) {
      if (currentPage * PAGE_SIZE < filteredVideos.length) {
        currentPage++;
        renderSearchVideos(true);
      }
    }
  }, { rootMargin: '400px' });
  searchScrollObserver.observe(sentinel);
}

function renderSearchVideos(append = false) {
  const container = document.getElementById('search-videos-results');
  const total = filteredVideos.length;
  const countLabel = document.getElementById('search-count-label');
  if (countLabel) countLabel.textContent = `${total} videos found`;

  if (total === 0) {
    container.innerHTML = '<p class="empty" style="padding:10px;">No videos found matching your criteria.</p>';
    return;
  }

  const start = (currentPage - 1) * PAGE_SIZE;
  const slice = filteredVideos.slice(start, start + PAGE_SIZE);
  const html = slice.map(v => renderVideoItem(v, typeof searchViewMode !== 'undefined' ? searchViewMode : 'list')).join('');

  if (append) container.insertAdjacentHTML('beforeend', html);
  else container.innerHTML = html;

  // Ensure sentinel is at the bottom
  let sentinel = document.getElementById('search-scroll-sentinel');
  if (!sentinel) {
    sentinel = document.createElement('div');
    sentinel.id = 'search-scroll-sentinel';
    sentinel.style.height = '10px';
  }
  container.after(sentinel);
}

// ─── YOUTUBE LOGIC ───────────────────────────────────────────────────────
async function openVideo(vidId, pushToHistory = true) {
  if (pushToHistory) updateURL({ v: vidId }, '/watch');
  window.scrollTo(0, 0);
  showPage('video', false);
  if (typeof updateVideoLayoutForTheme === 'function') updateVideoLayoutForTheme();
  const ytData = [...allVideos, ...allSources];
  const v = ytData.find(x => x.id === vidId);
  if (!v) {
    document.getElementById('watch-title').textContent = "Video not found";
    return false;
  }

  // If detailed fields are missing, fetch the full JSON
  if (v.description === undefined) {
    document.getElementById('watch-title').textContent = "Loading...";
    document.getElementById('watch-description').textContent = "Fetching metadata...";
    try {
      // Try videos folder first
      let resp = await fetch(`db/videos/${vidId}.json`);
      if (!resp.ok) {
        // Try sources folder next
        resp = await fetch(`db/sources/${vidId}.json`);
      }

      if (resp.ok) {
        const fullData = await resp.json();
        Object.assign(v, fullData);
      } else {
        v.description = 'Metadata not found.';
      }
    } catch (e) {
      console.error("Error loading video details:", e);
      v.description = 'No metadata avaliable.';
    }
  }

  const title = v.title || v.id;
  const channel = v.channel_name || 'Unknown Channel';

  document.getElementById('watch-title').textContent = title;
  const avatar = getChannelAvatar(channel);
  const views = v.view_count != null ? fmtNum(v.view_count) : '0';
  const viewsEl = document.getElementById('watch-views-count');
  if (viewsEl) viewsEl.textContent = views;

  document.getElementById('watch-channel-info').innerHTML = `
    <img src="${avatar}" alt="Avatar" onclick="openProfile('${escAttr(channel)}')" style="cursor:pointer; border-radius:50%;" loading="lazy">
    <div style="flex:1">
      <div id="watch-channel" style="font-weight:bold; cursor:pointer; font-size:1.1rem" onclick="openProfile('${escAttr(channel)}')">${escHtml(channel)}</div>
      <div id="watch-date" style="font-size:0.85rem; color:var(--text-muted)">${fmtDate(v.publish_date)}</div>
    </div>
  `;

  // Setup Subscribe button for video page
  const vSubBtn = document.getElementById('btn-subscribe-video');
  if (vSubBtn) {
    vSubBtn.dataset.channel = channel;
    const isSubbed = subscriptions.includes(channel);
    vSubBtn.textContent = isSubbed ? 'Subscribed' : 'Subscribe';
    vSubBtn.classList.toggle('active', isSubbed);
    vSubBtn.onclick = () => toggleSubscription(channel);
  }

  let desc = v.description || 'No description available.';
  let tagsHtml = '';
  if (v.tags && v.tags.length > 0) {
    const filteredTags = v.tags.filter(t => t.length > 3);
    if (filteredTags.length > 0) {
      tagsHtml = '<div class="video-tags-list" style="margin-top: 15px; border-top: 1px solid var(--border); padding-top: 10px; display: flex; flex-wrap: wrap; gap: 6px;">' +
        filteredTags.map(t => `<a href="#" class="tag-pill" style="text-decoration:none; color:var(--accent); background:var(--surface2); padding:4px 10px; border-radius:15px; font-size:0.8rem;" onclick="performSearch('${escAttr(t)}'); return false;">#${escHtml(t)}</a>`).join('') +
        '</div>';
    }
  }
  document.getElementById('watch-description').innerHTML = linkify(escHtml(desc)) + tagsHtml;

  const playerContainer = document.getElementById('watch-player');
  const hasLocal = (v.status === 'downloaded' && v.local_file);
  const isYoutubeDead = (v.status === 'unavailable' || v.status === 'failed');

  function renderError() {
    playerContainer.innerHTML = `
      <div style="display:flex; align-items:center; justify-content:center; height:100%; background:#000; color:#fff; flex-direction:column; gap:10px; font-family:sans-serif; text-align:center; padding:20px;">
        <div style="font-size:3rem;">🚫</div>
        <div style="font-size:1.2rem; font-weight:bold;">Video Not Available</div>
        <div style="color:#aaa; font-size:0.9rem;">This video is no longer on YouTube and is missing from the local mirror.</div>
      </div>
    `;
  }

  function renderLocal(isFallback = false) {
    if (!hasLocal) {
        if (isFallback) return renderError();
        return renderYoutube(true);
    }
    const path = getLocalVideoPath(v);
    const basePath = path.replace(/\.(mp4|m4v)$/i, '');
    
    playerContainer.innerHTML = `<video id="video-player-element" controls autoplay style="width:100%; height:100%; background:#000;">
      <source src="${basePath}.mp4" type="video/mp4">
      <source src="${basePath}.m4v" type="video/x-m4v">
    </video>`;
    const vid = document.getElementById('video-player-element');
    vid.onerror = () => {
        console.warn("Local playback failed, trying YouTube...");
        renderYoutube(true);
    };
  }

  function renderYoutube(isFallback = false) {
    if (isYoutubeDead) {
        if (isFallback) return renderError();
        return renderLocal(true);
    }
    playerContainer.innerHTML = `<iframe width="100%" height="100%" src="https://www.youtube.com/embed/${v.id}?autoplay=1" frameborder="0" allow="autoplay; encrypted-media" allowfullscreen></iframe>`;
  }

  if (playbackMode === 'mirror') {
    renderLocal();
  } else {
    renderYoutube();
  }

  const moreContainer = document.getElementById('more-from-channel');
  if (moreContainer) {
    const currentYear = new Date().getFullYear();
    const moreVids = ytData.filter(x => {
      if (x.channel_name !== v.channel_name || x.id === v.id) return false;
      if (!x.publish_date) return globalMaxYear === currentYear;
      return parseInt(x.publish_date.slice(0, 4)) <= globalMaxYear;
    }).slice(0, 10);
    moreContainer.innerHTML = moreVids.map(x => renderVideoItem(x, 'list')).join('');
  }
  updateSaveButton(vidId);
  loadVideoResponses(v);
  loadRelatedVideos(v);
  loadComments(vidId);
  return false;
}

function loadVideoResponses(video) {
  const container = document.getElementById('video-responses');
  const section = document.getElementById('video-responses-section');
  if (!container || !section) return;

  const desc = video.description || '';
  // Match 11-char YouTube IDs from various link formats
  const ids = [...new Set([...desc.matchAll(/(?:v=|vi\/|shorts\/|be\/|embed\/|watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/g)].map(m => m[1]))];

  // Filter out the current video ID itself if it's linked
  const filteredIds = ids.filter(id => id !== video.id);

  if (filteredIds.length === 0) {
    section.style.display = 'none';
    return;
  }

  const ytData = [...allVideos, ...allSources];
  const matched = filteredIds.map(id => ytData.find(v => v.id === id)).filter(Boolean);

  if (matched.length === 0) {
    section.style.display = 'none';
    return;
  }

  section.style.display = 'block';
  document.getElementById('responses-count-title').textContent = `Video Responses (${matched.length})`;

  // Render responses in a grid-like layout
  container.innerHTML = `<div class="video-grid" style="grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 15px; margin-top: 10px;">
    ${matched.map(v => renderVideoItem(v, 'grid')).join('')}
  </div>`;
}

function loadRelatedVideos(video) {
  const container = document.getElementById('related-videos');
  if (!container) return;

  const ytData = [...allVideos, ...allSources];
  const videoTags = new Set(video.tags || []);
  const videoSections = new Set(video.sections || []);

  // Score based on shared sections and tags
  const scored = ytData
    .filter(v => v.id !== video.id && v.channel_name !== video.channel_name)
    .map(v => {
      let score = 0;
      if (v.sections) {
        v.sections.forEach(s => {
          if (videoSections.has(s)) score += 5;
        });
      }
      if (v.tags) {
        v.tags.forEach(t => {
          if (videoTags.has(t)) score += 2;
        });
      }
      return { video: v, score };
    })
    .filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  if (scored.length === 0) {
    document.getElementById('related-videos-box').style.display = 'none';
    return;
  }

  document.getElementById('related-videos-box').style.display = 'block';
  container.innerHTML = scored.map(r => renderVideoItem(r.video, 'list')).join('');
}

async function loadComments(vidId) {
  const container = document.getElementById('watch-comments');
  const title = document.getElementById('comments-count-title');
  if (!container) return;
  container.innerHTML = '<p class="empty" style="padding:10px;">Loading comments...</p>';

  try {
    const r = await fetch(`db/comments/${vidId}.json`);
    if (!r.ok) throw new Error("Not found");
    const comments = await r.json();
    if (!comments || comments.length === 0) {
      container.innerHTML = '<p class="empty" style="padding:10px;">No comments available.</p>';
      title.textContent = "Comments";
      return;
    }

    title.textContent = `${fmtNum(comments.length)} Comments`;
    renderCommentTree(comments);
  } catch (e) {
    container.innerHTML = '<p class="empty" style="padding:10px;">No comments available for this video.</p>';
    title.textContent = "Comments";
  }
}

function renderCommentTree(allComments) {
  const container = document.getElementById('watch-comments');

  // Build a map of replies
  const repliesMap = {};
  const rootComments = [];

  allComments.forEach(c => {
    if (c.parent === 'root' || !allComments.some(x => x.id === c.parent)) {
      rootComments.push(c);
    } else {
      if (!repliesMap[c.parent]) repliesMap[c.parent] = [];
      repliesMap[c.parent].push(c);
    }
  });

  // Sort root comments by pinned first, then by timestamp (newest first)
  rootComments.sort((a, b) => {
    if (a.is_pinned && !b.is_pinned) return -1;
    if (!a.is_pinned && b.is_pinned) return 1;
    return (b.timestamp || 0) - (a.timestamp || 0);
  });

  container.innerHTML = rootComments.map(c => renderCommentItem(c, repliesMap)).join('');
}

function renderCommentItem(c, repliesMap) {
  const replies = repliesMap[c.id] || [];
  const pinnedHtml = c.is_pinned ? `<div class="comment-pinned">📌 Pinned by ${escHtml(c.author_is_uploader ? 'uploader' : 'someone')}</div>` : '';
  const authorIcon = c.author_thumbnail || 'https://upload.wikimedia.org/wikipedia/commons/8/89/Portrait_Placeholder.png';
  const timeText = c._time_text || timeAgo(c.timestamp);

  return `
    <div class="comment-item">
      <img src="${authorIcon}" class="comment-avatar" alt="" loading="lazy">
      <div class="comment-content">
        ${pinnedHtml}
        <div>
          <a href="${c.author_url || '#'}" target="_blank" class="comment-author">${escHtml(c.author)}</a>
          <span class="comment-time">${escHtml(timeText)}</span>
        </div>
        <div class="comment-text">${linkify(escHtml(c.text))}</div>
        <div class="comment-actions">
          <div class="comment-likes">👍 ${fmtNum(c.like_count || 0)}</div>
        </div>
        ${replies.length > 0 ? `
          <div class="comment-replies">
            ${replies.map(r => renderCommentItem(r, repliesMap)).join('')}
          </div>
        ` : ''}
      </div>
    </div>
  `;
}

function fallbackToYoutube(vidId) {
  const playerContainer = document.getElementById('watch-player');
  if (playerContainer) {
    playerContainer.innerHTML = `<iframe width="100%" height="390" src="https://www.youtube-nocookie.com/embed/${vidId}?autoplay=1" allow="autoplay; encrypted-media" allowfullscreen style="border:none;"></iframe>`;
  }
}

function openProfile(user, pushToHistory = true) {
  if (pushToHistory) updateURL({ user: user }, '/@' + encodeURIComponent(user));
  showPage('profile', false);
  const ytData = [...allVideos, ...allSources];
  const avatar = getChannelAvatar(user);
  const userVideos = ytData.filter(v => v.channel_name === user);
  // Apply global year limit
  userVideos = userVideos.filter(v => {
    if (!v.publish_date) return true;
    return parseInt(v.publish_date.slice(0, 4)) <= globalMaxYear;
  });
  const sorted = [...userVideos].sort((a, b) => {
    return (b.publish_date || '').localeCompare(a.publish_date || '');
  });

  document.getElementById('profile-header').innerHTML = `
    <div style="display:flex; align-items:center; gap:24px;">
      <img src="${avatar}" style="width:100px; height:100px; border-radius:50%; border:4px solid var(--border); object-fit:cover;" loading="lazy">
      <div style="flex:1">
        <div style="display:flex; align-items:center; gap:15px;">
          <h2 id="profile-title" style="margin:0; font-size:2rem;">${escHtml(user)}</h2>
          <button class="btn-subscribe btn-thread" data-channel="${escAttr(user)}" onclick="toggleSubscription('${escAttr(user)}')" style="padding:6px 15px; font-weight:bold;">
            ${subscriptions.includes(user) ? 'Subscribed' : 'Subscribe'}
          </button>
        </div>
        <div id="profile-stats" style="margin-top:8px; color:var(--text-muted); line-height:1.4;">
          <strong>${userVideos.length}</strong> videos • 
          <strong>${fmtNum(userVideos.reduce((sum, v) => sum + (v.view_count || 0), 0))}</strong> total views<br>
          Joined: ${sorted.length > 0 && sorted[sorted.length - 1].publish_date ? fmtDate(sorted[sorted.length - 1].publish_date) : 'Unknown'}
        </div>
      </div>
    </div>
  `;

  const featContainer = document.getElementById('profile-featured');
  const gridContainer = document.getElementById('profile-videos');

  if (sorted.length > 0) {
    const feat = sorted[0];
    featContainer.innerHTML = `
      <h3 style="margin-top:0;">${escHtml(feat.title || feat.id)}</h3>
      <iframe width="100%" height="295" src="https://www.youtube-nocookie.com/embed/${feat.id}" allow="autoplay; encrypted-media" allowfullscreen style="border:none;"></iframe>
      <p style="margin-top:10px;">${escHtml(feat.description ? feat.description.slice(0, 200) + '...' : '')}</p>
    `;

    const others = sorted.slice(1, 13);
    gridContainer.innerHTML = others.map(v => renderVideoItem(v, 'grid')).join('');
  } else {
    featContainer.innerHTML = '';
    gridContainer.innerHTML = '';
  }
  return false;
}

function updateVideoLayoutForTheme() {
  const isOld = document.body.classList.contains('theme-old');
  const mainCol = document.querySelector('#page-video .col-right');
  const sideCol = document.querySelector('#page-video .col-left');

  const title = document.getElementById('watch-title');
  const video = document.getElementById('watch-video-container');
  const stats = document.querySelector('.watch-stats');
  const channel = document.getElementById('watch-channel-info');
  const desc = document.getElementById('watch-description');
  const actions = document.getElementById('watch-actions');
  const date = document.getElementById('watch-date');

  if (!mainCol || !sideCol || !title || !video || !channel || !desc) return;

  let channelRow = document.getElementById('modern-channel-row');

  if (isOld) {
    // Restore Old Mode
    mainCol.insertBefore(title, video);
    sideCol.insertBefore(stats, sideCol.firstChild);

    // Put date back into channel info if it was moved
    const channelTextWrap = channel.querySelector('div');
    if (date && channelTextWrap) {
      channelTextWrap.appendChild(date);
      date.style.display = 'block';
      date.style.marginLeft = '0';
    }

    sideCol.insertBefore(channel, stats.nextSibling);
    sideCol.insertBefore(desc, channel.nextSibling);
    sideCol.insertBefore(actions, desc.nextSibling);
    if (channelRow) channelRow.style.display = 'none';
  } else {
    // Modern Mode
    mainCol.insertBefore(video, mainCol.firstChild);
    mainCol.insertBefore(title, video.nextSibling);

    if (!channelRow) {
      channelRow = document.createElement('div');
      channelRow.id = 'modern-channel-row';
      channelRow.className = 'modern-channel-row';
      mainCol.insertBefore(channelRow, title.nextSibling);
    }
    channelRow.style.display = 'flex';
    channelRow.appendChild(channel);
    channelRow.appendChild(actions);

    mainCol.insertBefore(desc, channelRow.nextSibling);
    desc.insertBefore(stats, desc.firstChild);

    // Move date next to views in description box
    if (date) {
      stats.appendChild(date);
      date.style.display = 'inline-block';
      date.style.marginLeft = '8px';
    }
  }
}

function renderHomePage() {
  renderedHomeVideoIds.clear();
  const ytData = getActiveVideos(true);
  const featuredContainer = document.getElementById('featured-videos');
  const popularContainer = document.getElementById('popular-videos');
  const modernContainer = document.getElementById('modern-videos-grid');
  if (!featuredContainer || !popularContainer) return;

  const validVideos = ytData.filter(v => v.status === 'downloaded' || v.status === 'available');
  if (validVideos.length === 0) return;

  // Randomize featured videos
  const shuffledFeatured = shuffleArray(validVideos);
  const featuredVideos = shuffledFeatured.slice(0, 8);
  featuredVideos.forEach(v => renderedHomeVideoIds.add(v.id));

  // Popular videos (by views)
  const sortedByViews = [...validVideos].sort((a, b) => (b.view_count || 0) - (a.view_count || 0));
  const popularVideos = sortedByViews.filter(v => !renderedHomeVideoIds.has(v.id)).slice(0, 12);
  popularVideos.forEach(v => renderedHomeVideoIds.add(v.id));

  featuredContainer.innerHTML = featuredVideos.map(v => renderVideoItem(v, 'list')).join('');
  popularContainer.innerHTML = popularVideos.map(v => renderVideoItem(v, 'grid')).join('');

  if (modernContainer) {
    renderModernGrid();
  }
}

function setModernHomeTab(tab, btn) {
  currentModernTab = tab;
  const chips = document.getElementById('home-chips');
  if (chips) {
    chips.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    if (btn) btn.classList.add('active');
  }
  renderModernGrid();
}

function renderModernGrid() {
  const modernContainer = document.getElementById('modern-videos-grid');
  if (!modernContainer) return;

  const ytData = getActiveVideos(true);
  const validVideos = ytData.filter(v => v.status === 'downloaded' || v.status === 'available');
  if (validVideos.length === 0) return;

  let videos;
  if (currentModernTab === 'featured') {
    videos = shuffleArray(validVideos).slice(0, 24);
  } else if (currentModernTab === 'subscriptions') {
    videos = shuffleArray(validVideos.filter(v => subscriptions.includes(v.channel_name))).slice(0, 24);
  } else if (currentModernTab === 'views') {
    videos = [...validVideos].sort((a, b) => (b.view_count || 0) - (a.view_count || 0)).slice(0, 24);
  } else if (currentModernTab === 'discussed') {
    videos = [...validVideos].sort((a, b) => (b.comment_count || b.view_count || 0) - (a.comment_count || a.view_count || 0)).slice(0, 24);
  } else if (currentModernTab === 'favorited') {
    videos = [...validVideos].sort((a, b) => (b.like_count || 0) - (a.like_count || 0)).slice(0, 24);
  }

  modernContainer.innerHTML = videos.map(v => renderModernHomeCard(v)).join('');
}

function setFeaturedTab(tab) {
  // Update active tab UI
  document.querySelectorAll('.yt-tab').forEach(t => t.classList.remove('active'));
  const clickedTab = document.querySelector(`.yt-tab[onclick*="${tab}"]`);
  if (clickedTab) clickedTab.classList.add('active');

  const ytData = getActiveVideos(true);
  const validVideos = ytData.filter(v => v.status === 'downloaded' || v.status === 'available');
  const featuredContainer = document.getElementById('featured-videos');
  if (!featuredContainer || validVideos.length === 0) return;

  let videos;
  if (tab === 'featured') {
    videos = shuffleArray(validVideos).slice(0, 8);
  } else if (tab === 'views') {
    videos = [...validVideos].sort((a, b) => (b.view_count || 0) - (a.view_count || 0)).slice(0, 8);
  } else if (tab === 'discussed') {
    // Use comment count if available, else fall back to views
    videos = [...validVideos].sort((a, b) => (b.comment_count || b.view_count || 0) - (a.comment_count || a.view_count || 0)).slice(0, 8);
  } else if (tab === 'favorited') {
    videos = [...validVideos].sort((a, b) => (b.like_count || 0) - (a.like_count || 0)).slice(0, 8);
  } else if (tab === 'downloaded') {
    videos = shuffleArray(validVideos.filter(v => v.status === 'downloaded')).slice(0, 12);
  }

  featuredContainer.innerHTML = videos.map(v => renderVideoItem(v, 'list')).join('');
}

function loadMoreHomeVideos() {
  const featuredContainer = document.getElementById('featured-videos');
  const popularContainer = document.getElementById('popular-videos');
  const modernContainer = document.getElementById('modern-videos-grid');
  if (!featuredContainer || !modernContainer) return;

  const validVideos = getActiveVideos(true).filter(v => v.status === 'downloaded' || v.status === 'available');
  const available = validVideos.filter(v => !renderedHomeVideoIds.has(v.id));
  if (available.length === 0) return;

  const shuffled = shuffleArray(available);
  const newVideos = shuffled.slice(0, 12); // load 12 at a time

  newVideos.forEach(v => renderedHomeVideoIds.add(v.id));

  // Append 4 to featured list, 8 to popular grid (old mode)
  const featNew = newVideos.slice(0, 4);
  const popNew = newVideos.slice(4, 12);

  if (featNew.length > 0) featuredContainer.insertAdjacentHTML('beforeend', featNew.map(v => renderVideoItem(v, 'list')).join(''));
  if (popNew.length > 0) popularContainer.insertAdjacentHTML('beforeend', popNew.map(v => renderVideoItem(v, 'grid')).join(''));

  // Append to modern grid
  if (newVideos.length > 0) modernContainer.insertAdjacentHTML('beforeend', newVideos.map(v => renderModernHomeCard(v)).join(''));
}

window.addEventListener('scroll', () => {
  const pageYoutube = document.getElementById('page-youtube');
  if (pageYoutube && pageYoutube.classList.contains('active')) {
    if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight - 500) {
      if (!isFetchingMoreHome) {
        isFetchingMoreHome = true;
        loadMoreHomeVideos();
        setTimeout(() => { isFetchingMoreHome = false; }, 300);
      }
    }
  }
});

function renderModernHomeCard(v) {
  const fallbackTitle = (v.thread_titles && v.thread_titles[0]) ? v.thread_titles[0] : null;
  const titleText = v.title || fallbackTitle || v.id;
  const dateText = v.publish_date ? fmtDate(v.publish_date) : 'Unknown Date';
  const viewsText = v.view_count != null ? fmtNum(v.view_count) + ' views' : '';
  const chText = v.channel_name || '-';
  const thumbUrl = `https://i.ytimg.com/vi/${v.id}/mqdefault.jpg`;
  const channelAvatar = getChannelAvatar(chText);

  return `
    <div class="modern-home-card" onclick="openVideo('${v.id}')">
      <div class="yt-facade">
        <img src="${thumbUrl}" alt="Thumbnail" loading="lazy">
        <div class="play-btn"></div>
      </div>
      <div class="modern-home-info">
        <img class="channel-avatar" src="${channelAvatar}" alt="Avatar" loading="lazy" onclick="event.stopPropagation(); openProfile('${escAttr(chText)}')">
        <div class="modern-home-text">
          <h3 class="modern-home-title" title="${escAttr(titleText)}">${escHtml(titleText)}</h3>
          <a href="#" class="modern-home-ch" onclick="event.stopPropagation(); openProfile('${escAttr(chText)}')">${escHtml(chText)}</a>
          <div class="modern-home-meta">
            ${viewsText ? `<span>${viewsText}</span><span class="dot-sep">•</span>` : ''}
            <span>${dateText}</span>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderStars(viewCount) {
  // Rough rating estimate from view count for visual authenticity
  const raw = Math.min(5, Math.max(1, Math.round((Math.log10(Math.max(viewCount || 1, 1)) / 8) * 5)));
  return Array.from({ length: 5 }, (_, i) =>
    `<span style="color:${i < raw ? '#f90' : '#ccc'}; font-size:13px;">★</span>`
  ).join('');
}

// ─── IMPORT LOGIC ──────────────────────────────────────────────────────────
let currentImportMode = 'mass';

function openImportModal() {
  const modal = document.getElementById('import-modal');
  if (modal) {
    modal.style.display = 'flex';
    toggleImportMode('mass'); // Reset to mass by default
    
    // Populate uploader datalist
    const uploaderDl = document.getElementById('uploader-channel-datalist');
    const mainDl = document.getElementById('channel-datalist');
    if (uploaderDl && mainDl) {
      uploaderDl.innerHTML = mainDl.innerHTML;
    }
  }
}

function closeImportModal() {
  const modal = document.getElementById('import-modal');
  if (modal) modal.style.display = 'none';
  
  // Reset progress
  document.getElementById('upload-progress-container').style.display = 'none';
  document.getElementById('upload-progress-bar').style.width = '0%';
  document.getElementById('btn-import-submit').disabled = false;
}

function toggleImportMode(mode) {
  currentImportMode = mode;
  const formMass = document.getElementById('form-import-mass');
  const formSingle = document.getElementById('form-import-single');
  const tabMass = document.getElementById('tab-import-mass');
  const tabSingle = document.getElementById('tab-import-single');
  const submitBtn = document.getElementById('btn-import-submit');

  if (mode === 'mass') {
    formMass.style.display = 'block';
    formSingle.style.display = 'none';
    tabMass.classList.add('active');
    tabMass.style.color = 'var(--text)';
    tabSingle.classList.remove('active');
    tabSingle.style.color = 'var(--text-muted)';
    submitBtn.innerText = 'Import';
  } else {
    formMass.style.display = 'none';
    formSingle.style.display = 'block';
    tabMass.classList.remove('active');
    tabMass.style.color = 'var(--text-muted)';
    tabSingle.classList.add('active');
    tabSingle.style.color = 'var(--text)';
    submitBtn.innerText = 'Upload & Import';
  }
}

async function submitImport() {
  if (currentImportMode === 'mass') {
    await submitMassImport();
  } else {
    await submitSingleUpload();
  }
}

async function submitMassImport() {
  const urlsText = document.getElementById('import-urls').value;
  const target = document.getElementById('import-target').value;

  if (!urlsText.trim()) {
    alert("Please enter at least one URL.");
    return;
  }

  // Split by newline, comma, or space
  const urls = urlsText.split(/[\n,\s]+/).filter(u => u.trim());

  try {
    const r = await fetch('/api/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls, target })
    });
    const result = await r.json();

    if (result.success) {
      alert(`Successfully added ${result.results.added.length} videos. ${result.results.skipped.length} were skipped (invalid or duplicates).`);
      closeImportModal();
      location.reload();
    } else {
      alert("Error: " + result.error);
    }
  } catch (e) {
    alert("Failed to connect to server.");
  }
}

async function submitSingleUpload() {
  const fileInput = document.getElementById('upload-file');
  const title = document.getElementById('upload-title').value.trim();
  const channel = document.getElementById('upload-channel').value.trim() || 'Unknown';
  const type = document.getElementById('upload-type').value;
  const id = document.getElementById('upload-id').value.trim();
  const channelUrl = document.getElementById('upload-channel-url').value.trim();
  const date = document.getElementById('upload-date').value;
  const lang = document.getElementById('upload-lang').value;
  const tags = document.getElementById('upload-tags').value.split(',').map(s => s.trim()).filter(Boolean);

  if (!fileInput.files.length) {
    alert("Please select a video file.");
    return;
  }
  if (!title) {
    alert("Please enter a title.");
    return;
  }
  if (!type) {
    alert("Please select a video type (YTP or Other).");
    return;
  }

  const file = fileInput.files[0];
  const submitBtn = document.getElementById('btn-import-submit');
  const progressContainer = document.getElementById('upload-progress-container');
  const progressBar = document.getElementById('upload-progress-bar');
  const progressText = document.getElementById('upload-progress-text');

  submitBtn.disabled = true;
  progressContainer.style.display = 'flex';

  // Use XMLHttpRequest for progress tracking
  const xhr = new XMLHttpRequest();
  xhr.open('POST', '/api/upload');

  // Set metadata in headers (encoded to handle special characters)
  xhr.setRequestHeader('X-Video-Title', encodeURIComponent(title));
  xhr.setRequestHeader('X-Video-Channel-Name', encodeURIComponent(channel));
  xhr.setRequestHeader('X-Video-Channel-URL', encodeURIComponent(channelUrl));
  xhr.setRequestHeader('X-Video-Type', type);
  xhr.setRequestHeader('X-Video-ID', encodeURIComponent(id));
  xhr.setRequestHeader('X-Video-Date', date);
  xhr.setRequestHeader('X-Video-Lang', lang);
  xhr.setRequestHeader('X-Video-Tags', encodeURIComponent(JSON.stringify(tags)));
  xhr.setRequestHeader('X-File-Name', encodeURIComponent(file.name));

  xhr.upload.onprogress = (e) => {
    if (e.lengthComputable) {
      const pct = Math.round((e.loaded / e.total) * 100);
      progressBar.style.width = pct + '%';
      progressText.innerText = pct + '%';
    }
  };

  xhr.onload = () => {
    submitBtn.disabled = false;
    let result;
    try {
      result = JSON.parse(xhr.responseText);
    } catch (e) {
      result = { success: false, error: "Invalid server response" };
    }

    if (xhr.status === 200 && result.success) {
      alert("Video uploaded and indexed successfully!");
      closeImportModal();
      location.reload();
    } else {
      alert("Upload failed: " + (result.error || "Unknown error"));
    }
  };

  xhr.onerror = () => {
    submitBtn.disabled = false;
    alert("Connection error during upload.");
  };

  xhr.send(file);
}

function renderVideoItem(v, mode = 'list') {
  const title = v.title || v.id;
  const channel = v.channel_name || 'Unknown';
  const views = v.view_count != null ? fmtNum(v.view_count) + ' views' : '';
  const desc = v.description ? v.description.slice(0, 110) + (v.description.length > 110 ? '...' : '') : '';
  const thumbUrl = `https://i.ytimg.com/vi/${v.id}/mqdefault.jpg`;
  const dur = v.duration || '';

  const isFirst = window.channelFirstUploadIds && window.channelFirstUploadIds.has(v.id);
  const starBadge = isFirst ? `<span class="tl-star" title="First upload by ${escAttr(channel)}">★</span> ` : '';
  const avatar = getChannelAvatar(channel);

  const is169 = document.body.classList.contains('aspect-ratio-16-9');

  if (mode === 'grid') {
    // If 16:9 selected, use modern card regardless of theme
    if (is169) {
      return renderModernHomeCard(v);
    }

    // Classic Grid Layout (for 4:3)
    return `
    <div class="video-item grid">
      <a href="#" onclick="event.preventDefault(); event.stopPropagation(); openVideo('${v.id}')" class="video-thumb">
        <img src="${thumbUrl}" alt="" loading="lazy">
        ${dur ? `<span class="video-time">${escHtml(dur)}</span>` : ''}
      </a>
      <div class="video-info">
        <a href="watch?v=${v.id}" onclick="event.preventDefault(); event.stopPropagation(); openVideo('${v.id}')" class="video-title" title="${escAttr(title)}">${starBadge}${escHtml(title)}</a>
        <div class="video-meta" style="display:flex; align-items:center; gap:6px;">
          <img src="${avatar}" style="width:20px; height:20px; border-radius:50%; object-fit:cover;" loading="lazy">
          <div style="flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
            <a href="#" onclick="return openProfile('${escAttr(channel)}')">${escHtml(channel)}</a>
            ${views ? `<br><span>${views}</span>` : ''}
          </div>
        </div>
      </div>
    </div>`;
  }

  if (mode === 'list') {
    // If 16:9 selected, use modern list style regardless of theme
    if (is169) {
      return `
        <div class="video-item modern-list" onclick="openVideo('${v.id}')">
          <div class="modern-list-thumb">
            <img src="${thumbUrl}" alt="" loading="lazy">
            ${dur ? `<span class="video-time">${escHtml(dur)}</span>` : ''}
          </div>
          <div class="modern-list-info">
            <h3 class="modern-list-title">${starBadge}${escHtml(title)}</h3>
            <div class="modern-list-meta">
              ${views ? `<span>${views}</span>` : ''}
              <span class="dot-sep">•</span>
              <span>${fmtDate(v.publish_date)}</span>
            </div>
            <div class="modern-list-channel" onclick="event.stopPropagation(); openProfile('${escAttr(channel)}')">
              <img src="${avatar}" alt="" loading="lazy">
              <span>${escHtml(channel)}</span>
            </div>
            <div class="modern-list-desc">${escHtml(desc)}</div>
          </div>
        </div>`;
    }

    // Classic List Layout (for 4:3)
    return `
    <div class="video-item list" onclick="openVideo('${v.id}')" style="cursor:pointer;">
      <div class="yt-list-thumb">
        <a href="#" onclick="event.preventDefault(); event.stopPropagation(); openVideo('${v.id}')">
          <img src="${thumbUrl}" alt="" loading="lazy">
          ${dur ? `<span class="video-time">${escHtml(dur)}</span>` : ''}
        </a>
      </div>
      <div class="yt-list-info">
        <a href="watch?v=${v.id}" onclick="event.preventDefault(); event.stopPropagation(); openVideo('${v.id}')" class="yt-list-title">${starBadge}${escHtml(title)}</a>
        ${desc ? `<div class="yt-list-desc">${escHtml(desc)}</div>` : ''}
        <div class="yt-list-meta">
          <span class="yt-stars">${renderStars(v.view_count)}</span>
          ${views ? `<span class="yt-views">${views}</span>` : ''}
          <div style="display:flex; align-items:center; gap:6px;">
            <img src="${avatar}" style="width:20px; height:20px; border-radius:50%; object-fit:cover;" loading="lazy">
            <a href="#" class="yt-channel" onclick="event.stopPropagation();return openProfile('${escAttr(channel)}')">${escHtml(channel)}</a>
          </div>
        </div>
      </div>
    </div>`;
  }
}

// ─── FILTER OPTIONS ───────────────────────────────────────────────────────
// ─── FILTER OPTIONS ───────────────────────────────────────────────────────
function buildFilterOptions() {
  const sectionSel = document.getElementById('filter-section');
  const sectionSelSearch = document.getElementById('search-filter-section');
  const channelDatalist = document.getElementById('channel-datalist');
  const yearMinSel = document.getElementById('filter-year-min');
  const yearMaxSel = document.getElementById('filter-year-max');
  const yearMinSelSearch = document.getElementById('search-filter-year-min');
  const yearMaxSelSearch = document.getElementById('search-filter-year-max');

  const currentData = appMode === 'sources' ? allSources : allVideos;

  // 1. Build Sections
  const sections = [...new Set(
    currentData.flatMap(v => v.sections || [])
      .map(s => s === 'Scraped Channel' ? 'Youtube' : s)
  )]
    .filter(s => s !== 'Risorse' || appMode === 'sources')
    .sort();

  const secHtml = '<option value="">All Sections</option>' + sections.map(s => `<option value="${s}">${s}</option>`).join('');
  if (sectionSel) sectionSel.innerHTML = secHtml;
  if (sectionSelSearch) sectionSelSearch.innerHTML = secHtml;

  // 2. Build Channels
  const channels = [...new Set(currentData.map(v => v.channel_name).filter(Boolean))].sort();
  if (channelDatalist) {
    channelDatalist.innerHTML = channels.map(c => `<option value="${c}">`).join('');
  }

  // 3. Build Years
  const years = [...new Set(currentData.map(v => v.publish_date ? v.publish_date.slice(0, 4) : null).filter(Boolean))].sort();

  const minYearHtml = '<option value="">Min</option>' + years.map(y => `<option value="${y}">${y}</option>`).join('');
  const maxYearHtml = '<option value="">Max</option>' + years.map(y => `<option value="${y}">${y}</option>`).join('');

  if (yearMinSel) yearMinSel.innerHTML = minYearHtml;
  if (yearMaxSel) yearMaxSel.innerHTML = maxYearHtml;
  if (yearMinSelSearch) yearMinSelSearch.innerHTML = minYearHtml;
  if (yearMaxSelSearch) yearMaxSelSearch.innerHTML = maxYearHtml;
}
// ─── FILTERS + TABLE ──────────────────────────────────────────────────────
let sortField = 'publish_date';
let sortDir = 1;
let scrollObserver = null;
let viewMode = 'table';
let searchViewMode = 'list';

function setViewMode(mode) {
  viewMode = mode;
  document.getElementById('btn-view-table').classList.toggle('active', mode === 'table');
  document.getElementById('btn-view-grid').classList.toggle('active', mode === 'grid');
  document.getElementById('video-table-wrap').style.display = mode === 'table' ? 'block' : 'none';
  document.getElementById('video-grid').style.display = mode === 'grid' ? 'grid' : 'none';
  renderTable(false);
}

function setSearchViewMode(mode) {
  searchViewMode = mode;
  const btnList = document.getElementById('btn-search-view-list');
  const btnGrid = document.getElementById('btn-search-view-grid');
  const btnListOld = document.getElementById('btn-search-view-list-old');
  const btnGridOld = document.getElementById('btn-search-view-grid-old');

  if (btnList) btnList.classList.toggle('active', mode === 'list');
  if (btnGrid) btnGrid.classList.toggle('active', mode === 'grid');
  if (btnListOld) btnListOld.classList.toggle('active', mode === 'list');
  if (btnGridOld) btnGridOld.classList.toggle('active', mode === 'grid');

  const q = document.getElementById('global-search-input').value.trim();
  if (q) performSearch(q);
}

function loadFacade(id) {
  const el = document.getElementById('facade-' + id);
  if (!el) return;

  const currentData = appMode === 'sources' ? allSources : allVideos;
  const v = currentData.find(x => x.id === id);

  if (v && v.status === 'downloaded' && v.local_file) {
    const src = getLocalVideoPath(v);
    el.innerHTML = `<video controls autoplay style="width:100%; height:100%; object-fit:contain; background:#000;">
      <source src="${src}" type="video/mp4">
      Your browser does not support the video tag.
    </video>`;
  } else {
    el.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${id}?autoplay=1" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
  }
}

function applyFilters() {
  const q = document.getElementById('search-input').value.trim();
  const status = document.getElementById('filter-status').value;
  const section = document.getElementById('filter-section').value;
  const channel = document.getElementById('filter-channel').value;
  const viewsMin = parseInt(document.getElementById('filter-views-min').value) || 0;
  const likesMin = parseInt(document.getElementById('filter-likes-min').value) || 0;
  const yearMin = document.getElementById('filter-year-min').value;
  const yearMax = document.getElementById('filter-year-max').value;
  const langSelect = document.getElementById('filter-language');
  const selectedLangs = Array.from(langSelect.selectedOptions).map(opt => opt.value.toLowerCase());
  const currentData = appMode === 'sources' ? allSources : allVideos;

  const queryTokens = q ? tokenize(q) : [];
  const hasQuery = queryTokens.length > 0;
  // Apply global year limit
  const validData = currentData.filter(v => {
    if (!v.publish_date) return true;
    return parseInt(v.publish_date.slice(0, 4)) <= globalMaxYear;
  });
  // Score all videos if there's a query, then apply hard filters
  let scored = currentData.map(v => ({
    video: v,
    score: hasQuery ? scoreVideo(v, queryTokens) : 1
  }));

  // Filter out non-matching search results
  if (hasQuery) {
    scored = scored.filter(r => r.score > 0);
  }

  // Apply hard filters
  scored = scored.filter(({ video: v }) => {
    if (status && v.status !== status) return false;
    if (section && !(v.sections || []).includes(section)) return false;
    if (channel && (!v.channel_name || v.channel_name.toLowerCase() !== channel.toLowerCase())) return false;
    if (viewsMin && (v.view_count || 0) < viewsMin) return false;
    if (likesMin && (v.like_count || 0) < likesMin) return false;

    const y = v.publish_date ? parseInt(v.publish_date.slice(0, 4)) : null;
    if (yearMin && (!y || y < parseInt(yearMin))) return false;
    if (yearMax && (!y || y > parseInt(yearMax))) return false;

    if (selectedLangs.length > 0 && !selectedLangs.includes("Any".toLocaleLowerCase())) {
      const vidLang = (v.language || "").toLowerCase();
      if (!selectedLangs.includes(vidLang)) return false;
    }
    return true;
  });

  // Sort by relevance when searching, otherwise by the chosen column
  if (hasQuery) {
    scored.sort((a, b) => b.score - a.score);
  } else {
    scored.sort((a, b) => {
      let av = a.video[sortField] || '';
      let bv = b.video[sortField] || '';
      if (typeof av === 'string') av = av.toLowerCase();
      if (typeof bv === 'string') bv = bv.toLowerCase();
      if (av > bv) return sortDir;
      if (av < bv) return -sortDir;
      return 0;
    });
  }

  filteredVideos = scored.map(r => r.video);

  currentPage = 1;
  renderTable(false);
  setupScrollObserver();
}

function sortTable(field) {
  if (sortField === field) sortDir *= -1;
  else { sortField = field; sortDir = 1; }

  // Update header UI
  document.querySelectorAll('#video-table th').forEach(th => {
    th.classList.remove('sorted');
    const arrow = th.querySelector('.sort-arrow');
    if (arrow) arrow.textContent = '↕';
  });
  const th = document.querySelector(`#video-table th[data-field="${field}"]`);
  if (th) {
    th.classList.add('sorted');
    const arrow = th.querySelector('.sort-arrow');
    if (arrow) arrow.textContent = sortDir === 1 ? '↓' : '↑';
  }

  filteredVideos.sort((a, b) => {
    let av = a[sortField] || '';
    let bv = b[sortField] || '';
    if (typeof av === 'string') av = av.toLowerCase();
    if (typeof bv === 'string') bv = bv.toLowerCase();
    if (av > bv) return sortDir;
    if (av < bv) return -sortDir;
    return 0;
  });

  currentPage = 1;
  renderTable(false);
}

function setupScrollObserver() {
  if (scrollObserver) scrollObserver.disconnect();
  const sentinel = document.getElementById('scroll-sentinel');
  if (!sentinel) return;

  scrollObserver = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting) {
      if (currentPage * PAGE_SIZE < filteredVideos.length) {
        currentPage++;
        renderTable(true);
      }
    }
  }, { rootMargin: '200px' });

  scrollObserver.observe(sentinel);
}

function renderTable(append = false) {
  const tbody = document.getElementById('video-tbody');
  const grid = document.getElementById('video-grid');
  const total = filteredVideos.length;
  document.getElementById('videos-count-label').textContent = `${total} ${appMode === 'sources' ? 'sources' : 'videos'}`;

  const start = (currentPage - 1) * PAGE_SIZE;
  const slice = filteredVideos.slice(start, start + PAGE_SIZE);

  if (viewMode === 'table') {
    const html = slice.map(v => {
      const statusClass = 'status-' + (v.status || 'unavailable');

      const ytpifHtml = (v.source_pages || [])
        .filter(sp => !sp.includes('channel_scrape'))
        .map((sp, i) => {
          const path = 'https://raw.githubusercontent.com/nocoldiz/ytpbackup/main/site_mirror/' + sp.replace(/\\/g, '/');
          const label = (v.thread_titles || [])[i] || sp;
          return `<a class="btn-play" href="${path}" onclick="event.stopPropagation(); downloadFile('${path}', '${escAttr(label)}.html'); return false;" title="Download Forum Source: ${escHtml(label)}" style="background:var(--accent2); margin-left: 4px; font-size: 10px; padding: 2px 5px;">YTPIF</a>`;
        }).join('');

      // Determine the title to display, falling back to the first thread title if v.title is missing
      const fallbackTitle = (v.thread_titles && v.thread_titles[0]) ? v.thread_titles[0] : null;
      const titleContent = v.title
        ? `<a href="watch?v=${v.id}" onclick="event.preventDefault(); openVideo('${v.id}')">${escHtml(v.title)}</a>`
        : (fallbackTitle ? `<a href="watch?v=${v.id}" onclick="event.preventDefault(); openVideo('${v.id}')"><em>${escHtml(fallbackTitle)}</em></a>` : `<span class="vid-id">${v.id}</span>`);

      const playAction = (v.status === 'downloaded' && v.local_file)
        ? `<a class="btn-play" href="${getLocalVideoPath(v)}" target="_blank" title="Play local file">▶</a>`
        : '';

      const checkbox = isServerMode
        ? `<td onclick="event.stopPropagation();"><input type="checkbox" class="manage-check" data-id="${v.id}" onchange="updateManagementVisibility()"></td>`
        : '';

      return `<tr>
          ${checkbox}
          <td class="title-cell" data-label="Title">
            ${titleContent}
            <div class="vid-id">${v.id}</div>
          </td>
          <td data-label="Channel">
            ${v.channel_name ? `
              <div style="display:flex; align-items:center; gap:8px;">
                <img src="${getChannelAvatar(v.channel_name)}" style="width:24px; height:24px; border-radius:50%; object-fit:cover;">
                <a href="${v.channel_url || '#'}" target="_blank" onclick="event.stopPropagation();" style="color:var(--text-muted);text-decoration:none">${escHtml(v.channel_name)}</a>
              </div>
            ` : '-'}
          </td>
          <td data-label="Date">${fmtDate(v.publish_date)}</td>
          <td data-label="Status" title="${v.status || '-'}">${getStatusEmoji(v.status)}</td>
          <td data-label="Lang" title="${v.language || '-'}">${getLanguageFlag(v.language)}</td>
          <td class="num" data-label="Views">${fmtNum(v.view_count)}</td>
          <td class="num" data-label="Likes">${fmtNum(v.like_count)}</td>
          <td data-label="Actions" onclick="event.stopPropagation();">${playAction} <a class="btn-yt" href="${v.url || `https://www.youtube.com/watch?v=${v.id}`}" target="_blank" rel="noopener noreferrer">YT</a>${ytpifHtml}</td>
        </tr>`;
    }).join('') || (append ? '' : `<tr><td colspan="8" class="empty">No videos match your filters</td></tr>`);

    if (append) {
      tbody.insertAdjacentHTML('beforeend', html);
    } else {
      tbody.innerHTML = html;
    }
  } else {
    const html = slice.map(v => {
      const statusClass = 'status-' + (v.status || 'unavailable');
      const fallbackTitle = (v.thread_titles && v.thread_titles[0]) ? v.thread_titles[0] : null;
      const titleText = v.title || fallbackTitle || v.id;
      const dateText = v.publish_date ? fmtDate(v.publish_date) : 'Unknown Date';
      const viewsText = v.view_count != null ? fmtNum(v.view_count) + ' views' : '';
      const chText = v.channel_name || '-';

      const thumbUrl = `https://i.ytimg.com/vi/${v.id}/mqdefault.jpg`;
      const facadeHtml = v.status === 'available' || v.status === 'pending' || v.status === 'downloaded'
        ? `<div class="yt-facade" id="facade-${v.id}" onclick="loadFacade('${v.id}')">
             <img src="${thumbUrl}" alt="Thumbnail" loading="lazy">
             <div class="play-btn"></div>
           </div>`
        : `<div class="yt-facade" style="background:#2a3048; display:flex; align-items:center; justify-content:center; color:var(--text-muted); cursor:default;">
             <span style="opacity:0.5">Thumbnail Unavailable</span>
           </div>`;

      const checkbox = isServerMode
        ? `<div class="vid-card-check" onclick="event.stopPropagation();"><input type="checkbox" class="manage-check" data-id="${v.id}" onchange="updateManagementVisibility()"></div>`
        : '';

      return `<div class="vid-card">
        ${checkbox}
        ${facadeHtml}
        <div class="vid-card-info">
          <a href="watch?v=${v.id}" onclick="event.preventDefault(); openVideo('${v.id}')" class="vid-card-title" title="${escAttr(titleText)}">${escHtml(titleText)}</a>
          <a href="${v.channel_url || '#'}" target="_blank" class="vid-card-ch">${escHtml(chText)}</a>
          <div class="vid-card-meta">
            ${viewsText ? `<span>${viewsText}</span>` : ''}
            <span>${dateText}</span>
          </div>
          <div class="vid-status-row" title="${v.status || '-'}">
            ${getStatusEmoji(v.status)} ${getLanguageFlag(v.language)}
          </div>
        </div>
      </div>`;
    }).join('') || (append ? '' : `<div class="empty" style="grid-column:1/-1">No videos match your filters</div>`);

    if (append) grid.insertAdjacentHTML('beforeend', html);
    else grid.innerHTML = html;
  }

  renderPagination(total);

  // Show/hide management column header
  const thManage = document.getElementById('th-manage');
  if (thManage) thManage.style.display = isServerMode && viewMode === 'table' ? 'table-cell' : 'none';

  updateManagementVisibility();
}

function renderPagination(total) {
  const el = document.getElementById('pagination');
  if (total === 0) { el.innerHTML = ''; return; }
  const showing = Math.min(currentPage * PAGE_SIZE, total);
  el.innerHTML = `<span class="page-info">Showing ${showing} of ${total} results (Page ${currentPage})</span>`;
}

// ─── CHANNELS ─────────────────────────────────────────────────────────────
function buildChannelData() {
  const map = {};
  allVideos.forEach(v => {
    if (v.publish_date && parseInt(v.publish_date.slice(0, 4)) > globalMaxYear) return; // Ignore future videos
    const ch = v.channel_name;
    if (!ch) return;
    if (!map[ch]) map[ch] = { name: ch, url: v.channel_url, videos: [], totalViews: 0, totalLikes: 0, firstYear: null };
    map[ch].videos.push(v);
    map[ch].totalViews += v.view_count || 0;
    map[ch].totalLikes += v.like_count || 0;
    const y = v.publish_date ? parseInt(v.publish_date.slice(0, 4)) : null;
    if (y) {
      if (!map[ch].firstYear || y < map[ch].firstYear) map[ch].firstYear = y;
    }
  });
  return Object.values(map).sort((a, b) => b.videos.length - a.videos.length);
}

function renderChannelGrid() {
  const q = (document.getElementById('channel-search').value || '').toLowerCase();
  const minYear = parseInt(document.getElementById('channel-year-min').value) || null;
  const maxYear = parseInt(document.getElementById('channel-year-max').value) || null;

  const channels = buildChannelData().filter(c => {
    if (q && !c.name.toLowerCase().includes(q)) return false;
    if (minYear && (!c.firstYear || c.firstYear < minYear)) return false;
    if (maxYear && (!c.firstYear || c.firstYear > maxYear)) return false;
    return true;
  });
  document.getElementById('channels-count-label').textContent = `${channels.length} channels`;
  document.getElementById('channel-grid').innerHTML = channels.map(c => renderChannelCard(c)).join('') || `<div class="empty">No channels found</div>`;
}

function selectChannel(name) {
  selectedChannel = selectedChannel === name ? null : name;
  renderChannelGrid();
  const panel = document.getElementById('channel-detail-panel');
  if (!selectedChannel) { panel.style.display = 'none'; return; }

  // Scroll to top of page
  window.scrollTo({ top: 0, behavior: 'smooth' });

  const channels = buildChannelData();
  const ch = channels.find(c => c.name === name);
  if (!ch) return;

  // Videos by year
  const byYear = {};
  ch.videos.forEach(v => {
    const y = v.publish_date ? v.publish_date.slice(0, 4) : 'Unknown';
    byYear[y] = (byYear[y] || 0) + 1;
  });
  const years = Object.keys(byYear).sort();

  const statusCount = {};
  ch.videos.forEach(v => { statusCount[v.status || 'unknown'] = (statusCount[v.status || 'unknown'] || 0) + 1; });

  // Sort videos by date (oldest first)
  const sortedVideos = [...ch.videos].sort((a, b) => {
    const da = a.publish_date || '';
    const db = b.publish_date || '';
    return da.localeCompare(db);
  });

  // Build video list HTML
  const videoListHtml = sortedVideos.map(v => {
    const statusClass = 'status-' + (v.status || 'unavailable');
    const playAction = (v.status === 'downloaded' && v.local_file)
      ? `<a class="btn-play" href="${getLocalVideoPath(v)}" target="_blank" title="Play local file">▶</a>`
      : '';

    return `<tr>
      <td class="title-cell"><a href="watch?v=${v.id}" onclick="event.preventDefault(); openVideo('${v.id}')" style="color:var(--text);text-decoration:none">${escHtml(v.title || v.id)}</a></td>
      <td>${fmtDate(v.publish_date)}</td>
      <td title="${v.status || '-'}">${getStatusEmoji(v.status)}</td>
      <td class="num">${fmtNum(v.view_count)}</td>
      <td class="num">${fmtNum(v.like_count)}</td>
      <td>${playAction} <a class="btn-yt" href="${v.url || `https://www.youtube.com/watch?v=${v.id}`}" target="_blank" rel="noopener noreferrer">YT</a></td>
    </tr>`;
  }).join('');

  panel.style.display = 'block';
  panel.innerHTML = `<div class="channel-detail">
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px">
      <h3>${escHtml(ch.name)}</h3>
      <button class="close-btn" onclick="selectedChannel=null;document.getElementById('channel-detail-panel').style.display='none';renderChannelGrid()">✕ Close</button>
    </div>
    <div class="ch-url">${ch.url ? `<a href="${ch.url}" target="_blank">${escHtml(ch.url)}</a>` : 'No URL'}</div>
    <div class="ch-detail-grid">
      <div class="chart-card">
        <h3>Videos by Year</h3>
        <canvas id="ch-year-chart" style="max-height:220px"></canvas>
      </div>
      <div class="chart-card">
        <h3>Status Breakdown</h3>
        <canvas id="ch-status-chart" style="max-height:220px"></canvas>
      </div>
    </div>
    <div style="margin-top:20px">
      <h3 style="font-size:.9rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:12px">All Videos (${ch.videos.length})</h3>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Title</th>
              <th>Date</th>
              <th>Status</th>
              <th>Views</th>
              <th>Likes</th>
              <th></th>
            </tr>
          </thead>
          <tbody>${videoListHtml}</tbody>
        </table>
      </div>
    </div>
  </div>`;

  setTimeout(() => {
    destroyChart('ch-year'); destroyChart('ch-status');
    charts['ch-year'] = new Chart(document.getElementById('ch-year-chart'), {
      type: 'bar',
      data: { labels: years, datasets: [{ label: 'Videos', data: years.map(y => byYear[y]), backgroundColor: PALETTE[0] + 'cc', borderRadius: 6 }] },
      options: chartOpts('Videos per year')
    });
    charts['ch-status'] = new Chart(document.getElementById('ch-status-chart'), {
      type: 'doughnut',
      data: { labels: Object.keys(statusCount), datasets: [{ data: Object.values(statusCount), backgroundColor: [STATUS_COLORS.available, STATUS_COLORS.unavailable, STATUS_COLORS.pending, '#888'] }] },
      options: { ...pieOpts(), plugins: { ...pieOpts().plugins, title: { display: false } } }
    });
  }, 50);
}

// SECTIONS LOGIC REMOVED

// ─── YEARS ────────────────────────────────────────────────────────────────
let selectedYear = null;

function buildYearData() {
  const map = {};
  allVideos.forEach(v => {
    const y = v.publish_date ? v.publish_date.slice(0, 4) : null;
    if (!y) return;
    if (!map[y]) map[y] = { year: y, videos: [], totalViews: 0, totalLikes: 0 };
    map[y].videos.push(v);
    map[y].totalViews += v.view_count || 0;
    map[y].totalLikes += v.like_count || 0;
  });
  return Object.values(map).sort((a, b) => a.year.localeCompare(b.year));
}

function renderYearGrid() {
  const years = buildYearData();
  document.getElementById('years-count-label').textContent = `${years.length} years`;
  const maxCount = Math.max(...years.map(y => y.videos.length));
  document.getElementById('year-grid').innerHTML = years.map(y => `
    <div class="year-card box${selectedYear === y.year ? ' selected' : ''}" onclick="selectYear('${y.year}')">
      <div class="box-header" style="text-align:center; padding: 4px;">${y.year}</div>
      <div class="box-content" style="text-align:center; padding: 10px;">
        <div class="y-count">${y.videos.length} video${y.videos.length !== 1 ? 's' : ''}</div>
        <div class="y-bar" style="width:${Math.round(y.videos.length / maxCount * 100)}%"></div>
      </div>
    </div>`).join('') || `<div class="empty">No dated videos</div>`;
}

function selectYear(year) {
  selectedYear = selectedYear === year ? null : year;
  renderYearGrid();
  const panel = document.getElementById('year-detail-panel');
  if (!selectedYear) { panel.style.display = 'none'; return; }

  const allYears = buildYearData();
  const yd = allYears.find(y => y.year === year);
  if (!yd) return;

  // Most prolific creator
  const crCounts = {};
  yd.videos.forEach(v => { if (v.channel_name) crCounts[v.channel_name] = (crCounts[v.channel_name] || 0) + 1; });
  const topCreators = Object.entries(crCounts).sort((a, b) => b[1] - a[1]);
  const topCreator = topCreators[0];

  // Tag frequency
  const TAG_BLOCKLIST = new Set(["poop", "youtube", "ytp", "ita", "merda", "youtube merda", "ytp ita", "ytpmv", "youtube merda"]);
  const tagCounts = {};
  yd.videos.forEach(v => (v.tags || []).forEach(t => {
    const tl = t.toLowerCase();
    if (!TAG_BLOCKLIST.has(tl)) tagCounts[tl] = (tagCounts[tl] || 0) + 1;
  }));
  const topTags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 60);

  // Status counts
  const statusCount = {};
  yd.videos.forEach(v => { const s = v.status || 'unknown'; statusCount[s] = (statusCount[s] || 0) + 1; });

  // Monthly breakdown
  const byMonth = Array(12).fill(0);
  yd.videos.forEach(v => {
    if (v.publish_date && v.publish_date.length >= 7) {
      const m = parseInt(v.publish_date.slice(5, 7), 10);
      if (m >= 1 && m <= 12) byMonth[m - 1]++;
    }
  });
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // Top videos by views & likes (full sorted lists stored for expand)
  const allByViews = [...yd.videos].filter(v => v.view_count).sort((a, b) => b.view_count - a.view_count);
  const allByLikes = [...yd.videos].filter(v => v.like_count).sort((a, b) => b.like_count - a.like_count);
  window._yrViews = allByViews;
  window._yrLikes = allByLikes;
  const topByViews = allByViews.slice(0, 5);
  const topByLikes = allByLikes.slice(0, 5);

  // Unique channels
  const uniqCh = new Set(yd.videos.map(v => v.channel_name).filter(Boolean)).size;

  panel.style.display = 'block';
  panel.innerHTML = `
  <div class="year-detail">
    <div class="year-detail-header">
      <h2>${year}</h2>
      <div class="year-kpis">
        <div class="year-kpi"><span class="kv">${yd.videos.length}</span><span class="kl">Videos</span></div>
        <div class="year-kpi"><span class="kv">${fmtBig(yd.totalViews)}</span><span class="kl">Total Views</span></div>
        <div class="year-kpi"><span class="kv">${fmtBig(yd.totalLikes)}</span><span class="kl">Total Likes</span></div>
        <div class="year-kpi"><span class="kv">${uniqCh}</span><span class="kl">Channels</span></div>
        ${topCreator ? `<div class="year-kpi"><span class="kv" style="font-size:1rem">${escHtml(topCreator[0])}</span><span class="kl">Top Creator (${topCreator[1]} videos)</span></div>` : ''}
      </div>
      <button class="close-btn" onclick="selectedYear=null;document.getElementById('year-detail-panel').style.display='none';renderYearGrid()">✕ Close</button>
    </div>

    <div class="year-charts-grid">
      <div class="chart-card box">
        <div class="box-header">Videos per Month</div>
        <div class="box-content"><canvas id="yr-month-chart" style="max-height:200px"></canvas></div>
      </div>
      <div class="chart-card box">
        <div class="box-header">Status Breakdown</div>
        <div class="box-content"><canvas id="yr-status-chart" style="max-height:200px"></canvas></div>
      </div>
      <div class="chart-card box">
        <div class="box-header">Top Creators</div>
        <div class="box-content"><canvas id="yr-creators-chart" style="max-height:200px"></canvas></div>
      </div>
    </div>

    ${topTags.length ? `
    <div class="chart-card" style="margin-bottom:18px">
      <h3>Tag Cloud <span style="font-size:.75rem;color:var(--text-muted);text-transform:none;letter-spacing:0">(${topTags.length} unique tags)</span></h3>
      <div class="tag-cloud-wrap" id="yr-tag-cloud"></div>
    </div>` : ''}

    <div class="charts-row cols2" style="margin-bottom:0">
      ${allByViews.length ? `
      <div class="chart-card box top-videos-year">
        <div class="box-header">Top by Views <span style="font-size:.75rem;color:var(--text-muted);text-transform:none;letter-spacing:0">(${allByViews.length} total)</span></div>
        <div class="box-content">
          <div class="table-wrap"><table>
            <thead><tr><th>#</th><th>Title</th><th>Views</th></tr></thead>
            <tbody id="yr-views-tbody">${yrTableRows(topByViews, 'view_count')}</tbody>
          </table></div>
          ${allByViews.length > 5 ? `<div style="text-align:center;margin-top:10px"><button class="src-expand-btn" id="yr-views-btn" onclick="expandYearTable('views')">Show all ${allByViews.length} ▼</button></div>` : ''}
        </div>
      </div>` : ''}
      ${allByLikes.length ? `
      <div class="chart-card box top-videos-year">
        <div class="box-header">Top by Likes <span style="font-size:.75rem;color:var(--text-muted);text-transform:none;letter-spacing:0">(${allByLikes.length} total)</span></div>
        <div class="box-content">
          <div class="table-wrap"><table>
            <thead><tr><th>#</th><th>Title</th><th>Likes</th></tr></thead>
            <tbody id="yr-likes-tbody">${yrTableRows(topByLikes, 'like_count')}</tbody>
          </table></div>
          ${allByLikes.length > 5 ? `<div style="text-align:center;margin-top:10px"><button class="src-expand-btn" id="yr-likes-btn" onclick="expandYearTable('likes')">Show all ${allByLikes.length} ▼</button></div>` : ''}
        </div>
      </div>` : ''}
    </div>
  </div>`;

  setTimeout(() => {
    destroyChart('yr-month'); destroyChart('yr-status'); destroyChart('yr-creators');

    charts['yr-month'] = new Chart(document.getElementById('yr-month-chart'), {
      type: 'bar',
      data: { labels: MONTHS, datasets: [{ label: 'Videos', data: byMonth, backgroundColor: PALETTE[2] + 'cc', borderRadius: 5 }] },
      options: chartOpts('')
    });

    charts['yr-status'] = new Chart(document.getElementById('yr-status-chart'), {
      type: 'doughnut',
      data: {
        labels: Object.keys(statusCount),
        datasets: [{ data: Object.values(statusCount), backgroundColor: Object.keys(statusCount).map(s => STATUS_COLORS[s] || '#888'), borderWidth: 0 }]
      },
      options: pieOpts()
    });

    const topCrSlice = topCreators.slice(0, 10);
    charts['yr-creators'] = new Chart(document.getElementById('yr-creators-chart'), {
      type: 'bar',
      data: { labels: topCrSlice.map(c => c[0]), datasets: [{ label: 'Videos', data: topCrSlice.map(c => c[1]), backgroundColor: PALETTE[0] + 'cc', borderRadius: 4 }] },
      options: {
        ...chartOpts(''), indexAxis: 'y', plugins: { legend: { display: false } },
        scales: { x: gridScales().x, y: { ...gridScales().y, ticks: { color: '#8892b0', font: { size: 9 } } } }
      }
    });

    // Tag cloud
    const cloudEl = document.getElementById('yr-tag-cloud');
    if (cloudEl && topTags.length) {
      const maxF = topTags[0][1];
      const minF = topTags[topTags.length - 1][1];
      const TAG_COLORS = ['#6c63ff', '#ff6584', '#43e97b', '#f7971e', '#38f9d7', '#fa709a', '#fee140', '#30cfd0'];
      cloudEl.innerHTML = topTags.map(([tag, freq], i) => {
        const norm = minF === maxF ? 1 : (freq - minF) / (maxF - minF);
        const size = 0.72 + norm * 1.4;
        const opacity = 0.45 + norm * 0.55;
        const color = TAG_COLORS[i % TAG_COLORS.length];
        return `<span class="cloud-tag" style="font-size:${size.toFixed(2)}rem;color:${color};opacity:${opacity.toFixed(2)};background:${color}18" title="${freq} use${freq !== 1 ? 's' : ''}">${escHtml(tag)}</span>`;
      }).join('');
    }
  }, 50);
}


function yrTableRows(videos, field) {
  return videos.map((v, i) => `<tr>
    <td style="color:var(--text-muted)">${i + 1}</td>
    <td><a href="watch?v=${v.id}" onclick="event.preventDefault(); openVideo('${v.id}')" style="color:var(--text);text-decoration:none">${escHtml((v.title || v.id).slice(0, 40))}${(v.title || v.id).length > 40 ? '…' : ''}</a></td>
    <td class="num">${fmtNum(v[field])}</td>
  </tr>`).join('');
}

function expandYearTable(type) {
  const isViews = type === 'views';
  const tbody = document.getElementById(isViews ? 'yr-views-tbody' : 'yr-likes-tbody');
  const btn = document.getElementById(isViews ? 'yr-views-btn' : 'yr-likes-btn');
  const all = isViews ? window._yrViews : window._yrLikes;
  const field = isViews ? 'view_count' : 'like_count';
  const isExpanded = btn.dataset.expanded === '1';
  if (isExpanded) {
    tbody.innerHTML = yrTableRows(all.slice(0, 5), field);
    btn.textContent = `Show all ${all.length} ▼`;
    btn.dataset.expanded = '0';
  } else {
    tbody.innerHTML = yrTableRows(all, field);
    btn.textContent = `Show less ▲`;
    btn.dataset.expanded = '1';
  }
}

// ─── OVERVIEW CHARTS ──────────────────────────────────────────────────────
const PALETTE = ['#6c63ff', '#ff6584', '#43e97b', '#f7971e', '#38f9d7', '#fa709a', '#fee140', '#30cfd0', '#a18fff', '#ffecd2'];
const STATUS_COLORS = { available: '#43e97b', unavailable: '#ff6584', pending: '#f7971e', unknown: '#888' };

function buildOverview() {
  // Stat cards
  const total = allVideos.length;
  const withTitle = allVideos.filter(v => v.title).length;
  const withViews = allVideos.filter(v => v.view_count != null);
  const totalViews = withViews.reduce((s, v) => s + v.view_count, 0);
  const totalLikes = allVideos.reduce((s, v) => s + (v.like_count || 0), 0);
  const channels = new Set(allVideos.map(v => v.channel_name).filter(Boolean));
  const sections = new Set(allVideos.flatMap(v => v.sections || []));
  const available = allVideos.filter(v => v.status === 'available').length;

  document.getElementById('overview-stats').innerHTML = [
    { label: 'Total Videos', value: fmtNum(total), sub: `${withTitle} with metadata` },
    { label: 'Unique Channels', value: fmtNum(channels.size), sub: `across ${sections.size} sections` },
    { label: 'Total Views', value: fmtBig(totalViews), sub: `${withViews.length} videos with data` },
    { label: 'Total Likes', value: fmtBig(totalLikes), sub: '' },
    { label: 'Available', value: fmtNum(available), sub: `${Math.round(available / total * 100)}% of archive` },
    { label: 'Avg Views', value: withViews.length ? fmtBig(Math.round(totalViews / withViews.length)) : '-', sub: 'per video (w/ data)' },
  ].map(c => `<div class="stat-card"><div class="label">${c.label}</div><div class="value">${c.value}</div><div class="sub">${c.sub}</div></div>`).join('');

  // Videos by year
  const byYear = {};
  allVideos.forEach(v => {
    if (v.publish_date) { const y = v.publish_date.slice(0, 4); byYear[y] = (byYear[y] || 0) + 1; }
  });
  const years = Object.keys(byYear).sort();
  makeChart('chart-year', 'bar', years, [{
    label: 'Videos', data: years.map(y => byYear[y]),
    backgroundColor: years.map((_, i) => PALETTE[i % PALETTE.length] + 'bb'),
    borderRadius: 6
  }], chartOpts(''));

  // Status doughnut
  const statusCount = {};
  allVideos.forEach(v => { const s = v.status || 'unknown'; statusCount[s] = (statusCount[s] || 0) + 1; });
  makeChart('chart-status', 'doughnut',
    Object.keys(statusCount),
    [{ data: Object.values(statusCount), backgroundColor: Object.keys(statusCount).map(s => STATUS_COLORS[s] || '#888'), borderWidth: 0 }],
    pieOpts());

  // Top channels
  const chCounts = {};
  allVideos.forEach(v => { if (v.channel_name) chCounts[v.channel_name] = (chCounts[v.channel_name] || 0) + 1; });
  const topCh = Object.entries(chCounts).sort((a, b) => b[1] - a[1]).slice(0, 15);
  makeChart('chart-top-channels', 'bar', topCh.map(c => c[0]), [{
    label: 'Videos', data: topCh.map(c => c[1]),
    backgroundColor: PALETTE[0] + 'bb', borderRadius: 4
  }], { ...chartOpts(''), indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: gridScales().x, y: { ...gridScales().y, ticks: { color: '#8892b0', font: { size: 10 } } } } });

  // Sections bar
  const secCounts = {};
  allVideos.forEach(v => (v.sections || []).forEach(s => { secCounts[s] = (secCounts[s] || 0) + 1; }));
  const topSec = Object.entries(secCounts).sort((a, b) => b[1] - a[1]);
  makeChart('chart-sections', 'bar', topSec.map(s => s[0]), [{
    label: 'Videos', data: topSec.map(s => s[1]),
    backgroundColor: PALETTE[1] + 'bb', borderRadius: 4
  }], { ...chartOpts(''), indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: gridScales().x, y: { ...gridScales().y, ticks: { color: '#8892b0', font: { size: 10 } } } } });

  // Views distribution (log buckets)
  const buckets = { '0': 0, '1-100': 0, '100-1K': 0, '1K-10K': 0, '10K-100K': 0, '100K-1M': 0, '1M+': 0 };
  allVideos.forEach(v => {
    const c = v.view_count;
    if (c == null) buckets['0']++;
    else if (c < 100) buckets['1-100']++;
    else if (c < 1000) buckets['100-1K']++;
    else if (c < 10000) buckets['1K-10K']++;
    else if (c < 100000) buckets['10K-100K']++;
    else if (c < 1000000) buckets['100K-1M']++;
    else buckets['1M+']++;
  });
  makeChart('chart-views-dist', 'doughnut', Object.keys(buckets), [{
    data: Object.values(buckets),
    backgroundColor: PALETTE, borderWidth: 0
  }], pieOpts());

  // Top by views
  const topViews = allVideos.filter(v => v.view_count).sort((a, b) => b.view_count - a.view_count).slice(0, 10);
  makeChart('chart-top-views', 'bar',
    topViews.map(v => (v.title || v.id).slice(0, 25) + '…'),
    [{ label: 'Views', data: topViews.map(v => v.view_count), backgroundColor: PALETTE[2] + 'bb', borderRadius: 4 }],
    { ...chartOpts(''), indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { ...gridScales().x, ticks: { callback: v => fmtBig(v), color: '#8892b0' } }, y: { ...gridScales().y, ticks: { color: '#8892b0', font: { size: 9 } } } } });

  // Top by likes
  const topLikes = allVideos.filter(v => v.like_count).sort((a, b) => b.like_count - a.like_count).slice(0, 10);
  makeChart('chart-top-likes', 'bar',
    topLikes.map(v => (v.title || v.id).slice(0, 25) + '…'),
    [{ label: 'Likes', data: topLikes.map(v => v.like_count), backgroundColor: PALETTE[3] + 'bb', borderRadius: 4 }],
    { ...chartOpts(''), indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { ...gridScales().x, ticks: { callback: v => fmtBig(v), color: '#8892b0' } }, y: { ...gridScales().y, ticks: { color: '#8892b0', font: { size: 9 } } } } });
}

// ─── CHART HELPERS ────────────────────────────────────────────────────────
function makeChart(id, type, labels, datasets, options) {
  destroyChart(id);
  const ctx = document.getElementById(id);
  if (!ctx) return;
  charts[id] = new Chart(ctx, { type, data: { labels, datasets }, options });
}

function destroyChart(id) {
  if (charts[id]) { charts[id].destroy(); delete charts[id]; }
}

function gridScales() {
  return {
    x: { grid: { color: '#2a3048' }, ticks: { color: '#8892b0' } },
    y: { grid: { color: '#2a3048' }, ticks: { color: '#8892b0' } }
  };
}

function chartOpts(title) {
  return {
    responsive: true, maintainAspectRatio: true,
    plugins: {
      legend: { display: false },
      title: title ? { display: true, text: title, color: '#8892b0', font: { size: 11 } } : { display: false },
      tooltip: { backgroundColor: '#1e2435', titleColor: '#e8eaf6', bodyColor: '#8892b0', borderColor: '#2a3048', borderWidth: 1 }
    },
    scales: gridScales()
  };
}

function pieOpts() {
  return {
    responsive: true, maintainAspectRatio: true,
    plugins: {
      legend: { labels: { color: '#8892b0', font: { size: 11 }, boxWidth: 14, padding: 12 }, position: 'bottom' },
      tooltip: { backgroundColor: '#1e2435', titleColor: '#e8eaf6', bodyColor: '#8892b0' }
    }
  };
}

// ─── UTILS ────────────────────────────────────────────────────────────────
function fmtNum(n) { return n == null ? '-' : n.toLocaleString(); }
function fmtDate(s) {
  if (!s) return '-';
  const d = new Date(s);
  return isNaN(d.getTime()) ? s.slice(0, 10) : d.toLocaleDateString();
}
function fmtBig(n) {
  if (n == null) return '-';
  if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return String(n);
}
function timeAgo(timestamp) {
  if (!timestamp) return '';
  const now = new Date();
  const date = new Date(timestamp * 1000);
  const seconds = Math.floor((now - date) / 1000);

  let interval = Math.floor(seconds / 31536000);
  if (interval >= 1) return interval + " year" + (interval === 1 ? "" : "s") + " ago";
  interval = Math.floor(seconds / 2592000);
  if (interval >= 1) return interval + " month" + (interval === 1 ? "" : "s") + " ago";
  interval = Math.floor(seconds / 86400);
  if (interval >= 1) return interval + " day" + (interval === 1 ? "" : "s") + " ago";
  interval = Math.floor(seconds / 3600);
  if (interval >= 1) return interval + " hour" + (interval === 1 ? "" : "s") + " ago";
  interval = Math.floor(seconds / 60);
  if (interval >= 1) return interval + " minute" + (interval === 1 ? "" : "s") + " ago";
  return "just now";
}
function getStatusEmoji(status) {
  if (status === 'downloaded') return '✅';
  if (status === 'unavailable') return '❌';
  return '⏳';
}

function getLanguageFlag(lang) {
  if (!lang) return '-';
  const maps = {
    'english': '🇬🇧',
    'italian': '🇮🇹',
    'spanish': '🇪🇸',
    'russian': '🇷🇺',
    'french': '🇫🇷',
    'german': '🇩🇪'
  };
  return maps[lang.toLowerCase()] || '🌐';
}
// ─── TIMELINE ─────────────────────────────────────────────────────────────
function renderTimeline() {
  const raw = document.getElementById('tl-md').textContent;
  const html = marked.parse(raw);
  const el = document.getElementById('tl-content');
  el.innerHTML = html;
  // Colour-code era headings
  el.querySelectorAll('h2').forEach(h => {
    const m = h.textContent.match(/Era\s+(\d)/);
    if (m) h.dataset.era = m[1];
  });
  // Open all links in new tab
  el.querySelectorAll('a').forEach(a => a.target = '_blank');
}
//document.addEventListener('DOMContentLoaded', renderTimeline);

function getLocalVideoPath(v) {
  if (!v.local_file) return '';
  let path = v.local_file.replace(/\\/g, '/');

  // If the path starts with a generic section folder, try to use the channel folder instead.
  const genericFolders = ["Risorse", "Old sources", "Tutorial per il pooping", "Tutorial"];
  for (const folder of genericFolders) {
    if (path.startsWith(`videos/${folder}/`)) {
      if (v.channel_name) {
        let safeCh = v.channel_name.replace(/[<>:"/\\|?*]/g, '_');
        safeCh = safeCh.replace(/\s+/g, ' ').trim().slice(0, 80);
        path = path.replace(`videos/${folder}/`, `videos/${safeCh}/`);
      }
      break;
    }
  }

  return (path.startsWith('videos/') || path.startsWith('sources/')) ? '../' + path : path;
}

function escHtml(s) {
  if (!s) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function linkify(text) {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  return text.replace(urlRegex, function (url) {
    return `<a href="${url}" target="_blank" rel="noopener noreferrer" style="color: var(--link-color); text-decoration: underline;">${url}</a>`;
  });
}
function escAttr(s) { return String(s || '').replace(/'/g, "\\'").replace(/"/g, '&quot;'); }

function downloadFile(url, filename) {
  if (event) event.preventDefault();
  fetch(url)
    .then(r => r.blob())
    .then(blob => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
    })
    .catch(err => {
      console.error('Download failed:', err);
      window.open(url, '_blank');
    });
}
// ─── TIMELINE ENGINE ────────────────────────────────────────────────────────
const TS_MIN = new Date(2006, 0, 1).getTime();
const TS_MAX = new Date(new Date().getFullYear(), 11, 31, 23, 59, 59).getTime();
const TS_MS_PER_DAY = 86400000;
const TL_MAX_CARDS = 60;        // Hard cap on DOM video cards per frame
const TL_MIN_LABEL_PX = 28;    // Min pixels between axis labels

let ts = {
  initialized: false,
  msPerPixel: 0,
  centerTime: 0,
  isDragging: false,
  startX: 0,
  startCenterTime: 0,
  raf: null
};

function buildFirstUploadCache() {
  window.channelFirstUploadIds = new Set();
  const firsts = {};
  allVideos.forEach(v => {
    if (!v.channel_name || !v.publish_date) return;
    if (!firsts[v.channel_name] || v.publish_date < firsts[v.channel_name].date) {
      firsts[v.channel_name] = { date: v.publish_date, id: v.id };
    }
  });
  Object.values(firsts).forEach(f => window.channelFirstUploadIds.add(f.id));
}

function initTimeline() {
  const container = document.getElementById('timeline-container');
  if (!container) return;
  buildFirstUploadCache();

  if (!ts.initialized) {
    const w = container.clientWidth;
    ts.msPerPixel = (TS_MAX - TS_MIN) / w;
    ts.centerTime = TS_MIN + (TS_MAX - TS_MIN) / 2;

    container.addEventListener('wheel', e => {
      e.preventDefault();
      // Map vertical scroll to horizontal time movement
      ts.centerTime += e.deltaY * ts.msPerPixel * 0.8;
      clampTimeline(container.clientWidth);
      scheduleRender();
    }, { passive: false });

    // Zoom slider logic
    const zoomSlider = document.getElementById('timeline-zoom-slider');
    if (zoomSlider) {
      zoomSlider.addEventListener('input', () => {
        const w = container.clientWidth;
        const val = parseFloat(zoomSlider.value); // 0 = zoomed out, 100 = zoomed in
        const minMs = TS_MS_PER_DAY / 150;
        const maxMs = (TS_MAX - TS_MIN) / w;

        // Logarithmic zoom for smoother feel
        const logMin = Math.log(minMs);
        const logMax = Math.log(maxMs);
        const logVal = logMax - (val / 100) * (logMax - logMin);
        ts.msPerPixel = Math.exp(logVal);

        clampTimeline(w);
        scheduleRender();
      });

      // Initial slider sync
      const minMs = TS_MS_PER_DAY / 150;
      const maxMs = (TS_MAX - TS_MIN) / container.clientWidth;
      const logMin = Math.log(minMs);
      const logMax = Math.log(maxMs);
      const currentLog = Math.log(ts.msPerPixel);
      zoomSlider.value = ((logMax - currentLog) / (logMax - logMin)) * 100;
    }

    container.addEventListener('mousedown', e => {
      ts.isDragging = true; ts.startX = e.clientX; ts.startCenterTime = ts.centerTime;
    });
    window.addEventListener('mousemove', e => {
      if (!ts.isDragging) return;
      ts.centerTime = ts.startCenterTime - (e.clientX - ts.startX) * ts.msPerPixel;
      clampTimeline(container.clientWidth);
      scheduleRender();
    });
    window.addEventListener('mouseup', () => { ts.isDragging = false; });
    window.addEventListener('mouseleave', () => { ts.isDragging = false; });

    let lastTX = 0;
    container.addEventListener('touchstart', e => { lastTX = e.touches[0].clientX; }, { passive: true });
    container.addEventListener('touchmove', e => {
      e.preventDefault();
      const dx = e.touches[0].clientX - lastTX; lastTX = e.touches[0].clientX;
      ts.centerTime -= dx * ts.msPerPixel;
      clampTimeline(container.clientWidth); scheduleRender();
    }, { passive: false });

    ts.initialized = true;
  }

  // Populate channel datalist for timeline filter
  const dl = document.getElementById('timeline-channel-datalist');
  if (dl && dl.children.length === 0) {
    const channels = [...new Set([...allVideos, ...allSources].map(v => v.channel_name).filter(Boolean))].sort();
    channels.forEach(ch => {
      const opt = document.createElement('option');
      opt.value = ch;
      dl.appendChild(opt);
    });
  }

  scheduleRender();
}

function clampTimeline(w) {
  const half = (w / 2) * ts.msPerPixel;
  ts.centerTime = Math.max(TS_MIN + half, Math.min(TS_MAX - half, ts.centerTime));
}

function scheduleRender() {
  if (ts.raf) cancelAnimationFrame(ts.raf);
  ts.raf = requestAnimationFrame(renderTimelineView);
}

function getZoomLevel() {
  if (ts.msPerPixel > TS_MS_PER_DAY * 90) return 'years';
  if (ts.msPerPixel > TS_MS_PER_DAY * 2.5) return 'months';
  return 'days';
}

// ── tick interval config per zoom ──────────────────────────────────────────
function getTickConfig(zoom) {
  if (zoom === 'years') return {
    start: d => { d.setMonth(0, 1); d.setHours(0, 0, 0, 0); },
    advance: d => d.setFullYear(d.getFullYear() + 1),
    label: d => String(d.getFullYear()),
    isMajor: () => true
  };
  if (zoom === 'months') return {
    start: d => { d.setDate(1); d.setHours(0, 0, 0, 0); },
    advance: d => d.setMonth(d.getMonth() + 1),
    label: d => d.toLocaleString('default', { month: 'short' }) + ' ' + d.getFullYear(),
    isMajor: d => d.getMonth() === 0
  };
  // days
  return {
    start: d => d.setHours(0, 0, 0, 0),
    advance: d => d.setDate(d.getDate() + 1),
    label: d => d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }),
    isMajor: d => d.getDate() === 1
  };
}

function renderTimelineView() {
  const container = document.getElementById('timeline-container');
  if (!container) return;

  const W = container.clientWidth;
  const H = container.clientHeight;
  const half = W / 2;
  const startT = ts.centerTime - half * ts.msPerPixel;
  const endT = ts.centerTime + half * ts.msPerPixel;
  const zoom = getZoomLevel();
  const cfg = getTickConfig(zoom);

  // ── 1. Canvas grid (no DOM nodes for grid lines) ───────────────────────
  let canvas = container.querySelector('canvas.tl-canvas');
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.className = 'tl-canvas';
    canvas.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;z-index:1;';
    container.appendChild(canvas);
  }
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, W, H);

  const isDark = document.body.classList.contains('theme-dark') || !document.body.classList.contains('theme-light');
  const gridColor = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)';
  const majorColor = isDark ? 'rgba(255,255,255,0.20)' : 'rgba(0,0,0,0.20)';
  const labelColor = isDark ? '#aaa' : '#555';
  const majorLabelClr = isDark ? '#eee' : '#111';
  const AXIS_H = 60;

  // Draw axis background at bottom
  ctx.fillStyle = isDark ? 'rgba(0,0,0,0.25)' : 'rgba(0,0,0,0.04)';
  ctx.fillRect(0, H - AXIS_H, W, AXIS_H);

  // Draw ticks & labels on canvas
  const cur = new Date(startT);
  cfg.start(cur);
  let lastLabelX = -999;

  while (cur.getTime() <= endT) {
    const xPos = (cur.getTime() - startT) / ts.msPerPixel;
    const isMaj = cfg.isMajor(cur);

    // Grid line
    ctx.beginPath();
    ctx.moveTo(xPos, 0);
    ctx.lineTo(xPos, H - AXIS_H);
    ctx.strokeStyle = isMaj ? majorColor : gridColor;
    ctx.lineWidth = isMaj ? 1.5 : 0.8;
    ctx.stroke();

    // Spine dot
    ctx.beginPath();
    ctx.arc(xPos, H - AXIS_H - 3, isMaj ? 4 : 2, 0, Math.PI * 2);
    ctx.fillStyle = isMaj ? (isDark ? '#4af' : '#36c') : (isDark ? '#555' : '#bbb');
    ctx.fill();

    // Label (skip if too close to previous)
    if (xPos - lastLabelX >= TL_MIN_LABEL_PX) {
      const label = cfg.label(cur);
      ctx.font = isMaj ? 'bold 13px sans-serif' : '11px sans-serif';
      ctx.fillStyle = isMaj ? majorLabelClr : labelColor;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(label, xPos, H - AXIS_H + 10);
      lastLabelX = xPos;
    }

    cfg.advance(cur);
  }

  // Horizontal spine line
  ctx.beginPath();
  ctx.moveTo(0, H - AXIS_H - 1); ctx.lineTo(W, H - AXIS_H - 1);
  ctx.strokeStyle = isDark ? '#4af' : '#36c';
  ctx.lineWidth = 2; ctx.stroke();

  // ── 2. DOM cards – remove existing, rebuild with DocumentFragment ──────
  // Remove old cards only (not the canvas)
  Array.from(container.querySelectorAll('.tl-card, .tl-hint')).forEach(el => el.remove());

  const showOnlyMilestones = (zoom === 'years');


  // Filter + sort visible videos
  const channelFilter = document.getElementById('timeline-channel-filter')?.value || '';
  const allVids = allVideos;
  let visible = allVids.filter(v => {
    if (!v.publish_date) return false;
    if (channelFilter && !(v.channel_name || '').toLowerCase().includes(channelFilter.toLowerCase())) return false;
    const t = new Date(v.publish_date).getTime();
    if (t < startT || t > endT) return false;
    if (showOnlyMilestones && (v.view_count || 0) < 10_000_000) return false;
    return true;
  });

  // Sort by views descending so most important show first when capped
  visible.sort((a, b) => (b.view_count || 0) - (a.view_count || 0));
  // Cap to avoid DOM explosion
  const capped = visible.length > TL_MAX_CARDS;
  visible = visible.slice(0, TL_MAX_CARDS);
  // Re-sort by date for stagger
  visible.sort((a, b) => a.publish_date.localeCompare(b.publish_date));

  const frag = document.createDocumentFragment();
  const CARD_W = 240;
  const CARD_H = 60;
  const placed = [];

  visible.forEach(v => {
    const t = new Date(v.publish_date).getTime();
    const xPos = (t - startT) / ts.msPerPixel;
    const isMilestone = (v.view_count || 0) >= 10_000_000;
    const isFirst = window.channelFirstUploadIds && window.channelFirstUploadIds.has(v.id);

    let row = 0;
    while (placed.some(p => p.row === row && Math.abs(p.left - xPos) < CARD_W)) row++;
    placed.push({ row, left: xPos });

    const card = document.createElement('div');
    card.className = 'tl-card' + (isMilestone ? ' tl-milestone' : '') + (isFirst ? ' tl-first' : '');
    card.style.left = `${Math.round(xPos)}px`;
    card.style.bottom = `${AXIS_H + 20 + row * CARD_H}px`;
    card.onclick = () => openVideo(v.id);

    const views = v.view_count ? fmtNum(v.view_count) + ' views' : '';
    card.innerHTML =
      `<div class="tl-card-title">${isFirst ? '<span class="tl-star">★</span>' : ''}${escHtml(v.title || v.id)}</div>` +
      `<div class="tl-card-sub">${escHtml(v.channel_name || '?')}${views ? ' · ' + views : ''}</div>`;
    frag.appendChild(card);
  });

  if (capped) {
    const cap = document.createElement('div');
    cap.className = 'tl-hint tl-cap-notice';
    cap.textContent = `Showing top ${TL_MAX_CARDS} of ${visible.length + (TL_MAX_CARDS - visible.length)} visible videos. Zoom in to see more.`;
    frag.appendChild(cap);
  }

  container.appendChild(frag);
}


// ─── SAVED VIDEOS (IndexedDB) ──────────────────────────────────────────────

function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, 1);
    request.onupgradeneeded = (e) => {
      db = e.target.result;
      if (!db.objectStoreNames.contains(storeName)) {
        db.createObjectStore(storeName, { keyPath: 'id' });
      }
    };
    request.onsuccess = (e) => {
      db = e.target.result;
      updateSavedBadge();
      resolve();
    };
    request.onerror = (e) => {
      console.error("IndexedDB error:", e.target.error);
      reject(e.target.error);
    };
  });
}

function saveVideoToDB(video) {
  if (!db) return;
  const transaction = db.transaction([storeName], 'readwrite');
  const store = transaction.objectStore(storeName);
  store.put(video);
  transaction.oncomplete = () => {
    updateSavedBadge();
    updateSaveButton(video.id);
  };
}

function removeVideoFromDB(id) {
  if (!db) return;
  const transaction = db.transaction([storeName], 'readwrite');
  const store = transaction.objectStore(storeName);
  store.delete(id);
  transaction.oncomplete = () => {
    updateSavedBadge();
    updateSaveButton(id);
    if (document.getElementById('page-saved').classList.contains('active')) {
      renderSavedPage();
    }
  };
}

function getSavedVideos() {
  return new Promise((resolve) => {
    if (!db) return resolve([]);
    const transaction = db.transaction([storeName], 'readonly');
    const store = transaction.objectStore(storeName);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve([]);
  });
}

function isVideoSaved(id) {
  return new Promise((resolve) => {
    if (!db) return resolve(false);
    const transaction = db.transaction([storeName], 'readonly');
    const store = transaction.objectStore(storeName);
    const request = store.get(id);
    request.onsuccess = () => resolve(!!request.result);
    request.onerror = () => resolve(false);
  });
}

async function updateSavedBadge() {
  const saved = await getSavedVideos();
  const badge = document.getElementById('badge-saved');
  if (badge) badge.textContent = saved.length;
}

async function updateSaveButton(vidId) {
  const btn = document.getElementById('btn-save-video');
  if (!btn) return;

  const saved = await isVideoSaved(vidId);
  const icon = saved ? '★' : '☆';
  btn.innerHTML = `<span style="font-size:1.2rem; vertical-align:middle; margin-right:8px;">${icon}</span> ${saved ? 'Unsave Video' : 'Save Video'}`;
  btn.classList.toggle('active', saved);

  btn.onclick = (e) => {
    e.preventDefault();
    if (saved) {
      removeVideoFromDB(vidId);
    } else {
      const ytData = [...allVideos, ...allSources];
      const v = ytData.find(x => x.id === vidId);
      if (v) saveVideoToDB(v);
    }
  };
}

async function renderSavedPage() {
  const grid = document.getElementById('saved-videos-grid');
  const label = document.getElementById('saved-count-label');
  if (!grid) return;

  const saved = await getSavedVideos();
  if (label) label.textContent = `${saved.length} videos saved locally in your browser`;

  if (saved.length === 0) {
    grid.innerHTML = '<div class="empty" style="grid-column: 1/-1; padding: 40px; text-align: center; color: var(--text-muted);">No saved videos yet. Start exploring and click "Save Video" to keep track of your favorites!</div>';
  } else {
    // Sort by views or date? Let's do most recent (if we had a saved_at timestamp, but we don't yet)
    grid.innerHTML = saved.map(v => renderVideoItem(v, 'grid')).join('');
  }
}

// ─── MANAGEMENT ───────────────────────────────────────────────────────────
function updateManagementVisibility() {
  const mgmt = document.getElementById('management-actions');
  if (!mgmt) return;
  const anyChecked = document.querySelectorAll('.manage-check:checked').length > 0;
  mgmt.style.display = (isServerMode && anyChecked) ? 'flex' : 'none';
}

function toggleAllManage(checked) {
  document.querySelectorAll('.manage-check').forEach(cb => cb.checked = checked);
  updateManagementVisibility();
}

async function bulkAction(type) {
  const checks = document.querySelectorAll('.manage-check:checked');
  const ids = Array.from(checks).map(cb => cb.getAttribute('data-id'));

  if (ids.length === 0) return alert("Select at least one video.");

  let body = { videoIds: ids };
  let endpoint = '';

  if (type === 'ban') {
    if (!confirm(`Are you sure you want to BAN ${ids.length} videos?`)) return;
    endpoint = '/api/ban';
  } else if (type === 'flag-source') {
    if (!confirm(`Are you sure you want to FLAG AS SOURCE ${ids.length} videos?`)) return;
    endpoint = '/api/flag-source';
  } else if (type === 'set-lang') {
    const lang = document.getElementById('mgmt-lang-select').value;
    if (!lang) return alert("Please select a language.");
    if (!confirm(`Set language to ${lang} for ${ids.length} videos?`)) return;
    endpoint = '/api/set-lang';
    body.language = lang;
  }

  try {
    const r = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const res = await r.json();
    if (res.success) {
      location.reload();
    } else {
      alert("Error: " + (res.error || "Unknown error"));
    }
  } catch (e) {
    alert("Request failed: " + e.message);
  }
}
