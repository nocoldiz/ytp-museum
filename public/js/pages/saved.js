// ─── SAVED VIDEOS (IndexedDB) ──────────────────────────────────────────────

function initIndexedDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, 2);
    request.onupgradeneeded = (e) => {
      window.idb = e.target.result;
      if (!window.idb.objectStoreNames.contains(storeName)) {
        window.idb.createObjectStore(storeName, { keyPath: 'id' });
      }
      if (!window.idb.objectStoreNames.contains(playlistStoreName)) {
        window.idb.createObjectStore(playlistStoreName, { keyPath: 'id' });
      }
    };
    request.onsuccess = (e) => {
      window.idb = e.target.result;
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
  if (!window.idb) return;
  const transaction = window.idb.transaction([storeName], 'readwrite');
  const store = transaction.objectStore(storeName);
  store.put(video);
  transaction.oncomplete = () => {
    updateSavedBadge();
    updateSaveButton(video.id);
  };
}

function removeVideoFromDB(id) {
  if (!window.idb) return;
  const transaction = window.idb.transaction([storeName], 'readwrite');
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
    if (!window.idb) return resolve([]);
    const transaction = window.idb.transaction([storeName], 'readonly');
    const store = transaction.objectStore(storeName);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve([]);
  });
}

function isVideoSaved(id) {
  return new Promise((resolve) => {
    if (!window.idb) return resolve(false);
    const transaction = window.idb.transaction([storeName], 'readonly');
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
    grid.innerHTML = saved.map(v => renderVideoItem(v, 'grid')).join('');
  }
}


// Expose functions to global scope
window.initIndexedDB = initIndexedDB;
window.saveVideoToDB = saveVideoToDB;
window.removeVideoFromDB = removeVideoFromDB;
window.getSavedVideos = getSavedVideos;
window.isVideoSaved = isVideoSaved;
window.updateSavedBadge = updateSavedBadge;
window.updateSaveButton = updateSaveButton;
window.renderSavedPage = renderSavedPage;
