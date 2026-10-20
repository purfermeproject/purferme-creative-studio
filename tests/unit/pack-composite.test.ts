import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { compositePack, isCutout, packBox } = await import("@/lib/pack-composite");

/** A "pack" with fine stripes and a coloured block, so any redrawing or recolouring would show. */
async function stripedPack(w: number, h: number, alphaMargin = 0) {
  const raw = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const inside = x >= alphaMargin && y >= alphaMargin && x < w - alphaMargin && y < h - alphaMargin;
      raw[i] = x % 4 < 2 ? 200 : 30;
      raw[i + 1] = y % 6 < 3 ? 120 : 10;
      raw[i + 2] = x > w / 2 ? 220 : 40;
      raw[i + 3] = inside ? 255 : 0;
    }
  }
  return sharp(raw, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
}

const scene = (w: number, h: number) => sharp({ create: { width: w, height: h, channels: 3, background: "#d9c7a8" } }).png().toBuffer();

describe("packBox", () => {
  it("keeps the pack inside the canvas and clear of the Reels bottom bar", () => {
    const b = packBox({ w: 1080, h: 1920 }, { w: 600, h: 900 }, "right", "medium");
    expect(b.left + b.width).toBeLessThanOrEqual(1080);
    expect(b.top + b.height).toBeLessThanOrEqual(1920 * 0.78 + 1);
    expect(b.width / b.height).toBeCloseTo(600 / 900, 2);
  });

  it("centres when asked", () => {
    const b = packBox({ w: 1000, h: 1000 }, { w: 100, h: 100 }, "center", "small");
    expect(Math.abs(b.left + b.width / 2 - 500)).toBeLessThanOrEqual(1);
  });
});

describe("compositePack", () => {
  it("places an opaque pack photo pixel-for-pixel (only scaled, never redrawn)", async () => {
    const pack = await stripedPack(200, 300);
    expect(await isCutout(pack)).toBe(false);
    const { data, box } = await compositePack(await scene(1080, 1350), pack, { w: 1080, h: 1350, position: "right", scale: "medium", format: "png" });
    const meta = await sharp(data).metadata();
    expect([meta.width, meta.height]).toEqual([1080, 1350]);
    const placed = await sharp(data).extract(box).removeAlpha().raw().toBuffer();
    const expected = await sharp(pack).resize(box.width, box.height, { fit: "fill", kernel: "lanczos3" }).removeAlpha().raw().toBuffer();
    expect(placed.equals(expected)).toBe(true);
  });

  it("trims a cut-out's transparent margin and keeps the pack's own pixels", async () => {
    const pack = await stripedPack(240, 340, 20);
    expect(await isCutout(pack)).toBe(true);
    const { data, box, cutout } = await compositePack(await scene(1080, 1080), pack, { w: 1080, h: 1080, position: "left", scale: "small", format: "png" });
    expect(cutout).toBe(true);
    // Trimmed to 200×300, so the placed box keeps that 2:3 shape.
    expect(box.width / box.height).toBeCloseTo(200 / 300, 1);
    const centre = await sharp(data).extract({ left: box.left + Math.floor(box.width / 2) - 2, top: box.top + Math.floor(box.height / 2), width: 4, height: 1 }).raw().toBuffer();
    // Background is #d9c7a8; the pack's stripes are far from it.
    expect(centre[0]).not.toBe(0xd9);
  });
});

describe("unusable pack photos", () => {
  it("refuses a tiny photo with a clear message", async () => {
    const tiny = await sharp({ create: { width: 4, height: 4, channels: 4, background: "#ffffff" } }).png().toBuffer();
    await expect(compositePack(await scene(400, 400), tiny, { w: 400, h: 400 })).rejects.toThrow(/too small/);
  });
});

describe("pack photo on a plain studio backdrop", () => {
  it("is lifted off the backdrop automatically, keeping the pack's own pixels", async () => {
    const box = await sharp({ create: { width: 160, height: 240, channels: 3, background: "#2d1b54" } }).png().toBuffer();
    const photo = await sharp({ create: { width: 400, height: 400, channels: 3, background: "#e8dcc8" } })
      .composite([{ input: box, left: 120, top: 80 }])
      .png()
      .toBuffer();
    expect(await isCutout(photo)).toBe(false);
    const { data, box: placed, backdropRemoved } = await compositePack(await scene(1080, 1080), photo, { w: 1080, h: 1080, position: "center", scale: "medium", format: "png" });
    expect(backdropRemoved).toBe(true);
    // Trimmed to the pack, so the placed box has the pack's 2:3 shape, not the photo's square.
    expect(placed.width / placed.height).toBeCloseTo(160 / 240, 1);
    const centre = await sharp(data).extract({ left: placed.left + Math.floor(placed.width / 2), top: placed.top + Math.floor(placed.height / 2), width: 1, height: 1 }).raw().toBuffer();
    expect([...centre.subarray(0, 3)]).toEqual([0x2d, 0x1b, 0x54]);
  });

  it("keeps a busy photo as it is instead of guessing", async () => {
    const pack = await stripedPack(200, 300);
    const { backdropRemoved } = await compositePack(await scene(800, 800), pack, { w: 800, h: 800, format: "png" });
    expect(backdropRemoved).toBe(false);
  });
});
