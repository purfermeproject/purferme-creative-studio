"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { put } from "@vercel/blob";
import { requireUser } from "@/auth";
import { db, schema } from "@/db";
import { lines, type ActionState } from "@/lib/action-state";
import { regexError } from "@/lib/compliance";
import { PLATFORMS, PRODUCT_STATUSES, SEVERITIES, isPlatform } from "@/lib/types";
import { DEFAULT_THRESHOLDS, type VerdictThresholds } from "@/lib/verdicts";

const ok = (message: string): ActionState => ({ ok: true, message });
const fail = (message: string): ActionState => ({ ok: false, message });

function refresh() {
  revalidatePath("/", "layout");
}

async function guard<T>(fn: () => Promise<T>): Promise<T | ActionState> {
  try {
    await requireUser();
    return await fn();
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Something went wrong. Try again.");
  }
}

const productSchema = z.object({
  name: z.string().trim().min(1, "Name is required."),
  priceText: z.string().trim(),
  status: z.enum(PRODUCT_STATUSES),
  statusReason: z.string().trim(),
  notes: z.string().trim(),
  allergens: z.string().trim(),
  packImageUrl: z.string().trim(),
});

export async function saveProduct(_: ActionState, fd: FormData): Promise<ActionState> {
  return guard(async () => {
    const id = String(fd.get("id") ?? "");
    const parsed = productSchema.safeParse(Object.fromEntries(fd));
    if (!parsed.success) return fail(parsed.error.issues[0].message);
    const v = parsed.data;
    if (v.status !== "ready" && !v.statusReason) {
      return fail(`Add a reason when a product is on ${v.status}, so the team knows why it can't be generated.`);
    }
    await db
      .update(schema.products)
      .set({
        ...v,
        packImageUrl: v.packImageUrl || null,
        greenClaims: lines(fd.get("greenClaims")),
        amberClaims: lines(fd.get("amberClaims")),
        redClaims: lines(fd.get("redClaims")),
        updatedAt: new Date(),
      })
      .where(eq(schema.products.id, id));
    refresh();
    return ok("Saved.");
  }) as Promise<ActionState>;
}

export async function createProduct(_: ActionState, fd: FormData): Promise<ActionState> {
  return guard(async () => {
    const slug = String(fd.get("slug") ?? "").trim().toLowerCase();
    const name = String(fd.get("name") ?? "").trim();
    if (!/^[a-z0-9-]{2,32}$/.test(slug)) return fail("Slug must be 2–32 lowercase letters, numbers or dashes.");
    if (!name) return fail("Name is required.");
    const existing = await db.select({ id: schema.products.id }).from(schema.products).where(eq(schema.products.slug, slug));
    if (existing.length) return fail(`A product with slug "${slug}" already exists.`);
    // New products start on hold until their claims are reviewed.
    await db.insert(schema.products).values({ slug, name, status: "hold", statusReason: "New product: claims not reviewed yet." });
    refresh();
    return ok(`Added ${name}. It starts on hold; review its claims, then set it to ready.`);
  }) as Promise<ActionState>;
}

export async function deleteProduct(_: ActionState, fd: FormData): Promise<ActionState> {
  return guard(async () => {
    await db.delete(schema.products).where(eq(schema.products.id, String(fd.get("id"))));
    refresh();
    return ok("Deleted.");
  }) as Promise<ActionState>;
}

export async function uploadPackImage(_: ActionState, fd: FormData): Promise<ActionState> {
  return guard(async () => {
    const id = String(fd.get("id") ?? "");
    const file = fd.get("file");
    if (!(file instanceof File) || file.size === 0) return fail("Choose an image file first.");
    if (!file.type.startsWith("image/")) return fail("That file isn't an image. Use a PNG, JPG or WebP.");
    if (file.size > 5 * 1024 * 1024) return fail("Images must be under 5 MB.");
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return fail("Image storage isn't set up yet (BLOB_READ_WRITE_TOKEN). Paste a public image URL instead.");
    }
    const blob = await put(`packs/${id}-${file.name}`, file, { access: "public", addRandomSuffix: true });
    await db.update(schema.products).set({ packImageUrl: blob.url, updatedAt: new Date() }).where(eq(schema.products.id, id));
    refresh();
    return ok("Pack image uploaded.");
  }) as Promise<ActionState>;
}

export async function saveBrand(_: ActionState, fd: FormData): Promise<ActionState> {
  return guard(async () => {
    await db
      .update(schema.brandSettings)
      .set({
        brandContext: String(fd.get("brandContext") ?? "").trim(),
        hardRules: String(fd.get("hardRules") ?? "").trim(),
        tone: String(fd.get("tone") ?? "").trim(),
        angles: lines(fd.get("angles")),
        personas: lines(fd.get("personas")),
        languages: lines(fd.get("languages")),
        updatedAt: new Date(),
      })
      .where(eq(schema.brandSettings.id, 1));
    refresh();
    return ok("Saved.");
  }) as Promise<ActionState>;
}

export async function saveThresholds(_: ActionState, fd: FormData): Promise<ActionState> {
  return guard(async () => {
    const num = (k: string) => Number(fd.get(k));
    const t: VerdictThresholds = {
      meta: Object.fromEntries(
        Object.keys(DEFAULT_THRESHOLDS.meta).map((k) => [k, num(`meta.${k}`)]),
      ) as VerdictThresholds["meta"],
      marketplace: Object.fromEntries(
        Object.keys(DEFAULT_THRESHOLDS.marketplace).map((k) => [k, num(`marketplace.${k}`)]),
      ) as VerdictThresholds["marketplace"],
    };
    const bad = [...Object.entries(t.meta), ...Object.entries(t.marketplace)].find(([, v]) => !Number.isFinite(v) || v < 0);
    if (bad) return fail(`"${bad[0]}" must be a number of 0 or more.`);
    await db.update(schema.brandSettings).set({ verdictThresholds: t, updatedAt: new Date() }).where(eq(schema.brandSettings.id, 1));
    refresh();
    return ok("Saved.");
  }) as Promise<ActionState>;
}

export async function savePlatformRule(_: ActionState, fd: FormData): Promise<ActionState> {
  return guard(async () => {
    const platform = String(fd.get("platform"));
    if (!isPlatform(platform)) return fail("Unknown platform.");
    const comparison: { row: string; value: string }[] = [];
    for (let i = 0; fd.has(`cmp_row_${i}`); i++) {
      const row = String(fd.get(`cmp_row_${i}`)).trim();
      if (row) comparison.push({ row, value: String(fd.get(`cmp_value_${i}`) ?? "").trim() });
    }
    const creativeTypes = lines(fd.get("creativeTypes"));
    if (creativeTypes.length === 0) return fail("Add at least one creative type.");
    await db
      .update(schema.platformRules)
      .set({
        creativeTypes,
        rules: String(fd.get("rules") ?? "").trim(),
        guideMarkdown: String(fd.get("guideMarkdown") ?? ""),
        comparison,
        updatedAt: new Date(),
      })
      .where(eq(schema.platformRules.platform, platform));
    refresh();
    return ok("Saved.");
  }) as Promise<ActionState>;
}

const termSchema = z.object({
  label: z.string().trim().min(1, "Label is required."),
  regex: z.string().trim().min(1, "Pattern is required."),
  severity: z.enum(SEVERITIES),
  platform: z.union([z.enum(PLATFORMS), z.literal("")]),
  productSlug: z.string().trim(),
});

function parseTerm(fd: FormData) {
  const parsed = termSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: parsed.error.issues[0].message } as const;
  const err = regexError(parsed.data.regex);
  if (err) return { error: `That pattern isn't a valid regex: ${err}` } as const;
  return {
    value: {
      ...parsed.data,
      platform: parsed.data.platform || null,
      productSlug: parsed.data.productSlug || null,
      active: fd.get("active") === "on",
    },
  } as const;
}

export async function saveTerm(_: ActionState, fd: FormData): Promise<ActionState> {
  return guard(async () => {
    const t = parseTerm(fd);
    if ("error" in t) return fail(t.error!);
    await db.update(schema.complianceTerms).set(t.value).where(eq(schema.complianceTerms.id, String(fd.get("id"))));
    refresh();
    return ok("Saved.");
  }) as Promise<ActionState>;
}

export async function createTerm(_: ActionState, fd: FormData): Promise<ActionState> {
  return guard(async () => {
    const t = parseTerm(fd);
    if ("error" in t) return fail(t.error!);
    await db.insert(schema.complianceTerms).values(t.value);
    refresh();
    return ok("Added.");
  }) as Promise<ActionState>;
}

export async function deleteTerm(_: ActionState, fd: FormData): Promise<ActionState> {
  return guard(async () => {
    await db.delete(schema.complianceTerms).where(eq(schema.complianceTerms.id, String(fd.get("id"))));
    refresh();
    return ok("Deleted.");
  }) as Promise<ActionState>;
}
