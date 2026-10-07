import { conceptText, scan, type ScanResult, type Term } from "./compliance";
import type { Concept } from "./schemas";
import { PLATFORM_LABELS, type Platform } from "./types";

export type ScoredConcept = Concept & { platform: Platform; scan: ScanResult };

/** Cross-platform variations are titled "For Amazon: …" / "For Flipkart: …". */
export function conceptPlatform(c: Pick<Concept, "title">, fallback: Platform): Platform {
  const m = /^\s*for (meta|amazon|flipkart)\b/i.exec(c.title);
  return m ? (m[1].toLowerCase() as Platform) : fallback;
}

/** Always re-scan server-side; the model's own claims list is never trusted alone. */
export function scoreConcept(c: Concept, platform: Platform, productSlug: string | null, terms: Term[]): ScoredConcept {
  const p = conceptPlatform(c, platform);
  return { ...c, platform: p, scan: scan(conceptText(c), p, productSlug, terms) };
}

export function conceptToText(c: Concept & { platform?: Platform; scan?: ScanResult }): string {
  const out: string[] = [];
  out.push(c.title.toUpperCase());
  out.push(
    [c.platform ? PLATFORM_LABELS[c.platform] : null, c.persona, c.angle, c.format, c.language].filter(Boolean).join(" · "),
  );
  out.push(c.needs_real_person ? "Needs real person" : "AI-safe footage");
  if (c.ai_label_needed) out.push("Show AI label");
  out.push("", `HOOK: ${c.hook}`, "", "FRAMES:");
  for (const f of c.frames) {
    out.push(`- [${f.slot}] Visual: ${f.visual}`);
    if (f.onscreen) out.push(`  On-screen: ${f.onscreen}`);
    if (f.audio) out.push(`  Audio: ${f.audio}`);
  }
  out.push("", "COPY:");
  if (c.copy.headline) out.push(`Headline: ${c.copy.headline}`);
  if (c.copy.body) out.push(`Primary text: ${c.copy.body}`);
  if (c.copy.body_alt) out.push(`Variant: ${c.copy.body_alt}`);
  if (c.copy.cta) out.push(`CTA: ${c.copy.cta}`);
  out.push("", `WHY IT FITS: ${c.why_it_fits}`);
  if (c.claims.length) out.push("", "CLAIMS:", ...c.claims.map((cl) => `- [${cl.tier}] ${cl.text}`));
  if (c.scan) {
    const hits = c.scan.hits.map((h) => `- [${h.severity}] ${h.label}: ${h.matches.join(", ")}`);
    out.push("", "SCAN:", ...(hits.length ? hits : ["- No flagged terms"]));
  }
  out.push("", "AI RENDER PROMPT:", c.ai_prompt);
  return out.join("\n");
}
