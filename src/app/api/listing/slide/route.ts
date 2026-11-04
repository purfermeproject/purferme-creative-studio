import { productFocus, scenePropsFor } from "@/lib/product-focus";
import { z } from "zod";
import { authErrorStatus, requireRole } from "@/auth";
import { errorMessage, UserFacingError } from "@/lib/ai";
import { storeAsset } from "@/lib/asset-store";
import { getBrand, getProduct, getTerms } from "@/lib/data";
import { scan } from "@/lib/compliance";
import { buildListingPhotoPrompt, buildListingScenePrompt } from "@/lib/image-prompt";
import { generateImage, loadAsset, loadReference } from "@/lib/images";
import { buildDesignedPrompt, designWords, specFromSlide } from "@/lib/designed-ad";
import { choosePackViews, loadPackViews, loadProductShots } from "@/lib/pack-views-server";
import { sceneLayout } from "@/lib/ad-layout";
import { comparisonScene, insetOn, mainImage, panelOn, propsCutout, tilesOn } from "@/lib/listing-images";
import { isMock } from "@/lib/ai";
import { isProductShot, isScenePhoto, type PackView } from "@/lib/pack-views";
import { compositePack } from "@/lib/pack-composite";
import sharp from "sharp";
import { mustShow, sceneSpec, slideStyle } from "@/lib/scene-spec";
import { ingredientItems, LISTING_PLATFORMS, LISTING_SIZE, PANEL_VIEW } from "@/lib/listing-plan";
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
  /** Main image: add the claim labels (0% Maida, No Refined Sugar). Amazon and Flipkart don't allow text on the main image. */
  mainClaims: z.boolean().default(false),
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
            const chosen = await loadReference(`/api/assets/${parsed.data.productPhotoId}`);
            // Only a photo of the real product itself stands beside the pack (never another pack photo).
            photo = chosen && isProductShot(chosen.label) ? chosen.data : null;
          }
          // Our real cookies (refined photo) beside the pack, unless the team picked another photo.
          if (!photo) photo = (await loadProductShots(product.photoAssetIds, 1))[0]?.data ?? null;
          let props: Buffer | null = null;
          if (!isMock() || process.env.OPENAI_API_KEY) {
            const ingredients = scenePropsFor(product).filter((x) => !/chai|coffee/i.test(x));
            if (ingredients.length) {
              stage(`Making small piles of the real ingredients on white: ${ingredients.join(", ")}`);
              // Nice to have: if this step fails, the main image is made without the piles rather than not at all.
              try {
                const made = await generateImage({
                  prompt: buildListingPhotoPrompt({
                    description: `small, neat, appetising piles of ${ingredients.join(", ")} in one low row from left to right, on a pure white seamless background, soft even studio light, seen from the front, slightly above; nothing else at all`,
                    shape: "wide",
                    style: brand.imageStyle,
                  }),
                  target: { w: 1536, h: 1024 },
                  reference: null,
                  user,
                  label: "Listing main props",
                  photoOnly: true,
                  noWriting: true,
                  onStage: stage,
                });
                const bytes = await loadAsset(made.id);
                props = bytes ? await propsCutout(Buffer.from(bytes.dataBase64, "base64")) : null;
                if (!props) stage("Couldn't cut the ingredient piles out cleanly, so the main image is made without them");
              } catch (e) {
                console.error("main image ingredient piles failed", e);
                stage(`Couldn't make the ingredient piles (${errorMessage(e)}), so the main image is made without them`);
              }
            }
          }
          stage(`Placing your real pack${photo ? " and your real cookies" : ""}${props ? " with the ingredients" : ""} on pure white (${S}×${S})`);
          const data = await mainImage(pack.data, S, photo, props).catch((e) => {
            // Never lose the main image to the extras: fall back to the pack and cookies, then the pack alone.
            console.error("main image with extras failed", e);
            stage("Something in the extras failed, so the main image is made with your pack and cookies only");
            return mainImage(pack.data, S, photo, null).catch(() => mainImage(pack.data, S, null, null));
          });
          const a = await storeAsset({ data, mime: "image/jpeg", kind: "listing", label: "Listing main", user, size: { w: S, h: S }, sourceAssetIds: [] });
          const claims = parsed.data.mainClaims ? (row?.plan.main.claims ?? []).filter(Boolean).slice(0, 3) : [];
          if (claims.length) {
            const red = scan(claims.join("\n"), platform === "shopify" ? "meta" : platform, product.slug, await getTerms()).hits.filter((h) => h.severity === "red");
            if (red.length) throw new UserFacingError(`These labels can't go on the main image: ${red.map((h) => h.matches.join(", ")).join("; ")}. Edit them in the plan.`);
            // The labels are drawn in the browser in the brand font, then attached.
            send({ type: "done", slot, image: { id: a.id, url: a.url }, final: false, claims });
            controller.close();
            return;
          }
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

        // The team's own photo is used only if it's a real scene (a desk with chai, a kitchen); a pack, side or
        // nutrition photo as a background makes a bad slide, so the AI makes the scene instead.
        let ownScene: string | null = null;
        if (slide.kind !== "comparison" && slide.photoId && product.photoAssetIds.includes(slide.photoId)) {
          const picked = await loadReference(`/api/assets/${slide.photoId}`);
          if (picked && isScenePhoto(picked.label)) ownScene = slide.photoId;
          else stage("The photo picked for this slide is a pack or panel photo, not a scene, so the AI makes the scene from the description instead");
        }
        const panelViews = PANEL_VIEW[slide.kind];
        if (panelViews) {
          // A side, the back, the nutrition table or the ingredients: the team's real photo, never redrawn.
          const packAssetId = /^\/api\/assets\/([0-9a-f-]{36})$/i.exec(product.packImageUrl ?? "")?.[1] ?? null;
          const byView = await loadPackViews(product.photoAssetIds, pack, packAssetId);
          const view = panelViews.find((v) => byView.has(v as PackView)) as PackView | undefined;
          const list = slide.kind === "ingredients" && !view ? ingredientItems(product.ingredients) : null;
          if (!view && !list?.length) {
            throw new UserFacingError(
              `Slide ${slot} needs a photo of the ${panelViews[0]} of the pack${slide.kind === "ingredients" ? " (or the product's ingredients filled in)" : ""}. Add it in Tools → Settings → Products → ${product.name} → Pack from every side, then make it again.`,
            );
          }
          const used: string[] = [];
          for (let i = 0; i < slot - 1; i++) used.push(specFromSlide(row.plan.slides[i], used).setting.key);
          const setting = specFromSlide(slide, used).setting;
          stage(`Background: ${setting.place}; ${setting.mood}`);
          const bg = await generateImage({
            prompt: buildListingPhotoPrompt({
              description: `${setting.place}, ${setting.light}, everything softly out of focus; ${scenePropsFor(product).join(", ")} on ${setting.surface} along the bottom; the middle and the right of the picture calm and plain`,
              shape: "square",
              style: brand.imageStyle,
            }),
            target: { w: S, h: S },
            reference: null,
            user,
            label: `Listing slide ${slot} background`,
            photoOnly: true,
            noWriting: true,
            onStage: stage,
          });
          const bgBytes = await loadAsset(bg.id);
          if (!bgBytes) throw new UserFacingError("An image couldn't be saved. Try again.");
          let data: Buffer;
          if (view) {
            stage(`Placing your real photo of the ${view} large and sharp (unchanged, so every word stays readable)`);
            data = await panelOn(Buffer.from(bgBytes.dataBase64, "base64"), byView.get(view)!.ref.data, S, !slide.feature.trim());
          } else {
            stage("No ingredients photo yet: listing the ingredients from the product's facts instead");
            data = await sharp(Buffer.from(bgBytes.dataBase64, "base64")).resize(S, S, { fit: "cover" }).jpeg({ quality: 92 }).toBuffer();
          }
          const a = await storeAsset({ data, mime: "image/jpeg", kind: "listing", label: `Listing slide ${slot} base`, user, size: { w: S, h: S } });
          send({ type: "done", slot, image: { id: a.id, url: a.url }, final: false, panel: brand.kit.colors.primary, generic: null, list });
          controller.close();
          return;
        }

        if (parsed.data.designed && !ownScene) {
          // Each slide in its own world: settings already used by the earlier slides are skipped.
          const used: string[] = [];
          const spare = [...product.greenClaims.filter((c) => c.split(/\s+/).length <= 4), ...productFocus(product).callouts];
          for (let i = 0; i < slot - 1; i++) used.push(specFromSlide(row.plan.slides[i], used, spare).setting.key);
          const design = specFromSlide(slide, used, spare);
          const packAssetId = /^\/api\/assets\/([0-9a-f-]{36})$/i.exec(product.packImageUrl ?? "")?.[1] ?? null;
          // Every word drawn (including any filled-in pointer) goes through the compliance terms.
          const red = scan(designWords(design).join("\n"), platform === "shopify" ? "meta" : platform, product.slug, await getTerms()).hits.filter((h) => h.severity === "red");
          if (red.length) throw new UserFacingError(`These words can't go on slide ${slot}: ${red.map((h) => `${h.matches.join(", ")} (${h.label})`).join("; ")}. Edit the slide, then try again.`);
          const byView = await loadPackViews(product.photoAssetIds, pack, packAssetId);
          const pick = await choosePackViews(`${slide.scene}. ${slide.header}`, [...byView.keys()], user, { hook: slide.header, productName: product.name });
          if (slide.kind === "hero3d") {
            // A 3D shot needs the pack's depth: the angle and a side, with the front for the print.
            const want = (["angle", "front", "left side", "right side"] as PackView[]).filter((v) => byView.has(v)).slice(0, 3);
            if (want.length) pick.views = want;
            pick.action = "shown as a premium 3D product shot at a 3/4 angle, standing tall on a round podium, our cookies and ingredients arranged around its base";
          } else if (slide.kind === "comparison") {
            pick.action = "standing upright on the left, front facing the camera";
          }
          const refs = pick.views.map((v) => byView.get(v)!.ref);
          const foodRefs = await loadProductShots(product.photoAssetIds);
          if (foodRefs.length) stage(`Using ${foodRefs.length} photo${foodRefs.length > 1 ? "s" : ""} of your real cookies, so the food looks like yours`);
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
              props: scenePropsFor(product),
              views: byView.size > 1 ? pick.views : undefined,
              packAction: pick.action,
              foodPhotos: foodRefs.length || undefined,
              look: brand.imageStyle.look,
              people: brand.imageStyle.people,
              avoid: brand.imageStyle.avoid,
              type: brand.imageStyle.type,
            }),
            target: { w: S, h: S },
            reference: refs[0],
            moreReferences: refs.slice(1),
            foodReferences: foodRefs,
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
        const props = scenePropsFor(product);
        const packOpts = { data: pack.data, position: "left" as const, scale: L.pack.scale, bottom: L.pack.bottom, liftBackdrop: !pack.label?.includes("cropped") };
        const own = ownScene;
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
