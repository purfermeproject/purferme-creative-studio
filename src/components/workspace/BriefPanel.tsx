"use client";

import { ChoiceOrCustom } from "@/components/ChoiceOrCustom";
import { PLACEMENTS } from "@/lib/placements";
import { AUTO } from "@/lib/prompts";
import { DELIVERABLES, OBJECTIVES, PLATFORMS, type Deliverable, type Objective, type Platform } from "@/lib/types";
import type { Brief, ProductCard } from "./types";

const PLATFORM_NAMES: Record<Platform, { title: string; sub: string }> = {
  meta: { title: "Instagram & Facebook", sub: "Meta ads" },
  amazon: { title: "Amazon", sub: "Search intent" },
  flipkart: { title: "Flipkart", sub: "Listing-led" },
};

const STATUS_CHIP = { ready: "", hold: "chip-amber", blocked: "chip-red" } as const;

function Step({ n, title, children, id }: { n: number; title: string; children: React.ReactNode; id?: string }) {
  return (
    <fieldset className="space-y-2" id={id}>
      <legend className="mb-2 flex items-center gap-2">
        <span className="flex size-5 items-center justify-center rounded-full bg-purple text-[11px] font-bold text-accent-ink" aria-hidden>
          {n}
        </span>
        <span className="text-sm font-semibold text-ink">{title}</span>
      </legend>
      {children}
    </fieldset>
  );
}

/** Radio styled as a selectable tile. The visible text is the accessible name. */
function Tile({
  name,
  checked,
  onChange,
  children,
  disabled,
  className = "",
}: {
  name: string;
  checked: boolean;
  onChange: () => void;
  children: React.ReactNode;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-2 rounded-xl border px-3 py-2 text-sm transition-colors has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-purple ${
        checked ? "border-purple bg-accent-soft" : "border-line bg-surface hover:border-purple/40"
      } ${disabled ? "opacity-60" : ""} ${className}`}
    >
      <input type="radio" name={name} checked={checked} onChange={onChange} className="sr-only" disabled={disabled} />
      {children}
    </label>
  );
}

export function BriefPanel({
  brief,
  set,
  products,
  creativeTypes,
  angles,
  personas,
  languages,
  canGenerate,
  busy,
  onPropose,
  packError,
  onPackFile,
  ready,
}: {
  brief: Brief;
  set: (patch: Partial<Brief>) => void;
  products: ProductCard[];
  creativeTypes: Record<Platform, string[]>;
  angles: string[];
  personas: string[];
  languages: string[];
  canGenerate: boolean;
  busy: boolean;
  onPropose: () => void;
  packError: string;
  onPackFile: (f: File | undefined) => void;
  ready: boolean;
}) {
  const product = products.find((p) => p.id === brief.productId);
  const blocked = product && product.status !== "ready";
  const placements = PLACEMENTS[brief.platform];
  const plain = (xs: string[]) => xs.map((x) => ({ value: x, label: x }));
  const types = creativeTypes[brief.platform];

  return (
    <form
      aria-label="Brief"
      data-ready={ready ? "" : undefined}
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        onPropose();
      }}
    >
      <Step n={1} title="Product">
        <div className="grid max-h-72 gap-1.5 overflow-y-auto pr-1" role="radiogroup" aria-label="Product">
          {products.map((p) => (
            <Tile key={p.id} name="product" checked={p.id === brief.productId} onChange={() => set({ productId: p.id })}>
              <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-line bg-surface-2">
                {p.packImageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.packImageUrl} alt="" className="h-full w-full object-contain" />
                ) : (
                  <span className="font-serif text-sm text-purple" aria-hidden>
                    {p.name.slice(0, 1)}
                  </span>
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block leading-snug font-medium">{p.name}</span>
                {p.status !== "ready" ? <span className={`${STATUS_CHIP[p.status]} mt-0.5`}>{p.status === "hold" ? "on hold" : "blocked"}</span> : null}
              </span>
            </Tile>
          ))}
        </div>
        {product ? (
          blocked ? (
            <p role="alert" className={`rounded-lg border p-3 text-sm ${product.status === "blocked" ? "border-red/30 bg-red-bg text-red" : "border-amber/30 bg-amber-bg text-amber"}`} data-testid="product-blocked">
              <strong>{product.status === "blocked" ? "Blocked" : "On hold"}:</strong> {product.statusReason || "No reason given."} An admin can set it to ready in Settings.
            </p>
          ) : (
            <div className="rounded-xl bg-surface-2 p-3 text-xs text-ink-soft" data-testid="product-knowledge">
              <p className="font-semibold text-ink">What the AI knows</p>
              <p className="mt-1">
                {product.greenClaims.length} approved claims · {product.amberClaims.length} need evidence ({product.evidenceCount} on file) · {product.redClaims.length} never used
              </p>
              {product.messagingPriorities.length ? <p className="mt-1">Leads with: {product.messagingPriorities.slice(0, 3).join(" · ")}</p> : null}
              <p className="mt-1">{product.packImageUrl ? "Original pack photo on file: images place it unchanged." : "No pack photo yet: images will leave the pack out. Add one in Settings."}</p>
            </div>
          )
        ) : null}
      </Step>

      <Step n={2} title="Campaign objective">
        <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="Campaign objective">
          {OBJECTIVES.map((o) => (
            <Tile key={o.id} name="objective" checked={brief.objective === o.id} onChange={() => set({ objective: o.id as Objective })} className="flex-col gap-0">
              <span className="font-medium">{o.label}</span>
              <span className="text-xs text-ink-soft">{o.hint}</span>
            </Tile>
          ))}
        </div>
      </Step>

      <Step n={3} title="Audience">
        <ChoiceOrCustom
          id="audience"
          label="Who it's for"
          value={brief.persona}
          onChange={(v) => set({ persona: v })}
          options={[{ value: AUTO, label: "Let AI pick a varied mix" }, ...plain(personas)]}
          placeholder="e.g. New moms back at work"
        />
      </Step>

      <Step n={4} title="Platform and format">
        <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Platform">
          {PLATFORMS.map((p) => (
            <Tile key={p} name="platform" checked={brief.platform === p} onChange={() => set({ platform: p })} className="flex-col items-center gap-0 px-1 text-center">
              <span className="text-[13px] leading-tight font-medium">{PLATFORM_NAMES[p].title}</span>
              <span className="text-[11px] text-ink-soft">{PLATFORM_NAMES[p].sub}</span>
            </Tile>
          ))}
        </div>
        <ChoiceOrCustom
          key={`type-${brief.platform}`}
          id="ctype"
          label="Type of ad"
          value={brief.creativeType}
          onChange={(v) => set({ creativeType: v })}
          options={plain(types)}
          placeholder="e.g. 6s bumper video, WhatsApp status image"
        />
        {placements.length ? (
          <ChoiceOrCustom
            key={`place-${brief.platform}`}
            id="placement"
            label="Where it runs"
            value={brief.placement}
            onChange={(v) => set({ placement: v })}
            options={plain(placements.map((p) => p.label))}
            placeholder="e.g. Instagram Explore, WhatsApp Status"
          />
        ) : null}
        <div>
          <p className="label" id="deliverable-label">
            What to make
          </p>
          <div className="grid gap-1.5" role="radiogroup" aria-labelledby="deliverable-label">
            {DELIVERABLES.map((d) => (
              <Tile key={d.id} name="deliverable" checked={brief.deliverable === d.id} onChange={() => set({ deliverable: d.id as Deliverable })} className="flex-col gap-0">
                <span className="font-medium">{d.label}</span>
                <span className="text-xs text-ink-soft">{d.hint}</span>
              </Tile>
            ))}
          </div>
        </div>
      </Step>

      <Step n={5} title="Creative angle">
        <ChoiceOrCustom
          id="angle"
          label="Angle (what the ad is about)"
          value={brief.angle}
          onChange={(v) => set({ angle: v })}
          options={[{ value: AUTO, label: "Let AI pick a varied mix" }, ...plain(angles)]}
          placeholder="e.g. Monsoon chai-time snack"
        />
        <ChoiceOrCustom id="language" label="Language" value={brief.language} onChange={(v) => set({ language: v })} options={plain(languages)} placeholder="e.g. Punjabi, Kannada" />
        <details className="group rounded-xl border border-line">
          <summary className="cursor-pointer list-none px-3 py-2 text-sm font-semibold text-ink-soft hover:text-ink">
            <span className="inline-block transition-transform group-open:rotate-90" aria-hidden>
              ▸
            </span>{" "}
            More direction{brief.extra || brief.inspiration || brief.pack ? " (added)" : ""}
          </summary>
          <div className="space-y-4 border-t border-line p-3">
            <div>
              <label htmlFor="extra" className="label">
                Anything else? <span className="font-normal text-ink-soft">(optional)</span>
              </label>
              <textarea id="extra" className="input" rows={2} value={brief.extra} onChange={(e) => set({ extra: e.target.value })} placeholder="e.g. Diwali gifting, 10% off this week" />
            </div>
            <div>
              <label htmlFor="inspiration" className="label">
                An ad you like <span className="font-normal text-ink-soft">(optional)</span>
              </label>
              <textarea
                id="inspiration"
                className="input"
                rows={3}
                value={brief.inspiration}
                onChange={(e) => set({ inspiration: e.target.value })}
                placeholder="Paste or describe an ad whose style you want to riff on. The AI borrows the energy, not the words."
              />
            </div>
            <div>
              <label htmlFor="photo" className="label">
                Different pack photo <span className="font-normal text-ink-soft">(optional)</span>
              </label>
              <input id="photo" type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => onPackFile(e.target.files?.[0])} />
              <p className="hint mt-1">{brief.pack ? `Using ${brief.pack.name} for this session.` : "Leave empty to use the pack photo saved in Settings."}</p>
              {packError ? <p className="mt-1 text-sm text-red">{packError}</p> : null}
            </div>
          </div>
        </details>
      </Step>

      <div className="sticky bottom-0 -mx-1 bg-gradient-to-t from-bg via-bg to-transparent px-1 pt-3 pb-1">
        <button type="submit" className="btn-primary w-full py-3 text-base" disabled={busy || !canGenerate || !product || Boolean(blocked) || !brief.creativeType.trim()}>
          {busy ? "Working…" : "Propose 3 concepts"}
        </button>
        {!canGenerate ? <p className="hint mt-2 text-center">Your role can view but not create. Ask an admin for Creator access.</p> : null}
      </div>
    </form>
  );
}
