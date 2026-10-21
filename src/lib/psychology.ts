import type { Objective, Platform } from "./types";

/**
 * How people actually meet an ad on each platform, and the persuasion
 * principles we use (ethically) to reach them. Pure data plus prompt text, so
 * generation, the brief and tests all share one source.
 */

/** What the shopper is doing when they meet the ad, and what the creative must do as a result. */
export const MINDSET: Record<Platform, { label: string; state: string; job: string[] }> = {
  meta: {
    label: "Scrolling, not shopping",
    state: "Nobody came to Instagram or Facebook to buy a snack. They scroll fast, decide in about 1–2 seconds whether to stop, and often watch with the sound off.",
    job: [
      "Stop the thumb: open on a pattern interrupt (motion, a hand mid-action, an unexpected close-up or a line that names their exact moment), not a logo card.",
      "Feel native: it should look like a post from a real person, not a TV ad. Lo-fi, phone-shot energy usually beats polish.",
      "Relevance before product: show the moment they recognise first, then the product as the answer to it by 3 seconds.",
      "Captions carry the message so it works sound-off; audio is a bonus.",
      "One idea per ad. Meta's delivery system uses the creative itself to find the audience, so each ad should speak to one clear kind of person and moment; different ads reach different people.",
    ],
  },
  amazon: {
    label: "Searching and comparing",
    state: "The shopper already wants the category and is comparing several near-identical options in a grid of small thumbnails, scanning price, rating and pack size in seconds.",
    job: [
      "Win the thumbnail: the pack must be big, clear and recognisable at about 100 px wide.",
      "Say what it is and who it's for in the first words (product type, flavour, size), because they scan, not read.",
      "Remove doubt rather than add excitement: taste, real ingredients, pack size, price per piece, how to eat it, what's inside.",
      "Answer the top objections from reviews before the shopper has to ask. Concrete facts beat adjectives.",
      "Shopping assistants answer from the listing's own words, so state facts plainly (ingredients %, net quantity, serving).",
    ],
  },
  flipkart: {
    label: "Value-seeking on a phone",
    state: "Mobile-first, price-aware shoppers, often in smaller cities, scrolling cards quickly. Many prefer Hindi or Hinglish.",
    job: [
      "One message per image, big text that reads on a small phone.",
      "Frame value concretely: price per piece or per serving, what you get in the pack (only real numbers).",
      "Build trust fast: the real pack, clear ingredients, and familiar cues (chai, tiffin, family).",
      "Make the first image recognisable at thumbnail size; quick-commerce apps show the same images even smaller.",
    ],
  },
};

/** Where the viewer is on the path from "never heard of it" to "buying", by objective (after Eugene Schwartz's awareness levels). */
export const AWARENESS: Record<Objective, { stage: string; lead: string }> = {
  awareness: {
    stage: "Unaware or problem-aware: they don't know us and may not be looking for a better snack.",
    lead: "Lead with the moment and the feeling they recognise (the 4 pm slump, the tiffin question), not with claims. Make the brand memorable with a distinctive, repeatable cue.",
  },
  consideration: {
    stage: "Solution-aware: they know better snacks exist but not why ours.",
    lead: "Lead with the one reason ours is different and show it (the ingredient, the crunch, the label). Give them something to save or share.",
  },
  conversion: {
    stage: "Product-aware: they know us and are deciding.",
    lead: "Lead with the product, the price or the real offer, and one proof point. Lower the risk of trying (pack size, a discovery pack if one exists).",
  },
  retargeting: {
    stage: "Most aware: they looked but didn't buy.",
    lead: "Answer the one objection that stopped them (taste, price, sugar, will the kids eat it) and remind them of what they saw. Real reviews only.",
  },
  launch: {
    stage: "Aware of the brand, not of the new product.",
    lead: "Lead with what's new and why it matters in one line; show the new pack early so it's recognised later on the shelf.",
  },
  festive: {
    stage: "In a gifting or sharing mindset.",
    lead: "Lead with the occasion and the people; the product is the gift or the thing on the plate. Offers only if real.",
  },
};

/** Persuasion principles each proposal can build on. Every one has a guard so it stays honest. */
export const LEVERS = [
  { id: "specificity", label: "Concrete detail", use: "Exact, checkable details (23.8% millet, 12 cookies, 240 g) are more believable than adjectives.", guard: "Only numbers from the product facts." },
  { id: "sensory", label: "Sensory appeal", use: "Make them taste it: the snap, the crumble, cocoa, cardamom, the dunk in chai. Appetite drives food choice more than nutrition.", guard: "Show real texture; no exaggerated food styling." },
  { id: "recognition", label: "Recognisable moment", use: "A situation they live every week, so they think 'that's me' (the self-reference effect).", guard: "Never imply they have a health or body problem." },
  { id: "identity", label: "Identity and belonging", use: "Speak to who they are or want to be: the label-reader, the parent who packs the tiffin, the desk snacker.", guard: "Invite, don't shame." },
  { id: "reframe", label: "Contrast and reframe", use: "Put the product next to the habit it replaces (the biscuit packet, the vending machine) so the difference is obvious.", guard: "Never name or knock a competitor; no comparative claims." },
  { id: "curiosity", label: "Curiosity gap", use: "Open a small question in the hook (flip the pack, what's in it) and pay it off within the ad.", guard: "Always pay it off; no clickbait." },
  { id: "social-proof", label: "Social proof", use: "Real people, real reviews, real numbers reduce risk for a new brand.", guard: "Only real, permissioned reviews and true numbers; never invent them." },
  { id: "transparency", label: "Transparency and trust", use: "Show what others hide: ingredient %, the QR trace, where it comes from. Openness signals quality.", guard: "Only facts we can show." },
  { id: "ease", label: "Ease and low risk", use: "Make trying feel easy: small pack, how to eat it, when it fits the day, what it costs per piece.", guard: "Prices and offers only if given." },
  { id: "usefulness", label: "Useful tip", use: "Give something useful (a pairing, a tiffin idea) so the ad earns attention and saves.", guard: "No nutrition or health advice." },
] as const;
export type LeverId = (typeof LEVERS)[number]["id"];

/** Persuasion we never use, whatever the objective. */
export const ETHICS = [
  "No fake urgency or scarcity (\"only 3 left\", \"ends tonight\") unless the direction gives a real, time-bound offer.",
  "No invented reviews, ratings, customer counts or \"bestseller\" status.",
  "No fear, guilt or shame (about bodies, weight, parenting or \"junk\") to drive a purchase.",
  "No dark patterns: the CTA says exactly what happens next.",
];

/** Platform psychology for the generation prompt. */
export function psychologyBlock(platform: Platform, objective: Objective | "" | undefined, proposals: boolean): string {
  const m = MINDSET[platform];
  const a = objective ? AWARENESS[objective] : null;
  return `HOW THE VIEWER MEETS THIS AD (${m.label}): ${m.state}
${m.job.map((j) => `- ${j}`).join("\n")}${a ? `\nWHERE THEY ARE: ${a.stage} ${a.lead}` : ""}
PERSUASION LEVERS (build each ${proposals ? "proposal" : "concept"} on one main lever${proposals ? " and use a different lever for each proposal" : ""}; name it in ${proposals ? "lever" : "why_it_fits"}):
${LEVERS.map((l) => `- ${l.label}: ${l.use} (${l.guard})`).join("\n")}
- Cognitive ease: one message, one proof point, plain words. The easier it is to process, the more it is believed and remembered.
- Distinctive brand cues (the purple pack, the name, the same tagline) repeated in every ad build recognition on the shelf later.
NEVER: ${ETHICS.join(" ")}`;
}

/** What the image itself must do to earn attention on this platform. */
export function imageAttention(platform: Platform, mainListing: boolean): string {
  if (mainListing) return "";
  return platform === "meta"
    ? "Attention: it must stop a fast scroll in a feed. One bold focal point, strong tonal contrast, a human hand or action mid-moment, and appetising texture in the scene. Simple enough to read in one glance on a phone."
    : "Attention: it is seen first as a small thumbnail on a phone. Keep it simple and high-contrast with one subject, so it reads at about 100 px wide.";
}
