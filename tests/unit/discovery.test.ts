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

describe("marketplace research", () => {
  it("reads the best-selling listings and asks for a playbook that keeps to our claims", async () => {
    const { buildMarketplacePrompt } = await import("@/lib/prompts");
    const p = buildMarketplacePrompt(SEED_BRAND, choc, { platform: "flipkart", category: "millet cookies", count: 5 });
    expect(p).toContain("what is working on Flipkart (flipkart.com) right now for this category: millet cookies");
    expect(p).toContain("price per 100 g");
    expect(p).toContain("what reviewers repeatedly praise and complain about");
    expect(p).toContain(`Never-use claims: ${choc.redClaims.join("; ")}`);
    expect(p).toContain("Only report what you actually saw");
  });

  it("adds what's working to Amazon briefs without copying competitors", async () => {
    const { buildGenerationPrompt, playbookBlock } = await import("@/lib/prompts");
    const { SEED_PLATFORM_RULES } = await import("@/db/seed-data");
    const playbook = { platform: "amazon" as const, date: "2026-10-20", summary: "Winners lead with no maida.", titleFormula: "Brand + Millet Cookies + No Maida + size", keywords: ["millet cookies"], imageStack: ["Pack on white", "Infographic"], reviewThemes: ["Arrives broken?"], adTips: ["SB video"] };
    expect(playbookBlock(playbook)).toContain("WHAT'S WORKING ON AMAZON.IN");
    const p = buildGenerationPrompt(SEED_BRAND, choc, SEED_PLATFORM_RULES.find((r) => r.platform === "amazon")!, {
      n: 3, platform: "amazon", creativeType: "Sponsored Brands video (16:9, muted)", angle: "auto", persona: "auto", language: "English", playbook,
    });
    expect(p).toContain("Image stack that wins: Pack on white → Infographic");
    expect(p).toContain("Doubts to answer up front (from reviews): Arrives broken?");
    expect(p).toContain("never a competitor's words");
  });
});
