import { describe, expect, it } from "vitest";
import { ingredientItems, PANEL_VIEW, STANDARD_STACK, standardSlides, toStandardStack } from "@/lib/listing-plan";
import { productFocus } from "@/lib/product-focus";

const product = { name: "Breakfast Cookies, millet & oats, 240g", greenClaims: ["0% Maida", "No refined sugar", "No palm oil", "Made with foxtail millet"], ingredients: "Foxtail millet (23.8%), Rolled oats (16.4%), Jaggery, Butter, Almonds (3%, chopped, roasted), Cashews" };

describe("the standard stack", () => {
  const defaults = standardSlides(product, productFocus(product));
  it("is the 8 slides after the main image, in the team's order", () => {
    expect(defaults.map((s) => s.kind)).toEqual(["hero3d", "side-left", "side-right", "back", "nutrition", "ingredients", "usage", "comparison"]);
    expect(STANDARD_STACK).toHaveLength(8);
  });
  it("compares ours with an unbranded generic version, only on true rows", () => {
    const c = defaults[7].comparison!;
    expect(c.us).toBe("Puŕ Fermé");
    expect(c.them).toBe("Regular biscuits");
    expect(c.rows.map((r) => r.label)).toEqual(["Maida", "Refined sugar", "Palm oil", "Millets"]);
  });
  it("shows cookies with chai, coffee and peanut butter, and markets fibre and carbs", () => {
    expect(defaults[6].feature).toContain("With chai");
    expect(defaults[6].feature).toContain("With peanut butter");
    expect(defaults[4].feature).toBe("High Fibre | Complex Carbs");
  });
  it("puts any plan in order, filling gaps with the defaults", () => {
    const ai = [{ ...defaults[7], header: "AI comparison" }, { ...defaults[0], header: "AI hero" }];
    const out = toStandardStack({ slides: ai }, defaults);
    expect(out[0].header).toBe("AI hero");
    expect(out[7].header).toBe("AI comparison");
    expect(out[1]).toBe(defaults[1]);
  });
  it("knows which real photo each panel slide needs", () => {
    expect(PANEL_VIEW["side-left"]).toEqual(["left side"]);
    expect(PANEL_VIEW.nutrition).toEqual(["nutrition panel", "back"]);
    expect(PANEL_VIEW.usage).toBeUndefined();
  });
});

describe("ingredient list", () => {
  it("splits on commas outside brackets and keeps percentages", () => {
    expect(ingredientItems(product.ingredients)).toEqual(["Foxtail millet (23.8%)", "Rolled oats (16.4%)", "Jaggery", "Butter", "Almonds (3%, chopped, roasted)", "Cashews"]);
  });
});
