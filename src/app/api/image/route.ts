import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { requireUser } from "@/auth";
import { db, schema } from "@/db";
import { errorMessage } from "@/lib/ai";
import { getProduct } from "@/lib/data";
import { buildImagePrompt, imageSizeFor } from "@/lib/image-prompt";
import { generateImage, loadReference, type Reference } from "@/lib/images";
import { ConceptSchema } from "@/lib/schemas";
import { PLATFORMS } from "@/lib/types";

export const maxDuration = 300;

const Body = z.object({
  platform: z.enum(PLATFORMS),
  productId: z.string().uuid(),
  creativeType: z.string().min(1),
  concept: ConceptSchema,
  frameIndex: z.number().int().min(0).max(10).default(0),
  creativeId: z.string().uuid().nullable().optional(),
  packImage: z
    .object({ mediaType: z.enum(["image/png", "image/jpeg", "image/webp", "image/gif"]), base64: z.string().max(7_000_000) })
    .nullable()
    .optional(),
});

export async function POST(req: Request) {
  let user: string;
  try {
    user = await requireUser();
  } catch (e) {
    return Response.json({ error: errorMessage(e) }, { status: 401 });
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
    const reference: Reference = input.packImage
      ? { data: Buffer.from(input.packImage.base64, "base64"), mime: input.packImage.mediaType, name: "pack" }
      : await loadReference(product.packImageUrl);
    const size = imageSizeFor(input.platform, input.creativeType);
    const prompt = buildImagePrompt({
      concept: input.concept,
      frameIndex: input.frameIndex,
      platform: input.platform,
      creativeType: input.creativeType,
      productName: product.name,
      hasPackReference: Boolean(reference),
    });
    const image = await generateImage({ prompt, size, reference, user, label: input.concept.frames[input.frameIndex]?.onscreen || input.concept.title });
    if (input.creativeId) {
      await db
        .update(schema.creatives)
        .set({ imageIds: sql`array_append(${schema.creatives.imageIds}, ${image.id}::uuid)`, updatedAt: new Date() })
        .where(eq(schema.creatives.id, input.creativeId));
    }
    return Response.json({ ...image, usedPackPhoto: Boolean(reference) });
  } catch (e) {
    return Response.json({ error: errorMessage(e) }, { status: 500 });
  }
}
