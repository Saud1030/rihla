/**
 * Seeds the catalog (Saudi cities and destinations, vehicles, routes, trips),
 * default settings and the first admin account.
 * Safe to re-run: existing rows and anything edited in the admin panel are kept.
 *
 *   npm run db:seed
 */
import "dotenv/config";
import { requireDatabaseUrl } from "../src/db/url";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import bcrypt from "bcryptjs";
import { and, eq, isNull, sql } from "drizzle-orm";
import * as s from "../src/db/schema";
import { CITIES, PLACES } from "./data/saudi-places";
import { CHAT_FAQS, CHAT_SETTINGS } from "./data/chat-faqs";

const client = postgres(requireDatabaseUrl(), { max: 1 });
const db = drizzle(client, { schema: s });

const SAR = (n: number) => Math.round(n * 100);

const f = (ar: string, en: string) => ({ ar, en });
const commonFeatures = [f("مكيّف", "Air conditioned"), f("واي فاي", "Wi-Fi"), f("شاحن USB", "USB charging"), f("مياه باردة", "Cold water")];

const vehicles = [
  { slug: "toyota-camry", nameAr: "تويوتا كامري", nameEn: "Toyota Camry", category: "sedan", passengers: 4, bags: 3, mult: 1 },
  { slug: "hyundai-sonata", nameAr: "هيونداي سوناتا", nameEn: "Hyundai Sonata", category: "sedan", passengers: 4, bags: 3, mult: 1 },
  { slug: "ford-taurus", nameAr: "فورد تورس", nameEn: "Ford Taurus", category: "sedan", passengers: 4, bags: 4, mult: 1.1 },
  { slug: "hyundai-staria", nameAr: "هيونداي ستاريا", nameEn: "Hyundai Staria", category: "van", passengers: 7, bags: 8, mult: 1.3 },
  { slug: "gmc-yukon", nameAr: "جمس يوكن XL", nameEn: "GMC Yukon XL", category: "suv", passengers: 7, bags: 7, mult: 1.9 },
  { slug: "toyota-hiace", nameAr: "تويوتا هايس", nameEn: "Toyota Hiace", category: "van", passengers: 11, bags: 12, mult: 1.6 },
  { slug: "toyota-coaster", nameAr: "تويوتا كوستر", nameEn: "Toyota Coaster", category: "coaster", passengers: 22, bags: 20, mult: 2.2 },
  { slug: "bus-49", nameAr: "حافلة ٤٩ راكب", nameEn: "49-seat coach", category: "bus", passengers: 49, bags: 60, mult: 3.5 },
] as const;

// base = sedan price in SAR
const routes = [
  { slug: "jeddah-airport-makkah", from: "jeddah-airport", to: "makkah", km: 95, min: 75, base: 250 },
  { slug: "jeddah-makkah", from: "jeddah", to: "makkah", km: 80, min: 70, base: 230 },
  { slug: "jeddah-airport-madinah", from: "jeddah-airport", to: "madinah", km: 420, min: 255, base: 550 },
  { slug: "makkah-madinah", from: "makkah", to: "madinah", km: 450, min: 270, base: 550 },
  { slug: "madinah-airport-madinah", from: "madinah-airport", to: "madinah", km: 20, min: 25, base: 150 },
  { slug: "makkah-makkah-train", from: "makkah", to: "makkah-train", km: 10, min: 20, base: 120 },
  { slug: "madinah-madinah-train", from: "madinah", to: "madinah-train", km: 8, min: 15, base: 120 },
  { slug: "makkah-taif", from: "makkah", to: "taif", km: 90, min: 90, base: 300 },
  {
    slug: "makkah-ziyarat", from: "makkah", to: null, km: null, min: 180, base: 250, kind: "ziyarat",
    titleAr: "زيارة المشاعر والمعالم في مكة", titleEn: "Makkah ziyarat tour",
  },
  {
    slug: "madinah-ziyarat", from: "madinah", to: null, km: null, min: 180, base: 200, kind: "ziyarat",
    titleAr: "زيارة المعالم في المدينة المنورة", titleEn: "Madinah ziyarat tour",
  },
] as const;

const defaultSettings: Record<string, string> = {
  vat_rate: "15",
  vat_number: "",
  prices_include_vat: "0",
  distance_pricing: "1",
  hourly_enabled: "1",
  cancel_enabled: "1",
  cancel_full_hours: "24",
  cancel_partial_percent: "50",
  refund_auto: "0",
  bank_enabled: "0",
  bank_name: "",
  bank_account_name: "",
  bank_iban: "",
  hero_bg_enabled: "1",
  hero_bg_overlay: "light",
  banners_enabled: "1",
  phone: "+966500000000",
  whatsapp: "966500000000",
  email: "info@example.com",
  address_ar: "مكة المكرمة، المملكة العربية السعودية",
  address_en: "Makkah, Saudi Arabia",
  cr_number: "",
  notice_ar: "الأسعار لا تشمل موسم رمضان والحج.",
  notice_en: "Prices do not apply during Ramadan and Hajj season.",
};

const r5 = (n: number) => Math.round(n / 5) * 5;

/** Distance pricing per vehicle, scaled from a sedan: 60 SAR + 1.20 SAR/km, minimum 100 SAR */
function distanceRates(mult: number) {
  return { baseFare: SAR(60 * mult), perKm: Math.round(120 * mult), minFare: SAR(r5(100 * mult)) };
}

/** Hourly packages with a driver, scaled from a sedan: 6h 350, 12h 600, 24h 1000 SAR */
function hourlyRates(mult: number) {
  return { hourly6: SAR(r5(350 * mult)), hourly12: SAR(r5(600 * mult)), hourly24: SAR(r5(1000 * mult)) };
}

async function main() {
  // Cities
  await db
    .insert(s.cities)
    .values(CITIES.map((c, i) => ({ slug: c.slug, nameAr: c.ar, nameEn: c.en, region: c.region, lat: c.lat, lng: c.lng, sortOrder: i })))
    .onConflictDoNothing();

  // Destinations: specific places, then an "in the city" destination for every city that has none
  const placeRows = PLACES.map((p, i) => ({ slug: p.slug, nameAr: p.ar, nameEn: p.en, city: p.city, kind: p.kind, lat: p.lat, lng: p.lng, sortOrder: i }));
  const hasCityStop = new Set(PLACES.filter((p) => p.kind === "city" || p.kind === "hotels").map((p) => p.city));
  const cityStops = CITIES.filter((c) => !hasCityStop.has(c.slug)).map((c, i) => ({
    slug: PLACES.some((p) => p.slug === c.slug) ? `${c.slug}-city` : c.slug,
    nameAr: `${c.ar} (داخل المدينة)`,
    nameEn: `${c.en} (in the city)`,
    city: c.slug,
    kind: "city" as const,
    lat: c.lat,
    lng: c.lng,
    sortOrder: 1000 + i,
  }));
  await db.insert(s.locations).values([...placeRows, ...cityStops]).onConflictDoNothing();
  // Locations created before coordinates existed get them now (admin edits are kept)
  for (const p of PLACES) {
    await db.update(s.locations).set({ kind: p.kind, lat: p.lat, lng: p.lng }).where(and(eq(s.locations.slug, p.slug), isNull(s.locations.lat)));
  }
  const locRows = await db.select().from(s.locations);
  const loc = Object.fromEntries(locRows.map((l) => [l.slug, l.id]));

  // Vehicles
  await db
    .insert(s.vehicles)
    .values(
      vehicles.map((v, i) => ({
        slug: v.slug,
        nameAr: v.nameAr,
        nameEn: v.nameEn,
        category: v.category,
        passengers: v.passengers,
        bags: v.bags,
        imageUrl: `/vehicles/${v.category}.svg`,
        features: commonFeatures,
        sortOrder: i,
        ...distanceRates(v.mult),
        ...hourlyRates(v.mult),
      })),
    )
    .onConflictDoNothing();
  // Vehicles created before distance pricing existed still have the column defaults: give them their own rates
  for (const v of vehicles) {
    await db
      .update(s.vehicles)
      .set(distanceRates(v.mult))
      .where(and(eq(s.vehicles.slug, v.slug), eq(s.vehicles.baseFare, 6000), eq(s.vehicles.perKm, 120), eq(s.vehicles.minFare, 10000)));
  }
  // ...and hourly packages, the same way
  for (const v of vehicles) {
    await db
      .update(s.vehicles)
      .set(hourlyRates(v.mult))
      .where(and(eq(s.vehicles.slug, v.slug), eq(s.vehicles.hourly6, 35000), eq(s.vehicles.hourly12, 60000), eq(s.vehicles.hourly24, 100000)));
  }
  const vehRows = await db.select().from(s.vehicles);
  const veh = Object.fromEntries(vehRows.map((v) => [v.slug, v.id]));

  // Routes
  await db
    .insert(s.routes)
    .values(
      routes.map((r, i) => ({
        slug: r.slug,
        kind: ("kind" in r ? r.kind : "transfer") as "transfer" | "ziyarat",
        fromLocationId: loc[r.from],
        toLocationId: r.to ? loc[r.to] : null,
        bidirectional: !!r.to,
        distanceKm: r.km,
        durationMin: r.min,
        titleAr: "titleAr" in r ? r.titleAr : null,
        titleEn: "titleEn" in r ? r.titleEn : null,
        sortOrder: i,
      })),
    )
    .onConflictDoNothing();
  const routeRows = await db.select().from(s.routes);
  const rt = Object.fromEntries(routeRows.map((r) => [r.slug, r.id]));

  // Trips: every route x every vehicle
  const tripValues = routes.flatMap((r) =>
    vehicles.map((v) => {
      const price = Math.round((r.base * v.mult) / 10) * 10; // round to 10 SAR
      return {
        routeId: rt[r.slug],
        vehicleId: veh[v.slug],
        price: SAR(price),
        compareAtPrice: SAR(Math.round((price * 1.3) / 10) * 10),
      };
    }),
  );
  await db.insert(s.trips).values(tripValues).onConflictDoNothing();

  // Settings
  await db
    .insert(s.settings)
    .values(Object.entries(defaultSettings).map(([key, value]) => ({ key, value })))
    .onConflictDoNothing();

  // Inquiry bot: default settings, and starter questions only when there are none yet
  await db
    .insert(s.settings)
    .values(Object.entries(CHAT_SETTINGS).map(([key, value]) => ({ key, value })))
    .onConflictDoNothing();
  const [{ n: faqCount }] = await db.select({ n: sql<number>`count(*)::int` }).from(s.chatFaqs);
  if (faqCount === 0) await db.insert(s.chatFaqs).values(CHAT_FAQS.map((f, i) => ({ ...f, sortOrder: i })));

  // First admin
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (email && password) {
    await db
      .insert(s.adminUsers)
      .values({ email: email.toLowerCase(), name: "Admin", passwordHash: await bcrypt.hash(password, 12) })
      .onConflictDoNothing();
  } else {
    console.warn("ADMIN_EMAIL / ADMIN_PASSWORD not set, skipping admin user");
  }

  const [{ count }] = await client`select count(*)::int as count from trips`;
  const [{ n: cityCount }] = await db.select({ n: sql<number>`count(*)::int` }).from(s.cities);
  console.log(`Seed done: ${cityCount} cities, ${locRows.length} destinations, ${vehRows.length} vehicles, ${routeRows.length} routes, ${count} trips`);
  await client.end();
}

main().catch(async (e) => {
  console.error(e);
  await client.end();
  process.exit(1);
});
