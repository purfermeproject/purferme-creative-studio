import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

type DB = PostgresJsDatabase<typeof schema>;
const globalForDb = globalThis as unknown as { studioDb?: DB };

function makeDb(): DB {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set. Locally: add it to .env.local. On Vercel: connect a Neon database under Storage.");
  }
  // Serverless (Vercel) gets a small pool; prepare:false keeps it compatible
  // with pooled connection strings (Neon/Supabase poolers).
  const client = postgres(url, { max: process.env.VERCEL ? 1 : 10, prepare: false });
  return drizzle(client, { schema });
}

/** The real database instance (created on first call). */
export function getDb(): DB {
  globalForDb.studioDb ??= makeDb();
  return globalForDb.studioDb;
}

/**
 * Created on first use, not at import, so `next build` works without a database
 * (Vercel builds before the database env var is needed).
 */
export const db: DB = new Proxy({} as DB, {
  get(_target, prop) {
    const real = getDb();
    const value = Reflect.get(real, prop);
    return typeof value === "function" ? value.bind(real) : value;
  },
});

export { schema };
