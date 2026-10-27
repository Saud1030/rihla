import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { GatewayError, makeRefund } from "./myfatoorah";

/**
 * Cancels a paid booking and records how much is owed back.
 * Atomic: only one cancellation can win, even if clicked twice.
 * Returns null if the booking was no longer paid/confirmed.
 */
export async function cancelPaidBooking(bookingId: string, by: "customer" | "admin", refundAmount: number, sendRefundNow: boolean) {
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
  if (!row) return null;
  // bank transfers are refunded by the admin's own bank transfer, then marked as done manually
  if (refundAmount > 0 && sendRefundNow && row.paymentMethod !== "bank_transfer") return requestRefund(row.id);
  return row;
}

/** Sends the recorded refund to MyFatoorah. Safe to retry after a failure. Not for bank-transfer bookings. */
export async function requestRefund(bookingId: string) {
  const current = await db.query.bookings.findFirst({ where: eq(s.bookings.id, bookingId) });
  if (!current || current.paymentMethod === "bank_transfer") return current;
  // claim it first so two clicks can't send two refunds
  const [claimed] = await db
    .update(s.bookings)
    .set({ refundStatus: "requested", refundError: null, updatedAt: new Date() })
    .where(and(eq(s.bookings.id, bookingId), inArray(s.bookings.refundStatus, ["pending_approval", "failed"])))
    .returning();
  if (!claimed) return db.query.bookings.findFirst({ where: eq(s.bookings.id, bookingId) });

  try {
    if (!claimed.paymentId) throw new GatewayError("This booking has no recorded payment to refund");
    const r = await makeRefund(claimed.paymentId, claimed.refundAmount, `Booking ${claimed.ref} cancelled by ${claimed.cancelledBy ?? "admin"}`);
    const [done] = await db
      .update(s.bookings)
      .set({ refundReference: r.reference, updatedAt: new Date() })
      .where(eq(s.bookings.id, bookingId))
      .returning();
    return done;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("Refund failed", claimed.ref, msg);
    const [failed] = await db
      .update(s.bookings)
      .set({ refundStatus: "failed", refundError: msg.slice(0, 500), updatedAt: new Date() })
      .where(eq(s.bookings.id, bookingId))
      .returning();
    return failed;
  }
}
