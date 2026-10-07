"use client";

import { useState } from "react";
import type { WeeklyBrief } from "@/lib/schemas";

export function BriefPanel() {
  const [brief, setBrief] = useState<WeeklyBrief | null>(null);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function run() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/brief", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "The brief failed. Try again.");
      setBrief(data.brief);
      setCount(data.count);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The brief failed. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section aria-labelledby="brief-h" className="card space-y-4" aria-live="polite" aria-busy={loading}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 id="brief-h" className="text-2xl font-bold tracking-tight">
            Weekly brief
          </h2>
          <p className="hint">Reads the last 7 days of results on all platforms, plus the linked creatives&apos; attributes.</p>
        </div>
        <button className="btn-primary" onClick={run} disabled={loading}>
          {loading ? "Writing the brief…" : "Generate weekly brief"}
        </button>
      </div>
      {error ? (
        <p role="alert" className="rounded-lg border border-red/30 bg-red-bg p-3 text-red">
          {error}
        </p>
      ) : null}
      {brief ? (
        <div className="space-y-5" data-testid="brief">
          <p className="prose-serif text-lg">{brief.summary}</p>
          <p className="hint">Based on {count} results.</p>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <h3 className="font-bold text-leaf">Winners</h3>
              <ul className="mt-1 space-y-1 text-sm">
                {brief.winners.map((w, i) => (
                  <li key={i}>
                    <strong>{w.name}</strong>: {w.why}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="font-bold text-red">Losers</h3>
              <ul className="mt-1 space-y-1 text-sm">
                {brief.losers.map((w, i) => (
                  <li key={i}>
                    <strong>{w.name}</strong>: {w.why}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="font-bold">Patterns behind winners</h3>
              <ul className="mt-1 list-disc pl-5 text-sm">
                {brief.patterns.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="font-bold">Converting search terms</h3>
              {brief.search_terms.length ? (
                <ul className="mt-1 space-y-1 text-sm">
                  {brief.search_terms.map((t, i) => (
                    <li key={i}>
                      <strong>{t.term}</strong>: {t.note}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="hint">None in this week&apos;s data.</p>
              )}
            </div>
          </div>
          <div>
            <h3 className="font-bold">Brief these next week</h3>
            <ol className="mt-2 grid gap-3 md:grid-cols-2">
              {brief.next_concepts.map((c, i) => (
                <li key={i} className="rounded-xl border border-line bg-surface-2 p-3 text-sm">
                  <p className="font-bold">
                    {i + 1}. {c.title}
                  </p>
                  <p className="text-ink-soft">
                    {c.platform} · {c.angle} · {c.persona} · {c.format}
                  </p>
                  <p className="prose-serif mt-1">Hook: {c.hook}</p>
                </li>
              ))}
            </ol>
          </div>
        </div>
      ) : null}
    </section>
  );
}
