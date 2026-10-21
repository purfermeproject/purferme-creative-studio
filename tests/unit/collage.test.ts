import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { stackImages } = await import("@/lib/collage");

describe("stackImages", () => {
  it("stacks screenshots top to bottom at one width", async () => {
    const a = await sharp({ create: { width: 400, height: 400, channels: 3, background: "#ff0000" } }).png().toBuffer();
    const b = await sharp({ create: { width: 800, height: 400, channels: 3, background: "#0000ff" } }).png().toBuffer();
    const out = await stackImages([a, b], 800, 16);
    const m = await sharp(out).metadata();
    expect(m.width).toBe(800);
    expect(m.height).toBe(800 + 16 + 400);
  });
});
