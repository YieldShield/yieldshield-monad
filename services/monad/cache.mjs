/** Bound caller-selected keys without evicting work that is still in progress. */
export function createCache(now = Date.now, { maxEntries = 256 } = {}) {
  if (!Number.isSafeInteger(maxEntries) || maxEntries < 1) throw new Error("Invalid cache capacity");
  const entries = new Map();
  return async function cached(key, ttl, fn) {
    const time = now();
    for (const [entryKey, entry] of entries) {
      if (entry.expires <= time) entries.delete(entryKey);
    }
    const existing = entries.get(key);
    if (existing) {
      entries.delete(key);
      entries.set(key, existing);
      return existing.promise;
    }
    if (entries.size >= maxEntries) {
      // Keep pending reads shared; only completed results can be evicted.
      for (const [entryKey, entry] of entries) {
        if (entry.expires !== Infinity) {
          entries.delete(entryKey);
          break;
        }
      }
    }
    if (entries.size >= maxEntries)
      throw Object.assign(new Error("Data requests are busy. Please retry shortly."), { status: 503 });
    const item = { expires: Infinity, promise: Promise.resolve().then(fn) };
    entries.set(key, item);
    try {
      const value = await item.promise;
      item.expires = now() + ttl;
      return value;
    } catch (error) {
      if (entries.get(key) === item) entries.delete(key);
      throw error;
    }
  };
}
