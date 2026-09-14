/** Pending work is shared even when it takes longer than the completed-result TTL. */
export function createCache(now = Date.now) {
  const entries = new Map();
  return async function cached(key, ttl, fn) {
    const existing = entries.get(key);
    if (existing && existing.expires > now()) return existing.promise;
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
