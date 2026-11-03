import "server-only";
import { cache } from "react";
import { asc, gte } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { getSettings } from "./catalog";
import { cached } from "./memo";
import { todayInRiyadh } from "./booking";
import type { DatedRule, PriceRules } from "./price-rules";

/** "seasons" or "offers": the two lists of dated % rules share one shape */
export type RuleKind = "seasons" | "offers";
export const ruleTable = (k: RuleKind) => (k === "seasons" ? s.seasons : s.offers);

/** the page switch that turns a whole list on or off */
export const rulesEnabled = (st: Record<string, string>, k: RuleKind) => st[`${k}_enabled`] !== "0";

/** Rules that are on and not over yet */
const load = (k: RuleKind): Promise<DatedRule[]> =>
  cached(k, async () => {
    const t = ruleTable(k);
    const rows = await db.select().from(t).where(gte(t.endDate, todayInRiyadh())).orderBy(asc(t.startDate));
    return rows.filter((o) => o.active).map((o) => ({ id: o.id, name: { ar: o.nameAr, en: o.nameEn || o.nameAr }, percent: o.percent, from: o.startDate, to: o.endDate }));
  });

/** What the booking form and the booking itself use to change prices by the trip date */
export const getPriceRules = cache(async (): Promise<PriceRules> => {
  const st = await getSettings();
  const [seasons, offers] = await Promise.all([rulesEnabled(st, "seasons") ? load("seasons") : [], rulesEnabled(st, "offers") ? load("offers") : []]);
  return { seasons, offers };
});
