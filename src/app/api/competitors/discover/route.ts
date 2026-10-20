import { z } from "zod";
import { authErrorStatus, requireRole } from "@/auth";
import { errorMessage, UserFacingError } from "@/lib/ai";
import { discoverCompetitors } from "@/lib/competitors";
import { DISCOVERY_FOCUS, type DiscoveryFocus } from "@/lib/prompts";

export const maxDuration = 300;

const Body = z.object({
  category: z.string().trim().min(3, "Describe the category, e.g. “millet cookies”.").max(150),
  focus: z.enum(Object.keys(DISCOVERY_FOCUS) as [DiscoveryFocus, ...DiscoveryFocus[]]).default("overall"),
  count: z.number().int().min(2).max(8).default(5),
  productId: z.string().uuid().nullable().optional(),
});

/** Finds competitors on the web for a category and saves them (analysis runs per competitor afterwards). */
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
    return Response.json(await discoverCompetitors({ ...parsed.data, productId: parsed.data.productId ?? null, user }));
  } catch (e) {
    return Response.json({ error: errorMessage(e) }, { status: e instanceof UserFacingError ? 400 : 500 });
  }
}
