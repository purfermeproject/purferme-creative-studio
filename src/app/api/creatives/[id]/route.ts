import { z } from "zod";
import { authErrorStatus, requireRole } from "@/auth";
import { errorMessage } from "@/lib/ai";
import { ConflictError, saveContent } from "@/lib/creative-store";
import { SnapshotSchema } from "@/lib/versions";

const Body = z.object({ baseRevision: z.number().int().min(1), snapshot: SnapshotSchema });

/**
 * Autosave. A route (not a server action) so the browser can send the last
 * edit with keepalive while the tab closes. 409 = edited elsewhere.
 */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let user: string;
  try {
    ({ user } = await requireRole("edit"));
  } catch (e) {
    return Response.json({ error: errorMessage(e) }, { status: authErrorStatus(e) });
  }
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: "Unknown ad." }, { status: 404 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const i = parsed.error.issues[0];
    return Response.json({ error: `Couldn't save: ${i.path.join(".")}: ${i.message}` }, { status: 400 });
  }
  try {
    const res = await saveContent({ id, baseRevision: parsed.data.baseRevision, snapshot: parsed.data.snapshot, user });
    return Response.json(res);
  } catch (e) {
    if (e instanceof ConflictError) return Response.json({ error: e.message, current: e.current }, { status: 409 });
    return Response.json({ error: errorMessage(e) }, { status: 500 });
  }
}
