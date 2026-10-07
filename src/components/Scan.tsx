import type { ScanResult, Segment } from "@/lib/compliance";

export function Highlighted({ segments }: { segments: Segment[] }) {
  return (
    <>
      {segments.map((s, i) =>
        s.severity ? (
          <mark
            key={i}
            title={`${s.severity === "red" ? "Red: fix before launch" : "Amber: needs evidence"} · ${s.labels.join(", ")}`}
            className={`rounded px-0.5 ${
              s.severity === "red" ? "bg-red-bg text-red underline decoration-red decoration-wavy" : "bg-amber-bg text-amber underline decoration-amber decoration-dotted"
            }`}
          >
            {s.text}
          </mark>
        ) : (
          <span key={i}>{s.text}</span>
        ),
      )}
    </>
  );
}

export function ScanSummary({ result, compact = false }: { result: ScanResult; compact?: boolean }) {
  const red = result.hits.filter((h) => h.severity === "red");
  const amber = result.hits.filter((h) => h.severity === "amber");
  if (result.hits.length === 0) {
    return (
      <p className="chip-green" data-testid="scan-clean">
        No flagged terms
      </p>
    );
  }
  return (
    <div className="space-y-2" data-testid="scan-hits">
      {red.length > 0 ? (
        <div>
          <p className="text-sm font-bold text-red">
            {red.length} red {red.length === 1 ? "flag" : "flags"}: fix before launch
          </p>
          {!compact ? (
            <ul className="mt-1 flex flex-wrap gap-1.5">
              {red.map((h) => (
                <li key={h.label} className="chip-red">
                  {h.label}: “{h.matches.join("”, “")}”
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      {amber.length > 0 ? (
        <div>
          <p className="text-sm font-bold text-amber">
            {amber.length} amber {amber.length === 1 ? "flag" : "flags"}: needs evidence
          </p>
          {!compact ? (
            <ul className="mt-1 flex flex-wrap gap-1.5">
              {amber.map((h) => (
                <li key={h.label} className="chip-amber">
                  {h.label}: “{h.matches.join("”, “")}”
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
