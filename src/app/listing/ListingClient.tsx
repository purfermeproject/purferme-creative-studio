"use client";

import { useState } from "react";
import { finishSlide } from "@/components/listing-render";
import type { BrandKit } from "@/lib/brand-kit";
import { LISTING_LABELS, LISTING_PLATFORMS, LISTING_SIZE, SLIDE_KIND_LABELS, SLIDE_KINDS, type ListingPlan, type ListingPlatform, type Slide, type SlideCheck } from "@/lib/listing-plan";
import { readNdjson } from "@/lib/ndjson";
import { can } from "@/lib/roles";
import type { Role } from "@/lib/types";

type Checks = { checks: SlideCheck[] }[];
export type SavedPlan = { plan: ListingPlan; images: Record<string, string>; checks: Checks };
type Product = { id: string; name: string; hasPack: boolean; hasTeamPlan: boolean; photos: { id: string; label: string }[] };

async function call<T>(url: string, method: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "That didn't work. Try again.");
  return data as T;
}

const LEVEL_STYLE: Record<SlideCheck["level"], string> = {
  block: "border-red/30 bg-red-bg text-red",
  review: "border-amber/30 bg-amber-bg text-amber",
  tip: "border-line bg-surface-2 text-ink-soft",
};
const LEVEL_LABEL: Record<SlideCheck["level"], string> = { block: "Must fix", review: "Approver checks", tip: "Tip" };

export function ListingClient({ role, kit, rules, products, saved }: { role: Role; kit: BrandKit; rules: string[]; products: Product[]; saved: Record<string, SavedPlan> }) {
  const [productId, setProductId] = useState(products.find((p) => p.hasTeamPlan)?.id ?? products[0]?.id ?? "");
  const [platform, setPlatform] = useState<ListingPlatform>("amazon");
  const [plans, setPlans] = useState(saved);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const key = `${productId}:${platform}`;
  const current = plans[key] ?? null;
  const product = products.find((p) => p.id === productId);
  const canRun = can(role, "generate");
  const canEdit = can(role, "edit");

  async function makePlan(source: "ai" | "team") {
    setBusy("plan");
    setError("");
    try {
      const r = await call<SavedPlan & { images: Record<string, string> }>("/api/listing/plan", "POST", { productId, platform, source });
      setPlans((m) => ({ ...m, [key]: { plan: r.plan, images: {}, checks: r.checks } }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't make the plan.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-end gap-4 rounded-3xl border border-line bg-surface p-5 shadow-[0_12px_32px_-20px_rgba(45,27,84,0.35)]" aria-label="Choose">
        <label className="min-w-64 flex-1">
          <span className="label">Product</span>
          <select className="input" value={productId} onChange={(e) => setProductId(e.target.value)}>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.hasPack ? "" : " (no pack photo)"}
              </option>
            ))}
          </select>
        </label>
        <div>
          <span className="label">Where it sells</span>
          <div role="tablist" aria-label="Marketplace" className="flex gap-1 rounded-xl bg-surface-2 p-1">
            {LISTING_PLATFORMS.map((p) => (
              <button
                key={p}
                type="button"
                role="tab"
                aria-selected={platform === p}
                onClick={() => setPlatform(p)}
                className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${platform === p ? "bg-surface text-ink shadow-sm" : "text-ink-soft hover:text-ink"}`}
              >
                {LISTING_LABELS[p]} <span className="font-normal text-ink-soft">{LISTING_SIZE[p]}²</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {error ? (
        <p role="alert" className="rounded-xl border border-red/30 bg-red-bg p-3 text-sm text-red">
          {error}
        </p>
      ) : null}
      {product && !product.hasPack ? (
        <p className="rounded-xl border border-amber/30 bg-amber-bg p-3 text-sm text-amber">
          {product.name} has no pack photo yet. Add it in Tools → Settings → Products: every image uses the real pack.
        </p>
      ) : null}

      {!current && product ? (
        <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]" data-testid="listing-empty">
          <div className="rounded-3xl border border-line bg-surface p-6">
            <p className="eyebrow">How the stack is built</p>
            <ol className="mt-3 space-y-2.5">
              {rules.map((r, i) => (
                <li key={r} className="flex gap-3 text-sm">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-purple font-serif text-xs font-semibold text-accent-ink">{i + 1}</span>
                  <span className="text-ink-soft">{r}</span>
                </li>
              ))}
            </ol>
          </div>
          <div className="flex flex-col gap-3 rounded-3xl border border-purple/30 bg-surface p-6">
            <p className="font-semibold">Start the {LISTING_LABELS[platform]} plan for {product.name}</p>
            {product.hasTeamPlan ? (
              <button type="button" className="btn-primary" onClick={() => makePlan("team")} disabled={!!busy || !canRun}>
                Load your team&apos;s plan
              </button>
            ) : null}
            <button type="button" className={product.hasTeamPlan ? "btn-secondary" : "btn-primary"} onClick={() => makePlan("ai")} disabled={!!busy || !canRun}>
              {busy === "plan" ? "Planning…" : "Let the AI plan it"}
            </button>
            <p className="hint">
              {product.hasTeamPlan
                ? "Your plan is loaded exactly as written; each slide shows what the claim rules need changed. The AI writes a new one in the same format, using only approved claims."
                : "The AI writes 7 slides in your team's format (learned from your listing analysis), using only this product's approved claims."}
            </p>
          </div>
        </section>
      ) : null}

      {current && product ? (
        <PlanEditor
          key={key}
          product={product}
          platform={platform}
          kit={kit}
          saved={current}
          onSaved={(p) => setPlans((m) => ({ ...m, [key]: p }))}
          onReplan={() => makePlan("ai")}
          canRun={canRun}
          canEdit={canEdit}
          replanning={busy === "plan"}
        />
      ) : null}
    </div>
  );
}

function PlanEditor({
  product,
  platform,
  kit,
  saved,
  onSaved,
  onReplan,
  canRun,
  canEdit,
  replanning,
}: {
  product: Product;
  platform: ListingPlatform;
  kit: BrandKit;
  saved: SavedPlan;
  onSaved: (p: SavedPlan) => void;
  onReplan: () => void;
  canRun: boolean;
  canEdit: boolean;
  replanning: boolean;
}) {
  const [plan, setPlan] = useState(saved.plan);
  const [dirty, setDirty] = useState(false);
  const [working, setWorking] = useState<string | null>(null);
  const [stages, setStages] = useState<Record<string, string[]>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [photoId, setPhotoId] = useState(product.photos[0]?.id ?? "");
  const S = LISTING_SIZE[platform];

  const setSlide = (i: number, patch: Partial<Slide>) => {
    setPlan((p) => ({ ...p, slides: p.slides.map((s, k) => (k === i ? { ...s, ...patch } : s)) }));
    setDirty(true);
  };

  async function save(): Promise<SavedPlan> {
    const r = await call<SavedPlan>("/api/listing/plan", "PUT", { productId: product.id, platform, plan });
    const next = { plan: r.plan, images: saved.images, checks: r.checks };
    onSaved(next);
    setDirty(false);
    return next;
  }

  /** Makes one image: the server returns the base (or the finished main image); slides get their words here. */
  async function make(slot: "main" | number, current = saved): Promise<SavedPlan> {
    const id = String(slot);
    setWorking(id);
    setErrors((e) => ({ ...e, [id]: "" }));
    const steps: string[] = [];
    const add = (t: string) => {
      steps.push(t);
      setStages((m) => ({ ...m, [id]: [...steps] }));
    };
    try {
      let state = current;
      if (dirty && canEdit) state = await save();
      const res = await fetch("/api/listing/slide", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ productId: product.id, platform, slot, productPhotoId: slot === "main" && photoId ? photoId : null }),
      });
      const done = await readNdjson<{ image: { id: string; url: string }; final: boolean; panel?: string }>(res, () => {}, add);
      let url = done.image.url;
      if (!done.final && slot !== "main") {
        add("Adding the header, sub-header and feature in your brand fonts");
        const fin = await finishSlide({ baseUrl: done.image.url, kit, slide: plan.slides[slot - 1], slot, panel: done.panel ?? kit.colors.primary });
        await call("/api/listing/attach", "POST", { productId: product.id, platform, slot: id, assetId: fin.id });
        url = fin.url;
      }
      const next = { ...state, images: { ...state.images, [id]: url } };
      onSaved(next);
      return next;
    } catch (e) {
      setErrors((m) => ({ ...m, [id]: e instanceof Error ? e.message : "Couldn't make it." }));
      return current;
    } finally {
      setWorking(null);
      setStages((m) => ({ ...m, [id]: [] }));
    }
  }

  async function makeAll() {
    let state = saved;
    if (!state.images.main) state = await make("main", state);
    for (let i = 0; i < plan.slides.length; i++) {
      if (state.checks[i]?.checks.some((c) => c.level === "block")) continue;
      state = await make(i + 1, state);
    }
  }

  const blocked = saved.checks.filter((c) => c.checks.some((x) => x.level === "block")).length;
  const made = Object.keys(saved.images).length;

  return (
    <div className="space-y-5">
      <div className="sticky top-0 z-20 -mx-1 flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-surface/95 px-4 py-3 backdrop-blur" data-testid="listing-toolbar">
        <p className="mr-auto text-sm">
          <span className="font-semibold">
            {made} of {plan.slides.length + 1} images made
          </span>
          {blocked ? <span className="ml-2 chip-red">{blocked} slide{blocked > 1 ? "s" : ""} to fix</span> : <span className="ml-2 chip-green">All slides pass the claim rules</span>}
        </p>
        {canEdit ? (
          <button type="button" className="btn-secondary px-3 py-1.5 text-sm" onClick={() => void save()} disabled={!dirty || !!working}>
            {dirty ? "Save changes" : "Saved"}
          </button>
        ) : null}
        <button type="button" className="btn-secondary px-3 py-1.5 text-sm" onClick={onReplan} disabled={!!working || replanning || !canRun}>
          {replanning ? "Planning…" : "New AI plan"}
        </button>
        <button type="button" className="btn-primary px-3 py-1.5 text-sm" onClick={() => void makeAll()} disabled={!!working || !canRun}>
          Make all images
        </button>
        {made ? (
          <a className="btn-secondary px-3 py-1.5 text-sm" href={`/api/listing/zip?productId=${product.id}&platform=${platform}`} download data-testid="listing-zip">
            Download all (.zip)
          </a>
        ) : null}
      </div>

      {/* Main image */}
      <article className="grid gap-5 rounded-3xl border border-line bg-surface p-5 md:grid-cols-[16rem_minmax(0,1fr)]" data-testid="slot-main">
        <Preview url={saved.images.main} label="Main image" sub="Pack on pure white" />
        <div className="space-y-3">
          <div className="flex items-baseline gap-2">
            <span className="eyebrow">Image 1</span>
            <h3 className="display text-2xl">Main image</h3>
          </div>
          <p className="text-sm text-ink-soft">
            Your real pack on pure white, filling about 85% of the frame ({S}×{S}). {plan.main.note}
          </p>
          {product.photos.length ? (
            <label className="block max-w-sm">
              <span className="label">Beside the pack</span>
              <select className="input" value={photoId} onChange={(e) => setPhotoId(e.target.value)}>
                <option value="">Nothing, just the pack</option>
                {product.photos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <p className="hint">Add a real photo of the product itself (e.g. a stack of cookies) in Settings → Products to stand it beside the pack.</p>
          )}
          <Stages list={stages.main} error={errors.main} />
          <button type="button" className="btn-primary" onClick={() => void make("main")} disabled={!!working || !canRun || !product.hasPack}>
            {working === "main" ? "Making…" : saved.images.main ? "Make again" : "Make main image"}
          </button>
        </div>
      </article>

      {plan.slides.map((s, i) => {
        const slot = i + 1;
        const checks = saved.checks[i]?.checks ?? [];
        const isBlocked = checks.some((c) => c.level === "block");
        return (
          <article key={i} className="grid gap-5 rounded-3xl border border-line bg-surface p-5 md:grid-cols-[16rem_minmax(0,1fr)]" data-testid={`slot-${slot}`}>
            <Preview url={saved.images[String(slot)]} label={s.header} sub={SLIDE_KIND_LABELS[s.kind]} />
            <div className="min-w-0 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="eyebrow">Image {slot + 1}</span>
                <select
                  aria-label={`Slide ${slot} type`}
                  className="input w-auto py-1 text-sm"
                  value={s.kind}
                  disabled={!canEdit}
                  onChange={(e) => setSlide(i, { kind: e.target.value as Slide["kind"] })}
                >
                  {SLIDE_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {SLIDE_KIND_LABELS[k]}
                    </option>
                  ))}
                </select>
                {s.reference ? <span className="text-xs text-ink-soft">Inspired by {s.reference}</span> : null}
              </div>
              <div className="grid gap-3 lg:grid-cols-2">
                <label>
                  <span className="label">Header</span>
                  <input className="input font-semibold" value={s.header} disabled={!canEdit} onChange={(e) => setSlide(i, { header: e.target.value })} aria-label={`Slide ${slot} header`} />
                </label>
                <label>
                  <span className="label">Sub-header</span>
                  <input className="input" value={s.sub} disabled={!canEdit} onChange={(e) => setSlide(i, { sub: e.target.value })} />
                </label>
                <label className="lg:col-span-2">
                  <span className="label">Feature next to the pack (separate parts with |)</span>
                  <input className="input" value={s.feature} disabled={!canEdit} onChange={(e) => setSlide(i, { feature: e.target.value })} />
                </label>
                {s.kind === "comparison" ? (
                  <ComparisonEditor slide={s} disabled={!canEdit} onChange={(comparison) => setSlide(i, { comparison })} />
                ) : (
                  <label className="lg:col-span-2">
                    <span className="label">Photo: who, where, doing what</span>
                    <textarea className="input" rows={2} value={s.scene} disabled={!canEdit} onChange={(e) => setSlide(i, { scene: e.target.value })} />
                  </label>
                )}
              </div>
              {checks.length ? (
                <ul className="space-y-1.5" data-testid={`checks-${slot}`}>
                  {checks.map((c, k) => (
                    <li key={k} className={`rounded-lg border px-3 py-1.5 text-sm ${LEVEL_STYLE[c.level]}`}>
                      <span className="font-semibold">{LEVEL_LABEL[c.level]}: </span>
                      {c.text}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm font-semibold text-leaf">✓ Passes the claim rules</p>
              )}
              {dirty ? <p className="hint">Save to re-check the words.</p> : null}
              <Stages list={stages[String(slot)]} error={errors[String(slot)]} />
              <button type="button" className="btn-primary" onClick={() => void make(slot)} disabled={!!working || !canRun || !product.hasPack || (isBlocked && !dirty)}>
                {working === String(slot) ? "Making…" : isBlocked && !dirty ? "Fix the words first" : saved.images[String(slot)] ? "Make again" : `Make image ${slot + 1}`}
              </button>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function Preview({ url, label, sub }: { url?: string; label: string; sub: string }) {
  return url ? (
    <a href={url} target="_blank" rel="noreferrer" className="block self-start overflow-hidden rounded-2xl border border-line">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={label} className="aspect-square w-full object-cover" />
    </a>
  ) : (
    <div className="flex aspect-square w-full flex-col justify-between self-start rounded-2xl border border-dashed border-line bg-surface-2 p-4">
      <span className="eyebrow">Not made yet</span>
      <span>
        <span className="line-clamp-3 font-serif text-lg font-semibold text-purple">{label}</span>
        <span className="text-xs text-ink-soft">{sub}</span>
      </span>
    </div>
  );
}

function Stages({ list, error }: { list?: string[]; error?: string }) {
  if (error)
    return (
      <p role="alert" className="rounded-xl border border-red/30 bg-red-bg p-3 text-sm text-red">
        {error}
      </p>
    );
  if (!list?.length) return null;
  return (
    <ol className="space-y-1 rounded-xl bg-surface-2 p-3 text-sm" aria-label="What is happening now">
      {list.map((s, k) => (
        <li key={k} className={k === list.length - 1 ? "font-semibold" : "text-ink-soft"}>
          {k === list.length - 1 ? "⏳ " : "✓ "}
          {s}
        </li>
      ))}
    </ol>
  );
}

function ComparisonEditor({ slide, disabled, onChange }: { slide: Slide; disabled: boolean; onChange: (c: NonNullable<Slide["comparison"]>) => void }) {
  const c = slide.comparison ?? { us: "PurFerme", them: "Regular version", rows: [] };
  const setRow = (i: number, patch: Partial<(typeof c.rows)[number]>) => onChange({ ...c, rows: c.rows.map((r, k) => (k === i ? { ...r, ...patch } : r)) });
  return (
    <div className="space-y-2 lg:col-span-2">
      <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_2rem] items-center gap-2 text-xs font-semibold text-ink-soft uppercase">
        <span>Row</span>
        <input className="input py-1 text-sm normal-case" value={c.us} disabled={disabled} onChange={(e) => onChange({ ...c, us: e.target.value })} aria-label="Our column" />
        <input className="input py-1 text-sm normal-case" value={c.them} disabled={disabled} onChange={(e) => onChange({ ...c, them: e.target.value })} aria-label="Generic column (never a brand)" />
        <span />
      </div>
      {c.rows.map((r, i) => (
        <div key={i} className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_2rem] items-center gap-2">
          <input className="input py-1 text-sm" value={r.label} disabled={disabled} onChange={(e) => setRow(i, { label: e.target.value })} aria-label={`Row ${i + 1}`} />
          <input className="input py-1 text-center text-sm" value={r.us} disabled={disabled} onChange={(e) => setRow(i, { us: e.target.value })} aria-label={`Row ${i + 1} ours`} />
          <input className="input py-1 text-center text-sm" value={r.them} disabled={disabled} onChange={(e) => setRow(i, { them: e.target.value })} aria-label={`Row ${i + 1} generic`} />
          <button type="button" className="text-ink-soft hover:text-red" disabled={disabled} onClick={() => onChange({ ...c, rows: c.rows.filter((_, k) => k !== i) })} aria-label={`Remove row ${i + 1}`}>
            ✕
          </button>
        </div>
      ))}
      {c.rows.length < 6 ? (
        <button type="button" className="text-sm font-semibold text-purple hover:underline" disabled={disabled} onClick={() => onChange({ ...c, rows: [...c.rows, { label: "No …", us: "✓", them: "✗" }] })}>
          + Add a row
        </button>
      ) : null}
      <p className="hint">Word each row so ✓ is the good answer (“No palm oil”, not “Palm oil”): ✓ shows green, ✗ red. Short values like “9 g” work too. Every row must be true for most products in that category.</p>
    </div>
  );
}
