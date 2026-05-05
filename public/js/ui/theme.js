// ─── THEME TOGGLES & SEARCH ────────────────────────────────────────────────
function toggleThemeMode() {
  const isOld = document.body.classList.toggle('theme-old');
  const btn = document.getElementById('toggle-modern-old');
  if (btn) btn.textContent = isOld ? 'Switch to Modern Mode' : 'Switch to Old Mode';

  localStorage.setItem('lastThemeMode', isOld ? 'old' : 'modern');

  // Restore aspect ratio for this mode
  const ratio = localStorage.getItem(isOld ? 'aspectRatioOld' : 'aspectRatioModern') || (isOld ? '4-3' : '16-9');
  setAspectRatio(ratio, false);

  syncSearchLayout();

  if (typeof updateVideoLayoutForTheme === 'function') updateVideoLayoutForTheme();

  handleRouting();
}

function syncSearchLayout() {
  const isOld = document.body.classList.contains('theme-old');
  const searchBar = document.getElementById('masthead-search');
  if (searchBar) {
    if (isOld) {
      const nav = document.getElementById('masthead-nav');
      if (nav) nav.appendChild(searchBar);
    } else {
      const navRight = document.getElementById('masthead-nav-right');
      if (navRight) navRight.appendChild(searchBar);
    }
  }
}

function toggleNightDay() {
  const isLight = document.body.classList.toggle('theme-light');
  document.body.classList.toggle('theme-dark', !isLight);
  const btn = document.getElementById('toggle-night-day');
  if (btn) btn.textContent = isLight ? 'Switch to Night Mode' : 'Switch to Day Mode';
}

let searchDebounceTimer;
let selectedSuggestionIndex = -1;

function onGlobalSearchInput() {
  const q = document.getElementById('global-search-input').value.trim();
  const suggestionsBox = document.getElementById('search-suggestions');

  if (!q) {
    suggestionsBox.style.display = 'none';
    return;
  }

  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(() => {
    const qp = `%${q}%`;

    // Search channels
    const channels = queryDB("SELECT channel_name as text FROM channels WHERE channel_name LIKE ? LIMIT 5", [qp]);

    // Search video titles across all active databases
    const videoDBs = [window.dbYTP, window.dbSources, window.dbYTPMV, window.dbCollabs];
    let allVideosList = [];
    for (const db of videoDBs) {
      if (db) {
        const results = window.queryDB("SELECT title as text FROM videos WHERE title LIKE ? LIMIT 10", [qp], db);
        allVideosList = allVideosList.concat(results);
      }
    }
    
    // Sort combined videos and limit to top 10
    const videos = allVideosList.slice(0, 10);

    let results = [
      ...channels.map(c => ({ ...c, type: 'channel' })),
      ...videos.map(v => ({ ...v, type: 'video' }))
    ];

    if (results.length > 0) {
      selectedSuggestionIndex = -1;
      suggestionsBox.innerHTML = results.map((r, i) => `
        <div class="suggestion-item" onclick="selectSuggestion('${escAttr(r.text)}')">
          <span class="suggestion-text">${escHtml(r.text)}</span>
          <span class="suggestion-type">${r.type}</span>
        </div>
      `).join('');
      suggestionsBox.style.display = 'block';
    } else {
      suggestionsBox.style.display = 'none';
    }
  }, 150);
}

function selectSuggestion(text) {
  const input = document.getElementById('global-search-input');
  input.value = text;
  document.getElementById('search-suggestions').style.display = 'none';
  performSearch(text);
}

document.getElementById('global-search-input').addEventListener('keydown', (e) => {
  const suggestionsBox = document.getElementById('search-suggestions');
  const items = suggestionsBox.querySelectorAll('.suggestion-item');

  if (suggestionsBox.style.display === 'block' && items.length > 0) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectedSuggestionIndex = (selectedSuggestionIndex + 1) % items.length;
      updateSuggestionSelection(items);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectedSuggestionIndex = (selectedSuggestionIndex - 1 + items.length) % items.length;
      updateSuggestionSelection(items);
    } else if (e.key === 'Escape') {
      suggestionsBox.style.display = 'none';
    } else if (e.key === 'Enter' && selectedSuggestionIndex >= 0) {
      e.preventDefault();
      items[selectedSuggestionIndex].click();
      return;
    }
  }

  if (e.key === 'Enter') {
    const q = e.target.value.trim();
    performSearch(q);
  }
});

function updateSuggestionSelection(items) {
  items.forEach((item, i) => {
    item.classList.toggle('selected', i === selectedSuggestionIndex);
  });
  if (selectedSuggestionIndex >= 0) {
    // Optionally update input as user arrows through, like Google
    // document.getElementById('global-search-input').value = items[selectedSuggestionIndex].querySelector('.suggestion-text').textContent;
  }
}

// Hide suggestions on outside click
document.addEventListener('click', (e) => {
  if (!e.target.closest('.search-form')) {
    const box = document.getElementById('search-suggestions');
    if (box) box.style.display = 'none';
  }
});

function getChannelAvatar(channelName) {
  const p = pooperMap[channelName];
  if (p && p.thumbnail) {
    // If it already has the prefix, use it as is, otherwise add it.
    // We moved them to public/profile_thumbnails/
    return p.thumbnail.startsWith('profile_thumbnails/') ? p.thumbnail : 'profile_thumbnails/' + p.thumbnail;
  }
  return 'https://upload.wikimedia.org/wikipedia/commons/8/89/Portrait_Placeholder.png';
}


// Expose functions to global scope
window.toggleThemeMode = toggleThemeMode;
window.syncSearchLayout = syncSearchLayout;
window.toggleNightDay = toggleNightDay;
window.onGlobalSearchInput = onGlobalSearchInput;
window.selectSuggestion = selectSuggestion;
window.updateSuggestionSelection = updateSuggestionSelection;
window.getChannelAvatar = getChannelAvatar;
