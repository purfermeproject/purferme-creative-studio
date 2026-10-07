"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/auth";
import { db, schema } from "@/db";
import { getBrand } from "@/lib/data";
import { verdictFor } from "@/lib/result-verdict";
import { PLATFORMS } from "@/lib/types";

const num = z.number().finite().nullable().optional();
const Metrics = z.object({
  name: z.string().max(300).optional(),
  targetCpa: num,
  spend: num,
  hookRate: num,
  ctr: num,
  cpa: num,
  frequency: num,
  targetAcos: num,
  acos: num,
  conversionRate: num,
  clicks: num,
});
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullable()
  .optional()
  .or(z.literal("").transform(() => null));

const ResultInput = z.object({
  platform: z.enum(PLATFORMS),
  creativeId: z.string().uuid().nullable().optional().or(z.literal("").transform(() => null)),
  periodStart: date,
  periodEnd: date,
  metrics: Metrics,
  notes: z.string().max(2000).optional(),
});
export type ResultInputT = z.input<typeof ResultInput>;

export async function saveResults(inputs: ResultInputT[]): Promise<{ ok: true; count: number } | { ok: false; message: string }> {
  try {
    await requireUser();
    if (inputs.length === 0) return { ok: false, message: "Nothing to save." };
    if (inputs.length > 1000) return { ok: false, message: "That's more than 1,000 rows. Split the file and upload it in parts." };
    const parsed = z.array(ResultInput).safeParse(inputs);
    if (!parsed.success) return { ok: false, message: `Some values aren't valid (${parsed.error.issues[0].path.join(".")}).` };
    const { verdictThresholds } = await getBrand();
    const rows = parsed.data.map((r) => {
      const m = r.metrics;
      const v = verdictFor(r.platform, { ...m, cpa: m.cpa ?? null } as never, verdictThresholds);
      return {
        platform: r.platform,
        creativeId: r.creativeId ?? null,
        periodStart: r.periodStart ?? null,
        periodEnd: r.periodEnd ?? null,
        metrics: m as Record<string, number | string | null>,
        verdict: v.verdict,
        notes: [r.notes, ...v.warnings].filter(Boolean).join("\n"),
      };
    });
    await db.insert(schema.results).values(rows);
    revalidatePath("/results");
    return { ok: true, count: rows.length };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Couldn't save the results." };
  }
}
