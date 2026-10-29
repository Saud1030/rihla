import "server-only";
import { cache } from "react";
import { asc, eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import type { Locale } from "@/i18n/dictionaries";
import { cached, invalidateAll } from "./memo";
import { distancePrice, driveMinutes, parseVatConfig, roadKm } from "./pricing";
import { REGIONS, regionName } from "./regions";

/** Call after any admin change to catalog, destinations, settings or brand. */
export const invalidateCatalogCache = invalidateAll;

export type VehicleCategory = (typeof s.vehicleCategory.enumValues)[number];

export type CatalogLocation = typeof s.locations.$inferSelect;
export type CatalogVehicle = typeof s.vehicles.$inferSelect;
export type CatalogCity = typeof s.cities.$inferSelect;

export type CatalogTrip = {
  id: number;
  price: number;
  compareAtPrice: number | null;
  vehicle: CatalogVehicle;
};

export type CatalogRoute = typeof s.routes.$inferSelect & {
  from: CatalogLocation;
  to: CatalogLocation | null;
  trips: CatalogTrip[];
};

/** Fixed-price routes that are active and bookable. Deduplicated per request with React cache(). */
export const getCatalog = cache((): Promise<CatalogRoute[]> => cached("catalog", loadCatalog));

async function loadCatalog(): Promise<CatalogRoute[]> {
  const rows = await db.query.routes.findMany({
    where: eq(s.routes.active, true),
    orderBy: [asc(s.routes.sortOrder), asc(s.routes.id)],
    with: {
      from: true,
      to: true,
      trips: {
        where: eq(s.trips.active, true),
        with: { vehicle: true },
      },
    },
  });

  return rows
    .filter((r) => r.from.active && (!r.to || r.to.active))
    .map((r) => ({
      ...r,
      trips: r.trips
        .filter((t) => t.vehicle.active)
        .sort((a, b) => a.vehicle.sortOrder - b.vehicle.sortOrder || a.price - b.price)
        .map((t) => ({ id: t.id, price: t.price, compareAtPrice: t.compareAtPrice, vehicle: t.vehicle })),
    }))
    .filter((r) => r.trips.length > 0);
}

/** Active destinations, ordered */
export const getLocations = cache(() =>
  cached("locations", () =>
    db.select().from(s.locations).where(eq(s.locations.active, true)).orderBy(asc(s.locations.sortOrder), asc(s.locations.id)),
  ),
);

export const getCities = cache(() =>
  cached("cities", () => db.select().from(s.cities).where(eq(s.cities.active, true)).orderBy(asc(s.cities.sortOrder), asc(s.cities.id))),
);

export const getVehicles = cache(() =>
  cached("vehicles", () => db.select().from(s.vehicles).where(eq(s.vehicles.active, true)).orderBy(asc(s.vehicles.sortOrder))),
);

export const getSettings = cache(
  (): Promise<Record<string, string>> =>
    cached("settings", async () => {
      const rows = await db.select().from(s.settings);
      return Object.fromEntries(rows.map((r) => [r.key, r.value]));
    }),
);

export async function getVatConfig() {
  return parseVatConfig(await getSettings());
}

/** Bank transfer details, or null when the admin hasn't enabled them */
export async function getBankConfig() {
  const st = await getSettings();
  if (st.bank_enabled !== "1" || !st.bank_iban || !st.bank_name || !st.bank_account_name) return null;
  return { bankName: st.bank_name, accountName: st.bank_account_name, iban: st.bank_iban };
}

export async function isDistancePricingOn() {
  return (await getSettings()).distance_pricing !== "0";
}

/* ---------------- Destination picker ---------------- */

export type PickerOption = {
  slug: string;
  name: string;
  citySlug: string;
  city: string;
  regionSlug: string;
  region: string;
  kind: CatalogLocation["kind"];
  /** extra words that should match a search (English name, city, region) */
  keywords: string;
};

/** Every bookable destination, in region -> city order, for the search picker. */
export async function getPickerOptions(lang: Locale): Promise<PickerOption[]> {
  const [locations, cities] = await Promise.all([getLocations(), getCities()]);
  const cityBySlug = new Map(cities.map((c) => [c.slug, c]));
  const regionOrder = new Map<string, number>(REGIONS.map((r, i) => [r.slug, i]));
  const cityOrder = new Map(cities.map((c, i) => [c.slug, i]));
  // a small catalog is listed as plain cities in the panel's order, without grouping by region
  const byRegion = cities.length > 12;
  const kindOrder: Record<string, number> = { hotels: 0, city: 1, airport: 2, station: 3, religious: 4, landmark: 5, other: 6 };

  return locations
    .filter((l) => cityBySlug.has(l.city))
    .sort((a, b) => {
      const ca = cityBySlug.get(a.city)!;
      const cb = cityBySlug.get(b.city)!;
      return (
        (byRegion ? (regionOrder.get(ca.region) ?? 99) - (regionOrder.get(cb.region) ?? 99) : 0) ||
        (cityOrder.get(a.city) ?? 0) - (cityOrder.get(b.city) ?? 0) ||
        kindOrder[a.kind] - kindOrder[b.kind] ||
        a.sortOrder - b.sortOrder
      );
    })
    .map((l) => {
      const c = cityBySlug.get(l.city)!;
      return {
        slug: l.slug,
        name: lang === "ar" ? l.nameAr : l.nameEn,
        citySlug: c.slug,
        city: lang === "ar" ? c.nameAr : c.nameEn,
        regionSlug: c.region,
        region: regionName(c.region, lang),
        kind: l.kind,
        keywords: [l.nameAr, l.nameEn, c.nameAr, c.nameEn, regionName(c.region, "ar"), regionName(c.region, "en")].join(" "),
      };
    });
}

/* ---------------- Fixed routes ---------------- */

export async function getRouteBySlug(slug: string) {
  const all = await getCatalog();
  return all.find((r) => r.slug === slug) ?? null;
}

/** Find the fixed route connecting two locations, in either direction. */
export function findRoute(routes: CatalogRoute[], fromSlug: string, toSlug?: string) {
  for (const r of routes) {
    if (!toSlug) continue;
    if (r.from.slug === fromSlug && r.to?.slug === toSlug) return { route: r, reversed: false };
    if (r.bidirectional && r.to?.slug === fromSlug && r.from.slug === toSlug) return { route: r, reversed: true };
  }
  return null;
}

/** Human title of a route in a direction, e.g. "Jeddah Airport → Makkah hotels" */
export function routeTitle(
  r: Pick<CatalogRoute, "titleAr" | "titleEn" | "from" | "to">,
  locale: Locale,
  reversed = false,
) {
  const custom = locale === "ar" ? r.titleAr : r.titleEn;
  if (custom) return custom;
  const a = reversed ? r.to : r.from;
  const b = reversed ? r.from : r.to;
  return pairTitle(a, b, locale);
}

export function pairTitle(a: CatalogLocation | null, b: CatalogLocation | null, locale: Locale) {
  const name = (l: CatalogLocation | null) => (l ? (locale === "ar" ? l.nameAr : l.nameEn) : "");
  if (!b) return name(a);
  return `${name(a)} ${locale === "ar" ? "←" : "→"} ${name(b)}`;
}

export function routeEnds(r: Pick<CatalogRoute, "from" | "to">, locale: Locale, reversed = false) {
  const name = (l: CatalogLocation | null) => (l ? (locale === "ar" ? l.nameAr : l.nameEn) : null);
  return reversed ? { a: name(r.to), b: name(r.from) } : { a: name(r.from), b: name(r.to) };
}

/* ---------------- Distance-priced trips (any two destinations) ---------------- */

export type DistanceQuote = {
  from: CatalogLocation;
  to: CatalogLocation;
  km: number;
  minutes: number;
  options: { vehicle: CatalogVehicle; price: number }[];
};

/** Prices every active vehicle between two destinations, or null if that isn't possible. */
export async function quoteDistanceTrip(fromSlug: string, toSlug: string): Promise<DistanceQuote | null> {
  if (!fromSlug || !toSlug || fromSlug === toSlug) return null;
  if (!(await isDistancePricingOn())) return null;
  const [locations, vehicles] = await Promise.all([getLocations(), getVehicles()]);
  const from = locations.find((l) => l.slug === fromSlug);
  const to = locations.find((l) => l.slug === toSlug);
  if (!from || !to) return null;
  const km = roadKm(from, to);
  if (km == null) return null;
  return {
    from,
    to,
    km,
    minutes: driveMinutes(km),
    options: vehicles.map((v) => ({ vehicle: v, price: distancePrice(v, km) })),
  };
}

/* ---------------- Home banners ---------------- */

/** Visible banners (active, within their dates), without the image bytes */
export async function getHomeBanners() {
  // the whole offers section can be switched off in Admin -> Banners
  if ((await getSettings()).banners_enabled === "0") return [];
  const all = await cached("banners", () =>
    db
      .select({
        id: s.banners.id,
        titleAr: s.banners.titleAr,
        titleEn: s.banners.titleEn,
        textAr: s.banners.textAr,
        textEn: s.banners.textEn,
        link: s.banners.link,
        startsOn: s.banners.startsOn,
        endsOn: s.banners.endsOn,
        updatedAt: s.banners.updatedAt,
      })
      .from(s.banners)
      .where(eq(s.banners.active, true))
      .orderBy(asc(s.banners.sortOrder), asc(s.banners.id)),
  );
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(new Date());
  return all.filter((b) => (!b.startsOn || b.startsOn <= today) && (!b.endsOn || b.endsOn >= today));
}
