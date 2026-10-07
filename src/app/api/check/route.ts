import { z } from "zod";
import { requireUser } from "@/auth";
import { errorMessage, structuredCall } from "@/lib/ai";
import { scan } from "@/lib/compliance";
import { getBrand, getPlatformRule, getProduct, getTerms } from "@/lib/data";
import { mockDeepCheck } from "@/lib/mocks";
import { buildCheckPrompt } from "@/lib/prompts";
import { DeepCheckSchema } from "@/lib/schemas";
import { PLATFORMS } from "@/lib/types";

export const maxDuration = 120;

const Body = z.object({
  text: z.string().trim().min(1, "Paste some copy to check.").max(8000, "That's too long to check in one go (8,000 characters max)."),
  platform: z.enum(PLATFORMS),
  productId: z.string().uuid().nullable().optional(),
});

export async function POST(req: Request) {
  let user: string;
  try {
    user = await requireUser();
  } catch (e) {
    return Response.json({ error: errorMessage(e) }, { status: 401 });
  }
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0].message }, { status: 400 });
  const { text, platform, productId } = parsed.data;

  try {
    const [brand, rule, product, terms] = await Promise.all([
      getBrand(),
      getPlatformRule(platform),
      productId ? getProduct(productId) : Promise.resolve(null),
      getTerms(),
    ]);
    const scanResult = scan(text, platform, product?.slug, terms);
    const { system, user: prompt } = buildCheckPrompt(brand, product, rule, platform, text);
    const result = await structuredCall({
      schema: DeepCheckSchema,
      system,
      prompt,
      maxTokens: 16000,
      effort: "medium",
      meta: { user, kind: "check", platform, productId: product?.id },
      mock: () => mockDeepCheck(text, scanResult),
    });
    return Response.json({ result, scan: scanResult });
  } catch (e) {
    return Response.json({ error: errorMessage(e) }, { status: 500 });
  }
}
