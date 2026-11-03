import "server-only";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { issueReceipt } from "./documents";

/** Cash to the driver on the day (Admin -> Settings: on by default) */
export const cashEnabled = (st: Record<string, string>) => st.cash_enabled !== "0";

/**
 * The cash was handed over (marked by the admin, or by the driver of that trip): the booking counts as paid
 * and the customer gets the payment voucher. Returns the booking, or null if it isn't an unpaid cash booking.
 */
export async function recordCashPayment(bookingId: string, by: string) {
  const done = await db.transaction(async (tx) => {
    const b = await tx.query.bookings.findFirst({ where: eq(s.bookings.id, bookingId) });
    if (!b || b.paymentMethod !== "cash" || b.paymentId) return null;
    const paymentId = `CASH-${b.ref}`;
    const [row] = await tx
      .update(s.bookings)
      // a driver may already be on it (confirmed) or the trip over (completed): keep that, else it is now paid
      .set({ status: b.status === "pending_payment" ? "paid" : b.status, paymentId, paidAt: new Date(), updatedAt: new Date() })
      .where(and(eq(s.bookings.id, b.id), isNull(s.bookings.paymentId), inArray(s.bookings.status, ["pending_payment", "paid", "confirmed", "completed"])))
      .returning();
    if (!row) return null;
    await tx.insert(s.payments).values({ id: paymentId, bookingId: row.id, status: "paid", amount: row.amount, currency: row.currency, source: "cash", raw: { receivedBy: by, at: new Date().toISOString() } });
    return row;
  });
  if (done) await issueReceipt(done.id);
  return done;
}
