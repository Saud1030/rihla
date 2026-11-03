import "server-only";
import { randomBytes } from "node:crypto";
import { and, asc, eq, isNull } from "drizzle-orm";
import { db, schema as s } from "@/db";
import type { Booking, Installment } from "@/db/schema";
import { cached } from "./memo";
import { formatSARText, formatNumber } from "./format";
import { notify } from "./notify";
import { publicBaseUrl } from "./public-url";
import { issueReceipt } from "./documents";

export const MAX_INSTALLMENTS = 12;

/** Active packages for the site (cached; admin saves clear it) */
export const activePackages = () =>
  cached("packages", () => db.select().from(s.packages).where(eq(s.packages.active, true)).orderBy(asc(s.packages.sortOrder), asc(s.packages.id)));

/** A total split into n payments: equal, the last one takes the rounding */
export function splitAmount(total: number, n: number): number[] {
  const count = Math.max(1, Math.min(MAX_INSTALLMENTS, Math.floor(n)));
  const each = Math.floor(total / count);
  return Array.from({ length: count }, (_, i) => (i === count - 1 ? total - each * (count - 1) : each));
}

export const newToken = () => randomBytes(18).toString("base64url");

/** the payments of a package booking: the first at booking, the last `afterTrip` of them after the trip */
export async function createInstallments(bookingId: string, total: number, n: number, afterTrip = 0) {
  const parts = splitAmount(total, n);
  const rows = parts.map((amount, i) => ({ bookingId, seq: i + 1, amount, token: newToken(), due: i > 0 && i >= parts.length - afterTrip ? "after" : "before" }));
  return db.insert(s.installments).values(rows).returning();
}

export const installmentsOf = (bookingId: string) => db.select().from(s.installments).where(eq(s.installments.bookingId, bookingId)).orderBy(asc(s.installments.seq));

export const payLink = async (lang: "ar" | "en", token: string) => `${await publicBaseUrl()}/${lang}/pay/${token}`;

const langOf = (b: Pick<Booking, "locale">) => (b.locale === "en" ? "en" : "ar");

/**
 * One installment was paid (online, or marked by the admin). The first one books the trip (status paid);
 * every payment gets a WhatsApp message; when all are paid the customer gets the payment voucher.
 */
export async function afterInstallmentPaid(inst: Installment) {
  const b = await db.query.bookings.findFirst({ where: eq(s.bookings.id, inst.bookingId) });
  if (!b) return;
  const all = await installmentsOf(b.id);
  const paid = all.filter((x) => x.paidAt);
  if (b.status === "pending_payment")
    await db
      .update(s.bookings)
      .set({ status: "paid", paymentMethod: "myfatoorah", paidAt: new Date(), updatedAt: new Date() })
      .where(and(eq(s.bookings.id, b.id), eq(s.bookings.status, "pending_payment")));
  const lang = langOf(b);
  const ar = lang === "ar";
  const left = all.filter((x) => !x.paidAt).reduce((n, x) => n + x.amount, 0);
  const body = ar
    ? [
        `مرحبًا ${b.customerName}، استلمنا الدفعة ${formatNumber(inst.seq, "ar")} من ${formatNumber(all.length, "ar")}: ${formatSARText(inst.amount, "ar")}.`,
        `رقم الحجز: ${b.ref}`,
        left > 0 ? `المتبقي: ${formatSARText(left, "ar")}، يصلك رابط الدفعة القادمة منا.` : "اكتملت كل الدفعات، شكرًا لك. مرفق سند الصرف.",
        "",
        "شكرًا لكم لاختياركم Mighty Hands Trans.",
      ].join("\n")
    : [
        `Hello ${b.customerName}, we received payment ${inst.seq} of ${all.length}: ${formatSARText(inst.amount, "en")}.`,
        `Booking: ${b.ref}`,
        left > 0 ? `Remaining: ${formatSARText(left, "en")}. We'll send you the link for the next payment.` : "All payments are done, thank you. Your payment voucher is attached.",
        "",
        "Thank you for choosing Mighty Hands Trans.",
      ].join("\n");
  await notify({ bookingId: b.id, channel: "whatsapp", kind: "installment_paid", recipient: b.customerPhone, recipientName: b.customerName, body, params: [b.customerName, String(inst.seq), String(all.length)] });
  // all paid: the booking gets a payment id (needed for the voucher) and the voucher goes out
  if (paid.length === all.length) {
    await db
      .update(s.bookings)
      .set({ paymentId: `PKG-${b.ref}`, updatedAt: new Date() })
      .where(and(eq(s.bookings.id, b.id), isNull(s.bookings.paymentId)));
    await issueReceipt(b.id);
  }
}

/** Mark an installment paid (once). Returns it, or null if it was already paid. */
export async function markInstallmentPaid(id: number, how: { paymentId: string; invoiceId?: string | null; method: string }) {
  const [row] = await db
    .update(s.installments)
    .set({ paymentId: how.paymentId, invoiceId: how.invoiceId ?? null, method: how.method, paidAt: new Date() })
    .where(and(eq(s.installments.id, id), isNull(s.installments.paidAt)))
    .returning();
  if (row) await afterInstallmentPaid(row);
  return row ?? null;
}

/** The admin sends the customer the link of one installment on WhatsApp */
export async function sendInstallmentLink(inst: Installment, b: Booking, total: number) {
  const lang = langOf(b);
  const ar = lang === "ar";
  const link = await payLink(lang, inst.token);
  const body = ar
    ? [`مرحبًا ${b.customerName}،`, `رابط الدفعة ${formatNumber(inst.seq, "ar")} من ${formatNumber(total, "ar")} لحجزك ${b.ref}: ${formatSARText(inst.amount, "ar")}`, link, "", "شكرًا لكم لاختياركم Mighty Hands Trans."].join("\n")
    : [`Hello ${b.customerName},`, `Payment ${inst.seq} of ${total} for your booking ${b.ref}: ${formatSARText(inst.amount, "en")}`, link, "", "Thank you for choosing Mighty Hands Trans."].join("\n");
  const sent = await notify({ bookingId: b.id, channel: "whatsapp", kind: "installment_link", recipient: b.customerPhone, recipientName: b.customerName, body, params: [b.customerName, String(inst.seq), link] });
  await db.update(s.installments).set({ linkSentAt: new Date() }).where(eq(s.installments.id, inst.id));
  return sent;
}

/** "٢ قبل الرحلة · ١ بعد الرحلة" */
export function dueSummary(n: number, afterTrip: number, lang: "ar" | "en") {
  const before = n - afterTrip;
  if (afterTrip <= 0) return "";
  return lang === "ar"
    ? `${formatNumber(before, "ar")} قبل الرحلة · ${formatNumber(afterTrip, "ar")} بعد الرحلة`
    : `${before} before the trip · ${afterTrip} after it`;
}

/** The trip ended: the payments due after it get their links on WhatsApp. Never throws. */
export async function afterTripPayments(bookingId: string) {
  try {
    const b = await db.query.bookings.findFirst({ where: eq(s.bookings.id, bookingId) });
    if (!b) return;
    const all = await installmentsOf(bookingId);
    for (const inst of all) if (inst.due === "after" && !inst.paidAt && !inst.linkSentAt) await sendInstallmentLink(inst, b, all.length);
  } catch (e) {
    console.error("after-trip payment links failed", e);
  }
}
