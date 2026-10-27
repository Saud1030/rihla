import type { Locale } from "@/i18n/dictionaries";
import { formatTime } from "./format";

const CLOCK = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export const isClock = (v: unknown): v is string => typeof v === "string" && CLOCK.test(v);
export const isDay = (v: unknown): v is string => typeof v === "string" && DAY.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));

/** Wall-clock arithmetic (Riyadh has no DST): start + minutes -> end date, time and how many days later. */
export function addToClock(date: string | null, time: string, minutes: number) {
  const [h, mi] = time.split(":").map(Number);
  const base = date && isDay(date) ? Date.parse(`${date}T00:00:00Z`) : Date.UTC(2000, 0, 1);
  const end = new Date(base + (h * 60 + mi + minutes) * 60_000);
  const endDay = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
  return {
    date: end.toISOString().slice(0, 10),
    time: end.toISOString().slice(11, 16),
    dayOffset: Math.round((endDay - base) / 864e5),
  };
}

/** "١٢:٠٠ ص (اليوم التالي)" */
export function formatEnd(time: string, dayOffset: number, locale: Locale) {
  const t = formatTime(time, locale);
  if (dayOffset <= 0) return t;
  if (locale === "ar") return `${t} (${dayOffset === 1 ? "اليوم التالي" : `بعد ${dayOffset} أيام`})`;
  return `${t} (${dayOffset === 1 ? "next day" : `+${dayOffset} days`})`;
}

/** Every 15 minutes, for the time picker */
export const TIME_SLOTS = Array.from({ length: 96 }, (_, i) => `${String(Math.floor(i / 4)).padStart(2, "0")}:${String((i % 4) * 15).padStart(2, "0")}`);

/** End (hourly) or expected arrival (transfers) of a stored booking, formatted; null when unknown */
export function bookingEnd(b: { pickupDate: string; pickupTime: string; durationMin: number | null }, locale: Locale) {
  if (!b.durationMin || !isClock(b.pickupTime)) return null;
  const end = addToClock(b.pickupDate, b.pickupTime, b.durationMin);
  return formatEnd(end.time, end.dayOffset, locale);
}
