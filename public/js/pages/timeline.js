// ─── TIMELINE ─────────────────────────────────────────────────────────────
function renderTimeline() {
  const raw = document.getElementById('tl-md').textContent;
  const html = marked.parse(raw);
  const el = document.getElementById('tl-content');
  el.innerHTML = html;
  // Colour-code era headings
  el.querySelectorAll('h2').forEach(h => {
    const m = h.textContent.match(/Era\s+(\d)/);
    if (m) h.dataset.era = m[1];
  });
  // Open all links in new tab
  el.querySelectorAll('a').forEach(a => a.target = '_blank');
}
//document.addEventListener('DOMContentLoaded', renderTimeline);

function getLocalVideoPath(v) {
  if (!v.local_file) return '';
  let path = v.local_file.replace(/\\/g, '/');

  // If the path starts with a generic section folder, try to use the channel folder instead.
  const genericFolders = ["Risorse", "Old sources", "Tutorial per il pooping", "Tutorial"];
  for (const folder of genericFolders) {
    if (path.startsWith(`videos/${folder}/`)) {
      if (v.channel_name) {
        let safeCh = v.channel_name.replace(/[<>:"/\\|?*]/g, '_');
        safeCh = safeCh.replace(/\s+/g, ' ').trim().slice(0, 80);
        path = path.replace(`videos/${folder}/`, `videos/${safeCh}/`);
      }
      break;
    }
  }

  return (path.startsWith('videos/') || path.startsWith('sources/')) ? '../' + path : path;
}

function escHtml(s) {
  if (!s) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function linkify(text) {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  return text.replace(urlRegex, function (url) {
    return `<a href="${url}" target="_blank" rel="noopener noreferrer" style="color: var(--link-color); text-decoration: underline;">${url}</a>`;
  });
}
function escAttr(s) { return String(s || '').replace(/'/g, "\\'").replace(/"/g, '&quot;'); }
function shuffleArray(array) {
  const newArr = [...array];
  for (let i = newArr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArr[i], newArr[j]] = [newArr[j], newArr[i]];
  }
  return newArr;
}

function downloadFile(url, filename) {
  if (event) event.preventDefault();
  fetch(url)
    .then(r => r.blob())
    .then(blob => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
    })
    .catch(err => {
      console.error('Download failed:', err);
      window.open(url, '_blank');
    });
}
// ─── TIMELINE ENGINE ────────────────────────────────────────────────────────
const TS_MIN = new Date(2004, 0, 1).getTime(); // Start from actual YouTube genesis
const TS_MAX = new Date(new Date().getFullYear() + 1, 0, 1).getTime();
const TS_MS_PER_DAY = 86400000;
const TL_MAX_POINTS = 1200;    // More points allowed in SVG than DOM cards
const TL_MIN_LABEL_PX = 40;

const tlEras = [
  { id: 0, name: "Origins", start: "2004-01-01", end: "2007-01-01", color: "era-2" },
  { id: 1, name: "US Golden", start: "2007-01-01", end: "2009-12-31", color: "era-3" },
  { id: 3, name: "IT Golden Era", start: "2010-01-01", end: "2016-12-31", color: "era-5" },
  { id: 4, name: "Adpocalypse", start: "2017-01-01", end: "2022-12-31", color: "era-6" },
  { id: 5, name: "Modern Era", start: "2023-01-01", end: "2026-12-31", color: "era-7" }
];

let timelineSelectedChannels = [];
let timelineVideoType = 'both'; // 'both', 'ytp', 'sources'

function setTimelineVideoType(type, btn) {
  timelineVideoType = type;
  document.querySelectorAll('.tl-type-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  scheduleRender();
}

function handleTimelineFilterKey(e) {
  if (e.key === 'Enter') {
    const val = e.target.value.trim();
    if (val) {
      addTimelineTag(val);
      e.target.value = '';
    }
  }
}

function addTimelineTag(channel) {
  if (!timelineSelectedChannels.includes(channel)) {
    timelineSelectedChannels.push(channel);
    renderTimelineTags();
    scheduleRender();
  }
}

function removeTimelineTag(channel) {
  timelineSelectedChannels = timelineSelectedChannels.filter(c => c !== channel);
  renderTimelineTags();
  scheduleRender();
}

function clearTimelineTags() {
  timelineSelectedChannels = [];
  renderTimelineTags();
  scheduleRender();
}

function renderTimelineTags() {
  const container = document.getElementById('timeline-tags-container');
  if (!container) return;
  container.innerHTML = timelineSelectedChannels.map(ch => `
    <div class="tl-tag">
      ${escHtml(ch)}
      <span class="tl-tag-remove" onclick="removeTimelineTag('${escHtml(ch).replace(/'/g, "\\'")}')">×</span>
    </div>
  `).join('');
}

let ts = {
  initialized: false,
  msPerPixel: 0,
  centerTime: 0,
  isDragging: false,
  startX: 0,
  startCenterTime: 0,
  raf: null
};

function buildFirstUploadCache() {
  const res = queryDB("SELECT id FROM (SELECT id, channel_name, MIN(publish_date) FROM videos WHERE publish_date IS NOT NULL AND channel_name IS NOT NULL GROUP BY channel_name)");
  window.channelFirstUploadIds = new Set(res.map(r => r.id));
}

function initTimeline() {
  const container = document.getElementById('timeline-container');
  if (!container) return;
  buildFirstUploadCache();

  if (!ts.initialized) {
    const w = container.clientWidth;
    ts.msPerPixel = (TS_MAX - TS_MIN) / w;
    ts.centerTime = TS_MIN + (TS_MAX - TS_MIN) / 2;

    container.addEventListener('wheel', e => {
      e.preventDefault();
      const zoomFactor = 1.1;
      const mouseX = e.clientX - container.getBoundingClientRect().left;
      const timeAtMouse = ts.centerTime + (mouseX - container.clientWidth / 2) * ts.msPerPixel;

      if (e.deltaY < 0) ts.msPerPixel /= zoomFactor;
      else ts.msPerPixel *= zoomFactor;

      // Limit zoom
      const minMs = TS_MS_PER_DAY / 500;
      const maxMs = (TS_MAX - TS_MIN) / container.clientWidth;
      ts.msPerPixel = Math.max(minMs, Math.min(maxMs, ts.msPerPixel));

      // Adjust center to zoom towards mouse
      ts.centerTime = timeAtMouse - (mouseX - container.clientWidth / 2) * ts.msPerPixel;

      clampTimeline(container.clientWidth);
      updateZoomSlider();
      scheduleRender();
    }, { passive: false });

    // Zoom slider logic
    const zoomSlider = document.getElementById('timeline-zoom-slider');
    if (zoomSlider) {
      zoomSlider.addEventListener('input', () => {
        const val = parseFloat(zoomSlider.value);
        const minMs = TS_MS_PER_DAY / 500;
        const maxMs = (TS_MAX - TS_MIN) / container.clientWidth;
        const logMin = Math.log(minMs);
        const logMax = Math.log(maxMs);
        const logVal = logMax - (val / 100) * (logMax - logMin);
        ts.msPerPixel = Math.exp(logVal);
        clampTimeline(container.clientWidth);
        scheduleRender();
      });
    }

    container.addEventListener('mousedown', e => {
      if (e.target.closest('.tl-point')) return;
      ts.isDragging = true; ts.startX = e.clientX; ts.startCenterTime = ts.centerTime;
    });
    window.addEventListener('mousemove', e => {
      if (!ts.isDragging) return;
      ts.centerTime = ts.startCenterTime - (e.clientX - ts.startX) * ts.msPerPixel;
      clampTimeline(container.clientWidth);
      scheduleRender();
    });
    window.addEventListener('mouseup', () => { ts.isDragging = false; });

    // Minimap interaction
    const mm = document.getElementById('timeline-minimap-container');
    if (mm) {
      mm.addEventListener('mousedown', e => {
        const x = e.clientX - mm.getBoundingClientRect().left;
        ts.centerTime = TS_MIN + (x / mm.clientWidth) * (TS_MAX - TS_MIN);
        clampTimeline(container.clientWidth);
        scheduleRender();
      });
    }

    ts.initialized = true;
  }

  // Populate channel datalist
  const dl = document.getElementById('timeline-channel-datalist');
  if (dl && dl.children.length === 0) {
    const channelSet = new Set();
    [...allVideos, ...allSources].forEach(v => {
      if (v.channel_name && v.channel_name.trim() !== '' && v.publish_date) {
        channelSet.add(v.channel_name);
      }
    });
    const channels = Array.from(channelSet).sort();
    channels.forEach(ch => {
      const opt = document.createElement('option');
      opt.value = ch;
      dl.appendChild(opt);
    });
  }

  scheduleRender();
}

function updateZoomSlider() {
  const zoomSlider = document.getElementById('timeline-zoom-slider');
  const container = document.getElementById('timeline-container');
  if (!zoomSlider || !container) return;
  const minMs = TS_MS_PER_DAY / 500;
  const maxMs = (TS_MAX - TS_MIN) / container.clientWidth;
  const logMin = Math.log(minMs);
  const logMax = Math.log(maxMs);
  const currentLog = Math.log(ts.msPerPixel);
  zoomSlider.value = ((logMax - currentLog) / (logMax - logMin)) * 100;
}

function jumpToEra(year) {
  if (!year) return;
  ts.centerTime = new Date(parseInt(year), 0, 1).getTime();
  // Set reasonable zoom for the era
  const container = document.getElementById('timeline-container');
  ts.msPerPixel = (TS_MS_PER_DAY * 365) / (container.clientWidth / 1.5);
  clampTimeline(container.clientWidth);
  updateZoomSlider();
  scheduleRender();
}

function clampTimeline(w) {
  const half = (w / 2) * ts.msPerPixel;
  ts.centerTime = Math.max(TS_MIN + half, Math.min(TS_MAX - half, ts.centerTime));
}

function scheduleRender() {
  if (ts.raf) cancelAnimationFrame(ts.raf);
  ts.raf = requestAnimationFrame(renderTimelineView);
}

function getZoomLevel() {
  if (ts.msPerPixel > TS_MS_PER_DAY * 90) return 'years';
  if (ts.msPerPixel > TS_MS_PER_DAY * 2.5) return 'months';
  return 'days';
}

// ── tick interval config per zoom ──────────────────────────────────────────
function getTickConfig(zoom) {
  if (zoom === 'years') return {
    start: d => { d.setMonth(0, 1); d.setHours(0, 0, 0, 0); },
    advance: d => d.setFullYear(d.getFullYear() + 1),
    label: d => String(d.getFullYear()),
    isMajor: () => true
  };
  if (zoom === 'months') return {
    start: d => { d.setDate(1); d.setHours(0, 0, 0, 0); },
    advance: d => d.setMonth(d.getMonth() + 1),
    label: d => d.toLocaleString('default', { month: 'short' }) + ' ' + d.getFullYear(),
    isMajor: d => d.getMonth() === 0
  };
  // days
  return {
    start: d => d.setHours(0, 0, 0, 0),
    advance: d => d.setDate(d.getDate() + 1),
    label: d => d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }),
    isMajor: d => d.getDate() === 1
  };
}

function renderTimelineView() {
  const container = document.getElementById('timeline-container');
  if (!container) return;

  const W = container.clientWidth;
  const H = container.clientHeight;
  const half = W / 2;
  const startT = ts.centerTime - half * ts.msPerPixel;
  const endT = ts.centerTime + half * ts.msPerPixel;

  // 1. Prepare SVG
  let svg = container.querySelector('svg.tl-svg');
  if (!svg) {
    svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "tl-svg");
    container.appendChild(svg);
  }
  svg.innerHTML = ''; // Clear for re-render (optimized with fragments if needed)

  // 2. Render Era Backgrounds
  tlEras.forEach(era => {
    const tStart = new Date(era.start).getTime();
    const tEnd = new Date(era.end).getTime();
    if (tEnd < startT || tStart > endT) return;

    const x1 = Math.max(0, (tStart - startT) / ts.msPerPixel);
    const x2 = Math.min(W, (tEnd - startT) / ts.msPerPixel);

    const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    rect.setAttribute("x", x1);
    rect.setAttribute("y", 0);
    rect.setAttribute("width", x2 - x1);
    rect.setAttribute("height", H);
    rect.setAttribute("class", `tl-era-zone ${era.color}`);
    svg.appendChild(rect);

    const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
    label.setAttribute("x", (x1 + x2) / 2);
    label.setAttribute("y", 35);
    label.setAttribute("class", "tl-era-label");
    label.setAttribute("text-anchor", "middle");
    label.textContent = era.name;
    svg.appendChild(label);
  });

  // 3. Render Lanes & Grid
  const LANE_H = 50;
  const AXIS_H = 60;

  // Use selected channels for lanes, or empty for "Most Viewed" view
  const topChannels = [...timelineSelectedChannels];
  const lanesCount = topChannels.length;

  if (lanesCount > 0) {
    topChannels.forEach((ch, i) => {
      const y = i * LANE_H + 100;
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", 0); line.setAttribute("y1", y);
      line.setAttribute("x2", W); line.setAttribute("y2", y);
      line.setAttribute("class", "tl-lane-line");
      svg.appendChild(line);

      const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
      label.setAttribute("x", 10);
      label.setAttribute("y", y - 8);
      label.setAttribute("fill", "var(--accent)");
      label.setAttribute("font-weight", "bold");
      label.setAttribute("font-size", "12px");
      label.textContent = ch;
      svg.appendChild(label);
    });
  } else {
    // Single lane for most viewed
    const y = H / 2;
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", 0); line.setAttribute("y1", y);
    line.setAttribute("x2", W); line.setAttribute("y2", y);
    line.setAttribute("class", "tl-lane-line");
    line.setAttribute("style", "stroke-width: 2px; stroke: var(--accent); opacity: 0.2;");
    svg.appendChild(line);

    const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
    label.setAttribute("x", 10);
    label.setAttribute("y", y - 10);
    label.setAttribute("fill", "var(--text-muted)");
    label.setAttribute("font-size", "14px");
    label.setAttribute("font-weight", "bold");
    label.textContent = "Most Viewed (Milestones)";
    svg.appendChild(label);
  }

  // 4. Render Points
  const baseList = timelineVideoType === 'ytp' ? allVideos :
    timelineVideoType === 'sources' ? allSources :
      [...allVideos, ...allSources];

  let visible = baseList.filter(v => {
    if (!v.publish_date) return false;
    const t = new Date(v.publish_date).getTime();
    if (t < startT || t > endT) return false;

    if (lanesCount === 0) {
      // Only show most viewed (>1M) if no channels selected
      return (v.view_count || 0) >= 1_000_000;
    } else {
      // Show videos from selected channels
      return timelineSelectedChannels.includes(v.channel_name);
    }
  });

  // Cap points for performance
  visible.sort((a, b) => (b.view_count || 0) - (a.view_count || 0));
  visible = visible.slice(0, TL_MAX_POINTS);

  visible.forEach(v => {
    const t = new Date(v.publish_date).getTime();
    const x = (t - startT) / ts.msPerPixel;
    const laneIdx = topChannels.indexOf(v.channel_name);

    let y;
    if (lanesCount === 0) {
      y = H / 2;
    } else {
      y = laneIdx * LANE_H + 100;
    }

    const point = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    point.setAttribute("cx", x);
    point.setAttribute("cy", y);

    // Scale radius by views (logarithmic)
    const views = v.view_count || 0;
    const radius = 3.5 + Math.log10(Math.max(1, views)) * 1.2;
    const isMilestone = views >= 1_000_000;

    point.setAttribute("r", radius);
    point.setAttribute("class", `tl-point ${isMilestone ? 'milestone' : ''}`);
    point.setAttribute("fill", isMilestone ? "gold" : "var(--accent)");

    point.onmouseenter = (e) => showTimelineTooltip(v, e);
    point.onmouseleave = hideTimelineTooltip;
    point.onclick = () => openVideo(v.id);

    svg.appendChild(point);
  });

  renderMinimap();
}

function renderMinimap() {
  const canvas = document.getElementById('timeline-minimap');
  const viewbox = document.getElementById('timeline-minimap-viewbox');
  if (!canvas || !viewbox) return;

  const W = canvas.clientWidth;
  const H = canvas.clientHeight;
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, W, H);

  // Draw density
  const buckets = 100;
  const counts = new Array(buckets).fill(0);
  allVideos.forEach(v => {
    if (!v.publish_date) return;
    const t = new Date(v.publish_date).getTime();
    const idx = Math.floor(((t - TS_MIN) / (TS_MAX - TS_MIN)) * buckets);
    if (idx >= 0 && idx < buckets) counts[idx]++;
  });

  const max = Math.max(...counts);
  ctx.fillStyle = 'var(--accent)';
  counts.forEach((c, i) => {
    const h = (c / max) * H;
    ctx.fillRect((i / buckets) * W, H - h, (W / buckets) - 1, h);
  });

  // Update viewbox
  const container = document.getElementById('timeline-container');
  const half = (container.clientWidth / 2) * ts.msPerPixel;
  const startT = ts.centerTime - half;
  const endT = ts.centerTime + half;

  const x1 = ((startT - TS_MIN) / (TS_MAX - TS_MIN)) * W;
  const x2 = ((endT - TS_MIN) / (TS_MAX - TS_MIN)) * W;
  viewbox.style.left = `${x1}px`;
  viewbox.style.width = `${x2 - x1}px`;
}

function showTimelineTooltip(v, e) {
  const tt = document.getElementById('timeline-tooltip');
  if (!tt) return;

  const views = v.view_count ? fmtBig(v.view_count) + ' views' : 'No views';
  const date = new Date(v.publish_date).toLocaleDateString();

  tt.innerHTML = `
    <img src="${v.thumbnail || 'https://i.ytimg.com/vi/' + v.id + '/mqdefault.jpg'}" class="tl-tooltip-thumb">
    <div class="tl-tooltip-content">
      <div class="tl-tooltip-title">${escHtml(v.title || v.id)}</div>
      <div class="tl-tooltip-meta">
        <span>${escHtml(v.channel_name || '?')}</span>
        <span>${views} • ${date}</span>
      </div>
    </div>
  `;

  tt.style.display = 'block';
  tt.style.left = `${e.clientX}px`;
  tt.style.top = `${e.clientY}px`;
  tt.style.opacity = '1';
}

function hideTimelineTooltip() {
  const tt = document.getElementById('timeline-tooltip');
  if (tt) {
    tt.style.opacity = '0';
    setTimeout(() => { if (tt.style.opacity === '0') tt.style.display = 'none'; }, 200);
  }
}



// Expose functions to global scope
window.renderTimeline = renderTimeline;
window.getLocalVideoPath = getLocalVideoPath;
window.escHtml = escHtml;
window.linkify = linkify;
window.escAttr = escAttr;
window.shuffleArray = shuffleArray;
window.downloadFile = downloadFile;
window.setTimelineVideoType = setTimelineVideoType;
window.handleTimelineFilterKey = handleTimelineFilterKey;
window.addTimelineTag = addTimelineTag;
window.removeTimelineTag = removeTimelineTag;
window.clearTimelineTags = clearTimelineTags;
window.renderTimelineTags = renderTimelineTags;
window.buildFirstUploadCache = buildFirstUploadCache;
window.initTimeline = initTimeline;
window.updateZoomSlider = updateZoomSlider;
window.jumpToEra = jumpToEra;
window.clampTimeline = clampTimeline;
window.scheduleRender = scheduleRender;
window.getZoomLevel = getZoomLevel;
window.getTickConfig = getTickConfig;
window.renderTimelineView = renderTimelineView;
window.renderMinimap = renderMinimap;
window.showTimelineTooltip = showTimelineTooltip;
window.hideTimelineTooltip = hideTimelineTooltip;
