import { z } from "zod";
import { authErrorStatus, requireRole } from "@/auth";
import { errorMessage } from "@/lib/ai";
import { setLinks } from "@/lib/shopify";

const Body = z.object({ handle: z.string().min(1).max(255), productIds: z.array(z.string().uuid()).max(8) });

/** Which of our products a store product shows (several for a combo). */
export async function POST(req: Request) {
  try {
    await requireRole("generate");
  } catch (e) {
    return Response.json({ error: errorMessage(e) }, { status: authErrorStatus(e) });
  }
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request. Refresh the page and try again." }, { status: 400 });
  try {
    const snapshot = await setLinks(parsed.data.handle, parsed.data.productIds);
    return Response.json({ links: snapshot.links });
  } catch (e) {
    return Response.json({ error: errorMessage(e) }, { status: 400 });
  }
}
