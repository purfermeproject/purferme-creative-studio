import { z } from "zod";
import { currentUser } from "@/auth";
import { recordError } from "@/lib/error-log";

const Body = z.object({
  message: z.string().max(1000),
  where: z.string().max(300).default(""),
  detail: z.string().max(4000).default(""),
  digest: z.string().max(100).default(""),
});

/** An error a person hit in their browser, saved so the admins can see it. */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ ok: false }, { status: 400 });
  const user = await currentUser().catch(() => null);
  // Only signed-in team members can write to the log.
  if (!user) return Response.json({ ok: false }, { status: 401 });
  await recordError({ source: "browser", ...parsed.data, user });
  return Response.json({ ok: true });
}
