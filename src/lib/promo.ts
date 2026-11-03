import "server-only";
import { randomInt } from "node:crypto";
import { and, count, eq, inArray, isNull } from "drizzle-orm";
import { db, schema as s } from "@/db";
import type { Booking } from "@/db/schema";
import { notify, readSettings } from "./notify";
import { formatNumber } from "./format";

/**
 * Promo codes for loyal customers. Every Nth paid booking of the same mobile number (N set by the admin: 5, 10, 20...)
 * earns a code, sent on WhatsApp and email. The code takes a percentage off the next booking (before VAT), once.
 */

export const DEFAULT_PROMO_EVERY = 5;
export const DEFAULT_PROMO_PERCENT = 10;

export function promoSettings(st: Record<string, string>) {
  const every = Number(st.promo_every);
  const percent = Number(st.promo_percent);
  return {
    enabled: st.promo_enabled !== "0",
    every: Number.isInteger(every) && every >= 1 && every <= 1000 ? every : DEFAULT_PROMO_EVERY,
    percent: Number.isInteger(percent) && percent >= 1 && percent <= 100 ? percent : DEFAULT_PROMO_PERCENT,
  };
}

/** what the customer typed -> how codes are stored (upper case, no spaces) */
export const cleanCode = (v: unknown) =>
  String(v ?? "")
    .toUpperCase()
    .replace(/[\s\-_]/g, "")
    .slice(0, 20);

const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const newCode = () => "VIP" + Array.from({ length: 6 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");

/** The one code for everyone (Admin -> Promo codes): the admin copies it and sends it to all. Once per mobile number. */
export function publicPromo(st: Record<string, string>) {
  const percent = Number(st.promo_public_percent);
  const code = cleanCode(st.promo_public_code);
  return {
    enabled: st.promo_public_enabled === "1" && /^[A-Z0-9]{4,20}$/.test(code),
    code,
    percent: Number.isInteger(percent) && percent >= 1 && percent <= 100 ? percent : DEFAULT_PROMO_PERCENT,
  };
}

/** a code that can still be used (a customer's own code, or the code for everyone), or null */
export async function usablePromo(code: string, phone?: string): Promise<{ percent: number; general: boolean } | null> {
  if (!/^[A-Z0-9]{4,20}$/.test(code)) return null;
  const pub = publicPromo(await readSettings());
  if (pub.enabled && code === pub.code) {
    // once per mobile number: a paid booking with it already counts
    if (phone) {
      const [{ n }] = await db
        .select({ n: count() })
        .from(s.bookings)
        .where(and(eq(s.bookings.customerPhone, phone), eq(s.bookings.promoCode, code), inArray(s.bookings.status, ["paid", "confirmed", "completed"])));
      if (n > 0) return null;
    }
    return { percent: pub.percent, general: true };
  }
  const row = await db.query.promoCodes.findFirst({ where: and(eq(s.promoCodes.code, code), isNull(s.promoCodes.usedAt)) });
  return row ? { percent: row.percent, general: false } : null;
}

/** the discount on a price before VAT */
export const discountFor = (price: number, percent: number) => Math.round((price * percent) / 100);

/** After a booking is paid: its promo code is used up, and the customer may have earned a new one. Never throws. */
export async function afterPaid(b: Booking) {
  try {
    if (b.promoCode)
      await db
        .update(s.promoCodes)
        .set({ usedAt: new Date(), usedBookingId: b.id })
        .where(and(eq(s.promoCodes.code, b.promoCode), isNull(s.promoCodes.usedAt)));

    const st = await readSettings();
    const cfg = promoSettings(st);
    if (!cfg.enabled) return null;
    const [{ n }] = await db
      .select({ n: count() })
      .from(s.bookings)
      .where(and(eq(s.bookings.customerPhone, b.customerPhone), inArray(s.bookings.status, ["paid", "confirmed", "completed"])));
    if (n === 0 || n % cfg.every !== 0) return null;

    let row: typeof s.promoCodes.$inferSelect | undefined;
    for (let attempt = 0; attempt < 5 && !row; attempt++) {
      const inserted = await db
        .insert(s.promoCodes)
        .values({
          code: newCode(),
          customerName: b.customerName,
          customerPhone: b.customerPhone,
          customerEmail: b.customerEmail,
          percent: cfg.percent,
          bookingsCount: n,
          earnedBookingId: b.id,
        })
        .onConflictDoNothing()
        .returning();
      row = inserted[0];
      // nothing inserted: this milestone already has its code (or, very rarely, the code itself clashed)
      if (!row && (await db.query.promoCodes.findFirst({ where: and(eq(s.promoCodes.customerPhone, b.customerPhone), eq(s.promoCodes.bookingsCount, n)) }))) return null;
    }
    if (!row) return null;
    await sendPromo(row, b.locale === "en" ? "en" : "ar");
    return row;
  } catch (e) {
    console.error("promo code failed", e);
    return null;
  }
}

/** the message with the code, on WhatsApp and (if the customer gave one) by email */
export async function sendPromo(p: typeof s.promoCodes.$inferSelect, lang: "ar" | "en") {
  const ar = lang === "ar";
  const n = formatNumber(p.bookingsCount, lang);
  const pct = formatNumber(p.percent, lang);
  const manual = p.bookingsCount === 0;
  const body = ar
    ? [
        `مرحبًا ${p.customerName}، شكرًا لثقتك بنا!`,
        manual ? `هذا رمز ترويجي خاص لك: ${p.code}` : `بمناسبة حجزك رقم ${n} معنا، هذا رمز ترويجي خاص لك: ${p.code}`,
        `خصم ${pct}٪ على حجزك القادم. اكتبه في خانة «الرمز الترويجي» وقت الحجز.`,
        "شكرًا لكم لاختياركم Mighty Hands Trans.",
      ].join("\n")
    : [
        `Hello ${p.customerName}, thank you for riding with us!`,
        manual ? `Here is your own promo code: ${p.code}` : `For your booking number ${n}, here is your own promo code: ${p.code}`,
        `${pct}% off your next booking. Type it in the "Promo code" box when you book.`,
        "Thank you for choosing Mighty Hands Trans.",
      ].join("\n");
  await notify({ channel: "whatsapp", kind: "promo_code", recipient: p.customerPhone, recipientName: p.customerName, body, params: [p.customerName, p.code, `${pct}%`, n] });
  if (p.customerEmail)
    await notify({
      channel: "email",
      kind: "promo_code",
      recipient: p.customerEmail,
      recipientName: p.customerName,
      subject: ar ? `رمز ترويجي خاص لك: ${p.code}` : `Your promo code: ${p.code}`,
      body,
    });
}
