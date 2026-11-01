import { z } from "zod";
import { authErrorStatus, requireRole } from "@/auth";
import { errorMessage, UserFacingError } from "@/lib/ai";
import { storeAsset } from "@/lib/asset-store";
import { getBrand, getProduct } from "@/lib/data";
import { buildImagePrompt } from "@/lib/image-prompt";
import { generateImage, loadAsset, loadReference } from "@/lib/images";
import { comparisonBase, mainImage, slideBase } from "@/lib/listing-images";
import { LISTING_PLATFORMS, LISTING_SIZE, SLIDE_KIND_LABELS } from "@/lib/listing-plan";
import { checkPlan, getPlan, setSlotImage } from "@/lib/listing-store";

export const maxDuration = 300;

/** The header band colour (cream, like the packs) and the page behind a comparison. */
const BAND = "#f7f3ec";
const PAPER = "#fffdf9";

const Body = z.object({
  productId: z.string().uuid(),
  platform: z.enum(LISTING_PLATFORMS),
  /** "main", or the slide number (1-based). */
  slot: z.union([z.literal("main"), z.number().int().min(1).max(10)]),
  /** Main image only: a real photo of the product itself to stand beside the pack. */
  productPhotoId: z.string().uuid().nullable().optional(),
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

        let base: Buffer;
        const own = slide.kind !== "comparison" && slide.photoId ? slide.photoId : null;
        if (own && !product.photoAssetIds.includes(own)) throw new UserFacingError("The photo chosen for this slide isn't one of this product's photos any more. Pick another.");
        if (own) {
          stage("Using your own photo (no AI)");
          const photo = await loadReference(`/api/assets/${own}`);
          if (!photo) throw new UserFacingError("That photo couldn't be loaded. Upload it again in Settings → Products.");
          stage("Placing your real pack on the brand panel (unchanged, only scaled)");
          base = await slideBase(photo.data, pack.data, { size: S, band: BAND, panel: brand.kit.colors.primary });
        } else if (slide.kind === "comparison") {
          stage("Placing your real pack next to a plain, unbranded box (no competitor shown)");
          base = await comparisonBase(pack.data, { size: S, band: BAND, background: PAPER });
        } else {
          stage(`Writing the photo brief: ${SLIDE_KIND_LABELS[slide.kind].toLowerCase()}`);
          const concept = {
            title: slide.header,
            persona: "",
            angle: "",
            format: "Listing slide",
            language: "English",
            hook: slide.header,
            frames: [
              {
                slot: `Slide ${slot}`,
                visual: `${slide.scene}. Keep the top sixth of the frame simple (a header goes there); the main action sits in the middle.`,
                onscreen: "",
              },
            ],
            copy: {},
            ai_prompt: slide.scene,
            needs_real_person: false,
            ai_label_needed: false,
            claims: [],
            why_it_fits: "",
          };
          const prompt = buildImagePrompt({
            concept,
            frameIndex: 0,
            platform: platform === "flipkart" ? "flipkart" : "amazon",
            creativeType: "Listing image",
            productName: product.name,
            packMode: "none",
            layout: "bottom",
            target: { w: S, h: S, label: "Listing slide" },
            textMode: "overlay",
            style: brand.imageStyle,
          });
          const photo = await generateImage({ prompt, target: { w: S, h: S }, reference: null, user, label: `Listing slide ${slot} photo`, photoOnly: true, noWriting: true, onStage: stage });
          const bytes = await loadAsset(photo.id);
          if (!bytes) throw new UserFacingError("The photo couldn't be saved. Try again.");
          stage("Placing your real pack on the brand panel (unchanged, only scaled)");
          base = await slideBase(Buffer.from(bytes.dataBase64, "base64"), pack.data, { size: S, band: BAND, panel: brand.kit.colors.primary });
          if (photo.warning) send({ type: "stage", text: photo.warning });
        }
        const a = await storeAsset({ data: base, mime: "image/jpeg", kind: "listing", label: `Listing slide ${slot} base`, user, size: { w: S, h: S } });
        send({ type: "done", slot, image: { id: a.id, url: a.url }, final: false, band: BAND, panel: brand.kit.colors.primary });
      } catch (e) {
        send({ type: "error", message: errorMessage(e) });
      }
      controller.close();
    },
  });
  return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" } });
}
