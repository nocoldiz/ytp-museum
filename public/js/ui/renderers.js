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

  const isSource = appMode === 'sources' ? 1 : 0;

  // 1. Build Sections
  const sectionsRes = queryDB(`
    SELECT DISTINCT s.name 
    FROM sections s
    JOIN video_sections vs ON s.id = vs.section_id
    JOIN videos v ON vs.video_id = v.id
    WHERE 1=1
    ORDER BY s.name ASC
  `, [], isSource ? dbSources : dbYTP);

  const sections = sectionsRes.map(r => r.name === 'Scraped Channel' ? 'Youtube' : r.name);
  const secHtml = '<option value="">All Sections</option>' + [...new Set(sections)].map(s => `<option value="${s}">${s}</option>`).join('');
  if (sectionSel) sectionSel.innerHTML = secHtml;
  if (sectionSelSearch) sectionSelSearch.innerHTML = secHtml;

  // 2. Build Channels
  const channelsRes = queryDB("SELECT DISTINCT channel_name FROM videos WHERE channel_name IS NOT NULL AND channel_name != '' ORDER BY channel_name ASC", [], isSource ? dbSources : dbYTP);
  if (channelDatalist) {
    channelDatalist.innerHTML = channelsRes.map(r => `<option value="${escAttr(r.channel_name)}">`).join('');
  }

  // 3. Build Years
  const yearsRes = queryDB("SELECT DISTINCT substr(publish_date, 1, 4) as y FROM videos WHERE publish_date IS NOT NULL ORDER BY y ASC", [], isSource ? dbSources : dbYTP);
  const years = yearsRes.map(r => r.y);

  const minYearHtml = '<option value="">Min</option>' + years.map(y => `<option value="${y}">${y}</option>`).join('');
  const maxYearHtml = '<option value="">Max</option>' + years.map(y => `<option value="${y}">${y}</option>`).join('');

  if (yearMinSel) yearMinSel.innerHTML = minYearHtml;
  if (yearMaxSel) yearMaxSel.innerHTML = maxYearHtml;
  if (yearMinSelSearch) yearMinSelSearch.innerHTML = minYearHtml;
  if (yearMaxSelSearch) yearMaxSelSearch.innerHTML = maxYearHtml;
}

// Expose functions to global scope
window.buildFilterOptions = buildFilterOptions;
