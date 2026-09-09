export const THEME_COOKIE = "cal-taxi-theme";

// Runs before the body is painted. Explicit preferences are also rendered by
// the server; first-time visitors follow their device's appearance.
export const themeInitScript = `(() => {
  const root = document.documentElement;
  if (!root.dataset.theme) {
    root.dataset.theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
})();`;
