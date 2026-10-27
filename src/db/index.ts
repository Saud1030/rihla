import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { requireDatabaseUrl } from "./url";

const url = requireDatabaseUrl();

// Reuse one pool across hot reloads in development
const g = globalThis as unknown as { __pg?: ReturnType<typeof postgres> };
const client = g.__pg ?? postgres(url, {
    // serverless hosts (Vercel) run many small instances: keep each one's pool small
    max: process.env.VERCEL ? 2 : 10,
    prepare: false,
    // drop idle connections so a restarted database (codespace resume, failover) doesn't leave dead ones in the pool
    idle_timeout: 30,
    max_lifetime: 60 * 30,
    connect_timeout: 10,
  });
if (process.env.NODE_ENV !== "production") g.__pg = client;

export const db = drizzle(client, { schema });
export { schema };
