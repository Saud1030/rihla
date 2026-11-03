import "server-only";
import { cache } from "react";
import { asc, gte } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { getSettings } from "./catalog";
import { cached } from "./memo";
import { todayInRiyadh } from "./booking";
import type { Offer, PriceRules, Season } from "./price-rules";

/** The two Hajj & Umrah seasons and their defaults (Hijri month, day) */
export const SEASON_DEFS = [
  { key: "ramadan", name: { ar: "موسم رمضان والعمرة", en: "Ramadan & Umrah season" }, from: [9, 1], to: [10, 5] },
  { key: "hajj", name: { ar: "موسم الحج", en: "Hajj season" }, from: [11, 15], to: [12, 20] },
] as const;

const md = (v: string | undefined, fallback: readonly [number, number]): [number, number] => {
  const m = /^(\d{1,2})-(\d{1,2})$/.exec(v ?? "");
  if (!m) return [fallback[0], fallback[1]];
  const month = Number(m[1]);
  const day = Number(m[2]);
  return month >= 1 && month <= 12 && day >= 1 && day <= 30 ? [month, day] : [fallback[0], fallback[1]];
};

export function seasonsFrom(st: Record<string, string>): Season[] {
  return SEASON_DEFS.map((d) => {
    const pct = Number(st[`season_${d.key}_percent`]);
    return {
      key: d.key,
      name: d.name,
      enabled: st[`season_${d.key}_enabled`] !== "0",
      percent: Number.isInteger(pct) && pct >= 0 && pct <= 300 ? pct : 0,
      from: md(st[`season_${d.key}_from`], d.from),
      to: md(st[`season_${d.key}_to`], d.to),
    };
  });
}

export const offersEnabled = (st: Record<string, string>) => st.offers_enabled !== "0";

/** Offers that are on and not over yet */
const loadOffers = (): Promise<Offer[]> =>
  cached("offers", async () => {
    const rows = await db.select().from(s.offers).where(gte(s.offers.endDate, todayInRiyadh())).orderBy(asc(s.offers.startDate));
    return rows
      .filter((o) => o.active)
      .map((o) => ({ id: o.id, name: { ar: o.nameAr, en: o.nameEn || o.nameAr }, percent: o.percent, from: o.startDate, to: o.endDate }));
  });

/** What the booking form and the booking itself use to change prices by the trip date */
export const getPriceRules = cache(async (): Promise<PriceRules> => {
  const st = await getSettings();
  return { seasons: seasonsFrom(st), offers: offersEnabled(st) ? await loadOffers() : [] };
});

