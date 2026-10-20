import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Creative, CreativeSnapshot, GenerationMeta, Product } from "@/db/schema";
import { getBrand, getTerms } from "./data";
import { phraseList } from "./prompts";
import { approvalGate, GATED_STATUSES, type GateResult } from "./qa";
import type { Concept } from "./schemas";
import type { CreativeStatus, Deliverable, Objective, Platform } from "./types";
import { validateCreative, type Validation } from "./validation";
import { listCompetitors } from "./competitors";
import { competitorLines, matchesProduct } from "./landscape";
import { changedFields, conceptToSnapshot, shouldCoalesce, snapshotOf, snapshotToConcept } from "./versions";

export class ConflictError extends Error {
  constructor(public current: { revision: number; snapshot: CreativeSnapshot; updatedBy: string }) {
    super("This ad was changed somewhere else (another tab or teammate) since you opened it.");
  }
}

export async function loadCreative(id: string) {
  const [row] = await db
    .select({ c: schema.creatives, p: schema.products })
    .from(schema.creatives)
    .leftJoin(schema.products, eq(schema.creatives.productId, schema.products.id))
    .where(eq(schema.creatives.id, id));
  return row ?? null;
}

/** Validation context shared by every check, so they agree. */
export async function validationContext() {
  const [terms, brand, competitors] = await Promise.all([getTerms(), getBrand(), listCompetitors()]);
  return { terms, avoidPhrases: phraseList(brand.avoidPhrases), competitors };
}

export function validate(snapshot: CreativeSnapshot, platform: Platform, product: Product | null, ctx: Awaited<ReturnType<typeof validationContext>>): Validation {
  const lines = product ? competitorLines(ctx.competitors.filter((r) => matchesProduct(r, product))) : [];
  return validateCreative({ concept: snapshotToConcept(snapshot), platform, product, terms: ctx.terms, avoidPhrases: ctx.avoidPhrases, competitorLines: lines });
}

export function gateFor(c: Creative, v: Validation, qaChecked = c.qaChecked): GateResult {
  return approvalGate({
    platform: c.platform,
    scanResult: v.scan,
    qaChecked,
    otherBlocking: v.issues.filter((i) => i.level === "block" && !i.id.startsWith("scan:")).map((i) => i.detail),
    review: { needed: v.needsHumanReview, reviewedBy: c.claimsReviewedBy },
  });
}

export async function createCreative(opts: {
  concept: Concept;
  platform: Platform;
  product: Product;
  creativeType: string;
  placement: string;
  objective: Objective | "";
  deliverable: Deliverable;
  meta: GenerationMeta;
  imageIds?: string[];
  user: string;
}) {
  const snapshot = conceptToSnapshot(opts.concept);
  const v = validate(snapshot, opts.platform, opts.product, await validationContext());
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(schema.creatives)
      .values({
        ...snapshot,
        platform: opts.platform,
        productId: opts.product.id,
        creativeType: opts.creativeType,
        placement: opts.placement,
        objective: opts.objective,
        deliverable: opts.deliverable,
        generationMeta: opts.meta,
        scanResult: v.scan,
        imageIds: opts.imageIds ?? [],
        createdBy: opts.user,
      })
      .returning();
    await tx.insert(schema.creativeVersions).values({ creativeId: row.id, revision: 1, snapshot, source: "generated", createdBy: opts.user });
    return row;
  });
}

export type SaveResult = { revision: number; status: CreativeStatus; claimsReviewedBy: string; reviewCleared: boolean; demoted: boolean; changed: string[] };

/**
 * Saves edited content. Rejects stale edits (ConflictError), re-scans on the
 * server, clears a claims sign-off and sends an approved ad back to Draft
 * when the words change, and keeps version history.
 */
export async function saveContent(opts: {
  id: string;
  baseRevision: number;
  snapshot: CreativeSnapshot;
  user: string;
  source?: "autosave" | "manual" | "restore" | "regenerated";
  note?: string;
}): Promise<SaveResult> {
  const ctx = await validationContext();
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(schema.creatives).where(eq(schema.creatives.id, opts.id)).for("update");
    if (!row) throw new Error("That ad no longer exists.");
    const before = snapshotOf(row);
    if (row.revision !== opts.baseRevision) {
      throw new ConflictError({ revision: row.revision, snapshot: before, updatedBy: "" });
    }
    const changed = changedFields(before, opts.snapshot);
    const source = opts.source ?? "autosave";
    if (changed.length === 0 && source === "autosave") {
      return { revision: row.revision, status: row.status, claimsReviewedBy: row.claimsReviewedBy, reviewCleared: false, demoted: false, changed };
    }
    const [product] = row.productId ? await tx.select().from(schema.products).where(eq(schema.products.id, row.productId)) : [];
    const v = validate(opts.snapshot, row.platform, product ?? null, ctx);
    const wordsChanged = changed.length > 0;
    const demoted = wordsChanged && GATED_STATUSES.includes(row.status);
    const reviewCleared = wordsChanged && Boolean(row.claimsReviewedBy);
    const revision = row.revision + 1;
    const now = new Date();

    // Legacy ads saved before version history: keep their original text as the first version.
    const [latest] = await tx
      .select()
      .from(schema.creativeVersions)
      .where(eq(schema.creativeVersions.creativeId, row.id))
      .orderBy(desc(schema.creativeVersions.revision))
      .limit(1);
    if (!latest) {
      await tx.insert(schema.creativeVersions).values({ creativeId: row.id, revision: row.revision, snapshot: before, source: "generated", note: "Original", createdBy: row.createdBy, createdAt: row.createdAt });
    }

    await tx
      .update(schema.creatives)
      .set({
        ...opts.snapshot,
        revision,
        scanResult: v.scan,
        updatedAt: now,
        ...(reviewCleared ? { claimsReviewedBy: "", claimsReviewedAt: null } : {}),
        ...(demoted ? { status: "Draft" as const, approvedBy: "", approvedAt: null } : {}),
      })
      .where(eq(schema.creatives.id, row.id));

    if (latest && source === "autosave" && shouldCoalesce(latest, opts.user, now)) {
      await tx.update(schema.creativeVersions).set({ revision, snapshot: opts.snapshot }).where(eq(schema.creativeVersions.id, latest.id));
    } else {
      await tx.insert(schema.creativeVersions).values({ creativeId: row.id, revision, snapshot: opts.snapshot, source, note: opts.note ?? "", createdBy: opts.user, createdAt: now });
    }
    return { revision, status: demoted ? "Draft" : row.status, claimsReviewedBy: reviewCleared ? "" : row.claimsReviewedBy, reviewCleared, demoted, changed };
  });
}

/** Marks the current content as a named checkpoint (no content change). */
export async function checkpoint(id: string, user: string, note: string) {
  const [row] = await db.select().from(schema.creatives).where(eq(schema.creatives.id, id));
  if (!row) throw new Error("That ad no longer exists.");
  const [latest] = await db.select().from(schema.creativeVersions).where(eq(schema.creativeVersions.creativeId, id)).orderBy(desc(schema.creativeVersions.revision)).limit(1);
  if (latest && latest.revision === row.revision && latest.source === "autosave") {
    await db.update(schema.creativeVersions).set({ source: "manual", note }).where(eq(schema.creativeVersions.id, latest.id));
  } else {
    await db.insert(schema.creativeVersions).values({ creativeId: id, revision: row.revision, snapshot: snapshotOf(row), source: "manual", note, createdBy: user });
  }
}

export async function listVersions(id: string) {
  return db
    .select({
      id: schema.creativeVersions.id,
      revision: schema.creativeVersions.revision,
      source: schema.creativeVersions.source,
      note: schema.creativeVersions.note,
      createdBy: schema.creativeVersions.createdBy,
      createdAt: schema.creativeVersions.createdAt,
      snapshot: schema.creativeVersions.snapshot,
    })
    .from(schema.creativeVersions)
    .where(eq(schema.creativeVersions.creativeId, id))
    .orderBy(desc(schema.creativeVersions.createdAt), desc(schema.creativeVersions.revision))
    .limit(100);
}

export async function restoreVersion(opts: { id: string; versionId: string; baseRevision: number; user: string }) {
  const [v] = await db
    .select()
    .from(schema.creativeVersions)
    .where(and(eq(schema.creativeVersions.id, opts.versionId), eq(schema.creativeVersions.creativeId, opts.id)));
  if (!v) throw new Error("That version no longer exists.");
  const res = await saveContent({ id: opts.id, baseRevision: opts.baseRevision, snapshot: v.snapshot, user: opts.user, source: "restore", note: `Restored from ${v.createdAt.toISOString()}` });
  return { ...res, snapshot: v.snapshot };
}

/** An approver confirms the uncertain claims at this exact revision. */
export async function markClaimsReviewed(opts: { id: string; baseRevision: number; user: string; reviewed: boolean }) {
  const updated = await db
    .update(schema.creatives)
    .set(opts.reviewed ? { claimsReviewedBy: opts.user, claimsReviewedAt: new Date() } : { claimsReviewedBy: "", claimsReviewedAt: null, ...demoteIfApproved() })
    .where(and(eq(schema.creatives.id, opts.id), eq(schema.creatives.revision, opts.baseRevision)))
    .returning({ id: schema.creatives.id });
  if (!updated.length) throw new Error("The ad changed since you looked at it. Reload, re-read the claims, then confirm again.");
}

const demoteIfApproved = () => ({
  status: sql`case when ${schema.creatives.status} in ('Approved','In production','Live','Winner') then 'Draft' else ${schema.creatives.status} end`,
  approvedBy: "",
  approvedAt: null,
});

/** Status change with the full gate (scan, restricted claims, review sign-off, checklist). */
export async function changeStatus(id: string, status: CreativeStatus, user: string): Promise<GateResult> {
  const row = await loadCreative(id);
  if (!row) return { ok: false, missing: ["That ad no longer exists."] };
  const v = validate(snapshotOf(row.c), row.c.platform, row.p, await validationContext());
  await db.update(schema.creatives).set({ scanResult: v.scan }).where(eq(schema.creatives.id, id));
  if (GATED_STATUSES.includes(status)) {
    const gate = gateFor(row.c, v);
    if (!gate.ok) return gate;
  }
  const approving = GATED_STATUSES.includes(status) && !GATED_STATUSES.includes(row.c.status);
  await db
    .update(schema.creatives)
    .set({
      status,
      updatedAt: new Date(),
      ...(approving ? { approvedBy: user, approvedAt: new Date() } : {}),
      ...(!GATED_STATUSES.includes(status) ? { approvedBy: "", approvedAt: null } : {}),
    })
    .where(eq(schema.creatives.id, id));
  return { ok: true, missing: [] };
}
