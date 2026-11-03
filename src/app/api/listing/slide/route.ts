import { z } from "zod";
import { authErrorStatus, requireRole } from "@/auth";
import { errorMessage, UserFacingError } from "@/lib/ai";
import { storeAsset } from "@/lib/asset-store";
import { getBrand, getProduct } from "@/lib/data";
import { buildListingPhotoPrompt, buildListingScenePrompt } from "@/lib/image-prompt";
import { generateImage, loadAsset, loadReference } from "@/lib/images";
import { buildDesignedPrompt, designWords, specFromSlide } from "@/lib/designed-ad";
import { choosePackViews, loadPackViews } from "@/lib/pack-views-server";
import { sceneLayout } from "@/lib/ad-layout";
import { comparisonScene, insetOn, mainImage, tilesOn } from "@/lib/listing-images";
import { compositePack } from "@/lib/pack-composite";
import sharp from "sharp";
import { mustShow, propsFromIngredients, sceneSpec, slideStyle } from "@/lib/scene-spec";
import { LISTING_PLATFORMS, LISTING_SIZE } from "@/lib/listing-plan";
import { checkPlan, getPlan, setSlotImage } from "@/lib/listing-store";

export const maxDuration = 300;


const Body = z.object({
  productId: z.string().uuid(),
  platform: z.enum(LISTING_PLATFORMS),
  /** "main", or the slide number (1-based). */
  slot: z.union([z.literal("main"), z.number().int().min(1).max(10)]),
  /** Main image only: a real photo of the product itself to stand beside the pack. */
  productPhotoId: z.string().uuid().nullable().optional(),
  /** A finished, designed slide (the AI lays out the words, callouts or table and the pack), each slide in its own setting. */
  designed: z.boolean().default(false),
});

/**
 * Makes one image of the stack. The main image is finished here (pack on white). A slide comes back
 * as its base (photo, panel and real pack, or the comparison packs); the browser adds the words in the
 * brand fonts and attaches the finished slide. Streams each stage.
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
  const { productId, platform, slot } = parsed.data;

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (msg: unknown) => controller.enqueue(enc.encode(`${JSON.stringify(msg)}\n`));
      const stage = (text: string) => {
        console.info(`[listing] ${productId} ${platform} ${slot}: ${text}`);
        send({ type: "stage", text });
      };
      try {
        const [product, row, brand] = await Promise.all([getProduct(productId), getPlan(productId, platform), getBrand()]);
        if (!product) throw new UserFacingError("That product no longer exists.");
        const pack = await loadReference(product.packImageUrl);
        if (!pack) throw new UserFacingError(`No pack photo for ${product.name} yet. Add it in Tools → Settings → Products.`);
        const S = LISTING_SIZE[platform];

        if (slot === "main") {
          let photo: Buffer | null = null;
          if (parsed.data.productPhotoId) {
            if (!product.photoAssetIds.includes(parsed.data.productPhotoId)) throw new UserFacingError("That photo isn't one of this product's photos.");
            photo = (await loadReference(`/api/assets/${parsed.data.productPhotoId}`))?.data ?? null;
          }
          stage(`Placing your real pack${photo ? " and the product photo" : ""} on pure white, filling about 85% (${S}×${S})`);
          const data = await mainImage(pack.data, S, photo);
          const a = await storeAsset({ data, mime: "image/jpeg", kind: "listing", label: "Listing main", user, size: { w: S, h: S }, sourceAssetIds: [] });
          await setSlotImage(productId, platform, "main", a.id);
          send({ type: "done", slot, image: { id: a.id, url: a.url }, final: true });
          controller.close();
          return;
        }

        if (!row) throw new UserFacingError("Make or load a plan first.");
        const slide = row.plan.slides[slot - 1];
        if (!slide) throw new UserFacingError("That slide isn't in the plan.");
        const checks = (await checkPlan(row.plan, platform, product))[slot - 1];
        const blocked = checks.checks.filter((c) => c.level === "block");
        if (blocked.length) throw new UserFacingError(`Slide ${slot} can't be made yet: ${blocked.map((c) => c.text).join("; ")}. Edit the words, then try again.`);

        if (parsed.data.designed && !(slide.kind !== "comparison" && slide.photoId)) {
          // Each slide in its own world: settings already used by the earlier slides are skipped.
          const used: string[] = [];
          for (let i = 0; i < slot - 1; i++) used.push(specFromSlide(row.plan.slides[i], used).setting.key);
          const design = specFromSlide(slide, used);
          const packAssetId = /^\/api\/assets\/([0-9a-f-]{36})$/i.exec(product.packImageUrl ?? "")?.[1] ?? null;
          const byView = await loadPackViews(product.photoAssetIds, pack, packAssetId);
          const pick = await choosePackViews(`${slide.scene}. ${slide.header}`, [...byView.keys()], user, { hook: slide.header, productName: product.name });
          const refs = pick.views.map((v) => byView.get(v)!.ref);
          stage(`Setting and feeling: ${design.setting.place}; ${design.setting.mood}`);
          stage(`Designing slide ${slot}: “${design.headline}”${design.callouts.length ? `, callouts: ${design.callouts.map((c) => c.label).join(", ")}` : ""}${design.table ? `, a comparison table` : ""}`);
          if (byView.size > 1) stage(`Using your pack photos: ${pick.views.join(" + ")}`);
          const made = await generateImage({
            prompt: buildDesignedPrompt(design, {
              productName: product.name,
              brandName: "Puŕ Fermé",
              primary: brand.kit.colors.primary,
              accent: brand.kit.colors.accent,
              w: S,
              h: S,
              forWhat: `a ${platform === "amazon" ? "Amazon" : platform === "flipkart" ? "Flipkart" : "marketplace"} listing image`,
              props: propsFromIngredients(product.ingredients),
              views: byView.size > 1 ? pick.views : undefined,
              packAction: pick.action,
              look: brand.imageStyle.look,
              people: brand.imageStyle.people,
              avoid: brand.imageStyle.avoid,
            }),
            target: { w: S, h: S },
            reference: refs[0],
            moreReferences: refs.slice(1),
            designedWords: designWords(design),
            // The team's description: every part of it must be in the picture.
            mustShow: mustShow(slide.scene),
            user,
            label: `Listing slide ${slot} · designed`,
            onStage: stage,
          });
          if (made.warning) send({ type: "stage", text: made.warning });
          await setSlotImage(productId, platform, String(slot), made.id);
          send({ type: "done", slot, image: { id: made.id, url: made.url }, final: true });
          controller.close();
          return;
        }

        let base: Buffer;
        let generic: { shape: "jar" | "box"; labelY: number; width: number } | null = null;
        const spec = sceneSpec(slide.scene);
        const layout = slideStyle(slide);
        const L = sceneLayout(S, layout);
        const props = propsFromIngredients(product.ingredients);
        const packOpts = { data: pack.data, position: "left" as const, scale: L.pack.scale, bottom: L.pack.bottom, liftBackdrop: !pack.label?.includes("cropped") };
        const own = slide.kind !== "comparison" && slide.photoId ? slide.photoId : null;
        if (own && !product.photoAssetIds.includes(own)) throw new UserFacingError("The photo chosen for this slide isn't one of this product's photos any more. Pick another.");
        const photo = async (prompt: string, target: { w: number; h: number }, label: string, extra: Partial<Parameters<typeof generateImage>[0]> = {}) => {
          const made = await generateImage({ prompt, target, reference: null, user, label, noWriting: true, onStage: stage, ...extra });
          if (made.warning) send({ type: "stage", text: made.warning });
          const bytes = await loadAsset(made.id);
          if (!bytes) throw new UserFacingError("An image couldn't be saved. Try again.");
          return Buffer.from(bytes.dataBase64, "base64");
        };

        if (slide.kind === "comparison") {
          stage("Making the scene: a warm kitchen table with the ingredients as props");
          const scene = await photo(
            buildListingScenePrompt({
              description: "a warm kitchen table seen from the front, the middle of the table clear and softly lit, ingredients as small props in the bottom corners",
              props,
              style: brand.imageStyle,
              layout: "card",
              inScene: false,
              productName: product.name,
            }),
            { w: S, h: S },
            `Listing slide ${slot} scene`,
            { photoOnly: true },
          );
          stage("Placing your real pack next to a plain, unbranded container (no competitor shown)");
          const c = await comparisonScene(scene, pack.data, S);
          base = c.data;
          generic = c.generic;
        } else if (own) {
          stage("Using your own photo (no AI) and placing your real pack in it");
          const p = await loadReference(`/api/assets/${own}`);
          if (!p) throw new UserFacingError("That photo couldn't be loaded. Upload it again in Settings → Products.");
          base = (await compositePack(await sharp(p.data).resize(S, S, { fit: "cover", position: "attention" }).png().toBuffer(), pack.data, { w: S, h: S, position: "left", scale: L.pack.scale, bottom: L.pack.bottom })).data;
        } else if (spec.layout === "single") {
          stage(`Making the scene around your real pack: ${spec.photos[0]}`);
          const args = { description: spec.photos[0], props, style: brand.imageStyle, layout, productName: product.name };
          base = await photo(buildListingScenePrompt({ ...args, inScene: true }), { w: S, h: S }, `Listing slide ${slot}`, {
            fallbackPrompt: buildListingScenePrompt({ ...args, inScene: false }),
            lockedPack: packOpts,
            mustShow: mustShow(spec.photos[0]),
          });
        } else {
          // A split or grid: a calm scene with the pack, and each described photo as a tile beside it.
          stage("Making the scene around your real pack");
          const args = { description: "a warm kitchen table, softly blurred background", props, style: brand.imageStyle, layout: "bar" as const, productName: product.name };
          const scene = await photo(buildListingScenePrompt({ ...args, inScene: true }), { w: S, h: S }, `Listing slide ${slot} scene`, {
            fallbackPrompt: buildListingScenePrompt({ ...args, inScene: false }),
            lockedPack: packOpts,
          });
          const tiles: Buffer[] = [];
          // Each photo is made in its tile's shape (tall tiles in a 2×2 grid, wide ones stacked for a split or three).
          const n = Math.min(spec.photos.length, 4);
          const tileRatio = n === 4 ? L.tiles.width / 2 / (L.tiles.height / 2) : L.tiles.width / (L.tiles.height / n);
          const shape: "wide" | "tall" | "square" = tileRatio > 1.15 ? "wide" : tileRatio < 0.87 ? "tall" : "square";
          const gen = shape === "wide" ? { w: 1536, h: 1024 } : shape === "tall" ? { w: 1024, h: 1536 } : { w: 1024, h: 1024 };
          for (let i = 0; i < spec.photos.length && i < 4; i++) {
            stage(`Photo ${i + 1} of ${spec.photos.length}: ${spec.photos[i]}`);
            tiles.push(
              await photo(buildListingPhotoPrompt({ description: spec.photos[i], shape, style: brand.imageStyle }), gen, `Listing slide ${slot} photo ${i + 1}`, {
                photoOnly: true,
                mustShow: mustShow(spec.photos[i]),
              }),
            );
          }
          base = await tilesOn(scene, tiles, L.tiles, S);
        }
        if (spec.inset && slide.kind !== "comparison") {
          stage(`Making the small callout photo: ${spec.inset}`);
          const d = Math.round(S * 0.2);
          const inset = await photo(buildListingPhotoPrompt({ description: `a close-up of ${spec.inset}, filling the frame`, shape: "square", style: brand.imageStyle, small: true }), { w: d, h: d }, `Listing slide ${slot} inset`, {
            photoOnly: true,
          });
          base = await insetOn(base, inset, { left: Math.round(S * 0.4), top: Math.round(S * 0.27), d });
        }
        const a = await storeAsset({ data: base, mime: "image/jpeg", kind: "listing", label: `Listing slide ${slot} base`, user, size: { w: S, h: S } });
        send({ type: "done", slot, image: { id: a.id, url: a.url }, final: false, panel: brand.kit.colors.primary, generic });
      } catch (e) {
        send({ type: "error", message: errorMessage(e) });
      }
      controller.close();
    },
  });
  return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" } });
}
