import { describe, expect, it } from "vitest";
import { guessMapping, MARKET_FIELDS, META_FIELDS, parseNumber, rowToMarketplaceInput, rowToMetaInput } from "@/lib/csv-import";
import { DEFAULT_THRESHOLDS, marketplaceVerdict, metaVerdict, withDefaults } from "@/lib/verdicts";

const meta = (o: Partial<Parameters<typeof metaVerdict>[0]> = {}) =>
  metaVerdict({ targetCpa: 300, spend: 600, hookRate: 25, ctr: 1, cpa: 400, frequency: 1.5, ...o });

describe("metaVerdict", () => {
  it("kills on hook rate under 20%", () => {
    const v = meta({ hookRate: 15 });
    expect(v.verdict).toBe("Kill");
    expect(v.reasons[0]).toMatch(/Hook rate 15%/);
  });

  it("kills on link CTR under 0.8%", () => {
    expect(meta({ ctr: 0.5 }).verdict).toBe("Kill");
  });

  it("kills on CPA over 2× target once spend ≥ 1.5× target", () => {
    expect(meta({ spend: 450, cpa: 700 }).verdict).toBe("Kill");
  });

  it("does not kill on CPA before spend reaches 1.5× target, but notes not enough data", () => {
    const v = meta({ spend: 400, cpa: 700 });
    expect(v.verdict).toBe("Hold");
    expect(v.notEnoughData).toBe(true);
    expect(v.warnings[0]).toMatch(/Not enough data/);
  });

  it("still applies hook/CTR kill rules with not enough data", () => {
    const v = meta({ spend: 100, hookRate: 10 });
    expect(v.verdict).toBe("Kill");
    expect(v.notEnoughData).toBe(true);
  });

  it("scales with two of three signals", () => {
    expect(meta({ hookRate: 35, ctr: 1.8, cpa: 400 }).verdict).toBe("Scale");
    expect(meta({ hookRate: 35, ctr: 1, cpa: 250 }).verdict).toBe("Scale");
    expect(meta({ hookRate: 25, ctr: 1.6, cpa: 300 }).verdict).toBe("Scale");
  });

  it("holds with one scale signal", () => {
    const v = meta({ hookRate: 35 });
    expect(v.verdict).toBe("Hold");
    expect(v.nextStep).toMatch(/day 7/);
  });

  it("treats missing CPA (no conversions) as not a scale signal", () => {
    expect(meta({ hookRate: 35, cpa: null }).verdict).toBe("Hold");
  });

  it("warns about frequency over 3", () => {
    expect(meta({ frequency: 3.4 }).warnings.join(" ")).toMatch(/plan replacements/);
    expect(meta({ frequency: 3 }).warnings).toEqual([]);
  });

  it("gives next steps per verdict", () => {
    expect(meta({ hookRate: 10 }).nextStep).toMatch(/Pause/);
    expect(meta({ hookRate: 35, ctr: 2 }).nextStep).toMatch(/20–30%/);
  });

  it("uses edited thresholds", () => {
    const t = { ...DEFAULT_THRESHOLDS.meta, hookKill: 30 };
    expect(metaVerdict({ targetCpa: 300, spend: 600, hookRate: 25, ctr: 1, cpa: 400, frequency: 1 }, t).verdict).toBe("Kill");
  });
});

const mk = (o: Partial<Parameters<typeof marketplaceVerdict>[0]> = {}) =>
  marketplaceVerdict({ targetAcos: 30, acos: 40, ctr: 0.5, conversionRate: 8, clicks: 50, ...o });

describe("marketplaceVerdict", () => {
  it("cuts when ACoS > 1.5× target with ≥ 30 clicks", () => {
    expect(mk({ acos: 50 }).verdict).toBe("Cut");
  });

  it("does not cut with under 30 clicks and flags not enough data", () => {
    const v = mk({ acos: 50, clicks: 20 });
    expect(v.verdict).toBe("Hold");
    expect(v.notEnoughData).toBe(true);
    expect(v.warnings[0]).toMatch(/Not enough data for conversion/);
    expect(v.reasons[0]).toMatch(/isn't enough to cut yet/);
  });

  it("scales when ACoS ≤ target", () => {
    const v = mk({ acos: 30 });
    expect(v.verdict).toBe("Scale");
    expect(v.nextStep).toMatch(/exact match/);
  });

  it("holds between target and the cut line", () => {
    expect(mk({ acos: 44 }).verdict).toBe("Hold");
  });

  it("tells you to fix image and title when CTR < 0.3%", () => {
    expect(mk({ ctr: 0.2 }).warnings.join(" ")).toMatch(/main image and title/);
  });

  it("tells you to check price and reviews when CTR is fine but conversion < 5%", () => {
    expect(mk({ conversionRate: 3 }).warnings.join(" ")).toMatch(/price, rating, reviews/);
    expect(mk({ conversionRate: 3, clicks: 10 }).warnings.join(" ")).not.toMatch(/price, rating/);
  });

  it("merges stored thresholds with defaults", () => {
    expect(withDefaults({ marketplace: { minClicks: 50 } } as never).marketplace).toEqual({ ...DEFAULT_THRESHOLDS.marketplace, minClicks: 50 });
    expect(withDefaults(null)).toEqual(DEFAULT_THRESHOLDS);
  });
});

describe("csv import", () => {
  it("parses rupee amounts, commas and percentages", () => {
    expect(parseNumber("₹1,234.50")).toBe(1234.5);
    expect(parseNumber("Rs 600")).toBe(600);
    expect(parseNumber("12.5%")).toBe(12.5);
    expect(parseNumber("--")).toBeNull();
    expect(parseNumber("")).toBeNull();
  });

  it("maps a Meta Ads Manager export and derives hook rate and CPA", () => {
    const headers = ["Ad name", "Amount spent (INR)", "Impressions", "3-second video plays", "CTR (link click-through rate)", "Results", "Frequency"];
    const map = guessMapping(headers, META_FIELDS);
    expect(map).toMatchObject({ name: "Ad name", spend: "Amount spent (INR)", plays3s: "3-second video plays", ctr: "CTR (link click-through rate)", results: "Results" });
    const row = { "Ad name": "Chai hook", "Amount spent (INR)": "900", Impressions: "10000", "3-second video plays": "3500", "CTR (link click-through rate)": "1.9", Results: "4", Frequency: "1.4" };
    const r = rowToMetaInput(row, map, 300);
    expect(r.input).toEqual({ targetCpa: 300, spend: 900, hookRate: 35, ctr: 1.9, cpa: 225, frequency: 1.4 });
    expect(metaVerdict(r.input!).verdict).toBe("Scale");
  });

  it("maps an Amazon search-term report and converts fraction rates", () => {
    const headers = ["Customer Search Term", "Impressions", "Clicks", "Click-Thru Rate (CTR)", "Spend", "7 Day Total Sales ", "Total Advertising Cost of Sales (ACOS) ", "7 Day Total Orders (#)", "7 Day Conversion Rate"];
    const map = guessMapping(headers, MARKET_FIELDS);
    expect(map.name).toBe("Customer Search Term");
    expect(map.acos).toBe("Total Advertising Cost of Sales (ACOS) ");
    const row = { "Customer Search Term": "millet cookies", Impressions: "20000", Clicks: "80", "Click-Thru Rate (CTR)": "0.004", Spend: "800", "7 Day Total Sales ": "3200", "Total Advertising Cost of Sales (ACOS) ": "0.25", "7 Day Total Orders (#)": "8", "7 Day Conversion Rate": "0.1" };
    const r = rowToMarketplaceInput(row, map, 30);
    expect(r.input).toEqual({ targetAcos: 30, acos: 25, ctr: 0.4, conversionRate: 10, clicks: 80 });
    expect(marketplaceVerdict(r.input!).verdict).toBe("Scale");
  });

  it("reports what is missing instead of guessing", () => {
    const r = rowToMetaInput({ "Ad name": "x" }, { name: "Ad name" }, 300);
    expect(r.input).toBeNull();
    expect(r.missing).toContain("spend");
  });
});

describe("csv import: zero sales", () => {
  it("treats spend with no sales as an ACoS over any cut line", () => {
    const map = { name: "t", clicks: "c", impressions: "i", spend: "s", sales: "v" } as const;
    const r = rowToMarketplaceInput({ t: "x", c: "40", i: "5000", s: "500", v: "0" }, map, 30);
    expect(r.input?.acos).toBe(999);
    expect(marketplaceVerdict(r.input!).verdict).toBe("Cut");
  });
});
