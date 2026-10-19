import sharp from "sharp";
import { z } from "zod";
import { requireUser } from "@/auth";
import { errorMessage, structuredCall } from "@/lib/ai";
import { scan } from "@/lib/compliance";
import { getProduct, getTerms } from "@/lib/data";
import { checkSize } from "@/lib/image-specs";
import { mockDesignRead } from "@/lib/mocks";
import { DesignReadSchema } from "@/lib/schemas";
import { PLATFORMS } from "@/lib/types";

export const maxDuration = 120;

const Fields = z.object({ platform: z.enum(PLATFORMS), productId: z.string().uuid().optional() });

const PROMPT = `You are checking a finished ad design before it goes live for an Indian food brand.
1. Transcribe EVERY visible word exactly as written, in reading order, including small print, badges, stickers and text printed on packs. Keep spelling mistakes; do not correct or summarise.
2. Note whether people appear (and whether any look like children under 2, doctors, nutritionists or other experts), whether a logo and the product pack are visible, whether anything looks AI-generated (warped hands, garbled text, odd faces) and whether an "AI-generated" label is shown.
3. Add short, practical design notes: legibility on a phone, text over busy areas, clutter, before/after or transformation framing.`;

export async function POST(req: Request) {
  let user: string;
  try {
    user = await requireUser();
  } catch (e) {
    return Response.json({ error: errorMessage(e) }, { status: 401 });
  }
  const fd = await req.formData().catch(() => null);
  const file = fd?.get("file");
  if (!fd || !(file instanceof File) || file.size === 0) return Response.json({ error: "Choose an image of your design first." }, { status: 400 });
  if (file.size > 15 * 1024 * 1024) return Response.json({ error: "That file is over 15 MB. Export a smaller JPG or PNG." }, { status: 400 });
  const fields = Fields.safeParse({ platform: fd.get("platform"), productId: fd.get("productId") || undefined });
  if (!fields.success) return Response.json({ error: "Invalid request. Refresh the page and try again." }, { status: 400 });

  try {
    const input = Buffer.from(await file.arrayBuffer());
    let meta;
    try {
      meta = await sharp(input).metadata();
    } catch {
      return Response.json({ error: "That isn't an image we can read. Upload a JPG, PNG or WebP." }, { status: 400 });
    }
    const w = meta.width ?? 0;
    const h = meta.height ?? 0;
    // Send a reasonably sized copy to the model; keep the original size for the size check.
    const small = await sharp(input).rotate().resize(1600, 1600, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer();

    const product = fields.data.productId ? await getProduct(fields.data.productId) : null;
    const read = await structuredCall({
      schema: DesignReadSchema,
      prompt: PROMPT,
      image: { mediaType: "image/jpeg", base64: small.toString("base64") },
      maxTokens: 8000,
      effort: "low",
      meta: { user, kind: "check-design", platform: fields.data.platform, productId: product?.id },
      mock: mockDesignRead,
    });
    const scanResult = scan(read.text, fields.data.platform, product?.slug, await getTerms());
    const size = checkSize(fields.data.platform, w, h);

    const flags: string[] = [];
    if (read.looks_ai_generated && !read.ai_label_visible && read.people_visible) flags.push("A person looks AI-generated but no 'AI-generated' label is visible.");
    if (/child|baby|infant|toddler/i.test(read.people_note)) flags.push(`People: ${read.people_note}. Never depict children under 2; check ages.`);
    if (/doctor|nutritionist|dietitian|expert|coat/i.test(read.people_note)) flags.push(`People: ${read.people_note}. No experts or doctors (real or AI) in ads.`);
    if (fields.data.platform === "amazon" && read.people_visible && read.looks_ai_generated) flags.push("Amazon rejects AI-generated people. Use real footage.");
    if (!read.pack_visible) flags.push("The product pack isn't clearly visible.");

    return Response.json({ read, scan: scanResult, size: { w, h, ...size }, flags });
  } catch (e) {
    return Response.json({ error: errorMessage(e) }, { status: 500 });
  }
}
