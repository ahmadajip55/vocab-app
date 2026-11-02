import { useCallback, useState } from 'react';
import { readPreference, writePreference } from '../lib/preferences.js';

/** An open/closed state remembered on this device under `key`. Returns [open, toggle]. */
export function useRememberedToggle(key, initial) {
  const [open, setOpen] = useState(() => readPreference(key, initial) === true);

  const toggle = useCallback(() => {
    setOpen((current) => {
      writePreference(key, !current);
      return !current;
    });
  }, [key]);

  return [open, toggle];
}
