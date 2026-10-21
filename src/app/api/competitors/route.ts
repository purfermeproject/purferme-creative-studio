import { z } from "zod";
import { authErrorStatus, requireRole } from "@/auth";
import { db, schema } from "@/db";
import { errorMessage } from "@/lib/ai";
import { acceptedMime, storeAsset } from "@/lib/asset-store";

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
  const file = fd.get("file");
  const hasFile = file instanceof File && file.size > 0;
  if (!hasFile && !parsed.data.adText) return Response.json({ error: "Paste the ad's text or upload a screenshot." }, { status: 400 });
  try {
    let imageAssetId: string | null = null;
    if (hasFile) {
      if (file.size > MAX_BYTES) return Response.json({ error: "That screenshot is over 8 MB." }, { status: 400 });
      const mime = acceptedMime("upload", file.name, file.type);
      if (!mime) return Response.json({ error: "Use a PNG, JPG, WebP or GIF screenshot." }, { status: 400 });
      imageAssetId = (await storeAsset({ data: Buffer.from(await file.arrayBuffer()), mime, kind: "competitor", label: `Competitor: ${parsed.data.brand}`, user })).id;
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
