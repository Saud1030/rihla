/**
 * Tiny in-memory rate limit: at most `limit` hits per `windowMs` for a key.
 * Good enough for one server; use your host's rate limiting or Redis if you scale out.
 * Kept on globalThis so every server bundle (pages, actions, route handlers) shares it.
 */
const g = globalThis as unknown as { __rihlaRate?: Map<string, { count: number; until: number }> };
const hits = (g.__rihlaRate ??= new Map());

/** Counts the hit and says whether it is allowed */
export function allow(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const h = hits.get(key);
  if (!h || h.until < now) {
    hits.set(key, { count: 1, until: now + windowMs });
    if (hits.size > 5000) for (const [k, v] of hits) if (v.until < now) hits.delete(k);
    return true;
  }
  h.count++;
  return h.count <= limit;
}

/** The caller's IP as seen by the proxy in front of the app */
export function clientIp(h: Headers) {
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
}
