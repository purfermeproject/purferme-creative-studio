import { authErrorStatus, requireRole } from "@/auth";
import { db, schema } from "@/db";
import { errorMessage } from "@/lib/ai";

/**
 * A full backup of the team's work as one JSON file (admins only): products, brand, rules, terms, creatives
 * and their versions, plans, results and roles. Images are listed (id, label, size) but not included, to keep
 * the file small; the database host's point-in-time restore covers everything, images included.
 */
export async function GET() {
  try {
    await requireRole("roles");
  } catch (e) {
    return Response.json({ error: errorMessage(e) }, { status: authErrorStatus(e) });
  }
  const s = schema;
  const [products, brand, platformRules, terms, creatives, versions, ideaSets, research, playbooks, results, roles, listingPlans, shopifyStore, shopifyListings, assets] = await Promise.all([
    db.select().from(s.products),
    db.select().from(s.brandSettings),
    db.select().from(s.platformRules),
    db.select().from(s.complianceTerms),
    db.select().from(s.creatives),
    db.select().from(s.creativeVersions),
    db.select().from(s.ideaSets),
    db.select().from(s.categoryResearch),
    db.select().from(s.marketPlaybooks),
    db.select().from(s.results),
    db.select().from(s.userRoles),
    db.select().from(s.listingPlans),
    db.select().from(s.shopifyStore),
    db.select().from(s.shopifyListings),
    db.select({ id: s.assets.id, kind: s.assets.kind, label: s.assets.label, mime: s.assets.mime, createdAt: s.assets.createdAt }).from(s.assets),
  ]);
  const body = JSON.stringify(
    { exportedAt: new Date().toISOString(), version: 1, products, brand, platformRules, terms, creatives, versions, ideaSets, research, playbooks, results, roles, listingPlans, shopifyStore, shopifyListings, assets },
    null,
    1,
  );
  const day = new Date().toISOString().slice(0, 10);
  return new Response(body, {
    headers: { "content-type": "application/json; charset=utf-8", "content-disposition": `attachment; filename="creative-studio-backup-${day}.json"`, "cache-control": "no-store" },
  });
}
