import type { Platform } from "./types";
import { PLATFORM_LABELS } from "./types";

type BrandLike = { brandContext: string; hardRules: string; tone?: string; angles?: string[]; personas?: string[] };
type ProductLike = {
  slug: string;
  name: string;
  priceText: string;
  greenClaims: string[];
  amberClaims: string[];
  redClaims: string[];
  notes: string;
  allergens?: string;
};
type RuleLike = { rules: string };

const list = (items: string[]) => (items.length ? items.join("; ") : "(none)");

export type GenerationInput = {
  n: number;
  platform: Platform;
  creativeType: string;
  angle: string;
  persona: string;
  language: string;
  extra?: string;
  hasPackImage?: boolean;
};

/** Angle/persona value meaning "let the model choose a varied mix". */
export const AUTO = "auto";

export const isVideoType = (creativeType: string) => /video/i.test(creativeType);

/** Section 6 prompt. Built only from database content passed in. */
export function buildGenerationPrompt(brand: BrandLike, product: ProductLike, rule: RuleLike, input: GenerationInput): string {
  const extra = input.extra?.trim() ? `Extra direction: ${input.extra.trim()}` : "";
  const notes = [product.notes, product.allergens].filter(Boolean).join(" ");
  const autoAngle = input.angle === AUTO;
  const autoPersona = input.persona === AUTO;
  const angle = autoAngle ? `your choice: pick the strongest for this product and platform from ${list(brand.angles ?? [])}` : input.angle;
  const persona = autoPersona ? `your choice: pick the best fits from ${list(brand.personas ?? [])}` : input.persona;
  const firstLine =
    autoAngle || autoPersona
      ? "Give each concept a different angle or persona (and vary format, setting or language too) so no two look alike."
      : `Use the chosen angle and persona for the first concept; vary at least two of persona, angle, format,
setting or language across the others so no two look alike.`;
  const shape = isVideoType(input.creativeType)
    ? "This is a video type: give 4–7 frames with timestamps (slot like \"0–2s\") totalling 15–30s, with visual, on-screen text and audio for every frame."
    : "This is an image/banner type: one frame per image (max 7) or per banner size; leave audio out.";

  return `You are the creative strategist for an Indian D2C food brand. Write ${input.n} ad concepts.

${brand.brandContext}
${brand.hardRules}

PRODUCT: ${product.name}. Price: ${product.priceText || "(not set; do not state a price)"}.
GREEN CLAIMS (allowed): ${list(product.greenClaims)}
AMBER CLAIMS (only if flagged as amber, needs evidence): ${list(product.amberClaims)}
RED CLAIMS (never use): ${list(product.redClaims)}
NOTES: ${notes || "(none)"}

PLATFORM: ${PLATFORM_LABELS[input.platform]}. CREATIVE TYPE: ${input.creativeType}.
${rule.rules}

DIRECTION: angle = ${angle}; persona = ${persona}; language = ${input.language}
(write on-screen text and audio in this language; Hinglish = Hindi in Latin script mixed with English). ${extra}
${firstLine}
Video: 4–7 frames with timestamps totalling 15–30s. Image sets: one frame per image (max 7) or per banner size.
List every claim used with its tier. Never include a red claim. Product details must match exactly.
${shape}
${input.hasPackImage ? "A photo of the real pack is attached: describe it accurately in ai_prompt and visuals (colours, layout, text on pack). Do not invent pack details.\n" : ""}Set needs_real_person true when any shot needs a real human (always for Amazon people, testimonials and founder/farm footage). Set ai_label_needed true when a synthetic person or realistic synthetic scene appears.
In why_it_fits, explain in one or two sentences why the concept suits ${PLATFORM_LABELS[input.platform]} specifically.
Return exactly ${input.n} concepts.`;
}

export type VariationInput = { platform: Platform; creativeType: string; concept: unknown };

/** Structural variations of a winning concept (not small tweaks). */
export function buildVariationsPrompt(brand: BrandLike, product: ProductLike, rule: RuleLike, input: VariationInput): string {
  const others = (["meta", "amazon", "flipkart"] as Platform[]).filter((p) => p !== input.platform).map((p) => PLATFORM_LABELS[p]);
  return `${buildGenerationPrompt(brand, product, rule, {
    n: 6,
    platform: input.platform,
    creativeType: input.creativeType,
    angle: "(same as the winner)",
    persona: "(vary as instructed)",
    language: "(vary as instructed)",
  })}

WINNING CONCEPT TO VARY:
${JSON.stringify(input.concept, null, 2)}

Write 6 structural variations of this winner, in this order:
1. Same angle, a new hook mechanism (e.g. question → demo, POV → text-on-screen list).
2. Persona and setting swap.
3. Language swap (pick a different language from the brand's list).
4. Format swap (e.g. UGC video → static or carousel, within this platform's types).
5. The same angle adapted for ${others[0]} (follow ${others[0]}'s norms: format, aspect ratio, people rules); set format accordingly.
6. The same angle adapted for ${others[1]} (follow ${others[1]}'s norms); set format accordingly.
Start each title with the variation type, e.g. "Hook swap: …", "For Amazon: …".`;
}

export function buildCheckPrompt(
  brand: BrandLike,
  product: ProductLike | null,
  rule: RuleLike,
  platform: Platform,
  text: string,
): { system: string; user: string } {
  const system = `You are a careful advertising-compliance reviewer for an Indian D2C food brand. You review ad copy before launch.
Consider the FSSAI (Advertising & Claims) Regulations 2018, ASCI guidelines (including disclosure/labelling of synthetic or AI-generated content and the ASCI food & beverage guidelines), and the Infant Milk Substitutes, Feeding Bottles and Infant Foods (IMS) Act. Also apply the brand's own rules, which are stricter.
You are a review aid, not legal advice. Be specific: quote the exact words that cause each issue.
Verdict: "pass" = nothing to change; "fix" = fixable wording issues; "block" = should not run at all (e.g. promotes food for under-2s, disease/cure claims central to the message).`;

  const productBlock = product
    ? `PRODUCT: ${product.name}
GREEN CLAIMS (allowed): ${list(product.greenClaims)}
AMBER CLAIMS (need evidence; acceptable only if flagged): ${list(product.amberClaims)}
RED CLAIMS (never): ${list(product.redClaims)}
NOTES: ${product.notes || "(none)"}`
    : "PRODUCT: (none selected; judge against brand and platform rules only)";

  const user = `BRAND CONTEXT:
${brand.brandContext}

BRAND HARD RULES:
${brand.hardRules}

${productBlock}

PLATFORM: ${PLATFORM_LABELS[platform]}
PLATFORM RULES:
${rule.rules}

COPY TO REVIEW:
"""
${text}
"""

List every issue (empty list if none). The rewrite must keep the same language, intent and rough length, use only allowed claims, and read naturally in the brand's tone.`;
  return { system, user };
}

export function buildWeeklyBriefPrompt(brand: BrandLike, data: unknown): string {
  return `You are the performance-creative lead for an Indian D2C food brand. Read last week's results and write next week's brief.

BRAND CONTEXT:
${brand.brandContext}

BRAND HARD RULES (every concept you suggest must follow them):
${brand.hardRules}

LAST 7 DAYS OF RESULTS, WITH CREATIVE ATTRIBUTES WHERE LINKED:
${JSON.stringify(data, null, 2)}

Return: winners and losers (name + why, using the numbers); the patterns behind winners (angle, persona, format, language, hook); converting marketplace search terms with a note on how to use each (empty if none in the data); exactly 5 concepts to brief next week; and a 2–3 sentence summary. If there is too little data, say so in the summary and base the concepts on the brand's strongest angles.`;
}
