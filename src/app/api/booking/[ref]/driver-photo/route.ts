import { and, eq, inArray } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { normalizeRef } from "@/lib/booking";

/** The photo of the driver assigned to this booking, for the customer's booking page (the ref is unguessable) */
export async function GET(_req: Request, ctx: RouteContext<"/api/booking/[ref]/driver-photo">) {
  const ref = normalizeRef((await ctx.params).ref);
  if (ref.length !== 8) return new Response("Not found", { status: 404 });
  const [d] = await db
    .select({ mime: s.drivers.photoMime, data: s.drivers.photo })
    .from(s.bookings)
    .innerJoin(s.drivers, eq(s.drivers.id, s.bookings.driverId))
    .where(and(eq(s.bookings.ref, ref), inArray(s.bookings.status, ["confirmed", "completed"])))
    .limit(1);
  if (!d?.data || !d.mime) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(d.data), {
    headers: { "Content-Type": d.mime, "Cache-Control": "private, max-age=300", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox" },
  });
}
