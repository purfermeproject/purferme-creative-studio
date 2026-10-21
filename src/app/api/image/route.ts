import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { authErrorStatus, requireRole } from "@/auth";
import { db, schema } from "@/db";
import { errorMessage } from "@/lib/ai";
import { getProduct } from "@/lib/data";
import { buildImagePrompt } from "@/lib/image-prompt";
import { defaultSpecFor, findSpec, MAX_SIDE, MIN_SIDE, ratioLabel } from "@/lib/image-specs";
import { generateImage, loadReference, type Reference } from "@/lib/images";
import { ConceptSchema } from "@/lib/schemas";
import { PACK_POSITIONS, PACK_SCALES } from "@/lib/pack-composite";
import { PLATFORMS } from "@/lib/types";

export const maxDuration = 300;

const Body = z.object({
  platform: z.enum(PLATFORMS),
  productId: z.string().uuid(),
  creativeType: z.string().min(1),
  concept: ConceptSchema,
  frameIndex: z.number().int().min(0).max(10).default(0),
  creativeId: z.string().uuid().nullable().optional(),
  specId: z.string().max(40).nullable().optional(),
  textMode: z.enum(["overlay", "ai"]).default("overlay"),
  /** locked = composite the real pack photo (default); none = a scene without the product. The AI never draws a pack. */
  packMode: z.enum(["locked", "none"]).default("locked"),
  packPosition: z.enum(PACK_POSITIONS).default("right"),
  packScale: z.enum(PACK_SCALES).default("medium"),
  /** Which real product photo to place: the pack photo (default) or one of the product's extra photos. */
  photoId: z.string().uuid().nullable().optional(),
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
      input.packMode === "none"
        ? null
        : input.photoId && product.photoAssetIds.includes(input.photoId)
          ? await loadReference(`/api/assets/${input.photoId}`)
          : input.packImage
            ? { data: Buffer.from(input.packImage.base64, "base64"), mime: input.packImage.mediaType, name: "pack" }
            : await loadReference(product.packImageUrl);
    // Without a pack photo there is nothing to lock; fall back to describing the pack.
    // Only real product photos are used: no photo on file means no pack image, never an AI-drawn one.
    if (input.packMode === "locked" && !reference) {
      return Response.json(
        { error: `There's no pack photo for ${product.name} yet, so the AI would have to invent one. Add your real pack photo in Tools → Settings → Products (it's placed into images unchanged), or choose “No pack in this image”.`, code: "no-pack-photo" },
        { status: 400 },
      );
    }
    const packMode = input.packMode;
    const packAssetId =
      input.photoId && product.photoAssetIds.includes(input.photoId)
        ? input.photoId
        : !input.packImage
          ? (/^\/api\/assets\/([0-9a-f-]{36})$/i.exec(product.packImageUrl ?? "")?.[1] ?? null)
          : null;
    const spec = input.custom
      ? { w: input.custom.w, h: input.custom.h, label: `custom ${ratioLabel(input.custom.w, input.custom.h)}`, note: undefined as string | undefined }
      : (input.specId ? findSpec(input.specId) : null) ?? defaultSpecFor(input.platform, input.creativeType);
    const promptInput = {
      concept: input.concept,
      frameIndex: input.frameIndex,
      platform: input.platform,
      creativeType: input.creativeType,
      productName: product.name,
      packMode,
      packPosition: input.packPosition,
      target: { w: spec.w, h: spec.h, label: spec.label, note: spec.note },
      textMode: input.textMode,
    };
    const prompt = buildImagePrompt({ ...promptInput, packInScene: packMode === "locked" });
    const fallbackPrompt = buildImagePrompt(promptInput);
    const label = `${spec.label}${input.concept.frames.length > 1 ? ` · scene ${input.frameIndex + 1}` : ""}${packMode === "locked" ? " · original pack" : ""}`;
    const image = await generateImage({
      prompt,
      target: { w: spec.w, h: spec.h },
      reference: null,
      fallbackPrompt,
      user,
      label,
      frameIndex: input.frameIndex,
      lockedPack:
        packMode === "locked" && reference
          ? { data: reference.data, position: input.packPosition, scale: input.packScale, assetId: packAssetId, liftBackdrop: !reference.label?.includes("cropped") }
          : null,
    });
    if (input.creativeId) {
      await db
        .update(schema.creatives)
        .set({ imageIds: sql`array_append(${schema.creatives.imageIds}, ${image.id}::uuid)`, updatedAt: new Date() })
        .where(eq(schema.creatives.id, input.creativeId));
    }
    return Response.json({ ...image, label: packMode === "locked" ? `${spec.label} · original pack` : spec.label, usedPackPhoto: Boolean(reference), packMode });
  } catch (e) {
    return Response.json({ error: errorMessage(e) }, { status: 500 });
  }
}
