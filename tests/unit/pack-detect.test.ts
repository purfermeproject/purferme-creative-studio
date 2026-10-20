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
