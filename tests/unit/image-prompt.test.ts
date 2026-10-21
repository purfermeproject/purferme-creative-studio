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
  const base = { concept, platform: "meta" as const, creativeType: "9:16 UGC-style video (15–30s)", productName: "Chocolate Cookies" };

  it("uses the chosen scene and its exact on-screen text", () => {
    const p = buildImagePrompt({ ...base, frameIndex: 1, textMode: "ai" });
    expect(p).toContain("Scene: Cookie dunk");
    expect(p).toContain('"No maida."');
    expect(p).toContain("the real, unaltered pack photo will be placed into the image afterwards");
  });

  it("tells the model the final size and crop", () => {
    const p = buildImagePrompt({ ...base, frameIndex: 0, target: { w: 1080, h: 1920, label: "Reels / Stories 9:16", note: "Keep text out of the top 14%." } });
    expect(p).toContain("Final image is 1080×1920 px (Reels / Stories 9:16)");
    expect(p).toContain("centre-cropped");
    expect(p).toContain("Keep text out of the top 14%.");
  });

  it("clamps an out-of-range scene", () => {
    expect(buildImagePrompt({ ...base, frameIndex: 9 })).toContain("Scene: Cookie dunk");
  });

  it("never asks the AI to draw a pack, with or without our pack photo", () => {
    for (const packMode of ["locked", "none"] as const) {
      const p = buildImagePrompt({ ...base, frameIndex: 0, packMode });
      expect(p).toContain("Do NOT show any product pack");
      expect(p).toContain("Never invent packaging");
      expect(p).not.toMatch(/Show the product pack|attached photo is the real pack/);
      // The scene's own mention of the pack is replaced too.
      expect(p).toContain("Scene: [empty spot: the real pack is added later] next to a cup of chai");
    }
    expect(buildImagePrompt({ ...base, frameIndex: 0, packMode: "none" })).toContain("this image shows the scene only");
  });

  it("makes the Amazon main listing image plain white (the real pack goes on top), with no people", () => {
    const p = buildImagePrompt({ ...base, platform: "amazon", creativeType: "Listing image stack (7 images)", frameIndex: 0 });
    expect(p).toContain("plain pure white background only");
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

describe("editable direction, fixed rules", () => {
  const base = { concept, platform: "meta" as const, creativeType: "Static image ad (4:5)", productName: "Chocolate Cookies", frameIndex: 0 };
  it("uses the brand's image style in the direction", async () => {
    const { buildImagePromptParts, withImageStyleDefaults } = await import("@/lib/image-prompt");
    const style = withImageStyleDefaults({ places: "Mumbai local trains and office pantries" });
    const { direction } = buildImagePromptParts({ ...base, style });
    expect(direction).toContain("Places: Mumbai local trains and office pantries");
    expect(direction).toContain("Photography: Real photography, not CGI");
  });
  it("lets the team rewrite the direction, but the rules always stay and packs are still stripped", async () => {
    const { buildImagePromptParts } = await import("@/lib/image-prompt");
    const { prompt, direction } = buildImagePromptParts({ ...base, packMode: "locked", direction: "A girl holds the Chocolate Cookies pack on a rooftop at sunset" });
    expect(direction).not.toMatch(/Chocolate Cookies pack/);
    expect(prompt).toContain("RULES (always apply):");
    expect(prompt).toContain("Never invent packaging");
  });
});

describe("people never handle a pack the model would have to invent", () => {
  it("turns holding or reading the pack into a glance at our pack on the table", async () => {
    const { withoutPack } = await import("@/lib/image-prompt");
    const inScene = withoutPack("The man reads the label on the Peanut Butter jar while she holds the jar up", "Peanut Butter", "[our real pack, already in the image]");
    expect(inScene).toBe("The man glances at our pack standing on the table (nobody holds it) while she glances at our pack standing on the table (nobody holds it)");
    const empty = withoutPack("He flips the pack", "Peanut Butter");
    expect(empty).toContain("hands empty of any jar, box or packet");
    expect(empty).not.toMatch(/flips/);
  });

  it("makes our real pack the hero, allows appetising food, and keeps the headline area clear of the pack", () => {
    const p = buildImagePrompt({ concept, platform: "meta", creativeType: "Feed image", productName: "Chocolate Cookies", frameIndex: 0, packInScene: true });
    expect(p).toContain("our pack is the hero");
    expect(p).toContain("close and appetising, but true to the real product");
    expect(p).toContain("across the top quarter for a headline");
    expect(p).not.toContain("No close-ups of the product");
  });
});
