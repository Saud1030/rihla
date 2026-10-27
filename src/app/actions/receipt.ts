"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { and, count, eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { isLocale } from "@/i18n/dictionaries";
import { getBookingByRef } from "@/lib/booking";
import { cleanFileName, detectFile, MB, RECEIPT_TYPES } from "@/lib/files";
import { allow, clientIp } from "@/lib/rate-limit";

export type ReceiptState = { error?: "empty" | "too_big" | "type" | "limit" | "throttled" | "not_allowed" };

const MAX_SIZE = 5 * MB;
const MAX_PER_BOOKING = 5;

/**
 * Customer uploads the bank-transfer receipt from the booking page.
 * Only for bookings waiting for a bank transfer. The file is checked by its
 * content (image or PDF only), kept private, and only admins can open it.
 */
export async function uploadReceipt(ref: string, lang: string, _prev: ReceiptState, formData: FormData): Promise<ReceiptState> {
  const locale = isLocale(lang) ? lang : "ar";
  const ip = clientIp(await headers());
  if (!allow(`receipt-ip:${ip}`, 20, 60 * 60_000)) return { error: "throttled" };

  const b = await getBookingByRef(ref);
  if (!b || b.status !== "pending_payment" || b.paymentMethod !== "bank_transfer") return { error: "not_allowed" };

  const file = formData.get("receipt");
  if (!(file instanceof File) || file.size === 0) return { error: "empty" };
  if (file.size > MAX_SIZE) return { error: "too_big" };

  const [{ n }] = await db.select({ n: count() }).from(s.receipts).where(eq(s.receipts.bookingId, b.id));
  if (n >= MAX_PER_BOOKING) return { error: "limit" };

  const buf = Buffer.from(await file.arrayBuffer());
  const kind = detectFile(buf, RECEIPT_TYPES);
  if (!kind) return { error: "type" };

  // the booking may have been paid or cancelled meanwhile: insert only while it still waits for a transfer
  const [still] = await db
    .select({ id: s.bookings.id })
    .from(s.bookings)
    .where(and(eq(s.bookings.id, b.id), eq(s.bookings.status, "pending_payment"), eq(s.bookings.paymentMethod, "bank_transfer")))
    .limit(1);
  if (!still) return { error: "not_allowed" };

  await db.insert(s.receipts).values({
    bookingId: b.id,
    mime: kind.mime,
    fileName: cleanFileName(file.name, kind.ext),
    size: buf.length,
    data: buf,
  });
  redirect(`/${locale}/booking/${b.ref}?receipt=1`);
}
