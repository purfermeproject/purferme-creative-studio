import { desc, eq } from "drizzle-orm";
import { currentUser, roleOf } from "@/auth";
import { Workspace } from "@/components/workspace/Workspace";
import type { OpenCreative, ProductCard, RecentCreative } from "@/components/workspace/types";
import { db, schema } from "@/db";
import { assetInfo } from "@/lib/asset-store";
import { loadCreative } from "@/lib/creative-store";
import { listCategoryResearch, listCompetitors, listPlaybooks } from "@/lib/competitors";
import { buildLandscape, competitorLines, matchesProduct } from "@/lib/landscape";
import { scan, conceptText } from "@/lib/compliance";
import type { InitialBrief, InitialIdeas, LandscapeSummary } from "@/components/workspace/types";
import { PLATFORM_FULL_LABELS } from "@/lib/types";
import { getAllPlatformRules, getBrand, getProducts, getTerms } from "@/lib/data";
import { getPlatform } from "@/lib/platform";
import { phraseList } from "@/lib/prompts";
import { snapshotOf } from "@/lib/versions";
import { DELIVERABLES, OBJECTIVES, PLATFORMS, type Deliverable, type Objective, type Platform } from "@/lib/types";

export const metadata = { title: "Create · Puŕ Fermé Creative Studio" };

const isObjective = (v: string): v is Objective => OBJECTIVES.some((o) => o.id === v);
const isDeliverable = (v: string): v is Deliverable => DELIVERABLES.some((d) => d.id === v);

async function openCreative(id: string): Promise<OpenCreative | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const row = await loadCreative(id);
  if (!row) return null;
  const c = row.c;
  const images = await assetInfo(c.imageIds);
  return {
    id: c.id,
    platform: c.platform,
    productId: c.productId,
    productName: row.p?.name ?? "(product deleted)",
    creativeType: c.creativeType,
    placement: c.placement,
    objective: isObjective(c.objective) ? c.objective : "",
    deliverable: isDeliverable(c.deliverable) ? c.deliverable : "concept",
    status: c.status,
    revision: c.revision,
    snapshot: snapshotOf(c),
    images: images.map((i) => ({ id: i.id, url: i.url, label: i.label || undefined, frameIndex: i.frameIndex })),
    qaChecked: c.qaChecked,
    claimsReviewedBy: c.claimsReviewedBy,
    approvedBy: c.approvedBy,
    createdBy: c.createdBy,
    createdAt: c.createdAt.toISOString(),
    mock: Boolean(c.generationMeta.mock),
    model: c.generationMeta.model ?? "",
  };
}

export default async function CreatePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const creativeId = typeof sp.creative === "string" ? sp.creative : "";
  const [platform, user, products, brand, rules, terms] = await Promise.all([getPlatform(), currentUser(), getProducts(), getBrand(), getAllPlatformRules(), getTerms()]);
  const role = user ? await roleOf(user) : "viewer";
  const [initialCreative, recentRows] = await Promise.all([
    creativeId ? openCreative(creativeId) : Promise.resolve(null),
    db
      .select({ c: { id: schema.creatives.id, title: schema.creatives.title, status: schema.creatives.status, platform: schema.creatives.platform, updatedAt: schema.creatives.updatedAt }, productName: schema.products.name })
      .from(schema.creatives)
      .leftJoin(schema.products, eq(schema.creatives.productId, schema.products.id))
      .where(eq(schema.creatives.createdBy, user ?? ""))
      .orderBy(desc(schema.creatives.updatedAt))
      .limit(6),
  ]);
  const photoLabels = new Map((await assetInfo(products.flatMap((p) => p.photoAssetIds))).map((a) => [a.id, a.label]));
  const allCompetitors = await listCompetitors();
  const competitorRows = allCompetitors.filter((c) => c.analysis);
  const categoryRows = await listCategoryResearch();
  const landscapes: Record<string, LandscapeSummary> = {};
  const linesByProduct: Record<string, string[]> = {};
  for (const p of products) {
    const mine = allCompetitors.filter((c) => matchesProduct(c, p));
    linesByProduct[p.id] = competitorLines(mine);
    const l = buildLandscape(mine, categoryRows.find((r) => matchesProduct(r, p)) ?? null);
    if (l) landscapes[p.id] = { count: l.brands.length, brands: l.brands, hooks: l.hooks.slice(0, 3), open: [...l.gaps, ...l.whiteSpace].slice(0, 4) };
  }
  const playbookRows = await listPlaybooks();
  const competitorParam = typeof sp.competitor === "string" ? sp.competitor : "";
  const creativeTypes = Object.fromEntries(PLATFORMS.map((p) => [p, rules.find((r) => r.platform === p)?.creativeTypes ?? []])) as Record<Platform, string[]>;
  const cards: ProductCard[] = products.map((p) => ({
    id: p.id,
    slug: p.slug,
    name: p.name,
    priceText: p.priceText,
    status: p.status,
    statusReason: p.statusReason,
    packImageUrl: p.packImageUrl,
    greenClaims: p.greenClaims,
    amberClaims: p.amberClaims,
    redClaims: p.redClaims,
    claimEvidence: p.claimEvidence,
    messagingPriorities: p.messagingPriorities,
    evidenceCount: p.claimEvidence.filter((e) => e.evidence.trim()).length,
    photos: p.photoAssetIds.map((id) => ({ id, url: `/api/assets/${id}`, label: photoLabels.get(id) ?? "Product photo" })),
  }));
  // "Develop this idea" on the Competitors page: open its counter-ideas as ready-made proposals.
  const ideaParam = typeof sp.idea === "string" ? Number(sp.idea) : NaN;
  const ideaSource = competitorRows.find((c) => c.id === competitorParam);
  // "Develop" on the Research page: ideas proposed for a product on one platform.
  const ideaSetId = typeof sp.ideas === "string" && /^[0-9a-f-]{36}$/i.test(sp.ideas) ? sp.ideas : "";
  const [ideaSet] = ideaSetId ? await db.select().from(schema.ideaSets).where(eq(schema.ideaSets.id, ideaSetId)) : [];
  const pick = Number.isInteger(Number(sp.i)) ? Number(sp.i) : 0;
  const setProduct = ideaSet ? products.find((p) => p.id === ideaSet.productId) : undefined;
  const initialBrief: InitialBrief | null =
    ideaSet && setProduct ? { productId: setProduct.id, platform: ideaSet.platform, creativeType: ideaSet.creativeType, placement: ideaSet.placement } : null;
  const initialIdeas: InitialIdeas | null = ideaSet && setProduct
    ? {
        brand: setProduct.name,
        mock: ideaSet.mock,
        note: `Ideas from researching ${setProduct.name}'s competitors on ${PLATFORM_FULL_LABELS[ideaSet.platform]}. Each says whether it adapts a proven pattern or takes open ground. Develop one; it uses only your approved claims.`,
        proposals: [...ideaSet.proposals.slice(pick, pick + 1), ...ideaSet.proposals.filter((_, i) => i !== pick)],
      }
    : ideaSource?.analysis && Number.isInteger(ideaParam)
      ? {
          brand: ideaSource.brand,
          proposals: [
            ...ideaSource.analysis.counter_ideas.slice(ideaParam, ideaParam + 1),
            ...ideaSource.analysis.counter_ideas.filter((_, i) => i !== ideaParam),
          ].map((c) => ({
            title: c.title,
            angle: c.angle,
            persona: "(best fit for this idea)",
            big_idea: c.why,
            hook: c.hook,
            format: "",
            hook_mechanism: "",
            claims: [],
            why: c.why,
            scan: scan(conceptText({ title: c.title, hook: c.hook, copy: { body: c.why } }), "meta", null, terms),
          })),
        }
      : null;
  const recent: RecentCreative[] = recentRows.map((r) => ({ ...r.c, productName: r.productName ?? "", updatedAt: r.c.updatedAt.toISOString() }));

  return (
    <Workspace
      initialPlatform={platform}
      products={cards}
      creativeTypes={creativeTypes}
      angles={brand.angles}
      personas={brand.personas}
      languages={brand.languages}
      avoidPhrases={phraseList(brand.avoidPhrases)}
      terms={terms.map((t) => ({ label: t.label, regex: t.regex, severity: t.severity, platform: t.platform, productSlug: t.productSlug, active: t.active }))}
      kit={brand.kit}
      role={role}
      user={user ?? ""}
      initialCreative={initialCreative}
      recent={recent}
      competitors={competitorRows.map((c) => ({ id: c.id, brand: c.brand, product: c.product, channel: c.channel, productId: c.productId, productIds: c.productIds, category: c.category }))}
      playbooks={playbookRows.map((p) => ({ platform: p.platform, productId: p.productId, category: p.category, date: p.createdAt.toISOString() }))}
      landscapes={landscapes}
      competitorLines={linesByProduct}
      initialIdeas={initialIdeas}
      initialBrief={initialBrief}
      initialCompetitorId={competitorRows.some((c) => c.id === competitorParam) ? competitorParam : ""}
    />
  );
}
