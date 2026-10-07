import type { ScanResult } from "./compliance";
import type { CreativeStatus, Platform } from "./types";

/** Section 9.6. Item numbers are stored in creatives.qa_checked. */
export const QA_ITEMS: { n: number; text: string; amazonOnly?: boolean }[] = [
  { n: 1, text: "Every claim is green, or approved amber, from the claims library." },
  { n: 2, text: "No disease, immunity, growth, brain, heart, weight or digestion claims." },
  { n: 3, text: "No line implies the viewer has a health condition or body issue." },
  { n: 4, text: "No before/after or transformation framing." },
  { n: 5, text: "No AI expert; no AI person describing a health result." },
  { n: 6, text: "AI label shown the whole time a synthetic person or realistic synthetic scene appears." },
  { n: 7, text: "Customer quotes are real, verbatim and permissioned." },
  { n: 8, text: "Product, pack, flavour and size match the live listing." },
  { n: 9, text: "Works with sound off; product visible by 3 seconds." },
  { n: 10, text: "No AI artefacts on hands, faces or pack text." },
  { n: 11, text: "Correct aspect ratio for the platform." },
  { n: 12, text: "Amazon only: no mention of Amazon, specific CTA, brand logo visible.", amazonOnly: true },
];

export function requiredQaItems(platform: Platform) {
  return QA_ITEMS.filter((i) => !i.amazonOnly || platform === "amazon");
}

/** Statuses that mean "cleared to run"; all of them need the approval gate. */
export const GATED_STATUSES: CreativeStatus[] = ["Approved", "In production", "Live", "Winner"];

export type GateResult = { ok: boolean; missing: string[] };

export function approvalGate(c: { platform: Platform; scanResult: ScanResult; qaChecked: number[] }): GateResult {
  const missing: string[] = [];
  const reds = c.scanResult.hits.filter((h) => h.severity === "red");
  if (reds.length) {
    missing.push(`Fix ${reds.length} red ${reds.length === 1 ? "flag" : "flags"}: ${reds.map((h) => `${h.label} (“${h.matches.join("”, “")}”)`).join("; ")}.`);
  }
  const unchecked = requiredQaItems(c.platform).filter((i) => !c.qaChecked.includes(i.n));
  if (unchecked.length) missing.push(`Tick QA ${unchecked.length === 1 ? "item" : "items"} ${unchecked.map((i) => i.n).join(", ")}.`);
  return { ok: missing.length === 0, missing };
}

export function canMoveTo(status: CreativeStatus, c: Parameters<typeof approvalGate>[0]): GateResult {
  if (!GATED_STATUSES.includes(status)) return { ok: true, missing: [] };
  return approvalGate(c);
}
