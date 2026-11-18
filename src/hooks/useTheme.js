import { useCallback, useState } from 'react';

const STORAGE_KEY = 'theme';
const THEME_COLORS = { dark: '#11100e', light: '#ffffff' }; // browser UI colour on phones

/**
 * The colour theme: 'dark' (default) or 'light'.
 * It lives on <html data-theme="light">, which index.html sets before the first paint from localStorage,
 * so there's no flash of the wrong theme on reload.
 */
export default function useTheme() {
  const [theme, setThemeState] = useState(() =>
    document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'
  );

  const setTheme = useCallback((next) => {
    if (next === 'light') document.documentElement.dataset.theme = 'light';
    else delete document.documentElement.dataset.theme;
    try { localStorage.setItem(STORAGE_KEY, next); } catch { /* storage unavailable (private mode) */ }
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLORS[next]);
    setThemeState(next);
  }, []);

  const toggleTheme = useCallback(() => setTheme(theme === 'light' ? 'dark' : 'light'), [theme, setTheme]);

  return { theme, setTheme, toggleTheme };
}
