import { z } from "zod";
import { authErrorStatus, requireRole } from "@/auth";
import { errorMessage } from "@/lib/ai";
import { acceptedMime, storeAsset } from "@/lib/asset-store";

const MAX_BYTES = 8 * 1024 * 1024;
const Meta = z.object({
  kind: z.enum(["overlay", "upload", "logo", "font", "edit", "resize", "shopify"]),
  label: z.string().max(120).optional(),
  creativeId: z.string().uuid().optional(),
  frameIndex: z.coerce.number().int().min(0).max(20).optional(),
});

/** Uploads a file (finished overlay, logo, font, designer artwork). */
export async function POST(req: Request) {
  let user: string;
  try {
    ({ user } = await requireRole("generate"));
  } catch (e) {
    return Response.json({ error: errorMessage(e) }, { status: authErrorStatus(e) });
  }
  const fd = await req.formData().catch(() => null);
  const file = fd?.get("file");
  if (!fd || !(file instanceof File) || file.size === 0) return Response.json({ error: "Choose a file first." }, { status: 400 });
  if (file.size > MAX_BYTES) return Response.json({ error: "That file is over 8 MB. Use a smaller one." }, { status: 400 });
  const meta = Meta.safeParse({
    kind: fd.get("kind"),
    label: fd.get("label") || undefined,
    creativeId: fd.get("creativeId") || undefined,
    frameIndex: fd.get("frameIndex") || undefined,
  });
  if (!meta.success) return Response.json({ error: "Invalid upload. Refresh the page and try again." }, { status: 400 });
  const mime = acceptedMime(meta.data.kind, file.name, file.type);
  if (!mime) {
    return Response.json(
      { error: meta.data.kind === "font" ? "Fonts must be .ttf, .otf, .woff or .woff2 files." : "Use a PNG, JPG, WebP or GIF image." },
      { status: 400 },
    );
  }
  try {
    const asset = await storeAsset({
      data: Buffer.from(await file.arrayBuffer()),
      mime,
      kind: meta.data.kind,
      label: meta.data.label,
      user,
      frameIndex: meta.data.frameIndex,
      creativeId: meta.data.creativeId,
    });
    return Response.json(asset);
  } catch (e) {
    return Response.json({ error: errorMessage(e) }, { status: 500 });
  }
}
