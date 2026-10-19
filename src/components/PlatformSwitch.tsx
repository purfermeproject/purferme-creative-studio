"use client";

import { usePathname, useRouter } from "next/navigation";
import { useRef, useTransition, type KeyboardEvent } from "react";
import { PLATFORMS, type Platform } from "@/lib/types";

const TITLES: Record<Platform, string> = { meta: "Instagram", amazon: "Amazon", flipkart: "Flipkart" };
const SUBTITLES: Record<Platform, string> = {
  meta: "+ Facebook · Meta ads",
  amazon: "Search intent",
  flipkart: "Listing-led",
};

/** Persist the choice and retint immediately, before the server re-render lands. */
export function applyPlatform(p: Platform) {
  document.cookie = `platform=${p}; path=/; max-age=31536000; samesite=lax`;
  document.documentElement.setAttribute("data-platform", p);
}

export const PLATFORM_TITLES = TITLES;
export const PLATFORM_SUBTITLES = SUBTITLES;

export function PlatformSwitch({ value }: { value: Platform }) {
  const router = useRouter();
  const pathname = usePathname();
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

  // The Create workspace has its own platform step in the brief.
  if (pathname === "/create") return null;

  return (
    <div
      role="radiogroup"
      aria-label="Platform"
      onKeyDown={onKeyDown}
      className="grid grid-cols-3 gap-0.5 rounded-xl border border-line bg-surface-2 p-1"
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
            className={`flex min-w-0 flex-col items-center rounded-lg px-2.5 py-1 transition-colors sm:min-w-24 ${
              selected ? "bg-accent text-accent-ink shadow-sm" : "text-ink-soft hover:bg-surface hover:text-ink"
            }`}
          >
            <span className="text-sm leading-tight font-semibold">{TITLES[p]}</span>
            <span className={`hidden text-[10px] leading-tight sm:block ${selected ? "opacity-90" : ""}`}>{SUBTITLES[p]}</span>
          </button>
        );
      })}
    </div>
  );
}
