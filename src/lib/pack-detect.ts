import "server-only";
import sharp from "sharp";
import { z } from "zod";
import { isMock, structuredCall } from "./ai";

/** A rectangle as fractions (0–1) of the image's width and height. */
export type Box = { x: number; y: number; w: number; h: number };

const DetectSchema = z.object({
  found: z.boolean().describe("True if a product pack (box, pouch, jar or bottle with a printed label) is visible"),
  what: z.string().describe("What the pack is, e.g. 'cardboard box', 'stand-up pouch', 'glass jar'"),
  left: z.number().describe("Left edge of the pack, as a fraction of image width (0–1)"),
  top: z.number().describe("Top edge of the pack, as a fraction of image height (0–1)"),
  right: z.number().describe("Right edge of the pack, as a fraction of image width (0–1)"),
  bottom: z.number().describe("Bottom edge of the pack, as a fraction of image height (0–1)"),
});

/** Keeps a box inside the image and at least a sensible size; null if it can't be. */
export function cleanBox(b: Box): Box | null {
  const x = Math.min(Math.max(b.x, 0), 1);
  const y = Math.min(Math.max(b.y, 0), 1);
  const w = Math.min(Math.max(b.w, 0), 1 - x);
  const h = Math.min(Math.max(b.h, 0), 1 - y);
  if (w < 0.05 || h < 0.05) return null;
  return { x, y, w, h };
}

/**
 * Asks the vision model where the pack itself is (not the props around it).
 * Returns null in mock mode, without an AI key, or when it can't find one.
 */
export async function detectPackBox(image: Buffer, user: string): Promise<Box | null> {
  if (isMock() || (!process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY)) return null;
  const small = await sharp(image).rotate().resize(1024, 1024, { fit: "inside", withoutEnlargement: true }).flatten({ background: "#ffffff" }).jpeg({ quality: 85 }).toBuffer();
  try {
    const r = await structuredCall({
      schema: DetectSchema,
      prompt: `This is a product photo. Find the product PACK itself: the box, pouch, jar or bottle with the printed brand label. Return the tightest rectangle around just the pack.
Do not include props or food around or in front of it (cookies, grains, nuts, spoons) unless they are printed on the pack. If several packs are shown, return the front-most, largest one.
Give each edge as a fraction of the image size: left/right of the width, top/bottom of the height (0 = left/top edge, 1 = right/bottom edge).`,
      image: { mediaType: "image/jpeg", base64: small.toString("base64") },
      maxTokens: 1000,
      effort: "low",
      meta: { user, kind: "pack-detect" },
      mock: () => ({ found: false, what: "", left: 0, top: 0, right: 1, bottom: 1 }),
    });
    if (!r.found) return null;
    return cleanBox({ x: r.left, y: r.top, w: r.right - r.left, h: r.bottom - r.top });
  } catch (e) {
    console.error("pack detection failed", e);
    return null;
  }
}

/** Crops to the box. Pixels inside are copied exactly; nothing is redrawn. */
export async function cropToBox(image: Buffer, box: Box): Promise<Buffer> {
  const img = sharp(image).rotate();
  const m = await img.metadata();
  const W = m.width ?? 1;
  const H = m.height ?? 1;
  const left = Math.round(box.x * W);
  const top = Math.round(box.y * H);
  const width = Math.max(1, Math.min(W - left, Math.round(box.w * W)));
  const height = Math.max(1, Math.min(H - top, Math.round(box.h * H)));
  return img.extract({ left, top, width, height }).png().toBuffer();
}

const ExtraPacksSchema = z.object({
  packs: z
    .array(
      z.object({
        what: z.string().describe("e.g. 'kraft paper jar in a man's hand', 'snack packet on the table'"),
        left: z.number(),
        top: z.number(),
        right: z.number(),
        bottom: z.number(),
      }),
    )
    .describe("Every packaged product or labelled container visible (jar, box, pouch, packet, bottle, tub), each as fractions of the image (0–1)"),
});

/** True when two boxes are the same object: each covers most of the other. A copy partly behind ours is not the same. */
export function sameBox(a: Box, b: Box): boolean {
  return overlap(a, b) > 0.6 && overlap(b, a) > 0.6;
}

/** Share of box a covered by box b (0–1). */
function overlap(a: Box, b: Box): number {
  const w = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const h = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  return a.w * a.h > 0 ? (w * h) / (a.w * a.h) : 0;
}

/**
 * Packaging the image model invented: any labelled container that isn't our real pack
 * (which sits at `ours`, as fractions of the image). Empty in mock mode, without a key, or on error,
 * so a failed check never blocks an image.
 */
export async function findInventedPacks(image: Buffer, ours: Box | null, user: string): Promise<string[]> {
  if (isMock() || (!process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY)) return [];
  const small = await sharp(image).resize(1024, 1024, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
  try {
    const r = await structuredCall({
      schema: ExtraPacksSchema,
      prompt: `List every packaged product or labelled container in this advertising image: jars, boxes, pouches, packets, bottles, tubs or wrappers, including ones held in hands or in the background. Ignore plain cups, mugs, plates, bowls, glasses and cutlery.
Give each one's rectangle as fractions of the image size (left/right of the width, top/bottom of the height). Return an empty list if there are none.`,
      image: { mediaType: "image/jpeg", base64: small.toString("base64") },
      maxTokens: 1500,
      effort: "low",
      meta: { user, kind: "pack-check" },
      mock: () => ({ packs: [] }),
    });
    return r.packs
      .map((p) => ({ what: p.what, box: cleanBox({ x: p.left, y: p.top, w: p.right - p.left, h: p.bottom - p.top }) }))
      .filter((p) => p.box && !(ours && sameBox(p.box, ours)))
      .map((p) => p.what);
  } catch (e) {
    console.error("pack check failed", e);
    return [];
  }
}
