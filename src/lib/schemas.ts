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
  claims: z.array(z.object({ text: z.string(), tier: z.enum(["green", "amber"]) })).describe("Claims the idea leans on"),
  why: z.string().describe("Why it serves the objective on this platform, one sentence"),
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
  format: z.string(),
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
