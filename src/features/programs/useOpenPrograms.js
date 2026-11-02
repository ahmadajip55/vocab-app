import { useCallback, useState } from 'react';
import { readPreference, writePreference } from '../../lib/preferences.js';

const OPEN_KEY = 'vocab-app:home-open';

function readOpenIds() {
  const ids = readPreference(OPEN_KEY, []);
  return new Set(Array.isArray(ids) ? ids.filter((id) => typeof id === 'string') : []);
}

/**
 * Which program cards on Home show their details. Hidden by default;
 * the choice is remembered on this device.
 */
export function useOpenPrograms() {
  const [openIds, setOpenIds] = useState(readOpenIds);

  const save = useCallback((next) => {
    writePreference(OPEN_KEY, [...next]);
    setOpenIds(next);
  }, []);

  const toggle = useCallback(
    (id) => {
      const next = new Set(openIds);
      if (!next.delete(id)) next.add(id);
      save(next);
    },
    [openIds, save],
  );

  /** Shows (open = true) or hides every program in `ids`. */
  const setAll = useCallback((ids, open) => save(new Set(open ? ids : [])), [save]);

  return { openIds, toggle, setAll };
}
