import { describe, expect, it, vi } from "vitest";
import { SEED_BRAND, SEED_PRODUCTS } from "@/db/seed-data";
import { buildDiscoveryPrompt } from "@/lib/prompts";

vi.mock("server-only", () => ({}));
vi.mock("@/db", () => ({ db: {}, schema: {} }));
const { urlKey } = await import("@/lib/competitors");
const { extractJson } = await import("@/lib/ai");

const choc = SEED_PRODUCTS.find((p) => p.slug === "choc")!;

describe("competitor discovery", () => {
  it("asks for real, sourced Indian competitors and excludes us and tracked brands", () => {
    const p = buildDiscoveryPrompt(SEED_BRAND, choc, { category: "millet cookies", focus: "claims", count: 5, exclude: ["Brand X"] });
    expect(p).toContain("find the 5 most relevant competing brands selling in India right now in this category: millet cookies");
    expect(p).toContain("FOCUS: The claims they make");
    expect(p).toContain("Already tracked (skip these): Brand X");
    expect(p).toContain("Never invent a URL, price or claim");
    expect(p).toContain(`OUR PRODUCT TO COMPARE WITH: ${choc.name}`);
  });

  it("matches cited URLs to search results regardless of www, query or trailing slash", () => {
    expect(urlKey("https://www.Example.com/shop/cookies/?utm=1#x")).toBe(urlKey("http://example.com/shop/cookies"));
    expect(urlKey("not a url")).toBe("");
  });

  it("pulls the JSON out of a reply with prose around it", () => {
    expect(extractJson('Here you go:\n{"a":{"b":1}}\nThanks')).toEqual({ a: { b: 1 } });
    expect(() => extractJson("no json")).toThrow();
  });
});
