import { describe, expect, it } from "vitest";
import { buildImagePrompt, imageSizeFor, mockImageSvg } from "@/lib/image-prompt";

const concept = {
  title: "Chai hook",
  ai_prompt: "Photoreal desk scene, steam rising",
  needs_real_person: false,
  copy: { headline: "Your chai's crunch-mate" },
  frames: [
    { slot: "0–2s", visual: "Pack next to a cup of chai", onscreen: "3pm called." },
    { slot: "2–6s", visual: "Cookie dunk", onscreen: "No maida." },
  ],
};

describe("imageSizeFor", () => {
  it("uses portrait for Meta, landscape for 16:9 and banners, square for listing images", () => {
    expect(imageSizeFor("meta", "9:16 UGC-style video (15–30s)")).toBe("1024x1536");
    expect(imageSizeFor("meta", "Static image ad (4:5)")).toBe("1024x1536");
    expect(imageSizeFor("amazon", "Sponsored Brands video (16:9, muted)")).toBe("1536x1024");
    expect(imageSizeFor("flipkart", "Display banner (homepage/category)")).toBe("1536x1024");
    expect(imageSizeFor("amazon", "Listing image stack (7 images)")).toBe("1024x1024");
  });
});

describe("buildImagePrompt", () => {
  const base = { concept, platform: "meta" as const, creativeType: "9:16 UGC-style video (15–30s)", productName: "Chocolate Cookies", hasPackReference: true };

  it("uses the chosen scene and its exact on-screen text", () => {
    const p = buildImagePrompt({ ...base, frameIndex: 1 });
    expect(p).toContain("Scene: Cookie dunk");
    expect(p).toContain('"No maida."');
    expect(p).toContain("attached photo is the real pack");
  });

  it("clamps an out-of-range scene and says not to invent pack text without a reference", () => {
    const p = buildImagePrompt({ ...base, frameIndex: 9, hasPackReference: false });
    expect(p).toContain("Scene: Cookie dunk");
    expect(p).toContain("do not invent detailed pack text");
  });

  it("makes the Amazon main listing image pack-only on white, with no people", () => {
    const p = buildImagePrompt({ ...base, platform: "amazon", creativeType: "Listing image stack (7 images)", frameIndex: 0 });
    expect(p).toContain("pure white background");
    expect(p).not.toContain("3pm called.");
    expect(p).toContain("No people's faces");
  });
});

describe("mockImageSvg", () => {
  it("escapes the label", () => {
    expect(mockImageSvg("1024x1024", '<b>"x"</b>')).not.toContain("<b>");
  });
});
