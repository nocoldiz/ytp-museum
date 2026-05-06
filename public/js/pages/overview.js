// ─── OVERVIEW CHARTS ──────────────────────────────────────────────────────
const PALETTE = ['#6c63ff', '#ff6584', '#43e97b', '#f7971e', '#38f9d7', '#fa709a', '#fee140', '#30cfd0', '#a18fff', '#ffecd2'];
const STATUS_COLORS = { available: '#43e97b', unavailable: '#ff6584', pending: '#f7971e', unknown: '#888' };

function getStatsDBs() {
  return [window.dbYTP, window.dbYTPMV, window.dbCollabs].filter(db => db);
}

function updateBadges() {
  const dbs = getStatsDBs();
  let totalVideos = 0;
  let totalYears = new Set();

  dbs.forEach(db => {
    const res = queryDBRow("SELECT COUNT(*) as c FROM videos", [], db);
    totalVideos += res.c || 0;
    const years = queryDB("SELECT DISTINCT substr(publish_date, 1, 4) as y FROM videos WHERE publish_date IS NOT NULL", [], db);
    years.forEach(r => totalYears.add(r.y));
  });

  const totalChannels = queryDBRow("SELECT COUNT(*) as c FROM channels", [], window.dbPoopers).c || 0;

  const bV = document.getElementById('badge-videos');
  if (bV) bV.textContent = totalVideos;
  const bC = document.getElementById('badge-channels');
  if (bC) bC.textContent = totalChannels;
  const bY = document.getElementById('badge-years');
  if (bY) bY.textContent = totalYears.size;

  // Re-build overview if we are on the stats page to show data from background-loaded DBs
  const overviewPage = document.getElementById('page-overview');
  if (overviewPage && overviewPage.classList.contains('active')) {
    buildOverview();
    if (window.renderYearGrid) window.renderYearGrid();
  }
}

function buildOverview() {
  const dbs = getStatsDBs();
  const statsContainer = document.getElementById('overview-stats');
  if (dbs.length === 0 && statsContainer) {
    statsContainer.innerHTML = '<div style="padding:40px; text-align:center; width:100%; color:var(--text-muted);">Calcolo statistiche in corso... attendi il caricamento del database (69MB).</div>';
    return;
  }
  
  let combinedStats = {
    total: 0,
    withTitle: 0,
    withViewsCount: 0,
    totalViews: 0,
    totalLikes: 0,
    available: 0
  };

  const yearsMap = {};
  const channelsMap = {};
  const buckets = { '1-100': 0, '100-1K': 0, '1K-10K': 0, '10K-100K': 0, '100K-1M': 0, '1M+': 0 };
  let allTopViews = [];

  dbs.forEach(db => {
    const s = queryDBRow(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN title IS NOT NULL THEN 1 ELSE 0 END) as withTitle,
        SUM(CASE WHEN view_count IS NOT NULL AND view_count > 0 THEN 1 ELSE 0 END) as withViewsCount,
        SUM(view_count) as totalViews,
        SUM(like_count) as totalLikes,
        SUM(CASE WHEN local_file IS NULL THEN 1 ELSE 0 END) as available
      FROM videos
    `, [], db);

    combinedStats.total += s.total || 0;
    combinedStats.withTitle += s.withTitle || 0;
    combinedStats.withViewsCount += s.withViewsCount || 0;
    combinedStats.totalViews += s.totalViews || 0;
    combinedStats.totalLikes += s.totalLikes || 0;
    combinedStats.available += s.available || 0;

    // Years
    queryDB("SELECT substr(publish_date, 1, 4) as y, COUNT(*) as c FROM videos WHERE publish_date IS NOT NULL GROUP BY y", [], db)
      .forEach(r => { yearsMap[r.y] = (yearsMap[r.y] || 0) + r.c; });

    // Channels
    queryDB("SELECT channel_name, COUNT(*) as c FROM videos GROUP BY channel_name", [], db)
      .forEach(r => { channelsMap[r.channel_name] = (channelsMap[r.channel_name] || 0) + r.c; });

    // Distribution (Skipping 0 and NULL)
    const d = queryDBRow(`
      SELECT 
        SUM(CASE WHEN view_count > 0 AND view_count < 100 THEN 1 ELSE 0 END) as v100,
        SUM(CASE WHEN view_count >= 100 AND view_count < 1000 THEN 1 ELSE 0 END) as v1k,
        SUM(CASE WHEN view_count >= 1000 AND view_count < 10000 THEN 1 ELSE 0 END) as v10k,
        SUM(CASE WHEN view_count >= 10000 AND view_count < 100000 THEN 1 ELSE 0 END) as v100k,
        SUM(CASE WHEN view_count >= 100000 AND view_count < 1000000 THEN 1 ELSE 0 END) as v1m,
        SUM(CASE WHEN view_count >= 1000000 THEN 1 ELSE 0 END) as v1mp
      FROM videos
    `, [], db);
    buckets['1-100'] += d.v100 || 0;
    buckets['100-1K'] += d.v1k || 0;
    buckets['1K-10K'] += d.v10k || 0;
    buckets['10K-100K'] += d.v100k || 0;
    buckets['100K-1M'] += d.v1m || 0;
    buckets['1M+'] += d.v1mp || 0;

    // Top Lists (Combined)
    allTopViews = allTopViews.concat(queryDB("SELECT * FROM videos WHERE view_count IS NOT NULL ORDER BY view_count DESC LIMIT 20", [], db));
  });

  const total = combinedStats.total || 1;
  const withTitle = combinedStats.withTitle;
  const withViewsCount = combinedStats.withViewsCount;
  const totalViews = combinedStats.totalViews;
  const totalLikes = combinedStats.totalLikes;
  const available = combinedStats.available;

  const channelsCount = Object.keys(channelsMap).length;

  document.getElementById('overview-stats').innerHTML = [
    { label: 'Total Videos', value: fmtNum(total), sub: `${withTitle} with metadata` },
    { label: 'Unique Channels', value: fmtNum(channelsCount), sub: `across combined databases` },
    { label: 'Total Views', value: fmtBig(totalViews), sub: `${withViewsCount} videos with data` },
    { label: 'Total Likes', value: fmtBig(totalLikes), sub: '' },
    { label: 'Available', value: fmtNum(available), sub: `${Math.round(available / total * 100)}% of archive` },
    { label: 'Avg Views', value: withViewsCount ? fmtBig(Math.round(totalViews / withViewsCount)) : '-', sub: 'per video (w/ data)' },
  ].map(c => `<div class="stat-card"><div class="label">${c.label}</div><div class="value">${c.value}</div><div class="sub">${c.sub}</div></div>`).join('');

  // Top Views Table
  const topViewsMerged = allTopViews.sort((a, b) => b.view_count - a.view_count).slice(0, 15);
  const tableContainer = document.getElementById('top-views-table-container');
  if (topViewsMerged.length > 0 && tableContainer) {
    tableContainer.style.display = 'block';
    document.getElementById('top-views-tbody').innerHTML = topViewsMerged.map((v, i) => `
      <tr>
        <td style="color:var(--text-muted)">${i + 1}</td>
        <td><a href="#" onclick="openVideo('${v.id}'); return false;" style="color:var(--text); font-weight: 500;">${escHtml(v.title || v.id)}</a></td>
        <td><a href="#" onclick="showProfile('${escHtml(v.channel_name)}'); return false;" style="color:var(--accent); font-size: 13px;">${escHtml(v.channel_name)}</a></td>
        <td class="num" style="font-weight: 600;">${fmtNum(v.view_count)}</td>
        <td class="num" style="color:var(--text-muted);">${fmtNum(v.like_count)}</td>
      </tr>`).join('');
  }

  // Videos by year
  const sortedYears = Object.keys(yearsMap).sort();
  const datedTotal = Object.values(yearsMap).reduce((a, b) => a + b, 0);
  const noDateCount = Math.max(0, combinedStats.total - datedTotal);

  const chartHeader = document.querySelector('#page-overview .chart-card.box .box-header');
  if (chartHeader) {
    chartHeader.textContent = `Videos by Year (${fmtNum(noDateCount)} video${noDateCount !== 1 ? 's' : ''} with no date)`;
  }

  makeChart('chart-year', 'bar', sortedYears, [{
    label: 'Videos', data: sortedYears.map(y => yearsMap[y]),
    backgroundColor: sortedYears.map((_, i) => PALETTE[i % PALETTE.length] + 'bb'),
    borderRadius: 6
  }], chartOpts(''));

  // Views distribution (Combined & Filtered)
  makeChart('chart-views-dist', 'doughnut', Object.keys(buckets), [{
    data: Object.values(buckets),
    backgroundColor: PALETTE, borderWidth: 0
  }], pieOpts());
}

// Expose functions to global scope
window.updateBadges = updateBadges;
window.buildOverview = buildOverview;
