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
  const sectionsRes = getSectionsList(isSource, window.dbYTP, window.dbSources);

  const sections = sectionsRes.map(r => r.name === 'Scraped Channel' ? 'Youtube' : r.name);
  const secHtml = '<option value="">All Sections</option>' + [...new Set(sections)].map(s => `<option value="${s}">${s}</option>`).join('');
  if (sectionSel) sectionSel.innerHTML = secHtml;
  if (sectionSelSearch) sectionSelSearch.innerHTML = secHtml;

  // 2. Build Channels
  const channelsRes = getChannelsList(isSource, window.dbYTP, window.dbSources);
  if (channelDatalist) {
    channelDatalist.innerHTML = channelsRes.map(r => `<option value="${escAttr(r.channel_name)}">`).join('');
  }

  // 3. Build Years
  const yearsRes = getYearsList(isSource, window.dbYTP, window.dbSources);
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
