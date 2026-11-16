/**
 * Automatic price changes by the trip date (used by the booking form and again on the server):
 *  - Seasons (Admin -> Seasons): a % increase between two dates (Hajj, Umrah, holidays...), added and switched by hand
 *    → optionally per-city: when a season has city overrides only trips to/from those cities are affected
 *  - Offers (Admin -> Offers): a % discount between two dates, on or off by hand
 * Order: the season increase first, then the offer discount, then a promo code (on what is left).
 */

export type CityOverride = { city: string; percent: number };

export type DatedRule = {
  id: number;
  name: { ar: string; en: string };
  percent: number;
  from: string;
  to: string;
  /** when non-empty, only trips involving these cities are affected, at the city-specific % */
  cityOverrides?: CityOverride[];
};

export type PriceRules = { seasons: DatedRule[]; offers: DatedRule[] };

export type Adjustment = { kind: "season" | "offer"; name: { ar: string; en: string }; percent: number; amount: number };

/** Resolve the effective percent for a season rule given the trip's cities.
 *  - No city overrides → use the season's default percent (applies to all)
 *  - Has city overrides → if any trip city matches, use the highest matching city %; otherwise 0 (skip)
 */
function effectivePercent(rule: DatedRule, cities?: string[]): number {
  if (!rule.cityOverrides || rule.cityOverrides.length === 0) return rule.percent;
  if (!cities || cities.length === 0) return 0; // has overrides but no city info → skip
  let best = 0;
  for (const co of rule.cityOverrides) {
    if (cities.includes(co.city) && co.percent > best) best = co.percent;
  }
  return best;
}

/** the biggest rule running on that day, considering city overrides */
function bestSeason(rules: DatedRule[], date: string, cities?: string[]): { rule: DatedRule; percent: number } | undefined {
  let best: { rule: DatedRule; percent: number } | undefined;
  for (const r of rules) {
    if (r.from > date || date > r.to) continue;
    const pct = effectivePercent(r, cities);
    if (pct > 0 && (!best || pct > best.percent)) best = { rule: r, percent: pct };
  }
  return best;
}

/** the biggest offer rule running on that day (offers don't have city overrides) */
const bestOffer = (rules: DatedRule[], date: string) =>
  rules.filter((r) => r.from <= date && date <= r.to && r.percent > 0).sort((a, b) => b.percent - a.percent)[0];

/** The changes for a trip on this date, and the price after them (before a promo code and VAT).
 *  `cities` is the from/to city slugs of the trip — used to match per-city season overrides.
 */
export function adjustPrice(
  price: number,
  date: string,
  rules: PriceRules | null | undefined,
  cities?: string[],
): { price: number; lines: Adjustment[] } {
  const lines: Adjustment[] = [];
  if (!rules || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return { price, lines };
  let p = price;
  const season = bestSeason(rules.seasons, date, cities);
  if (season) {
    const amount = Math.round((price * season.percent) / 100);
    lines.push({ kind: "season", name: season.rule.name, percent: season.percent, amount });
    p += amount;
  }
  const offer = bestOffer(rules.offers, date);
  if (offer) {
    const amount = -Math.round((p * offer.percent) / 100);
    lines.push({ kind: "offer", name: offer.name, percent: offer.percent, amount });
    p += amount;
  }
  return { price: Math.max(0, p), lines };
}
