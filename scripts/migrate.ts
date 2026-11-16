/**
 * Run Drizzle migrations with a connection timeout.
 * Replaces bare `drizzle-kit migrate` in the build command so a suspended
 * or unreachable database fails fast instead of hanging the build.
 *
 *   tsx scripts/migrate.ts
 */
import "dotenv/config";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { requireDatabaseUrl } from "../src/db/url";

const TIMEOUT_MS = 30_000; // 30 seconds max

const timer = setTimeout(() => {
  console.error("❌ Migration timed out after 30s — database may be unreachable or suspended.");
  console.error("   Check Vercel Storage / Neon dashboard and Redeploy.");
  process.exit(1);
}, TIMEOUT_MS);

async function main() {
  const url = requireDatabaseUrl({ direct: true });
  const client = postgres(url, { max: 1, connect_timeout: 15 });
  const db = drizzle(client);
  console.log("Running migrations…");
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("✅ Migrations complete.");
  await client.end();
  clearTimeout(timer);
}

main().catch((err) => {
  clearTimeout(timer);
  console.error("❌ Migration failed:", err.message || err);
  process.exit(1);
});
