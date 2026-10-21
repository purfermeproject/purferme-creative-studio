import { eq } from "drizzle-orm";
import { authErrorStatus, requireRole } from "@/auth";
import { db, schema } from "@/db";
import { errorMessage } from "@/lib/ai";
import { acceptedMime, storeAsset } from "@/lib/asset-store";
import { stackImages } from "@/lib/collage";

const MAX_FILES = 6;
const MAX_BYTES = 8 * 1024 * 1024;

/** Screenshots of a competitor's running ads (e.g. from Meta Ad Library), stacked into one image for the breakdown. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let user: string;
  try {
    ({ user } = await requireRole("edit"));
  } catch (e) {
    return Response.json({ error: errorMessage(e) }, { status: authErrorStatus(e) });
  }
  const { id } = await params;
  const [row] = /^[0-9a-f-]{36}$/i.test(id) ? await db.select().from(schema.competitorAds).where(eq(schema.competitorAds.id, id)) : [];
  if (!row) return Response.json({ error: "That competitor no longer exists." }, { status: 404 });
  const fd = await req.formData().catch(() => null);
  const files = (fd?.getAll("files") ?? []).filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) return Response.json({ error: "Choose one or more screenshots." }, { status: 400 });
  if (files.length > MAX_FILES) return Response.json({ error: `Up to ${MAX_FILES} screenshots at a time.` }, { status: 400 });
  for (const f of files) {
    if (f.size > MAX_BYTES) return Response.json({ error: `${f.name} is over 8 MB.` }, { status: 400 });
    if (!acceptedMime("upload", f.name, f.type)) return Response.json({ error: `${f.name} isn't a PNG, JPG, WebP or GIF.` }, { status: 400 });
  }
  try {
    const collage = await stackImages(await Promise.all(files.map(async (f) => Buffer.from(await f.arrayBuffer()))));
    const asset = await storeAsset({ data: collage, mime: "image/jpeg", kind: "competitor", label: `Competitor ads: ${row.brand}`, user });
    const date = new Date().toISOString().slice(0, 10);
    await db
      .update(schema.competitorAds)
      .set({
        imageAssetId: asset.id,
        channel: row.channel.toLowerCase().includes("instagram") ? row.channel : [row.channel, "Instagram/Facebook ads"].filter(Boolean).join(", ").slice(0, 60),
        notes: `${row.notes ? `${row.notes}\n` : ""}${files.length} running ad${files.length > 1 ? "s" : ""} added from screenshots on ${date}.`.slice(0, 2000),
      })
      .where(eq(schema.competitorAds.id, id));
    return Response.json({ ok: true, imageUrl: asset.url });
  } catch (e) {
    return Response.json({ error: errorMessage(e) }, { status: 500 });
  }
}
