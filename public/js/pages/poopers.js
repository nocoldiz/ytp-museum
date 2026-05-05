// ─── POOPERS MANAGEMENT ──────────────────────────────────────────────────
let pooperOrphanFilter = false;

function renderPoopersTable() {
  const container = document.getElementById('poopers-tbody');
  if (!container) return;

  const search = (document.getElementById('pooper-search-input').value || '').toLowerCase();
  
  // Load poopers from dbPoopers
  const channels = queryDB("SELECT * FROM channels ORDER BY channel_name ASC", [], window.dbPoopers);
  
  // To detect "orphan" poopers, we need to check if they have videos in YTP, YTPMV, Collabs
  // Since we are doing this in the UI, we can build a map of channels that HAVE such videos.
  const channelsWithPrimaryContent = new Set();
  
  const dbs = [
    { db: window.dbYTP, name: 'ytp' },
    { db: window.dbYTPMV, name: 'ytpmv' },
    { db: window.dbCollabs, name: 'collabs' }
  ];
  
  for (const item of dbs) {
    if (item.db) {
      const res = queryDB("SELECT DISTINCT channel_name FROM videos", [], item.db);
      res.forEach(r => channelsWithPrimaryContent.add(r.channel_name));
    }
  }

  // Also check "others.db" to see if they have content there
  const channelsWithOtherContent = new Set();
  if (window.dbSources) {
    const res = queryDB("SELECT DISTINCT channel_name FROM videos", [], window.dbSources);
    res.forEach(r => channelsWithOtherContent.add(r.channel_name));
  }

  const filtered = channels.filter(c => {
    const name = (c.channel_name || '').toLowerCase();
    const url = (c.channel_url || '').toLowerCase();
    const matchesSearch = !search || name.includes(search) || url.includes(search);
    
    if (!matchesSearch) return false;
    
    const isOrphan = !channelsWithPrimaryContent.has(c.channel_name);
    if (pooperOrphanFilter && !isOrphan) return false;
    
    return true;
  });

  document.getElementById('poopers-count-label').textContent = `${filtered.length} poopers`;

  container.innerHTML = filtered.map(c => {
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
window.filterOrphanPoopers = filterOrphanPoopers;
window.removePooper = removePooper;
