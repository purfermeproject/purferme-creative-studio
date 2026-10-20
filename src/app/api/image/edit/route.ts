import { z } from "zod";
import { authErrorStatus, requireRole } from "@/auth";
import { errorMessage, UserFacingError } from "@/lib/ai";
import { editImage } from "@/lib/images";

export const maxDuration = 300;

const Body = z.object({
  assetId: z.string().uuid(),
  instruction: z.string().trim().min(3, "Describe the change, e.g. “make the background lighter”.").max(500),
  creativeId: z.string().uuid().nullable().optional(),
});

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
    const a = await editImage({ ...parsed.data, user });
    return Response.json(a);
  } catch (e) {
    return Response.json({ error: errorMessage(e) }, { status: e instanceof UserFacingError ? 400 : 500 });
  }
}
