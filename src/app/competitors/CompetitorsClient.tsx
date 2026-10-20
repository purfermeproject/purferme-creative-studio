"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { can } from "@/lib/roles";
import type { CompetitorAnalysis } from "@/lib/schemas";
import type { Role } from "@/lib/types";
import { deleteCompetitor } from "./actions";

type Row = {
  id: string;
  brand: string;
  product: string;
  channel: string;
  adText: string;
  link: string;
  notes: string;
  imageUrl: string | null;
  analysis: CompetitorAnalysis | null;
  mock: boolean;
  analysedAt: string | null;
  createdBy: string;
  source: string;
  category: string;
  sources: { title: string; url: string; verified: boolean }[];
};

const FOCUS: [string, string][] = [
  ["overall", "Everything (positioning and marketing)"],
  ["ads", "Their ads and hooks"],
  ["claims", "The claims they make"],
  ["pricing", "Price, pack sizes and offers"],
  ["packaging", "Packaging"],
  ["reviews", "What customers say"],
];

/** "Chocolate Cookies, millet & oats, 240g" → "chocolate cookies, millet & oats" as a search category. */
const categoryFrom = (name: string) => name.replace(/,?\s*\d+\s*(g|kg|ml|l)\b.*$/i, "").trim().toLowerCase();

const RISK: Record<"ok" | "check" | "risky", [string, string]> = {
  ok: ["chip-green", "fine"],
  check: ["chip-amber", "needs evidence"],
  risky: ["chip-red", "we can't say this"],
};

function List({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div>
      <p className="eyebrow mb-1">{title}</p>
      <ul className="list-disc space-y-0.5 pl-5 text-sm">
        {items.map((x) => (
          <li key={x}>{x}</li>
        ))}
      </ul>
    </div>
  );
}

function Analysis({ a, mock }: { a: CompetitorAnalysis; mock: boolean }) {
  return (
    <div className="space-y-4" data-testid="competitor-analysis">
      {mock ? (
        <span className="chip-amber" data-testid="mock-badge">
          Sample output (mock mode)
        </span>
      ) : null}
      <p className="text-sm">{a.summary}</p>
      <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[7rem_1fr]">
        {[
          ["Hook", a.hook],
          ["Mechanism", a.hook_mechanism],
          ["Angle", a.angle],
          ["Audience", a.audience],
          ["Format", a.format],
          ["Offer", a.offer],
        ]
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="font-semibold text-ink-soft">{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
      </dl>
      {a.claims_made.length ? (
        <div>
          <p className="eyebrow mb-1">Claims they make</p>
          <ul className="space-y-1 text-sm" data-testid="competitor-claims">
            {a.claims_made.map((c) => (
              <li key={c.text} className="flex flex-wrap items-baseline gap-2">
                <span className="font-semibold">“{c.text}”</span>
                <span className={RISK[c.risk][0]}>{RISK[c.risk][1]}</span>
                <span className="text-ink-soft">{c.note}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="grid gap-4 md:grid-cols-3">
        <List title="What works (craft to learn)" items={a.what_works} />
        <List title="Weaknesses" items={a.weaknesses} />
        <List title="White space for us" items={a.white_space} />
      </div>
      <div>
        <p className="eyebrow mb-2">Ideas that are clearly ours</p>
        <ul className="grid gap-2 md:grid-cols-3">
          {a.counter_ideas.map((c) => (
            <li key={c.title} className="rounded-xl border border-line bg-surface-2 p-3 text-sm">
              <p className="font-semibold">{c.title}</p>
              <p className="font-serif text-ink">“{c.hook}”</p>
              <p className="mt-1 text-xs text-ink-soft">
                {c.angle} · {c.why}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function CompetitorsClient({ rows, role, products }: { rows: Row[]; role: Role; products: { id: string; name: string }[] }) {
  const router = useRouter();
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const [category, setCategory] = useState(categoryFrom(products[0]?.name ?? ""));
  const [focus, setFocus] = useState("overall");
  const [count, setCount] = useState(5);
  const [research, setResearch] = useState<{ status: string; error: string; summary: string; gaps: string[]; note: string }>({ status: "", error: "", summary: "", gaps: [], note: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<Record<string, string>>({});
  const [rowError, setRowError] = useState<Record<string, string>>({});
  const canAdd = can(role, "edit");
  const canAnalyse = can(role, "generate");

  async function analyse(id: string) {
    setBusy((b) => ({ ...b, [id]: "Analysing… (up to a minute)" }));
    setRowError((r) => ({ ...r, [id]: "" }));
    const res = await fetch(`/api/competitors/${id}/analyse`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setBusy((b) => ({ ...b, [id]: "" }));
    if (!res.ok) setRowError((r) => ({ ...r, [id]: data.error ?? "Couldn't analyse it." }));
    router.refresh();
  }

  async function find() {
    setResearch({ status: "Searching the web for competitors… (usually 1–3 minutes)", error: "", summary: "", gaps: [], note: "" });
    const res = await fetch("/api/competitors/discover", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ category, focus, count, productId: productId || null }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return setResearch((r) => ({ ...r, status: "", error: data.error ?? "The search didn't work. Try again." }));
    const note = data.ids.length
      ? `Found ${data.ids.length} new competitor${data.ids.length > 1 ? "s" : ""}${data.skipped ? ` (${data.skipped} already on your list or not a competitor)` : ""}.`
      : "No new competitors found: everything it found is already on your list. Try a wider category or another focus.";
    setResearch({ status: "", error: "", summary: data.summary, gaps: data.gaps, note: data.mock ? `${note} Mock mode: sample brands, no web search ran.` : note });
    router.refresh();
    for (let i = 0; i < data.ids.length; i++) {
      setResearch((r) => ({ ...r, status: `Breaking down ${i + 1} of ${data.ids.length}…` }));
      await analyse(data.ids[i]);
    }
    setResearch((r) => ({ ...r, status: "" }));
  }

  async function add(form: HTMLFormElement) {
    setSaving(true);
    setError("");
    const res = await fetch("/api/competitors", { method: "POST", body: new FormData(form) });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) return setError(data.error ?? "Couldn't save it.");
    form.reset();
    router.refresh();
    if (canAnalyse) await analyse(data.id);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
      <div className="space-y-4 lg:sticky lg:top-4 lg:self-start">
      {canAnalyse ? (
        <form
          className="card space-y-3"
          aria-label="Find competitors"
          onSubmit={(e) => {
            e.preventDefault();
            find();
          }}
        >
          <h2 className="display text-xl">Find competitors</h2>
          <div>
            <label htmlFor="f-product" className="label">
              Our product
            </label>
            <select
              id="f-product"
              className="input"
              value={productId}
              onChange={(e) => {
                setProductId(e.target.value);
                setCategory(categoryFrom(products.find((p) => p.id === e.target.value)?.name ?? ""));
              }}
            >
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
              <option value="">None (just a category)</option>
            </select>
          </div>
          <div>
            <label htmlFor="f-category" className="label">
              Category to search
            </label>
            <input id="f-category" className="input" value={category} onChange={(e) => setCategory(e.target.value)} maxLength={150} placeholder="e.g. millet cookies, peanut butter" />
          </div>
          <div>
            <label htmlFor="f-focus" className="label">
              Look at
            </label>
            <select id="f-focus" className="input" value={focus} onChange={(e) => setFocus(e.target.value)}>
              {FOCUS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          <fieldset>
            <legend className="label">How many brands</legend>
            <div className="grid grid-cols-3 gap-1 rounded-lg border border-line bg-surface-2 p-1">
              {[3, 5, 8].map((k) => (
                <label key={k} className={`cursor-pointer rounded-md py-1.5 text-center text-sm font-semibold has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-purple ${count === k ? "bg-purple text-accent-ink" : "text-ink-soft"}`}>
                  <input type="radio" name="count" value={k} checked={count === k} onChange={() => setCount(k)} className="sr-only" />
                  {k}
                </label>
              ))}
            </div>
          </fieldset>
          <button type="submit" className="btn-primary w-full" disabled={Boolean(research.status) || category.trim().length < 3}>
            {research.status ? "Working…" : "Find competitors"}
          </button>
          <p className="hint text-xs">Uses web search on your AI account (a few searches per brand), plus one breakdown per brand found.</p>
          {research.status ? (
            <p role="status" className="text-sm font-semibold" data-testid="research-status">
              {research.status}
            </p>
          ) : null}
          {research.error ? (
            <p role="alert" className="text-sm text-red">
              {research.error}
            </p>
          ) : null}
        </form>
      ) : null}
      {canAdd ? (
        <details className="card">
          <summary className="cursor-pointer font-semibold">Add one yourself (paste an ad or a screenshot)</summary>
        <form
          className="mt-3 space-y-3"
          aria-label="Add a competitor ad"
          onSubmit={(e) => {
            e.preventDefault();
            add(e.currentTarget);
          }}
        >
          <h2 className="display text-xl">Add a competitor ad</h2>
          <div>
            <label htmlFor="c-brand" className="label">
              Brand
            </label>
            <input id="c-brand" name="brand" className="input" required maxLength={100} placeholder="e.g. a millet snack brand" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor="c-product" className="label">
                Product
              </label>
              <input id="c-product" name="product" className="input" maxLength={150} />
            </div>
            <div>
              <label htmlFor="c-channel" className="label">
                Where it ran
              </label>
              <input id="c-channel" name="channel" className="input" maxLength={60} placeholder="Instagram" list="c-channels" />
              <datalist id="c-channels">
                {["Instagram", "Facebook", "Amazon", "Flipkart", "YouTube", "Quick commerce", "Print / outdoor"].map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
          </div>
          <div>
            <label htmlFor="c-text" className="label">
              Ad text
            </label>
            <textarea id="c-text" name="adText" className="input" rows={4} maxLength={5000} placeholder="Paste the caption, headline and any on-screen words." />
          </div>
          <div>
            <label htmlFor="c-file" className="label">
              Screenshot <span className="font-normal text-ink-soft">(optional if you pasted the text)</span>
            </label>
            <input id="c-file" name="file" type="file" accept="image/png,image/jpeg,image/webp,image/gif" />
          </div>
          <div>
            <label htmlFor="c-link" className="label">
              Link <span className="font-normal text-ink-soft">(for reference)</span>
            </label>
            <input id="c-link" name="link" className="input" maxLength={1000} placeholder="https://www.facebook.com/ads/library/?id=…" />
            <p className="hint mt-1 text-xs">Links are saved for the team but not opened automatically (Meta&apos;s Ad Library needs separate API access). Paste the text or add a screenshot.</p>
          </div>
          <div>
            <label htmlFor="c-notes" className="label">
              Notes <span className="font-normal text-ink-soft">(optional)</span>
            </label>
            <textarea id="c-notes" name="notes" className="input" rows={2} maxLength={2000} placeholder="e.g. running for 3 weeks, lots of comments" />
          </div>
          <button type="submit" className="btn-primary w-full" disabled={saving}>
            {saving ? "Saving…" : canAnalyse ? "Save and analyse" : "Save"}
          </button>
          {error ? (
            <p role="alert" className="text-sm text-red">
              {error}
            </p>
          ) : null}
        </form>
        </details>
      ) : (
        <p className="card h-fit text-sm text-ink-soft">Your role can view competitor ads but not add them.</p>
      )}
      </div>

      <section aria-label="Competitor ads" className="min-w-0 space-y-4">
        {research.summary || research.note ? (
          <div className="rounded-2xl border border-line bg-gradient-to-br from-surface to-pink-soft p-5" data-testid="research-summary">
            <p className="eyebrow">Category research</p>
            {research.note ? <p className="mt-1 font-semibold">{research.note}</p> : null}
            {research.summary ? <p className="mt-2 text-sm">{research.summary}</p> : null}
            {research.gaps.length ? (
              <div className="mt-3">
                <p className="eyebrow mb-1">Nobody owns yet</p>
                <ul className="list-disc pl-5 text-sm">
                  {research.gaps.map((g) => (
                    <li key={g}>{g}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
        {rows.length === 0 ? (
          <div className="card border-dashed text-center" data-testid="competitors-empty">
            <p className="display text-xl">No competitor ads yet</p>
            <p className="hint mt-1">Use “Find competitors” on the left, or add one yourself.</p>
          </div>
        ) : (
          rows.map((r) => (
            <article key={r.id} className="card space-y-4" data-testid="competitor" aria-label={`${r.brand} ad`}>
              <header className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="display text-2xl">{r.brand}</h2>
                  <p className="hint text-sm">{[r.product, r.channel, r.source === "research" ? `found by web research${r.category ? ` for “${r.category}”` : ""}` : `added by ${r.createdBy}`].filter(Boolean).join(" · ")}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {r.analysis ? (
                    <Link href={`/create?competitor=${r.id}`} className="btn-primary px-3 py-1.5 text-sm">
                      Use in a brief
                    </Link>
                  ) : null}
                  {canAnalyse ? (
                    <button type="button" className="btn-secondary px-3 py-1.5 text-sm" onClick={() => analyse(r.id)} disabled={Boolean(busy[r.id])}>
                      {r.analysis ? "Analyse again" : "Analyse"}
                    </button>
                  ) : null}
                  {can(role, "delete") ? (
                    <button
                      type="button"
                      className="btn-danger px-3 py-1.5 text-sm"
                      onClick={async () => {
                        if (!window.confirm(`Delete the ${r.brand} ad?`)) return;
                        const res = await deleteCompetitor(r.id);
                        if (!res.ok) setRowError((e) => ({ ...e, [r.id]: res.message ?? "" }));
                        router.refresh();
                      }}
                    >
                      Delete
                    </button>
                  ) : null}
                </div>
              </header>
              <div className="grid gap-4 md:grid-cols-[12rem_minmax(0,1fr)]">
                <div className="space-y-2">
                  {r.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.imageUrl} alt={`Screenshot of the ${r.brand} ad`} className="w-full rounded-lg border border-line bg-surface-2 object-contain" />
                  ) : null}
                  {r.adText ? <p className="line-clamp-6 rounded-lg bg-surface-2 p-2 text-xs whitespace-pre-line text-ink-soft">{r.adText}</p> : null}
                  {r.sources.length ? (
                    <div data-testid="competitor-sources">
                      <p className="eyebrow mb-1">Sources</p>
                      <ul className="space-y-1 text-xs">
                        {r.sources.map((s) => (
                          <li key={s.url} className="flex items-start gap-1">
                            <span title={s.verified ? "Returned by the web search" : "Cited by the AI but not in the search results: double-check"} aria-hidden>
                              {s.verified ? "✓" : "?"}
                            </span>
                            <a href={s.url} target="_blank" rel="noopener noreferrer nofollow" className="min-w-0 truncate text-purple underline">
                              {s.title || new URL(s.url).hostname}
                            </a>
                            <span className="sr-only">{s.verified ? "(confirmed by search)" : "(not confirmed by search)"}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : r.link ? (
                    <a href={r.link} target="_blank" rel="noopener noreferrer nofollow" className="block truncate text-xs text-purple underline">
                      Open link
                    </a>
                  ) : null}
                  {r.notes && r.source === "research" ? <p className="rounded-lg bg-surface-2 p-2 text-xs whitespace-pre-line text-ink-soft">{r.notes}</p> : null}
                </div>
                <div className="min-w-0">
                  {busy[r.id] ? (
                    <div className="space-y-2" aria-busy="true">
                      <p className="text-sm font-semibold">{busy[r.id]}</p>
                      <div className="skeleton h-4 w-3/4" />
                      <div className="skeleton h-4 w-2/3" />
                      <div className="skeleton h-4 w-1/2" />
                    </div>
                  ) : r.analysis ? (
                    <Analysis a={r.analysis} mock={r.mock} />
                  ) : (
                    <p className="hint">Not analysed yet.</p>
                  )}
                  {rowError[r.id] ? (
                    <p role="alert" className="mt-2 text-sm text-red">
                      {rowError[r.id]}
                    </p>
                  ) : null}
                </div>
              </div>
            </article>
          ))
        )}
      </section>
    </div>
  );
}
