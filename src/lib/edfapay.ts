import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { and, isNull } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { issueReceipt } from "./documents";
import { readSettings } from "./notify";

/**
 * EdfaPay hosted checkout (server side only). Docs: https://docs.edfapay.com
 *
 * Flow:
 *  1. "Pay online" -> createSession(): our server POSTs the order to EdfaPay with the API key
 *     (X-API-KEY, never sent to the browser) and gets a redirectUrl.
 *  2. The customer pays on EdfaPay's page and comes back to successUrl / failureUrl.
 *     Those pages prove NOTHING: the browser is never trusted for amount or status.
 *  3. EdfaPay POSTs a webhook. We check its HMAC-SHA256 signature (X-EdfaPay-Signature, keyed with the
 *     Webhook Secret, over the raw body) BEFORE reading it, then require status "Approved", the booking
 *     (or installment) it names, and the exact amount. Only then is the booking marked paid, once.
 *
 * No database change is needed: payments are logged in `payments` with id EDFA-<transactionId>.
 * Refunds stay manual (from the EdfaPay dashboard, then recorded by the admin).
 */

export class EdfaError extends Error {}

const BASES = { live: "https://app-api.edfapay.com", test: "https://demo-api.edfapay.com" } as const;

export async function edfaConfig() {
  const st = await readSettings();
  const key = (st.gw_edfapay_key ?? "").trim();
  if (!key) return null;
  const mode = st.gw_edfapay_mode === "test" ? "test" : "live";
  return { key, mode, base: BASES[mode], webhookSecret: (st.gw_edfapay_secret ?? "").trim(), chosen: st.pay_gateway === "edfapay" };
}

/** Offered at checkout only when chosen in Admin -> Payment gateways AND both the key and the webhook secret are saved */
export async function onlinePaymentOn() {
  const c = await edfaConfig();
  return !!c && c.chosen && !!c.webhookSecret;
}

/** A fresh order id each attempt (EdfaPay may refuse a reused one): `<ref>_<6 hex>`. The suffix is stripped when the webhook comes back. */
export const newOrderId = (reference: string) => `${reference}_${randomBytes(3).toString("hex")}`;
const ORDER_RE = /^([A-Za-z0-9_-]{3,70})_[a-f0-9]{6}$/;
export const referenceOf = (orderId: string) => ORDER_RE.exec(orderId)?.[1] ?? null;

export async function createSession(o: {
  orderId: string;
  /** halalas, VAT included */
  amount: number;
  customer: { name: string; email: string; phone: string };
  successUrl: string;
  failureUrl: string;
}): Promise<{ redirectUrl: string }> {
  const cfg = await edfaConfig();
  if (!cfg) throw new EdfaError("EdfaPay API key is not set");
  let res: Response;
  try {
    res = await fetch(`${cfg.base}/api/v1/payment-gateway/initiate`, {
      method: "POST",
      headers: { "X-API-KEY": cfg.key, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        orderId: o.orderId,
        currency: "SAR",
        amount: o.amount / 100,
        customerDetails: { name: o.customer.name.slice(0, 100), email: o.customer.email, phone: o.customer.phone },
        recurringInit: "N",
        auth: "N",
        successUrl: o.successUrl,
        failureUrl: o.failureUrl,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
  } catch (e) {
    throw new EdfaError(`EdfaPay unreachable: ${(e as Error).message}`);
  }
  const json = (await res.json().catch(() => null)) as { code?: number; message?: string; errorCode?: string | null; data?: { redirectUrl?: string } } | null;
  const url = json?.data?.redirectUrl;
  if (!res.ok || !url) throw new EdfaError(`EdfaPay initiate rejected (${res.status}): ${json?.message ?? ""} ${json?.errorCode ?? ""}`.trim());
  // only ever send the customer to EdfaPay itself
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new EdfaError("EdfaPay returned an invalid redirect URL");
  }
  if (u.protocol !== "https:" || !/(^|\.)edfapay\.com$/i.test(u.hostname)) throw new EdfaError(`EdfaPay returned an unexpected redirect host: ${u.hostname}`);
  return { redirectUrl: u.toString() };
}

/** HMAC-SHA256 (hex) of the RAW body with the webhook secret, compared in constant time */
export function verifySignature(rawBody: string, signature: string | null, secret: string) {
  if (!signature || !secret) return false;
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const got = signature.trim().toLowerCase();
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(got, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

type Payload = {
  transactionId?: string | number;
  orderId?: string;
  amount?: string | number;
  currencyCode?: string | number;
  status?: string;
  type?: string;
  [k: string]: unknown;
};

export type WebhookResult = { status: number; body: Record<string, unknown> };
const done = (status: number, body: Record<string, unknown>): WebhookResult => ({ status, body });
const toHalalas = (v: unknown) => Math.round(Number(v) * 100);
const PAYMENT_ID_RE = /^[A-Za-z0-9_-]{3,100}$/;

/**
 * The whole webhook. 401 = bad signature, 503 = not configured, 400 = not JSON, 500 = temporary (EdfaPay retries),
 * 200 = handled or deliberately ignored (retrying would not change the answer).
 */
export async function handleWebhook(rawBody: string, signature: string | null): Promise<WebhookResult> {
  const cfg = await edfaConfig();
  if (!cfg?.webhookSecret) return done(503, { error: "webhook not configured" });
  if (!verifySignature(rawBody, signature, cfg.webhookSecret)) return done(401, { error: "invalid signature" });

  let p: Payload;
  try {
    p = JSON.parse(rawBody) as Payload;
  } catch {
    return done(400, { error: "invalid json" });
  }
  if (!p || typeof p !== "object") return done(400, { error: "invalid json" });

  const type = String(p.type ?? "");
  // refunds, voids and authorizations never mark anything paid (we only create sales: auth = "N")
  if (/^(refund|void|authori[sz]ation)$/i.test(type)) return done(200, { ok: true, ignored: `type ${type}` });
  // "Redirect", "Pending" and "Declined" are not money received; only "Approved" is
  if (!/^approved$/i.test(String(p.status ?? ""))) return done(200, { ok: true, ignored: `status ${String(p.status ?? "")}` });

  const txId = String(p.transactionId ?? "");
  const orderId = String(p.orderId ?? "");
  if (!PAYMENT_ID_RE.test(txId)) return done(200, { ok: true, ignored: "no transaction id" });
  const reference = referenceOf(orderId);
  if (!reference) return done(200, { ok: true, ignored: "unknown order id" });

  const paymentId = `EDFA-${txId}`;
  const cur = p.currencyCode;
  const currencyOk = cur == null || cur === "" || String(cur).toUpperCase() === "SAR" || String(cur) === "682";
  const paid = toHalalas(p.amount);
  const log = (bookingId: string | null, note?: string) =>
    db
      .insert(s.payments)
      .values({ id: paymentId, bookingId, status: "paid", amount: Number.isFinite(paid) ? paid : 0, currency: "SAR", source: "edfapay", raw: note ? { note, ...p } : p })
      .onConflictDoNothing();

  try {
    /* ---- an installment of a package ---- */
    if (reference.startsWith("INS-")) {
      const inst = await db.query.installments.findFirst({ where: eq(s.installments.token, reference.slice(4)) });
      const booking = inst ? await db.query.bookings.findFirst({ where: eq(s.bookings.id, inst.bookingId) }) : undefined;
      if (!inst || !booking) {
        await log(null, "unknown installment");
        console.warn("EdfaPay: approved payment for an unknown installment", { orderId, paymentId });
        return done(200, { ok: true, ignored: "installment not found" });
      }
      if (inst.paymentId === paymentId) return done(200, { ok: true, result: "already_settled" });
      if (!currencyOk || paid !== inst.amount) {
        await log(null, "amount_mismatch");
        console.warn("EdfaPay: installment amount mismatch", { orderId, paymentId, paid, due: inst.amount });
        return done(200, { ok: true, ignored: "amount mismatch" });
      }
      await log(booking.id);
      if (booking.status === "cancelled" || inst.paidAt) {
        console.warn("EdfaPay: approved payment for an installment that cannot take it (cancelled or already paid): refund needed", { orderId, paymentId });
        return done(200, { ok: true, ignored: "installment not payable" });
      }
      const { markInstallmentPaid } = await import("./packages");
      await markInstallmentPaid(inst.id, { paymentId, invoiceId: null, method: "online" });
      return done(200, { ok: true, result: "settled" });
    }

    /* ---- a normal booking ---- */
    const booking = await db.query.bookings.findFirst({ where: eq(s.bookings.ref, reference) });
    if (!booking) {
      await log(null, "unknown booking");
      console.warn("EdfaPay: approved payment for an unknown booking", { orderId, paymentId });
      return done(200, { ok: true, ignored: "booking not found" });
    }
    if (booking.paymentId === paymentId) return done(200, { ok: true, result: "already_settled" });
    if (!currencyOk || paid !== booking.amount) {
      await log(null, "amount_mismatch");
      console.warn("EdfaPay: amount mismatch", { orderId, paymentId, paid, due: booking.amount });
      return done(200, { ok: true, ignored: "amount mismatch" });
    }
    // log + flip pending -> paid in ONE transaction; the update only matches an unpaid, pending booking
    const updated = await db.transaction(async (tx) => {
      await tx
        .insert(s.payments)
        .values({ id: paymentId, bookingId: booking.id, status: "paid", amount: paid, currency: "SAR", source: "edfapay", raw: p })
        .onConflictDoNothing();
      return tx
        .update(s.bookings)
        .set({ status: "paid", paymentMethod: "online", paymentId, paidAt: new Date(), updatedAt: new Date() })
        .where(and(eq(s.bookings.id, booking.id), eq(s.bookings.status, "pending_payment"), isNull(s.bookings.paymentId)))
        .returning({ id: s.bookings.id });
    });
    if (updated.length) {
      await issueReceipt(booking.id); // the payment voucher goes to the customer
      return done(200, { ok: true, result: "settled" });
    }
    const now = await db.query.bookings.findFirst({ where: eq(s.bookings.id, booking.id) });
    if (now?.paymentId === paymentId) return done(200, { ok: true, result: "already_settled" });
    console.warn("EdfaPay: approved payment for a booking that is not pending (cancelled or paid another way): refund needed", { orderId, paymentId, status: booking.status });
    return done(200, { ok: true, ignored: "booking not payable" });
  } catch (e) {
    console.error("EdfaPay webhook error", e);
    return done(500, { error: "temporary failure" }); // non-2xx: EdfaPay retries
  }
}
