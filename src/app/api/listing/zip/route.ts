import { inArray } from "drizzle-orm";
import JSZip from "jszip";
import { requireUser } from "@/auth";
import { db, schema } from "@/db";
import { getProduct } from "@/lib/data";
import { LISTING_LABELS, LISTING_PLATFORMS, LISTING_SIZE, type ListingPlatform } from "@/lib/listing-plan";
import { getPlan } from "@/lib/listing-store";

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);

/** The whole image stack in upload order, plus the plan as text (header, sub-header, feature, alt text per image). */
export async function GET(req: Request) {
  try {
    await requireUser();
  } catch {
    return new Response("Sign in first.", { status: 401 });
  }
  const url = new URL(req.url);
  const productId = url.searchParams.get("productId") ?? "";
  const platform = url.searchParams.get("platform") as ListingPlatform;
  if (!/^[0-9a-f-]{36}$/i.test(productId) || !LISTING_PLATFORMS.includes(platform)) return new Response("Not found", { status: 404 });
  const [product, row] = await Promise.all([getProduct(productId), getPlan(productId, platform)]);
  if (!product || !row) return new Response("Not found", { status: 404 });

  const ids = Object.values(row.images);
  const assets = ids.length ? await db.select({ id: schema.assets.id, data: schema.assets.dataBase64 }).from(schema.assets).where(inArray(schema.assets.id, ids)) : [];
  const S = LISTING_SIZE[platform];
  const zip = new JSZip();
  const lines: string[] = [`${product.name} · ${LISTING_LABELS[platform]} image stack (${S}×${S})`, ""];
  const slots = ["main", ...row.plan.slides.map((_, i) => String(i + 1))];
  let n = 1;
  for (const slot of slots) {
    const a = assets.find((x) => x.id === row.images[slot]);
    const s = slot === "main" ? null : row.plan.slides[Number(slot) - 1];
    const name = `${String(n).padStart(2, "0")}-${slot === "main" ? "main" : slug(s!.header)}-${S}x${S}.jpg`;
    if (a) zip.file(name, Buffer.from(a.data, "base64"));
    lines.push(
      a ? `${String(n).padStart(2, "0")}. ${name}` : `${String(n).padStart(2, "0")}. (not made yet)`,
      slot === "main" ? `   Main image: the real pack on pure white. ${row.plan.main.note}` : `   ${s!.header} — ${s!.sub}\n   Feature: ${s!.feature}\n   Alt text: ${s!.header}. ${s!.sub}. ${product.name}.`,
      "",
    );
    n++;
  }
  zip.file("image-stack.txt", lines.join("\n"));
  const body = await zip.generateAsync({ type: "uint8array" });
  return new Response(body as unknown as BodyInit, {
    headers: { "content-type": "application/zip", "content-disposition": `attachment; filename="${slug(product.name)}-${platform}-images.zip"` },
  });
}
