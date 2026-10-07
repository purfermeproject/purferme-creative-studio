import { execSync } from "node:child_process";
import postgres from "postgres";

/** Fresh schema + seed in the test database before every run. */
export default async function globalSetup() {
  const url = process.env.DATABASE_URL!;
  const sql = postgres(url, { max: 1 });
  await sql.unsafe("drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;");
  await sql.end();
  const env = { ...process.env, DATABASE_URL: url };
  execSync("npx drizzle-kit migrate", { stdio: "inherit", env });
  execSync("npx tsx scripts/seed.ts --reset", { stdio: "inherit", env });
}
