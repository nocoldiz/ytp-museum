function toggleSidebar() {
  document.body.classList.toggle('sidebar-open');
}

function renderChannelCard(c, mode = 'grid') {
  const name = typeof c === 'string' ? c : c.name;
  const avatar = getChannelAvatar(name);
  
  let videosCount, viewsCount, url;
  if (typeof c === 'string') {
    // Search mode typically passes just the name string
    const ytData = getActiveVideos(false);
    const chVideos = ytData.filter(v => v.channel_name === name);
    videosCount = chVideos.length;
    viewsCount = chVideos.reduce((s, v) => s + (v.view_count || 0), 0);
    url = (chVideos.length > 0 && chVideos[0].channel_url) ? chVideos[0].channel_url : `https://www.youtube.com/${name.startsWith('@') ? name : '@' + name}`;
  } else {
    // Channel grid mode passes a rich object
    videosCount = c.videos ? c.videos.length : 0;
    viewsCount = c.totalViews || 0;
    url = c.url || `https://www.youtube.com/${name.startsWith('@') ? name : '@' + name}`;
  }

  const isSelected = typeof selectedChannel !== 'undefined' && selectedChannel === name;
  const cardClass = mode === 'search' ? 'channel-card search-channel-card' : 'channel-card' + (isSelected ? ' selected' : '');
  const avatarClass = mode === 'search' ? 'ch-card-avatar' : 'ch-card-avatar large';

  return `
    <div class="${cardClass}">
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
        <button class="btn-card-action" onclick="event.stopPropagation(); selectChannel('${escAttr(name)}')">Analytics</button>
        <a class="btn-card-action" href="${url}" target="_blank" onclick="event.stopPropagation()">YouTube</a>
      </div>
    </div>`;
}
