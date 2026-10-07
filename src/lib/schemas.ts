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
  }),
  ai_prompt: z.string().describe("Render prompt for AI-safe shots; the pack reference image is attached separately"),
  needs_real_person: z.boolean(),
  ai_label_needed: z.boolean(),
  claims: z.array(z.object({ text: z.string(), tier: z.enum(["green", "amber"]) })),
  why_it_fits: z.string(),
});

export const GenerationResponseSchema = z.object({ concepts: z.array(ConceptSchema) });

export type Concept = z.infer<typeof ConceptSchema>;
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
