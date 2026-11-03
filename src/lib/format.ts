import type { Locale } from "@/i18n/dictionaries";

/** Format halalas as SAR. Arabic uses Arabic digits. */
/** the new Saudi Riyal sign (U+20C1), drawn on the site by a small font (see globals.css) */
export const RIYAL = "\u20C1";

const amount = (halalas: number, locale: Locale) => {
  const value = halalas / 100;
  return new Intl.NumberFormat(locale === "ar" ? "ar-SA" : "en-SA", {
    minimumFractionDigits: value % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value);
};

/** a price on the site, with the Saudi Riyal sign */
export function formatSAR(halalas: number, locale: Locale) {
  const n = amount(halalas, locale);
  return locale === "ar" ? `${n} ${RIYAL}` : `${RIYAL} ${n}`;
}

/** a price in WhatsApp, email, PDF and Excel, where the new sign may not show yet: ر.س / SAR */
export function formatSARText(halalas: number, locale: Locale) {
  const n = amount(halalas, locale);
  return locale === "ar" ? `${n} ر.س` : `SAR ${n}`;
}

export function formatNumber(n: number, locale: Locale, decimals?: number) {
  const opts = decimals === undefined ? {} : { minimumFractionDigits: decimals, maximumFractionDigits: decimals };
  return new Intl.NumberFormat(locale === "ar" ? "ar-SA" : "en-SA", opts).format(n);
}

export function formatDuration(min: number, locale: Locale) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  const N = (x: number) => formatNumber(x, locale);
  if (locale === "ar") {
    if (!h) return `${N(m)} دقيقة`;
    return m ? `${N(h)} س ${N(m)} د` : `${N(h)} ساعات`;
  }
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

export function formatDate(d: string | Date, locale: Locale, opts: { weekday?: boolean } = {}) {
  const date = typeof d === "string" ? new Date(`${d}T00:00:00`) : d;
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-ca-gregory" : "en-GB", {
    ...(opts.weekday === false ? {} : { weekday: "short" as const }),
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function formatDateTime(d: Date, locale: Locale) {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-ca-gregory" : "en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Riyadh",
  }).format(d);
}

/** "14:30" -> "2:30 م" / "2:30 PM" */
export function formatTime(t: string, locale: Locale) {
  const [h, m] = t.split(":").map(Number);
  const d = new Date(2000, 0, 1, h, m);
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-SA" : "en-US", { hour: "numeric", minute: "2-digit" }).format(d);
}

/** Pick ar/en field from a row */
export function pick<T extends Record<string, unknown>>(row: T, base: string, locale: Locale): string {
  const key = `${base}${locale === "ar" ? "Ar" : "En"}`;
  return (row[key] as string) ?? "";
}

/** "+ ضريبة ١٥٪" or "شامل الضريبة" under a listed price */
export function vatNote(vat: { rateBp: number; inclusiveDisplay: boolean }, locale: Locale) {
  const pct = formatNumber(vat.rateBp / 100, locale);
  if (vat.inclusiveDisplay) return locale === "ar" ? `شامل ضريبة ${pct}٪` : `incl. ${pct}% VAT`;
  return locale === "ar" ? `+ ضريبة ${pct}٪` : `+ ${pct}% VAT`;
}

/** Staff-facing running booking number: 1 -> MHT01, 120 -> MHT120 */
export const bookingNo = (n: number | null | undefined) => (n ? `MHT${String(n).padStart(2, "0")}` : "—");

/** a multi-stop trip's places in order, with the date and time set for the later stops */
export function stopLines(b: { stops?: string[] | null; stopTimes?: (string | null)[] | null; legs?: { from: string; to: string; at: string }[] | null }, locale: Locale): string[] {
  const when = (at: string) => {
    const [d, t] = at.split(" ");
    return `${formatDate(d, locale, { weekday: false })} ${formatTime(t, locale)}`;
  };
  // several trips, each with its own time
  if (b.legs?.length) return b.legs.map((l) => `${l.from} ${locale === "ar" ? "←" : "→"} ${l.to} — ${when(l.at)}`);
  if (!b.stops?.length) return [];
  return b.stops.map((name, i) => {
    const at = b.stopTimes?.[i];
    if (!at) return name;
    const [d, t] = at.split(" ");
    return `${name} — ${formatDate(d, locale, { weekday: false })} ${formatTime(t, locale)}`;
  });
}
