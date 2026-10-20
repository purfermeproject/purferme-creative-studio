import { execSync } from "node:child_process";
import postgres from "postgres";
import sharp from "sharp";

/** Fresh schema + seed in the test database before every run. */
export default async function globalSetup() {
  const url = process.env.DATABASE_URL!;
  const sql = postgres(url, { max: 1 });
  await sql.unsafe("drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;");
  await sql.end();
  const env = { ...process.env, DATABASE_URL: url };
  execSync("npx drizzle-kit migrate", { stdio: "inherit", env });
  execSync("npx tsx scripts/seed.ts --reset", { stdio: "inherit", env });

  // The seed has every product ready; the tests need one blocked and one on hold.
  const db = postgres(url, { max: 1 });
  await db`update products set status = 'blocked', status_reason = 'Flipkart lists it as baby food 6–24 months; the IMS Act bans promoting foods for under-2s.' where slug = 'sunrise'`;
  await db`update products set status = 'hold', status_reason = 'Out of stock; claims not reviewed.' where slug = 'greenx'`;
  // Images only ever use real pack photos, so give Chocolate Cookies one (a cut-out).
  const box = await sharp({ create: { width: 300, height: 440, channels: 4, background: { r: 107, g: 63, b: 42, alpha: 1 } } }).png().toBuffer();
  const pack = await sharp({ create: { width: 340, height: 480, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite([{ input: box, left: 20, top: 20 }]).png().toBuffer();
  const [asset] = await db`insert into assets (mime, data_base64, kind, label, width, height) values ('image/png', ${pack.toString("base64")}, 'pack', 'Original pack', 340, 480) returning id`;
  await db`update products set pack_image_url = ${`/api/assets/${asset.id}`} where slug = 'choc'`;
  await db.end();
}
