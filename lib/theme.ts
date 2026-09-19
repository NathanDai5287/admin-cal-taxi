export const THEME_COOKIE = "cal-taxi-theme";

export const themeInitScript = `(() => {
  const root = document.documentElement;
  const savedTheme = document.cookie
    .split('; ')
    .find((entry) => entry.startsWith('${THEME_COOKIE}='))
    ?.split('=')[1];
  root.dataset.theme = savedTheme === 'dark' || savedTheme === 'light'
    ? savedTheme
    : window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
})();`;
