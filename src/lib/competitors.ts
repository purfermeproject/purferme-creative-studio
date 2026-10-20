import "server-only";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { isMock, MODEL, OPENAI_TEXT_MODEL, structuredCall, textProvider, UserFacingError } from "./ai";
import { getBrand, getProducts } from "./data";
import { mockCompetitorAnalysis, mockDiscovery } from "./mocks";
import { buildCompetitorPrompt, buildDiscoveryPrompt, type CompetitorContext, type DiscoveryFocus } from "./prompts";
import { CompetitorAnalysisSchema, CompetitorDiscoverySchema } from "./schemas";
import type { WebSource } from "./ai";

export async function listCompetitors() {
  return db.select().from(schema.competitorAds).orderBy(desc(schema.competitorAds.createdAt)).limit(200);
}

/** The analysed competitor ad as prompt context, or null. */
export async function competitorContext(id: string): Promise<CompetitorContext | null> {
  const [c] = await db.select().from(schema.competitorAds).where(eq(schema.competitorAds.id, id));
  if (!c?.analysis) return null;
  return {
    brand: c.brand,
    summary: c.analysis.summary,
    hook: c.analysis.hook,
    angle: c.analysis.angle,
    claims: c.analysis.claims_made.map((x) => x.text),
    whiteSpace: c.analysis.white_space,
  };
}

export async function analyseCompetitor(id: string, user: string) {
  const [c] = await db.select().from(schema.competitorAds).where(eq(schema.competitorAds.id, id));
  if (!c) throw new UserFacingError("That competitor ad no longer exists.");
  let image: { mediaType: "image/png" | "image/jpeg" | "image/webp" | "image/gif"; base64: string } | null = null;
  if (c.imageAssetId) {
    const [a] = await db.select({ mime: schema.assets.mime, data: schema.assets.dataBase64 }).from(schema.assets).where(eq(schema.assets.id, c.imageAssetId));
    if (a && ["image/png", "image/jpeg", "image/webp", "image/gif"].includes(a.mime)) image = { mediaType: a.mime as "image/png", base64: a.data };
  }
  if (!image && !c.adText.trim()) throw new UserFacingError("Paste the ad's text or upload a screenshot first, so there's something to analyse.");
  const [brand, products] = await Promise.all([getBrand(), getProducts()]);
  const prompt = buildCompetitorPrompt(
    brand,
    products.filter((p) => p.status === "ready"),
    { brand: c.brand, product: c.product, channel: c.channel, adText: c.adText, notes: c.notes, hasImage: Boolean(image), researched: c.source === "research" },
  );
  const analysis = await structuredCall({
    schema: CompetitorAnalysisSchema,
    prompt,
    image,
    maxTokens: 12000,
    effort: "medium",
    meta: { user, kind: "competitor" },
    mock: () => mockCompetitorAnalysis(c.brand),
  });
  const model = isMock() ? "mock" : textProvider() === "openai" ? OPENAI_TEXT_MODEL : MODEL;
  await db.update(schema.competitorAds).set({ analysis, analysisModel: model, analysedAt: new Date() }).where(eq(schema.competitorAds.id, id));
  return { analysis, model };
}

/** "https://www.Example.com/a/?x=1#y" → "example.com/a" so citations can be matched to search results. */
export function urlKey(url: string): string {
  try {
    const u = new URL(url);
    return `${u.hostname.replace(/^www\./, "").toLowerCase()}${u.pathname.replace(/\/+$/, "")}`;
  } catch {
    return "";
  }
}

const OWN_BRAND = /pu[rŕ]\s*ferm[eé]/i;

/**
 * Searches the web for competitors in a category, saves new ones (skipping our
 * own brand and brands already tracked) with their sources, and returns their ids.
 */
export async function discoverCompetitors(opts: { category: string; focus: DiscoveryFocus; count: number; productId: string | null; user: string }) {
  const [brand, products, existing] = await Promise.all([getBrand(), getProducts(), listCompetitors()]);
  const product = products.find((p) => p.id === opts.productId) ?? null;
  const tracked = existing.map((e) => e.brand);
  const prompt = buildDiscoveryPrompt(brand, product, { category: opts.category, focus: opts.focus, count: opts.count, exclude: tracked });
  let searched: WebSource[] = [];
  const result = await structuredCall({
    schema: CompetitorDiscoverySchema,
    prompt,
    maxTokens: 24000,
    effort: "medium",
    webSearch: { maxUses: Math.min(15, opts.count * 2 + 4) },
    onSources: (s) => (searched = s),
    meta: { user: opts.user, kind: "competitor-research", productId: product?.id ?? null },
    mock: () => mockDiscovery(opts.category, opts.count),
  });
  const seen = new Set(searched.map((s) => urlKey(s.url)).filter(Boolean));
  const already = new Set(tracked.map((b) => b.trim().toLowerCase()));
  const fresh = result.competitors.filter((c) => c.brand.trim() && !OWN_BRAND.test(c.brand) && !already.has(c.brand.trim().toLowerCase())).slice(0, opts.count);
  const ids: string[] = [];
  for (const c of fresh) {
    const sources = c.sources
      .filter((s) => /^https?:\/\//i.test(s.url))
      .map((s) => ({ title: s.title.slice(0, 200), url: s.url.slice(0, 1000), verified: seen.has(urlKey(s.url)) }))
      .slice(0, 8);
    const [row] = await db
      .insert(schema.competitorAds)
      .values({
        brand: c.brand.slice(0, 100),
        product: c.products.slice(0, 150),
        channel: c.channels.join(", ").slice(0, 60),
        adText: [c.messaging && `Messaging: ${c.messaging}`, c.claims.length && `Claims: ${c.claims.join("; ")}`].filter(Boolean).join("\n").slice(0, 5000),
        notes: [c.positioning, c.price && `Price: ${c.price}`, c.focus_notes, c.why_relevant && `Why relevant: ${c.why_relevant}`].filter(Boolean).join("\n").slice(0, 2000),
        link: sources.find((s) => s.verified)?.url ?? sources[0]?.url ?? "",
        source: "research",
        category: opts.category.slice(0, 150),
        focus: opts.focus,
        sources,
        createdBy: opts.user,
      })
      .returning({ id: schema.competitorAds.id });
    ids.push(row.id);
  }
  return {
    ids,
    summary: result.category_summary,
    gaps: result.gaps,
    skipped: result.competitors.length - fresh.length,
    mock: isMock(),
  };
}
