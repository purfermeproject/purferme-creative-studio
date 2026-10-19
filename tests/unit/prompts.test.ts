import { describe, expect, it } from "vitest";
import { SEED_BRAND, SEED_PLATFORM_RULES, SEED_PRODUCTS } from "@/db/seed-data";
import { buildCheckPrompt, buildGenerationPrompt, buildVariationsPrompt, buildWeeklyBriefPrompt, isVideoType } from "@/lib/prompts";

const choc = SEED_PRODUCTS.find((p) => p.slug === "choc")!;
const rule = (p: "meta" | "amazon" | "flipkart") => SEED_PLATFORM_RULES.find((r) => r.platform === p)!;

describe("buildGenerationPrompt", () => {
  const input = {
    n: 3,
    platform: "meta" as const,
    creativeType: "9:16 UGC-style video (15–30s)",
    angle: "Taste first",
    persona: "College student",
    language: "Hinglish",
    extra: "Diwali gifting",
  };
  const prompt = buildGenerationPrompt(SEED_BRAND, choc, rule("meta"), input);

  it("follows the section 6 structure with database content", () => {
    expect(prompt).toMatch(/^You are the creative strategist for an Indian D2C food brand\. Write 3 ad concepts\./);
    expect(prompt).toContain(SEED_BRAND.brandContext);
    expect(prompt).toContain(SEED_BRAND.hardRules);
    expect(prompt).toContain("PRODUCT: Chocolate Cookies, millet & oats, 240g.");
    expect(prompt).toContain(`GREEN CLAIMS (allowed): ${choc.greenClaims.join("; ")}`);
    expect(prompt).toContain(`RED CLAIMS (never use): ${choc.redClaims.join("; ")}`);
    expect(prompt).toContain("PLATFORM: Meta. CREATIVE TYPE: 9:16 UGC-style video (15–30s).");
    expect(prompt).toContain(rule("meta").rules);
    expect(prompt).toContain("angle = Taste first; persona = College student; language = Hinglish");
    expect(prompt).toContain("Extra direction: Diwali gifting");
    expect(prompt).toContain("Never include a red claim.");
  });

  it("asks for timed frames for video and single frames for images", () => {
    expect(prompt).toContain("4–7 frames with timestamps");
    const img = buildGenerationPrompt(SEED_BRAND, choc, rule("amazon"), { ...input, platform: "amazon", creativeType: "Listing image stack (7 images)" });
    expect(img).toContain("This is an image/banner type");
    expect(img).toContain("Never mention Amazon");
  });

  it("uses Amazon rules when the platform is Amazon", () => {
    const p = buildGenerationPrompt(SEED_BRAND, choc, rule("amazon"), { ...input, platform: "amazon", creativeType: "Sponsored Brands video (16:9, muted)" });
    expect(p).toContain("autoplays muted, so on-screen text carries every message");
    expect(p).not.toContain(rule("meta").rules);
  });

  it("mentions the pack image only when one is attached", () => {
    expect(prompt).not.toContain("photo of the real pack is attached");
    expect(buildGenerationPrompt(SEED_BRAND, choc, rule("meta"), { ...input, hasPackImage: true })).toContain("photo of the real pack is attached");
  });

  it("detects video types", () => {
    expect(isVideoType("Sponsored Brands video (16:9, muted)")).toBe(true);
    expect(isVideoType("Carousel (3–5 cards)")).toBe(false);
  });
});

describe("other prompt builders", () => {
  it("variations name the two other platforms", () => {
    const p = buildVariationsPrompt(SEED_BRAND, choc, rule("meta"), { platform: "meta", creativeType: "Carousel (3–5 cards)", concept: { title: "Winner" } });
    expect(p).toContain("adapted for Amazon");
    expect(p).toContain("adapted for Flipkart");
    expect(p).toContain('"title": "Winner"');
  });

  it("check prompt names the regulations and includes the copy and product claims", () => {
    const { system, user } = buildCheckPrompt(SEED_BRAND, choc, rule("flipkart"), "flipkart", "gluten free!");
    expect(system).toContain("FSSAI (Advertising & Claims) Regulations 2018");
    expect(system).toContain("ASCI");
    expect(system).toContain("IMS");
    expect(user).toContain("gluten free!");
    expect(user).toContain("RED CLAIMS (never): Gluten free");
    expect(user).toContain("PLATFORM: Flipkart");
  });

  it("weekly brief includes the data", () => {
    expect(buildWeeklyBriefPrompt(SEED_BRAND, [{ verdict: "Scale" }])).toContain('"verdict": "Scale"');
  });
});

describe("auto angle and persona", () => {
  it("lets the model choose from the brand lists and asks for variety", () => {
    const p = buildGenerationPrompt(SEED_BRAND, choc, rule("meta"), {
      n: 3,
      platform: "meta",
      creativeType: "9:16 UGC-style video (15–30s)",
      angle: "auto",
      persona: "auto",
      language: "English",
    });
    expect(p).toContain("angle = your choice: pick the strongest for this product and platform from Taste first;");
    expect(p).toContain("persona = your choice: pick the best fits from Working professional");
    expect(p).toContain("Give each concept a different angle or persona");
    expect(p).not.toContain("Use the chosen angle and persona for the first concept");
  });
});

describe("creative quality inputs", () => {
  const base = {
    n: 3,
    platform: "meta" as const,
    creativeType: "9:16 UGC-style video (15–30s)",
    angle: "auto",
    persona: "auto",
    language: "English",
  };

  it("always includes the quality bar, hook mechanisms and the competitor check", () => {
    const p = buildGenerationPrompt(SEED_BRAND, choc, rule("meta"), base);
    expect(p).toContain("QUALITY BAR");
    expect(p).toContain("label-reading challenge");
    expect(p).toContain("could a competitor run this by swapping the logo?");
  });

  it("adds product story, example ads, avoided phrases and the team's reference when given", () => {
    const p = buildGenerationPrompt(
      { ...SEED_BRAND, exampleAds: "EXAMPLE: 4:30 meeting hook", avoidPhrases: "indulge\nelevate, game-changer" },
      { ...choc, story: "Snaps cleanly, goes crumbly in chai." },
      rule("meta"),
      { ...base, inspiration: "A Swiggy-style ad that lists 3 desk snacks" },
    );
    expect(p).toContain("PRODUCT STORY");
    expect(p).toContain("Snaps cleanly, goes crumbly in chai.");
    expect(p).toContain("ADS WE LIKE");
    expect(p).toContain("EXAMPLE: 4:30 meeting hook");
    expect(p).toContain("Never use these overused phrases (or close variants): indulge; elevate; game-changer.");
    expect(p).toContain("REFERENCE THE TEAM WANTS TO RIFF ON");
    expect(p).toContain("A Swiggy-style ad that lists 3 desk snacks");
  });

  it("leaves optional sections out when empty", () => {
    const p = buildGenerationPrompt({ ...SEED_BRAND, exampleAds: "", avoidPhrases: "" }, { ...choc, story: "" }, rule("meta"), base);
    expect(p).not.toContain("PRODUCT STORY");
    expect(p).not.toContain("ADS WE LIKE");
    expect(p).not.toContain("overused phrases");
    expect(p).not.toContain("REFERENCE THE TEAM");
  });
});
