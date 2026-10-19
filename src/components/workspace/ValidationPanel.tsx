"use client";

import { approvalGate, requiredQaItems } from "@/lib/qa";
import { can } from "@/lib/roles";
import { CREATIVE_STATUSES, type CreativeStatus, type Platform, type Role } from "@/lib/types";
import type { ClaimStatus, Issue, Validation } from "@/lib/validation";

const CLAIM_CHIP: Record<ClaimStatus, [string, string]> = {
  approved: ["chip-green", "Approved claim"],
  "needs-evidence": ["chip-amber", "Needs evidence"],
  unverified: ["chip-amber", "Not in library"],
  restricted: ["chip-red", "Never use"],
};

const STATUS_CHIP: Record<CreativeStatus, string> = {
  Draft: "chip",
  Approved: "chip-green",
  "In production": "chip-green",
  Live: "chip-green",
  Winner: "chip-green",
  Killed: "chip-red",
};

function IssueList({ issues, tone, testId }: { issues: Issue[]; tone: "red" | "amber" | "soft"; testId: string }) {
  if (!issues.length) return null;
  const cls = tone === "red" ? "border-red/30 bg-red-bg text-red" : tone === "amber" ? "border-amber/30 bg-amber-bg text-amber" : "border-line bg-surface-2 text-ink";
  return (
    <ul className={`space-y-2 rounded-xl border p-3 text-sm ${cls}`} data-testid={testId}>
      {issues.map((i) => (
        <li key={i.id}>
          <p className="font-semibold">{i.title}</p>
          <p className={tone === "soft" ? "text-ink-soft" : "opacity-90"}>{i.detail}</p>
        </li>
      ))}
    </ul>
  );
}

export function ValidationPanel({
  validation: v,
  platform,
  status,
  claimsReviewedBy,
  approvedBy,
  qaChecked,
  role,
  busy,
  dirty,
  message,
  onReview,
  onStatus,
  onQa,
  onQaAll,
  onEdit,
}: {
  validation: Validation;
  platform: Platform;
  status: CreativeStatus;
  claimsReviewedBy: string;
  approvedBy: string;
  qaChecked: number[];
  role: Role;
  busy: boolean;
  dirty: boolean;
  message: { text: string; ok?: boolean; missing?: string[] } | null;
  onReview: (reviewed: boolean) => void;
  onStatus: (s: CreativeStatus) => void;
  onQa: (n: number, on: boolean) => void;
  onQaAll: (on: boolean) => void;
  onEdit: () => void;
}) {
  const block = v.issues.filter((i) => i.level === "block");
  const review = v.issues.filter((i) => i.level === "review");
  const brand = v.issues.filter((i) => i.level === "brand");
  const info = v.issues.filter((i) => i.level === "info");
  const required = requiredQaItems(platform);
  const done = required.filter((i) => qaChecked.includes(i.n)).length;
  const allTicked = done === required.length;
  const gate = approvalGate({
    platform,
    scanResult: v.scan,
    qaChecked,
    otherBlocking: block.filter((i) => !i.id.startsWith("scan:")).map((i) => i.detail),
    review: { needed: v.needsHumanReview, reviewedBy: claimsReviewedBy },
  });
  const canApprove = can(role, "approve");
  const canReview = can(role, "review");
  const canEdit = can(role, "edit");
  const draft = status === "Draft";

  return (
    <div className="space-y-4" data-testid="validation-panel">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-surface-2 p-3">
        <div>
          <p className="eyebrow">Status</p>
          <p className="mt-0.5 flex items-center gap-2">
            <span className={STATUS_CHIP[status]} data-testid="status-chip">
              {status}
            </span>
            {approvedBy && !draft ? <span className="text-xs text-ink-soft">by {approvedBy}</span> : null}
          </p>
        </div>
        <div className="text-right text-sm">
          {block.length ? (
            <p className="font-semibold text-red">{block.length} to fix</p>
          ) : review.length ? (
            <p className="font-semibold text-amber">{claimsReviewedBy ? "Claims signed off" : `${review.length} to review`}</p>
          ) : (
            <p className="font-semibold text-leaf" data-testid="checks-clear">
              Claims clear
            </p>
          )}
        </div>
      </div>

      {block.length ? (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-red">Fix before it can run</p>
          <IssueList issues={block} tone="red" testId="issues-block" />
          {canEdit ? (
            <button type="button" className="btn-secondary w-full text-sm" onClick={onEdit}>
              Edit the wording
            </button>
          ) : null}
        </div>
      ) : null}

      {review.length ? (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-amber">Needs a person to check</p>
          <IssueList issues={review} tone="amber" testId="issues-review" />
          {claimsReviewedBy ? (
            <p className="flex items-center justify-between gap-2 text-sm text-leaf" data-testid="claims-reviewed">
              <span>✓ Signed off by {claimsReviewedBy}</span>
              {canReview ? (
                <button type="button" className="text-xs font-semibold text-ink-soft underline" onClick={() => onReview(false)} disabled={busy}>
                  Undo
                </button>
              ) : null}
            </p>
          ) : canReview ? (
            <button type="button" className="btn-secondary w-full text-sm" onClick={() => onReview(true)} disabled={busy || dirty || block.length > 0}>
              I&apos;ve checked these claims and the evidence
            </button>
          ) : (
            <p className="hint">An approver needs to confirm these claims.</p>
          )}
          {dirty && !claimsReviewedBy && canReview ? <p className="hint text-xs">Waiting for your latest edit to save…</p> : null}
        </div>
      ) : null}

      {v.claims.length ? (
        <div>
          <p className="eyebrow mb-2">Claims in this ad</p>
          <ul className="space-y-1.5 text-sm" data-testid="claims-list">
            {v.claims.map((c, i) => (
              <li key={i} className="flex items-start justify-between gap-2">
                <span>{c.text}</span>
                <span className={`${CLAIM_CHIP[c.status][0]} shrink-0`}>{CLAIM_CHIP[c.status][1]}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {brand.length || info.length ? (
        <details className="rounded-xl border border-line" open={brand.length > 0}>
          <summary className="cursor-pointer px-3 py-2 text-sm font-semibold">
            Brand and platform notes ({brand.length + info.length})
          </summary>
          <div className="space-y-2 border-t border-line p-3">
            <IssueList issues={brand} tone="soft" testId="issues-brand" />
            <IssueList issues={info} tone="soft" testId="issues-info" />
          </div>
        </details>
      ) : null}

      <div className="space-y-3 rounded-xl border border-line p-3" data-testid="approve-panel">
        <p className="font-semibold">Approval</p>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1 size-4 accent-(--purple)" checked={allTicked} disabled={!canEdit || busy} onChange={(e) => onQaAll(e.target.checked)} />
          <span>
            I&apos;ve checked this ad against the {required.length}-point pre-launch list
            {!allTicked && done > 0 ? ` (${done} of ${required.length} ticked)` : ""}
          </span>
        </label>
        <details className="text-sm">
          <summary className="cursor-pointer text-ink-soft">See the list</summary>
          <fieldset className="mt-2 space-y-1.5">
            <legend className="sr-only">Pre-launch checklist</legend>
            {required.map((item) => (
              <label key={item.n} className="flex items-start gap-2">
                <input type="checkbox" className="mt-1 size-4 accent-(--purple)" checked={qaChecked.includes(item.n)} disabled={!canEdit || busy} onChange={(e) => onQa(item.n, e.target.checked)} />
                <span>
                  <span className="font-semibold">{item.n}.</span> {item.text}
                </span>
              </label>
            ))}
          </fieldset>
        </details>
        {draft ? (
          <>
            <button type="button" className="btn-primary w-full" disabled={busy || dirty || !gate.ok || !canApprove} onClick={() => onStatus("Approved")}>
              Approve
            </button>
            {!canApprove ? (
              <p className="hint">Only approvers and admins can approve.</p>
            ) : !gate.ok ? (
              <ul className="hint list-disc pl-5" data-testid="gate-missing">
                {gate.missing.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            ) : null}
          </>
        ) : null}
        {canApprove ? (
          <div className="flex items-center gap-2 border-t border-line pt-3">
            <label className="text-sm text-ink-soft" htmlFor="ws-status">
              Change status
            </label>
            <select id="ws-status" className="input py-1 text-sm" value={status} disabled={busy} onChange={(e) => onStatus(e.target.value as CreativeStatus)}>
              {CREATIVE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
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
    </div>
  );
}
