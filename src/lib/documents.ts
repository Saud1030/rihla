import "server-only";
import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { db, schema as s } from "@/db";
import type { Booking } from "@/db/schema";
import { publicBaseUrl } from "./public-url";
import { bookingNo, formatSARText as formatSAR } from "./format";
import { notify } from "./notify";
import { afterPaid } from "./promo";

/**
 * The customer's documents:
 *  - paid online (MyFatoorah): the proforma invoice (فاتورة مبدئية), sent on WhatsApp as soon as it's paid
 *  - paid by bank transfer or cash: the payment voucher (سند صرف) when the payment is confirmed,
 *    and the proforma invoice when the trip ends (with the rating request)
 * Both are pages behind the booking's secret ref, numbered in order (REC-0001, INV-0001).
 */

export const receiptNo = (n: number | null | undefined) => (n ? `REC-${String(n).padStart(4, "0")}` : "—");
export const invoiceNo = (n: number | null | undefined) => (n ? `INV-${String(n).padStart(4, "0")}` : "—");

/** the last line of the payment message */
export const THANKS = {
  ar: "شكرًا لكم لاختياركم Mighty Hands Trans، سوف نتواصل معكم في أقرب وقت ممكن.",
  en: "Thank you for choosing Mighty Hands Trans. We will contact you as soon as possible.",
};

const lang = (b: Pick<Booking, "locale">) => (b.locale === "en" ? "en" : "ar");
export const receiptLink = async (b: Pick<Booking, "ref" | "locale">) => `${await publicBaseUrl()}/${lang(b)}/booking/${b.ref}/receipt`;
/** the voucher as a PDF file (sent as a WhatsApp document) */
export const receiptPdfLink = async (b: Pick<Booking, "ref">) => `${await publicBaseUrl()}/api/booking/${b.ref}/receipt`;
export const invoicePdfLink = async (b: Pick<Booking, "ref">) => `${await publicBaseUrl()}/api/booking/${b.ref}/invoice`;
export const invoiceLink = async (b: Pick<Booking, "ref" | "locale">) => `${await publicBaseUrl()}/${lang(b)}/booking/${b.ref}/invoice`;

/**
 * A booking was paid: the customer gets his document on WhatsApp. Paid online: the proforma invoice
 * (numbered now). Otherwise: the payment voucher. Once per booking. Never throws.
 */
export async function issueReceipt(bookingId: string) {
  try {
    const paid = await db.query.bookings.findFirst({ where: eq(s.bookings.id, bookingId), columns: { paymentMethod: true } });
    if (paid?.paymentMethod === "myfatoorah") return await issueProforma(bookingId);
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
          `مرفق سند الصرف رقم ${receiptNo(b.receiptNo)}، ورابطه: ${link}`,
          "تصلك الفاتورة بعد انتهاء الرحلة.",
          "",
          THANKS.ar,
        ].join("\n")
      : [
          `Hello ${b.customerName}, we have received your payment.`,
          `Booking: ${b.ref}`,
          `Amount: ${amount}`,
          `Your payment voucher ${receiptNo(b.receiptNo)} is attached. Link: ${link}`,
          "Your invoice will follow when the trip ends.",
          "",
          THANKS.en,
        ].join("\n");
    const sent = await notify({
      bookingId: b.id,
      channel: "whatsapp",
      kind: "payment_receipt",
      recipient: b.customerPhone,
      recipientName: b.customerName,
      body,
      params: [b.customerName, b.ref, amount, link],
      attachment: { url: await receiptPdfLink(b), name: `${receiptNo(b.receiptNo)}.pdf` },
    });
    // the promo code it used is spent; every Nth paid booking earns a new one
    await afterPaid(b);
    return sent;
  } catch (e) {
    console.error("payment voucher failed", e);
    return null;
  }
}

/** Paid online: number the proforma invoice now and send it (PDF + link) instead of a voucher */
async function issueProforma(bookingId: string) {
  const [b] = await db
    .update(s.bookings)
    .set({ invoiceNo: sql`nextval('invoice_no_seq')`, invoiceAt: new Date() })
    .where(and(eq(s.bookings.id, bookingId), isNull(s.bookings.invoiceNo), isNotNull(s.bookings.paymentId)))
    .returning();
  if (!b) return null; // not paid, or already issued
  const ar = lang(b) === "ar";
  const link = await invoiceLink(b);
  const amount = formatSAR(b.amount, ar ? "ar" : "en");
  const body = ar
    ? [`مرحبًا ${b.customerName}، استلمنا دفعتك بنجاح.`, `رقم الحجز: ${b.ref}`, `المبلغ: ${amount}`, `مرفق الفاتورة المبدئية رقم ${invoiceNo(b.invoiceNo)}، ورابطها: ${link}`, "", THANKS.ar].join("\n")
    : [`Hello ${b.customerName}, we have received your payment.`, `Booking: ${b.ref}`, `Amount: ${amount}`, `Your proforma invoice ${invoiceNo(b.invoiceNo)} is attached. Link: ${link}`, "", THANKS.en].join("\n");
  const sent = await notify({
    bookingId: b.id,
    channel: "whatsapp",
    kind: "payment_invoice",
    recipient: b.customerPhone,
    recipientName: b.customerName,
    body,
    params: [b.customerName, b.ref, amount, link],
    attachment: { url: await invoicePdfLink(b), name: `${invoiceNo(b.invoiceNo)}.pdf` },
  });
  await afterPaid(b);
  return sent;
}

/** Give a finished trip its invoice number (once; a booking paid online already has it). Returns the booking with it, or null if not completed. */
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
