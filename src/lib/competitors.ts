import "server-only";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { isMock, MODEL, OPENAI_TEXT_MODEL, structuredCall, textProvider, UserFacingError } from "./ai";
import { getBrand, getProducts } from "./data";
import { mockCompetitorAnalysis } from "./mocks";
import { buildCompetitorPrompt, type CompetitorContext } from "./prompts";
import { CompetitorAnalysisSchema } from "./schemas";

export async function listCompetitors() {
  return db.select().from(schema.competitorAds).orderBy(desc(schema.competitorAds.createdAt)).limit(200);
}

/** The analysed competitor ad as prompt context, or null. */
export async function competitorContext(id: string): Promise<CompetitorContext | null> {
  const [c] = await db.select().from(schema.competitorAds).where(eq(schema.competitorAds.id, id));
  if (!c?.analysis) return null;
  return {
    brand: c.brand,
    summary: c.analysis.summary,
    hook: c.analysis.hook,
    angle: c.analysis.angle,
    claims: c.analysis.claims_made.map((x) => x.text),
    whiteSpace: c.analysis.white_space,
  };
}

export async function analyseCompetitor(id: string, user: string) {
  const [c] = await db.select().from(schema.competitorAds).where(eq(schema.competitorAds.id, id));
  if (!c) throw new UserFacingError("That competitor ad no longer exists.");
  let image: { mediaType: "image/png" | "image/jpeg" | "image/webp" | "image/gif"; base64: string } | null = null;
  if (c.imageAssetId) {
    const [a] = await db.select({ mime: schema.assets.mime, data: schema.assets.dataBase64 }).from(schema.assets).where(eq(schema.assets.id, c.imageAssetId));
    if (a && ["image/png", "image/jpeg", "image/webp", "image/gif"].includes(a.mime)) image = { mediaType: a.mime as "image/png", base64: a.data };
  }
  if (!image && !c.adText.trim()) throw new UserFacingError("Paste the ad's text or upload a screenshot first, so there's something to analyse.");
  const [brand, products] = await Promise.all([getBrand(), getProducts()]);
  const prompt = buildCompetitorPrompt(
    brand,
    products.filter((p) => p.status === "ready"),
    { brand: c.brand, product: c.product, channel: c.channel, adText: c.adText, notes: c.notes, hasImage: Boolean(image) },
  );
  const analysis = await structuredCall({
    schema: CompetitorAnalysisSchema,
    prompt,
    image,
    maxTokens: 12000,
    effort: "medium",
    meta: { user, kind: "competitor" },
    mock: () => mockCompetitorAnalysis(c.brand),
  });
  const model = isMock() ? "mock" : textProvider() === "openai" ? OPENAI_TEXT_MODEL : MODEL;
  await db.update(schema.competitorAds).set({ analysis, analysisModel: model, analysedAt: new Date() }).where(eq(schema.competitorAds.id, id));
  return { analysis, model };
}
