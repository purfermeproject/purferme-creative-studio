"use client";

import { useOptimistic, useState, useTransition } from "react";
import { ConceptCard } from "@/components/ConceptCard";
import type { Creative } from "@/db/schema";
import { conceptToText } from "@/lib/concepts";
import { approvalGate, requiredQaItems } from "@/lib/qa";
import type { Concept } from "@/lib/schemas";
import { CREATIVE_STATUSES, PLATFORM_LABELS, type CreativeStatus } from "@/lib/types";
import { deleteCreative, rescan, setQa, setQaAll, setStatus } from "./actions";

const STATUS_CHIP: Record<CreativeStatus, string> = {
  Draft: "chip",
  Approved: "chip-green",
  "In production": "chip-green",
  Live: "chip-green",
  Winner: "chip-green",
  Killed: "chip-red",
};

function toConcept(c: Creative): Concept {
  return {
    title: c.title,
    persona: c.persona,
    angle: c.angle,
    format: c.format,
    language: c.language,
    hook: c.hook,
    frames: c.frames,
    copy: c.copy,
    ai_prompt: c.aiPrompt,
    needs_real_person: c.needsRealPerson,
    ai_label_needed: c.aiLabelNeeded,
    claims: c.claims,
    why_it_fits: c.whyItFits,
  };
}

export function LibraryItem({ creative: c, productName, defaultOpen }: { creative: Creative; productName: string; defaultOpen: boolean }) {
  const [pending, start] = useTransition();
  const [qa, setQaOptimistic] = useOptimistic(c.qaChecked, (_cur: number[], next: number[]) => next);
  const [message, setMessage] = useState<{ text: string; missing?: string[]; ok?: boolean } | null>(null);
  const [copied, setCopied] = useState(false);

  const required = requiredQaItems(c.platform);
  const done = required.filter((i) => qa.includes(i.n)).length;
  const gate = approvalGate({ platform: c.platform, scanResult: c.scanResult, qaChecked: qa });
  const redHits = c.scanResult.hits.filter((h) => h.severity === "red");
  const reds = redHits.length;
  const allTicked = done === required.length;
  const ambers = c.scanResult.hits.filter((h) => h.severity === "amber").length;

  function changeStatus(status: CreativeStatus) {
    setMessage(null);
    start(async () => {
      const res = await setStatus(c.id, status);
      setMessage(res.ok ? { text: `Moved to ${status}.`, ok: true } : { text: res.message, missing: res.missing });
    });
  }

  function toggle(n: number, on: boolean) {
    start(async () => {
      setQaOptimistic(on ? [...new Set([...qa, n])] : qa.filter((x) => x !== n));
      const res = await setQa(c.id, n, on);
      if (!res.ok) setMessage({ text: res.message });
    });
  }

  function toggleAll(on: boolean) {
    start(async () => {
      setQaOptimistic(on ? required.map((i) => i.n) : []);
      const res = await setQaAll(c.id, on);
      if (!res.ok) setMessage({ text: res.message });
    });
  }

  return (
    <details open={defaultOpen} className="card group p-0" data-testid={`creative-${c.id}`}>
      <summary className="flex cursor-pointer list-none flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="truncate text-lg font-bold">{c.title}</p>
          <p className="hint truncate">
            {PLATFORM_LABELS[c.platform]} · {productName} · {c.creativeType} · {c.language}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {reds ? <span className="chip-red">{reds} to fix</span> : null}
          {ambers ? <span className="chip-amber">{ambers} to check</span> : null}
          <span className={STATUS_CHIP[c.status]} data-testid="status-chip">
            {c.status}
          </span>
        </div>
      </summary>

      <div className="grid gap-4 border-t border-line p-4 lg:grid-cols-[1fr_22rem]">
        <ConceptCard concept={toConcept(c)} platform={c.platform} scan={c.scanResult} />

        <aside className="space-y-4">
          <div className="card space-y-3 bg-surface-2" data-testid="approve-panel">
            {c.status === "Draft" ? (
              <>
                <p className="font-bold">Ready to approve?</p>
                {redHits.length ? (
                  <div className="rounded-lg border border-red/30 bg-red-bg p-3 text-sm text-red" data-testid="gate-missing">
                    <p className="font-semibold">Fix first: these words aren&apos;t allowed</p>
                    <ul className="mt-1 list-disc pl-5">
                      {redHits.map((h) => (
                        <li key={h.label}>
                          “{h.matches.join("”, “")}” ({h.label})
                        </li>
                      ))}
                    </ul>
                    <p className="mt-1">Make a new version in Create ads (use Regenerate), then save that one instead.</p>
                  </div>
                ) : null}
                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" className="mt-1 size-4 accent-(--accent)" checked={allTicked} onChange={(e) => toggleAll(e.target.checked)} />
                  <span>
                    I&apos;ve checked this ad against the {required.length}-point pre-launch list
                    {!allTicked && done > 0 ? ` (${done} of ${required.length} ticked)` : ""}
                  </span>
                </label>
                <button className="btn-primary w-full" disabled={pending || !gate.ok} onClick={() => changeStatus("Approved")}>
                  Approve
                </button>
                {!gate.ok && !redHits.length ? <p className="hint">Tick the pre-launch box to approve.</p> : null}
              </>
            ) : (
              <p className="font-bold">
                Status: <span className={STATUS_CHIP[c.status]}>{c.status}</span>
              </p>
            )}
            {message ? (
              <div role={message.ok ? "status" : "alert"} className={`text-sm ${message.ok ? "text-leaf" : "text-red"}`}>
                <p className="font-semibold">{message.text}</p>
                {message.missing ? (
                  <ul className="mt-1 list-disc pl-5">
                    {message.missing.map((m) => (
                      <li key={m}>{m}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
            <div className="flex items-center gap-2 border-t border-line pt-3">
              <label className="text-sm text-ink-soft" htmlFor={`status-${c.id}`}>
                Change status
              </label>
              <select id={`status-${c.id}`} className="input py-1 text-sm" value={c.status} disabled={pending} onChange={(e) => changeStatus(e.target.value as CreativeStatus)}>
                {CREATIVE_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <details className="card bg-surface-2">
            <summary className="cursor-pointer text-sm font-semibold">
              Pre-launch list <span className="font-normal text-ink-soft">({done}/{required.length} ticked)</span>
            </summary>
            <fieldset className="mt-3 space-y-2">
              <legend className="sr-only">Pre-launch checklist</legend>
              {required.map((item) => (
                <label key={item.n} className="flex items-start gap-2 text-sm">
                  <input type="checkbox" className="mt-1 size-4 accent-(--accent)" checked={qa.includes(item.n)} onChange={(e) => toggle(item.n, e.target.checked)} />
                  <span>
                    <span className="font-semibold">{item.n}.</span> {item.text}
                  </span>
                </label>
              ))}
            </fieldset>
          </details>

          <div className="flex flex-wrap gap-2">
            <button
              className="btn-secondary px-3 py-1.5 text-sm"
              onClick={async () => {
                await navigator.clipboard.writeText(conceptToText({ ...toConcept(c), platform: c.platform, scan: c.scanResult }));
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              {copied ? "Copied" : "Copy as text"}
            </button>
            <button className="btn-secondary px-3 py-1.5 text-sm" disabled={pending} onClick={() => start(async () => void (await rescan(c.id)))}>
              Re-check words
            </button>
            <button
              className="btn-danger px-3 py-1.5 text-sm"
              disabled={pending}
              onClick={() => {
                if (window.confirm(`Delete “${c.title}”? Linked results keep their numbers.`)) start(async () => void (await deleteCreative(c.id)));
              }}
            >
              Delete
            </button>
          </div>
          <p className="hint text-xs">
            Saved by {c.createdBy} on {new Date(c.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
          </p>
        </aside>
      </div>
    </details>
  );
}
