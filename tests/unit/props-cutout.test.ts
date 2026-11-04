import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import sharp from "sharp";
import { mainImage, propsCutout } from "@/lib/listing-images";

describe("main image extras never break the main image", () => {
  it("an empty (all-white) ingredient photo gives no props instead of an error", async () => {
    const white = await sharp({ create: { width: 600, height: 400, channels: 3, background: "#ffffff" } }).jpeg().toBuffer();
    await expect(propsCutout(white)).resolves.toBeNull();
  });
  it("makes the main image with real piles cut out of white", async () => {
    const piles = await sharp({ create: { width: 600, height: 400, channels: 3, background: "#ffffff" } })
      .composite([{ input: await sharp({ create: { width: 200, height: 80, channels: 3, background: "#c8963c" } }).png().toBuffer(), left: 200, top: 280 }])
      .jpeg()
      .toBuffer();
    const props = await propsCutout(piles);
    const pack = await sharp({ create: { width: 300, height: 440, channels: 4, background: { r: 107, g: 63, b: 42, alpha: 1 } } }).png().toBuffer();
    const out = await mainImage(pack, 1000, null, props);
    const m = await sharp(out).metadata();
    expect([m.width, m.height]).toEqual([1000, 1000]);
  });
});
