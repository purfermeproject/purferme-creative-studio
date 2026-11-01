import { describe, expect, it } from "vitest";
import { SEED_PRODUCTS, SEED_TERMS } from "@/db/seed-data";
import { checkSlide, ListingPlanSchema, TEAM_PLANS, type Slide } from "@/lib/listing-plan";
import { buildListingPlanPrompt } from "@/lib/prompts";
import { SEED_BRAND } from "@/db/seed-data";

const product = (slug: string) => SEED_PRODUCTS.find((p) => p.slug === slug)!;
const run = (slug: string, i: number) => {
  const p = product(slug);
  return checkSlide(TEAM_PLANS[slug].slides[i], "amazon", slug, SEED_TERMS, p.redClaims).checks;
};
const levels = (cs: ReturnType<typeof run>) => cs.map((c) => `${c.level}: ${c.text}`).join("\n");

describe("the team's plans, checked against the claim rules", () => {
  it("are valid plans", () => {
    for (const plan of Object.values(TEAM_PLANS)) expect(ListingPlanSchema.parse(plan).slides).toHaveLength(7);
  });

  it("let a clean slide through, and catch “natural” in another", () => {
    expect(run("bfast", 4).filter((c) => c.level !== "tip")).toEqual([]); // Tiffin Time Favourite
    expect(levels(run("bfast", 1))).toMatch(/review: Needs evidence: Natural/); // Sweet The Natural Way
  });

  it("flag the fibre claim for evidence and the comparison for sign-off", () => {
    expect(levels(run("bfast", 2))).toMatch(/review: Needs evidence: High fibre/);
    expect(levels(run("bfast", 6))).toMatch(/review: Comparison/);
  });

  it("block superfood on the peanut butter", () => {
    expect(levels(run("pbr", 2))).toMatch(/block: Not allowed: Detox \/ superfood/);
  });

  it("nudge the stack's own rules: no person in a lifestyle photo, too many feature parts", () => {
    const s: Slide = { header: "A Very Long Header That Goes On", sub: "x", feature: "a | b | c | d | e", scene: "A bowl on a table", kind: "lifestyle" };
    const t = levels(checkSlide(s, "shopify", "choc", SEED_TERMS).checks);
    expect(t).toMatch(/Header is 7 words/);
    expect(t).toMatch(/More than 4 parts/);
    expect(t).toMatch(/No person in the photo/);
  });
});

describe("the planner brief", () => {
  it("teaches the team's format from their plan but keeps the claim lists in charge", () => {
    const choc = product("choc");
    const prompt = buildListingPlanPrompt(SEED_BRAND, choc, {
      platform: "Amazon",
      rules: ["Benefit first"],
      example: { name: "Millet & Oats Breakfast Cookies", plan: TEAM_PLANS.bfast },
      hasQr: true,
    });
    expect(prompt).toContain("A PLAN THE TEAM WROTE");
    expect(prompt).toContain("Stay Full For Longer");
    expect(prompt).toContain("take only the craft, and use only the claim lists above");
    expect(prompt).toContain(`RED CLAIMS (never use, not even reworded): ${choc.redClaims.join("; ")}`);
    expect(prompt).toContain("traceability QR");
  });
});
