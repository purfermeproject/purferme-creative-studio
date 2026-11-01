import { inArray } from "drizzle-orm";
import { currentUser, roleOf } from "@/auth";
import { db, schema } from "@/db";
import { getBrand, getProducts } from "@/lib/data";
import { LISTING_RULES, TEAM_PLANS, type ListingPlatform } from "@/lib/listing-plan";
import { checkPlan } from "@/lib/listing-store";
import { ListingClient, type SavedPlan } from "./ListingClient";

export const metadata = { title: "Listing images · Puŕ Fermé Creative Studio" };

export default async function ListingPage() {
  const [user, products, brand, plans] = await Promise.all([currentUser(), getProducts(), getBrand(), db.select().from(schema.listingPlans)]);
  const role = user ? await roleOf(user) : "viewer";
  const ready = products.filter((p) => p.status === "ready");
  const photoIds = ready.flatMap((p) => p.photoAssetIds);
  const labels = photoIds.length ? await db.select({ id: schema.assets.id, label: schema.assets.label }).from(schema.assets).where(inArray(schema.assets.id, photoIds)) : [];
  const saved: Record<string, SavedPlan> = {};
  for (const row of plans) {
    const product = ready.find((p) => p.id === row.productId);
    if (!product) continue;
    saved[`${row.productId}:${row.platform}`] = {
      plan: row.plan,
      images: Object.fromEntries(Object.entries(row.images).map(([slot, id]) => [slot, `/api/assets/${id}`])),
      checks: await checkPlan(row.plan, row.platform as ListingPlatform, product),
    };
  }
  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">Marketplace images</p>
        <h1 className="display text-4xl">Listing images</h1>
        <p className="hint mt-1 max-w-2xl">
          The full image stack for a product page, the way your team plans it: the main image, then a slide for each benefit with a header, one feature next to your real pack,
          and a real-life photo. Every claim is checked before anything is made.
        </p>
      </div>
      <ListingClient
        role={role}
        kit={brand.kit}
        rules={LISTING_RULES}
        products={ready.map((p) => ({
          id: p.id,
          name: p.name,
          hasPack: Boolean(p.packImageUrl),
          hasTeamPlan: Boolean(TEAM_PLANS[p.slug]),
          photos: p.photoAssetIds.map((id) => ({ id, label: labels.find((l) => l.id === id)?.label || "Product photo" })),
        }))}
        saved={saved}
      />
    </div>
  );
}
