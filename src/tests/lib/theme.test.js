import { describe, expect, it } from '@jest/globals';
import { THEME_KEY, readThemeChoice, resolveTheme } from '../../lib/theme.js';

/** A preference reader that returns `value` for the theme key. */
const reader = (value) => (key, fallback) => (key === THEME_KEY ? value : fallback);

describe('readThemeChoice', () => {
  it.each(['light', 'dark'])('should return %p when the user picked it', (choice) => {
    const read = reader(choice);

    const result = readThemeChoice(read);

    expect(result).toBe(choice);
  });

  it.each([null, 'blue', 1, ''])('should return null when the stored value is %p', (stored) => {
    const read = reader(stored);

    const result = readThemeChoice(read);

    expect(result).toBeNull();
  });
});

describe('resolveTheme', () => {
  it.each([
    ['light', true, 'light'],
    ['dark', false, 'dark'],
    [null, true, 'dark'],
    [null, false, 'light'],
  ])('should show the choice %p over the system (dark: %p) as %p when the theme is resolved', (choice, systemPrefersDark, expected) => {
    const theme = resolveTheme(choice, systemPrefersDark);

    expect(theme).toBe(expected);
  });
});
