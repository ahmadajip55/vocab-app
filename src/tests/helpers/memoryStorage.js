/**
 * An in-memory stand-in for localStorage. `data` holds the stored strings by key.
 * With `quota`, a write that would pass that many characters (keys plus values)
 * throws a QuotaExceededError, like a full browser storage.
 */
export function memoryStorage(initial = {}, { quota = Infinity } = {}) {
  const data = { ...initial };
  const sizeOf = (key) => (key in data ? key.length + data[key].length : 0);
  const used = () => Object.keys(data).reduce((sum, key) => sum + sizeOf(key), 0);
  return {
    data,
    get length() {
      return Object.keys(data).length;
    },
    key: (index) => Object.keys(data)[index] ?? null,
    getItem: (key) => (key in data ? data[key] : null),
    setItem: (key, value) => {
      const text = String(value);
      if (used() - sizeOf(key) + key.length + text.length > quota) {
        throw new DOMException('Quota exceeded', 'QuotaExceededError');
      }
      data[key] = text;
    },
    removeItem: (key) => {
      delete data[key];
    },
  };
}
