import { describe, expect, it } from "vitest";
import { SEED_TERMS } from "@/db/seed-data";
import { amberCount, applicableTerms, conceptText, highlight, redCount, scan, type Term } from "@/lib/compliance";

const terms: Term[] = SEED_TERMS;
const labels = (r: ReturnType<typeof scan>, sev: "red" | "amber") => r.hits.filter((h) => h.severity === sev).map((h) => h.label);

describe("scan: required cases", () => {
  it('flags "gluten free cookies" as red', () => {
    const r = scan("gluten free cookies", "meta", "choc", terms);
    expect(labels(r, "red")).toContain("Gluten free");
  });

  it('flags "guilt-free treat" as red', () => {
    expect(labels(scan("guilt-free treat", "amazon", "choc", terms), "red")).toContain("Guilt-free");
  });

  it('flags "supports heart health" as red', () => {
    expect(labels(scan("supports heart health", "flipkart", "choc", terms), "red")).toContain("Heart");
  });

  it('flags "Are you overweight?" on Meta as red', () => {
    expect(labels(scan("Are you overweight?", "meta", "choc", terms), "red")).toContain("Implies viewer has a condition");
  });

  it('does not apply the Meta-only "implies condition" rule on Amazon', () => {
    expect(labels(scan("Are you overweight?", "amazon", "choc", terms), "red")).not.toContain("Implies viewer has a condition");
  });

  it('flags "Buy on Amazon" on Amazon as red', () => {
    expect(labels(scan("Buy on Amazon", "amazon", "choc", terms), "red")).toContain("Mentions Amazon");
  });

  it('does not flag "Amazon" on Meta', () => {
    expect(redCount(scan("Buy on Amazon", "meta", "choc", terms))).toBe(0);
  });

  it('flags "baby food 6-24 months" on Flipkart as red', () => {
    const r = scan("baby food 6-24 months", "flipkart", "sunrise", terms);
    expect(labels(r, "red")).toContain("Infant / baby / 6–24 months");
    expect(r.hits[0].matches).toEqual(expect.arrayContaining(["baby", "6-24 months"]));
  });

  it('flags "packed with protein" as amber', () => {
    const r = scan("packed with protein", "meta", "choc", terms);
    expect(labels(r, "amber")).toContain("Nutrient content claim");
    expect(redCount(r)).toBe(0);
  });

  it("finds zero hits in a clean sentence", () => {
    const r = scan("Made with foxtail millet, no maida, sweetened with jaggery", "meta", "choc", terms);
    expect(r.hits).toEqual([]);
  });
});

describe("scan: scoping and edge cases", () => {
  it("applies product-only terms to that product only", () => {
    expect(labels(scan("crunchy dry fruit bites", "meta", "bfast", terms), "red")).toContain("Dry fruit (Breakfast Cookies)");
    expect(redCount(scan("crunchy dry fruit bites", "meta", "choc", terms))).toBe(0);
    expect(redCount(scan("crunchy dry fruit bites", "meta", null, terms))).toBe(0);
  });

  it("is case-insensitive and de-duplicates matches", () => {
    const r = scan("HEALTHY snack. Healthy habit.", "meta", null, terms);
    const hit = r.hits.find((h) => h.label === "Healthy / healthier")!;
    expect(hit.matches).toEqual(["healthy"]);
  });

  it('does not treat "health" alone, "pureed" or "hearty" as red', () => {
    expect(redCount(scan("health matters; pureed; hearty breakfast", "meta", null, terms))).toBe(0);
  });

  it("ignores inactive terms and skips invalid regexes", () => {
    const custom: Term[] = [
      { label: "off", regex: "cookie", severity: "red", platform: null, productSlug: null, active: false },
      { label: "broken", regex: "(", severity: "red", platform: null, productSlug: null },
      { label: "on", regex: "jaggery", severity: "amber", platform: null, productSlug: null },
    ];
    const r = scan("cookie with jaggery", "meta", null, custom);
    expect(r.hits.map((h) => h.label)).toEqual(["on"]);
  });

  it("sorts red hits before amber", () => {
    const r = scan("Wholesome and gluten free", "meta", "choc", terms);
    expect(r.hits[0].severity).toBe("red");
    expect(redCount(r)).toBe(1);
    expect(amberCount(r)).toBe(1);
  });

  it("filters applicable terms by platform", () => {
    const meta = applicableTerms(terms, "meta", null).map((t) => t.label);
    expect(meta).toContain("Before/after");
    expect(meta).not.toContain("Mentions Amazon");
    expect(meta).not.toContain("Infant / baby / 6–24 months");
  });
});

describe("highlight", () => {
  it("returns segments that rebuild the original text", () => {
    const text = "Gluten free and packed with protein, made with millet.";
    const segs = highlight(text, "meta", terms, "choc");
    expect(segs.map((s) => s.text).join("")).toBe(text);
    expect(segs.find((s) => s.text.toLowerCase() === "gluten free")?.severity).toBe("red");
    expect(segs.find((s) => s.text.toLowerCase() === "packed with")?.severity).toBe("amber");
    expect(segs.at(-1)?.severity).toBeNull();
  });

  it("marks overlapping spans with the higher severity", () => {
    const custom: Term[] = [
      { label: "a", regex: "high protein bar", severity: "amber", platform: null, productSlug: null },
      { label: "r", regex: "protein", severity: "red", platform: null, productSlug: null },
    ];
    const segs = highlight("a high protein bar", "meta", custom);
    expect(segs.map((s) => [s.text, s.severity])).toEqual([
      ["a ", null],
      ["high ", "amber"],
      ["protein", "red"],
      [" bar", "amber"],
    ]);
  });

  it("returns no segments for empty text", () => {
    expect(highlight("", "meta", terms)).toEqual([]);
  });
});

describe("conceptText", () => {
  it("includes frames, copy and claims so the scanner sees everything", () => {
    const text = conceptText({
      title: "T",
      hook: "H",
      frames: [{ slot: "0-3s", visual: "V", onscreen: "gluten free", audio: "A" }],
      copy: { headline: "HL", body: "B", body_alt: "BA", cta: "Shop now" },
      claims: [{ text: "C" }],
      ai_prompt: "P",
    });
    expect(redCount(scan(text, "meta", "choc", terms))).toBe(1);
    for (const part of ["T", "H", "V", "A", "HL", "B", "BA", "Shop now", "C", "P"]) expect(text).toContain(part);
  });
});
