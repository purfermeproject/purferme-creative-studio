import { describe, expect, it } from "vitest";
import { SEED_PRODUCTS } from "@/db/seed-data";
import { buildLandscape, categoryFrom, competitorLines, matchesProduct } from "@/lib/landscape";
import { landscapeBlock } from "@/lib/prompts";
import { closeToCompetitor, type ValidatableConcept } from "@/lib/validation";
import type { CompetitorAnalysis } from "@/lib/schemas";

const choc = SEED_PRODUCTS.find((p) => p.slug === "choc")!;
const analysis = (o: Partial<CompetitorAnalysis>): CompetitorAnalysis => ({
  summary: "", hook: "", hook_mechanism: "", angle: "", audience: "", format: "", offer: "",
  claims_made: [], what_works: [], weaknesses: [], white_space: [], counter_ideas: [], ...o,
});

describe("landscape", () => {
  it("matches research to a product by id, or by category for older entries", () => {
    expect(categoryFrom("Chocolate Cookies, millet & oats, 240g")).toBe("chocolate cookies, millet & oats");
    const product = { id: "p1", name: "Chocolate Cookies, millet & oats, 240g" };
    expect(matchesProduct({ productId: "p1", category: "" }, product)).toBe(true);
    expect(matchesProduct({ productId: "p2", category: "chocolate cookies, millet & oats" }, product)).toBe(false);
    expect(matchesProduct({ productId: null, category: "chocolate cookies, millet & oats" }, product)).toBe(true);
    expect(matchesProduct({ productId: null, category: "peanut butter" }, product)).toBe(false);
  });

  it("condenses competitors into hooks to avoid, risky claims and open ground", () => {
    const l = buildLandscape(
      [
        { brand: "A", analysis: analysis({ hook: "Craving chocolate without the guilt?", angle: "Guilt-free indulgence", claims_made: [{ text: "Healthy", risk: "risky", note: "" }], white_space: ["Ingredient %", "QR traceability"] }) },
        { brand: "B", analysis: analysis({ hook: "Best biscuits for kids", angle: "Kids tiffin", white_space: ["Chai ritual", "Ingredient %"] }) },
        { brand: "C", analysis: null },
      ],
      { summary: "Category is health-led.", gaps: ["Warm, witty tone"] },
    )!;
    expect(l.brands).toEqual(["A", "B"]);
    expect(l.hooks).toEqual(["Craving chocolate without the guilt?", "Best biscuits for kids"]);
    expect(l.riskyClaims).toEqual(["Healthy"]);
    expect(l.whiteSpace).toEqual(["Ingredient %", "Chai ritual", "QR traceability"]);
    const block = landscapeBlock(l);
    expect(block).toContain("COMPETITIVE LANDSCAPE (2 competitors researched");
    expect(block).toContain('do not reuse or echo them): "Craving chocolate without the guilt?"');
    expect(block).toContain("Claims they make that we must never follow: Healthy");
    expect(block).toContain("Open ground to lean into: Warm, witty tone; Ingredient %");
    expect(buildLandscape([], null)).toBeNull();
  });

  it("collects competitor lines from hooks and quoted messaging", () => {
    const lines = competitorLines([{ adText: "Messaging: “Perfect for evening chai, lunchbox, or a post-dinner treat”; “Freshly Packed”", analysis: analysis({ hook: "“Craving chocolate without the guilt?”" }) }]);
    expect(lines).toContain("Craving chocolate without the guilt?");
    expect(lines).toContain("Perfect for evening chai, lunchbox, or a post-dinner treat");
    expect(lines).not.toContain("Freshly Packed");
  });
});

describe("sounds like a competitor", () => {
  const base: ValidatableConcept = { title: "t", hook: "", frames: [], copy: {}, claims: [], ai_prompt: "", needs_real_person: false, ai_label_needed: false };
  const lines = ["Craving chocolate without the guilt?", "Sweetened only with jaggery - no refined sugar"];
  it("flags our copy when it echoes a competitor's line", () => {
    expect(closeToCompetitor({ ...base, hook: "Craving chocolate? Skip the guilt." }, lines, choc.greenClaims)).toHaveLength(1);
  });
  it("doesn't flag our own approved claims or different lines", () => {
    expect(closeToCompetitor({ ...base, hook: "No maida. Sweetened with jaggery." }, lines, choc.greenClaims)).toHaveLength(0);
    expect(closeToCompetitor({ ...base, hook: "3pm called. It wants chai." }, lines, choc.greenClaims)).toHaveLength(0);
  });
});
