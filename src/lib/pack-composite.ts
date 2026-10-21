import "server-only";
import sharp from "sharp";
import { removeBackdrop } from "./cutout";

export const PACK_POSITIONS = ["right", "center", "left"] as const;
export type PackPosition = (typeof PACK_POSITIONS)[number];
export const PACK_SCALES = ["small", "medium", "large"] as const;
export type PackScale = (typeof PACK_SCALES)[number];

const HEIGHT: Record<PackScale, number> = { small: 0.32, medium: 0.45, large: 0.62 };
const WIDTH: Record<PackScale, number> = { small: 0.34, medium: 0.48, large: 0.7 };

/** The pack photo can't be used (too small, or not a readable image). */
export class PackPhotoError extends Error {}

export type PackBox = { left: number; top: number; width: number; height: number };

/** True when the pack photo is a cut-out (has real transparency around the pack). */
export async function isCutout(pack: Buffer): Promise<boolean> {
  const img = sharp(pack);
  const meta = await img.metadata();
  if (!meta.hasAlpha) return false;
  const stats = await img.stats();
  return (stats.channels[3]?.min ?? 255) < 250;
}

/** Where the pack goes for a given canvas. Tall formats keep clear of the bottom UI (Reels/Stories captions). */
export function packBox(canvas: { w: number; h: number }, pack: { w: number; h: number }, position: PackPosition, scale: PackScale): PackBox {
  const maxH = canvas.h * HEIGHT[scale];
  const maxW = canvas.w * WIDTH[scale];
  const k = Math.min(maxH / pack.h, maxW / pack.w);
  const width = Math.max(1, Math.round(pack.w * k));
  const height = Math.max(1, Math.round(pack.h * k));
  const side = Math.round(canvas.w * 0.06);
  const bottom = Math.round(canvas.h * (canvas.h / canvas.w > 1.5 ? 0.22 : 0.07));
  const left = position === "left" ? side : position === "center" ? Math.round((canvas.w - width) / 2) : canvas.w - width - side;
  return { left, top: Math.max(0, canvas.h - height - bottom), width, height };
}

/**
 * Places the original pack photo into a generated scene. The pack is only
 * scaled (never redrawn, recoloured or cropped), so printed text, logo and
 * colours stay exactly as on the real pack. A soft shadow sits underneath.
 */
export async function compositePack(
  scene: Buffer,
  pack: Buffer,
  /** liftBackdrop: try removing a plain backdrop (off for packs cropped on purpose, whose edges are the pack). shadow: add our own soft shadow (off when the scene already has one). */
  opts: { w: number; h: number; position?: PackPosition; scale?: PackScale; format?: "jpeg" | "png"; liftBackdrop?: boolean; shadow?: boolean },
): Promise<{ data: Buffer; box: PackBox; cutout: boolean; backdropRemoved: boolean }> {
  const { w, h } = opts;
  const { source, cutout, backdropRemoved } = await preparePack(pack, opts.liftBackdrop);
  const meta = await sharp(source).metadata();
  const box = packBox({ w, h }, { w: meta.width ?? 1, h: meta.height ?? 1 }, opts.position ?? "right", opts.scale ?? "medium");
  const resized = await sharp(source).resize(box.width, box.height, { fit: "fill", kernel: "lanczos3" }).ensureAlpha().png().toBuffer();
  const shadowLayer = opts.shadow === false ? null : await dropShadow(resized, box, { w, h });
  const base = sharp(scene).resize(w, h, { fit: "cover", position: "centre" });
  const out = base.composite([...(shadowLayer ? [shadowLayer] : []), { input: resized, left: box.left, top: box.top }]);
  const data = opts.format === "png" ? await out.png().toBuffer() : await out.jpeg({ quality: 92, mozjpeg: true }).toBuffer();
  return { data, box, cutout, backdropRemoved };
}

/** Readable, big enough, lifted off a plain backdrop if needed, and trimmed to the pack. */
export async function preparePack(pack: Buffer, liftBackdrop?: boolean): Promise<{ source: Buffer; cutout: boolean; backdropRemoved: boolean }> {
  let cutout: boolean;
  let source: Buffer;
  let backdropRemoved = false;
  try {
    cutout = await isCutout(pack);
    source = await sharp(pack).rotate().png().toBuffer();
    if (!cutout && liftBackdrop !== false) {
      // A pack photo on a plain studio backdrop would look pasted on: lift it off the backdrop
      // (transparency only; the pack's pixels stay as they are).
      const lifted = await removeBackdrop(source);
      if (lifted) {
        source = lifted.png;
        cutout = true;
        backdropRemoved = true;
      }
    }
  } catch {
    throw new PackPhotoError("The product photo couldn't be read. Upload it again as a PNG or JPG in Settings → Products.");
  }
  const raw = await sharp(source).metadata();
  if ((raw.width ?? 0) < 64 || (raw.height ?? 0) < 64) {
    throw new PackPhotoError(`The product photo is too small (${raw.width ?? 0}×${raw.height ?? 0} px). Upload one at least 500 px tall in Settings → Products.`);
  }
  if (cutout) {
    // Trim only fully transparent margins of a cut-out; never crop a photo.
    source = await sharp(source)
      .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 1 })
      .png()
      .toBuffer()
      .catch(() => source);
  }
  return { source, cutout, backdropRemoved };
}

/** A soft shadow: the pack's silhouette in black, softened and nudged down. */
async function dropShadow(resized: Buffer, box: PackBox, canvas: { w: number; h: number }) {
  const { w, h } = canvas;
  const blur = Math.max(4, Math.round(Math.min(w, h) * 0.012));
  const pad = blur * 3;
  const alpha = await sharp(resized).extractChannel(3).linear(0.38, 0).raw().toBuffer();
  const shadow = await sharp({ create: { width: box.width, height: box.height, channels: 3, background: "#000000" } })
    .joinChannel(alpha, { raw: { width: box.width, height: box.height, channels: 1 } })
    .extend({ top: pad, bottom: pad, left: pad, right: pad, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .blur(blur)
    .png()
    .toBuffer();
  const drop = Math.round(h * 0.012);

  return clip(shadow, { w: box.width + pad * 2, h: box.height + pad * 2 }, box.left - pad, box.top - pad + drop, { w, h });
}

/**
 * Where a box on the final image sits on the (differently shaped) image the
 * model generates, which is later centre-cropped and scaled to the final size.
 */
export function mapBoxToGeneration(target: { w: number; h: number }, gen: { w: number; h: number }, box: PackBox): PackBox {
  const s = Math.max(target.w / gen.w, target.h / gen.h);
  const offX = (gen.w - target.w / s) / 2;
  const offY = (gen.h - target.h / s) / 2;
  return {
    left: Math.round(offX + box.left / s),
    top: Math.round(offY + box.top / s),
    width: Math.max(1, Math.round(box.width / s)),
    height: Math.max(1, Math.round(box.height / s)),
  };
}

/**
 * Inputs for painting the scene around the real pack: a canvas with the pack
 * already at its final size and place, and a mask that protects it (the model
 * may only paint where the mask is transparent).
 */
export async function paintAroundInputs(source: Buffer, target: { w: number; h: number }, gen: { w: number; h: number }, position: PackPosition, scale: PackScale) {
  const meta = await sharp(source).metadata();
  const targetBox = packBox(target, { w: meta.width ?? 1, h: meta.height ?? 1 }, position, scale);
  const g = mapBoxToGeneration(target, gen, targetBox);
  const genBox = { ...g, left: Math.min(Math.max(0, g.left), gen.w - g.width), top: Math.min(Math.max(0, g.top), gen.h - g.height) };
  const packOnGen = await sharp(source).resize(genBox.width, genBox.height, { fit: "fill", kernel: "lanczos3" }).ensureAlpha().png().toBuffer();
  const canvas = await sharp({ create: { width: gen.w, height: gen.h, channels: 4, background: { r: 214, g: 206, b: 194, alpha: 1 } } })
    .composite([{ input: packOnGen, left: genBox.left, top: genBox.top }])
    .png()
    .toBuffer();
  // Transparent = the model may paint here; the pack's own shape stays opaque (protected).
  const mask = await sharp({ create: { width: gen.w, height: gen.h, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: packOnGen, left: genBox.left, top: genBox.top }])
    .png()
    .toBuffer();
  return { canvas, mask, genBox, targetBox };
}

/** Crops an overlay to the part that falls inside the canvas (sharp can't place layers partly outside). */
async function clip(input: Buffer, size: { w: number; h: number }, left: number, top: number, canvas: { w: number; h: number }) {
  const x0 = Math.max(0, left);
  const y0 = Math.max(0, top);
  const x1 = Math.min(canvas.w, left + size.w);
  const y1 = Math.min(canvas.h, top + size.h);
  if (x1 <= x0 || y1 <= y0) return null;
  const part = await sharp(input)
    .extract({ left: x0 - left, top: y0 - top, width: x1 - x0, height: y1 - y0 })
    .png()
    .toBuffer();
  return { input: part, left: x0, top: y0 };
}
