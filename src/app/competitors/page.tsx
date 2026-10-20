import { currentUser, roleOf } from "@/auth";
import { listCompetitors } from "@/lib/competitors";
import { CompetitorsClient } from "./CompetitorsClient";

export const metadata = { title: "Competitors · Puŕ Fermé Creative Studio" };

export default async function CompetitorsPage() {
  const [rows, user] = await Promise.all([listCompetitors(), currentUser()]);
  const role = user ? await roleOf(user) : "viewer";
  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">Competitive intelligence</p>
        <h1 className="display text-4xl">Competitor ads</h1>
        <p className="hint mt-1 max-w-3xl">
          Collect ads from other brands. The AI breaks down each one (hook, angle, claims and how risky they are, what works) and finds the white space your products can own. Then
          use it in a brief to get ideas that are clearly different. It never copies them, names them or makes comparative claims.
        </p>
      </div>
      <CompetitorsClient
        role={role}
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
        }))}
      />
    </div>
  );
}
