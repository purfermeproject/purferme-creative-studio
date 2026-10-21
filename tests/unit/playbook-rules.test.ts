import { describe, expect, it } from "vitest";
import { SEED_TERMS } from "@/db/seed-data";
import { scan, type Term } from "@/lib/compliance";
import { missingTruth, validGtin } from "@/lib/product-truth";

const terms: Term[] = SEED_TERMS;
const labels = (text: string, platform: "meta" | "amazon" | "flipkart", product: string, sev: "red" | "amber") =>
  scan(text, platform, product, terms)
    .hits.filter((h) => h.severity === sev)
    .map((h) => h.label);

describe("sugar and fibre claims (playbook)", () => {
  it("blocks sugar-free and zero-sugar wording everywhere", () => {
    expect(labels("Sugar-free cookies", "amazon", "bar", "red")).toContain("Sugar-free / zero sugar");
    expect(labels("Zero sugar treat", "meta", "pbu", "red")).toContain("Sugar-free / zero sugar");
  });

  it("does not treat 'no refined sugar' as a sugar-free claim", () => {
    expect(labels("No refined sugar, sweetened with jaggery", "meta", "choc", "red")).not.toContain("Sugar-free / zero sugar");
  });

  it("blocks 'no added sugar' on jaggery products but only flags it for review elsewhere", () => {
    expect(labels("No added sugar", "flipkart", "choc", "red")).toContain("No added sugar (product has jaggery)");
    expect(labels("No added sugar", "flipkart", "pbu", "red")).not.toContain("No added sugar (product has jaggery)");
    expect(labels("No added sugar", "flipkart", "pbu", "amber")).toContain("No added sugar");
  });

  it("flags fibre claims for evidence", () => {
    expect(labels("A high-fibre breakfast", "amazon", "bfast", "amber")).toContain("High fibre / fibre-rich");
  });

  it("flags infant wording on every platform", () => {
    for (const p of ["meta", "amazon", "flipkart"] as const) {
      expect(labels("Perfect for babies 6–24 months", p, "sunrise", "red")).toContain("Infant / baby / 6–24 months");
    }
  });
});

describe("product truth", () => {
  it("checks the GTIN check digit", () => {
    expect(validGtin("4006381333931")).toBe(true);
    expect(validGtin("4006381333932")).toBe(false);
    expect(validGtin("12345")).toBe(false);
    expect(validGtin("9638 5074")).toBe(true);
  });

  it("lists what is still missing", () => {
    const missing = missingTruth({ ingredients: "Millet, oats", netQuantity: "240 g", mrp: " " });
    expect(missing).not.toContain("Ingredients");
    expect(missing).not.toContain("Net quantity");
    expect(missing).toContain("MRP");
    expect(missing).toContain("GTIN / EAN barcode");
  });
});
