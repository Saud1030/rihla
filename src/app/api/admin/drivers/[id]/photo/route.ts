import { eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/permissions";

/** A driver's photo in the panel (drivers or bookings section, or the driver himself) */
export async function GET(_req: Request, ctx: RouteContext<"/api/admin/drivers/[id]/photo">) {
  const id = Number((await ctx.params).id);
  const me = await getSession();
  if (!Number.isInteger(id) || !(can(me, "drivers") || can(me, "bookings") || me?.driverId === id)) return new Response("Not found", { status: 404 });
  const [d] = await db.select({ mime: s.drivers.photoMime, data: s.drivers.photo }).from(s.drivers).where(eq(s.drivers.id, id)).limit(1);
  if (!d?.data || !d.mime) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(d.data), {
    headers: { "Content-Type": d.mime, "Cache-Control": "private, max-age=300", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox" },
  });
}
