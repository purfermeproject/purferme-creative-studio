import "server-only";
import sharp from "sharp";

/** Stacks screenshots into one tall image (one image is what the vision model reads per call). */
export async function stackImages(images: Buffer[], width = 800, gap = 16): Promise<Buffer> {
  const parts = await Promise.all(
    images.map((b) => sharp(b).rotate().resize(width, 1600, { fit: "inside", withoutEnlargement: false }).flatten({ background: "#ffffff" }).png().toBuffer({ resolveWithObject: true })),
  );
  const height = parts.reduce((h, p) => h + p.info.height, 0) + gap * (parts.length - 1);
  let top = 0;
  const layers = parts.map((p) => {
    const layer = { input: p.data, left: Math.round((width - p.info.width) / 2), top };
    top += p.info.height + gap;
    return layer;
  });
  const out = sharp({ create: { width, height, channels: 3, background: "#ffffff" } }).composite(layers);
  // Keep it a sensible size for the model.
  const buf = await out.png().toBuffer();
  return height > 6000 ? sharp(buf).resize({ height: 6000 }).jpeg({ quality: 85 }).toBuffer() : sharp(buf).jpeg({ quality: 88 }).toBuffer();
}
