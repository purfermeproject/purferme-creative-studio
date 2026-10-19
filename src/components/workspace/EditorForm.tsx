"use client";

import type { CreativeSnapshot } from "@/db/schema";
import type { Platform } from "@/lib/types";

const HEADLINE_LIMIT: Record<Platform, number> = { meta: 40, amazon: 50, flipkart: 40 };

function Counter({ value, limit }: { value: string; limit: number }) {
  const over = value.length > limit;
  return (
    <span className={`text-xs tabular-nums ${over ? "font-semibold text-amber" : "text-ink-soft"}`} aria-live="polite">
      {value.length}/{limit}
    </span>
  );
}

function Field({ id, label, children, aside }: { id: string; label: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-sm font-semibold text-ink">
          {label}
        </label>
        {aside}
      </div>
      {children}
    </div>
  );
}

/** Every editable part of a creative. Changes go straight to autosave. */
export function EditorForm({
  value: s,
  onChange,
  platform,
  approvedClaims,
  readOnly,
}: {
  value: CreativeSnapshot;
  onChange: (next: CreativeSnapshot) => void;
  platform: Platform;
  approvedClaims: string[];
  readOnly: boolean;
}) {
  const set = (patch: Partial<CreativeSnapshot>) => onChange({ ...s, ...patch });
  const setCopy = (patch: Partial<CreativeSnapshot["copy"]>) => set({ copy: { ...s.copy, ...patch } });
  const setFrame = (i: number, patch: Partial<CreativeSnapshot["frames"][number]>) => set({ frames: s.frames.map((f, j) => (j === i ? { ...f, ...patch } : f)) });
  const moveFrame = (i: number, d: -1 | 1) => {
    const next = [...s.frames];
    const [f] = next.splice(i, 1);
    next.splice(i + d, 0, f);
    set({ frames: next });
  };
  const variants = s.copy.variants ?? [];
  const unusedClaims = approvedClaims.filter((c) => !s.claims.some((x) => x.text === c));
  const hl = HEADLINE_LIMIT[platform];

  return (
    <fieldset disabled={readOnly} className="space-y-5" aria-label="Edit the ad" data-testid="editor">
      <Field id="ed-title" label="Title (internal)">
        <input id="ed-title" className="input" value={s.title} onChange={(e) => set({ title: e.target.value })} />
      </Field>
      <Field id="ed-hook" label="Hook (first 2 seconds)" aside={<Counter value={s.hook} limit={70} />}>
        <textarea id="ed-hook" className="input font-serif text-base" rows={2} value={s.hook} onChange={(e) => set({ hook: e.target.value })} />
      </Field>

      <div className="space-y-3 rounded-xl border border-line p-3">
        <p className="eyebrow">Copy</p>
        <Field id="ed-headline" label="Headline" aside={<Counter value={s.copy.headline ?? ""} limit={hl} />}>
          <input id="ed-headline" className="input" value={s.copy.headline ?? ""} onChange={(e) => setCopy({ headline: e.target.value })} />
        </Field>
        <Field id="ed-body" label="Primary text" aside={platform === "meta" ? <Counter value={s.copy.body ?? ""} limit={125} /> : null}>
          <textarea id="ed-body" className="input" rows={4} value={s.copy.body ?? ""} onChange={(e) => setCopy({ body: e.target.value })} />
        </Field>
        <Field id="ed-body-alt" label="Second version or creator brief">
          <textarea id="ed-body-alt" className="input" rows={3} value={s.copy.body_alt ?? ""} onChange={(e) => setCopy({ body_alt: e.target.value })} />
        </Field>
        <Field id="ed-cta" label="Call to action">
          <input id="ed-cta" className="input" value={s.copy.cta ?? ""} onChange={(e) => setCopy({ cta: e.target.value })} />
        </Field>
      </div>

      <div className="space-y-3 rounded-xl border border-line p-3">
        <div className="flex items-center justify-between">
          <p className="eyebrow">Copy variants ({variants.length})</p>
          <button type="button" className="text-sm font-semibold text-purple hover:underline" onClick={() => setCopy({ variants: [...variants, { headline: "", body: "", cta: s.copy.cta || "Shop now" }] })} disabled={variants.length >= 8}>
            + Add variant
          </button>
        </div>
        {variants.map((v, i) => (
          <div key={i} className="space-y-2 rounded-lg bg-surface-2 p-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-ink-soft">Variant {i + 1}</span>
              <button type="button" className="text-xs font-semibold text-red hover:underline" onClick={() => setCopy({ variants: variants.filter((_, j) => j !== i) })}>
                Remove
              </button>
            </div>
            <input aria-label={`Variant ${i + 1} headline`} className="input" value={v.headline} placeholder="Headline" onChange={(e) => setCopy({ variants: variants.map((x, j) => (j === i ? { ...x, headline: e.target.value } : x)) })} />
            <textarea aria-label={`Variant ${i + 1} primary text`} className="input" rows={2} value={v.body} placeholder="Primary text" onChange={(e) => setCopy({ variants: variants.map((x, j) => (j === i ? { ...x, body: e.target.value } : x)) })} />
            <input aria-label={`Variant ${i + 1} call to action`} className="input" value={v.cta} placeholder="CTA" onChange={(e) => setCopy({ variants: variants.map((x, j) => (j === i ? { ...x, cta: e.target.value } : x)) })} />
          </div>
        ))}
      </div>

      <div className="space-y-3 rounded-xl border border-line p-3">
        <div className="flex items-center justify-between">
          <p className="eyebrow">Scenes ({s.frames.length})</p>
          <button
            type="button"
            className="text-sm font-semibold text-purple hover:underline"
            onClick={() => set({ frames: [...s.frames, { slot: `Scene ${s.frames.length + 1}`, visual: "", onscreen: "" }] })}
            disabled={s.frames.length >= 12}
          >
            + Add scene
          </button>
        </div>
        {s.frames.map((f, i) => (
          <div key={i} className="space-y-2 rounded-lg bg-surface-2 p-2" data-testid={`scene-editor-${i}`}>
            <div className="flex items-center gap-2">
              <input aria-label={`Scene ${i + 1} timing or name`} className="input w-32 py-1 text-sm" value={f.slot} onChange={(e) => setFrame(i, { slot: e.target.value })} />
              <span className="flex-1" />
              <button type="button" className="rounded px-1.5 text-sm hover:bg-surface disabled:opacity-40" aria-label={`Move scene ${i + 1} up`} disabled={i === 0} onClick={() => moveFrame(i, -1)}>
                ↑
              </button>
              <button type="button" className="rounded px-1.5 text-sm hover:bg-surface disabled:opacity-40" aria-label={`Move scene ${i + 1} down`} disabled={i === s.frames.length - 1} onClick={() => moveFrame(i, 1)}>
                ↓
              </button>
              <button type="button" className="text-xs font-semibold text-red hover:underline disabled:opacity-40" disabled={s.frames.length <= 1} onClick={() => set({ frames: s.frames.filter((_, j) => j !== i) })}>
                Remove
              </button>
            </div>
            <textarea aria-label={`Scene ${i + 1} on-screen text`} className="input font-semibold" rows={1} value={f.onscreen} placeholder="On-screen text" onChange={(e) => setFrame(i, { onscreen: e.target.value })} />
            <textarea aria-label={`Scene ${i + 1} visual`} className="input text-sm" rows={2} value={f.visual} placeholder="What's in frame" onChange={(e) => setFrame(i, { visual: e.target.value })} />
            <textarea aria-label={`Scene ${i + 1} audio`} className="input text-sm" rows={1} value={f.audio ?? ""} placeholder="Voiceover, dialogue or sound (optional)" onChange={(e) => setFrame(i, { audio: e.target.value || undefined })} />
          </div>
        ))}
      </div>

      <div className="space-y-2 rounded-xl border border-line p-3">
        <p className="eyebrow">Claims used</p>
        <p className="hint text-xs">List every claim the ad makes. The check compares them with the product&apos;s claims library.</p>
        {s.claims.map((c, i) => (
          <div key={i} className="flex items-center gap-2">
            <input aria-label={`Claim ${i + 1}`} className="input py-1 text-sm" value={c.text} onChange={(e) => set({ claims: s.claims.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) })} />
            <select aria-label={`Claim ${i + 1} tier`} className="input w-24 py-1 text-sm" value={c.tier} onChange={(e) => set({ claims: s.claims.map((x, j) => (j === i ? { ...x, tier: e.target.value as "green" | "amber" } : x)) })}>
              <option value="green">green</option>
              <option value="amber">amber</option>
            </select>
            <button type="button" className="text-xs font-semibold text-red hover:underline" onClick={() => set({ claims: s.claims.filter((_, j) => j !== i) })} aria-label={`Remove claim ${i + 1}`}>
              ✕
            </button>
          </div>
        ))}
        {unusedClaims.length ? (
          <select
            aria-label="Add an approved claim"
            className="input py-1 text-sm"
            value=""
            onChange={(e) => e.target.value && set({ claims: [...s.claims, { text: e.target.value, tier: "green" }] })}
          >
            <option value="">+ Add an approved claim…</option>
            {unusedClaims.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        ) : null}
      </div>

      <details className="rounded-xl border border-line p-3">
        <summary className="cursor-pointer text-sm font-semibold">Details: audience, angle, render prompt</summary>
        <div className="mt-3 space-y-3">
          <Field id="ed-persona" label="Audience">
            <input id="ed-persona" className="input" value={s.persona} onChange={(e) => set({ persona: e.target.value })} />
          </Field>
          <Field id="ed-angle" label="Angle">
            <input id="ed-angle" className="input" value={s.angle} onChange={(e) => set({ angle: e.target.value })} />
          </Field>
          <Field id="ed-language" label="Language">
            <input id="ed-language" className="input" value={s.language} onChange={(e) => set({ language: e.target.value })} />
          </Field>
          <Field id="ed-format" label="Format">
            <input id="ed-format" className="input" value={s.format} onChange={(e) => set({ format: e.target.value })} />
          </Field>
          <Field id="ed-prompt" label="Image render prompt">
            <textarea id="ed-prompt" className="input font-mono text-xs" rows={4} value={s.aiPrompt} onChange={(e) => set({ aiPrompt: e.target.value })} />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={s.needsRealPerson} onChange={(e) => set({ needsRealPerson: e.target.checked })} /> Needs a real person on camera
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={s.aiLabelNeeded} onChange={(e) => set({ aiLabelNeeded: e.target.checked })} /> Show an AI-generated label
          </label>
        </div>
      </details>
    </fieldset>
  );
}
