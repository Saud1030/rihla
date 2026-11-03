/**
 * Automatic price changes by the trip date (used by the booking form and again on the server):
 *  - Seasons (Admin -> Seasons): a % increase between two dates (Hajj, Umrah, holidays...), added and switched by hand
 *  - Offers (Admin -> Offers): a % discount between two dates, on or off by hand
 * Order: the season increase first, then the offer discount, then a promo code (on what is left).
 */

export type DatedRule = { id: number; name: { ar: string; en: string }; percent: number; from: string; to: string };
export type PriceRules = { seasons: DatedRule[]; offers: DatedRule[] };

export type Adjustment = { kind: "season" | "offer"; name: { ar: string; en: string }; percent: number; amount: number };

/** the biggest rule running on that day */
const best = (rules: DatedRule[], date: string) => rules.filter((r) => r.from <= date && date <= r.to && r.percent > 0).sort((a, b) => b.percent - a.percent)[0];

/** The changes for a trip on this date, and the price after them (before a promo code and VAT) */
export function adjustPrice(price: number, date: string, rules: PriceRules | null | undefined): { price: number; lines: Adjustment[] } {
  const lines: Adjustment[] = [];
  if (!rules || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return { price, lines };
  let p = price;
  const season = best(rules.seasons, date);
  if (season) {
    const amount = Math.round((price * season.percent) / 100);
    lines.push({ kind: "season", name: season.name, percent: season.percent, amount });
    p += amount;
  }
  const offer = best(rules.offers, date);
  if (offer) {
    const amount = -Math.round((p * offer.percent) / 100);
    lines.push({ kind: "offer", name: offer.name, percent: offer.percent, amount });
    p += amount;
  }
  return { price: Math.max(0, p), lines };
}
