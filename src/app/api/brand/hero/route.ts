import { eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { isHeroSlot } from "@/lib/brand";

/** Serves a background photo of the home page top section (?k=hero-2). The URL carries ?v=<version>, so it can be cached for a long time. */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const key = q.get("k") ?? "hero";
  if (!isHeroSlot(key)) return new Response("Not found", { status: 404 });
  const [row] = await db.select().from(s.assets).where(eq(s.assets.key, key)).limit(1);
  if (!row) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(row.data), {
    headers: {
      "Content-Type": row.mime,
      "Cache-Control": q.has("v") ? "public, max-age=31536000, immutable" : "public, max-age=300",
      "X-Content-Type-Options": "nosniff",
      // An uploaded SVG must never run scripts, even if opened directly
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
