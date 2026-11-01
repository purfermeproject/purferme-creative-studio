import { z } from "zod";
import { authErrorStatus, requireRole } from "@/auth";
import { errorMessage } from "@/lib/ai";
import { LISTING_PLATFORMS } from "@/lib/listing-plan";
import { setSlotImage } from "@/lib/listing-store";

const Body = z.object({ productId: z.string().uuid(), platform: z.enum(LISTING_PLATFORMS), slot: z.string().regex(/^(main|[1-9]|10)$/), assetId: z.string().uuid() });

/** Records a finished slide (the base with the words added in the browser). */
export async function POST(req: Request) {
  try {
    await requireRole("generate");
  } catch (e) {
    return Response.json({ error: errorMessage(e) }, { status: authErrorStatus(e) });
  }
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request." }, { status: 400 });
  const row = await setSlotImage(parsed.data.productId, parsed.data.platform, parsed.data.slot, parsed.data.assetId);
  if (!row) return Response.json({ error: "Make or load a plan first." }, { status: 404 });
  return Response.json({ images: row.images });
}
