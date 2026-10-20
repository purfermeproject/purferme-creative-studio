import "server-only";
import { eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { storeAsset } from "./asset-store";
import { cropToBox, type Box } from "./pack-detect";

const assetIdOf = (url: string | null) => /^\/api\/assets\/([0-9a-f-]{36})$/i.exec(url ?? "")?.[1] ?? null;

/** The photo to crop the pack from: the kept original if there is one, else the current pack photo. */
export async function packSource(productId: string) {
  const [p] = await db.select().from(schema.products).where(eq(schema.products.id, productId));
  if (!p) return null;
  const photos = p.photoAssetIds.length
    ? await db.select({ id: schema.assets.id, label: schema.assets.label }).from(schema.assets).where(inArray(schema.assets.id, p.photoAssetIds))
    : [];
  const original = photos.find((a) => a.label.startsWith("Pack photo (original"));
  return { product: p, sourceId: original?.id ?? assetIdOf(p.packImageUrl) };
}

/** Crops the pack out of a source photo and makes it the product's pack photo. The source is kept. */
export async function savePackCrop(opts: { productId: string; sourceId: string; box: Box; user: string; auto: boolean }) {
  const [p] = await db.select().from(schema.products).where(eq(schema.products.id, opts.productId));
  const [src] = await db.select().from(schema.assets).where(eq(schema.assets.id, opts.sourceId));
  if (!p || !src) throw new Error("That photo no longer exists.");
  const allowed = p.photoAssetIds.includes(src.id) || assetIdOf(p.packImageUrl) === src.id;
  if (!allowed) throw new Error("That photo isn't one of this product's photos.");
  const png = await cropToBox(Buffer.from(src.dataBase64, "base64"), opts.box);
  const cut = await storeAsset({
    data: png,
    mime: "image/png",
    kind: "pack",
    label: opts.auto ? "Original pack (cropped automatically)" : "Original pack (cropped)",
    user: opts.user,
    sourceAssetIds: [src.id],
  });
  // Keep the source among the product photos so it can be cropped again or used instead.
  const photoAssetIds = p.photoAssetIds.includes(src.id) ? p.photoAssetIds : [...p.photoAssetIds, src.id].slice(-12);
  if (!p.photoAssetIds.includes(src.id) && !src.label.startsWith("Pack photo (original")) {
    await db.update(schema.assets).set({ kind: "product-photo", label: "Pack photo (original background)" }).where(eq(schema.assets.id, src.id));
  }
  await db.update(schema.products).set({ packImageUrl: cut.url, photoAssetIds, updatedAt: new Date() }).where(eq(schema.products.id, p.id));
  return cut;
}
