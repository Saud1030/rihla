/**
 * How long before the trip a booking must be made. With 6 hours, at 12:00 the nearest pickup that can be booked is 18:00.
 * The admin sets the hours (Settings -> booking rules); Riyadh time (UTC+3, no daylight saving).
 * Shared by the browser (time pickers) and the server (the booking is refused if too soon).
 */

export const DEFAULT_LEAD_HOURS = 6;
export const MAX_LEAD_HOURS = 72;

/** the setting's text -> hours (0..72), the default when missing or wrong */
export function parseLeadHours(v: string | null | undefined) {
  if (v == null || v.trim() === "") return DEFAULT_LEAD_HOURS;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 && n <= MAX_LEAD_HOURS ? n : DEFAULT_LEAD_HOURS;
}

const RIYADH_OFFSET = 3 * 3600_000;
const QUARTER = 15 * 60_000;

/** the earliest pickup that can be booked now: now + lead hours, rounded up to the next quarter hour (the time picker's steps) */
export function earliestPickup(leadHours: number, now = Date.now()) {
  const at = Math.ceil((now + leadHours * 3600_000 + RIYADH_OFFSET) / QUARTER) * QUARTER;
  const iso = new Date(at).toISOString();
  return { date: iso.slice(0, 10), time: iso.slice(11, 16) };
}

export type Earliest = ReturnType<typeof earliestPickup>;

/** a pickup on this date and time is far enough ahead */
export const farEnough = (date: string, time: string, e: Earliest) => `${date} ${time}` >= `${e.date} ${e.time}`;
