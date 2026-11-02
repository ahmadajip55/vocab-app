import { readPreference, writePreference } from './preferences.js';

/**
 * Light or dark mode (Bootstrap's data-bs-theme). Until the user picks one with
 * the header button, it follows the system setting. index.html applies the same
 * choice before the first paint, so keep THEME_KEY and the values in sync there.
 */
export const THEME_KEY = 'vocab-app:theme';
const THEME_COLORS = { light: '#0e7c6b', dark: '#16202b' }; // browser bar on phones

/** 'light' or 'dark' when the user picked one, otherwise null (follow the system). */
export function readThemeChoice(read = readPreference) {
  const choice = read(THEME_KEY, null);
  return choice === 'light' || choice === 'dark' ? choice : null;
}

/** The theme to show: the user's choice, or the system's. */
export function resolveTheme(choice, systemPrefersDark) {
  return choice ?? (systemPrefersDark ? 'dark' : 'light');
}

const systemQuery = () => window.matchMedia?.('(prefers-color-scheme: dark)');

/** Shows the current theme and returns it. */
export function applyTheme(root = document.documentElement) {
  const theme = resolveTheme(readThemeChoice(), Boolean(systemQuery()?.matches));
  root.setAttribute('data-bs-theme', theme);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLORS[theme]);
  return theme;
}

/** Remembers the user's choice and shows it. */
export function setTheme(theme) {
  writePreference(THEME_KEY, theme);
  return applyTheme();
}

/**
 * Applies the theme now and again when the system setting changes (while the user
 * has not picked one). `onChange(theme)` hears about it. Returns a cleanup function.
 */
export function watchSystemTheme(onChange = () => {}) {
  const media = systemQuery();
  const update = () => onChange(applyTheme());
  update();
  media?.addEventListener?.('change', update);
  return () => media?.removeEventListener?.('change', update);
}
