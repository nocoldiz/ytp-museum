// ─── YEARS ────────────────────────────────────────────────────────────────
let selectedYear = null;

function buildYearData() {
  const sql = `
    SELECT 
      substr(publish_date, 1, 4) as year, 
      COUNT(*) as videoCount, 
      SUM(view_count) as totalViews, 
      SUM(like_count) as totalLikes
    FROM videos 
    WHERE publish_date IS NOT NULL AND CAST(substr(publish_date, 1, 4) AS INTEGER) <= ?
    GROUP BY year 
    ORDER BY year ASC
  `;
  const res = queryDB(sql, [globalMaxYear]);
  return res.map(r => ({
    ...r,
    videos: { length: r.videoCount } // Mock for backward compatibility
  }));
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

  const videosRes = queryDB("SELECT * FROM videos WHERE substr(publish_date, 1, 4) = ?", [year]);
  const videos = videosRes;

  // Most prolific creator
  const topCreatorsRes = queryDB("SELECT channel_name, COUNT(*) as c FROM videos WHERE substr(publish_date, 1, 4) = ? GROUP BY channel_name ORDER BY c DESC LIMIT 10", [year]);
  const topCreators = topCreatorsRes.map(r => [r.channel_name, r.c]);
  const topCreator = topCreators[0];

  // Tag frequency
  const tagCountsRes = queryDB(`
    SELECT t.name, COUNT(*) as c 
    FROM tags t 
    JOIN video_tags vt ON t.id = vt.tag_id 
    JOIN videos v ON vt.video_id = v.id 
    WHERE substr(v.publish_date, 1, 4) = ? 
    GROUP BY t.name 
    ORDER BY c DESC 
    LIMIT 60
  `, [year]);
  const TAG_BLOCKLIST = new Set(["poop", "youtube", "ytp", "ita", "merda", "youtube merda", "ytp ita", "ytpmv", "youtube merda"]);
  const topTags = tagCountsRes.filter(r => !TAG_BLOCKLIST.has(r.name.toLowerCase())).map(r => [r.name, r.c]);

  // Status counts
  const statusCountRes = queryDB("SELECT (CASE WHEN local_file IS NOT NULL THEN 'downloaded' ELSE 'available' END) as status, COUNT(*) as c FROM videos WHERE (CAST(substr(publish_date, 1, 4) AS INTEGER) = ?) GROUP BY status", [year]);
  const statusCount = {};
  statusCountRes.forEach(r => statusCount[r.status] = r.c);

  // Monthly breakdown
  const byMonthRes = queryDB("SELECT substr(publish_date, 6, 2) as m, COUNT(*) as c FROM videos WHERE substr(publish_date, 1, 4) = ? GROUP BY m", [year]);
  const byMonth = Array(12).fill(0);
  byMonthRes.forEach(r => {
    const m = parseInt(r.m, 10);
    if (m >= 1 && m <= 12) byMonth[m - 1] = r.c;
  });
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // Top videos by views & likes
  const allByViews = queryDB("SELECT * FROM videos WHERE substr(publish_date, 1, 4) = ? AND view_count IS NOT NULL ORDER BY view_count DESC", [year]);
  const allByLikes = queryDB("SELECT * FROM videos WHERE substr(publish_date, 1, 4) = ? AND like_count IS NOT NULL ORDER BY like_count DESC", [year]);
  window._yrViews = allByViews;
  window._yrLikes = allByLikes;
  const topByViews = allByViews.slice(0, 5);
  const topByLikes = allByLikes.slice(0, 5);

  // Unique channels
  const uniqCh = queryDBRow("SELECT COUNT(DISTINCT channel_name) as c FROM videos WHERE substr(publish_date, 1, 4) = ?", [year]).c || 0;

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


// Expose functions to global scope
window.buildYearData = buildYearData;
window.renderYearGrid = renderYearGrid;
window.selectYear = selectYear;
window.yrTableRows = yrTableRows;
window.expandYearTable = expandYearTable;
