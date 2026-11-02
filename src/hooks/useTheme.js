import { useCallback, useEffect, useState } from 'react';
import { setTheme, watchSystemTheme } from '../lib/theme.js';

/** The theme on screen ('light' or 'dark') and a toggle that remembers the choice. */
export function useTheme() {
  const [theme, setCurrent] = useState(() => document.documentElement.getAttribute('data-bs-theme') ?? 'light');

  useEffect(() => watchSystemTheme(setCurrent), []);

  const toggle = useCallback(() => setCurrent(setTheme(theme === 'dark' ? 'light' : 'dark')), [theme]);

  return { theme, toggle };
}
