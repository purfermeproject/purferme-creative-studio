import { scenePropsFor } from "@/lib/product-focus";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { authErrorStatus, requireRole } from "@/auth";
import { db, schema } from "@/db";
import { errorMessage } from "@/lib/ai";
import { getBrand, getProduct, getTerms } from "@/lib/data";
import { buildImagePrompt, buildImagePromptParts, buildListingScenePrompt } from "@/lib/image-prompt";
import { defaultSpecFor, findSpec, generationSizeFor, MAX_SIDE, MIN_SIDE, ratioLabel } from "@/lib/image-specs";
import { generateImage, loadReference, type Reference } from "@/lib/images";
import { ConceptSchema } from "@/lib/schemas";
import { adLayout, PACK_POSITIONS, PACK_SCALES } from "@/lib/pack-composite";
import { adScene } from "@/lib/ad-layout";
import { mustShow, sceneSpec } from "@/lib/scene-spec";
import { PLATFORM_LABELS, PLATFORMS } from "@/lib/types";
import { inArray } from "drizzle-orm";
import { buildDesignedPrompt, designWords, type DesignSpec } from "@/lib/designed-ad";
import { planDesign } from "@/lib/designed-ad-server";
import { scan } from "@/lib/compliance";
import { viewOf, VIEW_NAMES, type PackView } from "@/lib/pack-views";
import { choosePackViews, loadProductShots } from "@/lib/pack-views-server";

export const maxDuration = 300;

const Body = z.object({
  platform: z.enum(PLATFORMS),
  productId: z.string().uuid(),
  creativeType: z.string().min(1),
  concept: ConceptSchema,
  frameIndex: z.number().int().min(0).max(10).default(0),
  creativeId: z.string().uuid().nullable().optional(),
  specId: z.string().max(40).nullable().optional(),
  /** designed = the AI lays out the whole ad (headline, sub-line, callouts, the pack) like a finished brand post; every word is read back. */
  textMode: z.enum(["overlay", "ai", "designed"]).default("overlay"),
  /**
   * ai = the AI draws our pack into the scene from the pack photo, adapting angle, light and hands (default; checked against the real pack);
   * scene = one scene painted around our real pack, pasted in unchanged at the lower right;
   * layout = a photo plus our real pack standing on a brand panel; locked = the real pack placed inside the scene
   * at a chosen spot; none = a scene without the product.
   */
  packMode: z.enum(["ai", "scene", "layout", "locked", "none"]).default("ai"),
  packPosition: z.enum(PACK_POSITIONS).default("right"),
  packScale: z.enum(PACK_SCALES).default("medium"),
  /** Which real product photo to place: the pack photo (default) or one of the product's extra photos. */
  photoId: z.string().uuid().nullable().optional(),
  /** The team's edited direction (what the picture shows and how it's shot). The rules are always added. */
  direction: z.string().trim().max(4000).optional(),
  /** Stream each stage as it happens (NDJSON), ending with the result. */
  stream: z.boolean().default(false),
  /** Return the prompt that would be sent, without making an image (free). */
  preview: z.boolean().default(false),
  custom: z
    .object({ w: z.number().int().min(MIN_SIDE).max(MAX_SIDE), h: z.number().int().min(MIN_SIDE).max(MAX_SIDE) })
    .nullable()
    .optional(),
  packImage: z
    .object({ mediaType: z.enum(["image/png", "image/jpeg", "image/webp", "image/gif"]), base64: z.string().max(7_000_000) })
    .nullable()
    .optional(),
});

export async function POST(req: Request) {
  let user: string;
  try {
    ({ user } = await requireRole("generate"));
  } catch (e) {
    return Response.json({ error: errorMessage(e) }, { status: authErrorStatus(e) });
  }
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request. Refresh the page and try again." }, { status: 400 });
  const input = parsed.data;

  try {
    const product = await getProduct(input.productId);
    if (!product) return Response.json({ error: "That product no longer exists." }, { status: 404 });
    if (product.status !== "ready") {
      return Response.json({ error: `${product.name} is on ${product.status}: ${product.statusReason || "no reason given"}` }, { status: 409 });
    }
    const reference: Reference =
      input.packMode === "none" && input.textMode !== "designed"
        ? null
        : input.photoId && product.photoAssetIds.includes(input.photoId)
          ? await loadReference(`/api/assets/${input.photoId}`)
          : input.packImage
            ? { data: Buffer.from(input.packImage.base64, "base64"), mime: input.packImage.mediaType, name: "pack" }
            : await loadReference(product.packImageUrl);
    // Without a pack photo there is nothing to lock; fall back to describing the pack.
    // Only real product photos are used: no photo on file means no pack image, never an AI-drawn one.
    if ((input.packMode !== "none" || input.textMode === "designed") && !reference) {
      return Response.json(
        { error: `There's no pack photo for ${product.name} yet, so the AI would have to invent one. Add your real pack photo in Tools → Settings → Products (it's placed into images unchanged), or choose “No pack in this image”.`, code: "no-pack-photo" },
        { status: 400 },
      );
    }
    // A designed ad always has the real pack in it, drawn by the AI from the pack photos.
    const designed = input.textMode === "designed";
    const packMode = designed ? ("ai" as const) : input.packMode;
    const packAssetId =
      input.photoId && product.photoAssetIds.includes(input.photoId)
        ? input.photoId
        : !input.packImage
          ? (/^\/api\/assets\/([0-9a-f-]{36})$/i.exec(product.packImageUrl ?? "")?.[1] ?? null)
          : null;
    const brand0 = await getBrand();
    const spec = input.custom
      ? { w: input.custom.w, h: input.custom.h, label: `custom ${ratioLabel(input.custom.w, input.custom.h)}`, note: undefined as string | undefined }
      : (input.specId ? findSpec(input.specId) : null) ?? defaultSpecFor(input.platform, input.creativeType);
    const promptInput = {
      concept: input.concept,
      frameIndex: input.frameIndex,
      platform: input.platform,
      creativeType: input.creativeType,
      productName: product.name,
      packMode: packMode === "layout" || packMode === "scene" || packMode === "ai" ? ("none" as const) : packMode,
      layout: packMode === "layout" ? adLayout(spec).kind : undefined,
      packPosition: input.packPosition,
      target: { w: spec.w, h: spec.h, label: spec.label, note: spec.note },
      textMode: input.textMode === "designed" ? ("ai" as const) : input.textMode,
      style: brand0.imageStyle,
      direction: input.direction,
    };
    // Scene: one photographed scene painted around the real pack (lower right), from the ad's own scene,
    // with the product's ingredients as props: the approach that works for listing images.
    const frame = input.concept.frames[Math.min(input.frameIndex, Math.max(0, input.concept.frames.length - 1))];
    const sceneDesc = input.direction?.trim() || sceneSpec(frame?.visual || input.concept.ai_prompt).photos.join("; ");
    const A = adScene(spec.w, spec.h);
    const sceneArgs = {
      description: sceneDesc,
      props: scenePropsFor(product),
      style: brand0.imageStyle,
      layout: "ad" as const,
      productName: product.name,
      forAd: `${PLATFORM_LABELS[input.platform]}, ${spec.label}`,
    };
    const extraPhoto = Boolean(input.photoId && product.photoAssetIds.includes(input.photoId));
    // Photos of the pack from every side: the sides that suit this scene are sent, best first.
    let packRefs: { view: PackView; ref: NonNullable<Reference>; assetId: string | null }[] = [];
    let viewWhy = "";
    let packAction = "";
    if (packMode === "ai" && reference && !extraPhoto && !input.preview) {
      const rows = !product.photoAssetIds.length ? [] : await db
        .select({ id: schema.assets.id, label: schema.assets.label, mime: schema.assets.mime, data: schema.assets.dataBase64 })
        .from(schema.assets)
        .where(inArray(schema.assets.id, product.photoAssetIds));
      const byView = new Map<PackView, { ref: NonNullable<Reference>; assetId: string | null }>();
      for (const r of rows) {
        const v = viewOf(r.label);
        if (v && !byView.has(v)) byView.set(v, { ref: { data: Buffer.from(r.data, "base64"), mime: r.mime, name: v.replace(/\W+/g, "-"), label: r.label }, assetId: r.id });
      }
      // The pack photo in Settings (or the one uploaded with the brief) is always the front.
      byView.set("front", { ref: reference, assetId: packAssetId });
      // How the person uses the pack in this moment (so it is part of the story), and the sides that suit it.
      const pick = await choosePackViews(sceneDesc, [...byView.keys()], user, { hook: input.concept.hook, productName: product.name });
      packAction = pick.action;
      if (byView.size > 1) {
        packRefs = pick.views.map((v) => ({ view: v, ...byView.get(v)! }));
        viewWhy = pick.why;
      }
    }
    // The model makes 2:3, 3:2 or square; the platform size is cut from that. Say how much each edge loses.
    const [gw, gh] = generationSizeFor(spec.w, spec.h).split("x").map(Number);
    const trim = spec.w / spec.h < gw / gh ? { sides: (1 - spec.w / spec.h / (gw / gh)) / 2, topBottom: 0 } : { sides: 0, topBottom: (1 - gw / gh / (spec.w / spec.h)) / 2 };
    // Our real cookies (refined photos) so the food looks like ours, not a generic cookie.
    const foodRefs = packMode === "ai" && !extraPhoto && !input.preview ? await loadProductShots(product.photoAssetIds) : [];
    const aiArgs = {
      ...sceneArgs,
      foodPhotos: foodRefs.length || undefined,
      inScene: true,
      aiPack: true,
      photoShows: extraPhoto ? reference?.label || "a photo of the product" : undefined,
      views: packRefs.length ? packRefs.map((p) => p.view) : undefined,
      packAction: packAction || undefined,
      trim,
    };
    if (input.preview && designed) {
      return Response.json({
        direction: sceneDesc,
        rules: "When the image is made, the hook and the product's approved claims are turned into a headline, a sub-line and 2–4 callouts (or a comparison table); every word is checked against your compliance terms first, drawn by the AI in your brand colours with your real pack as the hero, then read back and made again if any word is wrong, missing or added.",
      });
    }
    if (input.preview && (packMode === "scene" || packMode === "ai")) {
      const full = buildListingScenePrompt(packMode === "ai" ? aiArgs : { ...sceneArgs, inScene: true });
      return Response.json({ direction: sceneDesc, rules: full.split("\n").filter((l) => !l.startsWith("SHOW EXACTLY THIS")).join("\n") });
    }
    if (input.preview) {
      const parts = buildImagePromptParts({ ...promptInput, packInScene: packMode === "locked" });
      return Response.json({ direction: parts.direction, rules: parts.rules });
    }
    let design: DesignSpec | null = null;
    if (designed) {
      design = await planDesign(
        { hook: input.concept.hook, angle: input.concept.angle, headline: input.concept.copy.headline, body: input.concept.copy.body, scene: sceneDesc },
        product,
        user,
        input.frameIndex,
      );
      design.cta = input.concept.copy.cta || "Shop now";
      // Every word the AI will draw goes through the compliance terms first.
      const terms = await getTerms();
      const red = scan(designWords(design).join("\n"), input.platform, product.slug, terms).hits.filter((h) => h.severity === "red");
      if (red.length) {
        return Response.json({ error: `These words can't go on the image: ${red.map((h) => `${h.matches.join(", ")} (${h.label})`).join("; ")}. Edit the ad's words, then try again.` }, { status: 400 });
      }
    }
    const prompt = design
      ? buildDesignedPrompt(design, {
          productName: product.name,
          brandName: "Puŕ Fermé",
          primary: brand0.kit.colors.primary,
          accent: brand0.kit.colors.accent,
          w: spec.w,
          h: spec.h,
          forWhat: `${PLATFORM_LABELS[input.platform]}, ${spec.label}`,
          props: scenePropsFor(product),
          views: packRefs.length ? packRefs.map((p) => p.view) : undefined,
          packAction: packAction || undefined,
          trim,
          foodPhotos: foodRefs.length || undefined,
          look: brand0.imageStyle.look,
          people: brand0.imageStyle.people,
          avoid: brand0.imageStyle.avoid,
          type: brand0.imageStyle.type,
        })
      : packMode === "ai" ? buildListingScenePrompt(aiArgs) : packMode === "scene" ? buildListingScenePrompt({ ...sceneArgs, inScene: true }) : buildImagePrompt({ ...promptInput, packInScene: packMode === "locked" });
    const fallbackPrompt = packMode === "scene" ? buildListingScenePrompt({ ...sceneArgs, inScene: false }) : buildImagePrompt(promptInput);
    const tag = designed ? " · designed" : packMode === "layout" ? " · brand panel" : packMode === "scene" || packMode === "ai" ? " · scene ad" : "";
    const withPack = packMode !== "none";
    const packTag = packMode === "ai" ? " · pack from your photo" : withPack ? " · original pack" : "";
    const label = `${spec.label}${input.concept.frames.length > 1 ? ` · scene ${input.frameIndex + 1}` : ""}${packTag}${tag}`;
    const run = async (onStage?: (text: string) => void) => {
      if (packAction) onStage?.(`How the pack is used: ${packAction}`);
      if (foodRefs.length) onStage?.(`Using ${foodRefs.length} photo${foodRefs.length > 1 ? "s" : ""} of your real product, so the food looks like yours`);
      if (packRefs.length) onStage?.(`Using your pack photos: ${packRefs.map((p) => VIEW_NAMES[p.view].replace(/ \(.*\)$/, "").toLowerCase()).join(" + ")}${viewWhy ? ` (${viewWhy})` : ""}`);
      if (design) onStage?.(`Setting and feeling: ${design.setting.place}; ${design.setting.mood}`);
      if (design) onStage?.(`Designing it: “${design.headline}”${design.sub ? ` / “${design.sub}”` : ""}${design.callouts.length ? `, callouts: ${design.callouts.map((c) => c.label).join(", ")}` : ""}${design.table ? `, a comparison table (${design.table.rows.length} rows)` : ""}; words checked against your compliance terms`);
      onStage?.(
        packMode === "scene" || packMode === "ai"
          ? `Writing the scene brief from the ad: ${sceneDesc}`
          : packMode === "layout"
            ? "Writing the photo brief from the ad (scene, style, where the panel goes)"
            : "Writing the image brief from the ad",
      );
      const image = await generateImage({
        onStage,
        noWriting: input.textMode === "overlay",
        designedWords: design ? designWords(design) : undefined,
        prompt,
        target: { w: spec.w, h: spec.h },
        reference: packMode === "ai" ? (packRefs[0]?.ref ?? reference) : null,
        moreReferences: packRefs.slice(1).map((p) => p.ref),
        foodReferences: foodRefs,
        // Compared with the real pack only when the pack itself was sent (an extra photo, e.g. loose cookies, isn't a pack).
        adaptPack: packMode === "ai" && reference && !extraPhoto ? { assetId: packAssetId } : null,
        fallbackPrompt: packMode === "ai" ? undefined : fallbackPrompt,
        user,
        label,
        frameIndex: input.frameIndex,
        lockedPack:
          packMode === "locked" && reference
            ? { data: reference.data, position: input.packPosition, scale: input.packScale, assetId: packAssetId, liftBackdrop: !reference.label?.includes("cropped") }
            : packMode === "scene" && reference
              ? { data: reference.data, position: A.pack.position, scale: A.pack.scale, bottom: A.pack.bottom, assetId: packAssetId, liftBackdrop: !reference.label?.includes("cropped") }
              : null,
        mustShow: packMode === "scene" || packMode === "ai" ? mustShow(sceneDesc) : undefined,
        layoutPack:
          packMode === "layout" && reference
            ? { data: reference.data, position: input.packPosition, panel: brand0.kit.colors.primary, accent: brand0.kit.colors.accent, assetId: packAssetId, liftBackdrop: !reference.label?.includes("cropped") }
            : null,
      });
      if (input.creativeId) {
        await db
          .update(schema.creatives)
          .set({ imageIds: sql`array_append(${schema.creatives.imageIds}, ${image.id}::uuid)`, updatedAt: new Date() })
          .where(eq(schema.creatives.id, input.creativeId));
      }
      return { ...image, label: `${spec.label}${packTag}${tag}`, usedPackPhoto: Boolean(reference), packMode };
    };
    if (!input.stream) return Response.json(await run());
    // Streamed: one line per stage, then the result, so the page can show what is happening right now.
    const enc = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (msg: unknown) => controller.enqueue(enc.encode(`${JSON.stringify(msg)}\n`));
        try {
          send({ type: "done", ...(await run((text) => send({ type: "stage", text }))) });
        } catch (e) {
          send({ type: "error", message: errorMessage(e) });
        }
        controller.close();
      },
    });
    return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" } });
  } catch (e) {
    return Response.json({ error: errorMessage(e) }, { status: 500 });
  }
}
