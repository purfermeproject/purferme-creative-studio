import { z } from "zod";
import { scan, type ScanHit, type Term } from "./compliance";
import type { Platform } from "./types";
import { withoutRepeats } from "./product-focus";

/**
 * Marketplace image stacks, the way the team plans them: a main image, then 6–8 slides, each with a
 * benefit-first header, a sub-header, ONE technical feature shown as a callout next to the real pack,
 * and a real-life photo with a person in it. Pure, so the planner, the editor and tests share it.
 */

export const LISTING_PLATFORMS = ["amazon", "flipkart", "shopify"] as const;
export type ListingPlatform = (typeof LISTING_PLATFORMS)[number];
export const LISTING_LABELS: Record<ListingPlatform, string> = { amazon: "Amazon", flipkart: "Flipkart", shopify: "Shopify" };
/** Square master size per platform (Amazon and Flipkart zoom from 1000+; Shopify recommends 2048). */
export const LISTING_SIZE: Record<ListingPlatform, number> = { amazon: 2000, flipkart: 2000, shopify: 2048 };

export const SLIDE_KINDS = ["hero3d", "side-left", "side-right", "back", "nutrition", "ingredients", "usage", "comparison", "lifestyle", "closeup"] as const;
export type SlideKind = (typeof SLIDE_KINDS)[number];
export const SLIDE_KIND_LABELS: Record<SlideKind, string> = {
  hero3d: "3D pack with a background",
  "side-left": "Left side of the pack",
  "side-right": "Right side of the pack",
  back: "Back of the pack",
  nutrition: "Nutrition facts",
  ingredients: "Ingredients",
  usage: "How to enjoy it (chai, coffee…)",
  comparison: "Comparison: ours vs others",
  lifestyle: "Person in a real setting",
  closeup: "Food close-up",
};

/** The team's standard stack: after the white main image, these 8 slides in this order. */
export const STANDARD_STACK: SlideKind[] = ["hero3d", "side-left", "side-right", "back", "nutrition", "ingredients", "usage", "comparison"];

/** Slides built from the team's real pack photos (placed unchanged, so small print stays exact), and which side each needs. */
export const PANEL_VIEW: Partial<Record<SlideKind, string[]>> = {
  "side-left": ["left side"],
  "side-right": ["right side"],
  back: ["back"],
  nutrition: ["nutrition panel", "back"],
  ingredients: ["ingredients panel"],
};

export const SlideSchema = z.object({
  header: z.string().describe("Benefit first, 2–5 words, e.g. 'Stay Full For Longer'"),
  sub: z.string().describe("Sub-header, one short line (12 words or fewer)"),
  feature: z.string().describe("The ONE technical feature, shown as a small callout next to the pack; separate up to 4 short parts with ' | '"),
  scene: z.string().describe("What the photo shows: who, where, doing what, the light. The real pack is added beside the photo, so describe the moment, not the pack."),
  kind: z.enum(SLIDE_KINDS),
  reference: z.string().optional().describe("A competitor listing whose layout inspired it, if any"),
  comparison: z
    .object({
      us: z.string().describe("Our column label, e.g. 'PurFerme'"),
      them: z.string().describe("The other column: a generic category, never a brand, e.g. 'Regular biscuits'"),
      rows: z
        .array(z.object({ label: z.string(), us: z.string(), them: z.string() }))
        .describe("3–5 rows, each worded so ✓ is the good answer ('No palm oil', not 'Palm oil'); values like '✓', '✗', '9 g'"),
    })
    .optional()
    .describe("Only for kind = comparison"),
});
/** A slide as saved: the team can pick one of the product's own photos instead of an AI photo. */
export const SavedSlideSchema = SlideSchema.extend({ photoId: z.string().uuid().optional() });
export type Slide = z.infer<typeof SavedSlideSchema>;

/** What the planner writes (it never picks photos: those are the team's choice). */
export const ListingPlanSchema = z.object({
  main: z.object({
    note: z.string().describe("What the main image must make clear at thumbnail size (from the pack itself: name, size, hero ingredients)"),
    claims: z.array(z.string()).optional().describe("2–3 short claim labels for the main image, e.g. '0% Maida', 'No Refined Sugar' (only approved claims)"),
  }),
  slides: z.array(SlideSchema).describe("8 slides, in the standard order"),
  principles: z.array(z.string()).optional().describe("The few rules this plan follows, in plain words"),
});
export const SavedPlanSchema = ListingPlanSchema.extend({ slides: z.array(SavedSlideSchema) });
export type ListingPlan = z.infer<typeof SavedPlanSchema>;

/** How the team builds an image stack (from their listing analysis); used to brief the planner and to check plans. */
export const LISTING_RULES = [
  "Main image: the real pack on pure white with our real cookies beside it and small piles of the real ingredients, attractive and appetising; 2–3 short claim labels (e.g. 0% Maida, No Refined Sugar) where the marketplace allows them. Name, size and hero ingredients must read at thumbnail size.",
  "The stack after the main image, in this order: 2) the pack in 3D with a background, 3) the left side of the pack, 4) the right side, 5) the back, 6) nutrition facts, 7) ingredients, 8) how to enjoy it (with chai, coffee, peanut butter…), 9) a comparison: ours vs others.",
  "No repeating: an idea or word in the header or sub-header never appears again in that slide's pointers; each pointer says something new.",
  "Cookies: market fibre and complex carbs (from millets and oats), and show them with chai or coffee.",
  "Lifestyle and usage slides show a person in a real Indian setting (kitchen, office desk at 11 am, school tiffin, home gym); each slide has its own setting and feeling.",
  "Benefit first: the header says what the shopper gets (“Stay Full For Longer”), not what the product is.",
  "One feature per slide: the technical proof (a number, an ingredient, a certification) sits as a small callout next to the pack.",
  "Use the stories competitors don't tell: where it comes from (farm, traceability QR), what's left out, how it's eaten.",
  "A comparison is only against an unbranded, generic version of the category, with facts that are true for it; never name or show a competitor.",
];

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
const PERSON = /\b(mother|mom|mum|father|dad|parent|child|kid|kids|girl|boy|grandmother|grandma|grandfather|grandchild|woman|man|person|people|family|professional|student|friends?|couple|hand|hands|farmer|teen)\b/i;

export type SlideCheck = { level: "block" | "review" | "tip"; text: string };

/** What to fix on one slide: claim rules first, then the team's own stack rules. */
export function checkSlide(slide: Slide, platform: ListingPlatform, productSlug: string, terms: Term[], redClaims: string[] = []): { hits: ScanHit[]; checks: SlideCheck[] } {
  const viewer = [slide.header, slide.sub, slide.feature, ...(slide.comparison ? [slide.comparison.us, slide.comparison.them, ...slide.comparison.rows.flatMap((r) => [r.label, r.us, r.them])] : [])].join("\n");
  const scanPlatform: Platform = platform === "shopify" ? "meta" : platform;
  const { hits } = scan(viewer, scanPlatform, productSlug, terms);
  const checks: SlideCheck[] = [];
  for (const h of hits) checks.push({ level: h.severity === "red" ? "block" : "review", text: `${h.severity === "red" ? "Not allowed" : "Needs evidence"}: ${h.label} (“${h.matches.join("”, “")}”)` });
  const lower = viewer.toLowerCase();
  for (const red of redClaims) {
    const phrase = red.replace(/["“”]/g, "").split("/")[0].trim().toLowerCase();
    if (phrase.length >= 4 && lower.includes(phrase) && !checks.some((c) => c.text.toLowerCase().includes(phrase))) checks.push({ level: "block", text: `On this product's never-use list: ${red}` });
  }
  if (/\b(better than|unlike (other|regular)|vs\.?|versus)\b/i.test(viewer) || slide.kind === "comparison") {
    checks.push({ level: "review", text: "Comparison: only against an unbranded, generic version, and every row must be true for most of that category. An approver signs it off." });
  }
  if (words(slide.header) > 5) checks.push({ level: "tip", text: `Header is ${words(slide.header)} words; keep it to 2–5 so it reads at a glance.` });
  if (words(slide.sub) > 12) checks.push({ level: "tip", text: `Sub-header is ${words(slide.sub)} words; keep it to one short line.` });
  const repeats = withoutRepeats(slide.header, slide.sub, slide.feature.split("|").map((x) => x.trim()).filter(Boolean), [], 10).dropped;
  if (repeats.length && slide.kind !== "comparison") {
    checks.push({ level: "review", text: `Pointer repeats the header or sub-header: ${repeats.join(", ")}. It's left out of the image (one idea is said once); write something new instead.` });
  }
  if (slide.feature.split("|").filter((x) => x.trim()).length > 4) checks.push({ level: "tip", text: "More than 4 parts in the feature: one feature per slide reads better." });
  if (slide.kind === "lifestyle" && !PERSON.test(slide.scene)) checks.push({ level: "tip", text: "No person in the photo description: every lifestyle slide should show someone in a real setting." });
  if (slide.kind === "comparison" && !slide.comparison?.rows.length) checks.push({ level: "block", text: "Comparison slide has no rows yet." });
  return { hits, checks };
}

/** The team's own plans from their listing analysis (loaded as written; the checks show what needs changing). */
export const TEAM_PLANS: Record<string, ListingPlan> = {
  bfast: {
    main: { note: "Make “12 COOKIES • 240 g” prominent and “MILLET & OATS BREAKFAST COOKIES” readable at thumbnail size." },
    principles: ["Every slide has a person in a real setting", "Benefit first", "One feature per slide", "Technical feature as a small callout next to the product"],
    slides: [
      {
        header: "Only Good Stuff Inside",
        sub: "No maida, no palm oil, no white sugar",
        feature: "0% Maida | 0% Palm Oil | 0% Refined Sugar | No Preservatives",
        scene: "Mother in a bright kitchen reading the back of the pack, child reaching for a cookie. Three crossed-out icons (maida, palm oil, sugar) next to the box",
        kind: "lifestyle",
        reference: "B0F9SS9VPD (Gud Grain)",
      },
      {
        header: "Sweet The Natural Way",
        sub: "Sweetened with jaggery, just like grandma's recipe",
        feature: "Sweetened only with jaggery (gur) | Zero white sugar",
        scene: "Warm, golden-light shot of a grandmother and grandchild sharing cookies at the dining table, jaggery in a small bowl beside them",
        kind: "lifestyle",
        reference: "B0FQ53TJGY (Satvikveda)",
      },
      {
        header: "Stay Full For Longer",
        sub: "Millets and oats keep hunger away till lunch",
        feature: "High Fibre – 9g per 100g | Foxtail Millet + Rolled Oats",
        scene: "Young professional at an office desk at 11 am, laptop open, cookie with a cup of chai. Small callout showing millet and oat grains",
        kind: "lifestyle",
        reference: "B089X784PL (Artinci)",
      },
      {
        header: "Real Nuts, Real Crunch",
        sub: "Almonds and cashews in every single bite",
        feature: "Almonds, Cashews, Cocoa, Cardamom, Cinnamon | Baked with Butter | 0g Trans Fat",
        scene: "Close-up of a cookie being snapped in half, nuts and millet texture clearly visible, crumbs in mid-air",
        kind: "closeup",
        reference: "B0D4DYRMVT (Midbreak)",
      },
      {
        header: "Tiffin Time Favourite",
        sub: "Kids love the taste, moms trust it",
        feature: "12 Cookies x 20g | 240g Pack | Easy to Carry",
        scene: "School-age child opening a steel lunch box with cookies inside, in a classroom or school bus",
        kind: "lifestyle",
        reference: "B0FCFMPFYF (Mo's)",
      },
      {
        header: "Meet Your Farmer",
        sub: "Scan the pack and see where it grew",
        feature: "Seed-to-Fork Traceability QR | Made at NutriHub, Indian Institute of Millets Research",
        scene: "Farmer standing in a golden foxtail millet field at sunrise, a hand holding a phone in the foreground",
        kind: "lifestyle",
        reference: "None found: no competitor tells a farm story, so it's our USP",
      },
      {
        header: "Better Than Regular Biscuits",
        sub: "See why families are making the switch",
        feature: "Comparison: Maida / Palm Oil / Refined Sugar / Fibre / Preservatives",
        scene: "Our box with green ticks on the left, a plain unbranded “regular biscuit” pack with red crosses on the right",
        kind: "comparison",
        reference: "B089X784PL (Artinci)",
        comparison: {
          us: "PurFerme",
          them: "Regular biscuits",
          rows: [
            { label: "No maida", us: "✓", them: "✗" },
            { label: "No palm oil", us: "✓", them: "✗" },
            { label: "No refined sugar", us: "✓", them: "✗" },
            { label: "Fibre per 100 g", us: "9 g", them: "Low" },
            { label: "No preservatives", us: "✓", them: "✗" },
          ],
        },
      },
    ],
  },
  pbr: {
    main: { note: "Make “RAGI + COCOA + JAGGERY” the hero message, with a larger, more prominent product presentation." },
    principles: ["Every slide has a person in a real setting", "Benefit first", "One feature per slide", "Technical feature as a small callout next to the product"],
    slides: [
      {
        header: "Chocolate Taste, Clean Label",
        sub: "Rich cocoa flavour without any white sugar",
        feature: "Roasted Peanuts + Cocoa + Jaggery | 0g Refined Sugar | 7.5g Total Sugar per 100g",
        scene: "Breakfast table with warm morning light, peanut butter being spread on whole-wheat toast by a woman's hand",
        kind: "lifestyle",
        reference: "B07QMJ8RT5 (MyFitness Chocolate)",
      },
      {
        header: "Protein For Every Day",
        sub: "22.5g protein in every 100g for stronger days",
        feature: "22.5g Protein | 9g Fibre per 100g",
        scene: "Young man or woman after a workout in a home gym, eating peanut butter on banana toast",
        kind: "lifestyle",
        reference: "B0H5R7WHQD (Pintola High Protein Jaggery)",
      },
      {
        header: "Ragi: Our Secret Superfood",
        sub: "A desi millet with natural iron and calcium",
        feature: "Ragi (Finger Millet) | Iron 4.5mg | Calcium 120mg per 100g",
        scene: "Indian kitchen counter with a bowl of ragi grains and ragi flour; a mother making a smoothie for her family",
        kind: "lifestyle",
        reference: "B0H6FSH7VX (Pintola Coconut Jaggery)",
      },
      {
        header: "Zero Palm Oil, Ever",
        sub: "Natural oil on top means nothing added",
        feature: "No Palm Oil | No Hydrogenated Fat | 0g Trans Fat | No Stabilisers",
        scene: "Close-up of a hand stirring creamy chocolate peanut butter with a spoon, glossy natural oil visible",
        kind: "closeup",
        reference: "B071NKV55W (Alpino Chocolate)",
      },
      {
        header: "Spread It Anywhere",
        sub: "Toast, pancakes, oats, smoothies or by the spoon",
        feature: "Creamy Texture | Easy to Spread | Versatile Use",
        scene: "4-tile grid: toast, a pancake stack, an overnight oats jar and a smoothie glass, each with a hand reaching in",
        kind: "closeup",
        reference: "B0CQM5B9W1 (MyFitness Almond Crunch)",
      },
      {
        header: "Kids' New Favourite Spread",
        sub: "A healthier swap for sugary chocolate spreads",
        feature: "Jaggery-Sweetened | No Artificial Preservatives | Great for Tiffin",
        scene: "Child happily eating a peanut butter roti roll at the breakfast table, parent smiling in the background",
        kind: "lifestyle",
        reference: "B071NKV55W (Alpino Chocolate)",
      },
      {
        header: "Better Than Regular Spreads",
        sub: "See how PurFerme compares with ordinary choco spreads",
        feature: "Comparison: Protein / Palm Oil / White Sugar / Ragi / Preservatives",
        scene: "Our jar with green ticks against an unbranded generic chocolate spread jar with red crosses",
        kind: "comparison",
        reference: "B0CQM5B9W1 (MyFitness Almond Crunch)",
        comparison: {
          us: "PurFerme",
          them: "Regular choco spreads",
          rows: [
            { label: "Protein per 100 g", us: "22.5 g", them: "Low" },
            { label: "No palm oil", us: "✓", them: "✗" },
            { label: "No white sugar", us: "✓", them: "✗" },
            { label: "Made with ragi", us: "✓", them: "✗" },
            { label: "No artificial preservatives", us: "✓", them: "✗" },
          ],
        },
      },
    ],
  },
};

/** What the team's stack looks like before any AI wording: a sound default for any product, in the standard order. */
export function standardSlides(p: { name: string; greenClaims: string[]; ingredients: string }, focus: { callouts: string[]; usage: string[] }): Slide[] {
  const claim = (re: RegExp) => p.greenClaims.find((c) => re.test(c));
  const topIngredients = p.ingredients
    .replace(/\([^)]*\)/g, "")
    .split(/[,;]/)
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 3);
  const rows = [
    claim(/maida/i) ? { label: "Maida", us: "No", them: "Yes" } : null,
    claim(/sugar/i) ? { label: "Refined sugar", us: "No", them: "Yes" } : null,
    claim(/palm/i) ? { label: "Palm oil", us: "No", them: "Often" } : null,
    claim(/preserv/i) ? { label: "Preservatives", us: "No", them: "Often" } : null,
    claim(/millet/i) ? { label: "Millets", us: "Yes", them: "Rarely" } : null,
  ].filter((r): r is { label: string; us: string; them: string } => Boolean(r));
  return [
    { kind: "hero3d", header: "Meet Your New Favourite", sub: `${p.name.split(",")[0]}, baked to crunch`, feature: focus.callouts.join(" | "), scene: "The pack as a premium 3D product shot at a 3/4 angle on a round podium, our cookies and ingredients around it" },
    { kind: "side-left", header: "Turn It Around", sub: "Everything on the side of the pack", feature: "", scene: "The real left side of the pack, on a soft, warm background" },
    { kind: "side-right", header: "Made The Honest Way", sub: "The other side of the story", feature: "", scene: "The real right side of the pack, on a soft, warm background" },
    { kind: "back", header: "Nothing To Hide", sub: "Read the back: every word", feature: "", scene: "The real back of the pack, on a soft background" },
    { kind: "nutrition", header: "Fuel That Lasts", sub: "Nutrition per 100 g, as printed on the pack", feature: focus.callouts.join(" | "), scene: "The real nutrition panel, large and readable, on a clean background" },
    { kind: "ingredients", header: "Only Real Ingredients", sub: topIngredients.length ? `${topIngredients.join(", ")} and more` : "Every ingredient, as on the pack", feature: "", scene: "The real ingredients, as small piles around the list" },
    { kind: "usage", header: "Your Anytime Snack", sub: "Four ways to enjoy it", feature: focus.usage.join(" | "), scene: "A cosy table with a cup of chai, a cup of coffee and a jar of peanut butter, a hand dipping a cookie in chai" },
    {
      kind: "comparison",
      header: "Ours vs Regular Biscuits",
      sub: "See why families are switching",
      feature: "",
      scene: "A warm kitchen table",
      comparison: { us: "Puŕ Fermé", them: "Regular biscuits", rows: rows.length ? rows : [{ label: "Millets", us: "Yes", them: "Rarely" }] },
    },
  ];
}

/** Puts any plan into the standard order: a slide of each kind where the plan has one, the default where it doesn't. */
export function toStandardStack(plan: { slides: Slide[] }, defaults: Slide[]): Slide[] {
  const pool = [...plan.slides];
  return STANDARD_STACK.map((kind, i) => {
    const j = pool.findIndex((s) => s.kind === kind);
    if (j >= 0) return pool.splice(j, 1)[0];
    return defaults[i];
  });
}

/** The ingredients as separate items, percentages kept ("Foxtail millet (23.8%), Oats (16.4%), …"), commas inside brackets respected. */
export function ingredientItems(text: string, max = 12): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of text.replace(/^\s*ingredients?\s*:\s*/i, "")) {
    if (ch === "(" || ch === "[") depth++;
    if (ch === ")" || ch === "]") depth = Math.max(0, depth - 1);
    if ((ch === "," || ch === ";") && depth === 0) {
      if (cur.trim()) out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim().replace(/\.$/, ""));
  return out.slice(0, max);
}
