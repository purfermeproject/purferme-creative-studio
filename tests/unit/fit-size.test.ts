import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/db", () => ({ db: {}, schema: {} }));
import sharp from "sharp";
import { fitToSize } from "@/lib/images";
import { packActionByRules } from "@/lib/pack-views";
import { buildListingScenePrompt, DEFAULT_IMAGE_STYLE } from "@/lib/image-prompt";

describe("fitToSize keeps the pack whole", () => {
  it("moves the cut so a pack near the right edge isn't trimmed", async () => {
    // 1024×1536 photo, a red "pack" touching the right edge; cut to 9:16.
    const pack = await sharp({ create: { width: 150, height: 300, channels: 3, background: "#ff0000" } }).png().toBuffer();
    const img = await sharp({ create: { width: 1024, height: 1536, channels: 3, background: "#ffffff" } }).composite([{ input: pack, left: 860, top: 900 }]).png().toBuffer();
    const red = async (buf: Buffer) => {
      const { data, info } = await sharp(buf).raw().toBuffer({ resolveWithObject: true });
      let n = 0;
      for (let i = 0; i < data.length; i += info.channels) if (data[i] > 200 && data[i + 1] < 60) n++;
      return n;
    };
    const centred = await fitToSize(img, 1080, 1920);
    const kept = await fitToSize(img, 1080, 1920, { x: 860 / 1024, y: 900 / 1536, w: 150 / 1024, h: 300 / 1536 });
    expect((await sharp(kept).metadata()).width).toBe(1080);
    expect(await red(kept)).toBeGreaterThan((await red(centred)) * 1.2);
  });
});

describe("the pack is part of the moment", () => {
  it("makes a gift scene's pack the gift", () => {
    expect(packActionByRules("a girl in a hostel room", "POV: your hostel gift can't be another mug")).toMatch(/the pack is the gift/);
    expect(packActionByRules("dipping a cookie in chai")).toMatch(/open on the table/);
  });
  it("puts the action and the trim in the prompt", () => {
    const p = buildListingScenePrompt({ description: "a girl wrapping a gift", props: [], style: DEFAULT_IMAGE_STYLE, layout: "ad", inScene: true, aiPack: true, productName: "Cookies", packAction: "she ties a ribbon round the pack", trim: { sides: 0.08, topBottom: 0 } });
    expect(p).toContain("HOW THE PACK IS USED (most important): she ties a ribbon round the pack");
    expect(p).toContain("NOT a product shot");
    expect(p).toMatch(/about 8% of the picture will be cut off at BOTH the left and right/);
  });
});
