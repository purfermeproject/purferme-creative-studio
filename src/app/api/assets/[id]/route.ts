import { eq } from "drizzle-orm";
import { requireUser } from "@/auth";
import { db, schema } from "@/db";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireUser();
  } catch {
    return new Response("Sign in first.", { status: 401 });
  }
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 });
  const [a] = await db.select({ mime: schema.assets.mime, data: schema.assets.dataBase64 }).from(schema.assets).where(eq(schema.assets.id, id));
  if (!a) return new Response("Not found", { status: 404 });
  const download = new URL(req.url).searchParams.has("download");
  const ext = a.mime === "image/svg+xml" ? "svg" : (a.mime.split("/")[1] ?? "png");
  return new Response(Buffer.from(a.data, "base64"), {
    headers: {
      "content-type": a.mime,
      "cache-control": "private, max-age=31536000, immutable",
      ...(download ? { "content-disposition": `attachment; filename="purferme-ad-${id.slice(0, 8)}.${ext}"` } : {}),
      // SVGs only come from our own mock; still sandbox them.
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
