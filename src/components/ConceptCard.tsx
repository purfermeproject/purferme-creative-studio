import type { ReactNode } from "react";
import { ScanSummary } from "@/components/Scan";
import type { ScanResult } from "@/lib/compliance";
import type { Concept } from "@/lib/schemas";
import { PLATFORM_LABELS, type Platform } from "@/lib/types";

export function ConceptCard({
  concept: c,
  platform,
  scan,
  actions,
  badge,
  testId,
}: {
  concept: Concept;
  platform: Platform;
  scan: ScanResult;
  actions?: ReactNode;
  badge?: ReactNode;
  testId?: string;
}) {
  const hasAudio = c.frames.some((f) => f.audio);
  return (
    <article className="card space-y-4" data-testid={testId} aria-label={c.title}>
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          {badge}
          <span className="chip border-accent/30 bg-accent-soft text-accent">{PLATFORM_LABELS[platform]}</span>
          <span className="chip">{c.persona}</span>
          <span className="chip">{c.angle}</span>
          <span className="chip">{c.format}</span>
          <span className="chip">{c.language}</span>
        </div>
        <h3 className="text-xl font-bold tracking-tight">{c.title}</h3>
        <div className="flex flex-wrap gap-2">
          {c.needs_real_person ? <span className="chip-amber">Needs real person</span> : <span className="chip-green">AI-safe footage</span>}
          {c.ai_label_needed ? <span className="chip-amber">Show AI label</span> : null}
        </div>
      </header>

      <div>
        <p className="text-xs font-bold tracking-wide text-ink-soft uppercase">Hook</p>
        <p className="prose-serif text-lg">{c.hook}</p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Frames</caption>
          <thead className="border-b border-line text-ink-soft">
            <tr>
              <th scope="col" className="py-1.5 pr-3 whitespace-nowrap">
                Slot
              </th>
              <th scope="col" className="py-1.5 pr-3">
                Visual
              </th>
              <th scope="col" className="py-1.5 pr-3">
                On-screen text
              </th>
              {hasAudio ? (
                <th scope="col" className="py-1.5">
                  Audio
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {c.frames.map((f, i) => (
              <tr key={i} className="border-b border-line align-top last:border-0">
                <td className="py-1.5 pr-3 font-semibold whitespace-nowrap">{f.slot}</td>
                <td className="py-1.5 pr-3">{f.visual}</td>
                <td className="py-1.5 pr-3 font-semibold">{f.onscreen}</td>
                {hasAudio ? <td className="py-1.5 text-ink-soft">{f.audio}</td> : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <dl className="grid gap-2 text-sm sm:grid-cols-[8rem_1fr]">
        {c.copy.headline ? (
          <>
            <dt className="font-semibold text-ink-soft">Headline</dt>
            <dd>
              {c.copy.headline} <span className="text-ink-soft">({c.copy.headline.length} chars)</span>
            </dd>
          </>
        ) : null}
        {c.copy.body ? (
          <>
            <dt className="font-semibold text-ink-soft">Primary text</dt>
            <dd className="prose-serif">{c.copy.body}</dd>
          </>
        ) : null}
        {c.copy.body_alt ? (
          <>
            <dt className="font-semibold text-ink-soft">Variant</dt>
            <dd className="prose-serif">{c.copy.body_alt}</dd>
          </>
        ) : null}
        {c.copy.cta ? (
          <>
            <dt className="font-semibold text-ink-soft">CTA</dt>
            <dd>{c.copy.cta}</dd>
          </>
        ) : null}
      </dl>

      <div className="rounded-lg bg-accent-soft/60 p-3 text-sm">
        <span className="font-bold">Why it fits {PLATFORM_LABELS[platform]}: </span>
        {c.why_it_fits}
      </div>

      <details className="text-sm">
        <summary className="cursor-pointer font-semibold">AI render prompt</summary>
        <p className="mt-2 rounded-lg bg-surface-2 p-3 font-mono text-xs whitespace-pre-wrap">{c.ai_prompt}</p>
      </details>

      <div className="grid gap-4 border-t border-line pt-4 sm:grid-cols-2">
        <div>
          <p className="mb-1 text-xs font-bold tracking-wide text-ink-soft uppercase">Claims used</p>
          {c.claims.length ? (
            <ul className="flex flex-wrap gap-1.5">
              {c.claims.map((cl, i) => (
                <li key={i} className={cl.tier === "green" ? "chip-green" : "chip-amber"}>
                  {cl.tier}: {cl.text}
                </li>
              ))}
            </ul>
          ) : (
            <p className="hint">None listed</p>
          )}
        </div>
        <div>
          <p className="mb-1 text-xs font-bold tracking-wide text-ink-soft uppercase">Scan</p>
          <ScanSummary result={scan} />
        </div>
      </div>

      {actions ? <div className="flex flex-wrap gap-2 border-t border-line pt-4">{actions}</div> : null}
    </article>
  );
}
