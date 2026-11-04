"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";

export type SetupStep = { label: string; done: boolean; href: string; why: string };

/** First-run guide: what to set up so images come out right. Shown until everything is done (or hidden). */
export function SetupChecklist({ steps }: { steps: SetupStep[] }) {
  // Remembered per browser; the server always renders it (no hydration mismatch).
  const stored = useSyncExternalStore(
    (cb) => {
      window.addEventListener("storage", cb);
      return () => window.removeEventListener("storage", cb);
    },
    () => {
      try {
        return localStorage.getItem("setup-hidden") === "1";
      } catch {
        return false;
      }
    },
    () => false,
  );
  const [hiddenNow, setHidden] = useState(false);
  const hidden = stored || hiddenNow;
  const left = steps.filter((s) => !s.done).length;
  if (!left || hidden) return null;
  return (
    <section className="mb-6 rounded-2xl border border-line bg-surface p-4" data-testid="setup-checklist" aria-label="Getting started">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-semibold">
          Getting started <span className="chip-amber ml-1">{left} to do</span>
        </p>
        <button
          type="button"
          className="text-xs text-ink-soft underline"
          onClick={() => {
            setHidden(true);
            try {
              localStorage.setItem("setup-hidden", "1");
            } catch {
              /* ignore */
            }
          }}
        >
          Hide
        </button>
      </div>
      <ol className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
        {steps.map((s, i) => (
          <li key={s.label} className={s.done ? "text-leaf" : ""}>
            {s.done ? "✓" : `${i + 1}.`}{" "}
            {s.done ? (
              s.label
            ) : (
              <Link href={s.href} className="font-semibold underline">
                {s.label}
              </Link>
            )}{" "}
            <span className="text-xs text-ink-soft">· {s.why}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
