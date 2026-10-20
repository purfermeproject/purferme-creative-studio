import { currentUser, roleOf } from "@/auth";
import { listCompetitors, listPlaybooks } from "@/lib/competitors";
import { getProducts } from "@/lib/data";
import { CompetitorsClient } from "./CompetitorsClient";

export const metadata = { title: "Competitors · Puŕ Fermé Creative Studio" };

export default async function CompetitorsPage() {
  const [rows, user, products, playbooks] = await Promise.all([listCompetitors(), currentUser(), getProducts(), listPlaybooks()]);
  const role = user ? await roleOf(user) : "viewer";
  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">Competitive intelligence</p>
        <h1 className="display text-4xl">Competitor ads</h1>
        <p className="hint mt-1 max-w-3xl">
          Pick one of your products and what to look at. The AI searches the web (brand sites, Amazon, Flipkart, quick commerce, Instagram) for competing brands in India, saves them
          with their sources and breaks each one down: hook, angle, claims and how risky they are, and the white space your product can own. Use any of them in a brief to get
          ideas that are clearly different. It never copies them, names them or makes comparative claims.
        </p>
      </div>
      <CompetitorsClient
        role={role}
        playbooks={(["amazon", "flipkart"] as const).flatMap((pl) => {
          const p = playbooks.find((x) => x.platform === pl);
          return p ? [{ id: p.id, platform: pl, category: p.category, summary: p.summary, playbook: p.playbook, sources: p.sources, mock: p.model === "mock", date: p.createdAt.toISOString() }] : [];
        })}
        products={products.filter((p) => p.status !== "blocked").map((p) => ({ id: p.id, name: p.name }))}
        rows={rows.map((r) => ({
          id: r.id,
          brand: r.brand,
          product: r.product,
          channel: r.channel,
          adText: r.adText,
          link: r.link,
          notes: r.notes,
          imageUrl: r.imageAssetId ? `/api/assets/${r.imageAssetId}` : null,
          analysis: r.analysis,
          mock: r.analysisModel === "mock",
          analysedAt: r.analysedAt?.toISOString() ?? null,
          createdBy: r.createdBy,
          source: r.source,
          category: r.category,
          sources: r.sources,
          listing: r.listing,
        }))}
      />
    </div>
  );
}
