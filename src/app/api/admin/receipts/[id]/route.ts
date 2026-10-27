import { eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/permissions";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A customer's transfer receipt. Admins only; never cached; can't run scripts even if opened directly. */
export async function GET(req: Request, ctx: RouteContext<"/api/admin/receipts/[id]">) {
  if (!can(await getSession(), "bookings")) return new Response("Not found", { status: 404 });
  const { id } = await ctx.params;
  if (!UUID.test(id)) return new Response("Not found", { status: 404 });
  const [r] = await db.select().from(s.receipts).where(eq(s.receipts.id, id)).limit(1);
  if (!r) return new Response("Not found", { status: 404 });
  // images open in the browser; PDFs are downloaded and opened by the admin's own PDF reader
  const download = new URL(req.url).searchParams.has("download") || r.mime === "application/pdf";
  const name = encodeURIComponent(r.fileName);
  return new Response(new Uint8Array(r.data), {
    headers: {
      "Content-Type": r.mime,
      "Content-Length": String(r.data.length),
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename*=UTF-8''${name}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
