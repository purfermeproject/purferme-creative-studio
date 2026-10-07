/**
 * Seeds products, brand settings, platform rules and compliance terms.
 * Safe to re-run: existing rows are left alone unless --reset is passed,
 * so edits made in Admin are never overwritten by accident.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config();

async function main() {
  const reset = process.argv.includes("--reset");
  const { db, schema } = await import("../src/db");
  const { SEED_BRAND, SEED_PRODUCTS, SEED_PLATFORM_RULES, SEED_TERMS } = await import("../src/db/seed-data");

  if (reset) {
    await db.delete(schema.complianceTerms);
    await db.delete(schema.platformRules);
    await db.delete(schema.brandSettings);
  }

  await db.insert(schema.brandSettings).values({ id: 1, ...SEED_BRAND }).onConflictDoNothing();

  for (const p of SEED_PRODUCTS) {
    if (reset) {
      await db
        .insert(schema.products)
        .values(p)
        .onConflictDoUpdate({ target: schema.products.slug, set: { ...p, updatedAt: new Date() } });
    } else {
      await db.insert(schema.products).values(p).onConflictDoNothing();
    }
  }

  for (const r of SEED_PLATFORM_RULES) {
    await db.insert(schema.platformRules).values(r).onConflictDoNothing();
  }

  const existingTerms = await db.select({ id: schema.complianceTerms.id }).from(schema.complianceTerms).limit(1);
  if (existingTerms.length === 0) {
    await db.insert(schema.complianceTerms).values(SEED_TERMS);
  }

  console.log(`Seed complete${reset ? " (reset)" : ""}.`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
