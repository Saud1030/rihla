import { eq } from "drizzle-orm";
import { db, schema as s } from "@/db";

/** A banner image. The URL carries ?v=<last update>, so browsers can keep it for a long time. */
export async function GET(req: Request, ctx: RouteContext<"/api/banners/[id]">) {
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id) || id <= 0) return new Response("Not found", { status: 404 });
  const [b] = await db.select({ mime: s.banners.mime, data: s.banners.data }).from(s.banners).where(eq(s.banners.id, id)).limit(1);
  if (!b) return new Response("Not found", { status: 404 });
  const versioned = new URL(req.url).searchParams.has("v");
  return new Response(new Uint8Array(b.data), {
    headers: {
      "Content-Type": b.mime,
      "Cache-Control": versioned ? "public, max-age=31536000, immutable" : "public, max-age=300",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
