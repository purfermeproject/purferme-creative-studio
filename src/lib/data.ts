import "server-only";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Platform } from "./types";
import type { Term } from "./compliance";
import { withDefaults } from "./verdicts";

export async function getProducts() {
  return db.select().from(schema.products).orderBy(asc(schema.products.name));
}

export async function getProduct(id: string) {
  const [p] = await db.select().from(schema.products).where(eq(schema.products.id, id));
  return p ?? null;
}

export async function getBrand() {
  const [b] = await db.select().from(schema.brandSettings).where(eq(schema.brandSettings.id, 1));
  if (!b) throw new Error("Brand settings are missing. Run `npm run db:seed`.");
  return { ...b, verdictThresholds: withDefaults(b.verdictThresholds) };
}

export async function getPlatformRule(platform: Platform) {
  const [r] = await db.select().from(schema.platformRules).where(eq(schema.platformRules.platform, platform));
  if (!r) throw new Error(`Platform rules for ${platform} are missing. Run \`npm run db:seed\`.`);
  return r;
}

export async function getAllPlatformRules() {
  return db.select().from(schema.platformRules);
}

export async function getTerms(): Promise<(Term & { id: string })[]> {
  const rows = await db.select().from(schema.complianceTerms).orderBy(asc(schema.complianceTerms.severity), asc(schema.complianceTerms.label));
  return rows;
}
