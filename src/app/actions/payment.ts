"use server";

import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { isLocale } from "@/i18n/dictionaries";
import { getBookingByRef } from "@/lib/booking";
import { createInvoice, GatewayError, isGatewayConfigured } from "@/lib/myfatoorah";
import { publicBaseUrl } from "@/lib/public-url";
import { getBankConfig } from "@/lib/catalog";

export type PayState = { error?: "gateway" | "not_configured" };

/** Creates a MyFatoorah invoice for the booking and sends the customer to the payment page. */
export async function startPayment(ref: string, lang: string, _prev: PayState, _formData: FormData): Promise<PayState> {
  const locale = isLocale(lang) ? lang : "ar";
  const b = await getBookingByRef(ref);
  if (!b) redirect(`/${locale}/booking`);
  if (b.status !== "pending_payment") redirect(`/${locale}/booking/${b.ref}`);
  if (!isGatewayConfigured()) return { error: "not_configured" };

  let url: string;
  try {
    const invoice = await createInvoice(b, locale, await publicBaseUrl());
    await db
      .update(s.bookings)
      .set({ invoiceId: invoice.invoiceId, paymentMethod: "myfatoorah", updatedAt: new Date() })
      .where(and(eq(s.bookings.id, b.id), eq(s.bookings.status, "pending_payment")));
    url = invoice.url;
  } catch (e) {
    console.error("startPayment failed", e instanceof GatewayError ? e.message : e);
    return { error: "gateway" };
  }
  redirect(url);
}

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
