import { conceptText, scan, type ScanResult, type Term } from "./compliance";
import type { Platform } from "./types";

/**
 * Brand and claims validation for one creative. Pure, so the server (which
 * enforces it) and the browser (which shows it while editing) agree.
 */

export type ValidatableConcept = {
  title: string;
  hook: string;
  frames: { slot?: string; visual?: string; onscreen?: string; audio?: string }[];
  copy: { headline?: string; body?: string; body_alt?: string; cta?: string; variants?: { headline: string; body: string; cta: string }[] };
  claims: { text: string; tier: "green" | "amber" }[];
  ai_prompt: string;
  needs_real_person: boolean;
  ai_label_needed: boolean;
};

export type ProductKnowledge = {
  slug: string;
  greenClaims: string[];
  amberClaims: string[];
  redClaims: string[];
  claimEvidence?: { claim: string; evidence: string; source?: string }[];
};

export type ClaimStatus = "approved" | "needs-evidence" | "unverified" | "restricted";
export type ClaimCheck = { text: string; tier: "green" | "amber"; status: ClaimStatus; matched?: string; evidence?: string; source?: string };

/** block = must fix; review = a person must confirm; brand = advisory; info = reminder. */
export type IssueLevel = "block" | "review" | "brand" | "info";
export type Issue = { id: string; level: IssueLevel; title: string; detail: string };

export type Validation = {
  scan: ScanResult;
  claims: ClaimCheck[];
  issues: Issue[];
  blocking: number;
  needsHumanReview: boolean;
};

const STOP = new Set(["a", "an", "the", "of", "to", "in", "on", "for", "is", "it", "its", "your", "our"]);

export function normalizeClaim(s: string): string {
  return s
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9%.]+/g, " ")
    .replace(/\s\.|\.\s|\.$/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

const tokens = (s: string) => new Set(normalizeClaim(s).split(" ").filter((t) => t && !STOP.has(t)));

/** Library claims split into the separate statements they contain ("No maida; sweetened with jaggery"). */
function segments(claim: string): string[] {
  return [claim, ...claim.split(/[;,(]|\bbut\b/)].map(normalizeClaim).filter((s) => s.length > 2);
}

/**
 * True when a claim used in an ad is covered by a library claim: one contains the
 * other, or they share almost all their words. "No sugar" does not match
 * "No refined sugar", on purpose.
 */
export function claimMatches(used: string, library: string): boolean {
  const u = normalizeClaim(used);
  if (!u) return false;
  for (const seg of segments(library)) {
    if (seg === u || seg.includes(u) || (u.includes(seg) && seg.split(" ").length >= 2)) return true;
  }
  const a = tokens(used);
  const b = tokens(library);
  if (a.size < 2 || b.size < 2) return false;
  const inter = [...a].filter((t) => b.has(t)).length;
  return inter / new Set([...a, ...b]).size >= 0.8;
}

/** Words to look for from a restricted claim: '"Naturally sweetened" implying…' → ["naturally sweetened"]; "Healthy/guilt-free" → two phrases. */
export function restrictedPhrases(red: string): string[] {
  const quoted = [...red.matchAll(/["“]([^"”]+)["”]/g)].map((m) => m[1]);
  const base = quoted.length ? quoted : red.split("/");
  return base.map((p) => p.trim().toLowerCase()).filter((p) => p.length >= 3);
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Only what a viewer reads or hears (not the internal render prompt or shot notes). */
export function viewerText(c: ValidatableConcept): string {
  const parts: (string | undefined)[] = [c.hook];
  for (const f of c.frames) parts.push(f.onscreen, f.audio);
  parts.push(c.copy.headline, c.copy.body, c.copy.body_alt, c.copy.cta);
  for (const v of c.copy.variants ?? []) parts.push(v.headline, v.body, v.cta);
  for (const cl of c.claims) parts.push(cl.text);
  return parts.filter(Boolean).join("\n");
}

const LIMITS: Record<Platform, { headline: number; body?: number; label: string }> = {
  meta: { headline: 40, body: 125, label: "Meta" },
  amazon: { headline: 50, label: "Amazon Sponsored Brands" },
  flipkart: { headline: 40, label: "Flipkart" },
};

export function checkClaims(c: ValidatableConcept, product: ProductKnowledge): ClaimCheck[] {
  return c.claims.map((cl) => {
    const red = product.redClaims.find((r) => restrictedPhrases(r).some((p) => normalizeClaim(cl.text).includes(normalizeClaim(p))) || claimMatches(cl.text, r));
    if (red) return { ...cl, status: "restricted", matched: red };
    const green = product.greenClaims.find((g) => claimMatches(cl.text, g));
    if (green) return { ...cl, status: "approved", matched: green };
    const amber = product.amberClaims.find((a) => claimMatches(cl.text, a));
    if (amber) {
      const ev = (product.claimEvidence ?? []).find((e) => claimMatches(e.claim, amber) || claimMatches(cl.text, e.claim));
      return { ...cl, tier: "amber", status: "needs-evidence", matched: amber, evidence: ev?.evidence, source: ev?.source };
    }
    return { ...cl, status: "unverified" };
  });
}

export function validateCreative(input: {
  concept: ValidatableConcept;
  platform: Platform;
  product: ProductKnowledge | null;
  terms: Term[];
  avoidPhrases?: string[];
  /** Competitor hooks and quoted lines (from research); our copy shouldn't echo them. */
  competitorLines?: string[];
}): Validation {
  const { concept: c, platform, product } = input;
  const scanResult = scan(conceptText(c), platform, product?.slug ?? null, input.terms);
  const issues: Issue[] = [];

  for (const h of scanResult.hits) {
    issues.push(
      h.severity === "red"
        ? { id: `scan:${h.label}`, level: "block", title: `Not allowed: ${h.label}`, detail: `Remove “${h.matches.join("”, “")}”. Red terms can't run.` }
        : { id: `scan:${h.label}`, level: "review", title: `Needs evidence: ${h.label}`, detail: `“${h.matches.join("”, “")}” is only allowed with evidence on file.` },
    );
  }

  const claims = product ? checkClaims(c, product) : [];
  const seen = viewerText(c).toLowerCase();
  const flagged = scanResult.hits.flatMap((h) => h.matches.map((m) => m.toLowerCase()));
  if (product) {
    for (const red of product.redClaims) {
      const hit = restrictedPhrases(red).find((p) => new RegExp(`(^|[^a-z])${escapeRe(p)}([^a-z]|$)`, "i").test(seen));
      if (hit && !flagged.some((f) => f.includes(hit) || hit.includes(f))) {
        issues.push({ id: `red:${red}`, level: "block", title: "Restricted claim for this product", detail: `“${hit}” is on this product's never-use list (${red}).` });
      }
    }
  }
  for (const cl of claims) {
    if (cl.status === "restricted" && !issues.some((i) => i.id === `red:${cl.matched}`)) {
      issues.push({ id: `claim:${cl.text}`, level: "block", title: "Restricted claim used", detail: `“${cl.text}” matches a never-use claim (${cl.matched}).` });
    } else if (cl.status === "needs-evidence") {
      issues.push({
        id: `claim:${cl.text}`,
        level: "review",
        title: "Amber claim: confirm the evidence",
        detail: cl.evidence ? `“${cl.text}”. Evidence on file: ${cl.evidence}${cl.source ? ` (${cl.source})` : ""}.` : `“${cl.text}”. No evidence is recorded for this claim in the product profile.`,
      });
    } else if (cl.status === "unverified") {
      issues.push({ id: `claim:${cl.text}`, level: "review", title: "Claim not in the product library", detail: `“${cl.text}” doesn't match any approved claim. Confirm it's true and allowed, or remove it.` });
    }
  }

  for (const phrase of input.avoidPhrases ?? []) {
    if (phrase.length >= 3 && new RegExp(`(^|[^a-z])${escapeRe(phrase.toLowerCase())}([^a-z]|$)`).test(seen)) {
      issues.push({ id: `avoid:${phrase}`, level: "brand", title: "Overused phrase", detail: `“${phrase}” is on the brand's avoid list. Say it more specifically.` });
    }
  }
  for (const hit of closeToCompetitor(c, input.competitorLines ?? [], product?.greenClaims ?? [])) {
    issues.push({ id: `copy:${hit.theirs}`, level: "review", title: "Sounds like a competitor", detail: `“${hit.ours}” is close to a competitor's line “${hit.theirs}”. Rewrite it in our own words.` });
  }
  const limit = LIMITS[platform];
  const headlines = [c.copy.headline, ...(c.copy.variants ?? []).map((v) => v.headline)].filter(Boolean) as string[];
  for (const h of headlines) {
    if (h.length > limit.headline) issues.push({ id: `len:h:${h}`, level: "brand", title: "Headline may be cut off", detail: `“${h}” is ${h.length} characters; ${limit.label} shows about ${limit.headline}.` });
  }
  if (limit.body) {
    const bodies = [c.copy.body, c.copy.body_alt, ...(c.copy.variants ?? []).map((v) => v.body)].filter(Boolean) as string[];
    const long = bodies.filter((b) => b.length > limit.body!);
    if (long.length) {
      issues.push({ id: "len:body", level: "info", title: "Primary text runs past “See more”", detail: `${long.length} primary text${long.length > 1 ? "s are" : " is"} over ${limit.body} characters; put the hook and the proof in the first line.` });
    }
  }
  if (c.hook.trim().split(/\s+/).length > 14) {
    issues.push({ id: "hook:long", level: "brand", title: "Hook is long", detail: "Hooks land best in under about 12 words (2 seconds, sound off)." });
  }
  issues.push(...attentionIssues(c, platform));
  const ctas = [c.copy.cta, ...(c.copy.variants ?? []).map((v) => v.cta)].filter((x) => x?.trim());
  if (!ctas.length) issues.push({ id: "cta", level: "info", title: "No call to action", detail: "Add a CTA such as Shop now or Learn more." });
  if (c.ai_label_needed) issues.push({ id: "ai-label", level: "info", title: "Show an AI label", detail: "A synthetic person or realistic synthetic scene appears: label it for as long as it's on screen (ASCI)." });
  if (c.needs_real_person) issues.push({ id: "real-person", level: "info", title: "Needs a real person", detail: "Some shots need real people filmed with permission; don't generate them." });

  const blocking = issues.filter((i) => i.level === "block").length;
  return { scan: scanResult, claims, issues, blocking, needsHumanReview: issues.some((i) => i.level === "review") };
}

const AD_SPEAK = /^(looking for|are you looking|introducing|say hello to|meet (the|our)|presenting|discover the|try (the|our)|the perfect|want a|need a|craving a|searching for)\b/i;
const SHOWS_PRODUCT = /\b(pack(et)?|pouch|box|jar|bar|cookies?|product|label|bite|spread|wrapper)\b/i;
const isVideoFrames = (c: ValidatableConcept) => c.frames.length > 1 && c.frames.some((f) => /\d\s*s\b/.test(f.slot ?? ""));
const words = (s?: string) => (s?.trim() ? s.trim().split(/\s+/).length : 0);

/**
 * How the ad will meet a real viewer: does it stop a scroll, work with the sound
 * off, show the product in time and stay easy to process? Advisory, never blocking.
 */
export function attentionIssues(c: ValidatableConcept, platform: Platform): Issue[] {
  const out: Issue[] = [];
  const video = isVideoFrames(c);
  if (AD_SPEAK.test(c.hook.trim())) {
    out.push({
      id: "attn:ad-speak",
      level: "brand",
      title: "Hook sounds like an ad",
      detail: "People scroll past anything that looks like advertising in the first second. Open on their moment, an action or a surprising fact instead.",
    });
  }
  if (video && !c.frames[0]?.onscreen?.trim()) {
    out.push({
      id: "attn:sound-off",
      level: "brand",
      title: "First scene has no on-screen text",
      detail: `Many people watch ${platform === "meta" ? "Reels and feed videos" : "autoplaying ads"} muted at first. Put the hook on screen in the first 2 seconds.`,
    });
  }
  if (video && !c.frames.slice(0, 2).some((f) => SHOWS_PRODUCT.test(`${f.visual ?? ""} ${f.onscreen ?? ""}`))) {
    out.push({
      id: "attn:product-late",
      level: "info",
      title: "Show the product by about 3 seconds",
      detail: "Most viewers leave in the first few seconds; if the product appears late they remember the moment but not the brand.",
    });
  }
  if (c.claims.length > 3) {
    out.push({
      id: "attn:claims",
      level: "brand",
      title: "Too many claims at once",
      detail: `${c.claims.length} claims compete for attention. One sharp proof point is easier to believe and remember; keep the rest for the listing.`,
    });
  }
  const maxWords = platform === "meta" ? 15 : 12;
  if (!video) {
    const busy = c.frames.filter((f) => words(f.onscreen) > maxWords).length;
    if (busy) {
      out.push({
        id: "attn:busy",
        level: "brand",
        title: "Too much text to read on a phone",
        detail: `${busy} image${busy > 1 ? "s have" : " has"} more than ${maxWords} words on it. ${platform === "meta" ? "In a feed" : "As a small thumbnail"} people take in one short line; move the rest to the caption or listing.`,
      });
    }
  }
  return out;
}

/** Our visible lines that closely echo a competitor's (same words, mostly). */
export function closeToCompetitor(c: ValidatableConcept, lines: string[], greenClaims: string[] = []): { ours: string; theirs: string }[] {
  if (!lines.length) return [];
  // Words from our own approved claims don't count: saying our claim isn't copying them.
  const shared = new Set(greenClaims.flatMap((g) => [...tokens(g)]));
  const own = (s: string) => new Set([...tokens(s)].filter((x) => !shared.has(x)));
  const ours = [c.hook, c.copy.headline, c.copy.body, ...c.frames.map((f) => f.onscreen), ...(c.copy.variants ?? []).flatMap((v) => [v.headline, v.body])].filter(
    (x): x is string => Boolean(x && x.trim()),
  );
  const out: { ours: string; theirs: string }[] = [];
  for (const theirs of lines) {
    const t = own(theirs);
    if (t.size < 3) continue;
    const tn = normalizeClaim(theirs);
    for (const o of ours) {
      if (greenClaims.some((g) => claimMatches(o, g))) continue;
      const on = normalizeClaim(o);
      const ot = own(o);
      const inter = [...t].filter((x) => ot.has(x)).length;
      if (on.includes(tn) || (ot.size >= 3 && inter / Math.min(t.size, ot.size) >= 0.75 && inter >= 3)) {
        out.push({ ours: o, theirs });
        break;
      }
    }
  }
  return out;
}
