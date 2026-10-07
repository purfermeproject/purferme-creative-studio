import type { Platform, ProductStatus, Severity } from "@/lib/types";
import type { ComparisonRow } from "./schema";
import { DEFAULT_THRESHOLDS } from "@/lib/verdicts";

const split = (s: string) =>
  s
    .split(";")
    .map((x) => x.trim())
    .filter(Boolean);

export const SEED_BRAND = {
  brandContext: `Puŕ Fermé Project ("pure farm"). Indian clean-label, traceable functional foods, launched 2024. Positioning: "Food labels shouldn't need decoding." Ingredient percentages shown openly; QR on pack traces sourcing from seed to fork. Tagline: Made for real days. Tone: warm, witty, plain-spoken, light humour (e.g. "spreadably elite", "your morning coffee's new crunch-mate"); never preachy, fear-based or shaming. Website offers: free shipping above Rs 600, extra 5% off above Rs 1,000. Buyers: urban working adults 25–40 wanting a better snack with chai/coffee; parents of kids 4–12 who read labels; fitness-curious adults wanting a protein snack that tastes good.`,
  hardRules: `Use ONLY the product's green claims. Amber claims only when flagged as amber. Never use red claims. No disease, cure, immunity, growth, brain, heart, weight or digestion claims. No AI doctors, nutritionists or experts. No AI person describing a health result. No before/after. No "100%", "pure", "healthy", "guilt-free", "gluten free". Never target or depict children under 2. Real customer quotes only if marked as needing written permission.`,
  tone: `Warm, witty, plain-spoken, light humour (e.g. "spreadably elite", "your morning coffee's new crunch-mate"). Never preachy, fear-based or shaming.`,
  angles: [
    "Taste first",
    "Coffee/chai ritual",
    "Tiffin and lunchbox",
    "Ingredient % transparency",
    "Seed-to-fork QR traceability",
    "The swap (replace a snack occasion)",
    "No maida, no refined sugar",
    "Protein number",
    "Festive gifting",
    "Founder and farm story",
  ],
  personas: [
    "Working professional 25–35, city",
    "Parent of kids 4–12",
    "Fitness-curious adult",
    "College student",
    "Picky grandparent",
    "Couple sharing breakfast",
    "Founder/farm team (real footage only)",
  ],
  languages: ["English", "Hinglish", "Hindi", "Marathi", "Tamil", "Bengali", "Gujarati"],
  verdictThresholds: DEFAULT_THRESHOLDS,
};

export const SEED_PRODUCTS: {
  slug: string;
  name: string;
  priceText: string;
  status: ProductStatus;
  statusReason: string;
  greenClaims: string[];
  amberClaims: string[];
  redClaims: string[];
  notes: string;
  allergens: string;
}[] = [
  {
    slug: "choc",
    name: "Chocolate Cookies, millet & oats, 240g",
    priceText: "",
    status: "ready",
    statusReason: "",
    greenClaims: split(
      "Made with foxtail millet and rolled oats; No maida; No palm oil; No refined sugar, sweetened with jaggery; Cocoa; Ingredient % shown on website; Traceability QR on pack; 12 cookies, 240g; Pairs with coffee or chai",
    ),
    amberClaims: ["Fibre/protein content (grams per serving only)", '"Wholesome"'],
    redClaims: split(
      'Gluten free; Healthy/guilt-free; Heart health; Healthy digestion; Packed with protein; "Naturally sweetened" implying low sugar',
    ),
    notes: "Amazon hero (4.6 stars, Amazon's Choice).",
    allergens: "Contains nuts and milk.",
  },
  {
    slug: "bfast",
    name: "Breakfast Cookies, millet & oats, 240g",
    priceText: "",
    status: "ready",
    statusReason: "",
    greenClaims: split(
      "Made with foxtail millet (23.8%) and rolled oats (16.4%); No maida; No palm oil; No refined sugar, sweetened with jaggery; Cardamom and cinnamon; Almonds and cashews; Your morning coffee's crunch-mate; Traceability QR; 12 cookies, 240g",
    ),
    amberClaims: ["Fibre content (grams per serving only)", '"Wholesome"'],
    redClaims: split("Gluten free; Healthy/guilt-free; Dry fruits; Free from harmful additives; Packed with protein, fiber and nutrients"),
    notes: "Amazon rating 3.6.",
    allergens: "Contains nuts and milk.",
  },
  {
    slug: "bar",
    name: "PuŕGrain Millet Bar, 10g protein",
    priceText: "",
    status: "ready",
    statusReason: "",
    greenClaims: split("10g protein per bar; Made with millets and seeds"),
    amberClaims: ['"High protein" (check FSSAI threshold)', '"Energy"'],
    redClaims: split("Muscle building; Weight loss; Healthy"),
    notes: "",
    allergens: "",
  },
  {
    slug: "pbu",
    name: "Peanut Butter Unsweetened 500g",
    priceText: "",
    status: "ready",
    statusReason: "",
    greenClaims: split("Just slow-roasted peanuts (confirm pack); No added sugar"),
    amberClaims: ["Protein per serving"],
    redClaims: split("100% natural; Pure; Healthy"),
    notes: "",
    allergens: "Contains peanuts.",
  },
  {
    slug: "pbr",
    name: "Ragi & Cocoa Peanut Butter with jaggery 500g",
    priceText: "",
    status: "ready",
    statusReason: "",
    greenClaims: split("Made with ragi, cocoa and jaggery; No refined sugar"),
    amberClaims: [],
    redClaims: split("Healthy; Guilt-free"),
    notes: "",
    allergens: "Contains peanuts.",
  },
  {
    slug: "gro",
    name: "Pur'Gro Nutremi(x) 4+ years",
    priceText: "",
    status: "hold",
    statusReason: "Product page has unconfirmed nutrition values and mismatched reviews.",
    greenClaims: split(
      "7g protein per 30g serving; Contains algal DHA; No refined sugar; No artificial preservatives or colours; Made with sprouted foxtail millet and green gram",
    ),
    amberClaims: split('Number of vitamins/minerals; Digestion/DigeZyme claims; "Health mix"'),
    redClaims: split("Growth, height, immunity, brain or bone claims; Brand comparisons"),
    notes: "Hold: product page has unconfirmed nutrition values and mismatched reviews.",
    allergens: "",
  },
  {
    slug: "charge",
    name: "Pur'Charge Nutremi(x) 13+ years",
    priceText: "",
    status: "hold",
    statusReason: "Hold until audited.",
    greenClaims: [],
    amberClaims: [],
    redClaims: ["Growth, immunity, brain claims"],
    notes: "Hold until audited.",
    allergens: "",
  },
  {
    slug: "sunrise",
    name: "Sunrise Bowl porridge mixes",
    priceText: "",
    status: "blocked",
    statusReason:
      "Flipkart lists it as baby food 6–24 months; the IMS Act bans promoting foods for under-2s. No advertising while it is listed this way.",
    greenClaims: [],
    amberClaims: [],
    redClaims: ["Any advertising while listed for 6–24 months"],
    notes: "Blocked: Flipkart lists it as baby food 6–24 months; the IMS Act bans promoting foods for under-2s.",
    allergens: "",
  },
  {
    slug: "greenx",
    name: "Pur'GreenX, adults, mixed berries",
    priceText: "",
    status: "hold",
    statusReason: "Out of stock; claims not reviewed.",
    greenClaims: [],
    amberClaims: [],
    redClaims: [],
    notes: "Out of stock; claims not reviewed.",
    allergens: "",
  },
];

type SeedTerm = { label: string; regex: string; severity: Severity; platform: Platform | null; productSlug: string | null };

const all = (severity: Severity, items: [string, string][]): SeedTerm[] =>
  items.map(([label, regex]) => ({ label, regex, severity, platform: null, productSlug: null }));

export const SEED_TERMS: SeedTerm[] = [
  ...all("red", [
    ["Healthy / healthier", String.raw`\bhealth(y|ier|iest)\b`],
    ["Guilt-free", String.raw`guilt[\s-]?free`],
    ["Gluten free", String.raw`gluten[\s-]?free`],
    ["100%", String.raw`100\s?%`],
    ["Pure", String.raw`\bpure\b`],
    ["Immunity", String.raw`\bimmun\w*`],
    ["Heart", String.raw`\bheart\b`],
    ["Digestion / gut", String.raw`\bdigest\w*|\bgut\b|bloat\w*|constipat\w*`],
    ["Cure / prevent", String.raw`\bcur(e|es|ing)\b|\bprevent\w*`],
    ["Weight loss / slimming", String.raw`weight[\s-]?loss|lose weight|fat[\s-]?burn\w*|\bslim\w*`],
    ["Brain / growth / height", String.raw`\bbrain\b|\bgrowth\b|\bheight\b`],
    ["Doctors / experts / clinical", String.raw`\bdoctor\w*|\bnutritionist\w*|\bdietitian\w*|clinically`],
    ["Diabetes / cholesterol / blood sugar", String.raw`\bdiabet\w*|cholesterol|blood sugar`],
    ["Detox / superfood", String.raw`\bdetox\w*|superfood`],
    ["FSSAI approved", String.raw`fssai[\s-]?approved`],
    ["Harmful", String.raw`harmful`],
    ["Boost", String.raw`\bboost\w*`],
  ]),
  ...all("amber", [
    ["Nutrient content claim", String.raw`packed with|loaded with|rich in|high[\s-]in|high[\s-]protein|source of`],
    ["Energy", String.raw`\benerg\w*`],
    ["Natural", String.raw`\bnatural\w*`],
    ["Clean", String.raw`\bclean\b`],
    ["Wholesome / nutritious", String.raw`wholesome|nutritious|nourish\w*`],
    ["Best / No. 1", String.raw`\bbest\b|no\.?\s?1\b|number one`],
  ]),
  { label: "Mentions Amazon", regex: String.raw`\bamazon\b`, severity: "red", platform: "amazon", productSlug: null },
  { label: '"Click here"', regex: String.raw`click here`, severity: "red", platform: "amazon", productSlug: null },
  {
    label: "Implies viewer has a condition",
    regex: String.raw`\b(are you|if you('re| are)|your)\b[^.?!]{0,40}\b(overweight|tired|sick|bloated|fat|unhealthy|diabetic)`,
    severity: "red",
    platform: "meta",
    productSlug: null,
  },
  { label: "Before/after", regex: String.raw`before\s*(and|&|/)\s*after`, severity: "red", platform: "meta", productSlug: null },
  {
    label: "Infant / baby / 6–24 months",
    regex: String.raw`\binfant\w*|\bbaby\b|\b6\s?-\s?24\s?months?\b`,
    severity: "red",
    platform: "flipkart",
    productSlug: null,
  },
  { label: "Dry fruit (Breakfast Cookies)", regex: String.raw`dry fruit`, severity: "red", platform: null, productSlug: "bfast" },
];

const META_GUIDE = `## How Meta works for us

Meta is a **discovery feed**. Nobody is searching for millet cookies; they are scrolling past friends, reels and news. The algorithm reads the creative itself (visuals, words, audio) to decide *who* sees it. That means:

- **Variety is targeting.** Ads that look alike get treated as one ad and shown to the same people. Brief concepts that differ on at least two of persona, angle, format, setting and language.
- **The first 2 seconds decide everything.** Hook in the first 2 seconds, product on screen by 3 seconds.
- **Sound on, but captions always.** Burn captions in, because plenty of people watch muted.

## Formats

| Type | Spec | Use it for |
|---|---|---|
| UGC-style video | 9:16, 15–30s | The workhorse. Real creators or customers, real kitchens and desks. |
| Static image | 4:5 | Fast tests of a single message or offer. |
| Carousel | 3–5 cards | Ingredient %, the swap, the product range. |
| Real-customer review video | 9:16 | Social proof. Quotes must be real, verbatim and permissioned. |

## Rules we never break

- **Invite, never assume.** Never imply the viewer has a health condition, weight or body issue. "Are you tired of…" is out.
- **No before/after** or transformation framing.
- Dietary products target **18+**.
- Any synthetic (AI) person carries a **continuous "AI-generated" label** and may only talk about taste, routine or pairing, never results.
- Primary text in two variants: **taste-first** and **proof-first**. Headline under 40 characters.

## What good looks like

- A working professional dunking a Chocolate Cookie in chai at their desk, captioned "3pm called. It wants chai."
- A parent reading the ingredient % on the pack while a kid packs a tiffin.
- A fitness-curious adult splitting a bar after a run, "10g protein, tastes like a cookie."

## What to measure

Hook rate (3-second views ÷ impressions), link CTR, CPA against target, and 7-day frequency. Frequency above 3 means it is time to brief replacements.`;

const AMAZON_GUIDE = `## How Amazon works for us

Amazon is **search intent**. The shopper typed "millet cookies" or "jaggery cookies" and is comparing listings side by side. The creative's job is to **win the click, then convert**.

- The **listing is the landing page**. Price, rating, reviews and the image stack do most of the converting.
- Sponsored Brands video is **16:9 and autoplays muted**, so on-screen text has to carry every message.

## Formats

| Type | Spec | Use it for |
|---|---|---|
| Sponsored Brands video | 16:9, 1920×1080, 15–30s, muted | Standing out in search results. |
| Listing image stack | 7 images | Converting the click. |
| SB headline + custom image | Headline under 50 characters | Brand presence on search. |
| A+ content module plan | Modules below the fold | Telling the ingredient and traceability story. |

## Rules we never break

- **Product in the first 2 seconds**, brand name and logo on screen.
- Product, pack, flavour and size **exactly match the live listing**.
- **Never mention Amazon** or use its logos. CTAs are specific ("Shop now"), never "click here".
- **No references to bodily functions or conditions.** No unsupported or exaggerated claims.
- **Real footage only** for any person. AI-generated people are likely to be rejected.
- Main listing image: **pack only, on pure white**.

## Image stack order

1. Main: pack on pure white
2. Nutrition infographic
3. Ingredient %
4. How to eat / pairing
5. QR traceability
6. Pack size and servings
7. Lifestyle

## What to measure

ACoS (or ROAS) against target, CTR, and conversion rate **by search term**. Terms that convert are gold: move them to exact match and reuse the wording in Meta hooks.`;

const FLIPKART_GUIDE = `## How Flipkart works for us

Flipkart is **listing-led**. Product Listing Ads (PLA) are built from the listing's own images and title, so **the images are the ad**. Display banners need Flipkart approval and mostly matter around sale events (Big Billion Days, Diwali).

## Formats

| Type | Spec | Use it for |
|---|---|---|
| Listing image set | 7 images | Every PLA impression. Mobile-legible, claim-safe. |
| Display banner | Homepage / category | Brand moments; needs approval. |
| Short product video | 16:9 | Growing; product-first. |
| Sale-event banner set | Big Billion Days, Diwali | Price and offer led. |

## Rules we never break

- **Category and age must be correct.** Never list or advertise anything as baby food for under-2s (IMS Act).
- **Claims match the listing and the pack**, nothing beyond.
- Banners: **headline under 6 words, pack visible, price or offer clear**.
- Exact banner specs come from the Flipkart Ads panel, so design **adaptable layouts** (safe zones, stackable text).
- **Mobile-first:** big text, one message per image.

## What to measure

ROI, CTR and conversion on PLA. If CTR is low, fix the main image and title before raising bids.`;

const COMPARISON_ROWS = [
  "How shoppers arrive",
  "Job of the creative",
  "Main formats",
  "Video shape",
  "People on screen",
  "Volume",
  "Biggest risks",
  "What to measure",
];

const zipRows = (values: string[]): ComparisonRow[] => COMPARISON_ROWS.map((row, i) => ({ row, value: values[i] }));

export const SEED_PLATFORM_RULES: {
  platform: Platform;
  creativeTypes: string[];
  rules: string;
  guideMarkdown: string;
  comparison: ComparisonRow[];
}[] = [
  {
    platform: "meta",
    creativeTypes: [
      "9:16 UGC-style video (15–30s)",
      "Static image ad (4:5)",
      "Carousel (3–5 cards)",
      "Real-customer review video",
    ],
    rules: `9:16 vertical, sound on, captions burned in. Hook in the first 2 seconds, product on screen by 3s. Each concept differs from the others on at least two of persona, angle, format, setting, language. Never imply the viewer has a health condition, weight or body issue (invite, don't assume). No before/after. Dietary products target 18+. Give primary text in two variants (taste-first, proof-first) and a headline under 40 characters. Any synthetic AI person carries a continuous on-screen "AI-generated" label and may only talk about taste, routine or pairing, never results.`,
    guideMarkdown: META_GUIDE,
    comparison: zipRows([
      "Scrolling, not searching",
      "Stop the scroll; creative decides who sees it",
      "9:16 video, 4:5 static, carousel",
      "Vertical 9:16, sound on",
      "Real creators/customers; labelled AI personas for taste/routine only",
      "20+ new ads a month, genuinely different",
      "Implying health status, before/after, look-alike ads",
      "Hook rate, CTR, CPA, frequency",
    ]),
  },
  {
    platform: "amazon",
    creativeTypes: [
      "Sponsored Brands video (16:9, muted)",
      "Listing image stack (7 images)",
      "Sponsored Brands headline + custom image",
      "A+ content module plan",
    ],
    rules: `SB video 16:9 (1920x1080), 15–30s, autoplays muted, so on-screen text carries every message; product in the first 2 seconds; brand name and logo on screen. Product, pack, flavour and size exactly match the live listing. Never mention Amazon or use its logos. Specific CTAs ("Shop now"), never "click here". No unsupported or exaggerated claims. Never reference bodily functions or conditions. Real footage for any person; no AI-generated people. Main listing image: pack only on pure white. Headlines under 50 characters. Image stack order: main, nutrition infographic, ingredient %, how to eat/pairing, QR traceability, pack size and servings, lifestyle.`,
    guideMarkdown: AMAZON_GUIDE,
    comparison: zipRows([
      "Searching with intent",
      "Win the click, then convert",
      "Sponsored Products, Sponsored Brands video, SB headline",
      "Landscape 16:9, muted autoplay",
      "Real footage only",
      "2–4 SB videos + full image stack per hero",
      "Mentioning Amazon, bodily functions, listing mismatch",
      "ACoS/ROAS, conversion by search term",
    ]),
  },
  {
    platform: "flipkart",
    creativeTypes: [
      "Listing image set (7 images)",
      "Display banner (homepage/category)",
      "Short product video (16:9)",
      "Sale-event banner set (Big Billion Days)",
    ],
    rules: `PLA uses listing images and titles, so images must be accurate, mobile-legible and claim-safe. Banners need Flipkart approval: headline under 6 words, pack visible, price or offer clear. Category and age must be correct (never baby food for under-2s). Claims match the listing and pack. Exact banner specs come from the Flipkart Ads panel, so design adaptable layouts. Mobile-first: big text, one message per image.`,
    guideMarkdown: FLIPKART_GUIDE,
    comparison: zipRows([
      "Searching or browsing sale pages",
      "Make listing image and title win; banners for sale events",
      "PLA, PCA, display banners",
      "Mostly images; 16:9 video growing",
      "Product-first",
      "7–9 listing images per product + sale banners",
      "Wrong category or age, claims beyond listing",
      "ROI, CTR, conversion on PLA",
    ]),
  },
];
