import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getBrand } from "@/lib/data";
import { getPlatform } from "@/lib/platform";
import { PLATFORM_LABELS } from "@/lib/types";
import { BriefPanel } from "./BriefPanel";
import { ResultsClient } from "./ResultsClient";

export const metadata = { title: "Results · Puŕ Fermé Creative Studio" };

const fmt = (v: unknown) => (typeof v === "number" ? String(Math.round(v * 100) / 100) : "–");

const VERDICT_CHIP: Record<string, string> = { Kill: "chip-red", Cut: "chip-red", Hold: "chip-amber", Scale: "chip-green" };

export default async function ResultsPage() {
  const platform = await getPlatform();
  const [brand, creatives, recent] = await Promise.all([
    getBrand(),
    db
      .select({ id: schema.creatives.id, title: schema.creatives.title })
      .from(schema.creatives)
      .where(eq(schema.creatives.platform, platform))
      .orderBy(desc(schema.creatives.createdAt))
      .limit(300),
    db
      .select({ r: schema.results, title: schema.creatives.title })
      .from(schema.results)
      .leftJoin(schema.creatives, eq(schema.results.creativeId, schema.creatives.id))
      .where(eq(schema.results.platform, platform))
      .orderBy(desc(schema.results.createdAt))
      .limit(25),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-4xl font-extrabold tracking-tight">Results for {PLATFORM_LABELS[platform]}</h1>
        <p className="prose-serif mt-1 text-ink-soft">
          {platform === "meta"
            ? "Meta is judged on hook rate, link CTR, CPA against target and frequency."
            : `${PLATFORM_LABELS[platform]} is judged on ACoS against target, CTR and conversion, ideally by search term.`}{" "}
          Thresholds are editable in Admin.
        </p>
      </div>

      <ResultsClient key={platform} platform={platform} thresholds={brand.verdictThresholds} creatives={creatives} />

      <section aria-labelledby="recent-h" className="space-y-3">
        <h2 id="recent-h" className="text-2xl font-bold tracking-tight">
          Recent results
        </h2>
        {recent.length === 0 ? (
          <p className="hint">No results saved for {PLATFORM_LABELS[platform]} yet.</p>
        ) : (
          <div className="card overflow-x-auto p-0">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line text-ink-soft">
                <tr>
                  <th className="p-3">Saved</th>
                  <th className="p-3">Ad / term</th>
                  <th className="p-3">Creative</th>
                  <th className="p-3">Key numbers</th>
                  <th className="p-3">Verdict</th>
                </tr>
              </thead>
              <tbody>
                {recent.map(({ r, title }) => {
                  const m = r.metrics as Record<string, number | string | null>;
                  const nums =
                    r.platform === "meta"
                      ? `Spend Rs ${fmt(m.spend)} · hook ${fmt(m.hookRate)}% · CTR ${fmt(m.ctr)}% · CPA ${fmt(m.cpa)}`
                      : `ACoS ${fmt(m.acos)}% · CTR ${fmt(m.ctr)}% · conv ${fmt(m.conversionRate)}% · ${fmt(m.clicks)} clicks`;
                  return (
                    <tr key={r.id} className="border-b border-line align-top last:border-0">
                      <td className="p-3 whitespace-nowrap">{new Date(r.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</td>
                      <td className="p-3">{(m.name as string) || "–"}</td>
                      <td className="p-3">{title ?? "–"}</td>
                      <td className="p-3 text-ink-soft">{nums}</td>
                      <td className="p-3">
                        <span className={VERDICT_CHIP[r.verdict] ?? "chip"}>{r.verdict}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <BriefPanel />
    </div>
  );
}
