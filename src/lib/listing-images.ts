import "server-only";
import sharp, { type OverlayOptions } from "sharp";
import { comparisonLayout } from "./ad-layout";
import { preparePack } from "./pack-composite";

/**
 * Listing images composed from real photos: our pack is only ever scaled, never redrawn. Words are
 * added in the browser afterwards, in the brand's fonts (see listing-render.ts).
 */

const svg = (w: number, h: number, body: string) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${body}</svg>`);

async function standing(pack: Buffer, maxH: number, maxW: number) {
  const { source } = await preparePack(pack);
  const m = await sharp(source).metadata();
  const k = Math.min(maxH / (m.height ?? 1), maxW / (m.width ?? 1));
  const width = Math.max(1, Math.round((m.width ?? 1) * k));
  const height = Math.max(1, Math.round((m.height ?? 1) * k));
  return { data: await sharp(source).resize(width, height, { fit: "fill", kernel: "lanczos3" }).png().toBuffer(), width, height };
}

/** A soft ground shadow under something standing at (centreX, floor). */
async function groundShadow(centreX: number, floor: number, width: number, size: number): Promise<OverlayOptions | null> {
  const sw = Math.round(width * 1.12);
  const sh = Math.max(10, Math.round(width * 0.08));
  const blur = Math.max(4, Math.round(sh * 0.5));
  const W = sw + blur * 4;
  const H = sh + blur * 4;
  const left = Math.round(centreX - W / 2);
  const top = Math.round(floor - H / 2);
  if (left < 0 || top < 0 || left + W > size || top + H > size) return null;
  const input = await sharp(svg(W, H, `<ellipse cx="${W / 2}" cy="${H / 2}" rx="${sw / 2}" ry="${sh / 2}" fill="black" fill-opacity="0.4"/>`)).blur(blur).png().toBuffer();
  return { input, left, top };
}

/**
 * Main image: the real pack on pure white, filling ~85% of the height. With a real photo of the product
 * itself (a cookie stack, a spoon of spread), it stands at the left, a little in front, as in the team's sample.
 */
export async function mainImage(pack: Buffer, size: number, productPhoto?: Buffer | null): Promise<Buffer> {
  const S = size;
  const floor = Math.round(S * 0.93);
  const p = await standing(pack, S * 0.86, productPhoto ? S * 0.62 : S * 0.9);
  const layers: OverlayOptions[] = [];
  if (productPhoto) {
    const x = await standing(productPhoto, S * 0.58, S * 0.34);
    const total = x.width * 0.85 + p.width;
    const start = Math.round((S - total) / 2);
    const packLeft = Math.round(start + x.width * 0.85);
    const pShadow = await groundShadow(packLeft + p.width / 2, floor, p.width, S);
    if (pShadow) layers.push(pShadow);
    layers.push({ input: p.data, left: packLeft, top: floor - p.height });
    const xShadow = await groundShadow(start + x.width / 2, floor, x.width, S);
    if (xShadow) layers.push(xShadow);
    layers.push({ input: x.data, left: start, top: floor - x.height });
  } else {
    const left = Math.round((S - p.width) / 2);
    const sh = await groundShadow(left + p.width / 2, floor, p.width, S);
    if (sh) layers.push(sh);
    layers.push({ input: p.data, left, top: floor - p.height });
  }
  return sharp({ create: { width: S, height: S, channels: 3, background: "#ffffff" } }).composite(layers).jpeg({ quality: 92, mozjpeg: true }).toBuffer();
}

const rounded = async (img: Buffer, w: number, h: number, r: number) =>
  sharp(img)
    .resize(w, h, { fit: "cover", position: "attention" })
    .composite([{ input: svg(w, h, `<rect width="${w}" height="${h}" rx="${r}" ry="${r}" fill="#fff"/>`), blend: "dest-in" }])
    .png()
    .toBuffer();

/** A soft drop shadow behind a rounded card at (left, top). */
async function cardShadow(left: number, top: number, w: number, h: number, r: number, size: number): Promise<OverlayOptions | null> {
  const blur = Math.round(size * 0.012);
  const W = w + blur * 4;
  const H = h + blur * 4;
  const input = await sharp(svg(W, H, `<rect x="${blur * 2}" y="${blur * 2 + blur * 0.6}" width="${w}" height="${h}" rx="${r}" fill="black" fill-opacity="0.28"/>`)).blur(blur).png().toBuffer();
  const l = left - blur * 2;
  const t = top - blur * 2;
  return l >= 0 && t >= 0 && l + W <= size && t + H <= size ? { input, left: l, top: t } : null;
}

/** Split or grid photos as rounded tiles with a white edge, in an area of the slide. */
export async function tilesOn(base: Buffer, photos: Buffer[], area: { left: number; top: number; width: number; height: number }, size: number): Promise<Buffer> {
  const n = Math.min(photos.length, 4);
  const gap = Math.round(size * 0.018);
  const cols = n === 4 ? 2 : 1;
  const rows = n === 4 ? 2 : n;
  const w = Math.round((area.width - gap * (cols - 1)) / cols);
  const h = Math.round((area.height - gap * (rows - 1)) / rows);
  const r = Math.round(size * 0.022);
  const edge = Math.round(size * 0.006);
  const layers: OverlayOptions[] = [];
  for (let i = 0; i < n; i++) {
    const left = area.left + (i % cols) * (w + gap);
    const top = area.top + Math.floor(i / cols) * (h + gap);
    const sh = await cardShadow(left, top, w, h, r, size);
    if (sh) layers.push(sh);
    layers.push({ input: svg(w, h, `<rect width="${w}" height="${h}" rx="${r}" fill="#fffdf9"/>`), left, top });
    layers.push({ input: await rounded(photos[i], w - edge * 2, h - edge * 2, r - edge), left: left + edge, top: top + edge });
  }
  return sharp(base).composite(layers).jpeg({ quality: 92, mozjpeg: true }).toBuffer();
}

/** A small round photo with a cream ring (a "small callout showing …"). */
export async function insetOn(base: Buffer, photo: Buffer, at: { left: number; top: number; d: number }): Promise<Buffer> {
  const ring = Math.max(6, Math.round(at.d * 0.04));
  const inner = at.d - ring * 2;
  const round = await rounded(photo, inner, inner, inner / 2);
  return sharp(base)
    .composite([
      { input: svg(at.d, at.d, `<circle cx="${at.d / 2}" cy="${at.d / 2}" r="${at.d / 2}" fill="#fffdf9"/>`), left: at.left, top: at.top },
      { input: round, left: at.left + ring, top: at.top + ring },
    ])
    .jpeg({ quality: 92, mozjpeg: true })
    .toBuffer();
}

/**
 * Comparison scene: our real pack on the left and a plain generic container on the right (no brand; its
 * name is written on its label by the browser), standing on the table of an AI scene with soft shadows.
 */
export async function comparisonScene(scene: Buffer, pack: Buffer, size: number): Promise<{ data: Buffer; generic: { shape: "jar" | "box"; labelY: number; width: number } }> {
  const C = comparisonLayout(size);
  const ours = await standing(pack, C.us.maxH, C.us.maxW);
  const jar = ours.width / ours.height > 0.85;
  const gw = Math.round(C.them.maxW);
  const gh = Math.round(jar ? gw * 0.95 : C.them.maxH);
  // A plain jar (lid, glass, blank label) or a plain carton, in neutral tones.
  const generic = jar
    ? svg(gw, gh, `<rect x="${gw * 0.08}" y="0" width="${gw * 0.84}" height="${gh * 0.2}" rx="${gw * 0.04}" fill="#f4f2ee"/><rect x="0" y="${gh * 0.16}" width="${gw}" height="${gh * 0.84}" rx="${gw * 0.08}" fill="#6b4a33"/><rect x="0" y="${gh * 0.4}" width="${gw}" height="${gh * 0.36}" fill="#f3efe7"/>`)
    : svg(gw, gh, `<rect width="${gw}" height="${gh}" rx="${gw * 0.03}" fill="#d9d4cc"/><rect x="${gw * 0.08}" y="${gh * 0.36}" width="${gw * 0.84}" height="${gh * 0.3}" fill="#f3efe7"/>`);
  const layers: OverlayOptions[] = [];
  for (const [cx, w, floor] of [
    [C.us.cx, ours.width, C.us.floor],
    [C.them.cx, gw, C.them.floor],
  ] as const) {
    const sh = await groundShadow(cx, floor, w, size);
    if (sh) layers.push(sh);
  }
  layers.push({ input: ours.data, left: Math.max(0, Math.round(C.us.cx - ours.width / 2)), top: C.us.floor - ours.height });
  layers.push({ input: generic, left: Math.min(size - gw, Math.round(C.them.cx - gw / 2)), top: C.them.floor - gh });
  const data = await sharp(await sharp(scene).resize(size, size, { fit: "cover" }).png().toBuffer())
    .composite(layers)
    .jpeg({ quality: 92, mozjpeg: true })
    .toBuffer();
  // Where the browser writes the generic name: the middle of the container's blank label.
  const labelY = Math.round(C.them.floor - gh + gh * (jar ? 0.58 : 0.51));
  return { data, generic: { shape: jar ? "jar" : "box", labelY, width: gw } };
}
