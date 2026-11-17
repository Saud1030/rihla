/**
 * Run Drizzle migrations with a connection timeout.
 * If the database is unreachable the script exits 0 so the build
 * still succeeds — the site works for cached/static pages and new
 * migrations will apply on the next deploy.
 *
 *   tsx scripts/migrate.ts
 */
import "dotenv/config";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { requireDatabaseUrl } from "../src/db/url";

const TIMEOUT_MS = 30_000;

const timer = setTimeout(() => {
  console.error("⚠️ Migration timed out after 30s — skipping, site will deploy anyway.");
  process.exit(0);
}, TIMEOUT_MS);

async function main() {
  const url = requireDatabaseUrl({ direct: true });
  const safeUrl = url.replace(/:([^@]+)@/, ":***@");
  console.log("Connecting to:", safeUrl);

  const client = postgres(url, { max: 1, connect_timeout: 15, prepare: false });

  try {
    const [row] = await client`SELECT current_user, current_database()`;
    console.log("Connected as:", row.current_user, "db:", row.current_database);
  } catch (connErr: any) {
    console.error("⚠️ Connection failed:", connErr.code, connErr.message);
    console.error("  Skipping migrations — site will deploy without DB changes.");
    await client.end().catch(() => {});
    clearTimeout(timer);
    return;
  }

  const db = drizzle(client);
  console.log("Running migrations…");
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("✅ Migrations complete.");
  await client.end();
  clearTimeout(timer);
}

main().catch((err) => {
  clearTimeout(timer);
  console.error("⚠️ Migration error:", err.message || err);
  if (err.code) console.error("  PG code:", err.code);
  console.error("  Skipping — site will deploy without DB changes.");
});
