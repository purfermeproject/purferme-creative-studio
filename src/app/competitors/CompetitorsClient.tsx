"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { can } from "@/lib/roles";
import { categoryFrom } from "@/lib/landscape";
import type { CompetitorAnalysis, ListingInsight, MarketplaceResearch } from "@/lib/schemas";
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
  listing: (ListingInsight & { platform: "amazon" | "flipkart" }) | null;
};

type Playbook = {
  id: string;
  platform: "amazon" | "flipkart";
  category: string;
  summary: string;
  playbook: MarketplaceResearch["playbook"];
  sources: { title: string; url: string; verified: boolean }[];
  mock: boolean;
  date: string;
};

const WHERE: [string, string][] = [
  ["web", "Across the web (brands and their marketing)"],
  ["amazon", "Amazon.in: what's selling and why"],
  ["flipkart", "Flipkart: what's selling and why"],
];
const MARKET_LABEL = { amazon: "Amazon", flipkart: "Flipkart" } as const;

function PlaybookCard({ p }: { p: Playbook }) {
  const b = p.playbook;
  return (
    <article className="space-y-4 rounded-2xl border border-line bg-surface p-5" data-testid={`playbook-${p.platform}`} aria-label={`What's working on ${MARKET_LABEL[p.platform]}`}>
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="eyebrow">What&apos;s working on {MARKET_LABEL[p.platform]}</p>
          <h2 className="display text-2xl">{p.category}</h2>
        </div>
        <p className="text-xs text-ink-soft">
          Researched {new Date(p.date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })} · used automatically in {MARKET_LABEL[p.platform]} briefs
        </p>
      </header>
      {p.mock ? (
        <span className="chip-amber" data-testid="mock-badge">
          Sample output (mock mode)
        </span>
      ) : null}
      <p className="text-sm">{p.summary}</p>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-3">
          <div>
            <p className="eyebrow mb-1">Title formula</p>
            <p className="rounded-lg bg-surface-2 p-2 font-mono text-xs">{b.title_formula}</p>
          </div>
          {b.must_have_keywords.length ? (
            <div>
              <p className="eyebrow mb-1">Keywords shoppers use</p>
              <ul className="flex flex-wrap gap-1.5">
                {b.must_have_keywords.map((k) => (
                  <li key={k} className="chip">
                    {k}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {b.image_stack.length ? (
            <div>
              <p className="eyebrow mb-1">Image stack, in order</p>
              <ol className="list-decimal space-y-0.5 pl-5 text-sm">
                {b.image_stack.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ol>
            </div>
          ) : null}
          {b.price_and_pack ? (
            <p className="text-sm">
              <span className="font-semibold">Price and pack: </span>
              {b.price_and_pack}
            </p>
          ) : null}
        </div>
        <div className="space-y-3">
          <List title="A+ content that winners use" items={b.a_plus_modules} />
          <List title="Doubts to answer up front (from reviews)" items={b.review_themes_to_answer} />
          <List title="Ad practices" items={b.ad_tips} />
        </div>
      </div>
      {b.for_our_product.length ? (
        <div className="rounded-xl bg-gold-soft p-4">
          <p className="eyebrow mb-1">Do this for our listing and ads</p>
          <ul className="list-disc space-y-0.5 pl-5 text-sm">
            {b.for_our_product.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </article>
  );
}

function ListingFacts({ l }: { l: ListingInsight & { platform: "amazon" | "flipkart" } }) {
  const facts = [
    l.rating && `★ ${l.rating}${l.review_count ? ` · ${l.review_count}` : ""}`,
    l.price && `${l.price}${l.pack_size ? ` for ${l.pack_size}` : ""}`,
    l.price_per_100g && `${l.price_per_100g} per 100 g`,
    l.rank,
  ].filter(Boolean) as string[];
  return (
    <div className="mb-4 space-y-2 rounded-xl border border-line p-3 text-sm" data-testid="listing-facts">
      <p className="eyebrow">{MARKET_LABEL[l.platform]} listing</p>
      <p className="font-semibold">{l.title}</p>
      <div className="flex flex-wrap gap-1.5">
        {facts.map((f) => (
          <span key={f} className="chip">
            {f}
          </span>
        ))}
        {l.badges.map((b) => (
          <span key={b} className="chip-green">
            {b}
          </span>
        ))}
      </div>
      {l.image_stack ? (
        <p>
          <span className="font-semibold">Images: </span>
          {l.image_stack}
        </p>
      ) : null}
      {l.a_plus ? (
        <p>
          <span className="font-semibold">A+ content: </span>
          {l.a_plus}
        </p>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <List title="Reviewers like" items={l.praise} />
        <List title="Reviewers complain" items={l.complaints} />
      </div>
    </div>
  );
}

const FOCUS: [string, string][] = [
  ["overall", "Everything (positioning and marketing)"],
  ["ads", "Their ads and hooks"],
  ["claims", "The claims they make"],
  ["pricing", "Price, pack sizes and offers"],
  ["packaging", "Packaging"],
  ["reviews", "What customers say"],
];

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

function Analysis({ a, mock, id, canDevelop }: { a: CompetitorAnalysis; mock: boolean; id: string; canDevelop: boolean }) {
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
          {a.counter_ideas.map((c, i) => (
            <li key={c.title} className="flex flex-col rounded-xl border border-line bg-surface-2 p-3 text-sm">
              <p className="font-semibold">{c.title}</p>
              <p className="font-serif text-ink">“{c.hook}”</p>
              <p className="mt-1 flex-1 text-xs text-ink-soft">
                {c.angle} · {c.why}
              </p>
              {canDevelop ? (
                <Link href={`/create?competitor=${id}&idea=${i}`} className="btn-primary mt-2 px-3 py-1 text-xs">
                  Develop this idea
                </Link>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function CompetitorsClient({
  rows,
  role,
  products,
  playbooks,
  research: saved,
}: {
  rows: Row[];
  role: Role;
  products: { id: string; name: string }[];
  playbooks: Playbook[];
  research: { id: string; category: string; summary: string; gaps: string[]; date: string; mock: boolean }[];
}) {
  const router = useRouter();
  const [where, setWhere] = useState("web");
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
    const market = where === "amazon" || where === "flipkart";
    setResearch({
      status: market ? `Reading the top ${MARKET_LABEL[where as "amazon"]} listings… (usually 2–4 minutes)` : "Searching the web for competitors… (usually 1–3 minutes)",
      error: "",
      summary: "",
      gaps: [],
      note: "",
    });
    const res = await fetch(market ? "/api/competitors/marketplace" : "/api/competitors/discover", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(market ? { platform: where, category, count, productId: productId || null } : { category, focus, count, productId: productId || null }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return setResearch((r) => ({ ...r, status: "", error: data.error ?? "The search didn't work. Try again." }));
    if (market) {
      setResearch({ status: "", error: "", summary: "", gaps: [], note: `Studied ${data.ids.length} ${MARKET_LABEL[where as "amazon"]} listings. The playbook below will be used in ${MARKET_LABEL[where as "amazon"]} briefs.${data.mock ? " Mock mode: sample listings, no web search ran." : ""}` });
      router.refresh();
      for (let i = 0; i < data.ids.length; i++) {
        setResearch((r) => ({ ...r, status: `Breaking down ${i + 1} of ${data.ids.length}…` }));
        await analyse(data.ids[i]);
      }
      setResearch((r) => ({ ...r, status: "" }));
      return;
    }
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
            <label htmlFor="f-where" className="label">
              Where to look
            </label>
            <select id="f-where" className="input" value={where} onChange={(e) => setWhere(e.target.value)}>
              {WHERE.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          {where === "web" ? (
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
          ) : (
            <p className="hint text-xs">Reads the best-selling listings: titles, image order, A+ content, ratings and reviews, badges, price per 100 g and offers. Then writes a playbook for your listing and ads.</p>
          )}
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
            {research.status ? "Working…" : where === "web" ? "Find competitors" : `See what's working on ${MARKET_LABEL[where as "amazon"]}`}
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
        <div className="rounded-2xl border border-line bg-surface p-5" data-testid="how-used">
          <p className="eyebrow">How this research is used</p>
          <ol className="mt-2 grid gap-3 text-sm sm:grid-cols-2">
            <li>
              <strong className="block text-ink">1. Every new idea stands apart</strong>
              <span className="text-ink-soft">When you create ads for a researched product, proposals avoid these competitors&apos; hooks and lean into the open ground. You can switch it off in the brief.</span>
            </li>
            <li>
              <strong className="block text-ink">2. Their weak spots become your ideas</strong>
              <span className="text-ink-soft">Press “Develop this idea” on any idea below to turn it into a full ad, using only your approved claims.</span>
            </li>
            <li>
              <strong className="block text-ink">3. Copy that echoes them gets flagged</strong>
              <span className="text-ink-soft">The Check panel marks any line that sounds like a competitor&apos;s, and an approver must confirm it before it can be approved.</span>
            </li>
            <li>
              <strong className="block text-ink">4. Amazon and Flipkart ads follow what sells</strong>
              <span className="text-ink-soft">Marketplace playbooks shape titles, keywords and image order in those briefs.</span>
            </li>
          </ol>
        </div>
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
        {playbooks.map((p) => (
          <PlaybookCard key={p.id} p={p} />
        ))}
        {saved.length && !research.summary ? (
          <div className="space-y-3" data-testid="saved-research">
            {saved.slice(0, 2).map((r) => (
              <div key={r.id} className="rounded-2xl border border-line bg-gradient-to-br from-surface to-pink-soft p-5">
                <p className="eyebrow">
                  Category research · {r.category} · {new Date(r.date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                </p>
                {r.mock ? (
                  <span className="chip-amber mt-1" data-testid="mock-badge">
                    Sample output (mock mode)
                  </span>
                ) : null}
                <p className="mt-2 text-sm">{r.summary}</p>
                {r.gaps.length ? (
                  <div className="mt-3">
                    <p className="eyebrow mb-1">Nobody owns yet</p>
                    <ul className="list-disc pl-5 text-sm">
                      {r.gaps.map((g) => (
                        <li key={g}>{g}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ))}
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
                  {r.listing ? <ListingFacts l={r.listing} /> : null}
                  {busy[r.id] ? (
                    <div className="space-y-2" aria-busy="true">
                      <p className="text-sm font-semibold">{busy[r.id]}</p>
                      <div className="skeleton h-4 w-3/4" />
                      <div className="skeleton h-4 w-2/3" />
                      <div className="skeleton h-4 w-1/2" />
                    </div>
                  ) : r.analysis ? (
                    <Analysis a={r.analysis} mock={r.mock} id={r.id} canDevelop={canAnalyse} />
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
