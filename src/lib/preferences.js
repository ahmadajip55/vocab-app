/**
 * Small per-device view preferences (which sections are open) in localStorage.
 * Only conveniences: when storage is blocked or the value is damaged, the fallback is used.
 */
export function readPreference(key, fallback) {
  try {
    const stored = localStorage.getItem(key);
    return stored === null ? fallback : JSON.parse(stored);
  } catch {
    return fallback;
  }
}

export function writePreference(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // fine to forget
  }
}
