import { describe, expect, it } from "vitest";
import { SEED_PRODUCTS, SEED_TERMS } from "@/db/seed-data";
import { approvalGate } from "@/lib/qa";
import { claimMatches, normalizeClaim, restrictedPhrases, validateCreative, type ValidatableConcept } from "@/lib/validation";

const choc = { ...SEED_PRODUCTS.find((p) => p.slug === "choc")!, claimEvidence: [{ claim: "Fibre/protein content (grams per serving only)", evidence: "4 g fibre per 30 g serving", source: "Lab report 114" }] };
const terms = SEED_TERMS.map((t) => ({ ...t, platform: t.platform ?? null, productSlug: t.productSlug ?? null }));

const base: ValidatableConcept = {
  title: "Chai slump",
  hook: "3pm called. It wants chai.",
  frames: [{ slot: "0–2s", visual: "Pack on desk", onscreen: "No maida. Sweetened with jaggery." }],
  copy: { headline: "Your chai's new crunch-mate", body: "Made with foxtail millet and rolled oats.", cta: "Shop now" },
  claims: [{ text: "Sweetened with jaggery", tier: "green" }],
  ai_prompt: "Pack beside chai",
  needs_real_person: false,
  ai_label_needed: false,
};
const run = (c: Partial<ValidatableConcept>, avoid: string[] = []) => validateCreative({ concept: { ...base, ...c }, platform: "meta", product: choc, terms, avoidPhrases: avoid });

describe("claim matching", () => {
  it("matches a claim covered by a library claim", () => {
    expect(claimMatches("Sweetened with jaggery", "No refined sugar, sweetened with jaggery")).toBe(true);
    expect(claimMatches("made with foxtail millet", "Made with foxtail millet and rolled oats")).toBe(true);
  });
  it("does not let a stronger claim ride on a weaker one", () => {
    expect(claimMatches("No sugar", "No refined sugar, sweetened with jaggery")).toBe(false);
    expect(claimMatches("High protein", "Fibre/protein content (grams per serving only)")).toBe(false);
  });
  it("normalises punctuation and case", () => {
    expect(normalizeClaim("  No MAIDA!  ")).toBe("no maida");
  });
  it("reads restricted phrases from quotes and slashes", () => {
    expect(restrictedPhrases('"Naturally sweetened" implying low sugar')).toEqual(["naturally sweetened"]);
    expect(restrictedPhrases("Healthy/guilt-free")).toEqual(["healthy", "guilt-free"]);
  });
});

describe("validateCreative", () => {
  it("passes a clean ad with approved claims and no review needed", () => {
    const v = run({});
    expect(v.blocking).toBe(0);
    expect(v.needsHumanReview).toBe(false);
    expect(v.claims[0].status).toBe("approved");
  });

  it("blocks red terms and restricted product claims", () => {
    const v = run({ copy: { ...base.copy, body: "Gluten free and good for heart health." } });
    expect(v.blocking).toBeGreaterThan(0);
    expect(v.issues.some((i) => i.level === "block" && /gluten free/i.test(i.detail))).toBe(true);
    expect(v.issues.some((i) => i.level === "block" && /heart/i.test(i.detail))).toBe(true);
  });

  it("sends claims that aren't in the library to a person", () => {
    const v = run({ claims: [{ text: "Kids love it", tier: "green" }] });
    expect(v.claims[0].status).toBe("unverified");
    expect(v.needsHumanReview).toBe(true);
  });

  it("shows evidence on file for amber claims and still asks for sign-off", () => {
    const v = run({ claims: [{ text: "Fibre content (grams per serving only)", tier: "green" }] });
    expect(v.claims[0]).toMatchObject({ status: "needs-evidence", tier: "amber", evidence: "4 g fibre per 30 g serving" });
    expect(v.needsHumanReview).toBe(true);
  });

  it("flags avoid-list phrases, long headlines and copy variants", () => {
    const v = run({ copy: { ...base.copy, headline: "A very long headline that will certainly get cut off on Meta", variants: [{ headline: "ok", body: "Treat yourself to a snack", cta: "Shop now" }] } }, ["treat yourself"]);
    expect(v.issues.some((i) => i.level === "brand" && i.title === "Overused phrase")).toBe(true);
    expect(v.issues.some((i) => i.title === "Headline may be cut off")).toBe(true);
  });

  it("scans copy variants too", () => {
    const v = run({ copy: { ...base.copy, variants: [{ headline: "Guilt-free crunch", body: "x", cta: "Shop now" }] } });
    expect(v.blocking).toBeGreaterThan(0);
  });
});

describe("approval gate with review", () => {
  const clean = { platform: "meta" as const, scanResult: { hits: [] }, qaChecked: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] };
  it("needs a named reviewer when claims are uncertain", () => {
    expect(approvalGate({ ...clean, review: { needed: true, reviewedBy: "" } }).ok).toBe(false);
    expect(approvalGate({ ...clean, review: { needed: true, reviewedBy: "a@b.c" } }).ok).toBe(true);
  });
  it("blocks on restricted claims found beyond the scan", () => {
    expect(approvalGate({ ...clean, otherBlocking: ["“heart health” is never used"] }).missing[0]).toContain("heart health");
  });
});

describe("restricted product claims beyond the term list", () => {
  it("blocks a never-use claim that no regex term covers", () => {
    const v = validateCreative({ concept: { ...base, hook: "Dry fruits in every bite" }, platform: "meta", product: SEED_PRODUCTS.find((p) => p.slug === "bfast")!, terms: [] });
    expect(v.issues.find((i) => i.id.startsWith("red:"))?.detail).toContain("dry fruits");
  });
});
