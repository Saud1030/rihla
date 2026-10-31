import "server-only";
import { and, eq, inArray, or } from "drizzle-orm";
import { db, schema as s } from "@/db";
import type { Location, Vehicle } from "@/db/schema";
import type { Locale } from "@/i18n/dictionaries";
import { distancePrice, driveMinutes, roadKm } from "./pricing";

/**
 * A trip through several destinations in one booking: start -> stop 1 -> stop 2 -> ...
 * Each leg is priced like a single trip: the fixed route price when there is one for that car,
 * otherwise by distance. A car is offered only if every leg has a price for it.
 */

export const MULTI_MIN_STOPS = 2;
export const MULTI_MAX_STOPS = 5;

export type MultiQuote = {
  places: Location[];
  legs: { from: Location; to: Location; km: number | null; minutes: number | null }[];
  km: number;
  minutes: number;
  options: { vehicle: Vehicle; price: number; legPrices: number[] }[];
};

/** "a,b,c" -> ["a","b","c"], only if it's a sensible list (start + 2..5 stops, no place twice in a row) */
export function parseStops(raw: unknown): string[] | null {
  if (typeof raw !== "string") return null;
  const list = raw.split(",").map((x) => x.trim()).filter(Boolean).slice(0, MULTI_MAX_STOPS + 2);
  if (list.length < MULTI_MIN_STOPS + 1 || list.length > MULTI_MAX_STOPS + 1) return null;
  if (list.some((x) => !/^[a-z0-9-]{1,80}$/.test(x))) return null;
  if (list.some((x, i) => i > 0 && x === list[i - 1])) return null;
  return list;
}

export async function quoteMultiTrip(slugs: string[]): Promise<MultiQuote | null> {
  const unique = [...new Set(slugs)];
  const [locs, vehicles, settingRows] = await Promise.all([
    db.select().from(s.locations).where(and(inArray(s.locations.slug, unique), eq(s.locations.active, true))),
    db.select().from(s.vehicles).where(eq(s.vehicles.active, true)).orderBy(s.vehicles.sortOrder),
    db.select().from(s.settings).where(inArray(s.settings.key, ["distance_pricing", "multi_enabled"])),
  ]);
  const st = Object.fromEntries(settingRows.map((r) => [r.key, r.value]));
  if (st.multi_enabled === "0") return null;
  const distanceOn = st.distance_pricing !== "0";
  const places = slugs.map((x) => locs.find((l) => l.slug === x));
  if (places.some((p) => !p)) return null;
  const ps = places as Location[];

  // fixed routes touching these places, with their prices per car
  const ids = ps.map((p) => p.id);
  const routes = await db.query.routes.findMany({
    where: and(eq(s.routes.active, true), eq(s.routes.kind, "transfer"), or(inArray(s.routes.fromLocationId, ids), inArray(s.routes.toLocationId, ids))),
    with: { trips: true },
  });

  const legs = ps.slice(1).map((to, i) => {
    const from = ps[i];
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
    places: ps,
    legs: legs.map(({ from, to, km, minutes }) => ({ from, to, km, minutes })),
    km: legs.reduce((a, l) => a + (l.km ?? 0), 0),
    minutes: legs.reduce((a, l) => a + (l.minutes ?? 0), 0),
    options,
  };
}

export const multiTitle = (places: Pick<Location, "nameAr" | "nameEn">[], locale: Locale) =>
  places.map((p) => (locale === "ar" ? p.nameAr : p.nameEn)).join(locale === "ar" ? " ← " : " → ");
