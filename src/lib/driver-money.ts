import "server-only";
import { eq, inArray, sql } from "drizzle-orm";
import { db, schema as s } from "@/db";

/**
 * What a driver earned and was paid. Earned = the driver fare of his finished trips;
 * coming = fares of his trips not done yet; paid = payouts recorded in Admin -> Drivers.
 */
export type DriverMoney = { earned: number; coming: number; paid: number; remaining: number; unpriced: number };

export async function driverMoney(driverIds: number[]): Promise<Map<number, DriverMoney>> {
  const out = new Map<number, DriverMoney>();
  if (!driverIds.length) return out;
  const [fares, payouts] = await Promise.all([
    db
      .select({
        driverId: s.bookings.driverId,
        earned: sql<number>`coalesce(sum(${s.bookings.driverFare}) filter (where ${s.bookings.status} = 'completed'), 0)::int`,
        coming: sql<number>`coalesce(sum(${s.bookings.driverFare}) filter (where ${s.bookings.status} in ('paid', 'confirmed')), 0)::int`,
        unpriced: sql<number>`(count(*) filter (where ${s.bookings.driverFare} is null and ${s.bookings.status} <> 'cancelled'))::int`,
      })
      .from(s.bookings)
      .where(inArray(s.bookings.driverId, driverIds))
      .groupBy(s.bookings.driverId),
    db
      .select({ driverId: s.driverPayouts.driverId, paid: sql<number>`coalesce(sum(${s.driverPayouts.amount}), 0)::int` })
      .from(s.driverPayouts)
      .where(inArray(s.driverPayouts.driverId, driverIds))
      .groupBy(s.driverPayouts.driverId),
  ]);
  for (const id of driverIds) {
    const f = fares.find((x) => x.driverId === id);
    const p = payouts.find((x) => x.driverId === id);
    const earned = f?.earned ?? 0;
    const paid = p?.paid ?? 0;
    out.set(id, { earned, coming: f?.coming ?? 0, paid, remaining: earned - paid, unpriced: f?.unpriced ?? 0 });
  }
  return out;
}

export async function driverPayoutList(driverId: number, limit = 50) {
  return db
    .select()
    .from(s.driverPayouts)
    .where(eq(s.driverPayouts.driverId, driverId))
    .orderBy(sql`${s.driverPayouts.paidOn} desc, ${s.driverPayouts.id} desc`)
    .limit(limit);
}

