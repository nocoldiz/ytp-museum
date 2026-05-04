window.allVideos = [];       // Cache for currently filtered view
window.allSources = [];
window.allPoopers = {};
window.pooperMap = {};
window.filteredVideos = [];
window.appMode = 'videos';
window.isServerMode = false;
window.currentPage = 1;
window.currentChannelPage = 1;
window.PAGE_SIZE = 50;
window.CHANNELS_PAGE_SIZE = 40;
window.selectedChannel = null;
window.selectedSection = null;
window.charts = {};
window.globalMaxYear = new Date().getFullYear();
window.renderedHomeVideoIds = new Set();
window.isFetchingMoreHome = false;
window.currentModernTab = 'all';
window.enabledSources = JSON.parse(localStorage.getItem('ytp-enabled-sources')) || {
  ytp: true,
  ytpmv: true,
  collabs: true,
  other: false
};
window.playbackMode = localStorage.getItem('ytp-playback-mode') || 'youtube';
window.sourceChannels = new Set();

function getAppRoot() {
  return window.location.pathname.startsWith('/ytp-museum/') ? '/ytp-museum/' : '/';
}

// DB Constants
window.dbName = 'YTPArchiveDB';
window.storeName = 'savedVideos';
window.playlistStoreName = 'playlists';
window.idb = undefined; // IndexedDB
window.dbYTP = undefined;
window.dbSources = undefined;
window.dbPoopers = undefined;
window.dbYTPMV = undefined;
window.dbCollabs = undefined; // Split SQLite DBs
window.sqlDB = undefined; // Reference to main DB for compatibility

