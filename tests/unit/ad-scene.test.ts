import { describe, expect, it } from "vitest";
import { adScene } from "@/lib/ad-layout";
import { buildListingScenePrompt, DEFAULT_IMAGE_STYLE } from "@/lib/image-prompt";

describe("adScene", () => {
  it("keeps the words above the pack and the pack at the lower right", () => {
    for (const [w, h] of [[1080, 1350], [1080, 1080], [1080, 1920], [1200, 628]]) {
      const A = adScene(w, h);
      expect(A.pack.position).toBe("right");
      expect(A.maxBottom).toBeGreaterThan(A.header.top + A.headerSize * 2);
      expect(A.maxBottom).toBeLessThanOrEqual(h);
    }
  });
  it("keeps tall formats clear of Meta's top bar and caption area", () => {
    const A = adScene(1080, 1920);
    expect(A.header.top).toBeGreaterThanOrEqual(1920 * 0.14);
    expect(A.pack.bottom).toBeGreaterThanOrEqual(0.2);
  });
});

describe("ad scene prompt", () => {
  it("puts the pack at the lower right and blanks screens", () => {
    const p = buildListingScenePrompt({ description: "a mother handing a child a cookie", props: [], style: DEFAULT_IMAGE_STYLE, layout: "ad", inScene: true, productName: "Cookies", forAd: "Instagram, Feed 4:5" });
    expect(p).toContain("lower right");
    expect(p).toMatch(/screen/i);
    expect(p).toContain("a mother handing a child a cookie");
  });
});

describe("AI-fitted pack prompt", () => {
  const p = buildListingScenePrompt({ description: "a girl dipping a Breakfast Cookies cookie in chai", props: [], style: DEFAULT_IMAGE_STYLE, layout: "ad", inScene: true, aiPack: true, productName: "Breakfast Cookies", forAd: "Instagram, Feed 4:5" });
  it("lets the pack adapt to the scene but keeps its design and a single pack", () => {
    expect(p).toContain("attached photo is our real product pack");
    expect(p).toMatch(/held in a hand/);
    expect(p).toContain("exactly ONE of it");
    expect(p).toMatch(/every printed word spelled exactly the same/);
    expect(p).not.toContain("already contains our real product pack");
  });
  it("keeps the scene as written and room for the headline", () => {
    expect(p).toContain("SHOW EXACTLY THIS, every part clearly visible: a girl dipping a Breakfast Cookies cookie in chai.");
    expect(p).toMatch(/top left calm/);
    expect(p).toMatch(/apart from what is printed on our pack/);
  });
});
