// ─── MANAGEMENT ───────────────────────────────────────────────────────────
function updateManagementVisibility() {
  const mgmt = document.getElementById('management-actions');
  if (!mgmt) return;
  const anyChecked = document.querySelectorAll('.manage-check:checked').length > 0;
  mgmt.style.display = (isServerMode && anyChecked) ? 'flex' : 'none';
}

function toggleAllManage(checked) {
  document.querySelectorAll('.manage-check').forEach(cb => cb.checked = checked);
  updateManagementVisibility();
}

async function bulkAction(type) {
  const checks = document.querySelectorAll('.manage-check:checked');
  const ids = Array.from(checks).map(cb => cb.getAttribute('data-id'));

  if (ids.length === 0) return alert("Select at least one video.");

  let body = { videoIds: ids };
  let endpoint = '';

  if (type === 'ban') {
    if (!confirm(`Are you sure you want to BAN ${ids.length} videos?`)) return;
    endpoint = '/api/ban';
  } else if (type === 'flag-source') {
    if (!confirm(`Are you sure you want to FLAG AS SOURCE ${ids.length} videos?`)) return;
    endpoint = '/api/flag-source';
  } else if (type === 'set-lang') {
    const lang = document.getElementById('mgmt-lang-select').value;
    if (!lang) return alert("Please select a language.");
    if (!confirm(`Set language to ${lang} for ${ids.length} videos?`)) return;
    endpoint = '/api/set-lang';
    body.language = lang;
  }

  try {
    const r = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const res = await r.json();
    if (res.success) {
      location.reload();
    } else {
      alert("Error: " + (res.error || "Unknown error"));
    }
  } catch (e) {
    alert("Request failed: " + e.message);
  }
}

// Expose functions to global scope
window.updateManagementVisibility = updateManagementVisibility;
window.toggleAllManage = toggleAllManage;
window.bulkAction = bulkAction;
