import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { authErrorStatus, requireRole } from "@/auth";
import { db, schema } from "@/db";
import { errorMessage } from "@/lib/ai";

const Body = z.object({ assetId: z.string().uuid() });

/** Adds an image made in the browser (the key facts card with words, a lifestyle image) to a Shopify set. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRole("generate");
  } catch (e) {
    return Response.json({ error: errorMessage(e) }, { status: authErrorStatus(e) });
  }
  const { id } = await params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success || !/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: "Invalid request." }, { status: 400 });
  const [row] = await db
    .update(schema.shopifyListings)
    .set({ imageIds: sql`array_append(${schema.shopifyListings.imageIds}, ${parsed.data.assetId}::uuid)` })
    .where(eq(schema.shopifyListings.id, id))
    .returning({ id: schema.shopifyListings.id });
  if (!row) return Response.json({ error: "That Shopify set no longer exists." }, { status: 404 });
  return Response.json({ ok: true });
}
