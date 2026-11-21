"use server";

import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { isLocale } from "@/i18n/dictionaries";
import { getBookingByRef } from "@/lib/booking";
import { getBankConfig, getSettings } from "@/lib/catalog";
import { cashEnabled } from "@/lib/cash";

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
