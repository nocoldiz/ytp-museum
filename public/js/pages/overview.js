// ─── OVERVIEW CHARTS ──────────────────────────────────────────────────────
const PALETTE = ['#6c63ff', '#ff6584', '#43e97b', '#f7971e', '#38f9d7', '#fa709a', '#fee140', '#30cfd0', '#a18fff', '#ffecd2'];
const STATUS_COLORS = { available: '#43e97b', unavailable: '#ff6584', pending: '#f7971e', unknown: '#888' };

function updateBadges() {
  const totalVideos = queryDBRow("SELECT COUNT(*) as c FROM videos", [], dbYTP).c || 0;
  const totalSources = queryDBRow("SELECT COUNT(*) as c FROM videos", [], dbSources).c || 0;
  const totalYTPMV = queryDBRow("SELECT COUNT(*) as c FROM videos", [], dbYTPMV).c || 0;
  const totalCollabs = queryDBRow("SELECT COUNT(*) as c FROM videos", [], dbCollabs).c || 0;
  const totalChannels = queryDBRow("SELECT COUNT(*) as c FROM channels", [], dbPoopers).c || 0;
  const totalYears = queryDBRow("SELECT COUNT(DISTINCT substr(publish_date, 1, 4)) as c FROM videos WHERE publish_date IS NOT NULL").c || 0;

  const bV = document.getElementById('badge-videos');
  if (bV) bV.textContent = totalVideos;
  const bS = document.getElementById('badge-sources');
  if (bS) bS.textContent = totalSources;
  const bC = document.getElementById('badge-channels');
  if (bC) bC.textContent = totalChannels;
  const bY = document.getElementById('badge-years');
  if (bY) bY.textContent = totalYears;
}

function buildOverview() {
  const stats = queryDBRow(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN title IS NOT NULL THEN 1 ELSE 0 END) as withTitle,
      SUM(CASE WHEN view_count IS NOT NULL THEN 1 ELSE 0 END) as withViewsCount,
      SUM(view_count) as totalViews,
      SUM(like_count) as totalLikes,
      SUM(CASE WHEN local_file IS NULL THEN 1 ELSE 0 END) as available
    FROM videos
  `);

  const total = stats.total || 1;
  const withTitle = stats.withTitle || 0;
  const withViewsCount = stats.withViewsCount || 0;
  const totalViews = stats.totalViews || 0;
  const totalLikes = stats.totalLikes || 0;
  const available = stats.available || 0;

  const channelsCount = queryDBRow("SELECT COUNT(DISTINCT channel_name) as c FROM videos").c || 0;
  const sectionsCount = queryDBRow("SELECT COUNT(*) as c FROM sections").c || 0;

  document.getElementById('overview-stats').innerHTML = [
    { label: 'Total Videos', value: fmtNum(total), sub: `${withTitle} with metadata` },
    { label: 'Unique Channels', value: fmtNum(channelsCount), sub: `across archive` },
    { label: 'Total Views', value: fmtBig(totalViews), sub: `${withViewsCount} videos with data` },
    { label: 'Total Likes', value: fmtBig(totalLikes), sub: '' },
    { label: 'Available', value: fmtNum(available), sub: `${Math.round(available / total * 100)}% of archive` },
    { label: 'Avg Views', value: withViewsCount ? fmtBig(Math.round(totalViews / withViewsCount)) : '-', sub: 'per video (w/ data)' },
  ].map(c => `<div class="stat-card"><div class="label">${c.label}</div><div class="value">${c.value}</div><div class="sub">${c.sub}</div></div>`).join('');

  // Videos by year
  const yearRes = queryDB("SELECT substr(publish_date, 1, 4) as y, COUNT(*) as c FROM videos WHERE publish_date IS NOT NULL GROUP BY y ORDER BY y ASC");
  const years = yearRes.map(r => r.y);
  makeChart('chart-year', 'bar', years, [{
    label: 'Videos', data: yearRes.map(r => r.c),
    backgroundColor: years.map((_, i) => PALETTE[i % PALETTE.length] + 'bb'),
    borderRadius: 6
  }], chartOpts(''));

  // Status doughnut
  const statusRes = queryDB("SELECT (CASE WHEN local_file IS NOT NULL THEN 'downloaded' ELSE 'available' END) as status, COUNT(*) as c FROM videos GROUP BY status");
  const statusLabels = statusRes.map(r => r.status || 'unknown');
  makeChart('chart-status', 'doughnut',
    statusLabels,
    [{ data: statusRes.map(r => r.c), backgroundColor: statusLabels.map(s => STATUS_COLORS[s] || '#888'), borderWidth: 0 }],
    pieOpts());

  // Top channels
  const topChRes = queryDB("SELECT channel_name, COUNT(*) as c FROM videos GROUP BY channel_name ORDER BY c DESC LIMIT 15");
  makeChart('chart-top-channels', 'bar', topChRes.map(c => c.channel_name), [{
    label: 'Videos', data: topChRes.map(c => c.c),
    backgroundColor: PALETTE[0] + 'bb', borderRadius: 4
  }], { ...chartOpts(''), indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: gridScales().x, y: { ...gridScales().y, ticks: { color: '#8892b0', font: { size: 10 } } } } });

  // Sections bar
  const topSecRes = queryDB("SELECT s.name, COUNT(*) as c FROM sections s JOIN video_sections vs ON s.id = vs.section_id JOIN videos v ON vs.video_id = v.id GROUP BY s.name ORDER BY c DESC");
  makeChart('chart-sections', 'bar', topSecRes.map(s => s.name), [{
    label: 'Videos', data: topSecRes.map(s => s.c),
    backgroundColor: PALETTE[1] + 'bb', borderRadius: 4
  }], { ...chartOpts(''), indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: gridScales().x, y: { ...gridScales().y, ticks: { color: '#8892b0', font: { size: 10 } } } } });

  // Views distribution
  const distRes = queryDBRow(`
    SELECT 
      SUM(CASE WHEN view_count IS NULL THEN 1 ELSE 0 END) as v0,
      SUM(CASE WHEN view_count < 100 THEN 1 ELSE 0 END) as v100,
      SUM(CASE WHEN view_count >= 100 AND view_count < 1000 THEN 1 ELSE 0 END) as v1k,
      SUM(CASE WHEN view_count >= 1000 AND view_count < 10000 THEN 1 ELSE 0 END) as v10k,
      SUM(CASE WHEN view_count >= 10000 AND view_count < 100000 THEN 1 ELSE 0 END) as v100k,
      SUM(CASE WHEN view_count >= 100000 AND view_count < 1000000 THEN 1 ELSE 0 END) as v1m,
      SUM(CASE WHEN view_count >= 1000000 THEN 1 ELSE 0 END) as v1mp
    FROM videos
  `);
  const buckets = { '0': distRes.v0, '1-100': distRes.v100, '100-1K': distRes.v1k, '1K-10K': distRes.v10k, '10K-100K': distRes.v100k, '100K-1M': distRes.v1m, '1M+': distRes.v1mp };

  makeChart('chart-views-dist', 'doughnut', Object.keys(buckets), [{
    data: Object.values(buckets),
    backgroundColor: PALETTE, borderWidth: 0
  }], pieOpts());

  // Top by views
  const topViews = queryDB("SELECT * FROM videos WHERE view_count IS NOT NULL ORDER BY view_count DESC LIMIT 10");
  if (topViews.length > 0) {
    makeChart('chart-top-views', 'bar',
      topViews.map(v => (v.title || v.id).slice(0, 25) + '…'),
      [{ label: 'Views', data: topViews.map(v => v.view_count), backgroundColor: PALETTE[2] + 'bb', borderRadius: 4 }],
      { ...chartOpts(''), indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { ...gridScales().x, ticks: { callback: v => fmtBig(v), color: '#8892b0' } }, y: { ...gridScales().y, ticks: { color: '#8892b0', font: { size: 9 } } } } });
  }

  // Top by likes
  const topLikes = queryDB("SELECT * FROM videos WHERE like_count IS NOT NULL ORDER BY like_count DESC LIMIT 10");
  if (topLikes.length > 0) {
    makeChart('chart-top-likes', 'bar',
      topLikes.map(v => (v.title || v.id).slice(0, 25) + '…'),
      [{ label: 'Likes', data: topLikes.map(v => v.like_count), backgroundColor: PALETTE[3] + 'bb', borderRadius: 4 }],
      { ...chartOpts(''), indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { ...gridScales().x, ticks: { callback: v => fmtBig(v), color: '#8892b0' } }, y: { ...gridScales().y, ticks: { color: '#8892b0', font: { size: 9 } } } } });
  }
}


// Expose functions to global scope
window.updateBadges = updateBadges;
window.buildOverview = buildOverview;
