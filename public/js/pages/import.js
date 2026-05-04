// ─── IMPORT LOGIC ──────────────────────────────────────────────────────────
let currentImportMode = 'mass';

function openImportModal() {
  const modal = document.getElementById('import-modal');
  if (modal) {
    modal.style.display = 'flex';
    toggleImportMode('mass'); // Reset to mass by default

    // Populate uploader datalist
    const uploaderDl = document.getElementById('uploader-channel-datalist');
    const mainDl = document.getElementById('channel-datalist');
    if (uploaderDl && mainDl) {
      uploaderDl.innerHTML = mainDl.innerHTML;
    }
  }
}

function closeImportModal() {
  const modal = document.getElementById('import-modal');
  if (modal) modal.style.display = 'none';

  // Reset progress
  document.getElementById('upload-progress-container').style.display = 'none';
  document.getElementById('upload-progress-bar').style.width = '0%';
  document.getElementById('btn-import-submit').disabled = false;
}

function toggleImportMode(mode) {
  currentImportMode = mode;
  const formMass = document.getElementById('form-import-mass');
  const formSingle = document.getElementById('form-import-single');
  const tabMass = document.getElementById('tab-import-mass');
  const tabSingle = document.getElementById('tab-import-single');
  const submitBtn = document.getElementById('btn-import-submit');

  if (mode === 'mass') {
    formMass.style.display = 'block';
    formSingle.style.display = 'none';
    tabMass.classList.add('active');
    tabMass.style.color = 'var(--text)';
    tabSingle.classList.remove('active');
    tabSingle.style.color = 'var(--text-muted)';
    submitBtn.innerText = 'Import';
  } else {
    formMass.style.display = 'none';
    formSingle.style.display = 'block';
    tabMass.classList.remove('active');
    tabMass.style.color = 'var(--text-muted)';
    tabSingle.classList.add('active');
    tabSingle.style.color = 'var(--text)';
    submitBtn.innerText = 'Upload & Import';
  }
}

async function submitImport() {
  if (currentImportMode === 'mass') {
    await submitMassImport();
  } else {
    await submitSingleUpload();
  }
}

async function submitMassImport() {
  const urlsText = document.getElementById('import-urls').value;
  const target = document.getElementById('import-target').value;

  if (!urlsText.trim()) {
    alert("Please enter at least one URL.");
    return;
  }

  // Split by newline, comma, or space
  const urls = urlsText.split(/[\n,\s]+/).filter(u => u.trim());

  try {
    const r = await fetch('/api/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls, target })
    });
    const result = await r.json();

    if (result.success) {
      alert(`Successfully added ${result.results.added.length} videos. ${result.results.skipped.length} were skipped (invalid or duplicates).`);
      closeImportModal();
      location.reload();
    } else {
      alert("Error: " + result.error);
    }
  } catch (e) {
    alert("Failed to connect to server.");
  }
}

async function submitSingleUpload() {
  const fileInput = document.getElementById('upload-file');
  const title = document.getElementById('upload-title').value.trim();
  const channel = document.getElementById('upload-channel').value.trim() || 'Unknown';
  const type = document.getElementById('upload-type').value;
  const id = document.getElementById('upload-id').value.trim();
  const channelUrl = document.getElementById('upload-channel-url').value.trim();
  const date = document.getElementById('upload-date').value;
  const lang = document.getElementById('upload-lang').value;
  const tags = document.getElementById('upload-tags').value.split(',').map(s => s.trim()).filter(Boolean);

  if (!fileInput.files.length) {
    alert("Please select a video file.");
    return;
  }
  if (!title) {
    alert("Please enter a title.");
    return;
  }
  if (!type) {
    alert("Please select a video type (YTP or Other).");
    return;
  }

  const file = fileInput.files[0];
  const submitBtn = document.getElementById('btn-import-submit');
  const progressContainer = document.getElementById('upload-progress-container');
  const progressBar = document.getElementById('upload-progress-bar');
  const progressText = document.getElementById('upload-progress-text');

  submitBtn.disabled = true;
  progressContainer.style.display = 'flex';

  // Use XMLHttpRequest for progress tracking
  const xhr = new XMLHttpRequest();
  xhr.open('POST', '/api/upload');

  // Set metadata in headers (encoded to handle special characters)
  xhr.setRequestHeader('X-Video-Title', encodeURIComponent(title));
  xhr.setRequestHeader('X-Video-Channel-Name', encodeURIComponent(channel));
  xhr.setRequestHeader('X-Video-Channel-URL', encodeURIComponent(channelUrl));
  xhr.setRequestHeader('X-Video-Type', type);
  xhr.setRequestHeader('X-Video-ID', encodeURIComponent(id));
  xhr.setRequestHeader('X-Video-Date', date);
  xhr.setRequestHeader('X-Video-Lang', lang);
  xhr.setRequestHeader('X-Video-Tags', encodeURIComponent(JSON.stringify(tags)));
  xhr.setRequestHeader('X-File-Name', encodeURIComponent(file.name));

  xhr.upload.onprogress = (e) => {
    if (e.lengthComputable) {
      const pct = Math.round((e.loaded / e.total) * 100);
      progressBar.style.width = pct + '%';
      progressText.innerText = pct + '%';
    }
  };

  xhr.onload = () => {
    submitBtn.disabled = false;
    let result;
    try {
      result = JSON.parse(xhr.responseText);
    } catch (e) {
      result = { success: false, error: "Invalid server response" };
    }

    if (xhr.status === 200 && result.success) {
      alert("Video uploaded and indexed successfully!");
      closeImportModal();
      location.reload();
    } else {
      alert("Upload failed: " + (result.error || "Unknown error"));
    }
  };

  xhr.onerror = () => {
    submitBtn.disabled = false;
    alert("Connection error during upload.");
  };

  xhr.send(file);
}

function renderVideoItem(v, mode = 'list') {
  const title = v.title || v.id;
  const channel = v.channel_name || 'Unknown';
  const views = v.view_count != null ? fmtNum(v.view_count) + ' views' : '';
  const desc = v.description ? v.description.slice(0, 110) + (v.description.length > 110 ? '...' : '') : '';
  const thumbUrl = `https://i.ytimg.com/vi/${v.id}/mqdefault.jpg`;
  const dur = v.duration || '';

  const isFirst = window.channelFirstUploadIds && window.channelFirstUploadIds.has(v.id);
  const starBadge = isFirst ? `<span class="tl-star" title="First upload by ${escAttr(channel)}">★</span> ` : '';
  const avatar = getChannelAvatar(channel);

  const is169 = document.body.classList.contains('aspect-ratio-16-9');

  if (mode === 'grid') {
    // In modern mode, always use modern card for grid
    if (!document.body.classList.contains('theme-old') || is169) {
      return renderModernHomeCard(v);
    }

    // Classic Grid Layout (for 4:3)
    return `
    <div class="video-item grid">
      <a href="#" onclick="event.preventDefault(); event.stopPropagation(); openVideo('${v.id}')" class="video-thumb">
        <img src="${thumbUrl}" alt="" loading="lazy">
        ${dur ? `<span class="video-time">${escHtml(dur)}</span>` : ''}
      </a>
      <div class="video-info">
        <a href="watch?v=${v.id}" onclick="event.preventDefault(); event.stopPropagation(); openVideo('${v.id}')" class="video-title" title="${escAttr(title)}">${starBadge}${escHtml(title)}</a>
        <div class="video-meta" style="display:flex; align-items:center; gap:6px;">
          <img src="${avatar}" style="width:20px; height:20px; border-radius:50%; object-fit:cover;" loading="lazy">
          <div style="flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
            <a href="#" onclick="return openProfile('${escAttr(channel)}')">${escHtml(channel)}</a>
            ${views ? `<br><span>${views}</span>` : ''}
          </div>
        </div>
      </div>
    </div>`;
  }

  if (mode === 'list') {
    // In modern mode, always use modern list style
    if (!document.body.classList.contains('theme-old') || is169) {
      return `
        <div class="video-item modern-list" onclick="openVideo('${v.id}')">
          <div class="modern-list-thumb">
            <img src="${thumbUrl}" alt="" loading="lazy">
            ${dur ? `<span class="video-time">${escHtml(dur)}</span>` : ''}
          </div>
          <div class="modern-list-info">
            <h3 class="modern-list-title">${starBadge}${escHtml(title)}</h3>
            <div class="modern-list-meta">
              ${views ? `<span>${views}</span>` : ''}
              <span class="dot-sep">•</span>
              <span>${fmtDate(v.publish_date)}</span>
            </div>
            <div class="modern-list-channel" onclick="event.stopPropagation(); openProfile('${escAttr(channel)}')">
              <img src="${avatar}" alt="" loading="lazy">
              <span>${escHtml(channel)}</span>
            </div>
            <div class="modern-list-desc">${escHtml(desc)}</div>
          </div>
        </div>`;
    }

    // Classic List Layout (for 4:3)
    return `
    <div class="video-item list" onclick="openVideo('${v.id}')" style="cursor:pointer;">
      <div class="yt-list-thumb">
        <a href="#" onclick="event.preventDefault(); event.stopPropagation(); openVideo('${v.id}')">
          <img src="${thumbUrl}" alt="" loading="lazy">
          ${dur ? `<span class="video-time">${escHtml(dur)}</span>` : ''}
        </a>
      </div>
      <div class="yt-list-info">
        <a href="watch?v=${v.id}" onclick="event.preventDefault(); event.stopPropagation(); openVideo('${v.id}')" class="yt-list-title">${starBadge}${escHtml(title)}</a>
        ${desc ? `<div class="yt-list-desc">${escHtml(desc)}</div>` : ''}
        <div class="yt-list-meta">
          <span class="yt-stars">${renderStars(v.view_count)}</span>
          ${views ? `<span class="yt-views">${views}</span>` : ''}
          <div style="display:flex; align-items:center; gap:6px;">
            <img src="${avatar}" style="width:20px; height:20px; border-radius:50%; object-fit:cover;" loading="lazy">
            <a href="#" class="yt-channel" onclick="event.stopPropagation();return openProfile('${escAttr(channel)}')">${escHtml(channel)}</a>
          </div>
        </div>
      </div>
    </div>`;
  }
}


// Expose functions to global scope
window.openImportModal = openImportModal;
window.closeImportModal = closeImportModal;
window.toggleImportMode = toggleImportMode;
window.submitImport = submitImport;
window.submitMassImport = submitMassImport;
window.submitSingleUpload = submitSingleUpload;
window.renderVideoItem = renderVideoItem;
