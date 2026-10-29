import "server-only";
import { desc, eq, sql } from "drizzle-orm";
import { db, schema as s } from "@/db";

/** Averages for the dashboard (all time) */
export async function getRatingSummary() {
  const [r] = await db
    .select({
      count: sql<number>`count(*)::int`,
      company: sql<number>`coalesce(avg(${s.ratings.companyStars}), 0)::float`,
      driver: sql<number>`coalesce(avg(${s.ratings.driverStars}), 0)::float`,
    })
    .from(s.ratings);
  return r;
}

/** driverId -> { avg, count } */
export async function driverRatings() {
  const rows = await db
    .select({
      driverId: s.ratings.driverId,
      avg: sql<number>`avg(${s.ratings.driverStars})::float`,
      count: sql<number>`count(*)::int`,
    })
    .from(s.ratings)
    .groupBy(s.ratings.driverId);
  return new Map(rows.filter((r) => r.driverId != null).map((r) => [r.driverId!, { avg: r.avg, count: r.count }]));
}

export async function listRatings(opts: { driverId?: number; limit?: number; offset?: number } = {}) {
  return db
    .select({
      id: s.ratings.id,
      driverStars: s.ratings.driverStars,
      companyStars: s.ratings.companyStars,
      comment: s.ratings.comment,
      visible: s.ratings.visible,
      createdAt: s.ratings.createdAt,
      ref: s.bookings.ref,
      number: s.bookings.number,
      customerName: s.bookings.customerName,
      routeTitle: s.bookings.routeTitle,
      pickupDate: s.bookings.pickupDate,
      driverId: s.ratings.driverId,
      driverName: s.drivers.name,
    })
    .from(s.ratings)
    .innerJoin(s.bookings, eq(s.bookings.id, s.ratings.bookingId))
    .leftJoin(s.drivers, eq(s.drivers.id, s.ratings.driverId))
    .where(opts.driverId ? eq(s.ratings.driverId, opts.driverId) : undefined)
    .orderBy(desc(s.ratings.createdAt))
    .limit(opts.limit ?? 50)
    .offset(opts.offset ?? 0);
}
