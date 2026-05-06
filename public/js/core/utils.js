// ─── UTILS ────────────────────────────────────────────────────────────────
function fmtNum(n) { return n == null ? '-' : n.toLocaleString(); }
function fmtDate(s) {
  if (!s) return '-';
  const d = new Date(s);
  return isNaN(d.getTime()) ? s.slice(0, 10) : d.toLocaleDateString();
}
function fmtBig(n) {
  if (n == null) return '-';
  if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return String(n);
}
function timeAgo(timestamp) {
  if (!timestamp) return '';
  const now = new Date();
  const date = new Date(timestamp * 1000);
  const seconds = Math.floor((now - date) / 1000);

  let interval = Math.floor(seconds / 31536000);
  if (interval >= 1) return interval + " year" + (interval === 1 ? "" : "s") + " ago";
  interval = Math.floor(seconds / 2592000);
  if (interval >= 1) return interval + " month" + (interval === 1 ? "" : "s") + " ago";
  interval = Math.floor(seconds / 86400);
  if (interval >= 1) return interval + " day" + (interval === 1 ? "" : "s") + " ago";
  interval = Math.floor(seconds / 3600);
  if (interval >= 1) return interval + " hour" + (interval === 1 ? "" : "s") + " ago";
  interval = Math.floor(seconds / 60);
  if (interval >= 1) return interval + " minute" + (interval === 1 ? "" : "s") + " ago";
  return "just now";
}
function getStatusEmoji(status) {
  if (status === 'downloaded') return '✅';
  return '🌐';
}

function getLanguageFlag(lang) {
  if (!lang) return '-';
  const maps = {
    'en': '🇬🇧',
    'it': '🇮🇹',
    'es': '🇪🇸',
    'ru': '🇷🇺',
    'fr': '🇫🇷',
    'de': '🇩🇪',
    'pt': '🇵🇹',
    'br': '🇧🇷'
  };
  return maps[lang.toLowerCase()] || '🌐';
}

window.LANGUAGES = [
  { id: 'en', label: 'English', flag: '🇬🇧' },
  { id: 'it', label: 'Italian', flag: '🇮🇹' },
  { id: 'es', label: 'Spanish', flag: '🇪🇸' },
  { id: 'de', label: 'German', flag: '🇩🇪' },
  { id: 'fr', label: 'French', flag: '🇫🇷' },
  { id: 'ru', label: 'Russian', flag: '🇷🇺' },
  { id: 'pt', label: 'Portuguese', flag: '🇵🇹' },
  { id: 'br', label: 'Brazilian', flag: '🇧🇷' },
  { id: 'none', label: 'Unknown', flag: '🌐' }
];

// Expose functions to global scope
window.fmtNum = fmtNum;
window.fmtDate = fmtDate;
window.fmtBig = fmtBig;
window.timeAgo = timeAgo;
window.getStatusEmoji = getStatusEmoji;
window.getLanguageFlag = getLanguageFlag;

function escHtml(s) {
  if (!s) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function escAttr(s) { return String(s || '').replace(/'/g, "\\'").replace(/"/g, '&quot;'); }

window.escHtml = escHtml;
window.escAttr = escAttr;
