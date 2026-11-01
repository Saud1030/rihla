import { eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/permissions";

/** The transfer receipt of a payment to a driver: staff of the drivers section, or that driver himself. Never cached. */
export async function GET(_req: Request, ctx: RouteContext<"/api/payouts/[id]/receipt">) {
  const { id } = await ctx.params;
  const me = await getSession();
  if (!me || !/^\d{1,9}$/.test(id)) return new Response("Not found", { status: 404 });
  const [p] = await db.select({ driverId: s.driverPayouts.driverId, receipt: s.driverPayouts.receipt, mime: s.driverPayouts.receiptMime }).from(s.driverPayouts).where(eq(s.driverPayouts.id, Number(id))).limit(1);
  if (!p?.receipt || !p.mime) return new Response("Not found", { status: 404 });
  const allowed = can(me, "drivers") || (me.role === "driver" && me.driverId === p.driverId);
  if (!allowed) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(p.receipt), {
    headers: { "Content-Type": p.mime, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox" },
  });
}
