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
