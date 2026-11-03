/**
 * Automatic price changes by the trip date (used by the booking form and again on the server):
 *  - Hajj & Umrah seasons (Admin -> Hajj & Umrah): a % increase between two Hijri dates, every year by itself
 *    (default 1 Ramadan – 5 Shawwal, and 15 Dhu al-Qadah – 20 Dhu al-Hijjah)
 *  - Offers (Admin -> Offers): a % discount between two dates, on or off by hand
 * Order: the season increase first, then the offer discount, then a promo code (on what is left).
 */

export type Season = { key: string; name: { ar: string; en: string }; enabled: boolean; percent: number; from: [month: number, day: number]; to: [month: number, day: number] };
export type Offer = { id: number; name: { ar: string; en: string }; percent: number; from: string; to: string };
export type PriceRules = { seasons: Season[]; offers: Offer[] };

export const HIJRI_MONTHS = {
  ar: ["محرم", "صفر", "ربيع الأول", "ربيع الآخر", "جمادى الأولى", "جمادى الآخرة", "رجب", "شعبان", "رمضان", "شوال", "ذو القعدة", "ذو الحجة"],
  en: ["Muharram", "Safar", "Rabi I", "Rabi II", "Jumada I", "Jumada II", "Rajab", "Sha'ban", "Ramadan", "Shawwal", "Dhu al-Qadah", "Dhu al-Hijjah"],
};

let fmt: Intl.DateTimeFormat | null = null;
/** a Gregorian date (YYYY-MM-DD) as a Hijri (Umm al-Qura) month, day and year */
export function toHijri(date: string): { month: number; day: number; year: number } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  try {
    fmt ??= new Intl.DateTimeFormat("en-u-ca-islamic-umalqura-nu-latn", { year: "numeric", month: "numeric", day: "numeric", timeZone: "UTC" });
    const parts = fmt.formatToParts(new Date(`${date}T12:00:00Z`));
    const n = (t: string) => Number(parts.find((p) => p.type === t)?.value);
    const r = { month: n("month"), day: n("day"), year: n("year") };
    return Number.isFinite(r.month) && Number.isFinite(r.day) ? r : null;
  } catch {
    return null;
  }
}

/** Is the date inside the season (Hijri month/day window; a window may run over the new Hijri year)? */
export function inSeason(date: string, s: Pick<Season, "from" | "to">) {
  const h = toHijri(date);
  if (!h) return false;
  const v = h.month * 100 + h.day;
  const a = s.from[0] * 100 + s.from[1];
  const b = s.to[0] * 100 + s.to[1];
  return a <= b ? v >= a && v <= b : v >= a || v <= b;
}

export type Adjustment = { kind: "season" | "offer"; name: { ar: string; en: string }; percent: number; amount: number };

/** The changes for a trip on this date, and the price after them (before a promo code and VAT) */
export function adjustPrice(price: number, date: string, rules: PriceRules | null | undefined): { price: number; lines: Adjustment[] } {
  const lines: Adjustment[] = [];
  if (!rules || !date) return { price, lines };
  let p = price;
  for (const s of rules.seasons) {
    if (!s.enabled || s.percent <= 0 || !inSeason(date, s)) continue;
    const amount = Math.round((price * s.percent) / 100);
    lines.push({ kind: "season", name: s.name, percent: s.percent, amount });
    p += amount;
    break; // the two seasons never overlap; one increase at most
  }
  // the best running offer for that day
  const offer = rules.offers.filter((o) => o.from <= date && date <= o.to && o.percent > 0).sort((a, b) => b.percent - a.percent)[0];
  if (offer) {
    const amount = -Math.round((p * offer.percent) / 100);
    lines.push({ kind: "offer", name: offer.name, percent: offer.percent, amount });
    p += amount;
  }
  return { price: Math.max(0, p), lines };
}

/** The Gregorian days of a Hijri window in the coming months (for the admin page) */
export function nextSeasonDates(s: Pick<Season, "from" | "to">, today: string, days = 420): { from: string; to: string } | null {
  let start: string | null = null;
  const d = new Date(`${today}T12:00:00Z`);
  // already in the season: from its first day
  for (let i = 0; i < 70 && inSeason(d.toISOString().slice(0, 10), s); i++) d.setUTCDate(d.getUTCDate() - 1);
  if (!inSeason(d.toISOString().slice(0, 10), s) && inSeason(today, s)) d.setUTCDate(d.getUTCDate() + 1);
  for (let i = 0; i < days; i++) {
    const iso = d.toISOString().slice(0, 10);
    const inside = inSeason(iso, s);
    if (inside && !start) start = iso;
    if (!inside && start) {
      const end = new Date(d.getTime() - 86_400_000).toISOString().slice(0, 10);
      return { from: start, to: end };
    }
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return start ? { from: start, to: d.toISOString().slice(0, 10) } : null;
}
