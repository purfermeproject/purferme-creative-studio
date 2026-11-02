import { describe, expect, it } from "vitest";
import { mustShow, sceneSpec } from "@/lib/scene-spec";

describe("reading the team's photo descriptions", () => {
  it("draws icons instead of asking the AI for them, and keeps the people and the moment", () => {
    const s = sceneSpec("Mother in a bright kitchen reading the back of the pack, child reaching for a cookie. Three crossed-out icons (maida, palm oil, sugar) next to the box");
    expect(s.crossed).toEqual(["maida", "palm oil", "sugar"]);
    expect(s.layout).toBe("single");
    expect(s.photos[0]).toBe("Mother in a bright kitchen, child reaching for a cookie");
    expect(s.packInHands).toBe(true);
  });

  it("makes a split into two photos and a grid into up to four", () => {
    const split = sceneSpec("Split image: farmer standing in a golden foxtail millet field on the left; a hand scanning the QR on the box with a phone on the right");
    expect(split.layout).toBe("split");
    expect(split.photos).toEqual(["farmer standing in a golden foxtail millet field", "a hand holding a smartphone"]);
    const grid = sceneSpec("4-tile grid: toast, pancake stack, overnight oats jar, smoothie glass, each with the jar visible");
    expect(grid.layout).toBe("grid");
    expect(grid.photos).toEqual(["toast", "pancake stack", "overnight oats jar", "smoothie glass"]);
  });

  it("turns a small callout into an inset photo and a quoted tip into a label", () => {
    expect(sceneSpec("Young professional at an office desk at 11 am, laptop open, cookie with a cup of chai. Small callout showing millet and oat grains")).toMatchObject({
      inset: "millet and oat grains",
      photos: ["Young professional at an office desk at 11 am, laptop open, cookie with a cup of chai"],
    });
    const stir = sceneSpec("Close-up of a hand stirring the jar with a spoon, glossy natural oil visible, small “Stir & Enjoy” tip next to the jar");
    expect(stir.tip).toBe("Stir & Enjoy");
    expect(stir.photos[0]).toBe("Close-up of a hand stirring creamy spread in a plain open bowl with a spoon, glossy natural oil visible");
  });

  it("drops parts that only place the pack (the slide always shows the real one), and isn't fooled by a lunch box", () => {
    const s = sceneSpec("School-age child opening a steel lunch box with cookies inside, in a classroom or school bus; pack visible on the side");
    expect(s.photos[0]).toBe("School-age child opening a steel lunch box with cookies inside, in a classroom or school bus");
    expect(s.packInHands).toBe(false);
    expect(sceneSpec("Close-up of a cookie being snapped in half, crumbs in mid-air, pack blurred in background").photos[0]).toBe("Close-up of a cookie being snapped in half, crumbs in mid-air");
  });

  it("lists what the photo must visibly show, to check it afterwards", () => {
    expect(mustShow("Warm, golden-light shot of a grandmother and grandchild sharing cookies at the dining table, jaggery in a small bowl beside them")).toEqual([
      "golden-light shot of a grandmother and grandchild sharing cookies at the dining table",
      "jaggery in a small bowl beside them",
    ]);
  });
});

describe("the scene style from the team's examples", () => {
  it("uses an icon card for product slides and a bottom bar when a person shares the scene", async () => {
    const { slideStyle } = await import("@/lib/scene-spec");
    expect(slideStyle({ kind: "closeup", feature: "No Palm Oil | No Hydrogenated Fat | 0g Trans Fat | No Stabilisers", scene: "Close-up of a hand stirring" })).toBe("card");
    expect(slideStyle({ kind: "lifestyle", feature: "Jaggery-Sweetened | No Artificial Preservatives | Great for Tiffin", scene: "Child eating a roti roll" })).toBe("bar");
    expect(slideStyle({ kind: "closeup", feature: "a | b", scene: "4-tile grid: toast, pancakes, oats, smoothie" })).toBe("bar");
  });

  it("puts the product's real ingredients on the table as props", async () => {
    const { propsFromIngredients } = await import("@/lib/scene-spec");
    expect(propsFromIngredients("Roasted peanuts (70%), Jaggery (15%), Ragi flour, Cocoa powder (5%), Rosemary extract, Salt")).toEqual(["roasted peanuts", "jaggery", "ragi flour", "cocoa powder"]);
  });

  it("briefs the scene around the real pack, exactly as described, with room for the words", async () => {
    const { buildListingScenePrompt } = await import("@/lib/image-prompt");
    const p = buildListingScenePrompt({ description: "Child happily eating a peanut butter roti roll, parent smiling in the background", props: ["jaggery", "cocoa powder"], layout: "bar", inScene: true, productName: "Ragi & Cocoa Peanut Butter" });
    expect(p).toContain("SHOW EXACTLY THIS");
    expect(p).toContain("Child happily eating a peanut butter roti roll, parent smiling in the background");
    expect(p).toContain("exactly ONE pack");
    expect(p).toContain("Props on the table");
    expect(p).toContain("people and the action on the right half");
    expect(p).toContain("no written words, numbers, icons");
  });
});
