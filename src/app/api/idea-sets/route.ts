import { z } from "zod";
import { authErrorStatus, requireRole } from "@/auth";
import { db, schema } from "@/db";
import { errorMessage } from "@/lib/ai";
import { conceptText, scan } from "@/lib/compliance";
import { getProduct, getTerms } from "@/lib/data";
import { ProposalSchema } from "@/lib/schemas";
import { PLATFORMS } from "@/lib/types";

const Body = z.object({
  productId: z.string().uuid(),
  platform: z.enum(PLATFORMS),
  creativeType: z.string().trim().min(1).max(150),
  placement: z.string().trim().max(100).default(""),
  proposals: z.array(ProposalSchema).min(1).max(6),
  mock: z.boolean().default(false),
});

/** Saves the ideas a research run proposed for one platform, so any of them can be developed later. */
export async function POST(req: Request) {
  let user: string;
  try {
    ({ user } = await requireRole("generate"));
  } catch (e) {
    return Response.json({ error: errorMessage(e) }, { status: authErrorStatus(e) });
  }
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0].message }, { status: 400 });
  const v = parsed.data;
  try {
    const [product, terms] = await Promise.all([getProduct(v.productId), getTerms()]);
    if (!product) return Response.json({ error: "That product no longer exists." }, { status: 404 });
    // Re-scan on the server; never trust a scan sent by the browser.
    const proposals = v.proposals.map((p) => ({ ...p, scan: scan(conceptText({ title: p.title, hook: p.hook, claims: p.claims, copy: { body: p.big_idea } }), v.platform, product.slug, terms) }));
    const [row] = await db
      .insert(schema.ideaSets)
      .values({ productId: product.id, platform: v.platform, creativeType: v.creativeType, placement: v.placement, proposals, mock: v.mock, createdBy: user })
      .returning({ id: schema.ideaSets.id });
    return Response.json({ id: row.id });
  } catch (e) {
    return Response.json({ error: errorMessage(e) }, { status: 500 });
  }
}
