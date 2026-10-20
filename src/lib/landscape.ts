import type { CompetitorAnalysis } from "./schemas";

/** "Chocolate Cookies, millet & oats, 240g" → "chocolate cookies, millet & oats" (the category we search for). */
export const categoryFrom = (name: string) => name.replace(/,?\s*\d+\s*(g|kg|ml|l)\b.*$/i, "").trim().toLowerCase();

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9%]+/g, " ").trim();

/** Research made for this product, or (older entries) for its category. */
export function matchesProduct(row: { productId: string | null; productIds?: string[]; category: string }, product: { id: string; name: string }): boolean {
  if (row.productIds?.length || row.productId) return Boolean(row.productIds?.includes(product.id) || row.productId === product.id);
  const cat = norm(row.category);
  const mine = norm(categoryFrom(product.name));
  return Boolean(cat) && (cat === mine || mine.includes(cat) || cat.includes(mine));
}

/** True when a competitor was seen on this platform (its listing, or where it sells/advertises). */
export function seenOn(row: { channel: string; listing?: { platform: string } | null }, platform: "meta" | "amazon" | "flipkart"): boolean {
  if (row.listing?.platform === platform) return true;
  const ch = row.channel.toLowerCase();
  return platform === "meta" ? /instagram|facebook|meta|reel/.test(ch) : ch.includes(platform);
}

export type Landscape = {
  brands: string[];
  hooks: string[];
  angles: string[];
  riskyClaims: string[];
  /** Craft that works for competitors (structure, pacing, proof), to adapt in our own words. */
  whatWorks: string[];
  whiteSpace: string[];
  gaps: string[];
  summary: string;
};

/** Takes item i from each list in turn, so no single competitor dominates. */
function interleave(lists: string[][], max: number): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (let i = 0; out.length < max && lists.some((l) => i < l.length); i++) {
    for (const l of lists) {
      const v = l[i]?.trim();
      if (!v || seen.has(norm(v))) continue;
      seen.add(norm(v));
      out.push(v);
      if (out.length >= max) break;
    }
  }
  return out;
}

/** Everything we've learned about a product's competitors, condensed for prompts and the brief. */
export function buildLandscape(
  rows: { brand: string; analysis: CompetitorAnalysis | null }[],
  research: { summary: string; gaps: string[] } | null,
): Landscape | null {
  const analysed = rows.filter((r) => r.analysis);
  if (!analysed.length && !research) return null;
  const a = analysed.map((r) => r.analysis!);
  return {
    brands: analysed.map((r) => r.brand),
    hooks: interleave(a.map((x) => [x.hook]), 10),
    angles: interleave(a.map((x) => [x.angle]), 10),
    riskyClaims: interleave(a.map((x) => x.claims_made.filter((c) => c.risk === "risky").map((c) => c.text)), 10),
    whatWorks: interleave(a.map((x) => x.what_works), 10),
    whiteSpace: interleave(a.map((x) => x.white_space), 10),
    gaps: research?.gaps.slice(0, 8) ?? [],
    summary: research?.summary ?? "",
  };
}

/** Competitor lines our copy must not echo: their hooks plus anything quoted in what we saved. */
export function competitorLines(rows: { adText: string; analysis: CompetitorAnalysis | null }[]): string[] {
  const out = new Set<string>();
  for (const r of rows) {
    if (r.analysis?.hook) out.add(r.analysis.hook.replace(/^[“"']+|[”"']+$/g, ""));
    for (const m of r.adText.matchAll(/[“"]([^”"]{12,200})[”"]/g)) out.add(m[1]);
  }
  return [...out].filter((l) => norm(l).split(" ").length >= 4).slice(0, 200);
}
