import "server-only";
import { and, desc, eq, isNull, or } from "drizzle-orm";
import { db, schema } from "@/db";
import { isMock, MODEL, OPENAI_TEXT_MODEL, structuredCall, textProvider, UserFacingError } from "./ai";
import { getBrand, getProducts } from "./data";
import { mockCompetitorAnalysis, mockDiscovery, mockMarketplace } from "./mocks";
import { buildCompetitorPrompt, buildDiscoveryPrompt, buildMarketplacePrompt, type CompetitorContext, type DiscoveryFocus, type PlaybookContext } from "./prompts";
import { CompetitorAnalysisSchema, CompetitorDiscoverySchema, MarketplaceResearchSchema } from "./schemas";
import type { WebSource } from "./ai";
import { buildLandscape, competitorLines, matchesProduct, seenOn, type Landscape } from "./landscape";

export async function listCompetitors() {
  return db.select().from(schema.competitorAds).orderBy(desc(schema.competitorAds.createdAt)).limit(200);
}

/** The analysed competitor ad as prompt context, or null. */
export async function competitorContext(id: string, product?: { id: string; name: string }): Promise<CompetitorContext | null> {
  const [c] = await db.select().from(schema.competitorAds).where(eq(schema.competitorAds.id, id));
  if (!c?.analysis) return null;
  // A competitor of another product is ignored rather than steering this brief.
  if (product && !matchesProduct(c, product)) return null;
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
  const byBrand = new Map(existing.map((e) => [e.brand.trim().toLowerCase(), e]));
  const found = result.competitors.filter((c) => c.brand.trim() && !OWN_BRAND.test(c.brand));
  const fresh = found.filter((c) => !byBrand.has(c.brand.trim().toLowerCase())).slice(0, opts.count);
  // Brands we already track that also compete with this product: link them to it too.
  let linked = 0;
  if (product) {
    for (const c of found) {
      const prev = byBrand.get(c.brand.trim().toLowerCase());
      if (prev && !prev.productIds.includes(product.id)) {
        // Older rows are matched by category only; keep those matches when adding an explicit link.
        const current = prev.productIds.length || prev.productId ? prev.productIds : products.filter((p) => matchesProduct(prev, p)).map((p) => p.id);
        await linkProduct(prev.id, current, product.id);
        linked++;
      }
    }
  }
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
        productId: product?.id ?? null,
        productIds: product ? [product.id] : [],
        category: opts.category.slice(0, 150),
        focus: opts.focus,
        sources,
        createdBy: opts.user,
      })
      .returning({ id: schema.competitorAds.id });
    ids.push(row.id);
  }
  await db.insert(schema.categoryResearch).values({
    productId: product?.id ?? null,
    category: opts.category.slice(0, 150),
    summary: result.category_summary,
    gaps: result.gaps.slice(0, 12),
    model: isMock() ? "mock" : textProvider() === "openai" ? OPENAI_TEXT_MODEL : MODEL,
    createdBy: opts.user,
  });
  return {
    ids,
    summary: result.category_summary,
    gaps: result.gaps,
    skipped: result.competitors.length - fresh.length - linked,
    linked,
    mock: isMock(),
  };
}

/**
 * Studies the strongest Amazon/Flipkart listings for a category: saves the
 * playbook, and saves (or updates) each listing's brand as a competitor.
 */
export async function researchMarketplace(opts: { platform: "amazon" | "flipkart"; category: string; count: number; productId: string | null; user: string }) {
  const [brand, products, existing] = await Promise.all([getBrand(), getProducts(), listCompetitors()]);
  const product = products.find((p) => p.id === opts.productId) ?? null;
  let searched: WebSource[] = [];
  const result = await structuredCall({
    schema: MarketplaceResearchSchema,
    prompt: buildMarketplacePrompt(brand, product, opts),
    maxTokens: 32000,
    effort: "medium",
    webSearch: { maxUses: Math.min(20, opts.count * 2 + 6) },
    onSources: (s) => (searched = s),
    meta: { user: opts.user, kind: `research-${opts.platform}`, platform: opts.platform, productId: product?.id ?? null },
    mock: () => mockMarketplace(opts.platform, opts.count),
  });
  const seen = new Set(searched.map((s) => urlKey(s.url)).filter(Boolean));
  const checked = (url: string) => /^https?:\/\//i.test(url) ? { url: url.slice(0, 1000), verified: seen.has(urlKey(url)) } : null;
  const label = opts.platform === "amazon" ? "Amazon" : "Flipkart";
  const model = isMock() ? "mock" : textProvider() === "openai" ? OPENAI_TEXT_MODEL : MODEL;

  const listings = result.listings.filter((l) => l.brand.trim() && !OWN_BRAND.test(l.brand)).slice(0, opts.count);
  const allSources = listings.flatMap((l) => {
    const c = checked(l.url);
    return c ? [{ title: `${l.brand}: ${l.title}`.slice(0, 200), ...c }] : [];
  });
  const [playbook] = await db
    .insert(schema.marketPlaybooks)
    .values({ platform: opts.platform, category: opts.category.slice(0, 150), productId: product?.id ?? null, summary: result.summary, playbook: result.playbook, sources: allSources, model, createdBy: opts.user })
    .returning({ id: schema.marketPlaybooks.id });

  const byBrand = new Map(existing.map((e) => [e.brand.trim().toLowerCase(), e]));
  const ids: string[] = [];
  for (const l of listings) {
    const source = checked(l.url);
    const sources = source ? [{ title: l.title.slice(0, 200), ...source }] : [];
    const adText = [`Listing title: ${l.title}`, l.offers && `Offers: ${l.offers}`, l.praise.length && `Reviewers like: ${l.praise.join("; ")}`, l.complaints.length && `Reviewers complain: ${l.complaints.join("; ")}`]
      .filter(Boolean)
      .join("\n")
      .slice(0, 5000);
    const listing = { ...l, platform: opts.platform };
    const prev = byBrand.get(l.brand.trim().toLowerCase());
    if (prev) {
      // Already tracked: refresh its listing and add the new source; re-analyse with the listing text.
      await db
        .update(schema.competitorAds)
        .set({
          listing,
          adText: prev.adText ? `${prev.adText}\n${adText}`.slice(0, 5000) : adText,
          sources: [...prev.sources.filter((s) => s.url !== source?.url), ...sources].slice(0, 10),
          ...(product && !prev.productIds.includes(product.id)
            ? { productIds: [...(prev.productIds.length || prev.productId ? prev.productIds : products.filter((p) => matchesProduct(prev, p)).map((p) => p.id)), product.id] }
            : {}),
        })
        .where(eq(schema.competitorAds.id, prev.id));
      ids.push(prev.id);
    } else {
      const [row] = await db
        .insert(schema.competitorAds)
        .values({
          brand: l.brand.slice(0, 100),
          product: [l.pack_size && `${l.pack_size}`, l.price].filter(Boolean).join(" · ").slice(0, 150),
          channel: label,
          adText,
          notes: [l.rating && `Rating ${l.rating}${l.review_count ? ` (${l.review_count})` : ""}`, l.badges.length && `Badges: ${l.badges.join(", ")}`, l.rank && `Rank: ${l.rank}`].filter(Boolean).join("\n"),
          link: source?.url ?? "",
          source: "research",
          productId: product?.id ?? null,
          productIds: product ? [product.id] : [],
          category: opts.category.slice(0, 150),
          focus: opts.platform,
          sources,
          listing,
          createdBy: opts.user,
        })
        .returning({ id: schema.competitorAds.id });
      ids.push(row.id);
    }
  }
  return { playbookId: playbook.id, ids, summary: result.summary, mock: isMock() };
}

export async function listPlaybooks() {
  return db.select().from(schema.marketPlaybooks).orderBy(desc(schema.marketPlaybooks.createdAt)).limit(20);
}

/** Latest playbook for a platform, preferring one made for this product. */
export async function latestPlaybook(platform: "amazon" | "flipkart", productId: string | null): Promise<PlaybookContext | null> {
  const rows = await db
    .select()
    .from(schema.marketPlaybooks)
    .where(and(eq(schema.marketPlaybooks.platform, platform), productId ? or(eq(schema.marketPlaybooks.productId, productId), isNull(schema.marketPlaybooks.productId)) : undefined))
    .orderBy(desc(schema.marketPlaybooks.createdAt))
    .limit(10);
  const p = rows.find((r) => r.productId === productId) ?? rows[0];
  if (!p) return null;
  return {
    platform,
    date: p.createdAt.toISOString().slice(0, 10),
    summary: p.summary,
    titleFormula: p.playbook.title_formula,
    keywords: p.playbook.must_have_keywords,
    imageStack: p.playbook.image_stack,
    reviewThemes: p.playbook.review_themes_to_answer,
    adTips: p.playbook.ad_tips,
  };
}

export async function listCategoryResearch() {
  return db.select().from(schema.categoryResearch).orderBy(desc(schema.categoryResearch.createdAt)).limit(50);
}

/** All research for one of our products, condensed. Null when nothing has been researched for it. */
export async function competitorLandscape(product: { id: string; name: string }, platform?: "meta" | "amazon" | "flipkart"): Promise<{ landscape: Landscape | null; count: number }> {
  const [rows, research] = await Promise.all([listCompetitors(), listCategoryResearch()]);
  // Competitors seen on this platform come first, so their patterns lead.
  const mine = rows.filter((r) => matchesProduct(r, product)).sort((a, b) => (platform ? Number(seenOn(b, platform)) - Number(seenOn(a, platform)) : 0));
  const latest = research.find((r) => matchesProduct(r, product)) ?? null;
  const landscape = buildLandscape(mine, latest);
  return { landscape, count: mine.filter((r) => r.analysis).length };
}

/** Competitor lines (hooks, quoted messaging) per product, for the "sounds like a competitor" check. */
export async function competitorLinesFor(product: { id: string; name: string } | null): Promise<string[]> {
  if (!product) return [];
  const rows = await listCompetitors();
  return competitorLines(rows.filter((r) => matchesProduct(r, product)));
}

async function linkProduct(id: string, current: string[], productId: string) {
  await db.update(schema.competitorAds).set({ productIds: [...new Set([...current, productId])] }).where(eq(schema.competitorAds.id, id));
}
