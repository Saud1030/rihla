/**
 * Switches an existing database to the company's catalog (scripts/data/main-places.ts):
 * the seven cities and their destinations, fixed routes and sample prices.
 * Every other city and destination is deleted, with the routes and prices that use them.
 * Bookings are kept (they keep their saved trip title).
 *
 *   npx tsx scripts/apply-catalog.ts
 */
import "dotenv/config";
import postgres from "postgres";
import { requireDatabaseUrl } from "../src/db/url";
import { MAIN_CITIES, MAIN_PLACES } from "./data/main-places";
import { addMainRoutes } from "./data/main-routes";

const sql = postgres(requireDatabaseUrl(), { max: 1, onnotice: () => {} });

async function main() {
  const citySlugs = MAIN_CITIES.map((c) => c.slug);
  const placeSlugs = MAIN_PLACES.map((p) => p.slug);
  await sql.begin(async (tx) => {
    for (const [i, c] of MAIN_CITIES.entries())
      await tx`insert into cities (slug, name_ar, name_en, region, lat, lng, sort_order, active)
               values (${c.slug}, ${c.ar}, ${c.en}, ${c.region}, ${c.lat}, ${c.lng}, ${i}, true)
               on conflict (slug) do update set name_ar = excluded.name_ar, name_en = excluded.name_en, region = excluded.region,
                 lat = excluded.lat, lng = excluded.lng, sort_order = excluded.sort_order, active = true`;
    for (const [i, p] of MAIN_PLACES.entries())
      await tx`insert into locations (slug, name_ar, name_en, city, kind, lat, lng, sort_order, active)
               values (${p.slug}, ${p.ar}, ${p.en}, ${p.city}, ${p.kind}, ${p.lat}, ${p.lng}, ${i}, true)
               on conflict (slug) do update set name_ar = excluded.name_ar, name_en = excluded.name_en, city = excluded.city,
                 kind = excluded.kind, lat = excluded.lat, lng = excluded.lng, sort_order = excluded.sort_order, active = true`;
    // routes touching a place that goes away (their prices go with them), then the places and cities
    const gone = await tx`delete from routes where from_location_id in (select id from locations where slug <> all(${placeSlugs}))
                            or to_location_id in (select id from locations where slug <> all(${placeSlugs})) returning id`;
    const places = await tx`delete from locations where slug <> all(${placeSlugs}) returning id`;
    const cities = await tx`delete from cities where slug <> all(${citySlugs}) returning id`;
    console.log(`Removed ${cities.length} cities, ${places.length} destinations, ${gone.length} routes`);
  });
  const r = await addMainRoutes(sql);
  console.log(`Catalog: ${MAIN_CITIES.length} cities, ${MAIN_PLACES.length} destinations, ${r.added} new routes, ${r.priced} new prices`);
  await sql.end();
}

main().catch(async (e) => {
  console.error(e);
  await sql.end();
  process.exit(1);
});
