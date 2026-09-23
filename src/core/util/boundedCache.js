// LRU bounded by both entries and retained string size (UTF-16 code units).
export function createBoundedCache(maxEntries, maxSize) {
  const entries = new Map();
  let size = 0;
  function remove(key) {
    const value = entries.get(key);
    if (value === undefined) return;
    size -= key.length + value.length;
    entries.delete(key);
  }
  return {
    get(key) {
      const value = entries.get(key);
      if (value !== undefined) {
        entries.delete(key);
        entries.set(key, value);
      }
      return value;
    },
    set(key, value) {
      remove(key);
      const weight = key.length + value.length;
      if (weight > maxSize) return;
      while (entries.size && (entries.size >= maxEntries || size + weight > maxSize)) {
        remove(entries.keys().next().value);
      }
      entries.set(key, value);
      size += weight;
    },
  };
}
