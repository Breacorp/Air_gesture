const themeKey = 'air-gesture-theme';
const root = document.documentElement;
const themeButton = document.querySelector('[data-theme-toggle]');
const themeLabel = themeButton?.querySelector('[data-theme-label]');
const themeColor = document.querySelector('#theme-color');

function applyTheme(theme) {
  root.dataset.theme = theme;

  const nextTheme = theme === 'light' ? 'dark' : 'light';
  const nextThemeLabel = nextTheme === 'light' ? 'claro' : 'oscuro';
  themeButton?.setAttribute('aria-label', `Cambiar a modo ${nextThemeLabel}`);
  themeButton?.setAttribute('title', `Cambiar a modo ${nextThemeLabel}`);

  if (themeLabel) {
    themeLabel.textContent = `Modo ${theme === 'light' ? 'claro' : 'oscuro'}`;
  }

  if (themeColor) {
    themeColor.content = theme === 'light' ? '#F8FAFC' : '#0B0B10';
  }
}

applyTheme(root.dataset.theme);

themeButton?.addEventListener('click', () => {
  const theme = root.dataset.theme === 'light' ? 'dark' : 'light';
  localStorage.setItem(themeKey, theme);
  applyTheme(theme);
});
