"use client";

import { useOptimistic, useState, useTransition } from "react";
import { ConceptCard } from "@/components/ConceptCard";
import type { Creative } from "@/db/schema";
import { conceptToText } from "@/lib/concepts";
import { approvalGate, requiredQaItems } from "@/lib/qa";
import type { Concept } from "@/lib/schemas";
import { CREATIVE_STATUSES, PLATFORM_LABELS, type CreativeStatus } from "@/lib/types";
import { deleteCreative, rescan, setQa, setStatus } from "./actions";

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
  const [qa, setQaOptimistic] = useOptimistic(c.qaChecked, (cur: number[], [n, on]: [number, boolean]) =>
    on ? [...new Set([...cur, n])] : cur.filter((x) => x !== n),
  );
  const [message, setMessage] = useState<{ text: string; missing?: string[]; ok?: boolean } | null>(null);
  const [copied, setCopied] = useState(false);

  const required = requiredQaItems(c.platform);
  const done = required.filter((i) => qa.includes(i.n)).length;
  const gate = approvalGate({ platform: c.platform, scanResult: c.scanResult, qaChecked: qa });
  const reds = c.scanResult.hits.filter((h) => h.severity === "red").length;
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
      setQaOptimistic([n, on]);
      const res = await setQa(c.id, n, on);
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
          {reds ? <span className="chip-red">{reds} red</span> : null}
          {ambers ? <span className="chip-amber">{ambers} amber</span> : null}
          <span className="chip">
            QA {done}/{required.length}
          </span>
          <span className={STATUS_CHIP[c.status]} data-testid="status-chip">
            {c.status}
          </span>
        </div>
      </summary>

      <div className="grid gap-4 border-t border-line p-4 lg:grid-cols-[1fr_22rem]">
        <ConceptCard concept={toConcept(c)} platform={c.platform} scan={c.scanResult} />

        <aside className="space-y-4">
          <div className="card space-y-3 bg-surface-2">
            <label className="label" htmlFor={`status-${c.id}`}>
              Status
            </label>
            <select id={`status-${c.id}`} className="input" value={c.status} disabled={pending} onChange={(e) => changeStatus(e.target.value as CreativeStatus)}>
              {CREATIVE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            {!gate.ok && c.status !== "Killed" && !message?.missing ? (
              <div className="text-sm text-ink-soft" data-testid="gate-missing">
                <p className="font-semibold text-ink">Before it can be approved:</p>
                <ul className="mt-1 list-disc pl-5">
                  {gate.missing.map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                </ul>
              </div>
            ) : null}
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
          </div>

          <fieldset className="card space-y-2 bg-surface-2">
            <legend className="sr-only">QA checklist</legend>
            <p className="font-bold">
              QA checklist <span className="font-normal text-ink-soft">({done}/{required.length})</span>
            </p>
            {required.map((item) => (
              <label key={item.n} className="flex items-start gap-2 text-sm">
                <input type="checkbox" className="mt-1 size-4 accent-(--accent)" checked={qa.includes(item.n)} onChange={(e) => toggle(item.n, e.target.checked)} />
                <span>
                  <span className="font-semibold">{item.n}.</span> {item.text}
                </span>
              </label>
            ))}
          </fieldset>

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
              Re-scan with current terms
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
