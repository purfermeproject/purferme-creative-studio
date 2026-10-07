"use client";

import { useRouter } from "next/navigation";
import { useRef, useTransition, type KeyboardEvent } from "react";
import { PLATFORMS, PLATFORM_LABELS, type Platform } from "@/lib/types";

const SUBTITLES: Record<Platform, string> = {
  meta: "Discovery feed",
  amazon: "Search intent",
  flipkart: "Listing-led",
};

/** Persist the choice and retint immediately, before the server re-render lands. */
function applyPlatform(p: Platform) {
  document.cookie = `platform=${p}; path=/; max-age=31536000; samesite=lax`;
  document.documentElement.setAttribute("data-platform", p);
}

export function PlatformSwitch({ value }: { value: Platform }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  function choose(p: Platform) {
    applyPlatform(p);
    startTransition(() => router.refresh());
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const i = PLATFORMS.indexOf(value);
    let next = -1;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (i + 1) % PLATFORMS.length;
    if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (i + PLATFORMS.length - 1) % PLATFORMS.length;
    if (next >= 0) {
      e.preventDefault();
      choose(PLATFORMS[next]);
      refs.current[next]?.focus();
    }
  }

  return (
    <div
      role="radiogroup"
      aria-label="Platform"
      onKeyDown={onKeyDown}
      className="grid w-full grid-cols-3 gap-1 rounded-2xl border border-line bg-surface-2 p-1.5 sm:w-auto"
      aria-busy={pending}
      data-testid="platform-switch"
    >
      {PLATFORMS.map((p, i) => {
        const selected = p === value;
        return (
          <button
            key={p}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => choose(p)}
            className={`flex min-w-0 flex-col items-center rounded-xl px-3 py-2 transition-colors sm:min-w-32 sm:px-5 ${
              selected ? "bg-accent text-accent-ink shadow-sm" : "text-ink-soft hover:bg-surface hover:text-ink"
            }`}
          >
            <span className="text-lg leading-tight font-bold tracking-tight sm:text-xl">{PLATFORM_LABELS[p]}</span>
            <span className={`text-[11px] leading-tight sm:text-xs ${selected ? "opacity-90" : ""}`}>{SUBTITLES[p]}</span>
          </button>
        );
      })}
    </div>
  );
}
