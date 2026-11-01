/**
 * Sample "car with a driver" prices for every city and car (10, 12 and 24 hours).
 * Edit them in Admin -> Hourly prices. Safe to run again: existing prices are kept.
 *
 *   npx tsx scripts/demo-city-hourly.ts
 */
import "dotenv/config";
import postgres from "postgres";
import { requireDatabaseUrl } from "../src/db/url";
import { addCityHourlyPrices } from "./data/main-routes";

const sql = postgres(requireDatabaseUrl(), { max: 1, onnotice: () => {} });
addCityHourlyPrices(sql)
  .then(async (n) => {
    console.log(`Hourly prices by city: ${n} new prices`);
    await sql.end();
  })
  .catch(async (e) => {
    console.error(e);
    await sql.end();
    process.exit(1);
  });
