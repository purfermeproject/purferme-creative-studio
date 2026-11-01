import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { getTerms } from "./data";
import { checkSlide, type ListingPlan, type ListingPlatform } from "./listing-plan";

export async function getPlan(productId: string, platform: ListingPlatform) {
  const [row] = await db
    .select()
    .from(schema.listingPlans)
    .where(and(eq(schema.listingPlans.productId, productId), eq(schema.listingPlans.platform, platform)));
  return row ?? null;
}

export async function savePlan(productId: string, platform: ListingPlatform, plan: ListingPlan, user: string, keepImages = true) {
  const [row] = await db
    .insert(schema.listingPlans)
    .values({ productId, platform, plan, updatedBy: user })
    .onConflictDoUpdate({
      target: [schema.listingPlans.productId, schema.listingPlans.platform],
      set: { plan, updatedBy: user, updatedAt: new Date(), ...(keepImages ? {} : { images: {} }) },
    })
    .returning();
  return row;
}

/** Records the finished image for one slot ("main", "1", "2", …). */
export async function setSlotImage(productId: string, platform: ListingPlatform, slot: string, assetId: string) {
  const [row] = await db
    .update(schema.listingPlans)
    .set({ images: sql`${schema.listingPlans.images} || ${JSON.stringify({ [slot]: assetId })}::jsonb`, updatedAt: new Date() })
    .where(and(eq(schema.listingPlans.productId, productId), eq(schema.listingPlans.platform, platform)))
    .returning();
  return row ?? null;
}

/** Checks for every slide, so the editor and the generator agree on what's blocked. */
export async function checkPlan(plan: ListingPlan, platform: ListingPlatform, product: { slug: string; redClaims: string[] }) {
  const terms = await getTerms();
  return plan.slides.map((s) => checkSlide(s, platform, product.slug, terms, product.redClaims));
}
