import "server-only";
import { and, eq, inArray, or } from "drizzle-orm";
import { db, schema as s } from "@/db";
import type { Location, Vehicle } from "@/db/schema";
import type { Locale } from "@/i18n/dictionaries";
import { distancePrice, driveMinutes, roadKm } from "./pricing";

/**
 * Several trips in one booking: (from 1 -> to 1), (from 2 -> to 2), ... each on its own date and time.
 * Each trip is priced like a single one: the fixed route price when there is one for that car,
 * otherwise by distance. A car is offered only if every trip has a price for it.
 */

export const MULTI_MIN_LEGS = 2;
export const MULTI_MAX_LEGS = 20;

const SLUG = /^[a-z0-9-]{1,80}$/;

export type MultiQuote = {
  legs: { from: Location; to: Location; km: number | null; minutes: number | null }[];
  km: number;
  minutes: number;
  options: { vehicle: Vehicle; price: number; legPrices: number[] }[];
};

/** "a>b|c>d" (the booking form) -> [["a","b"],["c","d"]], only if it's a sensible list */
export function parseLegs(raw: unknown): [string, string][] | null {
  if (typeof raw !== "string") return null;
  const legs = raw.split("|").map((x) => x.split(">") as [string, string]);
  return validLegs(legs) ? legs : null;
}

/** from the page link: l1=a,b,2026-11-03,10:00&l2=c,d,2026-11-04,09:30 */
export function legsFromParams(sp: Record<string, string | string[] | undefined>) {
  const out: { from: string; to: string; date: string; time: string }[] = [];
  for (let n = 1; n <= MULTI_MAX_LEGS; n++) {
    const v = sp[`l${n}`];
    if (typeof v !== "string") break;
    const [from = "", to = "", date = "", time = ""] = v.split(",");
    out.push({ from, to, date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "", time: /^([01]\d|2[0-3]):[0-5]\d$/.test(time) ? time : "" });
  }
  return validLegs(out.map((l) => [l.from, l.to])) ? out : null;
}

function validLegs(legs: string[][]) {
  return (
    legs.length >= MULTI_MIN_LEGS &&
    legs.length <= MULTI_MAX_LEGS &&
    legs.every((l) => l.length === 2 && SLUG.test(l[0]) && SLUG.test(l[1]) && l[0] !== l[1])
  );
}

export async function quoteMultiTrip(pairs: [string, string][]): Promise<MultiQuote | null> {
  const slugs = [...new Set(pairs.flat())];
  const [locs, vehicles, settingRows] = await Promise.all([
    db.select().from(s.locations).where(and(inArray(s.locations.slug, slugs), eq(s.locations.active, true))),
    db.select().from(s.vehicles).where(eq(s.vehicles.active, true)).orderBy(s.vehicles.sortOrder),
    db.select().from(s.settings).where(inArray(s.settings.key, ["distance_pricing", "multi_enabled"])),
  ]);
  const st = Object.fromEntries(settingRows.map((r) => [r.key, r.value]));
  if (st.multi_enabled === "0") return null;
  const distanceOn = st.distance_pricing !== "0";
  const place = (slug: string) => locs.find((l) => l.slug === slug);
  if (pairs.some(([a, b]) => !place(a) || !place(b))) return null;

  // fixed routes touching these places, with their prices per car
  const ids = locs.map((p) => p.id);
  const routes = await db.query.routes.findMany({
    where: and(eq(s.routes.active, true), eq(s.routes.kind, "transfer"), or(inArray(s.routes.fromLocationId, ids), inArray(s.routes.toLocationId, ids))),
    with: { trips: true },
  });

  const legs = pairs.map(([a, b]) => {
    const from = place(a)!;
    const to = place(b)!;
    const km = roadKm(from, to);
    const route = routes.find((r) => (r.fromLocationId === from.id && r.toLocationId === to.id) || (r.bidirectional && r.fromLocationId === to.id && r.toLocationId === from.id));
    return { from, to, km: route?.distanceKm ?? km, minutes: route?.durationMin ?? (km != null ? driveMinutes(km) : null), route };
  });

  const options: MultiQuote["options"] = [];
  for (const v of vehicles) {
    const legPrices: number[] = [];
    for (const leg of legs) {
      const fixed = leg.route?.trips.find((t) => t.vehicleId === v.id && t.active);
      if (fixed) legPrices.push(fixed.price);
      else if (distanceOn && leg.km != null) legPrices.push(distancePrice(v, leg.km));
      else break;
    }
    if (legPrices.length === legs.length) options.push({ vehicle: v, price: legPrices.reduce((a, b) => a + b, 0), legPrices });
  }
  return {
    legs: legs.map(({ from, to, km, minutes }) => ({ from, to, km, minutes })),
    km: legs.reduce((a, l) => a + (l.km ?? 0), 0),
    minutes: legs.reduce((a, l) => a + (l.minutes ?? 0), 0),
    options,
  };
}

/** "Jeddah Airport ← Makkah، Makkah ← Madinah" */
export const multiTitle = (legs: { from: Pick<Location, "nameAr" | "nameEn">; to: Pick<Location, "nameAr" | "nameEn"> }[], locale: Locale) =>
  legs
    .map((l) => (locale === "ar" ? `${l.from.nameAr} ← ${l.to.nameAr}` : `${l.from.nameEn} → ${l.to.nameEn}`))
    .join(locale === "ar" ? "، " : ", ");
