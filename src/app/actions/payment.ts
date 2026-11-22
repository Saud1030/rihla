"use server";

import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { isLocale } from "@/i18n/dictionaries";
import { getBookingByRef } from "@/lib/booking";
import { getBankConfig, getSettings } from "@/lib/catalog";
import { cashEnabled } from "@/lib/cash";
import { createSession, EdfaError, newOrderId, onlinePaymentOn } from "@/lib/edfapay";
import { publicBaseUrl } from "@/lib/public-url";
import { installmentsOf } from "@/lib/packages";

/** Customer will pay by bank transfer: show the bank details on the booking page. The admin confirms when the money arrives. */
export async function chooseBankTransfer(ref: string, lang: string): Promise<void> {
  const locale = isLocale(lang) ? lang : "ar";
  const b = await getBookingByRef(ref);
  if (!b) redirect(`/${locale}/booking`);
  if (b.status === "pending_payment" && (await getBankConfig())) {
    await db
      .update(s.bookings)
      .set({ paymentMethod: "bank_transfer", updatedAt: new Date() })
      .where(and(eq(s.bookings.id, b.id), eq(s.bookings.status, "pending_payment")));
  }
  redirect(`/${locale}/booking/${b.ref}`);
}

/** Customer will pay cash to the driver on the day. The booking stands; the driver or the admin marks the cash received. */
export async function chooseCash(ref: string, lang: string): Promise<void> {
  const locale = isLocale(lang) ? lang : "ar";
  const b = await getBookingByRef(ref);
  if (!b) redirect(`/${locale}/booking`);
  if (b.status === "pending_payment" && cashEnabled(await getSettings())) {
    await db
      .update(s.bookings)
      .set({ paymentMethod: "cash", updatedAt: new Date() })
      .where(and(eq(s.bookings.id, b.id), eq(s.bookings.status, "pending_payment")));
  }
  redirect(`/${locale}/booking/${b.ref}`);
}

export type PayState = { error?: "not_configured" | "gateway" };

const emailFor = (b: { customerEmail: string | null; ref: string }, base: string) => b.customerEmail?.trim() || `${b.ref.toLowerCase().replace(/[^a-z0-9]/g, "")}@${new URL(base).hostname}`;

/** "Pay online": the server asks EdfaPay for a payment page and sends the customer there. The amount comes from OUR database, never the browser. */
export async function startOnlinePayment(ref: string, lang: string, _prev: PayState, _formData: FormData): Promise<PayState> {
  const locale = isLocale(lang) ? lang : "ar";
  const b = await getBookingByRef(ref);
  if (!b) redirect(`/${locale}/booking`);
  if (b.status !== "pending_payment") redirect(`/${locale}/booking/${b.ref}`);
  if (!(await onlinePaymentOn())) return { error: "not_configured" };
  let url: string;
  try {
    const base = await publicBaseUrl();
    ({ redirectUrl: url } = await createSession({
      orderId: newOrderId(b.ref),
      amount: b.amount,
      customer: { name: b.customerName, email: emailFor(b, base), phone: b.customerPhone },
      successUrl: `${base}/${locale}/booking/${b.ref}`,
      failureUrl: `${base}/${locale}/checkout/${b.ref}`,
    }));
  } catch (e) {
    console.error("startOnlinePayment failed", e instanceof EdfaError ? e.message : e);
    return { error: "gateway" };
  }
  redirect(url);
}

/** Same for one installment of a package (its own payment page /pay/<token>) */
export async function startInstallmentOnlinePayment(token: string, lang: string, _prev: PayState, _formData: FormData): Promise<PayState> {
  const locale = isLocale(lang) ? lang : "ar";
  if (!/^[A-Za-z0-9_-]{20,40}$/.test(token)) redirect(`/${locale}/booking`);
  const inst = await db.query.installments.findFirst({ where: eq(s.installments.token, token) });
  if (!inst) redirect(`/${locale}/booking`);
  const b = await db.query.bookings.findFirst({ where: eq(s.bookings.id, inst.bookingId) });
  if (!b || b.status === "cancelled" || inst.paidAt) redirect(`/${locale}/pay/${token}`);
  // installments are paid in order: this one must be the next unpaid
  const next = (await installmentsOf(b.id)).find((x) => !x.paidAt);
  if (!next || next.id !== inst.id) redirect(`/${locale}/pay/${token}`);
  if (!(await onlinePaymentOn())) return { error: "not_configured" };
  let url: string;
  try {
    const base = await publicBaseUrl();
    ({ redirectUrl: url } = await createSession({
      orderId: newOrderId(`INS-${inst.token}`),
      amount: inst.amount,
      customer: { name: b.customerName, email: emailFor(b, base), phone: b.customerPhone },
      successUrl: `${base}/${locale}/pay/${token}`,
      failureUrl: `${base}/${locale}/pay/${token}`,
    }));
  } catch (e) {
    console.error("startInstallmentOnlinePayment failed", e instanceof EdfaError ? e.message : e);
    return { error: "gateway" };
  }
  redirect(url);
}
