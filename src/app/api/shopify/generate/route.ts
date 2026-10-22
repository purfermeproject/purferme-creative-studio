import { z } from "zod";
import { authErrorStatus, requireRole } from "@/auth";
import { db, schema } from "@/db";
import { errorMessage, isMock, structuredCall, UserFacingError } from "@/lib/ai";
import { storeAsset } from "@/lib/asset-store";
import { scan } from "@/lib/compliance";
import { getBrand, getProducts, getTerms } from "@/lib/data";
import { loadReference } from "@/lib/images";
import { mockShopifyListing } from "@/lib/mocks";
import { buildShopifyListingPrompt } from "@/lib/prompts";
import { ShopifyListingSchema } from "@/lib/schemas";
import { getStore, packsOn } from "@/lib/shopify";
import { SHOPIFY_IMAGE } from "@/lib/shopify-parse";

export const maxDuration = 300;

const Body = z.object({ handle: z.string().min(1).max(255) });

/**
 * A Shopify set for one store product: listing text from our product facts (claim-checked), the
 * main image (our real pack, or the combo's packs, on the store's own image background) and the
 * base of the key facts image (the browser adds the words in the brand fonts). Streams each stage.
 */
export async function POST(req: Request) {
  let user: string;
  try {
    ({ user } = await requireRole("generate"));
  } catch (e) {
    return Response.json({ error: errorMessage(e) }, { status: authErrorStatus(e) });
  }
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request. Refresh the page and try again." }, { status: 400 });

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (msg: unknown) => controller.enqueue(enc.encode(`${JSON.stringify(msg)}\n`));
      const stage = (text: string) => {
        console.info(`[shopify] ${parsed.data.handle}: ${text}`);
        send({ type: "stage", text });
      };
      try {
        const store = await getStore();
        const sp = store?.products.find((p) => p.handle === parsed.data.handle);
        if (!store || !sp) throw new UserFacingError("That product isn't in the last fetch. Fetch the store again.");
        const ids = store.links[sp.handle] ?? [];
        const all = await getProducts();
        const ours = ids.map((id) => all.find((p) => p.id === id)).filter((p): p is (typeof all)[number] => Boolean(p));
        if (!ours.length) throw new UserFacingError(`Choose which of our products “${sp.title}” is first (or several for a combo).`);
        const packs = await Promise.all(ours.map((p) => loadReference(p.packImageUrl)));
        const missing = ours.filter((_, i) => !packs[i]).map((p) => p.name);
        if (missing.length) throw new UserFacingError(`No pack photo on file for ${missing.join(", ")}. Add it in Tools → Settings → Products.`);

        stage("Writing the listing from your product facts and approved claims");
        const brand = await getBrand();
        const listing = await structuredCall({
          schema: ShopifyListingSchema,
          prompt: buildShopifyListingPrompt(brand, ours, {
            title: sp.title,
            bodyText: sp.bodyHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
            productType: sp.productType,
            tags: sp.tags,
            variants: sp.variants.map((v) => `${v.title} ₹${v.price}`),
          }),
          maxTokens: 4000,
          meta: { user, kind: "shopify-listing", productId: ours[0].id },
          mock: () => mockShopifyListing(ours),
        });

        stage("Checking the listing for risky claims");
        const terms = await getTerms();
        const text = [listing.title, listing.body_html.replace(/<[^>]+>/g, " "), listing.seo_title, listing.seo_description, ...listing.facts, ...listing.image_alts].join("\n");
        const checks = ours.map((p) => scan(text, "meta", p.slug, terms));
        const hits = [...new Map(checks.flatMap((c) => c.hits).map((h) => [h.label, h])).values()];

        stage(`Making the main image: ${ours.length > 1 ? `the ${ours.length} real packs` : "your real pack"} on your store's image background (${SHOPIFY_IMAGE}×${SHOPIFY_IMAGE})`);
        const packData = packs.map((p) => p!.data);
        const main = await packsOn(packData, store.imageBackground);
        const mainAsset = await storeAsset({ data: main, mime: "image/jpeg", kind: "shopify", label: "Shopify main", user, size: { w: SHOPIFY_IMAGE, h: SHOPIFY_IMAGE } });

        stage("Making the key facts image (packs on the left, facts added in your brand fonts)");
        const base = await packsOn(packData, store.theme.background === "#ffffff" ? store.imageBackground : store.theme.background, {
          left: 0,
          top: 0,
          width: Math.round(SHOPIFY_IMAGE * 0.5),
          height: SHOPIFY_IMAGE,
        });
        const baseAsset = await storeAsset({ data: base, mime: "image/jpeg", kind: "shopify", label: "Shopify facts base", user, size: { w: SHOPIFY_IMAGE, h: SHOPIFY_IMAGE } });

        stage("Saving the Shopify set");
        const [row] = await db
          .insert(schema.shopifyListings)
          .values({ handle: sp.handle, productIds: ours.map((p) => p.id), listing, imageIds: [mainAsset.id, baseAsset.id], mock: isMock(), createdBy: user })
          .returning();
        send({
          type: "done",
          id: row.id,
          listing,
          hits,
          mock: row.mock,
          images: [
            { id: mainAsset.id, url: mainAsset.url, label: "Shopify main" },
            { id: baseAsset.id, url: baseAsset.url, label: "Shopify facts base" },
          ],
        });
      } catch (e) {
        send({ type: "error", message: errorMessage(e) });
      }
      controller.close();
    },
  });
  return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" } });
}
