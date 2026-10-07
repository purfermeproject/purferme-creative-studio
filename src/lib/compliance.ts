import type { Platform, Severity } from "./types";

/** The subset of a compliance_terms row the scanner needs. */
export type Term = {
  label: string;
  regex: string;
  severity: Severity;
  platform: Platform | null;
  productSlug: string | null;
  active?: boolean;
};

export type ScanHit = { label: string; severity: Severity; matches: string[] };
export type ScanResult = { hits: ScanHit[] };

export type Segment = { text: string; severity: Severity | null; labels: string[] };

const SEVERITY_RANK: Record<Severity, number> = { amber: 1, red: 2 };

/** Terms that apply to this platform and product (null = applies to all). */
export function applicableTerms(terms: Term[], platform: Platform, productSlug?: string | null): Term[] {
  return terms.filter(
    (t) =>
      t.active !== false &&
      (t.platform == null || t.platform === platform) &&
      (t.productSlug == null || (productSlug != null && t.productSlug === productSlug)),
  );
}

function compile(regex: string): RegExp | null {
  try {
    return new RegExp(regex, "gi");
  } catch {
    return null;
  }
}

/** Returns null when the pattern is valid, otherwise the error message. */
export function regexError(regex: string): string | null {
  try {
    new RegExp(regex, "gi");
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

type Match = { start: number; end: number; text: string };

function findMatches(re: RegExp, text: string): Match[] {
  const out: Match[] = [];
  re.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m[0].length === 0) {
      re.lastIndex++;
      continue;
    }
    out.push({ start: m.index, end: m.index + m[0].length, text: m[0] });
  }
  return out;
}

/**
 * Scan text against compliance terms. Red hits must be fixed before launch,
 * amber hits need evidence. Invalid regexes are skipped.
 */
export function scan(text: string, platform: Platform, productSlug: string | null | undefined, terms: Term[]): ScanResult {
  const hits: ScanHit[] = [];
  for (const term of applicableTerms(terms, platform, productSlug)) {
    const re = compile(term.regex);
    if (!re) continue;
    const found = findMatches(re, text);
    if (found.length === 0) continue;
    const unique = [...new Set(found.map((f) => f.text.toLowerCase()))];
    hits.push({ label: term.label, severity: term.severity, matches: unique });
  }
  hits.sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]);
  return { hits };
}

export function redCount(result: ScanResult | null | undefined): number {
  return result?.hits.filter((h) => h.severity === "red").length ?? 0;
}

export function amberCount(result: ScanResult | null | undefined): number {
  return result?.hits.filter((h) => h.severity === "amber").length ?? 0;
}

/**
 * Split text into segments marked with the highest severity that covers them,
 * for inline highlighting. Adjacent characters with the same marking merge.
 */
export function highlight(text: string, platform: Platform, terms: Term[], productSlug?: string | null): Segment[] {
  if (!text) return [];
  const sev: (Severity | null)[] = new Array(text.length).fill(null);
  const labels: Set<string>[] = Array.from({ length: text.length }, () => new Set<string>());

  for (const term of applicableTerms(terms, platform, productSlug)) {
    const re = compile(term.regex);
    if (!re) continue;
    for (const m of findMatches(re, text)) {
      for (let i = m.start; i < m.end; i++) {
        const cur = sev[i];
        if (cur == null || SEVERITY_RANK[term.severity] > SEVERITY_RANK[cur]) sev[i] = term.severity;
        labels[i].add(term.label);
      }
    }
  }

  const segments: Segment[] = [];
  let start = 0;
  const key = (i: number) => `${sev[i]}|${[...labels[i]].sort().join(",")}`;
  for (let i = 1; i <= text.length; i++) {
    if (i === text.length || key(i) !== key(start)) {
      segments.push({ text: text.slice(start, i), severity: sev[start], labels: [...labels[start]] });
      start = i;
    }
  }
  return segments;
}

/** Everything in a concept that a viewer could see or hear, joined for scanning. */
export function conceptText(c: {
  title?: string;
  hook?: string;
  frames?: { slot?: string; visual?: string; onscreen?: string; audio?: string }[];
  copy?: { headline?: string; body?: string; body_alt?: string; cta?: string };
  claims?: { text: string }[];
  ai_prompt?: string;
}): string {
  const parts: (string | undefined)[] = [c.title, c.hook];
  for (const f of c.frames ?? []) parts.push(f.visual, f.onscreen, f.audio);
  if (c.copy) parts.push(c.copy.headline, c.copy.body, c.copy.body_alt, c.copy.cta);
  for (const cl of c.claims ?? []) parts.push(cl.text);
  parts.push(c.ai_prompt);
  return parts.filter(Boolean).join("\n");
}
