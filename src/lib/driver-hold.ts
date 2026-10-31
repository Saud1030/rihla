import { and, eq, inArray, sql } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { bookingNo } from "./format";

type HoldFields = { blockedAt: Date | null; blockReason: string | null; suspendedUntil: Date | null; suspendReason: string | null };
export type DriverHold = { kind: "blocked"; reason: string | null } | { kind: "suspended"; until: Date; reason: string | null } | null;

/** Whether a driver is blocked or suspended right now (a suspension ends by itself at its time) */
export function driverHold(d: HoldFields, now = new Date()): DriverHold {
  if (d.blockedAt) return { kind: "blocked", reason: d.blockReason };
  if (d.suspendedUntil && d.suspendedUntil > now) return { kind: "suspended", until: d.suspendedUntil, reason: d.suspendReason };
  return null;
}

/** SQL: neither blocked nor suspended now */
export const notHeld = sql`(${s.drivers.blockedAt} is null and (${s.drivers.suspendedUntil} is null or ${s.drivers.suspendedUntil} <= now()))`;

/** Suspension lengths offered in the panel, in days */
export const SUSPEND_DAYS = [1, 3, 7, 14, 30] as const;
export const daysLabel = (n: number) => (n === 1 ? "يوم" : n === 7 ? "أسبوع" : n === 14 ? "أسبوعين" : n === 30 ? "شهر" : `${n} أيام`);

/** The driver's trips that are booked and not done yet, so the admin can give them to someone else */
export async function upcomingTrips(driverId: number) {
  const rows = await db
    .select({ number: s.bookings.number, ref: s.bookings.ref })
    .from(s.bookings)
    .where(and(eq(s.bookings.driverId, driverId), inArray(s.bookings.status, ["paid", "confirmed"])));
  return rows.map((r) => ({ no: bookingNo(r.number), ref: r.ref }));
}
