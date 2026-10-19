import type { Concept, DeepCheck, DesignRead, Proposal, WeeklyBrief } from "./schemas";
import { isVideoType, type GenerationInput } from "./prompts";
import type { ScanResult } from "./compliance";

/** Canned responses for ANTHROPIC_MOCK=true (tests, demos without an API key). */
export function mockConcepts(input: GenerationInput, productName: string, greenClaims: string[]): Concept[] {
  const video = isVideoType(input.creativeType);
  const pick = (v: string, fallback: string) => (v === "auto" ? fallback : v);
  const personas = [pick(input.persona, "Working professional 25–35, city"), "College student", "Couple sharing breakfast", "Picky grandparent"];
  const angles = [pick(input.angle, "Taste first"), "Coffee/chai ritual", "Ingredient % transparency", "Tiffin and lunchbox"];
  const claim = greenClaims[0] ?? "Made with millets";
  return Array.from({ length: input.n }, (_, i) => ({
    title: `${angles[i]} · ${personas[i]}`,
    persona: personas[i],
    angle: angles[i],
    format: input.placement ? `${input.creativeType} · ${input.placement.label}` : input.creativeType,
    language: i === 2 ? "Hinglish" : input.language,
    hook: i === 0 ? "3pm called. It wants chai." : `Concept ${i + 1}: the ${angles[i].toLowerCase()} moment`,
    frames: video
      ? [
          { slot: "0–2s", visual: `Close-up: ${productName} pack on a desk next to a steaming cup`, onscreen: "3pm called.", audio: "Kettle clicks off" },
          { slot: "2–6s", visual: "Hand breaks a cookie, crumbs fall", onscreen: claim, audio: "Crunch" },
          { slot: "6–12s", visual: "Dunk in chai, slow motion", onscreen: "No maida. Sweetened with jaggery.", audio: "Light music" },
          { slot: "12–18s", visual: "Pack front, logo visible", onscreen: "Made for real days. Shop now", audio: "VO: Made for real days." },
        ]
      : [
          { slot: "Image 1", visual: `${productName} pack on warm wooden table`, onscreen: claim },
          { slot: "Image 2", visual: "Ingredient % card", onscreen: "See every ingredient %" },
        ],
    copy: {
      headline: "Your chai's new crunch-mate",
      body: `Crunchy, chocolatey and ${claim.toLowerCase()}. Made for real days.`,
      // Echo the extra direction so tests can inject copy (e.g. a red term) into a concept.
      body_alt: input.extra?.trim() ? input.extra.trim() : "Every ingredient % on our website. Scan the QR to see where it came from.",
      cta: "Shop now",
    },
    ai_prompt: `Photoreal close-up of the ${productName} pack (match the attached reference exactly) beside a cup of masala chai, soft window light.`,
    needs_real_person: i === 0,
    ai_label_needed: false,
    claims: [{ text: claim, tier: "green" as const }],
    why_it_fits:
      input.platform === "meta"
        ? "Stops the scroll with a relatable moment in the first two seconds."
        : "Shows the exact pack immediately and carries every message in on-screen text.",
  }));
}

export function mockDeepCheck(text: string, scan: ScanResult): DeepCheck {
  const reds = scan.hits.filter((h) => h.severity === "red");
  const ambers = scan.hits.filter((h) => h.severity === "amber");
  let rewrite = text;
  for (const h of reds) for (const m of h.matches) rewrite = rewrite.replace(new RegExp(m.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), "").replace(/\s{2,}/g, " ");
  return {
    verdict: reds.length ? "fix" : "pass",
    issues: [...reds, ...ambers].map((h) => ({
      quote: h.matches[0],
      problem: h.severity === "red" ? `"${h.label}" is not an allowed claim.` : `"${h.label}" needs evidence on file.`,
      rule: h.severity === "red" ? "Brand hard rules; FSSAI Advertising & Claims Regulations 2018" : "FSSAI nutrient-claim thresholds",
      fix: h.severity === "red" ? "Remove it or replace with a green claim." : "Keep only if the evidence is on file; otherwise remove.",
    })),
    rewrite: rewrite.trim(),
  };
}

export function mockWeeklyBrief(): WeeklyBrief {
  return {
    winners: [{ name: "Example winner", why: "Mock mode: hook rate 34%, CPA under target." }],
    losers: [{ name: "Example loser", why: "Mock mode: hook rate 14%." }],
    patterns: ["Coffee/chai ritual angle", "Working professional persona", "Text-led hook in first 2s"],
    search_terms: [{ term: "millet cookies", note: "Move to exact match; reuse 'millet cookies' in Meta hooks." }],
    next_concepts: Array.from({ length: 5 }, (_, i) => ({
      title: `Mock concept ${i + 1}`,
      platform: ["Meta", "Meta", "Amazon", "Flipkart", "Meta"][i],
      angle: "Coffee/chai ritual",
      persona: "Working professional 25–35, city",
      format: "9:16 UGC-style video (15–30s)",
      hook: "3pm called. It wants chai.",
    })),
    summary: "Mock mode is on (ANTHROPIC_MOCK=true), so this brief is placeholder text.",
  };
}

export function mockDesignRead(): DesignRead {
  return {
    text: "Millet cookies\nGluten free crunch\nNo maida. Sweetened with jaggery.\nShop now",
    people_visible: false,
    people_note: "",
    logo_visible: true,
    pack_visible: true,
    looks_ai_generated: false,
    ai_label_visible: false,
    notes: ["Mock mode: sample reading, not your real image."],
  };
}

/** Canned proposals for mock mode. Clearly sample text: the UI labels mock output. */
export function mockProposals(input: GenerationInput, greenClaims: string[]): Proposal[] {
  const claim = greenClaims[0] ?? "Made with millets";
  const pick = (v: string, fallback: string) => (v === "auto" ? fallback : v);
  const rows = [
    { title: "The 4:30 slump", angle: pick(input.angle, "Coffee/chai ritual"), persona: pick(input.persona, "Working professional 25–35, city"), hook: "3pm called. It wants chai.", mech: "POV / first-person moment" },
    { title: "Flip the pack", angle: "Ingredient % transparency", persona: "Parent of kids 4–12", hook: "I read the back first. Every time.", mech: "label-reading challenge (flip the pack, read it out)" },
    { title: "Tiffin trade", angle: "Tiffin and lunchbox", persona: "College student", hook: "Nobody trades for these. I checked.", mech: "mini-story with a twist" },
    { title: "Crunch test", angle: "Taste first", persona: "Couple sharing breakfast", hook: "Listen.", mech: "ASMR / crunch close-up demo" },
  ];
  return rows.slice(0, input.n).map((r) => ({
    title: r.title,
    angle: r.angle,
    persona: r.persona,
    big_idea: `Sample proposal (mock mode): ${r.title.toLowerCase()} moment, proof point “${claim}”.`,
    hook: r.hook,
    format: input.placement ? `${input.creativeType} · ${input.placement.label}` : input.creativeType,
    hook_mechanism: r.mech,
    claims: [{ text: claim, tier: "green" as const }],
    why: "Sample text from mock mode; switch mock mode off for real proposals.",
  }));
}

/** Mock develop: one concept shaped by the chosen proposal and deliverable. */
export function mockDeveloped(input: GenerationInput, proposal: Proposal, productName: string, greenClaims: string[]): Concept {
  const [base] = mockConcepts({ ...input, n: 1, angle: proposal.angle, persona: proposal.persona }, productName, greenClaims);
  const c: Concept = { ...base, title: proposal.title, hook: proposal.hook, angle: proposal.angle, persona: proposal.persona };
  if (input.deliverable === "ugc") {
    return {
      ...c,
      needs_real_person: true,
      frames: [
        { slot: "0–3s", visual: "Creator to camera at a desk, holding the pack up next to their face", onscreen: proposal.hook, audio: proposal.hook },
        { slot: "3–8s", visual: "Flips the pack, points at the ingredient list", onscreen: greenClaims[0] ?? "", audio: "Okay but look at this." },
        { slot: "8–15s", visual: "Dunks one in chai, bites, reacts", onscreen: "No maida. Sweetened with jaggery.", audio: "That crunch though." },
        { slot: "15–20s", visual: "Pack on desk, creator points to it", onscreen: "Made for real days.", audio: "Link's right there." },
      ],
      copy: { ...c.copy, body_alt: "Creator brief (sample): 25–35, home-office setting, casual wear. Show the real pack. Don't describe health results." },
    };
  }
  if (input.deliverable === "copy") {
    return {
      ...c,
      frames: [c.frames[0]],
      copy: {
        ...c.copy,
        variants: [
          { headline: "Read the back first", body: "Foxtail millet, rolled oats, jaggery. Every % on our site.", cta: "Learn more" },
          { headline: "Chai's crunch-mate", body: "4:30pm, cutting chai, one cookie. Okay, two.", cta: "Shop now" },
          { headline: "No maida. Still a cookie.", body: "Sweetened with jaggery, made with millet and oats.", cta: "Shop now" },
          { headline: "Scan the QR", body: "See where the millet in your cookie grew.", cta: "Learn more" },
        ],
      },
    };
  }
  return c;
}
