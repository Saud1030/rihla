import "server-only";
import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { db, schema as s } from "@/db";
import type { Booking } from "@/db/schema";
import { publicBaseUrl } from "./public-url";
import { bookingNo, formatSAR } from "./format";
import { notify } from "./notify";

/**
 * The customer's two documents:
 *  - payment voucher (سند دفع): proof the money arrived, sent on WhatsApp as soon as the booking is paid
 *  - tax invoice (فاتورة ضريبية مبسطة): issued when the trip ends, sent together with the rating request
 * Both are pages behind the booking's secret ref, numbered in order (REC-0001, INV-0001).
 */

export const receiptNo = (n: number | null | undefined) => (n ? `REC-${String(n).padStart(4, "0")}` : "—");
export const invoiceNo = (n: number | null | undefined) => (n ? `INV-${String(n).padStart(4, "0")}` : "—");

const lang = (b: Pick<Booking, "locale">) => (b.locale === "en" ? "en" : "ar");
export const receiptLink = async (b: Pick<Booking, "ref" | "locale">) => `${await publicBaseUrl()}/${lang(b)}/booking/${b.ref}/receipt`;
export const invoiceLink = async (b: Pick<Booking, "ref" | "locale">) => `${await publicBaseUrl()}/${lang(b)}/booking/${b.ref}/invoice`;

/** Give a paid booking its voucher number (once) and send the voucher link on WhatsApp. Never throws. */
export async function issueReceipt(bookingId: string) {
  try {
    const [b] = await db
      .update(s.bookings)
      .set({ receiptNo: sql`nextval('receipt_no_seq')`, receiptAt: new Date() })
      .where(and(eq(s.bookings.id, bookingId), isNull(s.bookings.receiptNo), isNotNull(s.bookings.paymentId)))
      .returning();
    if (!b) return null; // not paid, or already issued
    const ar = lang(b) === "ar";
    const link = await receiptLink(b);
    const amount = formatSAR(b.amount, ar ? "ar" : "en");
    const body = ar
      ? [
          `مرحبًا ${b.customerName}، استلمنا دفعتك بنجاح.`,
          `رقم الحجز: ${b.ref}`,
          `المبلغ: ${amount}`,
          `سند الدفع رقم ${receiptNo(b.receiptNo)}: ${link}`,
          "تصلك الفاتورة الضريبية بعد انتهاء الرحلة.",
        ].join("\n")
      : [
          `Hello ${b.customerName}, we have received your payment.`,
          `Booking: ${b.ref}`,
          `Amount: ${amount}`,
          `Payment voucher ${receiptNo(b.receiptNo)}: ${link}`,
          "Your tax invoice will follow when the trip ends.",
        ].join("\n");
    return await notify({
      bookingId: b.id,
      channel: "whatsapp",
      kind: "payment_receipt",
      recipient: b.customerPhone,
      recipientName: b.customerName,
      body,
      params: [b.customerName, b.ref, amount, link],
    });
  } catch (e) {
    console.error("payment voucher failed", e);
    return null;
  }
}

/** Give a finished trip its invoice number (once). Returns the booking with it, or null if not completed. */
export async function issueInvoice(bookingId: string): Promise<Booking | null> {
  const [b] = await db
    .update(s.bookings)
    .set({ invoiceNo: sql`nextval('invoice_no_seq')`, invoiceAt: new Date() })
    .where(and(eq(s.bookings.id, bookingId), eq(s.bookings.status, "completed"), isNull(s.bookings.invoiceNo)))
    .returning();
  if (b) return b;
  const done = await db.query.bookings.findFirst({ where: eq(s.bookings.id, bookingId) });
  return done?.status === "completed" && done.invoiceNo ? done : null;
}

/* ---------- ZATCA QR (phase 1): TLV fields, base64 ---------- */

/** seller name, VAT number, time (ISO), total with VAT, VAT amount */
export function zatcaQr(f: { seller: string; vatNumber: string; time: Date; total: number; vat: number }) {
  const parts = [f.seller, f.vatNumber, f.time.toISOString().replace(/\.\d{3}Z$/, "Z"), (f.total / 100).toFixed(2), (f.vat / 100).toFixed(2)];
  const bufs = parts.map((v, i) => {
    const val = Buffer.from(v, "utf8");
    return Buffer.concat([Buffer.from([i + 1, val.length]), val]);
  });
  return Buffer.concat(bufs).toString("base64");
}

export { bookingNo };
