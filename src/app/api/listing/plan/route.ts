import { z } from "zod";
import { authErrorStatus, requireRole } from "@/auth";
import { errorMessage, structuredCall } from "@/lib/ai";
import { latestPlaybook } from "@/lib/competitors";
import { getBrand, getProduct } from "@/lib/data";
import { LISTING_LABELS, LISTING_PLATFORMS, LISTING_RULES, ListingPlanSchema, SavedPlanSchema, TEAM_PLANS } from "@/lib/listing-plan";
import { checkPlan, savePlan } from "@/lib/listing-store";
import { mockListingPlan } from "@/lib/mocks";
import { buildListingPlanPrompt } from "@/lib/prompts";

export const maxDuration = 300;

const Make = z.object({ productId: z.string().uuid(), platform: z.enum(LISTING_PLATFORMS), source: z.enum(["ai", "team"]) });
const Save = z.object({ productId: z.string().uuid(), platform: z.enum(LISTING_PLATFORMS), plan: SavedPlanSchema });

/** Makes a plan: the team's own (from their listing analysis) or a new one written by the AI in the same format. */
export async function POST(req: Request) {
  let user: string;
  try {
    ({ user } = await requireRole("generate"));
  } catch (e) {
    return Response.json({ error: errorMessage(e) }, { status: authErrorStatus(e) });
  }
  const parsed = Make.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request. Refresh the page and try again." }, { status: 400 });
  const { productId, platform, source } = parsed.data;
  try {
    const product = await getProduct(productId);
    if (!product) return Response.json({ error: "That product no longer exists." }, { status: 404 });
    let plan;
    if (source === "team") {
      plan = TEAM_PLANS[product.slug];
      if (!plan) return Response.json({ error: "There's no team plan for this product yet. Let the AI write one." }, { status: 404 });
    } else {
      const brand = await getBrand();
      const exampleSlug = TEAM_PLANS[product.slug] ? product.slug : "bfast";
      const playbook = platform === "shopify" ? null : await latestPlaybook(platform, product.id).catch(() => null);
      plan = await structuredCall({
        schema: ListingPlanSchema,
        prompt: buildListingPlanPrompt(brand, product, {
          platform: LISTING_LABELS[platform],
          rules: LISTING_RULES,
          example: { name: exampleSlug === "bfast" ? "Millet & Oats Breakfast Cookies" : product.name, plan: TEAM_PLANS[exampleSlug] },
          playbook,
          hasQr: product.greenClaims.some((c) => /qr|traceab/i.test(c)),
        }),
        maxTokens: 6000,
        meta: { user, kind: "listing-plan", productId },
        mock: () => mockListingPlan(product),
      });
    }
    const row = await savePlan(productId, platform, plan, user, false);
    return Response.json({ plan: row.plan, images: row.images, checks: await checkPlan(row.plan, platform, product) });
  } catch (e) {
    return Response.json({ error: errorMessage(e) }, { status: 500 });
  }
}

/** Saves the team's edits to a plan and returns fresh checks. */
export async function PUT(req: Request) {
  let user: string;
  try {
    ({ user } = await requireRole("edit"));
  } catch (e) {
    return Response.json({ error: errorMessage(e) }, { status: authErrorStatus(e) });
  }
  const parsed = Save.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Some fields are missing. Check every slide has a header, sub-header, feature and photo." }, { status: 400 });
  try {
    const product = await getProduct(parsed.data.productId);
    if (!product) return Response.json({ error: "That product no longer exists." }, { status: 404 });
    const row = await savePlan(parsed.data.productId, parsed.data.platform, parsed.data.plan, user);
    return Response.json({ plan: row.plan, images: row.images, checks: await checkPlan(row.plan, parsed.data.platform, product) });
  } catch (e) {
    return Response.json({ error: errorMessage(e) }, { status: 500 });
  }
}
