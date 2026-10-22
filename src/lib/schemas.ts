import { z } from "zod";

// Kept free of min/max constraints so the same schema works for structured
// outputs; count and length rules are enforced in code after parsing.

export const FrameSchema = z.object({
  slot: z.string().describe("Timestamp range for video (e.g. 0–2s) or image/banner name"),
  visual: z.string(),
  onscreen: z.string().describe("On-screen text; empty string if none"),
  audio: z.string().optional().describe("Voiceover/dialogue/music for video; omit for images"),
});

export const ConceptSchema = z.object({
  title: z.string(),
  persona: z.string(),
  angle: z.string(),
  format: z.string(),
  language: z.string(),
  hook: z.string(),
  frames: z.array(FrameSchema),
  copy: z.object({
    headline: z.string().optional(),
    body: z.string().optional(),
    body_alt: z.string().optional(),
    cta: z.string().optional(),
    variants: z
      .array(z.object({ headline: z.string(), body: z.string(), cta: z.string() }))
      .optional()
      .describe("Extra copy variants for testing; required for ad copy sets, otherwise omit"),
  }),
  ai_prompt: z.string().describe("Render prompt for AI-safe shots; the pack reference image is attached separately"),
  needs_real_person: z.boolean(),
  ai_label_needed: z.boolean(),
  claims: z.array(z.object({ text: z.string(), tier: z.enum(["green", "amber"]) })),
  why_it_fits: z.string(),
});

export const GenerationResponseSchema = z.object({ concepts: z.array(ConceptSchema) });

export type Concept = z.infer<typeof ConceptSchema>;

/** A short direction to choose from before the full creative is written. */
export const ProposalSchema = z.object({
  title: z.string(),
  angle: z.string(),
  persona: z.string(),
  big_idea: z.string().describe("The idea in 1–2 sentences: the moment, the twist and the proof point"),
  hook: z.string().describe("The opening line or on-screen text for the first 2 seconds"),
  format: z.string(),
  hook_mechanism: z.string(),
  lever: z.string().optional().describe("The main persuasion lever it builds on, from the list in the brief (e.g. Sensory appeal)"),
  claims: z.array(z.object({ text: z.string(), tier: z.enum(["green", "amber"]) })).describe("Claims the idea leans on"),
  why: z.string().describe("Why it serves the objective on this platform, one sentence"),
  based_on: z
    .string()
    .optional()
    .describe("Which proven competitor pattern it adapts, or which open ground it takes, in a few words; omit if neither"),
});
export const ProposalsResponseSchema = z.object({ proposals: z.array(ProposalSchema) });
export type Proposal = z.infer<typeof ProposalSchema>;
export type GenerationResponse = z.infer<typeof GenerationResponseSchema>;

export const DeepCheckSchema = z.object({
  verdict: z.enum(["pass", "fix", "block"]),
  issues: z.array(
    z.object({
      quote: z.string().describe("Exact words from the copy"),
      problem: z.string(),
      rule: z.string().describe("Which rule or regulation it breaks"),
      fix: z.string(),
    }),
  ),
  rewrite: z.string().describe("Full compliant rewrite of the copy, same language and length"),
});
export type DeepCheck = z.infer<typeof DeepCheckSchema>;

export const WeeklyBriefSchema = z.object({
  winners: z.array(z.object({ name: z.string(), why: z.string() })),
  losers: z.array(z.object({ name: z.string(), why: z.string() })),
  patterns: z.array(z.string()).describe("What winners share: angle, persona, format, language, hook"),
  search_terms: z.array(z.object({ term: z.string(), note: z.string() })).describe("Converting marketplace search terms"),
  next_concepts: z.array(
    z.object({ title: z.string(), platform: z.string(), angle: z.string(), persona: z.string(), format: z.string(), hook: z.string() }),
  ),
  summary: z.string(),
});
export type WeeklyBrief = z.infer<typeof WeeklyBriefSchema>;

export const DesignReadSchema = z.object({
  text: z.string().describe("Every visible word in reading order, exactly as written (keep spelling mistakes), one block per line"),
  people_visible: z.boolean(),
  people_note: z.string().describe("Who appears (e.g. adult, child, apparent expert/doctor) or empty"),
  logo_visible: z.boolean(),
  pack_visible: z.boolean(),
  looks_ai_generated: z.boolean().describe("True if parts look synthetic (warped hands, garbled text, odd faces)"),
  ai_label_visible: z.boolean().describe("True if an 'AI-generated' style label is shown"),
  notes: z.array(z.string()).describe("Short design observations: legibility, clutter, text over busy areas, before/after framing, etc."),
});
export type DesignRead = z.infer<typeof DesignReadSchema>;

/** Breakdown of a competitor's ad: what it does, and where we can be different (never a copy). */
export const CompetitorAnalysisSchema = z.object({
  summary: z.string().describe("What the ad is, in 1–2 sentences"),
  hook: z.string().describe("Their opening line or visual, quoted or described"),
  hook_mechanism: z.string(),
  angle: z.string(),
  audience: z.string().describe("Who it seems aimed at"),
  format: z.string().describe("Ad format or where the message appears, e.g. Instagram reel, Amazon listing title, product page copy"),
  offer: z.string().describe("Price, discount or offer; empty if none"),
  claims_made: z.array(
    z.object({
      text: z.string(),
      risk: z.enum(["ok", "check", "risky"]).describe("risky = would break our hard rules or FSSAI/ASCI if we said it"),
      note: z.string(),
    }),
  ),
  what_works: z.array(z.string()).describe("Craft we can learn from (structure, pacing, proof), not words to copy"),
  weaknesses: z.array(z.string()),
  white_space: z.array(z.string()).describe("Angles, moments or proof points they don't own that our product can credibly claim"),
  counter_ideas: z
    .array(z.object({ title: z.string(), hook: z.string(), angle: z.string(), why: z.string() }))
    .describe("3 ideas for us that are clearly different, using only our allowed claims"),
});
export type CompetitorAnalysis = z.infer<typeof CompetitorAnalysisSchema>;

/** Competitors found by web search for one product category. */
export const CompetitorDiscoverySchema = z.object({
  category_summary: z.string().describe("2–3 sentences on how this category is marketed in India right now"),
  competitors: z.array(
    z.object({
      brand: z.string(),
      products: z.string().describe("Their competing product(s), with pack size if known"),
      positioning: z.string().describe("How they position themselves, in one sentence"),
      price: z.string().describe("Price and pack size as seen, with where; empty if not found"),
      messaging: z.string().describe("Their main taglines, hooks and ad lines as actually seen, quoted where possible"),
      claims: z.array(z.string()).describe("Claims they make on pack, listing or ads"),
      channels: z.array(z.string()).describe("Where they sell or advertise (website, Amazon, Flipkart, Blinkit, Instagram…)"),
      focus_notes: z.string().describe("What you found about the requested focus"),
      why_relevant: z.string(),
      sources: z.array(z.object({ title: z.string(), url: z.string() })).describe("Pages you actually read for this brand"),
    }),
  ),
  gaps: z.array(z.string()).describe("Openings in the category that nobody owns yet"),
});
export type CompetitorDiscovery = z.infer<typeof CompetitorDiscoverySchema>;

/** One marketplace listing as seen on Amazon.in or Flipkart. */
export const ListingInsightSchema = z.object({
  brand: z.string(),
  title: z.string().describe("The listing title exactly as shown"),
  url: z.string(),
  price: z.string().describe("Selling price as shown, e.g. Rs 299; empty if not seen"),
  pack_size: z.string(),
  price_per_100g: z.string().describe("Work it out if price and size are known; else empty"),
  rating: z.string().describe("e.g. 4.3; empty if not seen"),
  review_count: z.string().describe("e.g. 12,480 ratings; empty if not seen"),
  badges: z.array(z.string()).describe("Bestseller, Amazon's Choice, Flipkart Assured, Limited time deal…"),
  rank: z.string().describe("Best Sellers Rank or position in search, if seen"),
  image_stack: z.string().describe("What the listing images show, in order (main image, infographics, lifestyle, back of pack…)"),
  a_plus: z.string().describe("A+ / brand content modules seen; empty if none"),
  title_keywords: z.array(z.string()),
  praise: z.array(z.string()).describe("What reviewers repeatedly like"),
  complaints: z.array(z.string()).describe("What reviewers repeatedly complain about"),
  offers: z.string().describe("Coupons, bank offers, subscribe & save, combos"),
});
export type ListingInsight = z.infer<typeof ListingInsightSchema>;

/** What's working on a marketplace for a category, plus what to do about it. */
export const MarketplaceResearchSchema = z.object({
  summary: z.string().describe("2–3 sentences: what the winning listings in this category have in common"),
  listings: z.array(ListingInsightSchema),
  playbook: z.object({
    title_formula: z.string().describe("The title pattern winners use, as a template"),
    must_have_keywords: z.array(z.string()),
    image_stack: z.array(z.string()).describe("Recommended images in order, slot by slot"),
    a_plus_modules: z.array(z.string()),
    price_and_pack: z.string().describe("Where the price/pack sweet spot is"),
    review_themes_to_answer: z.array(z.string()).describe("Doubts and complaints our listing and ads should answer up front"),
    ad_tips: z.array(z.string()).describe("Sponsored Products/Brands or Flipkart Ads practices that the winners show"),
    for_our_product: z.array(z.string()).describe("Specific changes for our product, using only our allowed claims"),
  }),
});
export type MarketplaceResearch = z.infer<typeof MarketplaceResearchSchema>;

/** A Shopify product listing, written to Shopify's own field limits. */
export const ShopifyListingSchema = z.object({
  title: z.string().describe("Product title: product type, key benefit or flavour, and size; 70 characters or fewer"),
  body_html: z
    .string()
    .describe("Description as simple HTML using only <p>, <h3>, <ul>, <li>, <strong>: opening line, why you'll love it, what's inside (ingredients), how to enjoy, storage and pack size"),
  seo_title: z.string().describe("Page title for Google, 70 characters or fewer"),
  seo_description: z.string().describe("Meta description for Google, 160 characters or fewer, with the product type and one reason to buy"),
  product_type: z.string().describe("e.g. Cookies, Nut butter, Snack bar"),
  tags: z.array(z.string()).describe("5–10 lower-case tags for collections and site search"),
  image_alts: z
    .array(z.string())
    .describe("Alt text for the new images, in this order: 1 the pack on its own, 2 the key facts card, 3 lifestyle. Plain description, 125 characters or fewer each"),
  facts: z.array(z.string()).describe("3 or 4 short lines for the key facts image (2–5 words each), only from approved claims and product facts"),
});
export type ShopifyListing = z.infer<typeof ShopifyListingSchema>;
