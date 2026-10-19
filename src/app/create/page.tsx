import { desc, eq } from "drizzle-orm";
import { currentUser, roleOf } from "@/auth";
import { Workspace } from "@/components/workspace/Workspace";
import type { OpenCreative, ProductCard, RecentCreative } from "@/components/workspace/types";
import { db, schema } from "@/db";
import { assetInfo } from "@/lib/asset-store";
import { loadCreative } from "@/lib/creative-store";
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
  }));
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
    />
  );
}
