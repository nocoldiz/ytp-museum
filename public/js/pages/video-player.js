// ─── YOUTUBE LOGIC ───────────────────────────────────────────────────────
async function openVideo(vidId, pushToHistory = true) {
  if (pushToHistory) updateURL({ v: vidId }, '/watch');
  window.scrollTo(0, 0);
  showPage('video', false);
  // Layout will be updated after basic elements are rendered

  const { video, db } = findVideoAcrossDBs(vidId);
  if (!video) {
    document.getElementById('watch-title').textContent = "Video not found";
    return false;
  }
  const v = video;

  // Fetch tags and sections from the SAME database
  v.tags = queryDB("SELECT t.name FROM tags t JOIN video_tags vt ON t.id = vt.tag_id WHERE vt.video_id = ?", [vidId], db).map(r => r.name);
  v.sections = queryDB("SELECT s.name FROM sections s JOIN video_sections vs ON s.id = vs.section_id WHERE vs.video_id = ?", [vidId], db).map(r => r.name);

  const title = v.title || v.id;
  const channel = v.channel_name || 'Unknown Channel';

  document.getElementById('watch-title').textContent = title;
  const avatar = getChannelAvatar(channel);
  const views = v.view_count != null ? fmtNum(v.view_count) : '0';
  const viewsEl = document.getElementById('watch-views-count');
  if (viewsEl) viewsEl.textContent = views;

  document.getElementById('watch-channel-info').innerHTML = `
    <img src="${avatar}" alt="Avatar" onclick="openProfile('${escAttr(channel)}')" style="cursor:pointer; border-radius:50%;">
    <div style="flex:1">
      <div id="watch-channel" style="font-weight:bold; cursor:pointer; font-size:1.1rem" onclick="openProfile('${escAttr(channel)}')">${escHtml(channel)}</div>
      <div id="watch-date" style="font-size:0.85rem; color:var(--text-muted)">${fmtDate(v.publish_date)}</div>
    </div>
    <button class="btn-watch-subscribe ${isSubscribed(channel) ? 'subscribed' : ''}" data-channel="${escAttr(channel)}" onclick="toggleSubscription('${escAttr(channel)}')">${isSubscribed(channel) ? 'Iscritto' : 'Iscriviti'}</button>
  `;

  let desc = v.description || 'No description available.';
  let tagsHtml = '';
  if (v.tags && v.tags.length > 0) {
    const filteredTags = v.tags.filter(t => t.length > 3);
    if (filteredTags.length > 0) {
      tagsHtml = '<div class="video-tags-list" style="margin-top: 15px; border-top: 1px solid var(--border); padding-top: 10px; display: flex; flex-wrap: wrap; gap: 6px;">' +
        filteredTags.map(t => `<a href="#" class="tag-pill" style="text-decoration:none; color:var(--accent); background:var(--surface2); padding:4px 10px; border-radius:15px; font-size:0.8rem;" onclick="performSearch('${escAttr(t)}'); return false;">#${escHtml(t)}</a>`).join('') +
        '</div>';
    }
  }
  document.getElementById('watch-description').innerHTML = linkify(escHtml(desc)) + tagsHtml;
  
  if (typeof updateVideoLayoutForTheme === 'function') updateVideoLayoutForTheme();

  const playerContainer = document.getElementById('watch-player');
  const hasLocal = !!v.local_file;
  const isYoutubeDead = false; // We no longer have reliable status data for dead videos in the DB

  function renderError() {
    playerContainer.innerHTML = `
      <div style="display:flex; align-items:center; justify-content:center; height:100%; background:#000; color:#fff; flex-direction:column; gap:10px; font-family:sans-serif; text-align:center; padding:20px;">
        <div style="font-size:3rem;">🚫</div>
        <div style="font-size:1.2rem; font-weight:bold;">Video Not Available</div>
        <div style="color:#aaa; font-size:0.9rem;">This video is no longer on YouTube and is missing from the local mirror.</div>
      </div>
    `;
  }

  function renderLocal(isFallback = false) {
    if (!hasLocal) {
      if (isFallback) return renderError();
      return renderYoutube(true);
    }
    const src = getLocalVideoPath(v);
    playerContainer.innerHTML = `<video id="video-player-element" controls autoplay style="width:100%; height:100%; background:#000;">
      <source src="${src}" type="video/mp4">
    </video>`;
    const vid = document.getElementById('video-player-element');
    vid.onerror = () => {
      console.warn("Local playback failed, trying YouTube...");
      renderYoutube(true);
    };
  }

  function renderYoutube(isFallback = false) {
    if (isYoutubeDead) {
      if (isFallback) return renderError();
      return renderLocal(true);
    }
    playerContainer.innerHTML = `<iframe width="100%" height="100%" src="https://www.youtube.com/embed/${v.id}?autoplay=1" frameborder="0" allow="autoplay; encrypted-media" allowfullscreen></iframe>`;
  }

  if (playbackMode === 'mirror') {
    renderLocal();
  } else {
    renderYoutube();
  }

  const moreContainer = document.getElementById('more-from-channel');
  if (moreContainer) {
    const moreVids = queryDB("SELECT * FROM videos WHERE channel_name = ? AND id != ? AND (title IS NOT NULL AND title != '') AND (CAST(substr(publish_date, 1, 4) AS INTEGER) <= ? OR publish_date IS NULL) LIMIT 5", [v.channel_name, v.id, globalMaxYear]);
    moreContainer.innerHTML = moreVids.map(x => renderVideoItem(x, 'grid')).join('');
  }
  updateSaveButton(vidId);
  loadVideoResponses(video);
  loadRelatedVideos(video);
  loadComments(vidId);
  saveToWatched(video);
  return false;
}

function loadVideoResponses(video) {
  const container = document.getElementById('video-responses');
  const section = document.getElementById('video-responses-section');
  if (!container || !section) return;

  const desc = video.description || '';
  // Match 11-char YouTube IDs from various link formats
  const ids = [...new Set([...desc.matchAll(/(?:v=|vi\/|shorts\/|be\/|embed\/|watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/g)].map(m => m[1]))];

  // Filter out the current video ID itself if it's linked
  const filteredIds = ids.filter(id => id !== video.id);

  if (filteredIds.length === 0) {
    section.style.display = 'none';
    return;
  }

  const matched = queryDB("SELECT * FROM videos WHERE id IN (" + filteredIds.map(() => "?").join(",") + ") AND (title IS NOT NULL AND title != '')", filteredIds);

  if (matched.length === 0) {
    section.style.display = 'none';
    return;
  }

  section.style.display = 'block';
  document.getElementById('responses-count-title').textContent = `Video Responses (${matched.length})`;

  // Render responses in a grid-like layout
  container.innerHTML = `<div class="video-grid" style="grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 15px; margin-top: 10px;">
    ${matched.map(v => renderVideoItem(v, 'grid')).join('')}
  </div>`;
}

function loadRelatedVideos(video) {
  const container = document.getElementById('related-videos');
  if (!container) return;

  const videoTags = video.tags || [];
  const videoSections = video.sections || [];

  if (videoTags.length === 0 && videoSections.length === 0) {
    document.getElementById('related-videos-box').style.display = 'none';
    return;
  }

  // Find videos with at least one shared tag or section
  let sql = `
    SELECT v.*, COUNT(*) as score
    FROM videos v
    LEFT JOIN video_tags vt ON v.id = vt.video_id
    LEFT JOIN tags t ON vt.tag_id = t.id
    LEFT JOIN video_sections vs ON v.id = vs.video_id
    LEFT JOIN sections s ON vs.section_id = s.id
    WHERE v.id != ? AND (v.title IS NOT NULL AND v.title != '') AND (t.name IN (${videoTags.map(() => "?").join(",")}) OR s.name IN (${videoSections.map(() => "?").join(",")}))
    GROUP BY v.id
    ORDER BY score DESC
    LIMIT 10
  `;

  const params = [video.id, ...videoTags, ...videoSections];
  const matched = queryDB(sql, params);

  if (matched.length === 0) {
    document.getElementById('related-videos-box').style.display = 'none';
    return;
  }

  document.getElementById('related-videos-box').style.display = 'block';
  container.innerHTML = matched.map(v => renderVideoItem(v, 'grid')).join('');
}

async function loadComments(vidId) {
  const container = document.getElementById('watch-comments');
  const title = document.getElementById('comments-count-title');
  if (!container) return;

  if (!window.enabledSources.comments) {
    container.innerHTML = `
      <p class="empty" style="padding:10px; color: var(--text-muted); font-size: 13px;">
        Comments are disabled by default to improve performance.<br>
        <a href="#" onclick="openSourcesModal(); return false;" style="color: var(--accent); text-decoration: underline;">Enable Comments in the Sources menu</a> to see them.
      </p>
    `;
    if (title) title.textContent = "Comments (Disabled)";
    return;
  }

  container.innerHTML = '<p class="empty" style="padding:10px;">Loading comments...</p>';

  try {
    const db = await ensureCommentsDB();
    if (!db) {
      container.innerHTML = '<p class="empty" style="padding:10px;">Could not load comments database.</p>';
      return;
    }
    const comments = queryDB("SELECT * FROM comments WHERE video_id = ? ORDER BY published_at ASC", [vidId], db);
    if (!comments || comments.length === 0) {
      console.log(`No comments found for video ${vidId}`);
      container.innerHTML = '<p class="empty" style="padding:10px;">No comments available.</p>';
      if (title) title.textContent = "Comments";
      return;
    }

    console.log(`Loaded ${comments.length} comments for video ${vidId}`);
    if (title) title.textContent = `${fmtNum(comments.length)} Comments`;
    renderCommentTree(comments);
  } catch (e) {
    console.error("Error loading comments:", e);
    container.innerHTML = '<p class="empty" style="padding:10px;">Error loading comments.</p>';
    if (title) title.textContent = "Comments";
  }
}

function renderCommentTree(allComments) {
  const container = document.getElementById('watch-comments');

  // Build a map of replies
  const repliesMap = {};
  const rootComments = [];

  allComments.forEach(c => {
    if (c.parent === 'root' || !allComments.some(x => x.id === c.parent)) {
      rootComments.push(c);
    } else {
      if (!repliesMap[c.parent]) repliesMap[c.parent] = [];
      repliesMap[c.parent].push(c);
    }
  });

  // Sort root comments by pinned first, then by timestamp (newest first)
  rootComments.sort((a, b) => {
    if (a.is_pinned && !b.is_pinned) return -1;
    if (!a.is_pinned && b.is_pinned) return 1;
    return (b.timestamp || 0) - (a.timestamp || 0);
  });

  container.innerHTML = rootComments.map(c => renderCommentItem(c, repliesMap)).join('');
}

function renderCommentItem(c, repliesMap) {
  const replies = repliesMap[c.id] || [];
  const pinnedHtml = c.is_pinned ? `<div class="comment-pinned">📌 Pinned by ${escHtml(c.author_is_uploader ? 'uploader' : 'someone')}</div>` : '';
  const authorIcon = c.author_thumbnail || 'https://upload.wikimedia.org/wikipedia/commons/8/89/Portrait_Placeholder.png';
  const timeText = c._time_text || timeAgo(c.timestamp);

  return `
    <div class="comment-item">
      <img src="${authorIcon}" class="comment-avatar" alt="" loading="lazy">
      <div class="comment-content">
        ${pinnedHtml}
        <div>
          <a href="${c.author_url || '#'}" target="_blank" class="comment-author">${escHtml(c.author)}</a>
          <span class="comment-time">${escHtml(timeText)}</span>
        </div>
        <div class="comment-text">${linkify(escHtml(c.text))}</div>
        <div class="comment-actions">
          <div class="comment-likes">👍 ${fmtNum(c.like_count || 0)}</div>
        </div>
        ${replies.length > 0 ? `
          <div class="comment-replies">
            ${replies.map(r => renderCommentItem(r, repliesMap)).join('')}
          </div>
        ` : ''}
      </div>
    </div>
  `;
}

function fallbackToYoutube(vidId) {
  const playerContainer = document.getElementById('watch-player');
  if (playerContainer) {
    playerContainer.innerHTML = `<iframe width="100%" height="390" src="https://www.youtube-nocookie.com/embed/${vidId}?autoplay=1" allow="autoplay; encrypted-media" allowfullscreen style="border:none;"></iframe>`;
  }
}

function openProfile(user, pushToHistory = true) {
  if (pushToHistory) updateURL({ user: user }, '/@' + encodeURIComponent(user));

  // If modern mode is active, use the new modern profile renderer
  if (!document.body.classList.contains('theme-old')) {
    renderModernProfile(user);
    return;
  }

  showPage('profile', false);
  const vRes = queryDB("SELECT * FROM videos WHERE channel_name = ? AND (CAST(substr(publish_date, 1, 4) AS INTEGER) <= ? OR publish_date IS NULL) ORDER BY publish_date DESC", [user, globalMaxYear]);
  const avatar = getChannelAvatar(user);
  const userVideos = vRes;
  const sorted = [...userVideos];

  document.getElementById('profile-header').innerHTML = `
    <div style="display:flex; align-items:center; gap:24px;">
      <img src="${avatar}" style="width:100px; height:100px; border-radius:50%; border:4px solid var(--border); object-fit:cover;">
      <div>
        <h2 id="profile-title" style="margin:0; font-size:2rem;">${escHtml(user)}</h2>
        <div id="profile-stats" style="margin-top:8px; color:var(--text-muted); line-height:1.4;">
          <strong>${userVideos.length}</strong> videos • 
          <strong>${fmtNum(userVideos.reduce((sum, v) => sum + (v.view_count || 0), 0))}</strong> total views<br>
          Joined: ${sorted.length > 0 && sorted[sorted.length - 1].publish_date ? fmtDate(sorted[sorted.length - 1].publish_date) : 'Unknown'}
        </div>
      </div>
    </div>
  `;

  const featContainer = document.getElementById('profile-featured');
  const gridContainer = document.getElementById('profile-videos');

  if (sorted.length > 0) {
    const feat = sorted[0];
    featContainer.innerHTML = `
      <h3 style="margin-top:0;">${escHtml(feat.title || feat.id)}</h3>
      <iframe width="100%" height="295" src="https://www.youtube-nocookie.com/embed/${feat.id}" allow="autoplay; encrypted-media" allowfullscreen style="border:none;"></iframe>
      <p style="margin-top:10px;">${escHtml(feat.description ? feat.description.slice(0, 200) + '...' : '')}</p>
    `;

    const others = sorted.slice(1, 13);
    gridContainer.innerHTML = others.map(v => renderVideoItem(v, 'grid')).join('');
  } else {
    featContainer.innerHTML = '';
    gridContainer.innerHTML = '';
  }
  return false;
}

async function renderModernProfile(user, activeTab = 'home') {
  const p = document.getElementById('page-profile');
  showPage('profile', false);
  p.innerHTML = '<div class="loading">Loading profile...</div>';
  window.scrollTo({ top: 0, behavior: 'smooth' });

  // Ensure playlists are loaded
  if (allPlaylists.local.length === 0 && allPlaylists.server.length === 0) {
    const [local, server] = await Promise.all([getLocalPlaylists(), getServerPlaylists()]);
    allPlaylists = { local, server };
  }

  const avatar = getChannelAvatar(user);
  const pooperRes = queryDB("SELECT * FROM channels WHERE channel_name = ?", [user]);
  const pooper = pooperRes.length > 0 ? pooperRes[0] : { channel_name: user };
  const videos = queryDB("SELECT * FROM videos WHERE channel_name = ? AND (substr(publish_date, 1, 4) <= ? OR publish_date IS NULL)", [user, globalMaxYear]);

  const subCount = pooper.subscriber_count ? fmtNum(pooper.subscriber_count) + ' iscritti' : videos.length + ' video';
  const videoCountText = videos.length + ' video';
  const handle = pooper.channel_url ? '@' + pooper.channel_url.split('/').pop() : '@' + user.replace(/\s+/g, '').toLowerCase();

  p.innerHTML = `
    <div class="modern-profile-container">
      <div class="modern-channel-header">
        <div class="modern-channel-banner"></div>
        <div class="modern-channel-main-info">
          <img src="${avatar}" class="modern-channel-avatar">
          <div class="modern-channel-text">
            <h1 class="modern-channel-name">${escHtml(user)}</h1>
            <div class="modern-channel-handle-stats">
              <span>${escHtml(handle)}</span>
              <span class="dot-sep">•</span>
              <span>${subCount}</span>
              <span class="dot-sep">•</span>
              <span>${videoCountText}</span>
            </div>
            <div class="modern-channel-bio">${escHtml(pooper.description || 'Nessuna descrizione disponibile.')}</div>
            <button class="modern-btn-subscribe ${isSubscribed(user) ? 'subscribed' : ''}" data-channel="${escAttr(user)}" onclick="toggleSubscription('${escAttr(user)}')">${isSubscribed(user) ? 'Iscritto' : 'Iscriviti'}</button>
          </div>
        </div>
      </div>
      
      <div class="modern-channel-nav">
        <div class="modern-nav-tab ${activeTab === 'home' ? 'active' : ''}" onclick="renderModernProfileTab('${escAttr(user)}', 'home')">Home</div>
        <div class="modern-nav-tab ${activeTab === 'videos' ? 'active' : ''}" onclick="renderModernProfileTab('${escAttr(user)}', 'videos')">Video</div>
        <div class="modern-nav-tab" onclick="alert('Shorts subsection coming soon!')">Short</div>
        <div class="modern-nav-tab" onclick="alert('Live subsection coming soon!')">Live</div>
        <div class="modern-nav-tab" onclick="alert('Playlists subsection coming soon!')">Playlist</div>
        <div class="modern-nav-tab" onclick="alert('Posts subsection coming soon!')">Post</div>
        <div class="modern-nav-tab"><svg style="width:20px;height:20px;fill:currentColor" viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg></div>
      </div>

      <div class="modern-channel-content" id="modern-profile-content">
        <!-- Content injected here -->
      </div>
    </div>
  `;

  renderModernProfileTabContent(user, activeTab);
}

function renderModernProfileTab(user, tab) {
  // Update UI tabs
  document.querySelectorAll('.modern-nav-tab').forEach(el => {
    el.classList.toggle('active', el.textContent.toLowerCase() === tab);
  });
  renderModernProfileTabContent(user, tab);
}

function renderModernProfileTabContent(user, tab) {
  const container = document.getElementById('modern-profile-content');
  if (!container) return;

  const videos = queryDB("SELECT * FROM videos WHERE channel_name = ? AND (CAST(substr(publish_date, 1, 4) AS INTEGER) <= ? OR publish_date IS NULL)", [user, globalMaxYear]);

  if (tab === 'home') {
    renderModernChannelHome(user, container, videos);
  } else if (tab === 'videos') {
    container.innerHTML = `
      <div class="modern-videos-grid">
        ${videos.sort((a, b) => (b.publish_date || '').localeCompare(a.publish_date || '')).map(v => renderModernHomeCard(v)).join('')}
      </div>
    `;
  }
}

function renderModernChannelHome(user, container, channelVideos) {
  container.innerHTML = '';
  const channelVideoIds = new Set(channelVideos.map(v => v.id));

  // 1. Find relevant playlists
  const relevantPlaylists = [];
  [...allPlaylists.local, ...allPlaylists.server].forEach(p => {
    if (p.videoIds && p.videoIds.some(id => channelVideoIds.has(id))) {
      relevantPlaylists.push(p);
    }
  });

  // 2. Render Playlist Sections
  relevantPlaylists.forEach(p => {
    const pVideos = p.videoIds
      .map(id => channelVideos.find(v => v.id === id))
      .filter(Boolean);

    if (pVideos.length === 0) return;

    const section = document.createElement('div');
    section.className = 'modern-section';
    section.innerHTML = `
      <h2 class="modern-section-title">${escHtml(p.name)} <span style="color:var(--text-muted); font-size:14px; font-weight:normal; margin-left:8px;">Riproduci tutto</span></h2>
      <div class="modern-carousel-container">
        ${pVideos.map(v => renderModernHomeCard(v)).join('')}
      </div>
    `;
    container.appendChild(section);
  });

  // 3. Popular Videos Section
  const popularVideos = [...channelVideos].sort((a, b) => (b.view_count || 0) - (a.view_count || 0)).slice(0, 10);
  if (popularVideos.length > 0) {
    const section = document.createElement('div');
    section.className = 'modern-section';
    section.innerHTML = `
      <h2 class="modern-section-title">Video popolari</h2>
      <div class="modern-carousel-container">
        ${popularVideos.map(v => renderModernHomeCard(v)).join('')}
      </div>
    `;
    container.appendChild(section);
  }

  // 4. Recent Videos Section
  const recentVideos = [...channelVideos].sort((a, b) => (b.publish_date || '').localeCompare(a.publish_date || '')).slice(0, 10);
  if (recentVideos.length > 0) {
    const section = document.createElement('div');
    section.className = 'modern-section';
    section.innerHTML = `
      <h2 class="modern-section-title">Video</h2>
      <div class="modern-carousel-container">
        ${recentVideos.map(v => renderModernHomeCard(v)).join('')}
      </div>
    `;
    container.appendChild(section);
  }
}


function updateVideoLayoutForTheme() {
  const isOld = document.body.classList.contains('theme-old');
  const mainCol = document.querySelector('#page-video .col-right');
  const sideCol = document.querySelector('#page-video .col-left');

  const title = document.getElementById('watch-title');
  const video = document.getElementById('watch-video-container');
  const stats = document.querySelector('.watch-stats');
  const channel = document.getElementById('watch-channel-info');
  const desc = document.getElementById('watch-description');
  const actions = document.getElementById('watch-actions');
  const date = document.getElementById('watch-date');

  if (!mainCol || !sideCol || !title || !video || !channel || !desc) return;

  let channelRow = document.getElementById('modern-channel-row');

  if (isOld) {
    // Restore Old Mode
    mainCol.insertBefore(title, video);
    sideCol.insertBefore(stats, sideCol.firstChild);

    // Put date back into channel info if it was moved
    const channelTextWrap = channel.querySelector('div');
    if (date && channelTextWrap) {
      channelTextWrap.appendChild(date);
      date.style.display = 'block';
      date.style.marginLeft = '0';
    }

    sideCol.insertBefore(channel, stats.nextSibling);
    sideCol.insertBefore(desc, channel.nextSibling);
    sideCol.insertBefore(actions, desc.nextSibling);
    if (channelRow) channelRow.style.display = 'none';
  } else {
    // Modern Mode
    mainCol.insertBefore(video, mainCol.firstChild);
    mainCol.insertBefore(title, video.nextSibling);

    if (!channelRow) {
      channelRow = document.createElement('div');
      channelRow.id = 'modern-channel-row';
      channelRow.className = 'modern-channel-row';
      mainCol.insertBefore(channelRow, title.nextSibling);
    }
    channelRow.style.display = 'flex';
    channelRow.appendChild(channel);
    if (actions) channelRow.appendChild(actions);

    mainCol.insertBefore(desc, channelRow.nextSibling);
    desc.insertBefore(stats, desc.firstChild);

    // Move date next to views in description box
    if (date && stats) {
      stats.appendChild(date);
      date.style.display = 'inline-block';
      date.style.marginLeft = '8px';
    }
  }
}

function setGlobalMaxYear(year) {
  globalMaxYear = parseInt(year);

  // Sync all year selectors
  [document.getElementById('global-year-selector'), document.getElementById('modern-global-year-selector')].forEach(sel => {
    if (sel) sel.value = year;
  });

  // Re-render active views
  if (document.getElementById('page-youtube').classList.contains('active')) renderHomePage();
  if (document.getElementById('page-videos').classList.contains('active')) applyFilters();
  if (document.getElementById('page-search').classList.contains('active')) {
    const q = document.getElementById('global-search-input').value.trim();
    if (q) performSearch(q);
  }
  if (document.getElementById('page-channels').classList.contains('active')) renderChannelGrid();

  // Reload profile if open
  if (document.getElementById('page-profile').classList.contains('active')) {
    const url = new URL(window.location);
    let user = url.searchParams.get('user') || url.searchParams.get('c') || url.searchParams.get('channel');
    if (!user && url.pathname.startsWith('/@')) user = url.pathname.slice(2);
    if (!user && (url.pathname.startsWith('/user/') || url.pathname.startsWith('/c/') || url.pathname.startsWith('/channel/'))) {
      user = url.pathname.split('/')[2];
    }
    if (user) openProfile(decodeURIComponent(user), false);
  }
  clearQueryCache();
  window.homeTabCache = {};
}

function getActiveVideos(forHome = false, limit = null) {
  if (forHome && (!window.dbYTP) && window.homeLiteVideos) {
    return window.homeLiteVideos;
  }
  const cacheKey = `activeVideos_${appMode}_${globalMaxYear}_${forHome}_${limit}`;
  return getCachedQuery(cacheKey, () => {
    let whereClauses = [];
    let params = [];

    if (forHome) {
      // already routed to dbYTP
    }

    whereClauses.push("(CAST(substr(publish_date, 1, 4) AS INTEGER) <= ? OR publish_date IS NULL)");
    params.push(globalMaxYear);

    // Filter out entries without a name
    whereClauses.push("(title IS NOT NULL AND title != '')");

    let sql = "SELECT * FROM videos";
    if (whereClauses.length > 0) {
      sql += " WHERE " + whereClauses.join(" AND ");
    }

    if (limit) {
      sql += ` LIMIT ${limit}`;
    }

    const res = queryDB(sql, params);
    if (forHome && res.length === 0 && window.homeLiteVideos) {
      return window.homeLiteVideos;
    }
    return res;
  });
}

function renderLatestVideos() {
  const isOld = document.body.classList.contains('theme-old');
  const dbs = [dbYTP, dbYTPMV, dbCollabs, dbSources];
  let allLatest = [];

  for (const db of dbs) {
    if (!db) continue;
    // Requirement: list latest videos, ignore videos with no date
    const res = queryDB("SELECT * FROM videos WHERE (title IS NOT NULL AND title != '') AND (publish_date IS NOT NULL AND publish_date != '') AND (CAST(substr(publish_date, 1, 4) AS INTEGER) <= ?) ORDER BY publish_date DESC LIMIT 12", [globalMaxYear], db);
    allLatest.push(...res);
  }

  // Combine and sort by date descending
  allLatest.sort((a, b) => b.publish_date.localeCompare(a.publish_date));
  const latest = allLatest.slice(0, isOld ? 8 : 12);

  if (isOld) {
    const container = document.getElementById('latest-videos-old');
    if (container) {
      container.innerHTML = latest.map(v => renderVideoItem(v, 'list')).join('');
    }
  } else {
    const container = document.getElementById('latest-videos-modern');
    if (container) {
      container.innerHTML = latest.map(v => renderModernHomeCard(v)).join('');
    }
  }
}

function renderHomePage() {
  const isOld = document.body.classList.contains('theme-old');
  const classicLayout = document.getElementById('youtube-old-layout');
  const modernLayout = document.getElementById('youtube-modern-layout');

  if (classicLayout && modernLayout) {
    classicLayout.style.display = isOld ? 'block' : 'none';
    modernLayout.style.display = isOld ? 'none' : 'block';
  }

  if (isOld) {
    setFeaturedTab('all');
  } else {
    const allChip = document.querySelector('#home-chips .chip[onclick*="all"]');
    setModernHomeTab('all', allChip);
  }
  renderLatestVideos();
}

function setModernHomeTab(tab, btn) {
  currentModernTab = tab;
  const chips = document.getElementById('home-chips');
  if (chips) {
    chips.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    if (btn) btn.classList.add('active');
  }
  renderedHomeVideoIds.clear();
  renderModernGrid();
}

function renderModernGrid() {
  const modernContainer = document.getElementById('modern-videos-grid');
  if (!modernContainer) return;

  // Modern grid usually shows a limited set per tab
  const ytData = getActiveVideos(true, 200);
  const validVideos = ytData; // Status filter removed, all indexed videos are considered available
  
  // If we have lite videos and the main DB is not yet ready, use them as fallback
  if (validVideos.length === 0 && window.homeLiteVideos) {
    const mHtml = window.homeLiteVideos.map(v => renderModernHomeCard(v)).join('');
    modernContainer.innerHTML = mHtml;
    return;
  }

  if (validVideos.length === 0) return;

  let videos;
  if (currentModernTab !== 'random' && homeTabCache['modern_' + currentModernTab]) {
    videos = homeTabCache['modern_' + currentModernTab];
  } else {
    if (currentModernTab === 'all') {
      const dbs = [dbYTP, dbSources, dbYTPMV, dbCollabs];
      let allVids = [];
      for (const db of dbs) {
        if (!db) continue;
        const res = queryDB("SELECT * FROM videos WHERE (title IS NOT NULL AND title != '') AND (CAST(substr(publish_date, 1, 4) AS INTEGER) <= ? OR publish_date IS NULL) ORDER BY RANDOM() LIMIT 12", [globalMaxYear], db);
        allVids.push(...res);
      }
      videos = shuffleArray(allVids).slice(0, 24);
    } else if (currentModernTab === 'random') {
      const dbs = [dbYTP, dbSources, dbYTPMV, dbCollabs];
      let allVids = [];
      for (const db of dbs) {
        if (!db) continue;
        const res = queryDB("SELECT * FROM videos WHERE (title IS NOT NULL AND title != '') AND (CAST(substr(publish_date, 1, 4) AS INTEGER) <= ? OR publish_date IS NULL) ORDER BY RANDOM() LIMIT 12", [globalMaxYear], db);
        allVids.push(...res);
      }
      videos = shuffleArray(allVids).slice(0, 24);
    } else if (currentModernTab === 'ytp') {
      videos = shuffleArray(validVideos).slice(0, 24);
    } else if (currentModernTab === 'subscribed') {
      const subs = new Set(getSubscriptions());
      videos = shuffleArray(validVideos.filter(v => subs.has(v.channel_name))).slice(0, 24);
      if (videos.length === 0) {
        modernContainer.innerHTML = '<div class="empty-subs" style="padding:40px; text-align:center; color:var(--text-muted);">Non sei iscritto a nessun canale o i canali a cui sei iscritto non hanno video.</div>';
        return;
      }
    } else if (currentModernTab === 'views') {
      videos = [...validVideos].sort((a, b) => (b.view_count || 0) - (a.view_count || 0)).slice(0, 24);
    } else if (currentModernTab === 'discussed') {
      videos = [...validVideos].sort((a, b) => (b.comment_count || b.view_count || 0) - (a.comment_count || a.view_count || 0)).slice(0, 24);
    } else if (currentModernTab === 'favorited') {
      videos = [...validVideos].sort((a, b) => (b.like_count || 0) - (a.like_count || 0)).slice(0, 24);
    } else if (currentModernTab === 'ytpmv') {
      if (dbYTPMV) {
        const sql = "SELECT * FROM videos WHERE (title IS NOT NULL AND title != '') ORDER BY RANDOM() LIMIT 24";
        videos = queryDB(sql, [], dbYTPMV);
      } else {
        // Fallback to keyword search in main DB if specialized DB not yet loaded
        const kw = ['YTPMV', 'MAD'];
        videos = shuffleArray(validVideos.filter(v => {
          const t = (v.title || '').toUpperCase();
          const d = (v.description || '').toUpperCase();
          return kw.some(k => t.includes(k) || d.includes(k));
        })).slice(0, 24);
      }
      if (videos.length === 0) {
        modernContainer.innerHTML = '<div class="empty-subs" style="padding:40px; text-align:center; color:var(--text-muted);">Nessun video YTPMV/MAD trovato.</div>';
        return;
      }
    } else if (currentModernTab === 'collabs') {
      if (dbCollabs) {
        const sql = "SELECT * FROM videos WHERE (title IS NOT NULL AND title != '') ORDER BY RANDOM() LIMIT 24";
        videos = queryDB(sql, [], dbCollabs);
      }
      if (!videos || videos.length === 0) {
        modernContainer.innerHTML = '<div class="empty-subs" style="padding:40px; text-align:center; color:var(--text-muted);">Nessun video Collab trovato.</div>';
        return;
      }
    } else if (currentModernTab === 'acid') {
      const kw = ['ACID', 'ACID POOP', 'LSD'];
      videos = shuffleArray(validVideos.filter(v => {
        const t = (v.title || '').toUpperCase();
        const d = (v.description || '').toUpperCase();
        return kw.some(k => t.includes(k) || d.includes(k));
      })).slice(0, 24);
      if (videos.length === 0) {
        modernContainer.innerHTML = '<div class="empty-subs" style="padding:40px; text-align:center; color:var(--text-muted);">Nessun video Acid Poop trovato.</div>';
        return;
      }
    }

    if (currentModernTab !== 'random') {
      homeTabCache['modern_' + currentModernTab] = videos;
    }
  }

  if (!videos) {
    console.error('[renderModernGrid] No videos to display for tab:', currentModernTab);
    return;
  }
  const mHtml = videos.map(v => renderModernHomeCard(v)).join('');
  modernContainer.innerHTML = mHtml;
}

function setFeaturedTab(tab) {
  // Update active tab UI
  document.querySelectorAll('.yt-tab').forEach(t => t.classList.remove('active'));
  const clickedTab = document.querySelector(`.yt-tab[onclick*="${tab}"]`);
  if (clickedTab) clickedTab.classList.add('active');

  renderedHomeVideoIds.clear();
  const ytData = getActiveVideos(true);
  const validVideos = ytData;
  const featuredContainer = document.getElementById("featured-videos");
  if (!featuredContainer) return;

  // Fallback to lite videos if DB not loaded
  if (validVideos.length === 0 && window.homeLiteVideos) {
    featuredContainer.innerHTML = window.homeLiteVideos.slice(0, 8).map(v => renderVideoItem(v, 'list')).join('');
    return;
  }

  if (tab !== "all" && tab !== "random" && validVideos.length === 0) return;
  let videos;

  if (tab !== 'random' && homeTabCache['old_' + tab]) {
    videos = homeTabCache['old_' + tab];
  } else {
    if (tab === 'all') {
      const dbs = [dbYTP, dbSources, dbYTPMV, dbCollabs];
      let allVids = [];
      for (const db of dbs) {
        if (!db) continue;
        const res = queryDB("SELECT * FROM videos WHERE (title IS NOT NULL AND title != '') AND (CAST(substr(publish_date, 1, 4) AS INTEGER) <= ? OR publish_date IS NULL) ORDER BY RANDOM() LIMIT 8", [globalMaxYear], db);
        allVids.push(...res);
      }
      videos = shuffleArray(allVids).slice(0, 8);
    } else if (tab === 'random') {
      const dbs = [dbYTP, dbSources, dbYTPMV, dbCollabs];
      let allVids = [];
      for (const db of dbs) {
        if (!db) continue;
        const res = queryDB("SELECT * FROM videos WHERE (title IS NOT NULL AND title != '') AND (CAST(substr(publish_date, 1, 4) AS INTEGER) <= ? OR publish_date IS NULL) ORDER BY RANDOM() LIMIT 8", [globalMaxYear], db);
        allVids.push(...res);
      }
      videos = shuffleArray(allVids).slice(0, 8);
    } else if (tab === 'ytp') {
      videos = shuffleArray(validVideos).slice(0, 8);
    } else if (tab === 'views') {
      videos = [...validVideos].sort((a, b) => (b.view_count || 0) - (a.view_count || 0)).slice(0, 8);
    } else if (tab === 'discussed') {
      // Use comment count if available, else fall back to views
      videos = [...validVideos].sort((a, b) => (b.comment_count || b.view_count || 0) - (a.comment_count || a.view_count || 0)).slice(0, 8);
    } else if (tab === 'favorited') {
      videos = [...validVideos].sort((a, b) => (b.like_count || 0) - (a.like_count || 0)).slice(0, 8);
    } else if (tab === 'subscribed') {
      const subs = new Set(getSubscriptions());
      videos = shuffleArray(validVideos.filter(v => subs.has(v.channel_name))).slice(0, 12);
      if (videos.length === 0) {
        featuredContainer.innerHTML = '<div class="empty-subs" style="padding:20px; color:var(--text-muted);">Nessun video dai canali seguiti.</div>';
        return;
      }
    } else if (tab === 'ytpmv') {
      if (dbYTPMV) {
        const sql = "SELECT * FROM videos WHERE (title IS NOT NULL AND title != '') ORDER BY RANDOM() LIMIT 8";
        videos = queryDB(sql, [], dbYTPMV);
      } else {
        const kw = ['YTPMV', 'MAD'];
        videos = shuffleArray(validVideos.filter(v => {
          const t = (v.title || '').toUpperCase();
          const d = (v.description || '').toUpperCase();
          return kw.some(k => t.includes(k) || d.includes(k));
        })).slice(0, 8);
      }
      if (videos.length === 0) {
        featuredContainer.innerHTML = '<div class="empty-subs" style="padding:20px; color:var(--text-muted);">Nessun video YTPMV/MAD trovato.</div>';
        return;
      }
    } else if (tab === 'collabs') {
      if (dbCollabs) {
        const sql = "SELECT * FROM videos WHERE (title IS NOT NULL AND title != '') ORDER BY RANDOM() LIMIT 8";
        videos = queryDB(sql, [], dbCollabs);
      }
      if (!videos || videos.length === 0) {
        featuredContainer.innerHTML = '<div class="empty-subs" style="padding:20px; color:var(--text-muted);">Nessun video Collab trovato.</div>';
        return;
      }
    } else if (tab === 'acid') {
      const kw = ['ACID', 'ACID POOP'];
      videos = shuffleArray(validVideos.filter(v => {
        const t = (v.title || '').toUpperCase();
        const d = (v.description || '').toUpperCase();
        return kw.some(k => t.includes(k) || d.includes(k));
      })).slice(0, 8);
      if (videos.length === 0) {
        featuredContainer.innerHTML = '<div class="empty-subs" style="padding:20px; color:var(--text-muted);">Nessun video Acid Poop trovato.</div>';
        return;
      }
    }

    if (tab !== 'random') {
      homeTabCache['old_' + tab] = videos;
    }
  }

  featuredContainer.innerHTML = videos.map(v => renderVideoItem(v, 'list')).join('');
}

function loadMoreHomeVideos() {
  const featuredContainer = document.getElementById('featured-videos');
  const modernContainer = document.getElementById('modern-videos-grid');
  if (!featuredContainer || !modernContainer) return;

  const validVideos = getActiveVideos(true);
  const available = validVideos.filter(v => !renderedHomeVideoIds.has(v.id));
  if (available.length === 0) return;

  const shuffled = shuffleArray(available);
  const newVideos = shuffled.slice(0, 12); // load 12 at a time

  newVideos.forEach(v => renderedHomeVideoIds.add(v.id));

  // Append 4 to featured list, 8 to popular grid (old mode)
  const featNew = newVideos.slice(0, 4);

  if (featNew.length > 0) featuredContainer.insertAdjacentHTML('beforeend', featNew.map(v => renderVideoItem(v, 'list')).join(''));

  // Append to modern grid
  if (newVideos.length > 0) modernContainer.insertAdjacentHTML('beforeend', newVideos.map(v => renderModernHomeCard(v)).join(''));
}

window.addEventListener('scroll', () => {
  const pageYoutube = document.getElementById('page-youtube');
  if (pageYoutube && pageYoutube.classList.contains('active')) {
    if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight - 500) {
      if (!isFetchingMoreHome) {
        isFetchingMoreHome = true;
        loadMoreHomeVideos();
        setTimeout(() => { isFetchingMoreHome = false; }, 300);
      }
    }
  }
});

function renderModernHomeCard(v) {
  const fallbackTitle = (v.thread_titles && v.thread_titles[0]) ? v.thread_titles[0] : null;
  const titleText = v.title || fallbackTitle || v.id;
  const dateText = v.publish_date ? fmtDate(v.publish_date) : 'Unknown Date';
  const viewsText = v.view_count != null ? fmtNum(v.view_count) + ' views' : '';
  const chText = v.channel_name || '-';
  const thumbUrl = `https://i.ytimg.com/vi/${v.id}/mqdefault.jpg`;
  const channelAvatar = getChannelAvatar(chText);

  return `
    <div class="modern-home-card" onclick="openVideo('${v.id}')">
      <div class="yt-facade">
        <img src="${thumbUrl}" alt="Thumbnail" loading="lazy">
        <div class="play-btn"></div>
      </div>
      <div class="modern-home-info">
        <img class="channel-avatar" src="${channelAvatar}" alt="Avatar" loading="lazy" onclick="event.stopPropagation(); openProfile('${escAttr(chText)}')">
        <div class="modern-home-text">
          <h3 class="modern-home-title" title="${escAttr(titleText)}">${escHtml(titleText)}</h3>
          <a href="#" class="modern-home-ch" onclick="event.stopPropagation(); openProfile('${escAttr(chText)}')">${escHtml(chText)}</a>
          <div class="modern-home-meta">
            ${viewsText ? `<span>${viewsText}</span><span class="dot-sep">•</span>` : ''}
            <span>${dateText}</span>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderStars(viewCount) {
  // Rough rating estimate from view count for visual authenticity
  const raw = Math.min(5, Math.max(1, Math.round((Math.log10(Math.max(viewCount || 1, 1)) / 8) * 5)));
  return Array.from({ length: 5 }, (_, i) =>
    `<span style="color:${i < raw ? '#f90' : '#ccc'}; font-size:13px;">★</span>`
  ).join('');
}


// Expose functions to global scope
window.openVideo = openVideo;
window.loadVideoResponses = loadVideoResponses;
window.loadRelatedVideos = loadRelatedVideos;
window.loadComments = loadComments;
window.renderCommentTree = renderCommentTree;
window.renderCommentItem = renderCommentItem;
window.fallbackToYoutube = fallbackToYoutube;
window.openProfile = openProfile;
window.renderModernProfile = renderModernProfile;
window.renderModernProfileTab = renderModernProfileTab;
window.renderModernProfileTabContent = renderModernProfileTabContent;
window.renderModernChannelHome = renderModernChannelHome;
window.updateVideoLayoutForTheme = updateVideoLayoutForTheme;
window.setGlobalMaxYear = setGlobalMaxYear;
window.getActiveVideos = getActiveVideos;
window.renderHomePage = renderHomePage;
window.setModernHomeTab = setModernHomeTab;
window.renderModernGrid = renderModernGrid;
window.setFeaturedTab = setFeaturedTab;
window.loadMoreHomeVideos = loadMoreHomeVideos;
window.renderModernHomeCard = renderModernHomeCard;
window.renderLatestVideos = renderLatestVideos;
window.renderStars = renderStars;
