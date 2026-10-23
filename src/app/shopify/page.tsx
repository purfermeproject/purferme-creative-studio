import { desc, inArray } from "drizzle-orm";
import { currentUser, roleOf } from "@/auth";
import { db, schema } from "@/db";
import { getBrand, getProducts } from "@/lib/data";
import { getStore } from "@/lib/shopify";
import { SHOPIFY_IMAGE } from "@/lib/shopify-parse";
import { ShopifyClient, type SavedSet } from "./ShopifyClient";

export const metadata = { title: "Shopify · Puŕ Fermé Creative Studio" };

export default async function ShopifyPage() {
  const [user, products, brand, store, sets] = await Promise.all([
    currentUser(),
    getProducts(),
    getBrand(),
    getStore(),
    db.select().from(schema.shopifyListings).orderBy(desc(schema.shopifyListings.createdAt)).limit(200),
  ]);
  const role = user ? await roleOf(user) : "viewer";
  // The latest set per store product, with its images.
  const latest = new Map<string, (typeof sets)[number]>();
  for (const s of sets) if (!latest.has(s.handle)) latest.set(s.handle, s);
  const ids = [...latest.values()].flatMap((s) => s.imageIds);
  const labels = ids.length ? await db.select({ id: schema.assets.id, label: schema.assets.label }).from(schema.assets).where(inArray(schema.assets.id, ids)) : [];
  const saved: Record<string, SavedSet> = {};
  for (const [handle, s] of latest) {
    saved[handle] = {
      id: s.id,
      listing: s.listing,
      mock: s.mock,
      images: s.imageIds.map((id) => ({ id, url: `/api/assets/${id}`, label: labels.find((l) => l.id === id)?.label ?? "" })),
    };
  }
  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">Your website</p>
        <h1 className="display text-4xl">Shopify</h1>
        <p className="hint mt-1 max-w-2xl">
          See every product on your live store, what to fix, and download a ready-to-upload set: a new listing and {SHOPIFY_IMAGE}×{SHOPIFY_IMAGE} images in your store&apos;s own
          colours, with your real pack.
        </p>
      </div>
      <ShopifyClient
        role={role}
        initialStore={store}
        products={products.map((p) => ({ id: p.id, name: p.name, hasPack: Boolean(p.packImageUrl) }))}
        kit={brand.kit}
        saved={saved}
      />
    </div>
  );
}
