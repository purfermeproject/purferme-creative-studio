import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authErrorStatus, requireRole } from "@/auth";
import { db, schema } from "@/db";
import { errorMessage } from "@/lib/ai";
import { cleanBox, detectPackBox } from "@/lib/pack-detect";
import { packSource, savePackCrop } from "@/lib/pack-source";

export const maxDuration = 120;

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("detect") }),
  z.object({
    action: z.literal("crop"),
    sourceId: z.string().uuid(),
    box: z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() }),
  }),
]);

/** detect: where is the pack in the source photo? crop: save that rectangle as the pack photo. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let user: string;
  try {
    ({ user } = await requireRole("settings"));
  } catch (e) {
    return Response.json({ error: errorMessage(e) }, { status: authErrorStatus(e) });
  }
  const { id } = await params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success || !/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: "Invalid request." }, { status: 400 });
  try {
    if (parsed.data.action === "detect") {
      const src = await packSource(id);
      if (!src?.sourceId) return Response.json({ error: "Upload a pack photo first." }, { status: 400 });
      const [a] = await db.select({ data: schema.assets.dataBase64 }).from(schema.assets).where(eq(schema.assets.id, src.sourceId));
      const box = a ? await detectPackBox(Buffer.from(a.data, "base64"), user) : null;
      return Response.json({ sourceId: src.sourceId, sourceUrl: `/api/assets/${src.sourceId}`, box });
    }
    const box = cleanBox(parsed.data.box);
    if (!box) return Response.json({ error: "Draw a bigger box around the pack." }, { status: 400 });
    const cut = await savePackCrop({ productId: id, sourceId: parsed.data.sourceId, box, user, auto: false });
    revalidatePath("/", "layout");
    return Response.json(cut);
  } catch (e) {
    return Response.json({ error: errorMessage(e) }, { status: 500 });
  }
}
