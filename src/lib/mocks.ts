import type { Concept, DeepCheck, WeeklyBrief } from "./schemas";
import { isVideoType, type GenerationInput } from "./prompts";
import type { ScanResult } from "./compliance";

/** Canned responses for ANTHROPIC_MOCK=true (tests, demos without an API key). */
export function mockConcepts(input: GenerationInput, productName: string, greenClaims: string[]): Concept[] {
  const video = isVideoType(input.creativeType);
  const personas = [input.persona, "College student", "Couple sharing breakfast", "Picky grandparent"];
  const angles = [input.angle, "Coffee/chai ritual", "Ingredient % transparency", "Tiffin and lunchbox"];
  const claim = greenClaims[0] ?? "Made with millets";
  return Array.from({ length: input.n }, (_, i) => ({
    title: `${angles[i]} · ${personas[i]}`,
    persona: personas[i],
    angle: angles[i],
    format: input.creativeType,
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
