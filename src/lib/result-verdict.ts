import type { Platform } from "./types";
import { marketplaceVerdict, metaVerdict, type MarketplaceInput, type MetaInput, type VerdictThresholds } from "./verdicts";

export type ResultMetrics = Partial<MetaInput & MarketplaceInput> & { name?: string };

/** Recomputes the verdict from stored metrics, so the server never trusts a client verdict. */
export function verdictFor(platform: Platform, m: ResultMetrics, t: VerdictThresholds) {
  if (platform === "meta") {
    return metaVerdict(
      { targetCpa: m.targetCpa ?? 0, spend: m.spend ?? 0, hookRate: m.hookRate ?? 0, ctr: m.ctr ?? 0, cpa: m.cpa ?? null, frequency: m.frequency ?? 0 },
      t.meta,
    );
  }
  return marketplaceVerdict(
    { targetAcos: m.targetAcos ?? 0, acos: m.acos ?? 0, ctr: m.ctr ?? 0, conversionRate: m.conversionRate ?? 0, clicks: m.clicks ?? 0 },
    t.marketplace,
  );
}
