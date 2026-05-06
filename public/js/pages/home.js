// ─── FILTERS + TABLE ──────────────────────────────────────────────────────
let sortField = 'publish_date';
let sortDir = 1;
let scrollObserver = null;
window.viewMode = 'table';
window.searchViewMode = 'list';
let showVideoEmbed = false;

function setViewMode(mode) {
  window.viewMode = mode;
  document.getElementById('btn-view-table').classList.toggle('active', mode === 'table');
  document.getElementById('btn-view-grid').classList.toggle('active', mode === 'grid');
  document.getElementById('video-table-wrap').style.display = mode === 'table' ? 'block' : 'none';
  document.getElementById('video-grid').style.display = mode === 'grid' ? 'grid' : 'none';
  renderTable(false);
}

function setSearchViewMode(mode) {
  window.searchViewMode = mode;
  const btnList = document.getElementById('btn-search-view-list');
  const btnGrid = document.getElementById('btn-search-view-grid');
  const btnListOld = document.getElementById('btn-search-view-list-old');
  const btnGridOld = document.getElementById('btn-search-view-grid-old');

  if (btnList) btnList.classList.toggle('active', mode === 'list');
  if (btnGrid) btnGrid.classList.toggle('active', mode === 'grid');
  if (btnListOld) btnListOld.classList.toggle('active', mode === 'list');
  if (btnGridOld) btnGridOld.classList.toggle('active', mode === 'grid');

  const q = document.getElementById('global-search-input').value.trim();
  if (q) performSearch(q);
}

function loadFacade(id) {
  const el = document.getElementById('facade-' + id);
  if (!el) return;

  const currentData = appMode === 'sources' ? allSources : allVideos;
  const v = currentData.find(x => x.id === id);

  if (v && v.local_file) {
    const src = getLocalVideoPath(v);
    el.innerHTML = `<video controls autoplay style="width:100%; height:100%; object-fit:contain; background:#000;">
      <source src="${src}" type="video/mp4">
      Your browser does not support the video tag.
    </video>`;
  } else {
    el.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${id}?autoplay=1" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
  }
}

function applyFilters() {
  const q = document.getElementById('search-input').value.trim();
  const section = document.getElementById('filter-section').value;
  const channel = document.getElementById('filter-channel').value;
  const viewsMin = parseInt(document.getElementById('filter-views-min').value) || 0;
  const likesMin = parseInt(document.getElementById('filter-likes-min').value) || 0;
  const yearMin = document.getElementById('filter-year-min').value;
  const yearMax = document.getElementById('filter-year-max').value;
  const langSelect = document.getElementById('filter-language');
  const selectedLangs = Array.from(langSelect.selectedOptions).map(opt => opt.value.toLowerCase());

  const isSource = appMode === 'sources' ? 1 : 0;
  const hideEmpty = document.getElementById('filter-hide-empty') ? document.getElementById('filter-hide-empty').checked : false;
  const excludeYTP = document.getElementById('filter-exclude-ytp') ? document.getElementById('filter-exclude-ytp').checked : false;
  showVideoEmbed = document.getElementById('filter-show-embed') ? document.getElementById('filter-show-embed').checked : false;

  let whereClauses = ["(title IS NOT NULL AND title != '')"];
  let params = [];

  if (q) {
    const { clause: searchClause, params: searchParams } = buildSearchClause(q, false);
    whereClauses.push(searchClause);
    params.push(...searchParams);
  }

  // status filter removed

  if (section) {
    whereClauses.push("id IN (SELECT video_id FROM video_sections vs JOIN sections s ON vs.section_id = s.id WHERE s.name = ?)");
    params.push(section);
  }

  if (channel) {
    whereClauses.push("channel_name = ?");
    params.push(channel);
  }

  if (viewsMin) {
    whereClauses.push("view_count >= ?");
    params.push(viewsMin);
  }

  if (likesMin) {
    whereClauses.push("like_count >= ?");
    params.push(likesMin);
  }

  if (yearMin) {
    whereClauses.push("CAST(substr(publish_date, 1, 4) AS INTEGER) >= ?");
    params.push(yearMin);
  }

  if (yearMax) {
    whereClauses.push("CAST(substr(publish_date, 1, 4) AS INTEGER) <= ?");
    params.push(yearMax);
  }

  if (selectedLangs.length > 0 && !selectedLangs.includes("any")) {
    whereClauses.push("language IN (" + selectedLangs.map(() => "?").join(",") + ")");
    params.push(...selectedLangs);
  }

  if (hideEmpty) {
    whereClauses.push("(title IS NOT NULL OR view_count > 0 OR publish_date IS NOT NULL)");
  }

  if (excludeYTP) {
    const ytpKeywords = ["YTP", "YTPMV", "Collab", "Youtube poop", "Poop", "RYTP", "РУТП"];
    whereClauses.push("NOT (" + ytpKeywords.map(() => "title LIKE ?").join(" OR ") + ")");
    ytpKeywords.forEach(k => params.push(`%${k}%`));
  }

  // Global year limit
  whereClauses.push("(CAST(substr(publish_date, 1, 4) AS INTEGER) <= ? OR publish_date IS NULL)");
  params.push(globalMaxYear);

  const filterKey = JSON.stringify({ whereClauses, params, sortField, sortDir, appMode });
  if (queryCache.has(filterKey)) {
    filteredVideos = queryCache.get(filterKey);
  } else {
    if (!window.dbYTP && appMode === 'videos') {
      document.getElementById('videos-count-label').textContent = "Loading database... please wait";
      const tbody = document.getElementById('video-tbody');
      const grid = document.getElementById('video-grid');
      if (tbody) tbody.innerHTML = '<tr><td colspan="7" class="empty">Database downloading...</td></tr>';
      if (grid) grid.innerHTML = '<div class="empty" style="grid-column:1/-1">Database downloading...</div>';
      return;
    }

    let sql = "SELECT * FROM videos WHERE " + whereClauses.join(" AND ");
    console.log("[Manager Search] SQL:", sql, "Params:", params);

    // Sorting
    const sortMap = {
      'publish_date': 'publish_date',
      'title': 'title',
      'channel_name': 'channel_name',
      'view_count': 'view_count',
      'like_count': 'like_count',
      'language': 'language'
    };
    const orderCol = sortMap[sortField] || 'publish_date';
    sql += ` ORDER BY ${orderCol} ${sortDir === 1 ? 'ASC' : 'DESC'}`;

    filteredVideos = queryDB(sql, params);
    queryCache.set(filterKey, filteredVideos);
  }

  currentPage = 1;
  renderTable(false);
  setupScrollObserver();
}

function sortTable(field) {
  if (sortField === field) sortDir *= -1;
  else { sortField = field; sortDir = 1; }

  // Update header UI
  document.querySelectorAll('#video-table th').forEach(th => {
    th.classList.remove('sorted');
    const arrow = th.querySelector('.sort-arrow');
    if (arrow) arrow.textContent = '↕';
  });
  const th = document.querySelector(`#video-table th[data-field="${field}"]`);
  if (th) {
    th.classList.add('sorted');
    const arrow = th.querySelector('.sort-arrow');
    if (arrow) arrow.textContent = sortDir === 1 ? '↓' : '↑';
  }

  filteredVideos.sort((a, b) => {
    let av = a[sortField] || '';
    let bv = b[sortField] || '';
    if (typeof av === 'string') av = av.toLowerCase();
    if (typeof bv === 'string') bv = bv.toLowerCase();
    if (av > bv) return sortDir;
    if (av < bv) return -sortDir;
    return 0;
  });

  currentPage = 1;
  renderTable(false);
}

function setupScrollObserver() {
  if (scrollObserver) scrollObserver.disconnect();
  const sentinel = document.getElementById('scroll-sentinel');
  if (!sentinel) return;

  scrollObserver = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting) {
      if (currentPage * PAGE_SIZE < filteredVideos.length) {
        currentPage++;
        renderTable(true);
      }
    }
  }, { rootMargin: '200px' });

  scrollObserver.observe(sentinel);
}

function getEmbedHtml(v) {
  const isDownloaded = v.local_file;
  if (isDownloaded) {
    const localPath = getLocalVideoPath(v);
    return `<video controls preload="metadata" style="width:240px; aspect-ratio:16/9; display:block; margin-top:8px; border-radius:4px; background:#000;">
            <source src="${localPath}" type="video/mp4">
            Your browser does not support the video tag.
        </video>`;
  } else {
    return `<iframe src="https://www.youtube-nocookie.com/embed/${v.id}" 
            style="width:240px; aspect-ratio:16/9; display:block; margin-top:8px; border-radius:4px; border:none;" 
            allowfullscreen></iframe>`;
  }
}

function renderTable(append = false) {
  const tbody = document.getElementById('video-tbody');
  const grid = document.getElementById('video-grid');
  const total = filteredVideos.length;
  document.getElementById('videos-count-label').textContent = `${total} ${appMode === 'sources' ? 'sources' : 'videos'}`;

  const start = (currentPage - 1) * PAGE_SIZE;
  const slice = filteredVideos.slice(start, start + PAGE_SIZE);

  if (window.viewMode === 'table') {
    const html = slice.map(v => {
      const statusClass = v.local_file ? 'status-downloaded' : 'status-available';

      const ytpifHtml = (v.source_pages || [])
        .filter(sp => !sp.includes('channel_scrape'))
        .map((sp, i) => {
          const path = 'https://raw.githubusercontent.com/nocoldiz/ytpbackup/main/site_mirror/' + sp.replace(/\\/g, '/');
          const label = (v.thread_titles || [])[i] || sp;
          return `<a class="btn-play" href="${path}" onclick="event.stopPropagation(); downloadFile('${path}', '${escAttr(label)}.html'); return false;" title="Download Forum Source: ${escHtml(label)}" style="background:var(--accent2); margin-left: 4px; font-size: 10px; padding: 2px 5px;">YTPIF</a>`;
        }).join('');

      // Determine the title to display, falling back to the first thread title if v.title is missing
      const fallbackTitle = (v.thread_titles && v.thread_titles[0]) ? v.thread_titles[0] : null;
      let titleContent = v.title
        ? `<a href="watch?v=${v.id}" onclick="event.preventDefault(); openVideo('${v.id}')">${escHtml(v.title)}</a>`
        : (fallbackTitle ? `<a href="watch?v=${v.id}" onclick="event.preventDefault(); openVideo('${v.id}')"><em>${escHtml(fallbackTitle)}</em></a>` : `<span class="vid-id">${v.id}</span>`);

      // Add embed if requested
      if (showVideoEmbed) {
        titleContent += getEmbedHtml(v);
      }

      const playAction = v.local_file
        ? `<a class="btn-play" href="${getLocalVideoPath(v)}" target="_blank" title="Play local file">▶</a>`
        : '';

      const checkbox = isServerMode
        ? `<td onclick="event.stopPropagation();"><input type="checkbox" class="manage-check" data-id="${v.id}" onchange="updateManagementVisibility()"></td>`
        : '';

      return `<tr>
          ${checkbox}
          <td class="title-cell" data-label="Title">
            ${titleContent}
            <div class="vid-id">${v.id}</div>
          </td>
          <td data-label="Channel">
            ${v.channel_name ? `
              <div style="display:flex; align-items:center; gap:8px;">
                <img src="${getChannelAvatar(v.channel_name)}" style="width:24px; height:24px; border-radius:50%; object-fit:cover;">
                <a href="${v.channel_url || '#'}" target="_blank" onclick="event.stopPropagation();" style="color:var(--text-muted);text-decoration:none">${escHtml(v.channel_name)}</a>
              </div>
            ` : '-'}
          </td>
          <td data-label="Date">${fmtDate(v.publish_date)}</td>
          <td data-label="Lang" title="${v.language || '-'}">${getLanguageFlag(v.language)}</td>
          <td class="num" data-label="Views">${fmtNum(v.view_count)}</td>
          <td class="num" data-label="Likes">${fmtNum(v.like_count)}</td>
          <td data-label="Actions" onclick="event.stopPropagation();">${playAction} <a class="btn-yt" href="${v.url || `https://www.youtube.com/watch?v=${v.id}`}" target="_blank" rel="noopener noreferrer">YT</a>${ytpifHtml}</td>
        </tr>`;
    }).join('') || (append ? '' : `<tr><td colspan="7" class="empty">No videos match your filters</td></tr>`);

    if (append) {
      tbody.insertAdjacentHTML('beforeend', html);
    } else {
      tbody.innerHTML = html;
    }
  } else {
    const html = slice.map(v => {
      const statusClass = v.local_file ? 'status-downloaded' : 'status-available';
      const fallbackTitle = (v.thread_titles && v.thread_titles[0]) ? v.thread_titles[0] : null;
      const titleText = v.title || fallbackTitle || v.id;
      const dateText = v.publish_date ? fmtDate(v.publish_date) : 'Unknown Date';
      const viewsText = v.view_count != null ? fmtNum(v.view_count) + ' views' : '';
      const chText = v.channel_name || '-';

      const thumbUrl = `https://i.ytimg.com/vi/${v.id}/mqdefault.jpg`;
      const facadeHtml = (true) // All videos are considered available or downloaded
        ? `<div class="yt-facade" id="facade-${v.id}" onclick="loadFacade('${v.id}')">
             <img src="${thumbUrl}" alt="Thumbnail" loading="lazy">
             <div class="play-btn"></div>
           </div>`
        : `<div class="yt-facade" style="background:#2a3048; display:flex; align-items:center; justify-content:center; color:var(--text-muted); cursor:default;">
             <span style="opacity:0.5">Thumbnail Unavailable</span>
           </div>`;

      const checkbox = isServerMode
        ? `<div class="vid-card-check" onclick="event.stopPropagation();"><input type="checkbox" class="manage-check" data-id="${v.id}" onchange="updateManagementVisibility()"></div>`
        : '';

      return `<div class="vid-card">
        ${checkbox}
        ${facadeHtml}
        <div class="vid-card-info">
          <a href="watch?v=${v.id}" onclick="event.preventDefault(); openVideo('${v.id}')" class="vid-card-title" title="${escAttr(titleText)}">${escHtml(titleText)}</a>
          <a href="${v.channel_url || '#'}" target="_blank" class="vid-card-ch">${escHtml(chText)}</a>
          <div class="vid-card-meta">
            ${viewsText ? `<span>${viewsText}</span>` : ''}
            <span>${dateText}</span>
          </div>
          <div class="vid-status-row" title="${v.local_file ? 'downloaded' : 'available'}">
            ${getStatusEmoji(v.local_file ? 'downloaded' : 'available')} ${getLanguageFlag(v.language)}
          </div>
        </div>
      </div>`;
    }).join('') || (append ? '' : `<div class="empty" style="grid-column:1/-1">No videos match your filters</div>`);

    if (append) grid.insertAdjacentHTML('beforeend', html);
    else grid.innerHTML = html;
  }

  renderPagination(total);

  // Show/hide management column header
  const thManage = document.getElementById('th-manage');
  if (thManage) thManage.style.display = isServerMode && window.viewMode === 'table' ? 'table-cell' : 'none';

  updateManagementVisibility();
}

function renderPagination(total) {
  const el = document.getElementById('pagination');
  if (total === 0) { el.innerHTML = ''; return; }
  const showing = Math.min(currentPage * PAGE_SIZE, total);
  el.innerHTML = `<span class="page-info">Showing ${showing} of ${total} results (Page ${currentPage})</span>`;
}


// Expose functions to global scope
window.setViewMode = setViewMode;
window.setSearchViewMode = setSearchViewMode;
window.loadFacade = loadFacade;
window.applyFilters = applyFilters;
window.sortTable = sortTable;
window.setupScrollObserver = setupScrollObserver;
window.getEmbedHtml = getEmbedHtml;
window.renderTable = renderTable;
window.renderPagination = renderPagination;
