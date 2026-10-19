import { z } from "zod";
import type { CreativeSnapshot } from "@/db/schema";
import type { Concept } from "./schemas";

/** Editable content sent by autosave. Limits stop runaway payloads, not normal writing. */
export const SnapshotSchema = z.object({
  title: z.string().trim().min(1, "Give the ad a title.").max(200),
  hook: z.string().max(500),
  persona: z.string().max(200),
  angle: z.string().max(200),
  format: z.string().max(200),
  language: z.string().max(60),
  frames: z
    .array(z.object({ slot: z.string().max(80), visual: z.string().max(2000), onscreen: z.string().max(500), audio: z.string().max(1000).optional() }))
    .max(12),
  copy: z.object({
    headline: z.string().max(300).optional(),
    body: z.string().max(3000).optional(),
    body_alt: z.string().max(3000).optional(),
    cta: z.string().max(60).optional(),
    variants: z.array(z.object({ headline: z.string().max(300), body: z.string().max(3000), cta: z.string().max(60) })).max(8).optional(),
  }),
  aiPrompt: z.string().max(4000),
  needsRealPerson: z.boolean(),
  aiLabelNeeded: z.boolean(),
  claims: z.array(z.object({ text: z.string().max(300), tier: z.enum(["green", "amber"]) })).max(20),
  whyItFits: z.string().max(2000),
});

export const SNAPSHOT_KEYS = Object.keys(SnapshotSchema.shape) as (keyof CreativeSnapshot)[];

/** The editable part of a creative row. */
export function snapshotOf(c: CreativeSnapshot): CreativeSnapshot {
  return Object.fromEntries(SNAPSHOT_KEYS.map((k) => [k, c[k]])) as CreativeSnapshot;
}

export function conceptToSnapshot(c: Concept): CreativeSnapshot {
  return {
    title: c.title,
    hook: c.hook,
    persona: c.persona,
    angle: c.angle,
    format: c.format,
    language: c.language,
    frames: c.frames,
    copy: c.copy,
    aiPrompt: c.ai_prompt,
    needsRealPerson: c.needs_real_person,
    aiLabelNeeded: c.ai_label_needed,
    claims: c.claims,
    whyItFits: c.why_it_fits,
  };
}

export function snapshotToConcept(s: CreativeSnapshot): Concept {
  return {
    title: s.title,
    persona: s.persona,
    angle: s.angle,
    format: s.format,
    language: s.language,
    hook: s.hook,
    frames: s.frames,
    copy: s.copy,
    ai_prompt: s.aiPrompt,
    needs_real_person: s.needsRealPerson,
    ai_label_needed: s.aiLabelNeeded,
    claims: s.claims,
    why_it_fits: s.whyItFits,
  };
}

const FIELD_LABELS: Record<keyof CreativeSnapshot, string> = {
  title: "title",
  hook: "hook",
  persona: "audience",
  angle: "angle",
  format: "format",
  language: "language",
  frames: "scenes",
  copy: "copy",
  aiPrompt: "render prompt",
  needsRealPerson: "real-person flag",
  aiLabelNeeded: "AI-label flag",
  claims: "claims",
  whyItFits: "rationale",
};

const stable = (v: unknown) => JSON.stringify(v, (_k, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort()) : x));

/** Human-readable list of what changed between two snapshots ("hook, copy"). */
export function changedFields(a: CreativeSnapshot, b: CreativeSnapshot): string[] {
  return SNAPSHOT_KEYS.filter((k) => stable(a[k]) !== stable(b[k])).map((k) => FIELD_LABELS[k]);
}

/** Autosaves from the same person within this window update one version instead of piling up. */
export const AUTOSAVE_COALESCE_MS = 10 * 60 * 1000;

export function shouldCoalesce(
  latest: { source: string; createdBy: string; createdAt: Date } | null,
  user: string,
  now: Date,
): boolean {
  return Boolean(latest && latest.source === "autosave" && latest.createdBy === user && now.getTime() - latest.createdAt.getTime() < AUTOSAVE_COALESCE_MS);
}
