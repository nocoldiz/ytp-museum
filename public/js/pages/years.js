// ─── YEARS ────────────────────────────────────────────────────────────────
let selectedYear = null;

function getStatsDBs() {
  return [window.dbYTP, window.dbYTPMV, window.dbCollabs].filter(db => db);
}

function buildYearData() {
  const dbs = getStatsDBs();
  const yearsMap = {};

  const sql = `
    SELECT 
      substr(publish_date, 1, 4) as year, 
      COUNT(*) as videoCount, 
      SUM(view_count) as totalViews, 
      SUM(like_count) as totalLikes
    FROM videos 
    WHERE publish_date IS NOT NULL AND CAST(substr(publish_date, 1, 4) AS INTEGER) <= ?
    GROUP BY year 
  `;

  dbs.forEach(db => {
    const res = queryDB(sql, [globalMaxYear], db);
    res.forEach(r => {
      if (!yearsMap[r.year]) {
        yearsMap[r.year] = { year: r.year, videoCount: 0, totalViews: 0, totalLikes: 0 };
      }
      yearsMap[r.year].videoCount += r.videoCount || 0;
      yearsMap[r.year].totalViews += r.totalViews || 0;
      yearsMap[r.year].totalLikes += r.totalLikes || 0;
    });
  });

  return Object.keys(yearsMap).sort().map(y => ({
    ...yearsMap[y],
    videos: { length: yearsMap[y].videoCount }
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
  selectedYear = year;
  const modal = document.getElementById('year-modal');
  const modalBody = document.getElementById('year-modal-body');
  if (!modal || !modalBody) return;

  const allYears = buildYearData();
  const yd = allYears.find(y => y.year === year);
  if (!yd) return;

  const dbs = getStatsDBs();
  const creatorsMap = {};
  const tagsMap = {};
  const byMonth = Array(12).fill(0);
  let allByViews = [];
  let allByLikes = [];

  dbs.forEach(db => {
    // Creators
    queryDB("SELECT channel_name, COUNT(*) as c FROM videos WHERE substr(publish_date, 1, 4) = ? GROUP BY channel_name", [year], db)
      .forEach(r => { creatorsMap[r.channel_name] = (creatorsMap[r.channel_name] || 0) + r.c; });

    // Tags
    queryDB(`
      SELECT t.name, COUNT(*) as c 
      FROM tags t 
      JOIN video_tags vt ON t.id = vt.tag_id 
      JOIN videos v ON vt.video_id = v.id 
      WHERE substr(v.publish_date, 1, 4) = ? 
      GROUP BY t.name
    `, [year], db).forEach(r => { tagsMap[r.name] = (tagsMap[r.name] || 0) + r.c; });

    // Monthly
    queryDB("SELECT substr(publish_date, 6, 2) as m, COUNT(*) as c FROM videos WHERE substr(publish_date, 1, 4) = ? GROUP BY m", [year], db)
      .forEach(r => {
        const m = parseInt(r.m, 10);
        if (m >= 1 && m <= 12) byMonth[m - 1] += r.c;
      });

    // Top Lists
    allByViews = allByViews.concat(queryDB("SELECT * FROM videos WHERE substr(publish_date, 1, 4) = ? AND view_count IS NOT NULL ORDER BY view_count DESC LIMIT 20", [year], db));
    allByLikes = allByLikes.concat(queryDB("SELECT * FROM videos WHERE substr(publish_date, 1, 4) = ? AND like_count IS NOT NULL ORDER BY like_count DESC LIMIT 20", [year], db));
  });

  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  
  const TAG_BLOCKLIST = new Set(["poop", "youtube", "ytp", "ita", "merda", "youtube merda", "ytp ita", "ytpmv", "youtube merda"]);
  const topTags = Object.entries(tagsMap)
    .filter(([name]) => !TAG_BLOCKLIST.has(name.toLowerCase()))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 60);

  const topCreators = Object.entries(creatorsMap).sort((a, b) => b[1] - a[1]);

  allByViews.sort((a, b) => b.view_count - a.view_count);
  allByLikes.sort((a, b) => b.like_count - a.like_count);
  
  window._yrViews = allByViews;
  window._yrLikes = allByLikes;
  const topByViews = allByViews.slice(0, 5);
  const topByLikes = allByLikes.slice(0, 15);

  const uniqCh = Object.keys(creatorsMap).length;

  modal.style.display = 'flex';
  modalBody.innerHTML = `
  <div class="year-detail">
    <div class="year-detail-header" style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border); padding-bottom: 15px; margin-bottom: 20px;">
      <h2 style="margin:0; font-size: 2rem; color: var(--accent);">${year} Archive</h2>
      <button class="close-btn" onclick="document.getElementById('year-modal').style.display='none'" style="background: none; border: none; color: var(--text-muted); font-size: 24px; cursor: pointer;">✕</button>
    </div>
    
    <div class="year-kpis" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px; margin-bottom: 30px;">
      <div class="year-kpi"><span class="kv">${yd.videos.length}</span><span class="kl">Videos</span></div>
      <div class="year-kpi"><span class="kv">${fmtBig(yd.totalViews)}</span><span class="kl">Total Views</span></div>
      <div class="year-kpi"><span class="kv">${fmtBig(yd.totalLikes)}</span><span class="kl">Total Likes</span></div>
      <div class="year-kpi"><span class="kv">${uniqCh}</span><span class="kl">Channels</span></div>
    </div>

    <div class="year-charts-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px;">
      <div class="chart-card box">
        <div class="box-header">Videos per Month</div>
        <div class="box-content"><canvas id="yr-month-chart" style="max-height:200px"></canvas></div>
      </div>
      <div class="chart-card box">
        <div class="box-header">Top Creators</div>
        <div class="box-content"><canvas id="yr-creators-chart" style="max-height:200px"></canvas></div>
      </div>
    </div>

    ${topTags.length ? `
    <div class="chart-card box" style="margin-bottom:30px">
      <div class="box-header">Tag Cloud <span style="font-size:.75rem;color:var(--text-muted);text-transform:none;letter-spacing:0">(${topTags.length} unique tags)</span></div>
      <div class="box-content">
        <div class="tag-cloud-wrap" id="yr-tag-cloud"></div>
      </div>
    </div>` : ''}

    <div class="box" style="margin-bottom:30px">
      <div class="box-header">Top by Likes of ${year}</div>
      <div class="box-content">
        <div class="table-wrap">
          <table style="width:100%">
            <thead><tr><th>#</th><th>Title</th><th>Channel</th><th>Likes</th><th>Views</th></tr></thead>
            <tbody id="yr-likes-tbody">
              ${topByLikes.map((v, i) => `
                <tr>
                  <td style="color:var(--text-muted)">${i + 1}</td>
                  <td><a href="#" onclick="openVideo('${v.id}'); return false;" style="color:var(--text); text-decoration:none; font-weight:500;">${escHtml(v.title || v.id)}</a></td>
                  <td><a href="#" onclick="showProfile('${escHtml(v.channel_name)}'); return false;" style="color:var(--accent); font-size:0.9rem;">${escHtml(v.channel_name)}</a></td>
                  <td class="num" style="font-weight:bold">${fmtNum(v.like_count)}</td>
                  <td class="num" style="color:var(--text-muted)">${fmtNum(v.view_count)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <div class="box">
      <div class="box-header">Top by Views of ${year}</div>
      <div class="box-content">
        <div class="table-wrap">
          <table style="width:100%">
            <thead><tr><th>#</th><th>Title</th><th>Channel</th><th>Views</th></tr></thead>
            <tbody id="yr-views-tbody">
              ${topByViews.map((v, i) => `
                <tr>
                  <td style="color:var(--text-muted)">${i + 1}</td>
                  <td><a href="#" onclick="openVideo('${v.id}'); return false;" style="color:var(--text); text-decoration:none; font-weight:500;">${escHtml(v.title || v.id)}</a></td>
                  <td><a href="#" onclick="showProfile('${escHtml(v.channel_name)}'); return false;" style="color:var(--accent); font-size:0.9rem;">${escHtml(v.channel_name)}</a></td>
                  <td class="num" style="font-weight:bold">${fmtNum(v.view_count)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>`;

  setTimeout(() => {
    destroyChart('yr-month'); destroyChart('yr-creators');

    charts['yr-month'] = new Chart(document.getElementById('yr-month-chart'), {
      type: 'bar',
      data: { labels: MONTHS, datasets: [{ label: 'Videos', data: byMonth, backgroundColor: PALETTE[2] + 'cc', borderRadius: 5 }] },
      options: chartOpts('')
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
