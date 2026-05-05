// ─── POOPERS MANAGEMENT ──────────────────────────────────────────────────
let pooperOrphanFilter = false;
let currentPooperPage = 1;
const POOPERS_PAGE_SIZE = 40;
let filteredPoopers = [];
let channelsWithPrimaryContent = new Set();
let channelsWithOtherContent = new Set();

function renderPoopersTable(append = false) {
  const container = document.getElementById('poopers-tbody');
  if (!container) return;

  if (!append) {
    currentPooperPage = 1;
    container.innerHTML = '';
    
    const search = (document.getElementById('pooper-search-input').value || '').toLowerCase();
    
    // Load poopers from dbPoopers
    const channels = window.queryDB("SELECT * FROM channels ORDER BY channel_name ASC", [], window.dbPoopers);
    
    channelsWithPrimaryContent.clear();
    const dbs = [
      { db: window.dbYTP, name: 'ytp' },
      { db: window.dbYTPMV, name: 'ytpmv' },
      { db: window.dbCollabs, name: 'collabs' }
    ];
    
    for (const item of dbs) {
      if (item.db) {
        const res = window.queryDB("SELECT DISTINCT channel_name FROM videos", [], item.db);
        res.forEach(r => channelsWithPrimaryContent.add(r.channel_name));
      }
    }

    channelsWithOtherContent.clear();
    if (window.dbSources) {
      const res = window.queryDB("SELECT DISTINCT channel_name FROM videos", [], window.dbSources);
      res.forEach(r => channelsWithOtherContent.add(r.channel_name));
    }

    filteredPoopers = channels.filter(c => {
      const name = (c.channel_name || '').toLowerCase();
      const url = (c.channel_url || '').toLowerCase();
      const matchesSearch = !search || name.includes(search) || url.includes(search);
      
      if (!matchesSearch) return false;
      
      const isOrphan = !channelsWithPrimaryContent.has(c.channel_name);
      if (pooperOrphanFilter && !isOrphan) return false;
      
      return true;
    });

    document.getElementById('poopers-count-label').textContent = `${filteredPoopers.length} poopers`;
  }

  const start = (currentPooperPage - 1) * POOPERS_PAGE_SIZE;
  const slice = filteredPoopers.slice(start, start + POOPERS_PAGE_SIZE);

  const html = slice.map(c => {
    const types = [];
    if (channelsWithPrimaryContent.has(c.channel_name)) types.push('<span class="badge badge-ytp">Archive</span>');
    if (channelsWithOtherContent.has(c.channel_name)) types.push('<span class="badge badge-other">Sources</span>');
    if (types.length === 0) types.push('<span class="badge badge-empty">None</span>');

    return `
      <tr>
        <td>
          <div style="display:flex; align-items:center; gap:8px;">
            <img src="${getChannelAvatar(c.channel_name)}" style="width:24px; height:24px; border-radius:50%;">
            <strong>${escHtml(c.channel_name)}</strong>
          </div>
        </td>
        <td style="font-size:11px; opacity:0.7;">${escHtml(c.channel_url)}</td>
        <td>${c.subscriber_count ? fmtNum(c.subscriber_count) + ' subs' : 'N/A'}</td>
        <td>${types.join(' ')}</td>
        <td>
          <button class="btn-mgmt" onclick="openProfile('${escAttr(c.channel_name)}')" style="padding: 2px 8px; font-size: 11px;">View</button>
          <button class="btn-mgmt" onclick="removePooper('${escAttr(c.channel_url)}', '${escAttr(c.channel_name)}')" style="padding: 2px 8px; font-size: 11px; background: #c62828;">Remove</button>
        </td>
      </tr>
    `;
  }).join('');

  if (append) {
    container.insertAdjacentHTML('beforeend', html);
  } else {
    container.innerHTML = html || '<tr><td colspan="5" class="empty">No poopers found</td></tr>';
    setupPoopersScrollObserver();
  }
}

let pooperScrollObserver = null;
function setupPoopersScrollObserver() {
  if (pooperScrollObserver) pooperScrollObserver.disconnect();
  const sentinel = document.getElementById('poopers-scroll-sentinel');
  if (!sentinel) return;

  pooperScrollObserver = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting) {
      if (currentPooperPage * POOPERS_PAGE_SIZE < filteredPoopers.length) {
        currentPooperPage++;
        renderPoopersTable(true);
      }
    }
  }, { rootMargin: '400px' });
  pooperScrollObserver.observe(sentinel);
}

function filterOrphanPoopers() {
  pooperOrphanFilter = !pooperOrphanFilter;
  const btn = document.getElementById('btn-filter-orphans');
  if (btn) {
    btn.textContent = pooperOrphanFilter ? "Show All Poopers" : "Filter Sources Only";
    btn.style.background = pooperOrphanFilter ? "var(--accent)" : "";
  }
  renderPoopersTable();
}

async function removePooper(url, name) {
  if (!confirm(`Are you sure you want to remove ${name}?\nThis will DELETE the channel and ALL its videos from ALL databases!`)) return;
  
  try {
    const r = await fetch('/api/remove-channel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channelUrl: url })
    });
    const res = await r.json();
    if (res.success) {
      alert(`Successfully removed ${name} and ${res.deletedVideosCount} videos.`);
      location.reload();
    } else {
      alert("Error: " + (res.error || "Unknown error"));
    }
  } catch (e) {
    alert("Request failed: " + e.message);
  }
}

window.renderPoopersTable = renderPoopersTable;
window.setupPoopersScrollObserver = setupPoopersScrollObserver;
window.filterOrphanPoopers = filterOrphanPoopers;
window.removePooper = removePooper;

function openScrapeModal() {
  document.getElementById('scrape-modal').style.display = 'flex';
  document.getElementById('scrape-channel-url').value = '';
  document.getElementById('scrape-progress-container').style.display = 'none';
  document.getElementById('scrape-log').value = '';
  document.getElementById('scrape-progress-bar').style.width = '0%';
  document.getElementById('scrape-status-text').textContent = 'Ready';
  document.getElementById('btn-start-scrape').disabled = false;
}

function closeScrapeModal() {
  document.getElementById('scrape-modal').style.display = 'none';
}

async function startScrapeChannel() {
  const url = document.getElementById('scrape-channel-url').value.trim();
  if (!url) return alert("Please enter a channel URL");

  document.getElementById('scrape-progress-container').style.display = 'block';
  document.getElementById('btn-start-scrape').disabled = true;
  document.getElementById('scrape-log').value = 'Connecting to server...\n';
  document.getElementById('scrape-status-text').textContent = 'Starting scrape...';
  document.getElementById('scrape-progress-bar').style.width = '10%';

  try {
    const response = await fetch('/api/scrape-channel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channelUrl: url })
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || "Server error");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    const logArea = document.getElementById('scrape-log');

    let done = false;
    while (!done) {
      const { value, done: readerDone } = await reader.read();
      done = readerDone;
      if (value) {
        const text = decoder.decode(value, { stream: true });
        logArea.value += text;
        logArea.scrollTop = logArea.scrollHeight;

        if (text.includes('[1/3] Scraping Videos')) {
          document.getElementById('scrape-status-text').textContent = 'Scraping Videos...';
          document.getElementById('scrape-progress-bar').style.width = '33%';
        } else if (text.includes('[2/3] Scraping Profile')) {
          document.getElementById('scrape-status-text').textContent = 'Scraping Profile...';
          document.getElementById('scrape-progress-bar').style.width = '66%';
        } else if (text.includes('[3/3] Fetching latest metadata')) {
          document.getElementById('scrape-status-text').textContent = 'Finalizing...';
          document.getElementById('scrape-progress-bar').style.width = '90%';
        } else if (text.includes('[SCRAPE_END]')) {
          document.getElementById('scrape-status-text').textContent = 'Scrape Complete!';
          document.getElementById('scrape-progress-bar').style.width = '100%';
        }
      }
    }
    
    alert("Scraping completed!");
    location.reload();
  } catch (e) {
    document.getElementById('scrape-log').value += `\nERROR: ${e.message}`;
    document.getElementById('scrape-status-text').textContent = 'Error';
    document.getElementById('btn-start-scrape').disabled = false;
  }
}

window.openScrapeModal = openScrapeModal;
window.closeScrapeModal = closeScrapeModal;
window.startScrapeChannel = startScrapeChannel;
