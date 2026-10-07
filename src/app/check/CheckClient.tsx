"use client";

import { useMemo, useState } from "react";
import { Highlighted, ScanSummary } from "@/components/Scan";
import { highlight, scan, type Term } from "@/lib/compliance";
import type { DeepCheck } from "@/lib/schemas";
import { PLATFORM_LABELS, type Platform } from "@/lib/types";

type ProductOption = { id: string; slug: string; name: string; status: string };

const VERDICT_STYLE = {
  pass: { cls: "border-leaf/30 bg-green-bg text-leaf", label: "Pass: good to go" },
  fix: { cls: "border-amber/30 bg-amber-bg text-amber", label: "Fix: change the issues below" },
  block: { cls: "border-red/30 bg-red-bg text-red", label: "Block: don't run this" },
} as const;

export function CheckClient({ platform, products, terms }: { platform: Platform; products: ProductOption[]; terms: Term[] }) {
  const [text, setText] = useState("");
  const [productId, setProductId] = useState<string>(products.find((p) => p.slug === "choc")?.id ?? "");
  const [deep, setDeep] = useState<DeepCheck | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const slug = products.find((p) => p.id === productId)?.slug ?? null;
  const segments = useMemo(() => highlight(text, platform, terms, slug), [text, platform, terms, slug]);
  const result = useMemo(() => scan(text, platform, slug, terms), [text, platform, terms, slug]);

  async function runDeepCheck() {
    setLoading(true);
    setError("");
    setDeep(null);
    try {
      const res = await fetch("/api/check", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text, platform, productId: productId || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "The deep check failed. Try again.");
      setDeep(data.result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The deep check failed. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-4">
        <div className="card space-y-4">
          <div>
            <label htmlFor="product" className="label">
              Product
            </label>
            <select id="product" className="input" value={productId} onChange={(e) => setProductId(e.target.value)}>
              <option value="">No specific product</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.status !== "ready" ? ` (${p.status})` : ""}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="copy" className="label">
              Copy to check
            </label>
            <textarea
              id="copy"
              className="input min-h-48 font-serif"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Paste a headline, script, caption or listing text…"
            />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button className="btn-primary" onClick={runDeepCheck} disabled={!text.trim() || loading}>
              {loading ? "Checking…" : "Run deep check"}
            </button>
            <span className="hint">Checking for {PLATFORM_LABELS[platform]}</span>
          </div>
        </div>

        <section aria-labelledby="instant-h" className="card space-y-3" aria-live="polite">
          <h2 id="instant-h" className="text-lg font-bold">
            Instant scan
          </h2>
          {text.trim() ? (
            <>
              <ScanSummary result={result} />
              <p className="prose-serif rounded-lg border border-line bg-surface-2 p-3 whitespace-pre-wrap" data-testid="highlighted">
                <Highlighted segments={segments} />
              </p>
            </>
          ) : (
            <p className="hint">Start typing and flagged terms are highlighted here: red must be fixed before launch, amber needs evidence.</p>
          )}
        </section>
      </div>

      <section aria-labelledby="deep-h" className="card space-y-4" aria-live="polite" aria-busy={loading}>
        <div>
          <h2 id="deep-h" className="text-lg font-bold">
            Deep check
          </h2>
          <p className="hint">Considers FSSAI Advertising & Claims Regulations 2018, ASCI guidelines (including AI-content labelling) and the IMS Act. A review aid, not legal advice.</p>
        </div>
        {error ? (
          <p role="alert" className="rounded-lg border border-red/30 bg-red-bg p-3 text-red">
            {error}
          </p>
        ) : null}
        {loading ? <p className="hint animate-pulse">Reviewing against brand rules, product claims and regulations…</p> : null}
        {deep ? (
          <div className="space-y-4" data-testid="deep-result">
            <p className={`rounded-lg border p-3 font-bold ${VERDICT_STYLE[deep.verdict].cls}`}>{VERDICT_STYLE[deep.verdict].label}</p>
            {deep.issues.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-line text-ink-soft">
                    <tr>
                      <th className="py-2 pr-3">Quote</th>
                      <th className="py-2 pr-3">Problem</th>
                      <th className="py-2 pr-3">Rule</th>
                      <th className="py-2">Fix</th>
                    </tr>
                  </thead>
                  <tbody>
                    {deep.issues.map((iss, i) => (
                      <tr key={i} className="border-b border-line align-top">
                        <td className="py-2 pr-3 font-semibold">“{iss.quote}”</td>
                        <td className="py-2 pr-3">{iss.problem}</td>
                        <td className="py-2 pr-3 text-ink-soft">{iss.rule}</td>
                        <td className="py-2">{iss.fix}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="hint">No issues found.</p>
            )}
            <div>
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-bold">Suggested rewrite</h3>
                <button
                  className="btn-secondary px-3 py-1 text-sm"
                  onClick={async () => {
                    await navigator.clipboard.writeText(deep.rewrite);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  }}
                >
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <p className="prose-serif mt-2 rounded-lg border border-line bg-surface-2 p-3 whitespace-pre-wrap">{deep.rewrite}</p>
              <button className="btn-secondary mt-2 px-3 py-1 text-sm" onClick={() => setText(deep.rewrite)}>
                Re-scan the rewrite
              </button>
            </div>
          </div>
        ) : !loading && !error ? (
          <p className="hint">Run a deep check to get a verdict, a table of issues and a full rewrite.</p>
        ) : null}
      </section>
    </div>
  );
}
