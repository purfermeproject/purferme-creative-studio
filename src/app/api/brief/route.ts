import { desc, eq, gte } from "drizzle-orm";
import { requireUser } from "@/auth";
import { db, schema } from "@/db";
import { errorMessage, structuredCall } from "@/lib/ai";
import { getBrand } from "@/lib/data";
import { mockWeeklyBrief } from "@/lib/mocks";
import { buildWeeklyBriefPrompt } from "@/lib/prompts";
import { WeeklyBriefSchema } from "@/lib/schemas";

export const maxDuration = 300;

export async function POST() {
  let user: string;
  try {
    user = await requireUser();
  } catch (e) {
    return Response.json({ error: errorMessage(e) }, { status: 401 });
  }
  try {
    const since = new Date(Date.now() - 7 * 24 * 3600 * 1000);
    const rows = await db
      .select({ r: schema.results, c: schema.creatives, productName: schema.products.name })
      .from(schema.results)
      .leftJoin(schema.creatives, eq(schema.results.creativeId, schema.creatives.id))
      .leftJoin(schema.products, eq(schema.creatives.productId, schema.products.id))
      .where(gte(schema.results.createdAt, since))
      .orderBy(desc(schema.results.createdAt))
      .limit(300);
    if (rows.length === 0) {
      return Response.json({ error: "No results saved in the last 7 days. Add results above, then generate the brief." }, { status: 400 });
    }
    const data = rows.map(({ r, c, productName }) => ({
      platform: r.platform,
      period: [r.periodStart, r.periodEnd].filter(Boolean).join(" to ") || undefined,
      verdict: r.verdict,
      metrics: r.metrics,
      notes: r.notes || undefined,
      creative: c
        ? { title: c.title, product: productName, type: c.creativeType, angle: c.angle, persona: c.persona, format: c.format, language: c.language, hook: c.hook, status: c.status }
        : undefined,
    }));
    const brand = await getBrand();
    const brief = await structuredCall({
      schema: WeeklyBriefSchema,
      prompt: buildWeeklyBriefPrompt(brand, data),
      maxTokens: 16000,
      effort: "medium",
      meta: { user, kind: "brief" },
      mock: mockWeeklyBrief,
    });
    return Response.json({ brief, count: rows.length });
  } catch (e) {
    return Response.json({ error: errorMessage(e) }, { status: 500 });
  }
}
