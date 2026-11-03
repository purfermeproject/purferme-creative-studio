import "server-only";
import sharp from "sharp";
import { z } from "zod";
import { isMock, structuredCall } from "./ai";
import { calloutFor, compareDesignText, pickSetting, seedOf, SETTINGS, type DesignSpec } from "./designed-ad";

const hasAi = () => !isMock() && Boolean(process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY);

const PlanSchema = z.object({
  headline: z.string().describe("2–5 words, benefit or hook, Title Case, e.g. 'Sweet The Natural Way'"),
  sub: z.string().describe("One short line (12 words or fewer) under the headline"),
  layout: z.enum(["callouts-left", "callouts-both", "comparison", "badge"]),
  callouts: z.array(z.string()).describe("2–4 callout labels of 1–3 words, ONLY from the approved claims and ingredients given; 'No X' for things it doesn't contain"),
  table: z
    .object({
      us: z.string(),
      them: z.string().describe("A generic category, never a brand, e.g. 'Regular Biscuit'"),
      rows: z.array(z.object({ label: z.string(), us: z.string(), them: z.string() })).describe("3–5 rows"),
    })
    .optional()
    .describe("Only for layout = comparison"),
  scene: z.string().describe("Who and where behind the pack, doing what (one sentence), true to the ad's scene"),
  setting: z.enum(SETTINGS.map((s) => s.key) as [string, ...string[]]).describe("The world this image happens in"),
  emotion: z.string().describe("The one feeling this image gives, in a few words, e.g. 'nostalgia: grandma's kitchen on a Sunday'"),
});

/**
 * Turns an ad concept into a designed image: headline, sub-line, callouts (only from approved claims and
 * ingredients) and the scene. Without an AI, a direct mapping from the concept.
 */
export async function planDesign(
  c: { hook: string; angle: string; headline?: string; body?: string; scene: string },
  product: { name: string; ingredients: string; greenClaims: string[] },
  user: string,
  /** Spreads the images of one ad (and different ads) across different settings. */
  seed = 0,
): Promise<DesignSpec> {
  const fromClaims = product.greenClaims.slice(0, 4);
  const setting = pickSetting(c.scene, `${c.hook} ${c.angle}`, [], seedOf(c.hook) + seed);
  const fallback: DesignSpec = {
    headline: c.hook.trim(),
    sub: c.headline && c.headline !== c.hook ? c.headline : "",
    layout: "callouts-left",
    callouts: (fromClaims.length ? fromClaims : product.ingredients.split(/[,;]/).map((s) => s.replace(/\(.*?\)/g, "").trim()).filter(Boolean).slice(0, 3)).map(calloutFor),
    scene: c.scene,
    setting,
  };
  if (!hasAi()) return fallback;
  try {
    const r = await structuredCall({
      schema: PlanSchema,
      prompt: `Design one finished ad image for ${product.name}, in the style of a premium Indian D2C brand post: a big headline at the top, a sub-line, the real pack as the hero, and either 2–4 small callouts with icons, a 3-column comparison table, or one small card.
The ad: hook "${c.hook}"; angle: ${c.angle}${c.headline ? `; headline "${c.headline}"` : ""}${c.body ? `; body: ${c.body}` : ""}.
The scene: ${c.scene}
Approved claims (callouts and table rows may ONLY use these, reworded at most slightly): ${product.greenClaims.join("; ") || "none"}.
Ingredients (callouts may name these): ${product.ingredients}.
Settings to choose from (pick the one that tells THIS ad's story and emotion best; images should not all look the same): ${SETTINGS.map((s) => `${s.key} = ${s.place} (${s.mood})`).join("; ")}.
Keep the hook's idea in the headline (shorten it to 2–5 words if needed). Never invent a number, a health claim, a certification or a competitor brand.`,
      maxTokens: 1500,
      effort: "low",
      meta: { user, kind: "design-plan" },
      mock: () => ({ headline: fallback.headline, sub: fallback.sub, layout: "callouts-left" as const, callouts: fallback.callouts.map((x) => x.label), scene: fallback.scene, setting: setting.key, emotion: setting.mood }),
    });
    const callouts = r.callouts.slice(0, 6).map(calloutFor);
    const layout = r.layout === "comparison" && !r.table?.rows.length ? "callouts-left" : r.layout;
    const base = SETTINGS.find((s) => s.key === r.setting) ?? setting;
    const chosen = { key: base.key, place: base.place, light: base.light, surface: base.surface, colours: base.colours, mood: r.emotion.trim() || base.mood };
    return { headline: r.headline.trim() || fallback.headline, sub: r.sub.trim(), layout, callouts, table: layout === "comparison" ? r.table : undefined, scene: r.scene.trim() || c.scene, setting: chosen };
  } catch (e) {
    console.error("design planning failed", e);
    return fallback;
  }
}

/**
 * Reads every word drawn on a designed image (not the pack's own print) and compares them with the words
 * it was given. Empty in sample mode, without a key, or on error, so a failed check never blocks an image.
 */
export async function checkDesignText(image: Buffer, expected: string[], user: string): Promise<string[]> {
  if (!hasAi() || !expected.length) return [];
  try {
    const small = await sharp(image).resize(1280, 1280, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 90 }).toBuffer();
    const r = await structuredCall({
      schema: z.object({ texts: z.array(z.string()).describe("Each separate piece of text, exactly as written, letter by letter") }),
      prompt: `This is an advertising image with a product pack in it. Read EVERY piece of text in the image EXCEPT what is printed on the product pack itself (ignore the pack's own label, logo and print). Include the headline, sub-line, callout labels, table headers and cells, buttons and any other words or numbers anywhere else. Copy each exactly as drawn, letter by letter, including any spelling mistakes; list a repeated label each time it appears.`,
      image: { mediaType: "image/jpeg", base64: small.toString("base64") },
      maxTokens: 1500,
      effort: "low",
      meta: { user, kind: "design-read" },
      mock: () => ({ texts: expected }),
    });
    return compareDesignText(expected, r.texts);
  } catch (e) {
    console.error("design text check failed", e);
    return [];
  }
}
