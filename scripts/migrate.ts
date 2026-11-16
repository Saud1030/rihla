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
  // Mask password in logs
  const safeUrl = url.replace(/:([^@]+)@/, ":***@");
  console.log("Connecting to:", safeUrl);

  const client = postgres(url, { max: 1, connect_timeout: 15, prepare: false });

  // Test the connection first with a simple query
  try {
    const [row] = await client`SELECT current_user, current_database(), version()`;
    console.log("Connected as:", row.current_user, "db:", row.current_database);
  } catch (connErr: any) {
    console.error("❌ Connection test failed:", connErr.code, connErr.message);
    console.error("   Full error:", JSON.stringify(connErr, Object.getOwnPropertyNames(connErr), 2));
    await client.end();
    process.exit(1);
  }

  // Check if we can create schemas
  try {
    await client`CREATE SCHEMA IF NOT EXISTS "drizzle"`;
    console.log("Schema check passed.");
  } catch (schemaErr: any) {
    console.error("❌ Schema creation failed:", schemaErr.code, schemaErr.message);
    console.error("   Severity:", schemaErr.severity);
    console.error("   Detail:", schemaErr.detail);
    console.error("   Hint:", schemaErr.hint);
    console.error("   Full error:", JSON.stringify(schemaErr, Object.getOwnPropertyNames(schemaErr), 2));
    await client.end();
    process.exit(1);
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
  console.error("❌ Migration failed:", err.message || err);
  if (err.code) console.error("   PG code:", err.code);
  if (err.severity) console.error("   Severity:", err.severity);
  if (err.detail) console.error("   Detail:", err.detail);
  if (err.cause) console.error("   Cause:", err.cause);
  console.error("   Stack:", err.stack);
  process.exit(1);
});
