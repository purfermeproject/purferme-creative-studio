import "server-only";
import sharp from "sharp";

/** Colour distance in RGB. */
const dist = (a: number, b: number, c: number, x: number, y: number, z: number) => Math.sqrt((a - x) ** 2 + (b - y) ** 2 + (c - z) ** 2);

export type Cutout = { png: Buffer; removed: number };

/**
 * Removes a plain studio backdrop from a product photo (beige, white, grey…):
 * starting from the edges, it clears pixels close to the backdrop colour and
 * stops at anything clearly different (the pack, props). Only transparency is
 * added; the pack's own pixels are not changed. Returns null when the backdrop
 * isn't plain enough to separate safely.
 */
export async function removeBackdrop(input: Buffer): Promise<Cutout | null> {
  const base = sharp(input).rotate();
  const meta = await base.metadata();
  const W = meta.width ?? 0;
  const H = meta.height ?? 0;
  if (W < 64 || H < 64) return null;

  // Work out the mask on a smaller copy (fast), then scale it up to full size.
  const k = Math.min(1, 700 / Math.max(W, H));
  const w = Math.max(1, Math.round(W * k));
  const h = Math.max(1, Math.round(H * k));
  const rgb = await base.clone().resize(w, h, { fit: "fill" }).removeAlpha().raw().toBuffer();
  const px = (i: number) => [rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2]] as const;

  // Backdrop colour: the median of the border pixels.
  const border: number[] = [];
  for (let x = 0; x < w; x++) border.push(x, (h - 1) * w + x);
  for (let y = 0; y < h; y++) border.push(y * w, y * w + w - 1);
  const median = (ch: number) => {
    const v = border.map((i) => rgb[i * 3 + ch]).sort((a, b) => a - b);
    return v[Math.floor(v.length / 2)];
  };
  const [br, bg, bb] = [median(0), median(1), median(2)];
  // The border must mostly be backdrop; a busy photo can't be cut out this way.
  const plain = border.filter((i) => dist(...px(i), br, bg, bb) < 40).length / border.length;
  if (plain < 0.6) return null;

  // Flood fill from the border: a pixel is backdrop if it's near the backdrop colour
  // and changes smoothly from its neighbour (handles soft shadows and gradients).
  const isBg = new Uint8Array(w * h);
  const queue: number[] = [];
  for (const i of border) {
    if (!isBg[i] && dist(...px(i), br, bg, bb) < 45) {
      isBg[i] = 1;
      queue.push(i);
    }
  }
  while (queue.length) {
    const i = queue.pop()!;
    const x = i % w;
    const y = (i - x) / w;
    const [r, g, b] = px(i);
    for (const [nx, ny] of [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ]) {
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const n = ny * w + nx;
      if (isBg[n]) continue;
      const [nr, ng, nb] = px(n);
      if (dist(nr, ng, nb, br, bg, bb) < 95 && dist(nr, ng, nb, r, g, b) < 12) {
        isBg[n] = 1;
        queue.push(n);
      }
    }
  }
  const removed = isBg.reduce((s, v) => s + v, 0) / (w * h);
  // Too little removed (no plain backdrop) or nearly everything (the pack blends in): don't guess.
  if (removed < 0.08 || removed > 0.9) return null;

  const mask = Buffer.alloc(w * h);
  for (let i = 0; i < w * h; i++) mask[i] = isBg[i] ? 0 : 255;
  // Scale the mask to full size with a slight feather so edges aren't jagged.
  const alpha = await sharp(mask, { raw: { width: w, height: h, channels: 1 } })
    .resize(W, H, { fit: "fill", kernel: "cubic" })
    .blur(0.6)
    .extractChannel(0)
    .raw()
    .toBuffer();
  const full = await base.clone().removeAlpha().raw().toBuffer({ resolveWithObject: true });
  if (alpha.length !== W * H || full.info.channels !== 3) return null;
  // Take the original pixels as-is and add the new transparency as a fourth channel.
  const png = await sharp(full.data, { raw: { width: full.info.width, height: full.info.height, channels: 3 } })
    .joinChannel(alpha, { raw: { width: W, height: H, channels: 1 } })
    .png()
    .toBuffer();
  const trimmed = await sharp(png)
    .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 1 })
    .png()
    .toBuffer()
    .catch(() => png);
  return { png: trimmed, removed };
}
