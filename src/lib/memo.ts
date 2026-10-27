import "server-only";
import { io } from "next/cache";

/*
 * Short in-memory cache for reads that every page needs and that only change
 * when an admin saves (catalog, destinations, settings, brand).
 * Admin actions call invalidateAll(), so changes show up immediately on this
 * server; with several server instances, the others catch up within TTL.
 */
const TTL_MS = 60_000;
// Next.js bundles pages, server actions and route handlers separately, so a plain
// module-level Map would exist once per bundle and an admin save would only clear
// one of them. Keeping it on globalThis gives the whole server process one cache.
type Store = Map<string, { at: number; value: Promise<unknown> }>;
const g = globalThis as unknown as { __rihlaMemo?: Store };
const memo: Store = (g.__rihlaMemo ??= new Map());

export async function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  await io(); // tells Next.js the clock read below happens at request time
  const hit = memo.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value as Promise<T>;
  const value = load().catch((e) => {
    memo.delete(key); // don't cache failures
    throw e;
  });
  memo.set(key, { at: Date.now(), value });
  return value;
}

export function invalidateAll() {
  memo.clear();
}
