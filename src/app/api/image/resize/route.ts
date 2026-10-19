import { z } from "zod";
import { authErrorStatus, requireRole } from "@/auth";
import { errorMessage } from "@/lib/ai";
import { IMAGE_SPECS } from "@/lib/image-specs";
import { resizeToAll } from "@/lib/images";
import { PLATFORMS } from "@/lib/types";

export const maxDuration = 120;

const Body = z.object({ assetId: z.string().uuid(), platform: z.enum(PLATFORMS), creativeId: z.string().uuid().nullable().optional() });

export async function POST(req: Request) {
  let user: string;
  try {
    ({ user } = await requireRole("generate"));
  } catch (e) {
    return Response.json({ error: errorMessage(e) }, { status: authErrorStatus(e) });
  }
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request. Refresh the page and try again." }, { status: 400 });
  try {
    const images = await resizeToAll({ ...parsed.data, specs: IMAGE_SPECS[parsed.data.platform], user });
    return Response.json({ images });
  } catch (e) {
    return Response.json({ error: errorMessage(e) }, { status: 500 });
  }
}
