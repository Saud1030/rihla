import type postgres from "postgres";
import { driveMinutes, roadKm } from "../../src/lib/pricing";
import { MAIN_ROUTES } from "./main-places";

type Loc = { id: number; slug: string; lat: number | null; lng: number | null };
type Vehicle = { id: number; base_fare: number; per_km: number; min_fare: number };

/** price before VAT in halalas from the road distance, rounded to 10 SAR */
const price = (v: Vehicle, km: number) => Math.ceil(Math.max(v.min_fare, v.base_fare + v.per_km * km) / 1000) * 1000;

/**
 * Adds the catalog's fixed routes (either direction counts as existing) and gives every route a price
 * for every active car that has none yet. Prices already set in the panel are never changed.
 */
export async function addMainRoutes(sql: postgres.Sql) {
  const locs = await sql<Loc[]>`select id, slug, lat, lng from locations`;
  const bySlug = new Map(locs.map((l) => [l.slug, l]));
  const vehicles = await sql<Vehicle[]>`select id, base_fare, per_km, min_fare from vehicles where active`;
  let added = 0;
  let order = 50;
  for (const [fromSlug, toSlug] of MAIN_ROUTES) {
    const a = bySlug.get(fromSlug);
    const b = bySlug.get(toSlug);
    if (!a || !b) continue;
    const km = roadKm(a, b) ?? 10;
    const [existing] = await sql<{ id: number }[]>`
      select id from routes where kind = 'transfer'
        and ((from_location_id = ${a.id} and to_location_id = ${b.id}) or (from_location_id = ${b.id} and to_location_id = ${a.id}))
      limit 1`;
    if (!existing) {
      await sql`
        insert into routes (slug, kind, from_location_id, to_location_id, bidirectional, distance_km, duration_min, sort_order, active)
        values (${`${a.slug}-${b.slug}`}, 'transfer', ${a.id}, ${b.id}, true, ${km}, ${driveMinutes(km)}, ${order}, true)
        on conflict (slug) do nothing`;
      added++;
    }
    order++;
  }
  // a price for every route x car that has none (base routes included)
  const routes = await sql<{ id: number; kind: string; km: number | null; from_id: number; to_id: number | null }[]>`
    select id, kind, distance_km as km, from_location_id as from_id, to_location_id as to_id from routes`;
  let priced = 0;
  for (const r of routes) {
    const a = locs.find((l) => l.id === r.from_id);
    const b = r.to_id ? locs.find((l) => l.id === r.to_id) : undefined;
    // tours inside a city are priced like a 60 km trip
    const km = r.kind === "ziyarat" ? 60 : (r.km ?? (a && b ? roadKm(a, b) : null) ?? 20);
    for (const v of vehicles) {
      const done = await sql`
        insert into trips (route_id, vehicle_id, price, active) values (${r.id}, ${v.id}, ${price(v, km)}, true)
        on conflict (route_id, vehicle_id) do nothing returning id`;
      priced += done.length;
    }
  }
  return { added, priced };
}
