// ─── CHANNELS ─────────────────────────────────────────────────────────────
function buildChannelData() {
  const cacheKey = `channelData_${window.globalMaxYear}`;
  return getCachedQuery(cacheKey, () => {
    const sql = `
      SELECT 
        channel_name as name, 
        channel_url as url, 
        COUNT(*) as videoCount, 
        SUM(view_count) as totalViews, 
        SUM(like_count) as totalLikes,
        MIN(substr(publish_date, 1, 4)) as firstYear
      FROM videos 
      WHERE channel_name IS NOT NULL AND (CAST(substr(publish_date, 1, 4) AS INTEGER) <= ? OR publish_date IS NULL)
      GROUP BY channel_name 
      ORDER BY videoCount DESC
    `;
    const res = window.queryDB(sql, [window.globalMaxYear]);
    return res.map(r => ({
      ...r,
      videos: { length: r.videoCount } // Mock for backward compatibility
    }));
  });
}

function renderChannelCard(c, mode = 'grid') {
  const name = (typeof c === 'string' ? c : c.name) || 'Unknown Channel';
  const avatar = getChannelAvatar(name);

  let videosCount = 0, viewsCount = 0, url;
  if (typeof c === 'string') {
    const dbs = [window.dbYTP, window.dbYTPMV, window.dbCollabs];
    for (const db of dbs) {
      if (db) {
        const res = window.queryDB("SELECT COUNT(*) as count, SUM(view_count) as views FROM videos WHERE channel_name = ?", [name], db);
        if (res && res[0]) {
          videosCount += (res[0].count || 0);
          viewsCount += (res[0].views || 0);
        }
      }
    }
    url = `https://www.youtube.com/${name && name.startsWith('@') ? name : '@' + name}`;
  } else {
    videosCount = c.videoCount || (c.videos ? c.videos.length : 0);
    viewsCount = c.totalViews || 0;
    url = c.url || `https://www.youtube.com/${name && name.startsWith('@') ? name : '@' + name}`;
  }

  const isOld = document.body.classList.contains('theme-old');
  const isSelected = typeof selectedChannel !== 'undefined' && selectedChannel === name;

  if (mode === 'search' && !isOld) {
    return `
      <div class="channel-card modern-search" onclick="event.stopPropagation(); openProfile('${escAttr(name)}')">
        <div class="ch-card-main-modern">
          <img src="${avatar}" class="ch-avatar-modern">
          <div class="ch-info-modern">
            <h4 class="ch-name-modern">${escHtml(name)}</h4>
            <div class="ch-stats-modern">
              <span>${videosCount} videos</span>
              <span class="dot-sep">•</span>
              ${viewsCount ? `<span>${fmtNum(viewsCount)} views</span>` : ''}
            </div>
            <div class="ch-desc-modern">Official channel for ${escHtml(name)} archival data.</div>
            <div class="ch-actions-modern">
              <button class="btn-visit-modern" onclick="event.stopPropagation(); openProfile('${escAttr(name)}')">Profile</button>
              <button class="btn-visit-modern" onclick="event.stopPropagation(); selectChannel('${escAttr(name)}')">Stats</button>
              <button class="modern-btn-subscribe ${isSubscribed(name) ? 'subscribed' : ''}" data-channel="${escAttr(name)}" onclick="event.stopPropagation(); toggleSubscription('${escAttr(name)}')">${isSubscribed(name) ? 'Iscritto' : 'Iscriviti'}</button>
              <a class="btn-visit-modern theme-modern-only" href="${url}" target="_blank" onclick="event.stopPropagation()">YouTube</a>
            </div>
          </div>
        </div>
      </div>`;
  }

  const cardClass = mode === 'search' ? 'channel-card search-channel-card' : 'channel-card' + (isSelected ? ' selected' : '');
  const avatarClass = mode === 'search' ? 'ch-card-avatar' : 'ch-card-avatar large';

  return `
    <div class="${cardClass}" onclick="openProfile('${escAttr(name)}')">
      <div class="ch-card-main">
        <img src="${avatar}" class="${avatarClass}">
        <div style="flex:1; min-width:0;">
          <h4 style="margin:0; font-size:${mode === 'search' ? '0.9rem' : '1.1rem'}; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escHtml(name)}</h4>
          <div class="ch-stats" style="margin-top:6px;">
            <span><strong>${videosCount}</strong> videos</span><br>
            ${viewsCount ? `<span><strong>${fmtNum(viewsCount)}</strong> views</span>` : ''}
          </div>
        </div>
      </div>
      <div class="ch-actions">
        <button class="btn-card-action" onclick="event.stopPropagation(); openProfile('${escAttr(name)}')">View</button>
        <button class="btn-card-action" onclick="event.stopPropagation(); selectChannel('${escAttr(name)}')">Stats</button>
        <button class="btn-card-action modern-btn-subscribe ${isSubscribed(name) ? 'subscribed' : ''}" data-channel="${escAttr(name)}" onclick="event.stopPropagation(); toggleSubscription('${escAttr(name)}')">${isSubscribed(name) ? 'Iscritto' : 'Iscriviti'}</button>
        <a class="btn-card-action" href="${url}" target="_blank" onclick="event.stopPropagation()">YouTube</a>
      </div>
    </div>`;
}

function toggleSidebar() {
  if (window.innerWidth <= 1000) {
    document.body.classList.toggle('sidebar-open');
    document.body.classList.remove('sidebar-collapsed');
  } else {
    document.body.classList.toggle('sidebar-collapsed');
    document.body.classList.remove('sidebar-open');
  }
}

function toggleFilters() {
  const bar = document.getElementById('search-filter-bar');
  if (bar) bar.classList.toggle('active');
}

let channelScrollObserver = null;
function setupChannelScrollObserver() {
  if (channelScrollObserver) channelScrollObserver.disconnect();
  const sentinel = document.getElementById('channel-scroll-sentinel');
  if (!sentinel) return;

  channelScrollObserver = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting) {
      const q = (document.getElementById('channel-search').value || '').toLowerCase();
      const minYear = parseInt(document.getElementById('channel-year-min').value) || null;
      const maxYear = parseInt(document.getElementById('channel-year-max').value) || null;
      const channels = buildChannelData().filter(c => {
        if (q && !c.name.toLowerCase().includes(q)) return false;
        if (minYear && (!c.firstYear || c.firstYear < minYear)) return false;
        if (maxYear && (!c.firstYear || c.firstYear > maxYear)) return false;
        return true;
      });

      if (currentChannelPage * CHANNELS_PAGE_SIZE < channels.length) {
        currentChannelPage++;
        renderChannelGrid(true);
      }
    }
  }, { rootMargin: '400px' });
  channelScrollObserver.observe(sentinel);
}

function renderChannelGrid(append = false) {
  const q = (document.getElementById('channel-search').value || '').toLowerCase();
  const minYear = parseInt(document.getElementById('channel-year-min').value) || null;
  const maxYear = parseInt(document.getElementById('channel-year-max').value) || null;

  const channels = buildChannelData().filter(c => {
    if (q && !c.name.toLowerCase().includes(q)) return false;
    if (minYear && (!c.firstYear || c.firstYear < minYear)) return false;
    if (maxYear && (!c.firstYear || c.firstYear > maxYear)) return false;
    return true;
  });

  const total = channels.length;
  document.getElementById('channels-count-label').textContent = `${total} channels`;

  if (!append) {
    currentChannelPage = 1;
    document.getElementById('channel-grid').innerHTML = '';
  }

  const start = (currentChannelPage - 1) * CHANNELS_PAGE_SIZE;
  const slice = channels.slice(start, start + CHANNELS_PAGE_SIZE);
  const html = slice.map(c => renderChannelCard(c)).join('');

  const container = document.getElementById('channel-grid');
  if (append) {
    container.insertAdjacentHTML('beforeend', html);
  } else {
    container.innerHTML = html || `<div class="empty">No channels found</div>`;
    setupChannelScrollObserver();
  }

  // Ensure sentinel is at the bottom
  let sentinel = document.getElementById('channel-scroll-sentinel');
  if (!sentinel) {
    sentinel = document.createElement('div');
    sentinel.id = 'channel-scroll-sentinel';
    sentinel.style.height = '10px';
    sentinel.style.width = '100%';
  }
  container.after(sentinel);
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
  const byYearRes = queryDB("SELECT substr(publish_date, 1, 4) as y, COUNT(*) as c FROM videos WHERE channel_name = ? GROUP BY y", [name]);
  const byYear = {};
  byYearRes.forEach(r => byYear[r.y || 'Unknown'] = r.c);
  const years = Object.keys(byYear).sort();

  const statusCountRes = queryDB("SELECT status, COUNT(*) as c FROM videos WHERE channel_name = ? GROUP BY status", [name]);
  const statusCount = {};
  statusCountRes.forEach(r => statusCount[r.status || 'unknown'] = r.c);

  const sortedVideos = queryDB("SELECT * FROM videos WHERE channel_name = ? ORDER BY publish_date ASC", [name]);

  // Build video list HTML
  const videoListHtml = sortedVideos.map(v => {
    const statusClass = v.local_file ? 'status-downloaded' : 'status-available';
    const playAction = v.local_file
      ? `<a class="btn-play" href="${getLocalVideoPath(v)}" target="_blank" title="Play local file">▶</a>`
      : '';

    return `<tr>
      <td class="title-cell"><a href="watch?v=${v.id}" onclick="event.preventDefault(); openVideo('${v.id}')" style="color:var(--text);text-decoration:none">${escHtml(v.title || v.id)}</a></td>
      <td>${fmtDate(v.publish_date)}</td>
      <td title="${v.local_file ? 'downloaded' : 'available'}">${getStatusEmoji(v.local_file ? 'downloaded' : 'available')}</td>
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
      data: { 
        labels: Object.keys(statusCount), 
        datasets: [{ 
          data: Object.values(statusCount), 
          backgroundColor: Object.keys(statusCount).map(s => STATUS_COLORS[s] || '#888') 
        }] 
      },
      options: { ...pieOpts(), plugins: { ...pieOpts().plugins, title: { display: false } } }
    });
  }, 50);
}

// SECTIONS LOGIC REMOVED


// Expose functions to global scope
window.buildChannelData = buildChannelData;
window.renderChannelCard = renderChannelCard;
window.toggleSidebar = toggleSidebar;
window.toggleFilters = toggleFilters;
window.setupChannelScrollObserver = setupChannelScrollObserver;
window.renderChannelGrid = renderChannelGrid;
window.selectChannel = selectChannel;
