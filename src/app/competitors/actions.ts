"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/auth";
import { db, schema } from "@/db";

export async function deleteCompetitor(id: string): Promise<{ ok: boolean; message?: string }> {
  try {
    await requireRole("delete");
    const [row] = await db.delete(schema.competitorAds).where(eq(schema.competitorAds.id, id)).returning({ imageAssetId: schema.competitorAds.imageAssetId });
    if (row?.imageAssetId) await db.delete(schema.assets).where(eq(schema.assets.id, row.imageAssetId));
    revalidatePath("/competitors");
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Couldn't delete." };
  }
}
