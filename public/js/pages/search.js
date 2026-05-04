// ─── WEIGHTED SEARCH ENGINE ──────────────────────────────────────────────
// BM25-inspired scoring with field-level weights. Order-independent: each
// query token is scored independently so "harry potter vera storia" matches
// "storia potter harry" equally well.

const SEARCH_FIELD_WEIGHTS = {
  title: 10,
  tags: 8,
  channel: 6,
  sections: 4,
  threadTitles: 3,
  description: 2,
  id: 1
};

/**
 * Tokenise a string: lowercase, split on whitespace / punctuation, deduplicate.
 */
function tokenize(str) {
  if (!str) return [];
  // Normalize: lowercase, remove accents (NFKD), remove non-alphanumeric
  const normalized = str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return normalized.replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(/\s+/).filter(token => token.length > 0);
}

function levenshtein(a, b) {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const matrix = Array.from({ length: b.length + 1 }, (_, i) => [i]);
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) matrix[i][j] = matrix[i - 1][j - 1];
      else matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1);
    }
  }
  return matrix[b.length][a.length];
}

function fuzzyScore(s1, s2) {
  const maxLen = Math.max(s1.length, s2.length);
  if (maxLen === 0) return 1.0;
  const dist = levenshtein(s1, s2);
  // Allow 1 typo per 4 characters
  const threshold = Math.floor(maxLen / 4) + 1;
  if (dist > threshold) return 0;
  return (maxLen - dist) / maxLen;
}

/**
 * Score a single field for a set of query tokens.
 * Returns { score, matchedTokens } where matchedTokens is a Set of tokens found.
 *
 * Scoring per token:
 *   • Exact word match            → 1.0
 *   • Field string starts with token → 0.9
 *   • Substring / partial match   → 0.6
 *   • No match                    → 0
 */
function scoreField(fieldValue, queryTokens, allowFuzzy = true) {
  if (!fieldValue) return { score: 0, matchedTokens: new Set() };
  const lower = fieldValue.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const fieldTokens = tokenize(fieldValue);
  const fieldTokenSet = new Set(fieldTokens);
  let totalScore = 0;
  const matchedTokens = new Set();

  for (const qt of queryTokens) {
    let bestTermScore = 0;
    // 1. Exact word match
    if (fieldTokenSet.has(qt)) {
      bestTermScore = 1.0;
    }
    // 2. Prefix of a word (e.g. "harr" matches "harry")
    else if (fieldTokens.some(ft => ft.startsWith(qt))) {
      bestTermScore = 0.8;
    }
    // 3. Substring anywhere
    else if (lower.includes(qt)) {
      bestTermScore = 0.5;
    }
    // 4. Fuzzy / typo match (only for tokens >= 3 chars)
    else if (allowFuzzy && qt.length >= 3) {
      let bestFuzzy = 0;
      for (const ft of fieldTokens) {
        if (Math.abs(ft.length - qt.length) > 2) continue;
        const s = fuzzyScore(ft, qt);
        if (s > bestFuzzy) bestFuzzy = s;
      }
      if (bestFuzzy > 0.75) {
        bestTermScore = bestFuzzy * 0.4; // Lower weight for fuzzy matches
      }
    }

    if (bestTermScore > 0) {
      matchedTokens.add(qt);
      let tf = 0;
      for (const ft of fieldTokens) {
        if (ft === qt || ft.startsWith(qt) || ft.includes(qt)) tf++;
      }
      totalScore += bestTermScore * ((tf * 2.2) / (tf + 1.2));
    }
  }
  return { score: totalScore, matchedTokens };
}

/**
 * Score a video against query tokens. Returns a numeric relevance score (0 = no match).
 */
function scoreVideo(video, queryTokens, rawQuery = "") {
  const qLower = rawQuery.toLowerCase().trim();
  const vTitle = (video.title || "").toLowerCase().trim();
  
  // High-priority: Exact title match (huge bonus)
  if (vTitle === qLower) return 10000;
  
  // Very high priority: Title starts with query
  if (vTitle.startsWith(qLower)) return 5000;

  const fields = [
    { value: video.title, weight: SEARCH_FIELD_WEIGHTS.title },
    { value: (video.tags || []).join(' '), weight: SEARCH_FIELD_WEIGHTS.tags },
    { value: video.channel_name, weight: SEARCH_FIELD_WEIGHTS.channel },
    { value: (video.sections || []).join(' '), weight: SEARCH_FIELD_WEIGHTS.sections },
    { value: (video.thread_titles || []).join(' '), weight: SEARCH_FIELD_WEIGHTS.threadTitles },
    { value: video.description, weight: SEARCH_FIELD_WEIGHTS.description },
    { value: video.id, weight: SEARCH_FIELD_WEIGHTS.id }
  ];

  let totalScore = 0;
  const allMatched = new Set();

  for (const { value, weight } of fields) {
    const { score, matchedTokens } = scoreField(value, queryTokens);
    totalScore += score * weight;
    matchedTokens.forEach(t => allMatched.add(t));
  }

  if (totalScore === 0) return 0;

  // Proportion of query tokens matched across all fields
  const coverage = queryTokens.length > 0 ? allMatched.size / queryTokens.length : 1;

  // Strong bonus when ALL query tokens appear somewhere (order-independent)
  const allMatchBonus = coverage === 1.0 ? 100 : 0;

  // Mild popularity signal (log-scaled, capped)
  const popBoost = 1 + Math.min(Math.log10(Math.max(video.view_count || 1, 1)) / 12, 0.2);

  return (totalScore + allMatchBonus) * coverage * popBoost;
}

/**
 * Builds a SQL WHERE clause for discovery.
 * Uses OR for broad matching, which is then ranked in JS.
 */
function buildSearchClause(query, useOr = true) {
  if (!query) return { clause: "1", params: [] };
  
  // Use raw tokens for SQL to avoid normalization mismatches (like è vs e)
  const rawTokens = query.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(/\s+/).filter(t => t.length > 0);
  if (rawTokens.length === 0) return { clause: "1", params: [] };

  let clauses = [];
  let params = [];

  rawTokens.forEach(token => {
    const qp = `%${token}%`;
    clauses.push(`(
      title LIKE ? OR 
      channel_name LIKE ? OR 
      description LIKE ? OR 
      id LIKE ? OR 
      id IN (SELECT video_id FROM video_tags vt JOIN tags t2 ON vt.tag_id = t2.id WHERE t2.name LIKE ?) OR
      id IN (SELECT video_id FROM video_sections vs JOIN sections s ON vs.section_id = s.id WHERE s.name LIKE ?)
    )`);
    params.push(qp, qp, qp, qp, qp, qp);
  });

  return {
    clause: "(" + clauses.join(useOr ? " OR " : " AND ") + ")",
    params: params
  };
}

/**
 * Score a channel name against query tokens for the channel results section.
 */
function scoreChannel(channelName, queryTokens) {
  // Stricter matching for channels: fuzzy is okay but needs high coverage
  const { score, matchedTokens } = scoreField(channelName, queryTokens, true);
  if (score === 0) return 0;
  const coverage = matchedTokens.size / queryTokens.length;

  // Require at least 50% coverage for channel names to avoid random results
  if (coverage < 0.5 && queryTokens.length > 1) return 0;

  return score * coverage;
}

function performSearch(query) {
  if (!query) return;
  const suggestionsBox = document.getElementById('search-suggestions');
  if (suggestionsBox) suggestionsBox.style.display = 'none';

  const searchPage = document.getElementById('page-search');
  if (searchPage && !searchPage.classList.contains('active')) {
    showPage('search');
  }

  document.getElementById('search-query-display').textContent = query;

  const fSection = document.getElementById('search-filter-section')?.value || '';
  const fYearMin = document.getElementById('search-filter-year-min')?.value;
  const fYearMax = document.getElementById('search-filter-year-max')?.value;
  const fLang = document.getElementById('search-filter-language')?.value || 'any';
  const fSort = document.getElementById('search-sort')?.value || 'relevance';

  const queryPattern = `%${query}%`;
  const queryTokens = tokenize(query);

  // ── Search Channels ──────────────────────────────────────────────────
  const scoredChannels = queryDB("SELECT channel_name as name FROM channels WHERE channel_name LIKE ? LIMIT 5", [queryPattern]);
  const channelsSection = document.getElementById('search-channels-section');
  const channelsContainer = document.getElementById('search-channels-results');
  if (scoredChannels.length === 0) {
    if (channelsSection) channelsSection.style.display = 'none';
  } else {
    if (channelsSection) channelsSection.style.display = 'block';
    channelsContainer.innerHTML = scoredChannels.map(({ name: c }) => renderChannelCard(c, 'search')).join('');
  }

  // ── Search Playlists ──────────────────────────────────────────────────
  const playlists = [...allPlaylists.local, ...allPlaylists.server];
  const scoredPlaylists = playlists
    .filter(p => p.name.toLowerCase().includes(query.toLowerCase()))
    .slice(0, 4);

  const playlistsSection = document.getElementById('search-playlists-section');
  const playlistsContainer = document.getElementById('search-playlists-results');
  const isOld = document.body.classList.contains('theme-old');

  if (scoredPlaylists.length === 0) {
    if (playlistsSection) playlistsSection.style.display = 'none';
  } else {
    if (playlistsSection) playlistsSection.style.display = 'block';
    playlistsContainer.innerHTML = scoredPlaylists.map(p => {
      const type = allPlaylists.local.some(lp => lp.id === p.id) ? 'local' : 'server';
      return renderPlaylistCard(p, type, isOld ? 'list' : 'grid');
    }).join('');
  }

  // ── Search Videos ────────────────────────────────────────────────────
  const buildVideoQuery = (db) => {
    let whereClauses = ["(title IS NOT NULL AND title != '')"];
    let params = [];

    // Use OR for broader discovery, then rank in JS. This solves the "è" vs "e" issue
    // and ensures that phrase fragments still return results.
    const { clause: searchClause, params: searchParams } = buildSearchClause(query, true);
    
    whereClauses.push(`(${searchClause} OR title LIKE ? OR channel_name LIKE ?)`);
    params.push(...searchParams, queryPattern, queryPattern);

    // status filter removed
    if (fSection) {
      whereClauses.push("id IN (SELECT video_id FROM video_sections vs JOIN sections s ON vs.section_id = s.id WHERE s.name = ?)");
      params.push(fSection);
    }
    if (fYearMin) { whereClauses.push("CAST(substr(publish_date, 1, 4) AS INTEGER) >= ?"); params.push(parseInt(fYearMin)); }
    if (fYearMax) { whereClauses.push("CAST(substr(publish_date, 1, 4) AS INTEGER) <= ?"); params.push(parseInt(fYearMax)); }
    if (fLang !== 'any') { whereClauses.push("language = ?"); params.push(fLang); }

    if (!document.body.classList.contains('video-mode-all')) {
      whereClauses.push("(CAST(substr(publish_date, 1, 4) AS INTEGER) <= ? OR publish_date IS NULL)");
      params.push(parseInt(globalMaxYear));
    }

    let sql = "SELECT * FROM videos WHERE " + whereClauses.join(" AND ");
    console.log(`[Global Search] DB Query:`, sql, "Params:", params);
    return queryDB(sql, params, db);
  };

  const videoDBs = [
    { db: dbYTP, name: 'YTP' },
    { db: dbYTPMV, name: 'YTPMV' },
    { db: dbCollabs, name: 'Collabs' },
    { db: dbSources, name: 'Other' }
  ];

  let merged = [];
  for (const item of videoDBs) {
    if (item.db) {
      const results = buildVideoQuery(item.db);
      merged = merged.concat(results);
    }
  }

  // ── High-Precision Ranking ──────────────────────────────────────────
  merged.forEach(v => {
      v._score = scoreVideo(v, queryTokens, query);
  });

  // Filter out irrelevant results to keep the UI clean
  merged = merged.filter(v => v._score > 0 || v.title.toLowerCase().includes(query.toLowerCase()));

  merged.sort((a, b) => {
    if (fSort === 'relevance' || !fSort) {
        const diff = b._score - a._score;
        if (Math.abs(diff) > 0.01) return diff;
    }
    
    if (fSort === 'publish_date') return (b.publish_date || "").localeCompare(a.publish_date || "");
    if (fSort === 'view_count') return (b.view_count || 0) - (a.view_count || 0);
    
    return (b.view_count || 0) - (a.view_count || 0);
  });

  filteredVideos = merged;
  currentPage = 1;
  renderSearchVideos(false);
  setupSearchScrollObserver();
}

let searchScrollObserver = null;
function setupSearchScrollObserver() {
  if (searchScrollObserver) searchScrollObserver.disconnect();
  const sentinel = document.getElementById('search-scroll-sentinel');
  if (!sentinel) return;

  searchScrollObserver = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting) {
      if (currentPage * PAGE_SIZE < filteredVideos.length) {
        currentPage++;
        renderSearchVideos(true);
      }
    }
  }, { rootMargin: '400px' });
  searchScrollObserver.observe(sentinel);
}

function renderSearchVideos(append = false) {
  const container = document.getElementById('search-videos-results');
  const total = filteredVideos.length;
  const countLabel = document.getElementById('search-count-label');
  if (countLabel) countLabel.textContent = `${total} videos found`;

  const isModern = !document.body.classList.contains('theme-old');
  if (searchViewMode === 'grid') {
    container.className = isModern ? 'modern-videos-grid-search' : 'video-grid';
  } else {
    container.className = isModern ? 'video-list-modern-search' : 'video-list';
  }

  if (total === 0) {
    container.innerHTML = '<p class="empty" style="padding:10px;">No videos found matching your criteria.</p>';
    return;
  }

  const start = (currentPage - 1) * PAGE_SIZE;
  const slice = filteredVideos.slice(start, start + PAGE_SIZE);
  const html = slice.map(v => renderVideoItem(v, typeof searchViewMode !== 'undefined' ? searchViewMode : 'list')).join('');

  if (append) container.insertAdjacentHTML('beforeend', html);
  else container.innerHTML = html;

  // Ensure sentinel is at the bottom
  let sentinel = document.getElementById('search-scroll-sentinel');
  if (!sentinel) {
    sentinel = document.createElement('div');
    sentinel.id = 'search-scroll-sentinel';
    sentinel.style.height = '10px';
  }
  container.after(sentinel);
}


// Expose functions to global scope
window.tokenize = tokenize;
window.levenshtein = levenshtein;
window.fuzzyScore = fuzzyScore;
window.scoreField = scoreField;
window.scoreVideo = scoreVideo;
window.buildSearchClause = buildSearchClause;
window.scoreChannel = scoreChannel;
window.performSearch = performSearch;
window.setupSearchScrollObserver = setupSearchScrollObserver;
window.renderSearchVideos = renderSearchVideos;
