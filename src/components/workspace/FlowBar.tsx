import type { CreativeStatus } from "@/lib/types";

/** The whole flow on one line, what each step does, and what is happening right now. */
export const FLOW_STEPS = [
  { label: "Brief", does: "You pick the product, goal and platform." },
  { label: "Ideas", does: "AI proposes 3 different directions; you pick one." },
  { label: "Ad", does: "AI writes the hook, copy and scenes; edits save automatically." },
  { label: "Images", does: "AI makes the photo; your real pack is placed on a brand panel, unchanged; the hook goes on top." },
  { label: "Check & approve", does: "Claims and platform rules are checked; a reviewer approves before it runs." },
] as const;

export function flowStep(s: { hasIdeas: boolean; hasCreative: boolean; hasImages: boolean; status?: CreativeStatus }): number {
  if (!s.hasCreative) return s.hasIdeas ? 1 : 0;
  if (!s.hasImages) return 3;
  return 4;
}

export function FlowBar({ step, now, done }: { step: number; now: string; done?: boolean }) {
  return (
    <section className="rounded-2xl border border-line bg-surface p-3" aria-label="Where you are" data-testid="flow">
      <ol className="grid grid-cols-5 gap-1 text-center text-xs sm:text-sm">
        {FLOW_STEPS.map((f, i) => (
          <li
            key={f.label}
            aria-current={i === step ? "step" : undefined}
            className={`rounded-lg px-1 py-1.5 font-semibold ${i === step ? "bg-purple text-accent-ink" : i < step || done ? "bg-gold-soft text-purple" : "text-ink-soft"}`}
            title={f.does}
          >
            {i < step || (done && i === step) ? "✓ " : `${i + 1}. `}
            {f.label}
          </li>
        ))}
      </ol>
      <p className="mt-2 text-sm" role="status" aria-live="polite" data-testid="flow-now">
        <span className="font-semibold">Now: </span>
        {now}
      </p>
    </section>
  );
}
