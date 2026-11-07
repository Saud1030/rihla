import { eq } from "drizzle-orm";
import { db, schema as s } from "@/db";

/** A picture in the footer (license badge, payment logo...). The URL carries ?v=<version>. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[a-z0-9]{4,40}$/.test(id)) return new Response("Not found", { status: 404 });
  const [row] = await db.select().from(s.assets).where(eq(s.assets.key, `footer:${id}`)).limit(1);
  if (!row) return new Response("Not found", { status: 404 });
  const versioned = new URL(req.url).searchParams.has("v");
  return new Response(new Uint8Array(row.data), {
    headers: {
      "Content-Type": row.mime,
      "Cache-Control": versioned ? "public, max-age=31536000, immutable" : "public, max-age=300",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
