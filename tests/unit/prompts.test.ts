import { describe, expect, it } from "vitest";
import { SEED_BRAND, SEED_PLATFORM_RULES, SEED_PRODUCTS } from "@/db/seed-data";
import { buildCheckPrompt, buildCompetitorPrompt, buildDevelopPrompt, buildGenerationPrompt, buildVariationsPrompt, buildWeeklyBriefPrompt, isVideoType } from "@/lib/prompts";

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

describe("placement", () => {
  it("adds placement-specific guidance for known placements", async () => {
    const { findPlacement } = await import("@/lib/placements");
    const stories = findPlacement("meta", "Instagram Stories")!;
    expect(stories.specId).toBe("meta-916");
    const p = buildGenerationPrompt(SEED_BRAND, choc, rule("meta"), {
      n: 2, platform: "meta", creativeType: "Static image ad (4:5)", angle: "auto", persona: "auto", language: "English",
      placement: { label: stories.label, guidance: stories.guidance },
    });
    expect(p).toContain("PLACEMENT: Instagram Stories.");
    expect(p).toContain("1–3 cards of about 5 seconds each");
    expect(findPlacement("meta", "ig-carousel")?.specId).toBe("meta-11");
    expect(findPlacement("amazon", "Instagram Stories")).toBeNull();
  });
  it("handles a custom placement without guidance", () => {
    const p = buildGenerationPrompt(SEED_BRAND, choc, rule("meta"), {
      n: 2, platform: "meta", creativeType: "x", angle: "auto", persona: "auto", language: "English",
      placement: { label: "WhatsApp Status", guidance: "" },
    });
    expect(p).toContain("PLACEMENT: WhatsApp Status. Design natively for this placement");
  });
});

describe("workspace prompts", () => {
  const p0 = { n: 3, platform: "meta" as const, creativeType: "Static image ad (4:5)", angle: "auto", persona: "auto", language: "English" };
  const product = { ...choc, ingredients: "Foxtail millet, oats, jaggery", messagingPriorities: ["Taste first"], claimEvidence: [{ claim: "Fibre", evidence: "4 g" }] };
  it("proposals ask for short directions, not full ads, and include the objective and product knowledge", () => {
    const p = buildGenerationPrompt(SEED_BRAND, product, rule("meta"), { ...p0, output: "proposals", objective: "conversion" });
    expect(p).toContain("Propose 3 distinct creative directions");
    expect(p).toContain("CAMPAIGN OBJECTIVE: Conversion.");
    expect(p).toContain("INGREDIENTS: Foxtail millet, oats, jaggery");
    expect(p).toContain("MESSAGING PRIORITIES (lead with these, in order): Taste first");
    expect(p).toContain("EVIDENCE ON FILE FOR AMBER CLAIMS: Fibre: 4 g");
    expect(p).toContain("Return exactly 3 proposals.");
    expect(p).not.toContain("List every claim used with its tier.");
  });
  it("develop keeps the chosen direction and adds deliverable rules", () => {
    const proposal = { title: "Flip the pack", angle: "Ingredient %", persona: "Parent", big_idea: "Read the back", hook: "I read the back first.", format: "Reel" };
    const ugc = buildDevelopPrompt(SEED_BRAND, product, rule("meta"), { ...p0, deliverable: "ugc", proposal });
    expect(ugc).toContain("Write 1 ad concepts.");
    expect(ugc).toContain("angle = Ingredient %; persona = Parent");
    expect(ugc).toContain("DELIVERABLE: UGC creator script");
    expect(ugc).toContain('"hook":"I read the back first."');
    const copy = buildDevelopPrompt(SEED_BRAND, product, rule("meta"), { ...p0, deliverable: "copy", proposal });
    expect(copy).toContain("copy.variants");
    expect(copy).toContain("first 125 characters");
  });
});

describe("competitor prompts", () => {
  it("competitor analysis rates their claims and gives counter-ideas within our green claims", () => {
    const p = buildCompetitorPrompt(SEED_BRAND, [choc], { brand: "Crunchy Co", product: "Cookies", channel: "Instagram", adText: "The healthy cookie!", notes: "", hasImage: true });
    expect(p).toContain("Crunchy Co");
    expect(p).toContain("The healthy cookie!");
    expect(p).toContain("Screenshots of their ad(s) are attached");
    expect(p).toContain(`- ${choc.name}: ${choc.greenClaims.join("; ")}`);
    expect(p).toContain("never naming or knocking them");
  });
  it("briefs with a competitor stand apart without naming or comparing", () => {
    const p = buildGenerationPrompt(SEED_BRAND, choc, rule("meta"), {
      n: 3, platform: "meta", creativeType: "Static image ad (4:5)", angle: "auto", persona: "auto", language: "English", output: "proposals",
      competitor: { brand: "Crunchy Co", summary: "Health-led pack shot.", hook: "The healthy cookie", angle: "Health halo", claims: ["Healthy"], whiteSpace: ["Chai moment"] },
    });
    expect(p).toContain("COMPETITOR TO STAND APART FROM");
    expect(p).toContain("White space they leave open: Chai moment");
    expect(p).toContain("Never name, show, imitate or disparage the competitor");
    expect(p).toContain("no claim we don't hold just because they make it");
  });
});
