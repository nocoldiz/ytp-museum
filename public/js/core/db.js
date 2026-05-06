// ─── QUERY CACHING ────────────────────────────────────────────────────────
const queryCache = new Map();
function getCachedQuery(key, queryFn) {
  if (queryCache.has(key)) return queryCache.get(key);
  const result = queryFn();
  queryCache.set(key, result);
  return result;
}
function clearQueryCache() {
  queryCache.clear();
}

function shouldCache() {
  const host = window.location.hostname;
  return host !== 'localhost' && host !== '127.0.0.1';
}

// ─── SQLITE INITIALIZATION ────────────────────────────────────────────────
let _idbCacheDb = null;
async function openIDB() {
  if (_idbCacheDb) return _idbCacheDb;
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('YTPArchiveCache', 1);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('databases')) {
        db.createObjectStore('databases');
      }
    };
    request.onsuccess = (e) => {
      _idbCacheDb = e.target.result;
      resolve(_idbCacheDb);
    };
    request.onerror = (e) => reject(e.target.error);
    request.onblocked = (e) => {
      console.warn("IndexedDB blocked! Please close other tabs.");
      reject(new Error("IDB blocked"));
    };
  });
}

async function getStoredDB(name) {
  const db = await openIDB();
  return new Promise((resolve) => {
    const transaction = db.transaction('databases', 'readonly');
    const store = transaction.objectStore('databases');
    const request = store.get(name);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
}

async function saveStoredDB(name, buffer) {
  const db = await openIDB();
  const transaction = db.transaction('databases', 'readwrite');
  const store = transaction.objectStore('databases');
  store.put(buffer, name);
}

async function clearIndexedDBCache() {
  try {
    const db = await openIDB();
    const transaction = db.transaction('databases', 'readwrite');
    transaction.objectStore('databases').clear();
    return new Promise((resolve) => {
      transaction.oncomplete = () => {
        console.log("IndexedDB cache cleared.");
        resolve();
      };
      transaction.onerror = (e) => {
        console.error("IndexedDB clear error:", e);
        resolve();
      };
    });
  } catch (e) {
    console.error("Failed to open IDB for clearing:", e);
  }
}

async function fetchAndCache(name) {
  const root = getAppRoot();
  const getUrl = (n) => n.startsWith('db/') ? `${root}${n}` : (['profile_thumbnails', 'playlists.json'].some(x => n.startsWith(x)) ? `${root}${n}` : `${root}db/${n}`);
  
  const mainUrl = getUrl(name);
  try {
    let response = await fetch(mainUrl);
    
    if (!response.ok) {
      console.log(`Main file ${name} not found or error (${response.status}), checking for shards...`);
      let parts = [];
      let partNum = 1;
      while (true) {
        // Try both conventions: .db.part1 and .part1.db
        let partRes = await fetch(getUrl(`${name}.part${partNum}`));
        if (!partRes.ok) {
          // Fallback to name.part1.db if name was comments.db
          const altName = name.replace('.db', '') + `.part${partNum}.db`;
          partRes = await fetch(getUrl(altName));
        }

        if (!partRes.ok) break;
        
        console.log(`Fetching shard: ${name} part ${partNum}`);
        parts.push(await partRes.arrayBuffer());
        partNum++;
      }
      
      if (parts.length > 0) {
        const totalLength = parts.reduce((acc, p) => acc + p.byteLength, 0);
        const combined = new Uint8Array(totalLength);
        let offset = 0;
        for (const p of parts) {
          combined.set(new Uint8Array(p), offset);
          offset += p.byteLength;
        }
        
        // Validate combined buffer
        const header = new TextDecoder().decode(combined.slice(0, 15));
        if (header !== "SQLite format 3") {
          throw new Error(`Combined shards for ${name} do not form a valid SQLite database.`);
        }

        if (shouldCache()) {
          await saveStoredDB(name, combined.buffer);
          console.log(`Successfully cached sharded ${name} (${parts.length} parts)`);
        }
        return combined.buffer;
      }
      
      throw new Error(`Failed to fetch ${mainUrl} or shards. Status: ${response.status}`);
    }
    
    const buffer = await response.arrayBuffer();
    
    // Validate before saving/returning
    const header = new TextDecoder().decode(new Uint8Array(buffer).slice(0, 15));
    if (header === "SQLite format 3") {
      if (shouldCache()) {
        await saveStoredDB(name, buffer);
        console.log(`Successfully cached ${name} from ${mainUrl}`);
      }
      return buffer;
    } else {
      console.error(`Fetched ${mainUrl} is not a valid SQLite database (Header: "${header.substring(0, 20)}")`);
      throw new Error(`Invalid SQLite database header for ${name}`);
    }
  } catch (e) {
    console.error(`Fetch/Cache failed for ${name}:`, e);
    throw e;
  }
}

async function loadDB(name, SQL) {
  try {
    if (shouldCache()) {
      const cached = await getStoredDB(name);
      if (cached) {
      // Validate cached header
      const header = new TextDecoder().decode(new Uint8Array(cached).slice(0, 15));
      if (header === "SQLite format 3") {
        console.log(`Loaded ${name} from cache (Valid SQLite)`);
        // Refresh cache in background
        fetchAndCache(name).catch(() => { });
        return new SQL.Database(new Uint8Array(cached));
      } else {
        console.warn(`Cached ${name} is corrupted (Invalid header). Clearing cache...`);
        const db = await openIDB();
        const transaction = db.transaction('databases', 'readwrite');
        transaction.objectStore('databases').delete(name);
      }
      }
    }
  } catch (e) {
    console.warn(`Cache read error for ${name}:`, e);
  }

  console.log(`Fetching ${name} from network/chunks...`);
  const buffer = await fetchAndCache(name);
  return new SQL.Database(new Uint8Array(buffer));
}

async function forceRefreshDBs() {
  if (!confirm("Are you sure? This will delete the cached databases and redownload them.")) return;
  const db = await openIDB();
  const transaction = db.transaction('databases', 'readwrite');
  transaction.objectStore('databases').clear();
  location.reload();
}

let SQL_INSTANCE = null;

async function initSQLite() {
  const config = {
    locateFile: file => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/${file}`
  };
  const SQL = await initSqlJs(config);
  SQL_INSTANCE = SQL;

  console.log("Loading databases...");
  
  // Load Poopers (channels) - relatively small (3.5MB)
  const poopersPromise = loadDB('ytpoopers.db', SQL).then(db => {
    window.dbPoopers = db;
    if (db) applyLanguageFilters(db);
    return db;
  });

  // Background load for heavy databases
  const ytpPromise = window.enabledSources.ytp ? loadDB('ytp.db', SQL) : Promise.resolve(null);

  ytpPromise.then(db => {
    window.dbYTP = db;
    window.sqlDB = db;
    if (db) applyLanguageFilters(db);
    console.log("Main YTP database loaded.");
    if (window.updateBadges) window.updateBadges();
    
    // If we are in a section that needs the full DB, refresh it
    if (window.handleRouting) {
      console.log("Refreshing view after DB load...");
      handleRouting();
    }
  });

  // We wait for Poopers because it's essential for channel info/avatars
  await poopersPromise;

  // Lazy load extra databases in background based on enabled state

  // Lazy load extra databases in background based on enabled state
  if (window.enabledSources.other && !window.dbSources) {
    loadDB('other.db', SQL).then(db => {
      window.dbSources = db;
      if (db) applyLanguageFilters(db);
      console.log("Other database loaded in background.");
      const sources = queryDB("SELECT DISTINCT channel_name FROM videos", [], window.dbSources);
      window.sourceChannels = new Set(sources.map(s => s.channel_name));
      window.updateBadges();
    });
  }
  
  if (window.enabledSources.ytpmv && !window.dbYTPMV) {
    loadDB('ytpmv.db', SQL).then(db => {
      window.dbYTPMV = db;
      if (db) applyLanguageFilters(db);
      console.log("YTPMV database loaded in background.");
      if (window.updateBadges) window.updateBadges();
    });
  }
  
  if (window.enabledSources.collabs && !window.dbCollabs) {
    loadDB('collabs.db', SQL).then(db => {
      window.dbCollabs = db;
      if (db) applyLanguageFilters(db);
      console.log("Collabs database loaded in background.");
      if (window.updateBadges) window.updateBadges();
    });
  }

  console.log("SQLite initialization completed (respecting source filters).");

  // Apply global filters to all initial databases
  [window.dbYTP, window.dbPoopers, window.dbComments].forEach(db => {
    if (db) applyLanguageFilters(db);
  });

  return window.sqlDB;
}

function openSourcesModal() {
  const modal = document.getElementById('sources-modal');
  if (!modal) return;
  modal.style.display = 'flex';
  
  // Sync checkboxes with state
  const ids = ['ytp', 'ytpmv', 'collabs', 'other', 'comments'];
  ids.forEach(id => {
    const cb = document.getElementById(`source-${id}`);
    if (cb) cb.checked = window.enabledSources[id];
  });

  // Populate and sync languages
  const langList = document.getElementById('languages-list');
  if (langList) {
    langList.innerHTML = window.LANGUAGES.map(l => `
      <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 13px;">
        <input type="checkbox" class="lang-check" data-id="${l.id}" ${window.enabledLanguages.includes(l.id) ? 'checked' : ''} onchange="toggleLanguageState('${l.id}')">
        <span>${l.flag} ${l.label}</span>
      </label>
    `).join('');
  }
}

function closeSourcesModal() {
  const modal = document.getElementById('sources-modal');
  if (modal) modal.style.display = 'none';
}

function toggleSourceState(key) {
  const cb = document.getElementById(`source-${key}`);
  if (cb) {
    window.enabledSources[key] = cb.checked;
    localStorage.setItem('ytp-enabled-sources', JSON.stringify(window.enabledSources));
  }
}

function toggleLanguageState(id) {
  const checks = document.querySelectorAll('.lang-check');
  const enabled = [];
  checks.forEach(c => {
    if (c.checked) enabled.push(c.getAttribute('data-id'));
  });
  window.enabledLanguages = enabled;
  localStorage.setItem('ytp-enabled-languages', JSON.stringify(enabled));
}

function applySources() {
  const ids = ['ytp', 'ytpmv', 'collabs', 'other', 'comments'];
  ids.forEach(id => {
    const cb = document.getElementById(`source-${id}`);
    if (cb) window.enabledSources[id] = cb.checked;
  });
  localStorage.setItem('ytp-enabled-sources', JSON.stringify(window.enabledSources));

  const checks = document.querySelectorAll('.lang-check');
  const enabled = [];
  checks.forEach(c => {
    if (c.checked) enabled.push(c.getAttribute('data-id'));
  });
  window.enabledLanguages = enabled;
  localStorage.setItem('ytp-enabled-languages', JSON.stringify(enabled));
  
  location.reload();
}

function applyLanguageFilters(db) {
  if (!db || !window.enabledLanguages || window.enabledLanguages.length === 0) return;

  const langList = window.enabledLanguages.filter(l => l !== 'none');
  const includeUnknown = window.enabledLanguages.includes('none');

  let langClause = "";
  if (langList.length > 0) {
    langClause = `language IN (${langList.map(l => `'${l}'`).join(',')})`;
  }
  if (includeUnknown) {
    if (langClause) langClause = `(${langClause} OR language IS NULL OR language = '')`;
    else langClause = `(language IS NULL OR language = '')`;
  }

  if (!langClause) return;

  const applyView = (tableName) => {
    try {
      // Check if table exists and hasn't been renamed yet
      const tableCheck = db.exec(`SELECT name FROM sqlite_master WHERE type='table' AND name='${tableName}'`);
      if (tableCheck.length === 0) return;

      // Check if it has a 'language' column
      const tableInfo = db.exec(`PRAGMA table_info(${tableName})`);
      if (tableInfo.length > 0) {
        const columns = tableInfo[0].values.map(v => v[1]);
        if (columns.includes('language')) {
          db.run(`ALTER TABLE ${tableName} RENAME TO _${tableName}_raw`);
          db.run(`CREATE VIEW ${tableName} AS SELECT * FROM _${tableName}_raw WHERE ${langClause}`);
          console.log(`Applied global language filter to ${tableName} table via VIEW.`);
        }
      }
    } catch (e) {
      console.warn(`Could not apply language filter to ${tableName}:`, e);
    }
  };

  applyView('videos');
  applyView('channels');
}

function queryDB(sql, params = [], targetDB = null) {
  let db = targetDB;

  if (!db) {
    const lowerSql = sql.toLowerCase();
    // Intelligent Routing
    if (lowerSql.includes('from channels')) {
      db = window.dbPoopers;
    } else if (lowerSql.includes('from source_pages') || lowerSql.includes('from video_sources')) {
      db = window.dbSources;
    } else if (lowerSql.includes('from comments')) {
      db = window.dbComments;
    } else if (window.appMode === 'sources' && (lowerSql.includes('from videos') || lowerSql.includes('from tags') || lowerSql.includes('from sections'))) {
      db = window.dbSources;
    } else if (window.appMode === 'ytpmv' && (lowerSql.includes('from videos') || lowerSql.includes('from tags') || lowerSql.includes('from sections'))) {
      db = window.dbYTPMV;
    } else if (window.appMode === 'collabs' && (lowerSql.includes('from videos') || lowerSql.includes('from tags') || lowerSql.includes('from sections'))) {
      db = window.dbCollabs;
    } else {
      db = window.dbYTP;
    }
  }

  if (!db) return [];
  try {
    const stmt = db.prepare(sql);
    stmt.bind(params);
    const results = [];
    while (stmt.step()) {
      results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
  } catch (e) {
    console.error('[queryDB] Error executing SQL:', sql, 'Params:', params, 'Error:', e);
    return [];
  }
}

function findVideoAcrossDBs(vidId) {
  const dbs = [window.dbYTP, window.dbSources, window.dbYTPMV, window.dbCollabs];
  for (const db of dbs) {
    if (!db) continue;
    const res = queryDB("SELECT * FROM videos WHERE id = ?", [vidId], db);
    if (res.length > 0) return { video: res[0], db };
  }
  return { video: null, db: null };
}

/**
 * Returns the first row of a query result or an empty object if no results.
 * Prevents "cannot access property x of undefined" crashes.
 */
function queryDBRow(sql, params = [], targetDB = null) {
  const res = queryDB(sql, params, targetDB);
  return res.length > 0 ? res[0] : {};
}


async function ensureCommentsDB() {
  if (window.dbComments) return window.dbComments;
  if (!SQL_INSTANCE) {
    console.error("SQL.js not initialized yet.");
    return null;
  }
  
  console.log("On-demand loading comments.db...");
  const db = await loadDB('comments.db', SQL_INSTANCE);
  window.dbComments = db;
  if (db) applyLanguageFilters(db);
  return db;
}

// Expose functions to global scope
window.queryCache = queryCache;
window.getCachedQuery = getCachedQuery;
window.clearQueryCache = clearQueryCache;
window.openIDB = openIDB;
window.getStoredDB = getStoredDB;
window.saveStoredDB = saveStoredDB;
window.clearIndexedDBCache = clearIndexedDBCache;
window.fetchAndCache = fetchAndCache;
window.loadDB = loadDB;
window.forceRefreshDBs = forceRefreshDBs;
window.initSQLite = initSQLite;
window.openSourcesModal = openSourcesModal;
window.closeSourcesModal = closeSourcesModal;
window.toggleSourceState = toggleSourceState;
window.toggleLanguageState = toggleLanguageState;
window.applySources = applySources;
window.queryDB = queryDB;
window.findVideoAcrossDBs = findVideoAcrossDBs;
window.queryDBRow = queryDBRow;
async function ensureOtherDB() {
  if (window.dbSources) return window.dbSources;
  if (!SQL_INSTANCE) return null;
  
  console.log("Forcing load of other.db...");
  const db = await loadDB('other.db', SQL_INSTANCE);
  window.dbSources = db;
  if (db) {
    applyLanguageFilters(db);
    const sources = queryDB("SELECT DISTINCT channel_name FROM videos", [], db);
    window.sourceChannels = new Set(sources.map(s => s.channel_name));
    if (window.updateBadges) window.updateBadges();
  }
  return db;
}

window.ensureCommentsDB = ensureCommentsDB;
window.ensureOtherDB = ensureOtherDB;
