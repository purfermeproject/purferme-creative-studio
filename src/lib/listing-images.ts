import "server-only";
import sharp, { type OverlayOptions } from "sharp";
import { slideLayout } from "./ad-layout";
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

/** Lifestyle or close-up slide: band, photo fading into the brand panel, our pack standing on the panel. */
export async function slideBase(scene: Buffer, pack: Buffer, opts: { size: number; band: string; panel: string }): Promise<Buffer> {
  const S = opts.size;
  const L = slideLayout(S);
  const photo = await sharp(scene).resize(L.photo.width, L.photo.height, { fit: "cover", position: "centre" }).png().toBuffer();
  const fade = (r: { width: number; height: number }, colour: string, down: boolean) =>
    svg(
      r.width,
      r.height,
      `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${colour}" stop-opacity="${down ? 0 : 1}"/><stop offset="1" stop-color="${colour}" stop-opacity="${down ? 1 : 0}"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/>`,
    );
  const p = await standing(pack, L.pack.height, L.pack.maxWidth);
  const left = S - L.pack.right - p.width;
  const top = L.pack.floor - p.height;
  const shadow = await groundShadow(left + p.width / 2, L.pack.floor, p.width, S);
  return sharp({ create: { width: S, height: S, channels: 3, background: opts.band } })
    .composite([
      { input: photo, left: L.photo.left, top: L.photo.top },
      { input: fade(L.fadeTop, opts.band, false), left: L.fadeTop.left, top: L.fadeTop.top },
      { input: await sharp({ create: { width: L.band.width, height: L.photo.top, channels: 3, background: opts.band } }).png().toBuffer(), left: 0, top: 0 },
      { input: fade(L.fadeBottom, opts.panel, true), left: L.fadeBottom.left, top: L.fadeBottom.top },
      { input: await sharp({ create: { width: L.panel.width, height: L.panel.height, channels: 3, background: opts.panel } }).png().toBuffer(), left: 0, top: L.panel.top },
      ...(shadow ? [shadow] : []),
      { input: p.data, left, top },
    ])
    .jpeg({ quality: 92, mozjpeg: true })
    .toBuffer();
}

/**
 * Comparison slide: our real pack and a plain, unbranded box (no logo, no words: just the category),
 * side by side under the band. The table is drawn in the browser.
 */
export async function comparisonBase(pack: Buffer, opts: { size: number; band: string; background: string }): Promise<Buffer> {
  const S = opts.size;
  const L = slideLayout(S).comparison;
  const floor = L.packs.top + L.packs.height;
  const ours = await standing(pack, L.packs.height, S * 0.22);
  const gw = Math.round(ours.width * 0.95);
  const gh = Math.round(Math.min(ours.height, L.packs.height) * 0.95);
  const generic = svg(
    gw,
    gh,
    `<rect x="0" y="0" width="${gw}" height="${gh}" rx="${gw * 0.03}" fill="#c9c4bd"/><rect x="${gw * 0.1}" y="${gh * 0.12}" width="${gw * 0.8}" height="${gh * 0.38}" rx="${gw * 0.02}" fill="#b5afa7"/><rect x="${gw * 0.18}" y="${gh * 0.62}" width="${gw * 0.64}" height="${gh * 0.05}" fill="#b5afa7"/><rect x="${gw * 0.25}" y="${gh * 0.72}" width="${gw * 0.5}" height="${gh * 0.04}" fill="#b5afa7"/>`,
  );
  const layers: OverlayOptions[] = [];
  for (const [cx, w] of [
    [L.us, ours.width],
    [L.them, gw],
  ] as const) {
    const sh = await groundShadow(cx, floor, w, S);
    if (sh) layers.push(sh);
  }
  layers.push({ input: ours.data, left: Math.round(L.us - ours.width / 2), top: floor - ours.height });
  layers.push({ input: generic, left: Math.round(L.them - gw / 2), top: floor - gh });
  return sharp({ create: { width: S, height: S, channels: 3, background: opts.background } })
    .composite([{ input: await sharp({ create: { width: S, height: slideLayout(S).band.height, channels: 3, background: opts.band } }).png().toBuffer(), left: 0, top: 0 }, ...layers])
    .jpeg({ quality: 92, mozjpeg: true })
    .toBuffer();
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
