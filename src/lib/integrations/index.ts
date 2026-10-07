/**
 * Extension points for integrations planned for later (not built yet).
 *
 * - Results importers: replace the CSV upload on /results with API pulls
 *   (Meta Marketing API insights, Amazon Ads API reports). An importer returns
 *   rows in the same shape the CSV mapping produces, so verdict logic, saving
 *   (`saveResults`) and the weekly brief work unchanged.
 * - Video renderer: send a creative's `ai_prompt` plus the product's pack image
 *   to an AI video API (e.g. Higgsfield). Check the provider's current API docs
 *   before building, and keep the "AI-generated" label rules from the platform
 *   rules (Meta: continuous label; Amazon: no AI people).
 */
import type { MarketplaceInput, MetaInput } from "@/lib/verdicts";
import type { Platform } from "@/lib/types";

export type ImportedRow = {
  name: string;
  platform: Platform;
  periodStart: string | null;
  periodEnd: string | null;
  metrics: Partial<MetaInput & MarketplaceInput>;
  /** Our creative id, if the ad can be matched (e.g. via a naming convention or UTM). */
  creativeId?: string | null;
};

export interface ResultsImporter {
  platform: Platform;
  /** Pull rows for a date range. Credentials come from server-side env vars only. */
  fetchRows(range: { start: string; end: string }): Promise<ImportedRow[]>;
}

export interface VideoRenderer {
  /** Start a render job; returns a provider job id. */
  start(input: { prompt: string; packImageUrl: string | null; aspectRatio: "9:16" | "16:9" | "4:5" | "1:1"; seconds: number }): Promise<string>;
  /** Poll a job; `url` is set when done. */
  status(jobId: string): Promise<{ state: "queued" | "running" | "done" | "failed"; url?: string; error?: string }>;
}
