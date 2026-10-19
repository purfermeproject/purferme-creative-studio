"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/auth";
import { scoreConcept } from "@/lib/concepts";
import { getProduct, getTerms } from "@/lib/data";
import { ConceptSchema } from "@/lib/schemas";
import { CREATIVE_STATUSES, DELIVERABLES, OBJECTIVES, PLATFORMS, type CreativeStatus, type Deliverable, type Objective } from "@/lib/types";
import { changeStatus, checkpoint, ConflictError, createCreative, listVersions, markClaimsReviewed, restoreVersion } from "@/lib/creative-store";

type Fail = { ok: false; message: string };
const fail = (e: unknown, fallback: string): Fail => ({ ok: false, message: e instanceof Error ? e.message : fallback });

const CreateInput = z.object({
  concept: ConceptSchema,
  platform: z.enum(PLATFORMS),
  productId: z.string().uuid(),
  creativeType: z.string().trim().min(1).max(150),
  placement: z.string().trim().max(100).default(""),
  objective: z.enum(OBJECTIVES.map((o) => o.id) as [Objective, ...Objective[]]).or(z.literal("")).default(""),
  deliverable: z.enum(DELIVERABLES.map((d) => d.id) as [Deliverable, ...Deliverable[]]).default("concept"),
  mock: z.boolean().default(false),
  note: z.string().max(200).default(""),
});

/** Opens a ready-made concept (e.g. a variation) as a new draft in the workspace. */
export async function createFromConcept(input: z.input<typeof CreateInput>): Promise<{ ok: true; id: string; revision: number } | Fail> {
  try {
    const { user } = await requireRole("edit");
    const v = CreateInput.parse(input);
    const product = await getProduct(v.productId);
    if (!product) return { ok: false, message: "That product no longer exists." };
    if (product.status !== "ready") return { ok: false, message: `${product.name} is on ${product.status}.` };
    const scored = scoreConcept(v.concept, v.platform, product.slug, await getTerms());
    const row = await createCreative({
      concept: v.concept,
      platform: scored.platform,
      product,
      creativeType: scored.platform === v.platform ? v.creativeType : v.concept.format,
      placement: scored.platform === v.platform ? v.placement : "",
      objective: v.objective,
      deliverable: v.deliverable,
      meta: { mock: v.mock, provider: v.mock ? "mock" : undefined, generatedAt: new Date().toISOString(), proposal: v.note ? { title: v.concept.title, big_idea: v.note } : undefined },
      user,
    });
    revalidatePath("/library");
    return { ok: true, id: row.id, revision: row.revision };
  } catch (e) {
    return fail(e, "Couldn't create the draft.");
  }
}

export async function getVersions(id: string) {
  try {
    await requireRole("view");
    return { ok: true as const, versions: await listVersions(id) };
  } catch (e) {
    return fail(e, "Couldn't load the history.");
  }
}

export async function checkpointVersion(id: string, note: string): Promise<{ ok: true } | Fail> {
  try {
    const { user } = await requireRole("edit");
    await checkpoint(id, user, note.trim().slice(0, 200) || "Saved version");
    return { ok: true };
  } catch (e) {
    return fail(e, "Couldn't save the version.");
  }
}

export async function restoreCreativeVersion(id: string, versionId: string, baseRevision: number) {
  try {
    const { user } = await requireRole("edit");
    const res = await restoreVersion({ id, versionId, baseRevision, user });
    revalidatePath("/library");
    return { ok: true as const, ...res };
  } catch (e) {
    if (e instanceof ConflictError) return { ok: false as const, message: e.message, conflict: true };
    return fail(e, "Couldn't restore that version.");
  }
}

export async function reviewClaims(id: string, baseRevision: number, reviewed: boolean): Promise<{ ok: true; by: string } | Fail> {
  try {
    const { user } = await requireRole("review");
    await markClaimsReviewed({ id, baseRevision, user, reviewed });
    revalidatePath("/library");
    return { ok: true, by: reviewed ? user : "" };
  } catch (e) {
    return fail(e, "Couldn't record the review.");
  }
}

export async function setWorkspaceStatus(id: string, status: CreativeStatus): Promise<{ ok: true } | (Fail & { missing?: string[] })> {
  try {
    const { user } = await requireRole("approve");
    if (!CREATIVE_STATUSES.includes(status)) return { ok: false, message: "Unknown status." };
    const gate = await changeStatus(id, status, user);
    revalidatePath("/library");
    return gate.ok ? { ok: true } : { ok: false, message: `Can't move to ${status} yet.`, missing: gate.missing };
  } catch (e) {
    return fail(e, "Couldn't change the status.");
  }
}
