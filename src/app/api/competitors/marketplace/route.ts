import { z } from "zod";
import { authErrorStatus, requireRole } from "@/auth";
import { errorMessage, UserFacingError } from "@/lib/ai";
import { researchMarketplace } from "@/lib/competitors";

export const maxDuration = 300;

const Body = z.object({
  platform: z.enum(["amazon", "flipkart"]),
  category: z.string().trim().min(3, "Describe the category, e.g. “millet cookies”.").max(150),
  count: z.number().int().min(2).max(8).default(5),
  productId: z.string().uuid().nullable().optional(),
});

/** What's working on Amazon or Flipkart for a category: top listings and a playbook. */
export async function POST(req: Request) {
  let user: string;
  try {
    ({ user } = await requireRole("generate"));
  } catch (e) {
    return Response.json({ error: errorMessage(e) }, { status: authErrorStatus(e) });
  }
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0].message }, { status: 400 });
  try {
    return Response.json(await researchMarketplace({ ...parsed.data, productId: parsed.data.productId ?? null, user }));
  } catch (e) {
    return Response.json({ error: errorMessage(e) }, { status: e instanceof UserFacingError ? 400 : 500 });
  }
}
