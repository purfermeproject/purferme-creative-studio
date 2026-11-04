import "server-only";
import sharp from "sharp";
import { z } from "zod";
import { isMock, structuredCall } from "./ai";
import { PACK_VIEWS, packActionByRules, pickViewsByRules, type PackView } from "./pack-views";

const hasAi = () => !isMock() && Boolean(process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY);

/** Which side of the pack a photo shows. Null in sample mode, without a key, or on error. */
export async function classifyPackView(image: Buffer, user: string): Promise<PackView | null> {
  if (!hasAi()) return null;
  try {
    const small = await sharp(image).rotate().flatten({ background: "#ffffff" }).resize(768, 768, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
    const r = await structuredCall({
      schema: z.object({ view: z.enum(PACK_VIEWS) }),
      prompt: `This is a photo of a food product pack. Which side does it show? front = the main face with the brand name and big product picture; back = ingredients, nutrition table, barcode; left side / right side = a narrow side panel; top / bottom = the lid or base; angle = a 3/4 view showing the front and one side together; open = the pack opened with the product visible; nutrition panel = a close-up of just the nutrition table; ingredients panel = a close-up of just the ingredients list.`,
      image: { mediaType: "image/jpeg", base64: small.toString("base64") },
      maxTokens: 300,
      effort: "low",
      meta: { user, kind: "pack-view" },
      mock: () => ({ view: "front" as const }),
    });
    return r.view;
  } catch (e) {
    console.error("pack view classification failed", e);
    return null;
  }
}

/**
 * How the pack is part of this moment (who does what with it), and which sides of it suit the scene, best
 * first (at most 3). Falls back to simple rules.
 */
export async function choosePackViews(
  scene: string,
  available: PackView[],
  user: string,
  ctx: { hook?: string; productName?: string } = {},
): Promise<{ views: PackView[]; why: string; action: string }> {
  // Close-ups of a panel are for their own slides, not for drawing the pack in a scene.
  available = available.filter((v) => !v.endsWith("panel"));
  const fallback = { views: pickViewsByRules(scene, available), why: "", action: packActionByRules(scene, ctx.hook) };
  if (!hasAi()) return fallback;
  try {
    const r = await structuredCall({
      schema: z.object({
        action: z
          .string()
          .describe("One sentence: exactly what the person does with the pack in this moment, so it is part of the story (e.g. 'she ties a ribbon round the pack, her gift for her roommate')"),
        views: z.array(z.enum(PACK_VIEWS)).describe("Best first, 1 to 3, only from the available list"),
        why: z.string().describe("A few words, e.g. 'she is reading the ingredients'"),
      }),
      prompt: `An ad photo will show this scene with our product pack (${ctx.productName ?? "a box of cookies"}) in it:
"${scene}"${ctx.hook ? `\nThe ad's hook: "${ctx.hook}"` : ""}
1. In one sentence, say exactly what the person does with the pack so it is the centre of the story, not a product standing beside it: they hold it, give it, wrap it, open it, take a cookie from it, pack it into a bag… Keep it true to the scene and the hook.
2. We have photos of the pack from these sides: ${available.join(", ")}. Which should the image AI see to draw it correctly in that moment? Put first the side the camera will mostly see (back if someone reads the ingredients, angle if it is held, top for a flat lay, open if it is being opened). Include front when the name and logo should show. Choose 1 to 3.`,
      maxTokens: 300,
      effort: "low",
      meta: { user, kind: "pack-view-pick" },
      mock: () => fallback,
    });
    const views = r.views.filter((v, i, a) => available.includes(v) && a.indexOf(v) === i).slice(0, 3);
    return { views: views.length ? views : fallback.views, why: r.why, action: r.action.trim() || fallback.action };
  } catch (e) {
    console.error("choosing pack views failed", e);
    return fallback;
  }
}

/** The pack's side photos by side (the main pack photo stands in for the front when there is no front view). */
export async function loadPackViews(
  photoAssetIds: string[],
  main: { data: Buffer; mime: string; name: string; label?: string },
  mainAssetId: string | null,
): Promise<Map<PackView, { ref: { data: Buffer; mime: string; name: string; label?: string }; assetId: string | null }>> {
  const { db, schema } = await import("@/db");
  const { inArray } = await import("drizzle-orm");
  const { viewOf } = await import("./pack-views");
  const byView = new Map<PackView, { ref: { data: Buffer; mime: string; name: string; label?: string }; assetId: string | null }>();
  if (photoAssetIds.length) {
    const rows = await db
      .select({ id: schema.assets.id, label: schema.assets.label, mime: schema.assets.mime, data: schema.assets.dataBase64 })
      .from(schema.assets)
      .where(inArray(schema.assets.id, photoAssetIds));
    for (const r of rows) {
      const v = viewOf(r.label);
      if (v && !byView.has(v)) byView.set(v, { ref: { data: Buffer.from(r.data, "base64"), mime: r.mime, name: v.replace(/\W+/g, "-"), label: r.label }, assetId: r.id });
    }
  }
  if (!byView.has("front")) byView.set("front", { ref: main, assetId: mainAssetId });
  return byView;
}

/** Photos of the real product itself (refined on upload), at most `max`, for the AI to copy the food from. */
export async function loadProductShots(photoAssetIds: string[], max = 2): Promise<{ data: Buffer; mime: string; name: string; label?: string }[]> {
  if (!photoAssetIds.length) return [];
  const { db, schema } = await import("@/db");
  const { inArray } = await import("drizzle-orm");
  const { isProductShot } = await import("./pack-views");
  const rows = await db
    .select({ id: schema.assets.id, label: schema.assets.label, mime: schema.assets.mime, data: schema.assets.dataBase64 })
    .from(schema.assets)
    .where(inArray(schema.assets.id, photoAssetIds));
  return rows
    .filter((r) => isProductShot(r.label))
    .slice(0, max)
    .map((r, i) => ({ data: Buffer.from(r.data, "base64"), mime: r.mime, name: `our-product-${i + 1}`, label: r.label }));
}
