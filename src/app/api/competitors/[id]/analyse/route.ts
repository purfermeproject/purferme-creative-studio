import { authErrorStatus, requireRole } from "@/auth";
import { errorMessage, UserFacingError } from "@/lib/ai";
import { analyseCompetitor } from "@/lib/competitors";

export const maxDuration = 300;

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  let user: string;
  try {
    ({ user } = await requireRole("generate"));
  } catch (e) {
    return Response.json({ error: errorMessage(e) }, { status: authErrorStatus(e) });
  }
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: "Unknown competitor ad." }, { status: 404 });
  try {
    return Response.json(await analyseCompetitor(id, user));
  } catch (e) {
    return Response.json({ error: errorMessage(e) }, { status: e instanceof UserFacingError ? 400 : 500 });
  }
}
