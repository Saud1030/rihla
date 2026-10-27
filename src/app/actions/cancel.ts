"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db, schema as s } from "@/db";
import { isLocale } from "@/i18n/dictionaries";
import { getBookingByRef } from "@/lib/booking";
import { cancelPaidBooking } from "@/lib/cancellation";
import { cancelQuote, parseCancelPolicy, samePhone } from "@/lib/policy";
import { clearLoginFailures, loginThrottled, recordLoginFailure } from "@/lib/auth";

export type CancelState = { error?: "phone" | "confirm" | "throttled" | "not_allowed" | "generic" };

/**
 * Customer cancels a paid booking from the booking page.
 * The booking number alone opens that page, so the customer also has to type
 * the mobile number used for the booking. Wrong attempts are throttled.
 */
export async function cancelByCustomer(ref: string, lang: string, _prev: CancelState, formData: FormData): Promise<CancelState> {
  const locale = isLocale(lang) ? lang : "ar";
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const key = `cancel:${ref}`;
  const ipKey = `cancel-ip:${ip}`;
  // 5 wrong tries per booking; a looser per-IP cap because many customers share a carrier's IP
  if (loginThrottled(key) || loginThrottled(ipKey, 20)) return { error: "throttled" };

  if (formData.get("confirm") !== "on") return { error: "confirm" };

  const b = await getBookingByRef(ref);
  if (!b) return { error: "generic" };

  const phone = String(formData.get("phone") ?? "").slice(0, 30);
  if (!samePhone(phone, b.customerPhone)) {
    recordLoginFailure(key);
    recordLoginFailure(ipKey);
    return { error: "phone" };
  }
  clearLoginFailures(key);

  // policy and amounts are read fresh from the database at the moment of cancelling
  const rows = await db.select().from(s.settings);
  const policy = parseCancelPolicy(Object.fromEntries(rows.map((r) => [r.key, r.value])));
  const quote = cancelQuote(b, policy);
  if (!quote.allowed) return { error: "not_allowed" };

  const done = await cancelPaidBooking(b.id, "customer", quote.refund, policy.autoRefund);
  if (!done) return { error: "not_allowed" };

  redirect(`/${locale}/booking/${b.ref}?cancelled=1`);
}
