import { readFileSync } from "node:fs";
import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import { auditProduct, guessLinks, isCombo, listingCsv, normaliseStoreUrl, parseProducts, parseThemeColors, toHex } from "@/lib/shopify-parse";

vi.mock("server-only", () => ({}));
vi.mock("@/db", () => ({ db: {}, schema: {} }));

const fixture = JSON.parse(readFileSync("tests/fixtures/shopify/products.json", "utf8"));

describe("reading a Shopify store", () => {
  it("normalises the store address", () => {
    expect(normaliseStoreUrl("purferme.com/products/x")).toBe("https://purferme.com");
    expect(normaliseStoreUrl("https://Shop.Purferme.com/")).toBe("https://shop.purferme.com");
    expect(() => normaliseStoreUrl("not a url")).toThrow(/web address/);
  });

  it("parses the public product list", () => {
    const [choc, combo] = parseProducts(fixture);
    expect(choc.handle).toBe("chocolate-cookies");
    expect(choc.images.map((i) => i.position)).toEqual([1, 2]);
    expect(choc.variants[0].price).toBe("349.00");
    expect(combo.tags).toEqual(["combo"]);
    expect(() => parseProducts({ nope: true })).toThrow(/Shopify product list/);
  });

  it("reads theme colours from Shopify's CSS variables", () => {
    const t = parseThemeColors(readFileSync("tests/fixtures/shopify/home.html", "utf8"));
    expect(t).toEqual({ background: "#fffcf6", text: "#221633", accent: "#c8862a" });
    expect(parseThemeColors("")).toEqual({ background: "#ffffff", text: "#121212", accent: "#2d1b54" });
    expect(toHex("#abc")).toBe("#aabbcc");
    expect(toHex("rgb(45, 27, 84)")).toBe("#2d1b54");
  });

  it("lists what to fix against Shopify's image guidance", () => {
    const [choc] = parseProducts(fixture);
    const a = auditProduct(choc);
    expect(a.images).toEqual(
      expect.arrayContaining([
        { position: 1, problem: expect.stringContaining("smaller than 2048") },
        { position: 1, problem: expect.stringContaining("no alt text") },
        { position: 2, problem: "not square (1200×800)" },
      ]),
    );
    expect(a.listing.join(" ")).toMatch(/only 2 images.*short description.*no tags.*no SKU.*no barcode/);
  });

  it("spots combos and links them to every product they contain", () => {
    const [choc, combo] = parseProducts(fixture);
    expect(isCombo(choc)).toBe(false);
    expect(isCombo(combo)).toBe(true);
    const ours = [
      { id: "c", name: "Chocolate Cookies, millet & oats, 240g" },
      { id: "b", name: "Breakfast Cookies, millet & oats, 240g" },
      { id: "p", name: "Peanut Butter Unsweetened 500g" },
    ];
    expect(guessLinks(choc, ours)).toEqual(["c"]);
    expect(guessLinks(combo, ours).sort()).toEqual(["b", "c"]);
  });

  it("writes Shopify's CSV with only the listing columns, quoted safely", () => {
    const csv = listingCsv([{ handle: "x", title: 'Cookies, "millet"', bodyHtml: "<p>a\nb</p>", productType: "Cookies", tags: ["a", "b"], seoTitle: "t", seoDescription: "d" }]);
    expect(csv.split("\n")[0]).toBe("Handle,Title,Body (HTML),Type,Tags,SEO Title,SEO Description");
    expect(csv).toContain('x,"Cookies, ""millet""","<p>a\nb</p>",Cookies,"a, b",t,d');
  });
});

describe("Shopify images", () => {
  const pack = async (fill: string) =>
    sharp({ create: { width: 300, height: 400, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([{ input: await sharp({ create: { width: 260, height: 360, channels: 3, background: fill } }).png().toBuffer(), left: 20, top: 20 }])
      .png()
      .toBuffer();

  it("puts one pack, or every pack of a combo, on the store's image background at 2048×2048", { timeout: 30_000 }, async () => {
    const { packsOn, edgeColour } = await import("@/lib/shopify");
    const one = await packsOn([await pack("#3b1f5c")], "#f6f2ea");
    expect(await sharp(one).metadata()).toMatchObject({ width: 2048, height: 2048 });
    // Same colour, give or take JPEG compression.
    const edge = await edgeColour(one);
    for (const i of [1, 3, 5]) expect(Math.abs(parseInt(edge.slice(i, i + 2), 16) - parseInt("#f6f2ea".slice(i, i + 2), 16))).toBeLessThanOrEqual(4);
    const centre = await sharp(one).extract({ left: 1024, top: 1024, width: 1, height: 1 }).raw().toBuffer();
    expect(Math.abs(centre[0] - 0x3b)).toBeLessThan(6);

    const combo = await packsOn([await pack("#3b1f5c"), await pack("#1f5c3b"), await pack("#5c3b1f")], "#ffffff");
    const row = await sharp(combo).extract({ left: 0, top: 1100, width: 2048, height: 1 }).raw().toBuffer();
    const colours = new Set<string>();
    for (let x = 0; x < 2048; x += 8) colours.add(`${row[x * 3] >> 4},${row[x * 3 + 1] >> 4},${row[x * 3 + 2] >> 4}`);
    // All three packs are visible across the middle.
    expect([...colours].filter((c) => ["3,1,5", "1,5,3", "5,3,1"].includes(c)).length).toBe(3);
  });
});
