/**
 * Test settings for trying the site: a sample bank account (example IBAN, not a real account)
 * so the bank-transfer option shows. Never run this on a live database.
 */
import "dotenv/config";
import postgres from "postgres";
import { requireDatabaseUrl } from "../src/db/url";

const sql = postgres(requireDatabaseUrl(), { max: 1 });
const values: [string, string][] = [
  ["bank_enabled", "1"],
  ["bank_name", "بنك تجريبي"],
  ["bank_account_name", "شركة رحلة للنقل (تجربة)"],
  ["bank_iban", "SA0380000000608010167519"],
];
for (const [k, v] of values) await sql`insert into settings (key, value) values (${k}, ${v}) on conflict (key) do update set value = excluded.value`;
await sql.end();
console.log("Test bank account added");
