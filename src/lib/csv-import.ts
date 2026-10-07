import type { MarketplaceInput, MetaInput } from "./verdicts";

/** "₹1,234.50", "Rs 1,234", "12.5%", " 3 " → number; blanks and "--" → null. */
export function parseNumber(raw: unknown): number | null {
  if (raw == null) return null;
  const s = String(raw).replace(/₹|rs\.?|inr|,|\s/gi, "").replace(/%$/, "");
  if (s === "" || s === "-" || s === "--") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export type MetaField = "name" | "spend" | "impressions" | "plays3s" | "hookRate" | "ctr" | "linkClicks" | "results" | "cpa" | "frequency";
export type MarketField = "name" | "impressions" | "clicks" | "ctr" | "spend" | "sales" | "acos" | "roas" | "orders" | "conversion";

export const META_FIELDS: { key: MetaField; label: string; patterns: RegExp[] }[] = [
  { key: "name", label: "Ad name", patterns: [/^ad name$/i, /ad name/i, /^name$/i] },
  { key: "spend", label: "Amount spent", patterns: [/amount spent/i, /^spend/i, /cost$/i] },
  { key: "impressions", label: "Impressions", patterns: [/^impressions$/i, /impressions/i] },
  { key: "plays3s", label: "3-second video plays", patterns: [/3.?second video plays/i, /3s (video )?plays/i, /video plays at 3/i] },
  { key: "hookRate", label: "Hook rate %", patterns: [/hook rate/i, /thumb.?stop/i] },
  { key: "ctr", label: "Link CTR %", patterns: [/ctr \(link click/i, /link ctr/i, /link click.?through rate/i] },
  { key: "linkClicks", label: "Link clicks", patterns: [/^link clicks$/i, /link clicks/i] },
  { key: "results", label: "Results / purchases", patterns: [/^results$/i, /^purchases$/i, /website purchases/i] },
  { key: "cpa", label: "Cost per result", patterns: [/cost per result/i, /cost per purchase/i, /^cpa/i] },
  { key: "frequency", label: "Frequency", patterns: [/^frequency$/i, /frequency/i] },
];

export const MARKET_FIELDS: { key: MarketField; label: string; patterns: RegExp[] }[] = [
  { key: "name", label: "Search term / campaign", patterns: [/customer search term/i, /search term/i, /keyword/i, /campaign name/i, /^campaign$/i, /ad (group )?name/i] },
  { key: "impressions", label: "Impressions / views", patterns: [/^impressions$/i, /impressions/i, /^views$/i] },
  { key: "clicks", label: "Clicks", patterns: [/^clicks$/i, /clicks/i] },
  { key: "ctr", label: "CTR %", patterns: [/click.?thru rate/i, /click.?through rate/i, /^ctr/i] },
  { key: "spend", label: "Spend", patterns: [/^spend$/i, /ad spend/i, /spend/i, /^cost$/i] },
  { key: "sales", label: "Sales / revenue", patterns: [/total sales/i, /^sales/i, /revenue/i] },
  { key: "acos", label: "ACoS %", patterns: [/acos/i, /advertising cost of sales/i] },
  { key: "roas", label: "ROAS / ROI", patterns: [/roas/i, /return on ad spend/i, /^roi$/i] },
  { key: "orders", label: "Orders / units", patterns: [/total orders/i, /^orders/i, /units sold/i, /conversions$/i] },
  { key: "conversion", label: "Conversion rate %", patterns: [/conversion rate/i, /^cvr/i] },
];

export function guessMapping<K extends string>(headers: string[], fields: { key: K; patterns: RegExp[] }[]): Partial<Record<K, string>> {
  const out: Partial<Record<K, string>> = {};
  const used = new Set<string>();
  for (const f of fields) {
    for (const re of f.patterns) {
      const h = headers.find((x) => !used.has(x) && re.test(x.trim()));
      if (h) {
        out[f.key] = h;
        used.add(h);
        break;
      }
    }
  }
  return out;
}

type Row = Record<string, unknown>;

/** Spend with zero sales: ACoS is effectively infinite; 999% keeps it storable and always over the cut line. */
export const NO_SALES_ACOS = 999;
const get = <K extends string>(row: Row, map: Partial<Record<K, string>>, k: K) => (map[k] ? parseNumber(row[map[k]!]) : null);
const pct = (num: number | null, den: number | null) => (num != null && den ? (num / den) * 100 : null);

/** Rates exported as fractions (0.012) are converted to percentages (1.2). */
function asPercent(v: number | null, raw: unknown, header: string | undefined): number | null {
  if (v == null) return null;
  if (String(raw ?? "").includes("%") || /%/.test(header ?? "")) return v;
  return v > 0 && v <= 1 ? v * 100 : v;
}

export type MappedRow<T> = { name: string; input: T | null; missing: string[] };

export function rowToMetaInput(row: Row, map: Partial<Record<MetaField, string>>, targetCpa: number): MappedRow<MetaInput> {
  const spend = get(row, map, "spend");
  const impressions = get(row, map, "impressions");
  const hookRate = asPercent(get(row, map, "hookRate"), map.hookRate && row[map.hookRate], map.hookRate) ?? pct(get(row, map, "plays3s"), impressions);
  // Meta exports CTR as a percentage already (e.g. 1.23).
  const ctr = get(row, map, "ctr") ?? pct(get(row, map, "linkClicks"), impressions);
  const results = get(row, map, "results");
  const cpa = get(row, map, "cpa") ?? (spend != null && results ? spend / results : null);
  const frequency = get(row, map, "frequency") ?? 0;
  const missing: string[] = [];
  if (spend == null) missing.push("spend");
  if (hookRate == null) missing.push("hook rate (or 3-second plays + impressions)");
  if (ctr == null) missing.push("link CTR (or link clicks + impressions)");
  const name = String((map.name && row[map.name]) || "(unnamed)");
  if (missing.length) return { name, input: null, missing };
  return { name, input: { targetCpa, spend: spend!, hookRate: hookRate!, ctr: ctr!, cpa, frequency }, missing };
}

export function rowToMarketplaceInput(row: Row, map: Partial<Record<MarketField, string>>, targetAcos: number): MappedRow<MarketplaceInput> {
  const impressions = get(row, map, "impressions");
  const clicks = get(row, map, "clicks");
  const spend = get(row, map, "spend");
  const sales = get(row, map, "sales");
  const orders = get(row, map, "orders");
  const ctr = asPercent(get(row, map, "ctr"), map.ctr && row[map.ctr], map.ctr) ?? pct(clicks, impressions);
  const roas = get(row, map, "roas");
  const acos =
    asPercent(get(row, map, "acos"), map.acos && row[map.acos], map.acos) ??
    (spend != null && sales ? (spend / sales) * 100 : roas ? 100 / roas : spend ? NO_SALES_ACOS : null);
  const conversionRate = asPercent(get(row, map, "conversion"), map.conversion && row[map.conversion], map.conversion) ?? pct(orders, clicks) ?? 0;
  const missing: string[] = [];
  if (clicks == null) missing.push("clicks");
  if (ctr == null) missing.push("CTR (or impressions)");
  if (acos == null) missing.push("ACoS (or spend + sales)");
  const name = String((map.name && row[map.name]) || "(unnamed)");
  if (missing.length) return { name, input: null, missing };
  return { name, input: { targetAcos, acos: acos!, ctr: ctr!, conversionRate, clicks: clicks! }, missing };
}
