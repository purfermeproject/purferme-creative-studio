"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/auth";
import { db, schema } from "@/db";
import { conceptText, scan } from "@/lib/compliance";
import { getTerms } from "@/lib/data";
import { canMoveTo, QA_ITEMS } from "@/lib/qa";
import { CREATIVE_STATUSES, type CreativeStatus } from "@/lib/types";

type Res = { ok: true } | { ok: false; message: string; missing?: string[] };

async function load(id: string) {
  const [row] = await db
    .select({ c: schema.creatives, slug: schema.products.slug })
    .from(schema.creatives)
    .leftJoin(schema.products, eq(schema.creatives.productId, schema.products.id))
    .where(eq(schema.creatives.id, id));
  return row ?? null;
}

/** Re-scan with the current compliance terms so the gate never uses a stale scan. */
async function rescanRow(row: NonNullable<Awaited<ReturnType<typeof load>>>) {
  const c = row.c;
  const text = conceptText({ title: c.title, hook: c.hook, frames: c.frames, copy: c.copy, claims: c.claims, ai_prompt: c.aiPrompt });
  const result = scan(text, c.platform, row.slug, await getTerms());
  await db.update(schema.creatives).set({ scanResult: result }).where(eq(schema.creatives.id, c.id));
  return result;
}

export async function setStatus(id: string, status: CreativeStatus): Promise<Res> {
  try {
    await requireUser();
    if (!CREATIVE_STATUSES.includes(status)) return { ok: false, message: "Unknown status." };
    const row = await load(id);
    if (!row) return { ok: false, message: "That creative no longer exists." };
    const scanResult = await rescanRow(row);
    const gate = canMoveTo(status, { platform: row.c.platform, scanResult, qaChecked: row.c.qaChecked });
    if (!gate.ok) {
      revalidatePath("/library");
      return { ok: false, message: `Can't move to ${status} yet.`, missing: gate.missing };
    }
    await db.update(schema.creatives).set({ status, updatedAt: new Date() }).where(eq(schema.creatives.id, id));
    revalidatePath("/library");
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Couldn't change the status." };
  }
}

export async function setQa(id: string, item: number, checked: boolean): Promise<Res> {
  try {
    await requireUser();
    if (!QA_ITEMS.some((i) => i.n === item)) return { ok: false, message: "Unknown QA item." };
    const row = await load(id);
    if (!row) return { ok: false, message: "That creative no longer exists." };
    const set = new Set(row.c.qaChecked);
    if (checked) set.add(item);
    else set.delete(item);
    const qaChecked = [...set].sort((a, b) => a - b);
    // Unticking an item on an approved creative sends it back to Draft.
    const demote = !checked && !["Draft", "Killed"].includes(row.c.status);
    await db
      .update(schema.creatives)
      .set({ qaChecked, ...(demote ? { status: "Draft" as const } : {}), updatedAt: new Date() })
      .where(eq(schema.creatives.id, id));
    revalidatePath("/library");
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Couldn't save the checklist." };
  }
}

export async function rescan(id: string): Promise<Res> {
  try {
    await requireUser();
    const row = await load(id);
    if (!row) return { ok: false, message: "That creative no longer exists." };
    await rescanRow(row);
    revalidatePath("/library");
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Couldn't re-scan." };
  }
}

export async function deleteCreative(id: string): Promise<Res> {
  try {
    await requireUser();
    await db.delete(schema.creatives).where(eq(schema.creatives.id, id));
    revalidatePath("/library");
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Couldn't delete." };
  }
}
