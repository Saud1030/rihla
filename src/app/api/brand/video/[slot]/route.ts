import { eq, sql } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { isSlot } from "@/lib/promo-video";

/**
 * The home page promo video, served in pieces (HTTP Range) as browsers ask for them —
 * Safari on iPhone won't play a video without this. Only the asked-for bytes are read from the database.
 */
export async function GET(req: Request, { params }: { params: Promise<{ slot: string }> }) {
  const { slot } = await params;
  if (!isSlot(slot)) return new Response("Not found", { status: 404 });
  const key = `video:${slot}`;
  const [meta] = await db
    .select({ mime: s.assets.mime, size: sql<number>`octet_length(${s.assets.data})` })
    .from(s.assets)
    .where(eq(s.assets.key, key))
    .limit(1);
  if (!meta) return new Response("Not found", { status: 404 });
  const size = Number(meta.size);
  const versioned = new URL(req.url).searchParams.has("v");
  const base = {
    "Content-Type": meta.mime,
    "Accept-Ranges": "bytes",
    "Cache-Control": versioned ? "public, max-age=31536000, immutable" : "public, max-age=300",
    "X-Content-Type-Options": "nosniff",
  };

  const range = req.headers.get("range");
  let start = 0;
  let end = size - 1;
  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    if (!m || (!m[1] && !m[2])) return new Response(null, { status: 416, headers: { ...base, "Content-Range": `bytes */${size}` } });
    if (m[1]) {
      start = Number(m[1]);
      end = m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
    } else {
      start = Math.max(0, size - Number(m[2])); // the last N bytes
    }
    if (start > end || start >= size) return new Response(null, { status: 416, headers: { ...base, "Content-Range": `bytes */${size}` } });
    // at most 4 MB per piece, so one request never pulls the whole file through memory
    end = Math.min(end, start + 4 * 1024 * 1024 - 1);
  }
  const [row] = await db
    .select({ part: sql<Buffer>`substring(${s.assets.data} from ${start + 1} for ${end - start + 1})` })
    .from(s.assets)
    .where(eq(s.assets.key, key))
    .limit(1);
  if (!row) return new Response("Not found", { status: 404 });
  const body = new Uint8Array(row.part);
  return new Response(body, {
    status: range ? 206 : 200,
    headers: { ...base, "Content-Length": String(body.length), ...(range ? { "Content-Range": `bytes ${start}-${end}/${size}` } : {}) },
  });
}
