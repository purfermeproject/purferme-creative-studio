import { z } from "zod";
import { authErrorStatus, requireRole } from "@/auth";
import { db, schema } from "@/db";
import { errorMessage } from "@/lib/ai";
import { acceptedMime, storeAsset } from "@/lib/asset-store";
import { stackImages } from "@/lib/collage";

const MAX_BYTES = 8 * 1024 * 1024;
const Fields = z.object({
  brand: z.string().trim().min(1, "Add the competitor's brand name.").max(100),
  product: z.string().trim().max(150).default(""),
  channel: z.string().trim().max(60).default(""),
  adText: z.string().trim().max(5000).default(""),
  link: z
    .string()
    .trim()
    .max(1000)
    .default("")
    .refine((v) => !v || /^https?:\/\//i.test(v), "The link must start with http:// or https://."),
  notes: z.string().trim().max(2000).default(""),
  /** Which of our products it competes with ("" = all of them). */
  productId: z.union([z.string().uuid(), z.literal("")]).default(""),
});

/** Saves a competitor ad (text and/or screenshot). Analysis is a separate call. */
export async function POST(req: Request) {
  let user: string;
  try {
    ({ user } = await requireRole("edit"));
  } catch (e) {
    return Response.json({ error: errorMessage(e) }, { status: authErrorStatus(e) });
  }
  const fd = await req.formData().catch(() => null);
  if (!fd) return Response.json({ error: "Invalid form. Refresh and try again." }, { status: 400 });
  const parsed = Fields.safeParse(Object.fromEntries([...fd.entries()].filter(([, v]) => typeof v === "string")));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0].message }, { status: 400 });
  const files = fd.getAll("file").filter((f): f is File => f instanceof File && f.size > 0).slice(0, 6);
  const hasFile = files.length > 0;
  if (!hasFile && !parsed.data.adText) return Response.json({ error: "Paste the ad's text or upload a screenshot." }, { status: 400 });
  try {
    let imageAssetId: string | null = null;
    if (hasFile) {
      for (const file of files) {
        if (file.size > MAX_BYTES) return Response.json({ error: `${file.name} is over 8 MB.` }, { status: 400 });
        if (!acceptedMime("upload", file.name, file.type)) return Response.json({ error: "Use PNG, JPG, WebP or GIF screenshots." }, { status: 400 });
      }
      const buffers = await Promise.all(files.map(async (f) => Buffer.from(await f.arrayBuffer())));
      // Several screenshots are stacked into one image, since the breakdown reads one image.
      const data = buffers.length > 1 ? await stackImages(buffers) : buffers[0];
      const mime = buffers.length > 1 ? "image/jpeg" : acceptedMime("upload", files[0].name, files[0].type)!;
      imageAssetId = (await storeAsset({ data, mime, kind: "competitor", label: `Competitor: ${parsed.data.brand}`, user })).id;
    }
    const { productId, ...fields } = parsed.data;
    const [row] = await db
      .insert(schema.competitorAds)
      .values({ ...fields, imageAssetId, productId: productId || null, productIds: productId ? [productId] : [], createdBy: user })
      .returning({ id: schema.competitorAds.id });
    return Response.json({ id: row.id });
  } catch (e) {
    return Response.json({ error: errorMessage(e) }, { status: 500 });
  }
}
