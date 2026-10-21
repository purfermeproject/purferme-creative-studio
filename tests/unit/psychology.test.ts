import { describe, expect, it } from "vitest";
import { SEED_BRAND, SEED_PLATFORM_RULES, SEED_PRODUCTS, SEED_TERMS } from "@/db/seed-data";
import { scan, type Term } from "@/lib/compliance";
import { buildImagePrompt } from "@/lib/image-prompt";
import { buildGenerationPrompt } from "@/lib/prompts";
import { AWARENESS, LEVERS, MINDSET, psychologyBlock } from "@/lib/psychology";
import { OBJECTIVES } from "@/lib/types";
import { attentionIssues, type ValidatableConcept } from "@/lib/validation";

const choc = SEED_PRODUCTS.find((p) => p.slug === "choc")!;
const rule = (p: "meta" | "amazon" | "flipkart") => SEED_PLATFORM_RULES.find((r) => r.platform === p)!;
const ids = (c: ValidatableConcept, p: "meta" | "amazon" | "flipkart" = "meta") => attentionIssues(c, p).map((i) => i.id);

const video: ValidatableConcept = {
  title: "Chai slump",
  hook: "4:30pm. Laptop. Cutting chai.",
  frames: [
    { slot: "0–2s", visual: "Hand dunks a cookie into cutting chai at a desk", onscreen: "4:30pm. Laptop. Cutting chai." },
    { slot: "2–6s", visual: "Pack stands by the laptop", onscreen: "No maida." },
  ],
  copy: { headline: "Chai's crunch-mate", body: "One cookie. Okay, two.", cta: "Shop now" },
  claims: [{ text: "No maida", tier: "green" }],
  ai_prompt: "",
  needs_real_person: false,
  ai_label_needed: false,
};

describe("platform psychology in the brief", () => {
  it("covers every platform and objective", () => {
    for (const p of ["meta", "amazon", "flipkart"] as const) expect(MINDSET[p].job.length).toBeGreaterThan(2);
    for (const o of OBJECTIVES) expect(AWARENESS[o.id].lead).toBeTruthy();
  });

  it("tells the model how the viewer meets the ad, where they are, and the ethical limits", () => {
    const meta = buildGenerationPrompt(SEED_BRAND, choc, rule("meta"), {
      n: 3, platform: "meta", creativeType: "9:16 UGC-style video (15–30s)", angle: "auto", persona: "auto", language: "English", objective: "awareness", output: "proposals",
    });
    expect(meta).toContain("Scrolling, not shopping");
    expect(meta).toContain(AWARENESS.awareness.stage);
    expect(meta).toContain("use a different lever for each proposal");
    expect(meta).toContain("No fake urgency or scarcity");
    const amazon = psychologyBlock("amazon", "conversion", false);
    expect(amazon).toContain("Win the thumbnail");
    expect(amazon).toContain("name it in why_it_fits");
    for (const l of LEVERS) expect(amazon).toContain(l.label);
  });

  it("asks images to earn attention, except the plain main listing image", () => {
    const concept = { ...video, ai_prompt: "desk", frames: [{ slot: "1", visual: "Desk at 4:30pm", onscreen: "Chai time" }] };
    const base = { concept, frameIndex: 0, creativeType: "Feed image", productName: "Chocolate Cookies" } as const;
    expect(buildImagePrompt({ ...base, platform: "meta" })).toContain("stop a fast scroll");
    expect(buildImagePrompt({ ...base, platform: "flipkart" })).toContain("small thumbnail");
    expect(buildImagePrompt({ ...base, platform: "amazon", creativeType: "Listing image stack (7 images)" })).not.toContain("Attention:");
  });
});

describe("attention checks", () => {
  it("passes a native, specific, sound-off-ready video", () => {
    expect(ids(video)).toEqual([]);
  });

  it("flags ad-speak hooks", () => {
    expect(ids({ ...video, hook: "Introducing our new millet cookies" })).toContain("attn:ad-speak");
    expect(ids({ ...video, hook: "Looking for a healthy snack?" })).toContain("attn:ad-speak");
  });

  it("flags a silent first scene and a late product", () => {
    const silent = { ...video, frames: [{ slot: "0–2s", visual: "Tired face lit by a laptop", onscreen: "" }, { slot: "2–6s", visual: "Office window at dusk", onscreen: "Long day." }] };
    expect(ids(silent)).toEqual(expect.arrayContaining(["attn:sound-off", "attn:product-late"]));
  });

  it("flags claim overload and text-heavy images", () => {
    const claims = ["No maida", "Jaggery", "Millet", "Oats"].map((text) => ({ text, tier: "green" as const }));
    expect(ids({ ...video, claims })).toContain("attn:claims");
    const image = { ...video, frames: [{ visual: "Pack on white", onscreen: "Made with foxtail millet and rolled oats, sweetened only with jaggery, and no maida at all" }] };
    expect(ids(image, "flipkart")).toContain("attn:busy");
  });
});

describe("persuasion we never fake", () => {
  const terms: Term[] = SEED_TERMS;
  const hits = (t: string) => scan(t, "meta", "choc", terms).hits.map((h) => `${h.severity}:${h.label}`);
  it("blocks fear and shame, and asks for proof of urgency and popularity", () => {
    expect(hits("Are you a bad mom for packing biscuits?")).toContain("red:Fear or shame framing");
    expect(hits("Hurry, only 3 left!")).toContain("amber:Urgency / scarcity (only if real)");
    expect(hits("Our bestselling cookie")).toContain("amber:Popularity claim (needs real numbers)");
  });
});
