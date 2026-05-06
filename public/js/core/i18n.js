export const translations = {
  en: {
    'home': 'Home',
    'channels': 'Channels',
    'saved': 'Saved',
    'playlists': 'Playlists',
    'explore': 'Explore',
    'manager': 'Manager',
    'timeline': 'Timeline',
    'stats': 'Stats',
    'settings': 'Settings',
    'year_limit': 'Year Limit',
    'aspect_ratio': 'Aspect Ratio',
    'ytp_forum': 'YTP Forum',
    'switch_old_mode': 'Switch to Old Mode',
    'switch_modern_mode': 'Switch to Modern Mode',
    'night_mode': 'Night Mode',
    'day_mode': 'Day Mode',
    'language': 'Language',
    'search': 'Search',
    'sources': 'Sources',
    'import': 'Import',
    'help': 'Help',
    'search_placeholder': 'Search',
    'watched': 'Watched',
    'clear_watched': 'Clear history',
    'clear_watched_confirm': 'Are you sure you want to clear your watch history?'
  },
  it: {
    'home': 'Home',
    'channels': 'Canali',
    'saved': 'Salvati',
    'playlists': 'Playlist',
    'explore': 'Esplora',
    'manager': 'Gestione',
    'timeline': 'Timeline',
    'stats': 'Statistiche',
    'settings': 'Impostazioni',
    'year_limit': 'Limite Anno',
    'aspect_ratio': 'Proporzioni',
    'ytp_forum': 'YTP Forum',
    'switch_old_mode': 'Passa alla modalità Vecchia',
    'switch_modern_mode': 'Passa alla modalità Moderna',
    'night_mode': 'Modalità Notte',
    'day_mode': 'Modalità Giorno',
    'language': 'Lingua',
    'search': 'Cerca',
    'sources': 'Fonti',
    'import': 'Importa',
    'help': 'Aiuto',
    'search_placeholder': 'Cerca',
    'watched': 'Guardati',
    'clear_watched': 'Cancella cronologia',
    'clear_watched_confirm': 'Sei sicuro di voler cancellare la cronologia dei video guardati?'
  }
};

let currentLang = localStorage.getItem('ytp-lang') || 'en';

export function getLang() {
  return currentLang;
}

export function setLanguage(lang) {
  if (translations[lang]) {
    currentLang = lang;
    localStorage.setItem('ytp-lang', lang);
    applyTranslations();

    const oldSelector = document.getElementById('lang-selector-old');
    const modernSelector = document.getElementById('lang-selector-modern');
    if (oldSelector) oldSelector.value = lang;
    if (modernSelector) modernSelector.value = lang;
  }
}

export function t(key) {
  return translations[currentLang][key] || translations['en'][key] || key;
}

export function applyTranslations() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (key) {
      if (el.tagName.toLowerCase() === 'input' && el.type === 'text') {
        el.placeholder = t(key);
      } else {
        el.textContent = t(key);
      }
    }
  });
}

window.setLanguage = setLanguage;

export function initI18n() {
  const oldSelector = document.getElementById('lang-selector-old');
  const modernSelector = document.getElementById('lang-selector-modern');
  if (oldSelector) oldSelector.value = currentLang;
  if (modernSelector) modernSelector.value = currentLang;
  applyTranslations();
}

document.addEventListener('DOMContentLoaded', initI18n);
