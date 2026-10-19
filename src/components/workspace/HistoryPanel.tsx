"use client";

import { useEffect, useState } from "react";
import type { CreativeSnapshot } from "@/db/schema";
import { checkpointVersion, getVersions } from "@/app/create/actions";
import { changedFields } from "@/lib/versions";

type Version = { id: string; revision: number; source: string; note: string; createdBy: string; createdAt: Date; snapshot: CreativeSnapshot };

const SOURCE: Record<string, string> = {
  generated: "Generated",
  autosave: "Edited",
  manual: "Saved version",
  restore: "Restored",
  regenerated: "Re-developed",
};

/** Version history with one-click restore. Restoring creates a new version, so nothing is lost. */
export function HistoryPanel({
  creativeId,
  current,
  revision,
  canEdit,
  onRestore,
  refreshKey,
}: {
  creativeId: string;
  current: CreativeSnapshot;
  revision: number;
  canEdit: boolean;
  onRestore: (versionId: string) => Promise<void>;
  refreshKey: number;
}) {
  const [versions, setVersions] = useState<Version[] | null>(null);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState("");
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let live = true;
    getVersions(creativeId).then((res) => {
      if (!live) return;
      if (res.ok) {
        setVersions(res.versions as Version[]);
        setError("");
      } else setError(res.message);
    });
    return () => {
      live = false;
    };
  }, [creativeId, revision, refreshKey, tick]);

  async function save() {
    setBusy("save");
    const res = await checkpointVersion(creativeId, note);
    setBusy("");
    if (!res.ok) setError(res.message);
    else {
      setNote("");
      setTick((t) => t + 1);
    }
  }

  return (
    <div className="space-y-4" data-testid="history-panel">
      {canEdit ? (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <label htmlFor="version-note" className="sr-only">
            Version note
          </label>
          <input id="version-note" className="input py-1.5 text-sm" placeholder="Name this version (optional)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} />
          <button type="submit" className="btn-secondary shrink-0 px-3 py-1.5 text-sm" disabled={busy === "save"}>
            Save version
          </button>
        </form>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-red">
          {error}
        </p>
      ) : null}
      {versions === null ? (
        <div className="space-y-2" aria-label="Loading history">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton h-12" />
          ))}
        </div>
      ) : versions.length === 0 ? (
        <p className="hint">No history yet. Every edit is saved automatically and appears here.</p>
      ) : (
        <ol className="space-y-2">
          {versions.map((v, i) => {
            const isCurrent = i === 0 && changedFields(v.snapshot, current).length === 0;
            const diff = changedFields(v.snapshot, current);
            return (
              <li key={v.id} className={`rounded-xl border p-3 text-sm ${isCurrent ? "border-purple/40 bg-accent-soft" : "border-line bg-surface"}`} data-testid="version-row">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold">
                      {SOURCE[v.source] ?? v.source}
                      {v.note ? <span className="font-normal text-ink-soft"> · {v.note}</span> : null}
                    </p>
                    <p className="text-xs text-ink-soft">
                      {new Date(v.createdAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} · {v.createdBy || "unknown"}
                    </p>
                    <p className="mt-1 truncate text-xs text-ink-soft" title={v.snapshot.hook}>
                      “{v.snapshot.hook}”
                    </p>
                  </div>
                  {isCurrent ? (
                    <span className="chip shrink-0">Current</span>
                  ) : canEdit ? (
                    <button
                      type="button"
                      className="btn-secondary shrink-0 px-2.5 py-1 text-xs"
                      disabled={Boolean(busy)}
                      title={diff.length ? `Differs in: ${diff.join(", ")}` : undefined}
                      onClick={async () => {
                        setBusy(v.id);
                        await onRestore(v.id);
                        setBusy("");
                      }}
                    >
                      {busy === v.id ? "Restoring…" : "Restore"}
                    </button>
                  ) : null}
                </div>
                {!isCurrent && diff.length ? <p className="mt-1 text-xs text-ink-soft">Differs from now in: {diff.join(", ")}</p> : null}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
