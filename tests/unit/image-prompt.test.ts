import { describe, expect, it } from "vitest";
import { buildImagePrompt, mockImageSvg } from "@/lib/image-prompt";

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

describe("buildImagePrompt", () => {
  const base = { concept, platform: "meta" as const, creativeType: "9:16 UGC-style video (15–30s)", productName: "Chocolate Cookies", hasPackReference: true };

  it("uses the chosen scene and its exact on-screen text", () => {
    const p = buildImagePrompt({ ...base, frameIndex: 1 });
    expect(p).toContain("Scene: Cookie dunk");
    expect(p).toContain('"No maida."');
    expect(p).toContain("attached photo is the real pack");
  });

  it("tells the model the final size and crop", () => {
    const p = buildImagePrompt({ ...base, frameIndex: 0, target: { w: 1080, h: 1920, label: "Reels / Stories 9:16", note: "Keep text out of the top 14%." } });
    expect(p).toContain("Final image is 1080×1920 px (Reels / Stories 9:16)");
    expect(p).toContain("centre-cropped");
    expect(p).toContain("Keep text out of the top 14%.");
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
  it("escapes the label and uses the target size", () => {
    const svg = mockImageSvg("1080x1920", '<b>"x"</b>');
    expect(svg).not.toContain("<b>");
    expect(svg).toContain('width="1080" height="1920"');
  });
});

describe("locked pack: scene text never asks for a pack", () => {
  it("replaces pack mentions and the product name, leaving other words alone", async () => {
    const { withoutPack } = await import("@/lib/image-prompt");
    const out = withoutPack("Close-up: Chocolate Cookies, millet & oats, 240g pack on a desk; a pouch peeks out of her backpack", "Chocolate Cookies, millet & oats, 240g");
    expect(out).toBe("Close-up: [empty spot: the real pack is added later] on a desk; a [empty spot: the real pack is added later] peeks out of her backpack");
    expect(withoutPack("Snack boxes and packaging", "X")).not.toMatch(/box|packaging/i);
  });
});
