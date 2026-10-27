import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { db, schema as s } from "@/db";
import type { Booking } from "@/db/schema";

/**
 * MyFatoorah integration (server side only), API v2.
 *
 * Flow:
 *  1. "Pay" on the checkout page -> createInvoice() (SendPayment). The amount and
 *     CustomerReference (= our booking ref) are set here on the server.
 *  2. The customer pays on MyFatoorah's hosted page (mada, Visa/Mastercard,
 *     Apple Pay, STC Pay ... whatever is enabled on your account).
 *  3. MyFatoorah redirects to /api/payments/callback?ref=..&paymentId=..
 *  4. We call GetPaymentStatus with our API key and only then mark the booking
 *     paid, after checking invoice status, the successful transaction and the amount.
 *  5. The signed webhook (V2) does the same in the background, in case the
 *     customer never comes back to the site.
 *
 * The browser is never trusted for amount or status.
 * Docs: https://docs.myfatoorah.com
 */

const API_BASE = () => (process.env.MYFATOORAH_API_BASE || "https://apitest.myfatoorah.com").replace(/\/$/, "");

export function isGatewayConfigured() {
  return !!process.env.MYFATOORAH_API_KEY;
}

/** PaymentId values are long digit strings; anything else is rejected before any API call */
const PAYMENT_ID_RE = /^[A-Za-z0-9_-]{6,64}$/;
export const isValidPaymentId = (id: string) => PAYMENT_ID_RE.test(id);

export class GatewayError extends Error {}

type MfResponse<T> = { IsSuccess: boolean; Message?: string | null; ValidationErrors?: { Name: string; Error: string }[] | null; Data: T };

async function call<T>(path: string, body: unknown): Promise<{ status: number; json: MfResponse<T> | null }> {
  const key = process.env.MYFATOORAH_API_KEY;
  if (!key) throw new GatewayError("MYFATOORAH_API_KEY is not set");
  let res: Response;
  try {
    res = await fetch(`${API_BASE()}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
  } catch (e) {
    throw new GatewayError(`MyFatoorah unreachable: ${(e as Error).message}`);
  }
  if (res.status >= 500) throw new GatewayError(`MyFatoorah ${path} failed: ${res.status}`);
  const json = (await res.json().catch(() => null)) as MfResponse<T> | null;
  return { status: res.status, json };
}

/* ---------------- Create invoice (SendPayment) ---------------- */

export async function createInvoice(b: Booking, lang: "ar" | "en", siteUrl: string) {
  const value = b.amount / 100;
  // Invoice lines must add up to InvoiceValue: the trip, then VAT on its own line
  const items = [{ ItemName: `${b.routeTitle} - ${b.vehicleName}`.slice(0, 150), Quantity: 1, UnitPrice: b.subtotal / 100 }];
  if (b.vatAmount > 0) {
    const pct = b.vatRate / 100;
    items.push({ ItemName: lang === "ar" ? `ضريبة القيمة المضافة ${pct}%` : `VAT ${pct}%`, Quantity: 1, UnitPrice: b.vatAmount / 100 });
  }
  const back = `${siteUrl.replace(/\/$/, "")}/api/payments/callback?ref=${encodeURIComponent(b.ref)}&lang=${lang}`;
  const { status, json } = await call<{ InvoiceId: number; InvoiceURL: string }>("/v2/SendPayment", {
    NotificationOption: "LNK",
    InvoiceValue: value,
    DisplayCurrencyIso: "SAR",
    CustomerName: b.customerName.slice(0, 100),
    ...(b.customerEmail ? { CustomerEmail: b.customerEmail } : {}),
    Language: lang === "ar" ? "AR" : "EN",
    CallBackUrl: back,
    ErrorUrl: back,
    CustomerReference: b.ref,
    UserDefinedField: b.id,
    InvoiceItems: items,
  });
  if (!json?.IsSuccess || !json.Data?.InvoiceURL) {
    const details = json?.ValidationErrors?.map((v) => `${v.Name}: ${v.Error}`).join("; ");
    throw new GatewayError(`SendPayment rejected (${status}): ${json?.Message ?? ""} ${details ?? ""}`.trim());
  }
  return { invoiceId: String(json.Data.InvoiceId), url: json.Data.InvoiceURL };
}

/* ---------------- Payment status (GetPaymentStatus) ---------------- */

export type MfTransaction = {
  PaymentId: string;
  TransactionStatus: string; // "Succss" (sic) | "Success" | "InProgress" | "Failed" | ...
  PaymentGateway?: string | null;
  TransationValue?: string | number | null; // (sic)
  Currency?: string | null;
  Error?: string | null;
};

export type MfPaymentStatus = {
  InvoiceId: number | string;
  InvoiceStatus: string; // "Paid" | "Pending" | ...
  InvoiceValue: number | string;
  CustomerReference: string | null;
  UserDefinedField?: string | null;
  InvoiceTransactions: MfTransaction[];
};

/** Returns null when MyFatoorah doesn't know this payment id. Throws GatewayError when it can't be reached. */
export async function getPaymentStatus(paymentId: string): Promise<MfPaymentStatus | null> {
  if (!isValidPaymentId(paymentId)) return null;
  const { json } = await call<MfPaymentStatus>("/v2/GetPaymentStatus", { Key: paymentId, KeyType: "PaymentId" });
  if (!json?.IsSuccess || !json.Data) return null;
  return json.Data;
}

const isSuccess = (st: string) => /^(succss|success)$/i.test(st);

function mapStatus(st: string): (typeof s.paymentStatus.enumValues)[number] {
  if (isSuccess(st)) return "paid";
  if (/fail/i.test(st)) return "failed";
  if (/authori[sz]e/i.test(st)) return "authorized";
  if (/cancel/i.test(st)) return "voided";
  if (/refund/i.test(st)) return "refunded";
  return "initiated";
}

const toHalalas = (v: string | number | null | undefined) => Math.round(Number(v ?? 0) * 100);

export type SettleResult =
  | { ok: true; bookingRef: string }
  | { ok: false; bookingRef?: string; reason: "not_found" | "not_paid" | "mismatch" | "already_settled_elsewhere" };

/**
 * Verify a payment status fetched from MyFatoorah and, if it matches, mark the
 * booking as paid. Idempotent: safe to call from both callback and webhook.
 */
export async function settlePayment(st: MfPaymentStatus): Promise<SettleResult> {
  // CustomerReference was set by our server when creating the invoice, so it identifies the booking
  const ref = st.CustomerReference ?? "";
  const booking = ref ? await db.query.bookings.findFirst({ where: eq(s.bookings.ref, ref) }) : undefined;
  const invoiceId = String(st.InvoiceId);

  // Log every transaction attempt on this invoice
  for (const t of st.InvoiceTransactions ?? []) {
    if (!t.PaymentId) continue;
    const row = {
      id: String(t.PaymentId),
      invoiceId,
      bookingId: booking?.id ?? null,
      status: mapStatus(t.TransactionStatus),
      amount: toHalalas(t.TransationValue ?? st.InvoiceValue),
      currency: t.Currency || "SAR",
      source: t.PaymentGateway ?? null,
      raw: t,
    };
    await db
      .insert(s.payments)
      .values(row)
      .onConflictDoUpdate({
        target: s.payments.id,
        set: { status: row.status, amount: row.amount, currency: row.currency, source: row.source, raw: row.raw, bookingId: row.bookingId, updatedAt: new Date() },
      });
  }

  if (!booking) return { ok: false, reason: "not_found" };

  const success = (st.InvoiceTransactions ?? []).find((t) => isSuccess(t.TransactionStatus));
  if (success && booking.paymentId === String(success.PaymentId)) return { ok: true, bookingRef: booking.ref };

  if (!/^paid$/i.test(st.InvoiceStatus) || !success) return { ok: false, bookingRef: booking.ref, reason: "not_paid" };

  // The invoice amount must equal what WE charge for this booking (SAR account)
  if (toHalalas(st.InvoiceValue) !== booking.amount) {
    console.warn("Payment amount mismatch", { invoiceId, booking: booking.ref, paid: st.InvoiceValue, due: booking.amount });
    return { ok: false, bookingRef: booking.ref, reason: "mismatch" };
  }

  // Atomically flip pending -> paid. payment_id is UNIQUE: one payment settles one booking.
  try {
    const updated = await db
      .update(s.bookings)
      .set({ status: "paid", paymentMethod: "myfatoorah", paymentId: String(success.PaymentId), invoiceId, paidAt: new Date(), updatedAt: new Date() })
      .where(and(eq(s.bookings.id, booking.id), eq(s.bookings.status, "pending_payment"), isNull(s.bookings.paymentId)))
      .returning({ ref: s.bookings.ref });
    if (updated.length) return { ok: true, bookingRef: booking.ref };
  } catch (e) {
    const code = (e as { cause?: { code?: string }; code?: string }).cause?.code ?? (e as { code?: string }).code;
    if (code === "23505") return { ok: false, bookingRef: booking.ref, reason: "already_settled_elsewhere" };
    throw e;
  }

  // Nothing updated. If the webhook and the callback raced, the other one already
  // settled it with this same payment: that's a success, not a conflict.
  const now = await db.query.bookings.findFirst({ where: eq(s.bookings.id, booking.id) });
  if (now?.paymentId === String(success.PaymentId)) return { ok: true, bookingRef: booking.ref };

  // Booking was cancelled, or already paid by another invoice: needs a refund from the MyFatoorah portal
  console.warn("Successful payment for a booking that is not pending", { invoiceId, booking: booking.ref, status: booking.status });
  return { ok: false, bookingRef: booking.ref, reason: "already_settled_elsewhere" };
}

/* ---------------- Webhook V2 signature ---------------- */

type WebhookData = {
  Invoice?: { Id?: string | number | null; Status?: string | null; ExternalIdentifier?: string | null } | null;
  Transaction?: { Status?: string | null; PaymentId?: string | null } | null;
};

/**
 * PAYMENT_STATUS_CHANGED signature: HMAC-SHA256 (base64) with the webhook secret over
 * "Invoice.Id=..,Invoice.Status=..,Transaction.Status=..,Transaction.PaymentId=..,Invoice.ExternalIdentifier=.."
 * (empty string for missing values). See https://docs.myfatoorah.com/docs/webhook-signature
 */
export function paymentWebhookSignatureBase(d: WebhookData) {
  const v = (x: unknown) => (x === null || x === undefined ? "" : String(x));
  return [
    `Invoice.Id=${v(d.Invoice?.Id)}`,
    `Invoice.Status=${v(d.Invoice?.Status)}`,
    `Transaction.Status=${v(d.Transaction?.Status)}`,
    `Transaction.PaymentId=${v(d.Transaction?.PaymentId)}`,
    `Invoice.ExternalIdentifier=${v(d.Invoice?.ExternalIdentifier)}`,
  ].join(",");
}

export function verifyWebhookSignature(data: WebhookData, signature: string | null, secret: string) {
  if (!signature) return false;
  const expected = createHmac("sha256", Buffer.from(secret, "utf8")).update(paymentWebhookSignatureBase(data), "utf8").digest("base64");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature.trim());
  return a.length === b.length && timingSafeEqual(a, b);
}

/* ---------------- Refunds (MakeRefund) ---------------- */

/**
 * Asks MyFatoorah to refund part or all of a payment to the customer's card.
 * MyFatoorah's finance team reviews and executes it, so success here means
 * "requested", not "money already returned".
 */
export async function makeRefund(paymentId: string, amountHalalas: number, comment: string) {
  if (!isValidPaymentId(paymentId)) throw new GatewayError("Invalid payment id for refund");
  if (amountHalalas <= 0) throw new GatewayError("Refund amount must be positive");
  const { status, json } = await call<{ RefundId: number; RefundReference: string; Amount: number }>("/v2/MakeRefund", {
    KeyType: "PaymentId",
    Key: paymentId,
    Amount: amountHalalas / 100,
    Comment: comment.slice(0, 200),
    ServiceChargeOnCustomer: false,
  });
  if (!json?.IsSuccess || !json.Data) {
    const details = json?.ValidationErrors?.map((v) => `${v.Name}: ${v.Error}`).join("; ");
    throw new GatewayError(`MakeRefund rejected (${status}): ${json?.Message ?? ""} ${details ?? ""}`.trim());
  }
  return { refundId: String(json.Data.RefundId), reference: json.Data.RefundReference ?? String(json.Data.RefundId) };
}
