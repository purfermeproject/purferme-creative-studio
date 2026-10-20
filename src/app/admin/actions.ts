"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { put } from "@vercel/blob";
import { requireRole, requireUser } from "@/auth";
import { db, schema } from "@/db";
import { lines, type ActionState } from "@/lib/action-state";
import { regexError } from "@/lib/compliance";
import { PLATFORMS, PRODUCT_STATUSES, SEVERITIES, isPlatform } from "@/lib/types";
import { DEFAULT_THRESHOLDS, type VerdictThresholds } from "@/lib/verdicts";
import { isHexColor, withKitDefaults, type BrandKit } from "@/lib/brand-kit";
import { parseEvidence, parseUrls } from "@/lib/product-knowledge";
import { storeAsset } from "@/lib/asset-store";
import { removeBackdrop } from "@/lib/cutout";
import { isCutout } from "@/lib/pack-composite";
import sharp from "sharp";

/** Product photos are placed into images unchanged, so they need to be big enough to look sharp. */
async function photoProblem(file: File): Promise<string | null> {
  try {
    const m = await sharp(Buffer.from(await file.arrayBuffer())).metadata();
    if ((m.width ?? 0) < 300 || (m.height ?? 0) < 300) return `That photo is only ${m.width}×${m.height} px. Use one at least 300 px on each side (500+ looks best).`;
    return null;
  } catch {
    return "That file couldn't be read as an image.";
  }
}
import { isRole } from "@/lib/roles";
import { count } from "drizzle-orm";

const ok = (message: string): ActionState => ({ ok: true, message });
const fail = (message: string): ActionState => ({ ok: false, message });

function refresh() {
  revalidatePath("/", "layout");
}

async function guard<T>(fn: () => Promise<T>): Promise<T | ActionState> {
  try {
    await requireRole("settings");
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
  story: z.string().trim().max(5000),
  ingredients: z.string().trim().max(3000).default(""),
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
    const links = parseUrls(String(fd.get("productUrls") ?? ""));
    if (links.invalid.length) return fail(`These product links aren't valid web addresses: ${links.invalid.join(", ")}`);
    await db
      .update(schema.products)
      .set({
        ...v,
        packImageUrl: v.packImageUrl || null,
        greenClaims: lines(fd.get("greenClaims")),
        amberClaims: lines(fd.get("amberClaims")),
        redClaims: lines(fd.get("redClaims")),
        messagingPriorities: lines(fd.get("messagingPriorities")).slice(0, 10),
        claimEvidence: parseEvidence(String(fd.get("claimEvidence") ?? "")),
        productUrls: links.urls,
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
    const problem = await photoProblem(file);
    if (problem) return fail(problem);
    const user = await requireUser();
    const data = Buffer.from(await file.arrayBuffer());
    // A pack shot on a plain studio backdrop is lifted off it, so it sits naturally in scenes.
    // The original photo is kept as an extra product photo.
    const lifted = (await isCutout(data).catch(() => true)) ? null : await removeBackdrop(data).catch(() => null);
    if (lifted) {
      const original = await storeAsset({ data, mime: file.type, kind: "product-photo", label: "Pack photo (original background)", user });
      const cut = await storeAsset({ data: lifted.png, mime: "image/png", kind: "pack", label: "Original pack (background removed)", user, sourceAssetIds: [original.id] });
      const [p] = await db.select({ ids: schema.products.photoAssetIds }).from(schema.products).where(eq(schema.products.id, id));
      await db
        .update(schema.products)
        .set({ packImageUrl: cut.url, photoAssetIds: [...(p?.ids ?? []), original.id].slice(-12), updatedAt: new Date() })
        .where(eq(schema.products.id, id));
      refresh();
      return ok("Pack photo saved. Its plain background was removed automatically so it sits naturally in scenes. Check it below; the original is kept under More product photos.");
    }
    let url: string;
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      url = (await put(`packs/${id}-${file.name}`, file, { access: "public", addRandomSuffix: true })).url;
    } else {
      // No cloud storage configured (e.g. running locally): keep it in the database.
      const [asset] = await db
        .insert(schema.assets)
        .values({ mime: file.type, dataBase64: Buffer.from(await file.arrayBuffer()).toString("base64"), prompt: "pack photo", kind: "pack", label: "Original pack (locked)" })
        .returning({ id: schema.assets.id });
      url = `/api/assets/${asset.id}`;
    }
    await db.update(schema.products).set({ packImageUrl: url, updatedAt: new Date() }).where(eq(schema.products.id, id));
    refresh();
    return ok("Pack image uploaded.");
  }) as Promise<ActionState>;
}

/** Use one of the product photos (e.g. the original with its background) as the pack photo. */
export async function usePhotoAsPack(_: ActionState, fd: FormData): Promise<ActionState> {
  return guard(async () => {
    const id = String(fd.get("id") ?? "");
    const assetId = String(fd.get("assetId") ?? "");
    const [p] = await db.select({ ids: schema.products.photoAssetIds }).from(schema.products).where(eq(schema.products.id, id));
    if (!p?.ids.includes(assetId)) return fail("That photo isn't one of this product's photos.");
    await db.update(schema.products).set({ packImageUrl: `/api/assets/${assetId}`, updatedAt: new Date() }).where(eq(schema.products.id, id));
    refresh();
    return ok("Now using that photo as the pack.");
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
        exampleAds: String(fd.get("exampleAds") ?? "").trim(),
        avoidPhrases: String(fd.get("avoidPhrases") ?? "").trim(),
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

const fontSchema = z.object({ name: z.string().trim().min(1).max(60), url: z.string().max(200).nullable() });
const kitSchema = z.object({
  logoUrl: z.string().max(200).nullable(),
  colors: z.object({ primary: z.string(), accent: z.string(), text: z.string(), band: z.string() }),
  headingFont: fontSchema,
  bodyFont: fontSchema,
});

export async function saveBrandKit(kit: BrandKit): Promise<ActionState> {
  return guard(async () => {
    const parsed = kitSchema.safeParse(kit);
    if (!parsed.success) return fail("Some brand kit values aren't valid. Check the font names and colours.");
    const bad = Object.entries(parsed.data.colors).find(([, v]) => !isHexColor(v));
    if (bad) return fail(`"${bad[0]}" must be a colour like #6b3f2a.`);
    const local = (u: string | null) => u === null || /^\/api\/assets\/[0-9a-f-]{36}$/i.test(u);
    if (!local(parsed.data.logoUrl) || !local(parsed.data.headingFont.url) || !local(parsed.data.bodyFont.url)) {
      return fail("Upload the logo and fonts here rather than linking to other sites.");
    }
    await db.update(schema.brandSettings).set({ kit: withKitDefaults(parsed.data), updatedAt: new Date() }).where(eq(schema.brandSettings.id, 1));
    refresh();
    return ok("Brand kit saved.");
  }) as Promise<ActionState>;
}

// ---- Team roles ----

export async function setUserRole(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const { user } = await requireRole("roles");
    const email = String(fd.get("email") ?? "").trim().toLowerCase();
    const role = String(fd.get("role") ?? "");
    if (!/^[^\s@]+@[^\s@]+$/.test(email)) return fail("Enter an email (team-password users are name@team.studio).");
    if (!isRole(role)) return fail("Pick a role.");
    if (email === user && role !== "admin") return fail("You can't lower your own role. Ask another admin.");
    const [{ n }] = await db.select({ n: count() }).from(schema.userRoles);
    // The first entry switches roles on; make sure whoever does it stays an admin.
    if (Number(n) === 0 && email !== user) {
      await db.insert(schema.userRoles).values({ email: user, role: "admin", updatedBy: user }).onConflictDoNothing();
    }
    await db
      .insert(schema.userRoles)
      .values({ email, role, updatedBy: user })
      .onConflictDoUpdate({ target: schema.userRoles.email, set: { role, updatedBy: user, updatedAt: new Date() } });
    refresh();
    return ok(`${email} is now ${role}.`);
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Couldn't save the role.");
  }
}

export async function removeUserRole(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const { user } = await requireRole("roles");
    const email = String(fd.get("email") ?? "").trim().toLowerCase();
    if (email === user) return fail("You can't remove yourself. Ask another admin.");
    await db.delete(schema.userRoles).where(eq(schema.userRoles.email, email));
    refresh();
    return ok("Removed.");
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Couldn't remove the role.");
  }
}

// ---- Extra product photos (placed into images unchanged, like the pack) ----

export async function uploadProductPhoto(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const { user } = await requireRole("settings");
    const id = String(fd.get("id") ?? "");
    const label = String(fd.get("label") ?? "").trim().slice(0, 80);
    const file = fd.get("file");
    if (!(file instanceof File) || file.size === 0) return fail("Choose a photo first.");
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) return fail("Use a PNG, JPG or WebP photo.");
    if (file.size > 5 * 1024 * 1024) return fail("Photos must be under 5 MB.");
    const problem = await photoProblem(file);
    if (problem) return fail(problem);
    const [product] = await db.select({ ids: schema.products.photoAssetIds }).from(schema.products).where(eq(schema.products.id, id));
    if (!product) return fail("That product no longer exists.");
    if (product.ids.length >= 12) return fail("A product can have up to 12 photos. Remove one first.");
    const asset = await storeAsset({ data: Buffer.from(await file.arrayBuffer()), mime: file.type, kind: "product-photo", label: label || file.name.replace(/\.[a-z0-9]+$/i, ""), user });
    await db.update(schema.products).set({ photoAssetIds: [...product.ids, asset.id], updatedAt: new Date() }).where(eq(schema.products.id, id));
    refresh();
    return ok("Photo added.");
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Couldn't add the photo.");
  }
}

export async function removeProductPhoto(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await requireRole("settings");
    const id = String(fd.get("id") ?? "");
    const assetId = String(fd.get("assetId") ?? "");
    const [product] = await db.select({ ids: schema.products.photoAssetIds }).from(schema.products).where(eq(schema.products.id, id));
    if (!product) return fail("That product no longer exists.");
    await db.update(schema.products).set({ photoAssetIds: product.ids.filter((x) => x !== assetId), updatedAt: new Date() }).where(eq(schema.products.id, id));
    refresh();
    return ok("Removed.");
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Couldn't remove the photo.");
  }
}
