import { isIP } from "node:net";

/** Railway's HTTPS edge supplies X-Real-IP; arbitrary forwarding chains are never trusted. */
export function requestIp(req, { trustRailwayProxy = false } = {}) {
  const realIp = req.headers["x-real-ip"];
  if (trustRailwayProxy && typeof realIp === "string" && isIP(realIp)) return realIp.toLowerCase();
  return req.socket.remoteAddress || "unknown";
}

/** Bounded fixed windows: new identities cannot clear another client's active quota. */
export function createRateLimiter({ now = Date.now, limit = 90, windowMs = 60000, maxEntries = 10000 } = {}) {
  const windows = new Map();
  return (ip) => {
    const time = now();
    // Entries are ordered by window start, and hits do not change that order.
    for (const [key, window] of windows) {
      if (window.at + windowMs > time) break;
      windows.delete(key);
    }
    const existing = windows.get(ip);
    if (existing) return ++existing.count <= limit;
    if (windows.size >= maxEntries) return false;
    windows.set(ip, { at: time, count: 1 });
    return true;
  };
}
