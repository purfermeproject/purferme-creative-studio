import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as { pgClient?: ReturnType<typeof postgres> };

function makeClient() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.");
  }
  // Serverless (Vercel) gets a small pool; prepare:false keeps it compatible
  // with pooled connection strings (Neon/Supabase poolers).
  return postgres(url, { max: process.env.VERCEL ? 1 : 10, prepare: false });
}

const client = globalForDb.pgClient ?? makeClient();
if (process.env.NODE_ENV !== "production") globalForDb.pgClient = client;

export const db = drizzle(client, { schema });
export { schema };
