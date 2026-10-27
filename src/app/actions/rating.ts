"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { allow, clientIp } from "@/lib/rate-limit";
import { emailRating, ratingHash } from "@/lib/trip-messages";
import { invalidateCatalogCache } from "@/lib/catalog";

export type RateState = { error?: "pick" | "invalid" | "throttled"; done?: boolean };

const schema = z.object({
  token: z.string().regex(/^[a-f0-9]{48}$/),
  driverStars: z.coerce.number().int().min(1).max(5),
  companyStars: z.coerce.number().int().min(1).max(5),
  comment: z.string().trim().max(1000),
});

/** One rating per booking, through the private link sent on WhatsApp */
export async function submitRating(_prev: RateState, formData: FormData): Promise<RateState> {
  if (!allow(`rate:${clientIp(await headers())}`, 20, 60 * 60_000)) return { error: "throttled" };
  const parsed = schema.safeParse({
    token: formData.get("token"),
    driverStars: formData.get("driverStars"),
    companyStars: formData.get("companyStars"),
    comment: String(formData.get("comment") ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ""),
  });
  if (!parsed.success) return { error: parsed.error.issues.some((i) => i.path[0] === "token") ? "invalid" : "pick" };
  const d = parsed.data;
  const b = await db.query.bookings.findFirst({ where: eq(s.bookings.ratingTokenHash, ratingHash(d.token)) });
  if (!b || b.status !== "completed") return { error: "invalid" };
  const [r] = await db
    .insert(s.ratings)
    .values({ bookingId: b.id, driverId: b.driverId, driverStars: d.driverStars, companyStars: d.companyStars, comment: d.comment })
    .onConflictDoNothing()
    .returning();
  if (!r) return { done: true }; // already rated
  invalidateCatalogCache(); // the reviews on the home page
  const driver = b.driverId ? await db.query.drivers.findFirst({ where: eq(s.drivers.id, b.driverId), columns: { name: true } }) : null;
  await emailRating(r, b, driver?.name ?? null);
  return { done: true };
}
