import { z } from "zod";
import { requireUser } from "@/auth";
import { errorMessage } from "@/lib/ai";
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
    user = await requireUser();
  } catch (e) {
    return Response.json({ error: errorMessage(e) }, { status: 401 });
  }
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0].message }, { status: 400 });
  try {
    const a = await editImage({ ...parsed.data, user });
    return Response.json(a);
  } catch (e) {
    return Response.json({ error: errorMessage(e) }, { status: 500 });
  }
}
