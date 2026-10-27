import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { readSettings, retryDue } from "./notify";
import { requestRating } from "./trip-messages";

/**
 * Runs every few minutes in the background (src/instrumentation.ts):
 *  - trips with a driver that ended a few hours ago are marked completed, and the customer is asked for a rating
 *    (in case nobody pressed "trip finished")
 *  - failed / waiting messages are retried
 */
export async function sweep() {
  const st = await readSettings();
  const hours = Number(st.auto_complete_hours ?? 3);
  if (hours > 0) {
    const due = await db
      .update(s.bookings)
      .set({ status: "completed", completedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(s.bookings.status, "confirmed"),
          sql`${s.bookings.driverId} is not null`,
          sql`((${s.bookings.pickupDate} + ${s.bookings.pickupTime}::time) at time zone 'Asia/Riyadh')
              + make_interval(mins => coalesce(${s.bookings.durationMin}, 60)) + make_interval(hours => ${hours}) < now()`,
        ),
      )
      .returning({ id: s.bookings.id });
    for (const b of due) await requestRating(b.id);
  }
  await retryDue();
}

/**
 * On hosts without a long-running server (Vercel), the timer in instrumentation.ts doesn't keep
 * running, so busy pages call this after responding: at most once every 5 minutes per instance.
 */
export async function maybeSweep() {
  const g = globalThis as unknown as { __rihlaLastSweep?: number };
  if (Date.now() - (g.__rihlaLastSweep ?? 0) < 5 * 60_000) return;
  g.__rihlaLastSweep = Date.now();
  await sweep().catch((e) => console.error("sweep failed", e));
}
