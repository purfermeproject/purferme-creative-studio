import { describe, expect, it } from "vitest";
import { focusLine, productFocus, withoutRepeats } from "@/lib/product-focus";

describe("product focus", () => {
  it("cookies market fibre and carbs, with chai or coffee, after the team's own priorities", () => {
    const f = productFocus({ name: "Breakfast Cookies, millet & oats, 240g", messagingPriorities: ["Your morning coffee's crunch-mate"] });
    expect(f.messages[0]).toBe("Your morning coffee's crunch-mate");
    expect(f.messages).toEqual(expect.arrayContaining(["fibre from millets and oats", "complex carbs for slow, steady energy"]));
    expect(focusLine(f)).toContain("Show it with a cup of chai or a cup of coffee");
    expect(f.usage).toContain("With peanut butter");
  });
});

describe("no repeating", () => {
  it("drops callouts that say what the sub-line already says, and fills from spares", () => {
    const r = withoutRepeats("Stay Full For Longer", "Millets and oats keep hunger away till lunch", ["High Fibre – 9g per 100g", "Foxtail Millet + Rolled Oats"], ["Complex carbs", "Sweetened with jaggery"]);
    expect(r.dropped).toEqual(["Foxtail Millet + Rolled Oats"]);
    expect(r.kept).toEqual(["High Fibre – 9g per 100g", "Complex carbs"]);
  });
  it("doesn't let two callouts repeat each other either", () => {
    const r = withoutRepeats("Only Good Stuff", "Baked the honest way", ["No Maida", "0% Maida", "No Palm Oil"]);
    expect(r.kept).toEqual(["No Maida", "No Palm Oil"]);
  });
});
