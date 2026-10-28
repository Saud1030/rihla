import { and, eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { DOC_KINDS, type DocKind } from "@/lib/driver-docs";

/** A driver's document (ID, registration, car photos). Drivers section only; never cached. */
export async function GET(_req: Request, ctx: RouteContext<"/api/admin/drivers/[id]/doc/[kind]">) {
  const { id, kind } = await ctx.params;
  const driverId = Number(id);
  if (!can(await getSession(), "drivers") || !Number.isInteger(driverId) || !DOC_KINDS.includes(kind as DocKind)) return new Response("Not found", { status: 404 });
  const [d] = await db
    .select({ mime: s.driverDocuments.mime, data: s.driverDocuments.data })
    .from(s.driverDocuments)
    .where(and(eq(s.driverDocuments.driverId, driverId), eq(s.driverDocuments.kind, kind as DocKind)))
    .limit(1);
  if (!d) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(d.data), {
    headers: { "Content-Type": d.mime, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox" },
  });
}
