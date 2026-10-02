// Run in <head> so every route starts in the saved appearance without a flash.
(() => {
  const key = 'thinking-lab:appearance';
  const root = document.documentElement;
  const system = matchMedia('(prefers-color-scheme: dark)');
  let preference = null;
  const valid = value => value === 'light' || value === 'dark' ? value : null;
  try { preference = valid(localStorage.getItem(key)); } catch {}
  function apply() {
    const theme = preference || (system.matches ? 'dark' : 'light');
    root.dataset.theme = theme;
    const button = document.querySelector('[data-appearance]');
    if (button) {
      const label = `Appearance: switch to ${theme === 'light' ? 'dark' : 'light'} mode`;
      button.setAttribute('aria-label', label);
      button.title = label;
    }
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#24212c' : '#faf8f2');
  }
  document.addEventListener('click', event => {
    if (!event.target.closest('[data-appearance]')) return;
    preference = root.dataset.theme === 'light' ? 'dark' : 'light';
    try { localStorage.setItem(key, preference); } catch {}
    apply();
  });
  system.addEventListener('change', () => { if (!preference) apply(); });
  addEventListener('storage', event => {
    if (event.key === key || event.key === null) { preference = valid(event.newValue); apply(); }
  });
  document.addEventListener('DOMContentLoaded', apply);
  document.addEventListener('lab:shell-ready', apply);
  apply();
})();
