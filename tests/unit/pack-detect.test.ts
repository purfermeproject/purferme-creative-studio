import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/db", () => ({ db: {}, schema: {} }));
const { cleanBox, cropToBox } = await import("@/lib/pack-detect");

describe("pack crop", () => {
  it("keeps boxes inside the image and refuses tiny ones", () => {
    expect(cleanBox({ x: -0.1, y: 0.2, w: 0.5, h: 0.9 })).toEqual({ x: 0, y: 0.2, w: 0.5, h: 0.8 });
    expect(cleanBox({ x: 0.5, y: 0.5, w: 0.01, h: 0.3 })).toBeNull();
  });

  it("copies the pack's pixels exactly", async () => {
    const raw = Buffer.alloc(200 * 100 * 3);
    for (let i = 0; i < raw.length; i++) raw[i] = (i * 37) % 256;
    const img = await sharp(raw, { raw: { width: 200, height: 100, channels: 3 } }).png().toBuffer();
    const out = await cropToBox(img, { x: 0.25, y: 0.2, w: 0.5, h: 0.6 });
    const m = await sharp(out).metadata();
    expect([m.width, m.height]).toEqual([100, 60]);
    const got = await sharp(out).removeAlpha().raw().toBuffer();
    const want = await sharp(img).extract({ left: 50, top: 20, width: 100, height: 60 }).raw().toBuffer();
    expect(got.equals(want)).toBe(true);
  });
});

describe("telling our pack from a copy the AI drew", () => {
  it("treats only the same box as ours; a bigger copy behind it is invented", async () => {
    const { sameBox } = await import("@/lib/pack-detect");
    const ours = { x: 0.69, y: 0.47, w: 0.15, h: 0.36 };
    expect(sameBox({ x: 0.68, y: 0.46, w: 0.16, h: 0.37 }, ours)).toBe(true);
    // The photo above: a larger box standing behind and to the left of ours.
    expect(sameBox({ x: 0.62, y: 0.38, w: 0.18, h: 0.42 }, ours)).toBe(false);
  });
});

describe("blanking out our real pack before looking for invented ones", () => {
  it("covers exactly our pack with flat grey and leaves the rest untouched", async () => {
    const { blankOutPack } = await import("@/lib/pack-detect");
    const img = await sharp({ create: { width: 200, height: 200, channels: 3, background: "#d9c7a8" } }).png().toBuffer();
    const out = await blankOutPack(img, { left: 120, top: 80, width: 50, height: 90 });
    const px = async (x: number, y: number) => [...(await sharp(out).extract({ left: x, top: y, width: 1, height: 1 }).removeAlpha().raw().toBuffer())];
    expect(await px(140, 120)).toEqual([128, 128, 128]);
    expect(await px(110, 120)).toEqual([0xd9, 0xc7, 0xa8]);
  });
});
