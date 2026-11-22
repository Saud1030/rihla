import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db, schema as s } from "@/db";

/**
 * Cancels a paid booking and records how much is owed back.
 * Atomic: only one cancellation can win, even if clicked twice.
 * Returns null if the booking was no longer paid/confirmed.
 * Refunds are made by hand: the admin transfers the money back, then marks the refund as done.
 */
export async function cancelPaidBooking(bookingId: string, by: "customer" | "admin", refundAmount: number) {
  const [row] = await db
    .update(s.bookings)
    .set({
      status: "cancelled",
      cancelledAt: new Date(),
      cancelledBy: by,
      refundAmount,
      refundStatus: refundAmount > 0 ? "pending_approval" : "none",
      refundError: null,
      updatedAt: new Date(),
    })
    .where(and(eq(s.bookings.id, bookingId), inArray(s.bookings.status, ["paid", "confirmed"])))
    .returning();
  return row ?? null;
}
