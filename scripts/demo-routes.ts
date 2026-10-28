/**
 * Sample fixed routes and prices for every city (for trying the site; edit or delete them from the panel):
 *  - each city's airport to the city centre
 *  - each city to the nearest of the five main cities (Riyadh, Jeddah, Makkah, Madinah, Dammam)
 *  - the main cities to each other
 * Prices per car are worked out from the road distance and each car's distance rates, rounded to 10 SAR.
 * Safe to run again: existing routes and prices are kept.
 *
 *   npx tsx scripts/demo-routes.ts
 */
import "dotenv/config";
import postgres from "postgres";
import { requireDatabaseUrl } from "../src/db/url";
import { driveMinutes, roadKm } from "../src/lib/pricing";

const sql = postgres(requireDatabaseUrl(), { max: 1, onnotice: () => {} });
const HUBS = ["riyadh", "jeddah", "makkah", "madinah", "dammam"];

type Loc = { id: number; slug: string; city: string; kind: string; lat: number | null; lng: number | null; sort_order: number };
type Vehicle = { id: number; base_fare: number; per_km: number; min_fare: number };

/** price before VAT in halalas, rounded to 10 SAR */
const price = (v: Vehicle, km: number) => Math.ceil(Math.max(v.min_fare, v.base_fare + v.per_km * km) / 1000) * 1000;

async function main() {
  const locs = await sql<Loc[]>`select id, slug, city, kind, lat, lng, sort_order from locations where active order by sort_order, id`;
  const vehicles = await sql<Vehicle[]>`select id, base_fare, per_km, min_fare from vehicles where active`;
  const byCity = new Map<string, Loc[]>();
  for (const l of locs) byCity.set(l.city, [...(byCity.get(l.city) ?? []), l]);
  // the place that stands for a city: its centre, else its hotel area, else its first destination
  const centre = (city: string) => {
    const ls = byCity.get(city) ?? [];
    return ls.find((l) => l.kind === "city") ?? ls.find((l) => l.kind === "hotels") ?? ls.find((l) => l.kind !== "airport") ?? ls[0];
  };

  const pairs: [Loc, Loc][] = [];
  for (const city of byCity.keys()) {
    const c = centre(city);
    const airport = byCity.get(city)!.find((l) => l.kind === "airport");
    if (airport && c && airport.id !== c.id) pairs.push([airport, c]);
    if (!HUBS.includes(city) && c) {
      const hubs = HUBS.map(centre).filter(Boolean) as Loc[];
      const nearest = hubs.map((h) => [h, roadKm(c, h) ?? Infinity] as const).sort((a, b) => a[1] - b[1])[0];
      if (nearest && Number.isFinite(nearest[1])) pairs.push([c, nearest[0]]);
    }
  }
  for (let i = 0; i < HUBS.length; i++)
    for (let j = i + 1; j < HUBS.length; j++) {
      const a = centre(HUBS[i]);
      const b = centre(HUBS[j]);
      if (a && b) pairs.push([a, b]);
    }

  let routesAdded = 0;
  let pricesAdded = 0;
  let order = 100;
  for (const [a, b] of pairs) {
    const km = roadKm(a, b);
    if (!km) continue;
    // skip if a route between these two places already exists (either direction)
    const [existing] = await sql<{ id: number }[]>`
      select id from routes where kind = 'transfer'
        and ((from_location_id = ${a.id} and to_location_id = ${b.id}) or (from_location_id = ${b.id} and to_location_id = ${a.id}))
      limit 1`;
    let routeId = existing?.id;
    if (!routeId) {
      const [r] = await sql<{ id: number }[]>`
        insert into routes (slug, kind, from_location_id, to_location_id, bidirectional, distance_km, duration_min, sort_order, active)
        values (${`${a.slug}-${b.slug}`}, 'transfer', ${a.id}, ${b.id}, true, ${km}, ${driveMinutes(km)}, ${order++}, true)
        on conflict (slug) do nothing returning id`;
      if (!r) continue;
      routeId = r.id;
      routesAdded++;
    }
    for (const v of vehicles) {
      const done = await sql`
        insert into trips (route_id, vehicle_id, price, active) values (${routeId}, ${v.id}, ${price(v, km)}, true)
        on conflict (route_id, vehicle_id) do nothing returning id`;
      pricesAdded += done.length;
    }
  }
  console.log(`Sample routes: ${routesAdded} new routes, ${pricesAdded} new prices (${pairs.length} city pairs)`);
  await sql.end();
}

main().catch(async (e) => {
  console.error(e);
  await sql.end();
  process.exit(1);
});
