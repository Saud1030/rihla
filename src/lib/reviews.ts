import "server-only";
import { and, desc, eq, gte, ne, sql } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { cached } from "./memo";
import { getSettings } from "./catalog";

export type PublicReview = { id: number; name: string; stars: number; driverStars: number; comment: string; at: string };

/** First word of the name only, for privacy */
const firstName = (n: string) => n.trim().split(/\s+/)[0]?.slice(0, 20) ?? "";

/**
 * "What our customers say": the average and count over every rating (so the number is honest),
 * plus the latest comments the admin hasn't hidden.
 */
export async function getPublicReviews() {
  const st = await getSettings();
  if (st.reviews_enabled === "0") return null;
  const min = Number(st.reviews_min_stars || 1);
  return cached(`public-reviews:${min}`, async () => {
    const [sum] = await db
      .select({
        count: sql<number>`count(*)::int`,
        avg: sql<number>`coalesce(avg(${s.ratings.companyStars}), 0)::float`,
        driverAvg: sql<number>`coalesce(avg(${s.ratings.driverStars}), 0)::float`,
      })
      .from(s.ratings);
    if (!sum.count) return null;
    const dist = await db
      .select({ stars: s.ratings.companyStars, n: sql<number>`count(*)::int` })
      .from(s.ratings)
      .groupBy(s.ratings.companyStars);
    const rows = await db
      .select({ id: s.ratings.id, name: s.bookings.customerName, stars: s.ratings.companyStars, driverStars: s.ratings.driverStars, comment: s.ratings.comment, at: s.ratings.createdAt })
      .from(s.ratings)
      .innerJoin(s.bookings, eq(s.bookings.id, s.ratings.bookingId))
      .where(and(eq(s.ratings.visible, true), ne(s.ratings.comment, ""), gte(s.ratings.companyStars, min)))
      .orderBy(desc(s.ratings.createdAt))
      .limit(9);
    return {
      count: sum.count,
      avg: sum.avg,
      driverAvg: sum.driverAvg,
      dist: [5, 4, 3, 2, 1].map((n) => ({ stars: n, n: dist.find((d) => d.stars === n)?.n ?? 0 })),
      reviews: rows.map((r): PublicReview => ({ id: r.id, name: firstName(r.name), stars: r.stars, driverStars: r.driverStars, comment: r.comment, at: r.at.toISOString() })),
    };
  });
}
