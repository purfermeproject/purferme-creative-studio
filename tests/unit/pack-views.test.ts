import { describe, expect, it } from "vitest";
import { pickViewsByRules, viewFromFilename, viewLabel, viewOf, type PackView } from "@/lib/pack-views";
import { buildListingScenePrompt, DEFAULT_IMAGE_STYLE } from "@/lib/image-prompt";

const ALL: PackView[] = ["front", "back", "left side", "right side", "top", "bottom", "angle", "open"];

describe("pack views", () => {
  it("round-trips labels and ignores other photos", () => {
    expect(viewOf(viewLabel("left side"))).toBe("left side");
    expect(viewOf("Cookies out of the pack")).toBeNull();
    expect(viewOf("Pack view: sideways")).toBeNull();
  });
  it("reads the side from the file name", () => {
    expect(viewFromFilename("cookies-BACK.jpg")).toBe("back");
    expect(viewFromFilename("box_3-4.png")).toBe("angle");
    expect(viewFromFilename("IMG_left_side.jpg")).toBe("left side");
    expect(viewFromFilename("pack side.jpg")).toBe("right side");
    expect(viewFromFilename("top.webp")).toBe("top");
    expect(viewFromFilename("opened.jpg")).toBe("open");
    expect(viewFromFilename("front.jpg")).toBe("front");
    expect(viewFromFilename("IMG_2231.jpg")).toBeNull();
  });
  it("picks the sides that suit the scene, front always included", () => {
    expect(pickViewsByRules("a mother reading the ingredients on the back", ALL)[0]).toBe("back");
    expect(pickViewsByRules("a girl unwrapping a gift", ALL)).toEqual(expect.arrayContaining(["open", "angle", "front"]));
    expect(pickViewsByRules("flat lay from above of breakfast", ALL)[0]).toBe("top");
    expect(pickViewsByRules("a man holding the pack at his desk", ALL)[0]).toBe("angle");
    expect(pickViewsByRules("a kitchen table", ALL)).toEqual(["front", "angle"]);
    expect(pickViewsByRules("reading the ingredients", ["front"])).toEqual(["front"]);
    expect(pickViewsByRules("x", ALL).length).toBeLessThanOrEqual(3);
  });
  it("tells the image AI the photos are one pack from several sides", () => {
    const p = buildListingScenePrompt({ description: "a man holding the pack", props: [], style: DEFAULT_IMAGE_STYLE, layout: "ad", inScene: true, aiPack: true, productName: "Cookies", views: ["angle", "front", "back"] });
    expect(p).toContain("The 3 attached photos all show our ONE real product pack");
    expect(p).toContain("photo 1 = angle, photo 2 = front, photo 3 = back");
    expect(p).toContain("its front and one side (a 3/4 view)");
    expect(p).toContain("exactly ONE pack");
  });
});

describe("pack views: words that only look similar", () => {
  it("doesn't treat 'ready' as reading the back", () => {
    expect(pickViewsByRules("breakfast ready on the table", ["front", "back", "angle"])).toEqual(["front", "angle"]);
  });
});

import { isPackPhoto, isScenePhoto } from "@/lib/pack-views";

describe("which photos can be a slide's background", () => {
  it("never a pack, side, panel or product cut-out; a real scene yes", () => {
    for (const l of ["Pack view: nutrition panel", "Pack view: left side", "Pack photo (original background)", "Original pack (cropped)", "Our product: cookies (background removed)"]) expect(isScenePhoto(l)).toBe(false);
    expect(isScenePhoto("Desk with chai")).toBe(true);
    expect(isPackPhoto("Pack view: back")).toBe(true);
  });
});
