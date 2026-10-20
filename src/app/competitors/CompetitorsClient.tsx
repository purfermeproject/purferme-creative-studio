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
};

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

export function CompetitorsClient({ rows, role }: { rows: Row[]; role: Role }) {
  const router = useRouter();
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
      {canAdd ? (
        <form
          className="card h-fit space-y-3 lg:sticky lg:top-4"
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
      ) : (
        <p className="card h-fit text-sm text-ink-soft">Your role can view competitor ads but not add them.</p>
      )}

      <section aria-label="Competitor ads" className="min-w-0 space-y-4">
        {rows.length === 0 ? (
          <div className="card border-dashed text-center" data-testid="competitors-empty">
            <p className="display text-xl">No competitor ads yet</p>
            <p className="hint mt-1">Add one on the left: paste its text or upload a screenshot.</p>
          </div>
        ) : (
          rows.map((r) => (
            <article key={r.id} className="card space-y-4" data-testid="competitor" aria-label={`${r.brand} ad`}>
              <header className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="display text-2xl">{r.brand}</h2>
                  <p className="hint text-sm">{[r.product, r.channel, `added by ${r.createdBy}`].filter(Boolean).join(" · ")}</p>
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
                  {r.link ? (
                    <a href={r.link} target="_blank" rel="noopener noreferrer nofollow" className="block truncate text-xs text-purple underline">
                      Open link
                    </a>
                  ) : null}
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
