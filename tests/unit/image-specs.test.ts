import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import { defaultSpecFor, generationSizeFor, IMAGE_SPECS, ratioLabel } from "@/lib/image-specs";

vi.mock("server-only", () => ({}));
vi.mock("@/db", () => ({ db: {}, schema: {} }));

describe("defaultSpecFor", () => {
  it("matches each platform's creative types to the right exact size", () => {
    const d = (p: "meta" | "amazon" | "flipkart", t: string) => {
      const s = defaultSpecFor(p, t);
      return `${s.w}x${s.h}`;
    };
    expect(d("meta", "9:16 UGC-style video (15–30s)")).toBe("1080x1920");
    expect(d("meta", "Static image ad (4:5)")).toBe("1080x1350");
    expect(d("meta", "Carousel (3–5 cards)")).toBe("1080x1080");
    expect(d("meta", "Real-customer review video")).toBe("1080x1920");
    expect(d("amazon", "Listing image stack (7 images)")).toBe("2000x2000");
    expect(d("amazon", "Sponsored Brands video (16:9, muted)")).toBe("1920x1080");
    expect(d("amazon", "Sponsored Brands headline + custom image")).toBe("1200x628");
    expect(d("amazon", "A+ content module plan")).toBe("970x600");
    expect(d("flipkart", "Listing image set (7 images)")).toBe("2000x2000");
    expect(d("flipkart", "Display banner (homepage/category)")).toBe("1800x600");
    expect(d("flipkart", "Short product video (16:9)")).toBe("1920x1080");
    expect(d("meta", "my own weird type")).toBe("1080x1350");
  });

  it("every spec has a unique id", () => {
    const ids = Object.values(IMAGE_SPECS).flat().map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("generationSizeFor", () => {
  it("picks the closest shape the model supports", () => {
    expect(generationSizeFor(1080, 1920)).toBe("1024x1536");
    expect(generationSizeFor(1080, 1350)).toBe("1024x1536");
    expect(generationSizeFor(1080, 1080)).toBe("1024x1024");
    expect(generationSizeFor(1920, 1080)).toBe("1536x1024");
    expect(generationSizeFor(970, 300)).toBe("1536x1024");
  });

  it("labels ratios readably", () => {
    expect(ratioLabel(1080, 1920)).toBe("9:16");
    expect(ratioLabel(1080, 1350)).toBe("4:5");
    expect(ratioLabel(1200, 628)).toBe("1.91:1");
  });
});

describe("fitToSize", () => {
  it("crops and resizes a generated image to the exact platform pixels as JPEG", async () => {
    const { fitToSize } = await import("@/lib/images");
    const src = await sharp({ create: { width: 1024, height: 1536, channels: 3, background: "#6b3f2a" } }).png().toBuffer();
    for (const [w, h] of [[1080, 1920], [1080, 1350], [2000, 2000], [970, 300]]) {
      const out = await fitToSize(src, w, h);
      const m = await sharp(out).metadata();
      expect([m.width, m.height, m.format]).toEqual([w, h, "jpeg"]);
    }
  });
});

import { checkSize } from "@/lib/image-specs";

describe("checkSize", () => {
  it("accepts exact platform sizes", () => {
    expect(checkSize("meta", 1080, 1920).ok).toBe(true);
    expect(checkSize("amazon", 2000, 2000).match?.id).toBe("amz-listing");
  });
  it("flags the right shape at the wrong size", () => {
    const c = checkSize("meta", 720, 1280);
    expect(c.ok).toBe(false);
    expect(c.issues.join(" ")).toMatch(/Right shape \(9:16\)/);
    expect(c.issues.join(" ")).toMatch(/Too small/);
  });
  it("flags odd shapes and names the closest", () => {
    const c = checkSize("amazon", 1500, 900);
    expect(c.issues[0]).toMatch(/Not a standard Amazon shape/);
  });
});

describe("sizes each platform needs", () => {
  it("covers Meta's feed, Reels/Stories and square placements, and the marketplace basics", async () => {
    const { neededSpecsFor } = await import("@/lib/image-specs");
    const size = (p: "meta" | "amazon" | "flipkart", t: string) => neededSpecsFor(p, t).map((s) => `${s.w}x${s.h}`);
    expect(size("meta", "Static image ad (4:5)")).toEqual(["1080x1350", "1080x1920", "1080x1080"]);
    expect(size("meta", "9:16 UGC-style video (15–30s)")).toEqual(["1080x1920", "1080x1350"]);
    expect(size("amazon", "Listing image stack (7 images)")).toEqual(["2000x2000"]);
    expect(size("amazon", "Sponsored Brands video (16:9, muted)")).toEqual(["1920x1080"]);
    expect(size("flipkart", "Listing images")).toEqual(["2000x2000", "1080x1080"]);
  });
});
