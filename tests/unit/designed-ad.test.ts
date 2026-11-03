import { describe, expect, it } from "vitest";
import { buildDesignedPrompt, calloutFor, compareDesignText, designWords, specFromSlide } from "@/lib/designed-ad";

const opts = { productName: "Millets & Oats Breakfast Cookies", brandName: "Puŕ Fermé", primary: "#4a1942", accent: "#e8a317", w: 2000, h: 2000, forWhat: "Amazon listing" , props: ["almonds", "oats"] };

describe("callouts", () => {
  it("crosses out 'No …' callouts and picks a matching icon", () => {
    expect(calloutFor("No Maida")).toEqual({ label: "No Maida", icon: "a small heap of white flour", crossed: true });
    expect(calloutFor("Zero White Sugar").crossed).toBe(true);
    expect(calloutFor("Almonds, Cashews")).toMatchObject({ icon: "two almonds", crossed: false });
  });
});

describe("specFromSlide", () => {
  it("turns a feature slide into callouts and a comparison slide into a table", () => {
    const f = specFromSlide({ header: "Only Good Stuff Inside", sub: "No maida, no palm oil, no white sugar.", feature: "No Maida | No Palm Oil | No White Sugar", scene: "a mother hugging her son in a sunlit kitchen", kind: "feature" });
    expect(f.layout).toBe("callouts-left");
    expect(f.callouts.map((c) => c.crossed)).toEqual([true, true, true]);
    const c = specFromSlide({ header: "Better Than Regular Biscuits", sub: "See why families are switching.", feature: "", scene: "kitchen table", kind: "comparison", comparison: { us: "PurFerme", them: "Regular Biscuit", rows: [{ label: "Maida", us: "No", them: "Yes" }] } });
    expect(c.layout).toBe("comparison");
    expect(designWords(c)).toEqual(["Better Than Regular Biscuits", "See why families are switching.", "PurFerme", "Regular Biscuit", "Maida", "No", "Yes"]);
  });
});

describe("designed prompt", () => {
  it("lists every word exactly, forbids others, and keeps one real pack", () => {
    const spec = specFromSlide({ header: "Real Nuts, Real Crunch", sub: "Almonds and cashews in every bite.", feature: "Almonds, Cashews | Cocoa | Cardamom | Cinnamon", scene: "a warm kitchen table", kind: "feature" });
    const p = buildDesignedPrompt(spec, { ...opts, views: ["front", "angle"] });
    expect(p).toContain("“Real Nuts, Real Crunch”");
    expect(p).toContain("“Cardamom”, icon: two green cardamom pods");
    expect(p).toContain("NO other words anywhere");
    expect(p).toContain("exactly ONE pack");
    expect(p).toContain("photo 1 = front, photo 2 = angle");
    expect(spec.layout).toBe("callouts-both");
  });
});

describe("reading the words back", () => {
  const want = ["Sweet The Natural Way", "Sweetened with jaggery, just like grandma's recipe.", "Sweetened with Jaggery", "Zero White Sugar"];
  it("passes when every word is there", () => {
    expect(compareDesignText(want, ["Sweet The Natural Way", "Sweetened with jaggery, just like grandma’s recipe.", "Sweetened with Jaggery", "Zero White Sugar"])).toEqual([]);
  });
  it("finds misspelled, missing, repeated and added words", () => {
    const p = compareDesignText(["Only Good Stuff Inside", "No Maida", "No Palm Oil", "Millets"], ["Only Good Stuf Inside", "No Maida", "Millets", "Millets", "100% Organic Certified"]);
    expect(p).toContain("“Only Good Stuff Inside” is misspelled as “only good stuf inside”");
    expect(p).toContain("“No Palm Oil” is missing");
    expect(p).toContain("“Millets” appears 2 times");
    expect(p.some((x) => x.startsWith("extra text") && x.includes("organic"))).toBe(true);
  });
});

import { pickSetting } from "@/lib/designed-ad";

describe("every image gets its own setting and feeling", () => {
  const slides = [
    { header: "Sweet The Natural Way", sub: "Sweetened with jaggery, just like grandma's recipe.", feature: "Sweetened with Jaggery | Zero White Sugar", scene: "a grandmother and granddaughter", kind: "feature" },
    { header: "Meet Your Farmer", sub: "Scan the pack and see where it grew.", feature: "Seed-to-Fork Traceability", scene: "a smiling farmer in his field", kind: "feature" },
    { header: "Real Nuts, Real Crunch", sub: "Almonds and cashews in every bite.", feature: "Almonds, Cashews | Cocoa | Cardamom | Cinnamon", scene: "ingredients close up", kind: "feature" },
    { header: "Only Good Stuff Inside", sub: "No maida, no palm oil, no white sugar.", feature: "No Maida | No Palm Oil | No White Sugar", scene: "a mother hugging her son in the kitchen", kind: "feature" },
    { header: "Tiffin Approved", sub: "Kids actually finish it.", feature: "Millets | Oats", scene: "a boy opening his tiffin", kind: "feature" },
  ];
  it("never repeats a setting within a stack, and matches the story", () => {
    const used: string[] = [];
    const specs = slides.map((s) => {
      const d = specFromSlide(s, used);
      used.push(d.setting.key);
      return d;
    });
    expect(new Set(used).size).toBe(slides.length);
    expect(specs[0].setting.key).toBe("grandma-kitchen");
    expect(specs[1].setting.key).toBe("farm");
    expect(specs[2].setting.key).toBe("studio-nuts");
  });
  it("puts the setting and emotion in the prompt instead of one fixed background", () => {
    const d = specFromSlide(slides[1]);
    const p = buildDesignedPrompt(d, opts);
    expect(p).toContain(`SETTING (this image's own world`);
    expect(p).toContain(d.setting.place);
    expect(p).toContain(`EMOTION: ${d.setting.mood}`);
    expect(p).not.toContain("Warm golden morning light");
  });
  it("spreads unrelated images across settings", () => {
    const keys = new Set([0, 1, 2, 3, 4].map((i) => pickSetting("something unrelated", "", [], i).key));
    expect(keys.size).toBe(5);
  });
});

describe("the team's description wins", () => {
  it("uses the office the description names, even on a millet product slide", () => {
    const d = specFromSlide({
      header: "Stay Full For Longer",
      sub: "Millets and oats keep hunger away till lunch",
      feature: "High Fibre – 9g per 100g | Foxtail Millet + Rolled Oats",
      scene: "Young professional at an office desk at 11 am, laptop open, cookie with a cup of chai. Small callout showing millet and oat grains",
      kind: "person",
    }, ["office"]);
    expect(d.setting.key).toBe("office");
  });
  it("keeps a described place the library doesn't know", () => {
    const d = specFromSlide({ header: "Snack On The Go", sub: "", feature: "Millets", scene: "a woman on a Mumbai local train, morning rush", kind: "person" });
    expect(d.setting.place).toBe("exactly the place the description says");
  });
  it("doesn't read 'cardamom' as a car", () => {
    expect(pickSetting("cardamom pods on a plate").key).not.toBe("picnic");
  });
  it("uses the theme only when the description names no place", () => {
    expect(pickSetting("a happy face", "Meet your farmer").key).toBe("farm");
    expect(pickSetting("a happy face", "Stay full with millets").key).not.toBe("farm");
  });
});
