import { z } from "zod";
import { authErrorStatus, requireRole } from "@/auth";
import { errorMessage } from "@/lib/ai";
import { getProducts } from "@/lib/data";
import { fetchStore } from "@/lib/shopify";

export const maxDuration = 120;

const Body = z.object({ storeUrl: z.string().trim().min(3).max(200) });

/** Reads the live store's catalogue, colours and image background, and saves a snapshot. */
export async function POST(req: Request) {
  try {
    await requireRole("generate");
  } catch (e) {
    return Response.json({ error: errorMessage(e) }, { status: authErrorStatus(e) });
  }
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Enter your store's web address." }, { status: 400 });
  try {
    const ours = (await getProducts()).map((p) => ({ id: p.id, name: p.name }));
    const snapshot = await fetchStore(parsed.data.storeUrl, ours);
    return Response.json({ snapshot });
  } catch (e) {
    return Response.json({ error: errorMessage(e) }, { status: 400 });
  }
}
