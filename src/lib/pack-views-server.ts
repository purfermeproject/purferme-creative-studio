import "server-only";
import sharp from "sharp";
import { z } from "zod";
import { isMock, structuredCall } from "./ai";
import { PACK_VIEWS, pickViewsByRules, type PackView } from "./pack-views";

const hasAi = () => !isMock() && Boolean(process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY);

/** Which side of the pack a photo shows. Null in sample mode, without a key, or on error. */
export async function classifyPackView(image: Buffer, user: string): Promise<PackView | null> {
  if (!hasAi()) return null;
  try {
    const small = await sharp(image).rotate().flatten({ background: "#ffffff" }).resize(768, 768, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
    const r = await structuredCall({
      schema: z.object({ view: z.enum(PACK_VIEWS) }),
      prompt: `This is a photo of a food product pack. Which side does it show? front = the main face with the brand name and big product picture; back = ingredients, nutrition table, barcode; left side / right side = a narrow side panel; top / bottom = the lid or base; angle = a 3/4 view showing the front and one side together; open = the pack opened with the product visible.`,
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

/** The sides of the pack that suit this scene, best first (at most 3), and why. Falls back to simple rules. */
export async function choosePackViews(scene: string, available: PackView[], user: string): Promise<{ views: PackView[]; why: string }> {
  const fallback = { views: pickViewsByRules(scene, available), why: "" };
  if (available.length <= 1 || !hasAi()) return fallback;
  try {
    const r = await structuredCall({
      schema: z.object({
        views: z.array(z.enum(PACK_VIEWS)).describe("Best first, 1 to 3, only from the available list"),
        why: z.string().describe("A few words, e.g. 'she is reading the ingredients'"),
      }),
      prompt: `An ad photo will show this scene with our product pack in it:
"${scene}"
We have photos of the pack from these sides: ${available.join(", ")}.
Which sides should the image AI see so it draws the pack correctly in this moment? Put first the side the camera will mostly see (e.g. back if someone reads the ingredients, angle if it is held in a hand, top for a flat lay from above, open if it is being opened). Include front when the name and logo should show. Choose 1 to 3.`,
      maxTokens: 300,
      effort: "low",
      meta: { user, kind: "pack-view-pick" },
      mock: () => fallback,
    });
    const views = r.views.filter((v, i, a) => available.includes(v) && a.indexOf(v) === i).slice(0, 3);
    return views.length ? { views, why: r.why } : fallback;
  } catch (e) {
    console.error("choosing pack views failed", e);
    return fallback;
  }
}
