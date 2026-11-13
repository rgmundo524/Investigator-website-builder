// Inlined in <head> so navigation restores the theme before the first paint.
// sessionStorage follows this tab's page session rather than a lasting preference.
(() => {
  const key = 'personal-site-theme';
  const readTheme = (fallback) => {
    try {
      const saved = window.sessionStorage.getItem(key);
      return saved === 'light' || saved === 'dark' ? saved : fallback;
    } catch { return fallback; }
  };
  const applyTheme = (theme) => {
    document.documentElement.dataset.theme = theme;
    const toggle = document.querySelector('.theme-toggle');
    if (!toggle) return;
    toggle.setAttribute('aria-pressed', String(theme === 'dark'));
    toggle.setAttribute('title', theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
  };
  const restoreTheme = () => applyTheme(readTheme(document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'));
  restoreTheme();
  document.addEventListener('DOMContentLoaded', () => {
    const toggle = document.querySelector('.theme-toggle');
    if (!toggle) return;
    restoreTheme();
    toggle.hidden = false;
    toggle.addEventListener('click', () => {
      const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      try { window.sessionStorage.setItem(key, next); } catch { /* Toggle still works if storage is blocked. */ }
    });
  }, { once: true });
  // Back/forward cache may restore a page painted before the latest choice.
  window.addEventListener('pageshow', restoreTheme);
})();
