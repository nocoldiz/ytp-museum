// ─── PLAYLISTS ────────────────────────────────────────────────────────────

let allPlaylists = { local: [], server: [] };
let selectedPlaylist = null;
let bulkPlaylistMode = false;

async function getLocalPlaylists() {
  return new Promise((resolve) => {
    if (!db) return resolve([]);
    const transaction = db.transaction([playlistStoreName], 'readonly');
    const store = transaction.objectStore(playlistStoreName);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve([]);
  });
}

async function getServerPlaylists() {
  try {
    const r = await fetch('/api/playlists');
    const res = await r.json();
    return res.success ? Object.values(res.playlists) : [];
  } catch (e) {
    return [];
  }
}

async function renderPlaylistsPage() {
  const grid = document.getElementById('playlists-grid');
  const label = document.getElementById('playlists-count-label');
  const listContainer = document.getElementById('playlists-list-container');
  const detailContainer = document.getElementById('playlist-detail-container');

  if (!grid) return;
  listContainer.style.display = 'block';
  detailContainer.style.display = 'none';

  const local = await getLocalPlaylists();
  const server = await getServerPlaylists();
  allPlaylists = { local, server };

  const total = local.length + server.length;
  if (label) label.textContent = `${total} playlists (${local.length} local, ${server.length} server)`;

  if (total === 0) {
    grid.innerHTML = '<div class="empty" style="grid-column: 1/-1; padding: 40px; text-align: center; color: var(--text-muted);">No playlists found. Create one to get started!</div>';
  } else {
    const html = [
      ...local.map(p => renderPlaylistCard(p, 'local')),
      ...server.map(p => renderPlaylistCard(p, 'server'))
    ].join('');
    grid.innerHTML = html;
  }
}

function renderPlaylistCard(p, type, mode = 'grid') {
  const count = p.videoIds ? p.videoIds.length : 0;
  const isOld = document.body.classList.contains('theme-old');

  if (isOld && mode === 'list') {
    return `
      <div class="video-item list" onclick="openPlaylistDetail('${p.id}', '${type}')" style="cursor:pointer; margin-bottom: 12px; border-bottom: 1px solid var(--border); padding-bottom: 12px;">
        <div class="yt-list-thumb" style="background:var(--surface2); display:flex; align-items:center; justify-content:center; flex-direction:column; gap:4px;">
          <svg style="width:32px; height:32px; fill:var(--text-muted);" viewBox="0 0 24 24">
            <path d="M4 10h12v2H4zm0-4h12v2H4zm0 8h8v2H4zm10 0v6l5-3-5-3z" />
          </svg>
          <span style="font-size:0.75rem; font-weight:bold; color:var(--text-muted);">${count} videos</span>
        </div>
        <div class="yt-list-info">
          <div class="yt-list-title" style="font-size:1.1rem; font-weight:bold; color:var(--link-color);">Playlist: ${escHtml(p.name)}</div>
          <div class="yt-list-meta" style="margin-top:4px;">
            <span class="status-badge" style="background:${type === 'server' ? 'var(--accent)' : 'var(--surface2)'}; color:#fff; padding:2px 6px; border-radius:4px; font-size:0.7rem;">${type.toUpperCase()}</span>
            <span style="margin-left:8px; font-size:0.8rem; color:var(--text-muted);">Collection of curated videos</span>
          </div>
        </div>
      </div>
    `;
  }

  return `
    <div class="vid-card" onclick="openPlaylistDetail('${p.id}', '${type}')">
      <div class="yt-facade" style="background:var(--surface2); display:flex; align-items:center; justify-content:center; flex-direction:column; gap:10px;">
        <svg style="width:48px; height:48px; fill:var(--text-muted);" viewBox="0 0 24 24">
          <path d="M4 10h12v2H4zm0-4h12v2H4zm0 8h8v2H4zm10 0v6l5-3-5-3z" />
        </svg>
        <span style="font-size:1.2rem; font-weight:bold;">${count} videos</span>
      </div>
      <div class="vid-card-info">
        <div class="vid-card-title" style="font-size:1.1rem; font-weight:bold;">${escHtml(p.name)}</div>
        <div class="vid-card-meta">
          <span class="status-badge" style="background:${type === 'server' ? 'var(--accent)' : 'var(--surface2)'}; color:#fff; padding:2px 6px; border-radius:4px; font-size:0.7rem;">${type.toUpperCase()}</span>
        </div>
      </div>
    </div>
  `;
}

async function openPlaylistDetail(id, type) {
  const listContainer = document.getElementById('playlists-list-container');
  const detailContainer = document.getElementById('playlist-detail-container');
  const titleEl = document.getElementById('playlist-detail-title');
  const metaEl = document.getElementById('playlist-detail-meta');
  const videoGrid = document.getElementById('playlist-videos-grid');

  listContainer.style.display = 'none';
  detailContainer.style.display = 'block';
  videoGrid.innerHTML = 'Loading videos...';

  let playlist;
  if (type === 'local') {
    const local = await getLocalPlaylists();
    playlist = local.find(p => p.id === id);
  } else {
    const server = await getServerPlaylists();
    playlist = server.find(p => p.id === id);
  }

  if (!playlist) return;

  titleEl.textContent = playlist.name;
  metaEl.textContent = `${playlist.videoIds.length} videos • ${type === 'local' ? 'Stored in browser' : 'Public server playlist'}`;

  if (playlist.videoIds.length === 0) {
    videoGrid.innerHTML = '<div class="empty">This playlist is empty.</div>';
  } else {
    const ytData = [...allVideos, ...allSources];
    const videos = playlist.videoIds.map(vidId => ytData.find(v => v.id === vidId)).filter(Boolean);
    videoGrid.innerHTML = videos.map(v => renderVideoItem(v, 'grid')).join('');
  }
}

function closePlaylistDetail() {
  document.getElementById('playlists-list-container').style.display = 'block';
  document.getElementById('playlist-detail-container').style.display = 'none';
}

function openCreatePlaylistModal() {
  document.getElementById('playlist-create-modal').style.display = 'flex';
  document.getElementById('server-playlist-option').style.display = isServerMode ? 'block' : 'none';
}

function closePlaylistModal(type) {
  document.getElementById(`playlist-${type}-modal`).style.display = 'none';
}

async function submitCreatePlaylist() {
  const name = document.getElementById('new-playlist-name').value.trim();
  const type = document.querySelector('input[name="playlist-type"]:checked').value;

  if (!name) return alert("Please enter a name.");

  if (type === 'local') {
    const id = 'local_' + Date.now();
    const playlist = { id, name, videoIds: [], created_at: new Date().toISOString() };
    try {
      const transaction = db.transaction([playlistStoreName], 'readwrite');
      transaction.objectStore(playlistStoreName).add(playlist);
      transaction.oncomplete = async () => {
        const local = await getLocalPlaylists();
        allPlaylists.local = local;
        closePlaylistModal('create');
        if (document.getElementById('page-playlists').classList.contains('active')) renderPlaylistsPage();
        else alert("Playlist created!");
      };
      transaction.onerror = (e) => {
        console.error("Transaction error:", e.target.error);
        alert("Failed to save playlist: " + e.target.error);
      };
    } catch (e) {
      console.error("Local creation failed:", e);
      alert("Local creation failed. Try refreshing the page or check console.");
    }
  } else {
    try {
      const r = await fetch('/api/playlists/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      });
      const res = await r.json();
      if (res.success) {
        const server = await getServerPlaylists();
        allPlaylists.server = server;
        closePlaylistModal('create');
        if (document.getElementById('page-playlists').classList.contains('active')) renderPlaylistsPage();
        else alert("Server playlist created!");
      } else {
        alert("Error: " + res.error);
      }
    } catch (e) {
      alert("Failed to create server playlist.");
    }
  }
}

async function openAddToPlaylistModal(isBulk = false) {
  bulkPlaylistMode = isBulk;
  const list = document.getElementById('playlist-selection-list');
  list.innerHTML = 'Loading playlists...';
  document.getElementById('playlist-add-modal').style.display = 'flex';

  const local = await getLocalPlaylists();
  const server = await getServerPlaylists();

  if (local.length === 0 && server.length === 0) {
    list.innerHTML = '<p class="empty">No playlists found. Create one first!</p>';
    return;
  }

  let html = '';
  if (local.length > 0) {
    html += '<div style="font-weight:bold; margin-bottom:5px; font-size:0.9rem; color:var(--text-muted);">Local Playlists</div>';
    html += local.map(p => `
      <div class="suggestion-item" onclick="confirmAddToPlaylist('${p.id}', 'local')">
        <span class="suggestion-text">${escHtml(p.name)}</span>
        <span class="suggestion-type">${p.videoIds.length} vids</span>
      </div>
    `).join('');
  }
  if (server.length > 0) {
    html += '<div style="font-weight:bold; margin:10px 0 5px 0; font-size:0.9rem; color:var(--text-muted);">Server Playlists</div>';
    html += server.map(p => `
      <div class="suggestion-item" onclick="confirmAddToPlaylist('${p.id}', 'server')">
        <span class="suggestion-text">${escHtml(p.name)}</span>
        <span class="suggestion-type">${p.videoIds.length} vids</span>
      </div>
    `).join('');
  }
  list.innerHTML = html;
}

async function confirmAddToPlaylist(playlistId, type) {
  let videoIds = [];
  if (bulkPlaylistMode) {
    const checks = document.querySelectorAll('.manage-check:checked');
    videoIds = Array.from(checks).map(cb => cb.getAttribute('data-id'));
  } else {
    const url = new URL(window.location);
    const vidId = url.searchParams.get('v');
    if (vidId) videoIds = [vidId];
  }

  if (videoIds.length === 0) return alert("No videos selected.");

  if (type === 'local') {
    const transaction = db.transaction([playlistStoreName], 'readwrite');
    const store = transaction.objectStore(playlistStoreName);
    const request = store.get(playlistId);
    request.onsuccess = () => {
      const p = request.result;
      const existing = new Set(p.videoIds);
      let added = 0;
      videoIds.forEach(id => {
        if (!existing.has(id)) {
          p.videoIds.push(id);
          added++;
        }
      });
      store.put(p);
      transaction.oncomplete = async () => {
        const local = await getLocalPlaylists();
        allPlaylists.local = local;
        alert(`Added ${added} videos to playlist "${p.name}".`);
        closePlaylistModal('add');
      };
    };
  } else {
    try {
      const r = await fetch('/api/playlists/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playlistId, videoIds })
      });
      const res = await r.json();
      if (res.success) {
        const server = await getServerPlaylists();
        allPlaylists.server = server;
        alert(`Added ${res.addedCount} videos to server playlist.`);
        closePlaylistModal('add');
      } else {
        alert("Error: " + res.error);
      }
    } catch (e) {
      alert("Failed to add to server playlist.");
    }
  }
}


// Expose functions to global scope
window.getLocalPlaylists = getLocalPlaylists;
window.getServerPlaylists = getServerPlaylists;
window.renderPlaylistsPage = renderPlaylistsPage;
window.renderPlaylistCard = renderPlaylistCard;
window.openPlaylistDetail = openPlaylistDetail;
window.closePlaylistDetail = closePlaylistDetail;
window.openCreatePlaylistModal = openCreatePlaylistModal;
window.closePlaylistModal = closePlaylistModal;
window.submitCreatePlaylist = submitCreatePlaylist;
window.openAddToPlaylistModal = openAddToPlaylistModal;
window.confirmAddToPlaylist = confirmAddToPlaylist;
