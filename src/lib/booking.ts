import "server-only";
import { randomInt } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, schema as s } from "@/db";

// No 0/O/1/I/L to avoid confusion when read over the phone
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

export function newBookingRef() {
  let out = "";
  for (let i = 0; i < 8; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}

export function normalizeRef(v: string) {
  return v.trim().toUpperCase().replace(/[^0-9A-Z]/g, "");
}

export async function getBookingByRef(ref: string) {
  const r = normalizeRef(ref);
  if (!r) return null;
  const [row] = await db.select().from(s.bookings).where(eq(s.bookings.ref, r)).limit(1);
  return row ?? null;
}

/** Today's date in Saudi Arabia as YYYY-MM-DD */
export function todayInRiyadh(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(now);
}

/** Last day a pickup can be booked: one year ahead */
export function maxBookingDate() {
  return todayInRiyadh(new Date(Date.now() + 365 * 864e5));
}

/** "+966 50 123 4567" -> "+9665*****567" for public pages */
export function maskPhone(p: string) {
  const d = p.replace(/\s/g, "");
  if (d.length < 7) return d;
  return d.slice(0, 5) + "•".repeat(Math.max(0, d.length - 8)) + d.slice(-3);
}
