import "server-only";
import { eq, inArray, sql } from "drizzle-orm";
import sharp from "sharp";
import { db, schema } from "@/db";

export type StoredAsset = { id: string; url: string; w: number | null; h: number | null; label: string };

const FONT_EXT: Record<string, string> = { ttf: "font/ttf", otf: "font/otf", woff: "font/woff", woff2: "font/woff2" };

/** Works out a safe MIME type, or null if the file isn't something we accept. */
export function acceptedMime(kind: string, fileName: string, declared: string): string | null {
  if (kind === "font") {
    const ext = fileName.toLowerCase().split(".").pop() ?? "";
    return FONT_EXT[ext] ?? null;
  }
  return ["image/png", "image/jpeg", "image/webp", "image/gif"].includes(declared) ? declared : null;
}

export async function storeAsset(opts: {
  data: Buffer;
  mime: string;
  kind: string;
  label?: string;
  user: string;
  frameIndex?: number | null;
  prompt?: string;
  model?: string;
  creativeId?: string | null;
}): Promise<StoredAsset> {
  let w: number | null = null;
  let h: number | null = null;
  if (opts.mime.startsWith("image/") && opts.mime !== "image/svg+xml") {
    try {
      const m = await sharp(opts.data).metadata();
      w = m.width ?? null;
      h = m.height ?? null;
    } catch {
      // Not decodable; keep dims unknown.
    }
  }
  const [row] = await db
    .insert(schema.assets)
    .values({
      mime: opts.mime,
      dataBase64: opts.data.toString("base64"),
      kind: opts.kind,
      label: opts.label ?? "",
      width: w,
      height: h,
      frameIndex: opts.frameIndex ?? null,
      prompt: opts.prompt ?? "",
      model: opts.model ?? "",
      createdBy: opts.user,
    })
    .returning({ id: schema.assets.id });
  if (opts.creativeId) await attachToCreative(opts.creativeId, row.id);
  return { id: row.id, url: `/api/assets/${row.id}`, w, h, label: opts.label ?? "" };
}

export async function attachToCreative(creativeId: string, assetId: string) {
  await db
    .update(schema.creatives)
    .set({ imageIds: sql`array_append(${schema.creatives.imageIds}, ${assetId}::uuid)`, updatedAt: new Date() })
    .where(eq(schema.creatives.id, creativeId));
}

/** Details for a list of image ids, in the same order (for galleries and storyboards). */
export async function assetInfo(ids: string[]) {
  if (ids.length === 0) return [];
  const rows = await db
    .select({ id: schema.assets.id, w: schema.assets.width, h: schema.assets.height, label: schema.assets.label, kind: schema.assets.kind, frameIndex: schema.assets.frameIndex })
    .from(schema.assets)
    .where(inArray(schema.assets.id, ids));
  const by = new Map(rows.map((r) => [r.id, r]));
  return ids.map((id) => {
    const r = by.get(id);
    return { id, url: `/api/assets/${id}`, w: r?.w ?? null, h: r?.h ?? null, label: r?.label ?? "", kind: r?.kind ?? "generated", frameIndex: r?.frameIndex ?? null };
  });
}
