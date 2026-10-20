import type { Deliverable, Objective, Platform } from "./types";
import { OBJECTIVES, PLATFORM_LABELS } from "./types";

type BrandLike = {
  brandContext: string;
  hardRules: string;
  tone?: string;
  angles?: string[];
  personas?: string[];
  exampleAds?: string;
  avoidPhrases?: string;
};
type ProductLike = {
  slug: string;
  name: string;
  priceText: string;
  greenClaims: string[];
  amberClaims: string[];
  redClaims: string[];
  notes: string;
  allergens?: string;
  story?: string;
  ingredients?: string;
  messagingPriorities?: string[];
  claimEvidence?: { claim: string; evidence: string; source?: string }[];
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
  inspiration?: string;
  hasPackImage?: boolean;
  /** Where it runs, e.g. "Instagram Stories", plus how to design for it. */
  placement?: { label: string; guidance: string } | null;
  objective?: Objective | "";
  deliverable?: Deliverable;
  /** "proposals" = short directions to choose from; "concepts" = full creatives. */
  output?: "concepts" | "proposals";
  /** A competitor ad to stand apart from (from the Competitors page). */
  competitor?: CompetitorContext | null;
};

export type CompetitorContext = {
  brand: string;
  summary: string;
  hook: string;
  angle: string;
  claims: string[];
  whiteSpace: string[];
};

/** Rules for using a competitor ad as context: differentiate, never copy, name or knock them. */
export function competitorBlock(c: CompetitorContext): string {
  return `COMPETITOR TO STAND APART FROM (context only):
${c.brand}'s ad: ${c.summary} Their hook: ${c.hook}. Their angle: ${c.angle}.${c.claims.length ? ` Claims they make: ${c.claims.join("; ")}.` : ""}
${c.whiteSpace.length ? `White space they leave open: ${c.whiteSpace.join("; ")}.\n` : ""}- Make our ideas clearly different in moment, hook and proof; lean into the white space.
- Never name, show, imitate or disparage the competitor or their pack. No comparative claims ("better than", "unlike other brands") and no claim we don't hold just because they make it.`;
}

/** What success looks like for each campaign objective. */
export const OBJECTIVE_GUIDANCE: Record<Objective, string> = {
  awareness: "Optimise for thumb-stop and memorability: a distinctive moment and a clear brand cue in the first 2 seconds; no hard sell.",
  consideration: "Give a reason to tap or save: curiosity, one specific proof point or a useful tip. CTA such as Learn more.",
  conversion: "Make buying easy: product and offer clear, one sharp proof point, urgency only if it is real. CTA such as Shop now.",
  retargeting: "Speak to people who already know us: answer one objection (taste, price, sugar, kids liking it) and remind them what they looked at. Social proof only if real.",
  launch: "Introduce what is new and why it matters in one line; show the pack clearly and early.",
  festive: "Tie to the occasion (gifting, sharing, the sale) without stretching any claim; show the pack as a gift. Mention offers only if given in the direction.",
};

/** How each deliverable is written into the concept fields. */
export const DELIVERABLE_GUIDANCE: Record<Deliverable, (platform: Platform) => string> = {
  concept: () => "",
  ugc: () => `DELIVERABLE: UGC creator script, for a real creator filming on a phone.
- frames = the shots in order (5–8), slot = timestamps totalling 15–45s; visual = what to film plus talent direction (framing, action, expression, props); onscreen = caption text; audio = the exact words the creator says, in a natural voice.
- copy.body = the post caption; copy.body_alt = a short creator brief: who the creator should be, setting, wardrobe, and do's and don'ts (no health results, no claims beyond the list, show the real pack).
- needs_real_person = true.`,
  copy: (platform) => `DELIVERABLE: ad copy set for ${PLATFORM_LABELS[platform]}.
- Put the strongest version in copy (headline, body, cta) and 4 more distinct versions in copy.variants, each opening with a different hook mechanism.
- ${platform === "meta" ? "Primary text: the hook and the proof point must land in the first 125 characters. Headline 40 characters or fewer. CTA from Meta's buttons (Shop now, Learn more, Order now, Get offer)." : platform === "amazon" ? "Headline 50 characters or fewer; never mention Amazon; specific CTA." : "Headline 40 characters or fewer; short, listing-led lines."}
- frames = exactly 1 frame describing the single image or video the copy runs with.`,
};

/** Hook mechanisms the model rotates through so ideas don't all open the same way. */
export const HOOK_MECHANISMS = [
  "confession (\"I used to…\")",
  "POV / first-person moment",
  "counter-intuitive fact",
  "label-reading challenge (flip the pack, read it out)",
  "ASMR / crunch close-up demo",
  "mini-story with a twist",
  "relatable complaint → fix",
  "price or swap comparison (what it replaces)",
  "question that names a specific moment",
  "list (\"3 things I keep on my desk\")",
];

/** One phrase per line (or comma-separated) → clean list. */
export const phraseList = (text: string | undefined) =>
  (text ?? "")
    .split(/[\n,]/)
    .map((p) => p.trim())
    .filter(Boolean);

/** Angle/persona value meaning "let the model choose a varied mix". */
export const AUTO = "auto";

export const isVideoType = (creativeType: string) => /video/i.test(creativeType);

/** Section 6 prompt. Built only from database content passed in. */
export function buildGenerationPrompt(brand: BrandLike, product: ProductLike, rule: RuleLike, input: GenerationInput): string {
  const extra = input.extra?.trim() ? `Extra direction: ${input.extra.trim()}` : "";
  const notes = [product.notes, product.allergens].filter(Boolean).join(" ");
  const proposals = input.output === "proposals";
  const objective = input.objective ? OBJECTIVES.find((o) => o.id === input.objective) : null;
  const evidence = (product.claimEvidence ?? []).filter((e) => e.claim.trim() && e.evidence.trim());
  const knowledge = [
    product.ingredients?.trim() ? `INGREDIENTS: ${product.ingredients.trim()}` : "",
    product.messagingPriorities?.length ? `MESSAGING PRIORITIES (lead with these, in order): ${product.messagingPriorities.join("; ")}` : "",
    evidence.length ? `EVIDENCE ON FILE FOR AMBER CLAIMS: ${evidence.map((e) => `${e.claim}: ${e.evidence}`).join("; ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  const autoAngle = input.angle === AUTO;
  const autoPersona = input.persona === AUTO;
  const angle = autoAngle ? `your choice: pick the strongest for this product and platform from ${list(brand.angles ?? [])}` : input.angle;
  const persona = autoPersona ? `your choice: pick the best fits from ${list(brand.personas ?? [])}` : input.persona;
  const firstLine =
    autoAngle || autoPersona
      ? "Give each concept a different angle or persona (and vary format, setting or language too) so no two look alike."
      : `Use the chosen angle and persona for the first concept; vary at least two of persona, angle, format,
setting or language across the others so no two look alike.`;
  const avoid = phraseList(brand.avoidPhrases);
  const quality = `
QUALITY BAR (this matters most; generic ads fail):
- Be specific, never generic. Every concept is built on one concrete, recognisably Indian moment with a time, place and object (e.g. 4:30pm laptop slump with cutting chai, Mumbai local at 8:12, steel tiffin at a school gate, Sunday filter coffee). No stock "happy person eating snack" scenes.
- Give each concept a different hook mechanism, chosen from: ${HOOK_MECHANISMS.join("; ")}. Say which one in why_it_fits.
- The hook must work in 2 seconds with the sound off: short, surprising, concrete. No questions like "Looking for a healthy snack?".
- Write like a real person talks (texting tone), not like an ad. Short lines. Light humour where it fits the brand tone.
- Use real product proof as the reason to believe: exact ingredient %, jaggery, no maida, the QR, pack size, pairing. Prefer one sharp proof point over a list.
- Visual directions must be shootable: say what's in frame, the camera move and the prop, not adjectives.${avoid.length ? `\n- Never use these overused phrases (or close variants): ${avoid.join("; ")}.` : ""}
- Final check before answering: for each concept ask "could a competitor run this by swapping the logo?" If yes, rewrite it with a more specific moment and proof.
${brand.exampleAds?.trim() ? `\nADS WE LIKE (match this voice, specificity and rhythm; do not copy lines):\n${brand.exampleAds.trim()}\n` : ""}${input.inspiration?.trim() ? `\nREFERENCE THE TEAM WANTS TO RIFF ON (borrow the structure/energy, not the words; never copy another brand's claims or name):\n${input.inspiration.trim()}\n` : ""}`;
  const shape = isVideoType(input.creativeType)
    ? "This is a video type: give 4–7 frames with timestamps (slot like \"0–2s\") totalling 15–30s, with visual, on-screen text and audio for every frame."
    : "This is an image/banner type: one frame per image (max 7) or per banner size; leave audio out.";

  const deliverable = input.deliverable ? DELIVERABLE_GUIDANCE[input.deliverable](input.platform) : "";
  const outputRules = proposals
    ? `For each proposal give: title, angle, persona, big_idea (the moment, the twist, the proof point), hook (the first 2 seconds), format, hook_mechanism, the claims it leans on with tiers, and why (one sentence on how it serves the objective on ${PLATFORM_LABELS[input.platform]}).
Make the ${input.n} proposals genuinely different directions (different moment, hook mechanism and persona or angle), so the team has a real choice. Never lean on a red claim.`
    : `Video: 4–7 frames with timestamps totalling 15–30s. Image sets: one frame per image (max 7) or per banner size.
List every claim used with its tier. Never include a red claim. Product details must match exactly.
${shape}
${input.hasPackImage ? "A photo of the real pack is attached: describe it accurately in ai_prompt and visuals (colours, layout, text on pack). Do not invent pack details.\n" : ""}Set needs_real_person true when any shot needs a real human (always for Amazon people, testimonials and founder/farm footage). Set ai_label_needed true when a synthetic person or realistic synthetic scene appears.
In why_it_fits, explain in one or two sentences why the concept suits ${PLATFORM_LABELS[input.platform]} specifically.${deliverable ? `\n${deliverable}` : ""}`;

  return `You are the creative strategist for an Indian D2C food brand. ${proposals ? `Propose ${input.n} distinct creative directions (short proposals, not finished ads).` : `Write ${input.n} ad concepts.`}

${brand.brandContext}
${brand.hardRules}

PRODUCT: ${product.name}. Price: ${product.priceText || "(not set; do not state a price)"}.
GREEN CLAIMS (allowed): ${list(product.greenClaims)}
AMBER CLAIMS (only if flagged as amber, needs evidence): ${list(product.amberClaims)}
RED CLAIMS (never use): ${list(product.redClaims)}
NOTES: ${notes || "(none)"}
${knowledge ? `${knowledge}\n` : ""}${product.story?.trim() ? `PRODUCT STORY (real details: use them for specific, sensory, believable copy):\n${product.story.trim()}\n` : ""}
PLATFORM: ${PLATFORM_LABELS[input.platform]}. CREATIVE TYPE: ${input.creativeType}.${
    input.placement ? `\nPLACEMENT: ${input.placement.label}. ${input.placement.guidance || "Design natively for this placement's format, length and safe areas."}` : ""
  }${input.competitor ? `\n${competitorBlock(input.competitor)}` : ""}${objective ? `\nCAMPAIGN OBJECTIVE: ${objective.label}. ${OBJECTIVE_GUIDANCE[objective.id]}` : ""}
${rule.rules}

DIRECTION: angle = ${angle}; persona = ${persona}; language = ${input.language}
(write on-screen text and audio in this language; Hinglish = Hindi in Latin script mixed with English). ${extra}
${firstLine}
${outputRules}
${quality}
Return exactly ${input.n} ${proposals ? "proposals" : "concepts"}.`;
}

/** Expands one chosen proposal into the full creative, in the chosen deliverable. */
export function buildDevelopPrompt(
  brand: BrandLike,
  product: ProductLike,
  rule: RuleLike,
  input: Omit<GenerationInput, "n" | "output" | "angle" | "persona"> & {
    proposal: { title: string; angle: string; persona: string; big_idea: string; hook: string; format: string; hook_mechanism?: string };
  },
): string {
  const p = input.proposal;
  return buildGenerationPrompt(brand, product, rule, {
    ...input,
    n: 1,
    output: "concepts",
    angle: p.angle,
    persona: p.persona,
    extra: `${input.extra?.trim() ? `${input.extra.trim()} ` : ""}Develop this chosen direction into the finished creative, keeping its idea and hook (sharpen the wording if it helps): ${JSON.stringify(p)}`,
  });
}

export type VariationInput = { platform: Platform; creativeType: string; concept: unknown; placement?: GenerationInput["placement"] };

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
    placement: input.placement,
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

/** Breaks down a competitor ad and suggests clearly different ideas for our product. */
export function buildCompetitorPrompt(brand: BrandLike, products: ProductLike[], ad: { brand: string; product: string; channel: string; adText: string; notes: string; hasImage: boolean }): string {
  return `You are the creative strategist for an Indian D2C food brand. Break down a competitor's ad so the team can learn from its craft and find where we can be different. Never suggest copying its words, visuals or claims.

OUR BRAND:
${brand.brandContext}

OUR HARD RULES (our counter-ideas must follow them):
${brand.hardRules}

OUR PRODUCTS AND ALLOWED (GREEN) CLAIMS:
${products.map((p) => `- ${p.name}: ${list(p.greenClaims)}`).join("\n")}

COMPETITOR AD:
Brand: ${ad.brand}${ad.product ? `. Product: ${ad.product}` : ""}${ad.channel ? `. Ran on: ${ad.channel}` : ""}.
${ad.adText.trim() ? `Text of the ad:\n"""\n${ad.adText.trim()}\n"""` : "(No text pasted.)"}
${ad.hasImage ? "A screenshot of the ad is attached: read its visible text and describe what it shows.\n" : ""}${ad.notes.trim() ? `Team notes: ${ad.notes.trim()}\n` : ""}
Rate every claim they make: "ok" (we could say the same if true for us), "check" (needs evidence), "risky" (would break our hard rules or FSSAI/ASCI: health, disease, "healthy", "guilt-free", "100%", unqualified nutrient claims, comparisons). In white_space, list moments, angles or proof points they don't own that our products can credibly claim.
Give exactly 3 counter_ideas for us: clearly different from their ad, using only our green claims, never naming or knocking them.`;
}
