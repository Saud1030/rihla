/**
 * Hourly packages and the cancellation policy. Pure functions shared by pages and actions.
 * Money is in halalas.
 */

export const HOUR_PACKAGES = [10, 12, 24] as const;
export type HourPackage = (typeof HOUR_PACKAGES)[number];

export const isHourPackage = (n: number): n is HourPackage => (HOUR_PACKAGES as readonly number[]).includes(n);

/** a full-day booking can run several days (24 h each), picked as "from date to date" */
export const MAX_DAYS = 30;
export const cleanDays = (v: unknown) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n >= 1 ? Math.min(MAX_DAYS, n) : 1;
};
/** days between two YYYY-MM-DD dates (the end date is when the last day ends), at least 1 */
export function daysBetween(from: string, to: string) {
  const d = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 864e5);
  return Number.isFinite(d) ? Math.max(1, Math.min(MAX_DAYS, d)) : 1;
}
/** how long a booking is, for lists: "٣ أيام" or "١٢ ساعة" */
export function durationText(hours: number, lang: "ar" | "en" = "ar") {
  const f = (n: number) => n.toLocaleString(lang === "ar" ? "ar-SA" : "en-US");
  if (hours >= 24 && hours % 24 === 0) {
    const d = hours / 24;
    return lang === "ar" ? (d === 1 ? "يوم كامل" : d === 2 ? "يومان" : d <= 10 ? `${f(d)} أيام` : `${f(d)} يومًا`) : d === 1 ? "1 day" : `${d} days`;
  }
  return lang === "ar" ? `${f(hours)} ساعة` : `${hours} hours`;
}

export function hourlyPrice(v: { hourly10: number; hourly12: number; hourly24: number }, hours: HourPackage) {
  return hours === 10 ? v.hourly10 : hours === 12 ? v.hourly12 : v.hourly24;
}

/* ---------------- Cancellation ---------------- */

export type CancelPolicy = {
  enabled: boolean;
  /** cancelling at least this many hours before pickup refunds everything */
  fullHours: number;
  /** percent refunded when cancelling later than that (but before pickup) */
  partialPercent: number;
  /** send the refund to MyFatoorah immediately, without admin approval */
  autoRefund: boolean;
};

export function parseCancelPolicy(st: Record<string, string>): CancelPolicy {
  const num = (v: string | undefined, def: number, max: number) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 && n <= max ? n : def;
  };
  return {
    enabled: st.cancel_enabled !== "0",
    fullHours: num(st.cancel_full_hours, 24, 720),
    partialPercent: num(st.cancel_partial_percent, 50, 100),
    autoRefund: st.refund_auto === "1",
  };
}

/** Pickup moment of a booking. Dates and times are entered in Saudi time (UTC+3, no daylight saving). */
export function pickupAt(pickupDate: string, pickupTime: string) {
  return new Date(`${pickupDate}T${pickupTime}:00+03:00`);
}

export type CancelQuote =
  | { allowed: true; refund: number; full: boolean; hoursLeft: number }
  | { allowed: false; reason: "disabled" | "status" | "started" };

/** What the customer gets back if they cancel now */
export function cancelQuote(
  b: { status: string; amount: number; pickupDate: string; pickupTime: string },
  policy: CancelPolicy,
  now = new Date(),
): CancelQuote {
  if (!policy.enabled) return { allowed: false, reason: "disabled" };
  if (b.status !== "paid" && b.status !== "confirmed") return { allowed: false, reason: "status" };
  const hoursLeft = (pickupAt(b.pickupDate, b.pickupTime).getTime() - now.getTime()) / 3_600_000;
  if (hoursLeft <= 0) return { allowed: false, reason: "started" };
  const full = hoursLeft >= policy.fullHours;
  const refund = full ? b.amount : Math.round((b.amount * policy.partialPercent) / 100);
  return { allowed: true, refund, full, hoursLeft };
}

/** Compare phone numbers by their last 9 digits, so +966 5x / 05x / 5x all match */
export function samePhone(a: string, b: string) {
  const d = (s: string) => s.replace(/[٠-٩]/g, (c) => String("٠١٢٣٤٥٦٧٨٩".indexOf(c))).replace(/\D/g, "").slice(-9);
  const x = d(a);
  return x.length >= 7 && x === d(b);
}
