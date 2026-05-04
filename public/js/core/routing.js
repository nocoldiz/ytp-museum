// ─── ROUTING ──────────────────────────────────────────────────────────────

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

  if (page === 'search' && !query) {
    showPage('youtube', true);
    return;
  }

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
  if (name === 'sources' || name === 'videos' || name === 'ytpmv' || name === 'collabs') {
    appMode = name;
    targetPage = 'videos';
    
    let title = 'Video Search';
    if (appMode === 'sources') title = 'Source Search';
    else if (appMode === 'ytpmv') title = 'YTPMV Search';
    else if (appMode === 'collabs') title = 'Collabs Search';
    
    document.getElementById('page-videos').querySelector('h2').textContent = title;

    const tabV = document.getElementById('manager-tab-videos');
    const tabS = document.getElementById('manager-tab-sources');
    const tabM = document.getElementById('manager-tab-ytpmv');
    const tabC = document.getElementById('manager-tab-collabs');
    
    if (tabV) tabV.classList.toggle('active', name === 'videos');
    if (tabS) tabS.classList.toggle('active', name === 'sources');
    if (tabM) tabM.classList.toggle('active', name === 'ytpmv');
    if (tabC) tabC.classList.toggle('active', name === 'collabs');

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

  if (name === 'channels') renderChannelGrid();

  document.getElementById('page-' + targetPage).classList.add('active');

  // Close sidebar on navigation (mobile)
  document.body.classList.remove('sidebar-open');

  if (name === 'timeline' && typeof initTimeline === 'function') {
    if (allVideos.length === 0) {
      allVideos = queryDB("SELECT * FROM videos WHERE (title IS NOT NULL AND title != '')", [], dbYTP);
      allSources = queryDB("SELECT * FROM videos WHERE (title IS NOT NULL AND title != '')", [], dbSources);
    }
    initTimeline();
  }
  if (name === 'youtube') {
    appMode = 'videos';
    renderHomePage();
  }
  if (name === 'saved') {
    renderSavedPage();
  }
  if (name === 'playlists') {
    renderPlaylistsPage();
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


// Expose functions to global scope
window.handleRouting = handleRouting;
window.updateURL = updateURL;
window.togglePlaybackMode = togglePlaybackMode;
window.updatePlaybackToggleUI = updatePlaybackToggleUI;
window.showPage = showPage;
window.setAspectRatio = setAspectRatio;
