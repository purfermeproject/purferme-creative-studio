import { desc } from "drizzle-orm";
import { currentUser, roleOf } from "@/auth";
import { db, schema } from "@/db";
import { listCompetitors, listPlaybooks } from "@/lib/competitors";
import { getAllPlatformRules, getBrand, getProducts } from "@/lib/data";
import { matchesProduct } from "@/lib/landscape";
import { PLATFORMS, type Platform } from "@/lib/types";
import { ResearchClient } from "./ResearchClient";

export const metadata = { title: "Research · Puŕ Fermé Creative Studio" };

export default async function ResearchPage() {
  const [user, products, rules, brand, competitors, playbooks, sets] = await Promise.all([
    currentUser(),
    getProducts(),
    getAllPlatformRules(),
    getBrand(),
    listCompetitors(),
    listPlaybooks(),
    db.select().from(schema.ideaSets).orderBy(desc(schema.ideaSets.createdAt)).limit(60),
  ]);
  const role = user ? await roleOf(user) : "viewer";
  const ready = products.filter((p) => p.status === "ready");
  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">Research → ideas</p>
        <h1 className="display text-4xl">Product research</h1>
        <p className="hint mt-1 max-w-3xl">
          Pick a product and the platforms you sell on. For each platform the app finds the competitors that matter there, breaks down what works for them and what they
          miss, then proposes ideas for you: some adapt a proven pattern in your own voice, some take ground nobody owns. Everything is saved, so each new run builds on
          what was learned before.
        </p>
      </div>
      <ResearchClient
        role={role}
        language={brand.languages[0] ?? "English"}
        creativeTypes={Object.fromEntries(PLATFORMS.map((p) => [p, rules.find((r) => r.platform === p)?.creativeTypes ?? []])) as Record<Platform, string[]>}
        products={ready.map((p) => ({
          id: p.id,
          name: p.name,
          competitors: competitors.filter((c) => c.analysis && matchesProduct(c, p)).length,
          playbooks: playbooks.filter((b) => b.productId === p.id).map((b) => ({ platform: b.platform, date: b.createdAt.toISOString() })),
        }))}
        sets={sets
          .filter((s) => ready.some((p) => p.id === s.productId))
          .map((s) => ({ id: s.id, productId: s.productId!, platform: s.platform, creativeType: s.creativeType, proposals: s.proposals, mock: s.mock, date: s.createdAt.toISOString() }))}
      />
    </div>
  );
}
