import { eq } from "drizzle-orm";
import { db, schema as s } from "@/db";

/** A car photo uploaded in Admin -> Cars. The URL carries ?v=<version>, so it can be cached for a long time. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return new Response("Not found", { status: 404 });
  const [row] = await db.select().from(s.assets).where(eq(s.assets.key, `vehicle:${id}`)).limit(1);
  if (!row) return new Response("Not found", { status: 404 });
  const versioned = new URL(req.url).searchParams.has("v");
  return new Response(new Uint8Array(row.data), {
    headers: {
      "Content-Type": row.mime,
      "Cache-Control": versioned ? "public, max-age=31536000, immutable" : "public, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
