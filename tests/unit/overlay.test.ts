import { describe, expect, it } from "vitest";
import { safeArea } from "@/components/overlay-render";
import { DEFAULT_BRAND_KIT, withKitDefaults } from "@/lib/brand-kit";
import { buildImagePrompt } from "@/lib/image-prompt";

describe("safeArea", () => {
  it("keeps clear of Reels/Stories UI on 9:16", () => {
    const s = safeArea(1080, 1920);
    expect(s.y).toBe(Math.round(1920 * 0.14));
    expect(s.y + s.h).toBe(Math.round(1920 * 0.14) + Math.round(1920 * 0.66));
    expect(s.x).toBe(Math.round(1080 * 0.06));
  });
  it("uses even margins on square and landscape", () => {
    const s = safeArea(2000, 2000);
    expect(s.y).toBe(120);
    expect(s.h).toBe(1760);
  });
});

describe("brand kit defaults", () => {
  it("fills missing values and rejects bad colours", () => {
    const k = withKitDefaults({ colors: { primary: "red", accent: "#123456", text: "#ffffff", band: "#000000" } } as never);
    expect(k.colors.primary).toBe(DEFAULT_BRAND_KIT.colors.primary);
    expect(k.colors.accent).toBe("#123456");
    expect(k.headingFont.name).toBe("Bricolage Grotesque");
    expect(withKitDefaults(null)).toEqual(DEFAULT_BRAND_KIT);
  });
});

describe("text-free images for the overlay", () => {
  const concept = {
    title: "t",
    ai_prompt: "desk scene",
    needs_real_person: false,
    copy: { headline: "h" },
    frames: [{ slot: "0–2s", visual: "pack and chai", onscreen: "3pm called." }],
  };
  const base = { concept, frameIndex: 0, platform: "meta" as const, creativeType: "Static image ad (4:5)", productName: "Cookies", hasPackReference: true };
  it("tells the model to leave text out and space free", () => {
    const p = buildImagePrompt({ ...base, textMode: "overlay" });
    expect(p).toContain("Do not render any added words");
    expect(p).not.toContain('"3pm called."');
  });
  it("still lets the model draw text when asked", () => {
    expect(buildImagePrompt({ ...base, textMode: "ai" })).toContain('"3pm called."');
  });
});
