import { eq, inArray } from "drizzle-orm";
import JSZip from "jszip";
import { requireUser } from "@/auth";
import { db, schema } from "@/db";
import { conceptToText, creativeToConcept } from "@/lib/concepts";
import { loadReference } from "@/lib/images";
import { PLATFORM_LABELS } from "@/lib/types";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "ad";
const ext = (mime: string) => (mime === "image/jpeg" ? "jpg" : mime === "image/svg+xml" ? "svg" : (mime.split("/")[1] ?? "bin"));

/** Everything a video editor, agency or Canva user needs for one creative, in one ZIP. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireUser();
  } catch {
    return new Response("Sign in first.", { status: 401 });
  }
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 });
  const [row] = await db
    .select({ c: schema.creatives, productName: schema.products.name, packUrl: schema.products.packImageUrl })
    .from(schema.creatives)
    .leftJoin(schema.products, eq(schema.creatives.productId, schema.products.id))
    .where(eq(schema.creatives.id, id));
  if (!row) return new Response("Not found", { status: 404 });
  const c = row.c;
  const concept = creativeToConcept(c);

  const assets = c.imageIds.length
    ? await db.select().from(schema.assets).where(inArray(schema.assets.id, c.imageIds))
    : [];
  const byId = new Map(assets.map((a) => [a.id, a]));
  const ordered = c.imageIds.map((i) => byId.get(i)).filter((a): a is NonNullable<typeof a> => Boolean(a));

  const zip = new JSZip();
  const folder = slug(c.title);
  const root = zip.folder(folder)!;
  root.file("script.txt", conceptToText({ ...concept, platform: c.platform, scan: c.scanResult }));

  const imageNames: { name: string; frameIndex: number | null; label: string }[] = [];
  ordered.forEach((a, i) => {
    const scene = a.frameIndex != null ? `scene-${String(a.frameIndex + 1).padStart(2, "0")}` : `image-${String(i + 1).padStart(2, "0")}`;
    const dims = a.width && a.height ? `-${a.width}x${a.height}` : "";
    const textTag = a.kind === "overlay" ? "-with-text" : "";
    const name = `images/${scene}${textTag}${dims}-${a.id.slice(0, 6)}.${ext(a.mime)}`;
    root.file(name, Buffer.from(a.dataBase64, "base64"));
    imageNames.push({ name, frameIndex: a.frameIndex, label: a.label });
  });

  const pack = await loadReference(row.packUrl);
  if (pack) root.file(`pack-photo.${ext(pack.mime)}`, pack.data);

  // Printable storyboard: open in a browser and print to PDF.
  const best = (i: number) => {
    const forScene = imageNames.filter((n) => (n.frameIndex ?? 0) === i);
    return (forScene.filter((n) => n.label.includes("with text")).at(-1) ?? forScene.at(-1))?.name;
  };
  const rows = concept.frames
    .map(
      (f, i) => `<tr><td class="n">${i + 1}<br><small>${esc(f.slot)}</small></td><td class="img">${best(i) ? `<img src="${best(i)}">` : "<em>no image</em>"}</td>
<td><b>Visual</b><p>${esc(f.visual)}</p><b>On-screen</b><p>${esc(f.onscreen)}</p>${f.audio ? `<b>Audio</b><p>${esc(f.audio)}</p>` : ""}</td></tr>`,
    )
    .join("\n");
  root.file(
    "storyboard.html",
    `<!doctype html><html><head><meta charset="utf-8"><title>${esc(c.title)} – storyboard</title>
<style>body{font:14px/1.45 system-ui,sans-serif;margin:32px;color:#2b1d14}h1{margin:0}table{border-collapse:collapse;width:100%;margin-top:16px}
td{border:1px solid #ddd;vertical-align:top;padding:10px}td.n{width:70px;text-align:center;font-weight:700}td.img{width:220px}img{max-width:200px;max-height:300px;display:block}
p{margin:2px 0 8px}.meta{color:#666}@media print{body{margin:12mm}tr{break-inside:avoid}}</style></head><body>
<h1>${esc(c.title)}</h1>
<p class="meta">${esc(PLATFORM_LABELS[c.platform])}${c.placement ? ` · ${esc(c.placement)}` : ""} · ${esc(row.productName ?? "")} · ${esc(c.creativeType)} · ${esc(c.language)} · status: ${esc(c.status)}</p>
<p><b>Hook:</b> ${esc(c.hook)}</p>
<table>${rows}</table>
<h2>Copy</h2>
<p><b>Headline:</b> ${esc(c.copy.headline ?? "")}</p><p><b>Primary text:</b> ${esc(c.copy.body ?? "")}</p>
<p><b>Variant:</b> ${esc(c.copy.body_alt ?? "")}</p><p><b>CTA:</b> ${esc(c.copy.cta ?? "")}</p>
<p class="meta">Tip: open this file in a browser and use Print → Save as PDF.</p>
</body></html>`,
  );
  root.file(
    "README.txt",
    `${c.title}\n${PLATFORM_LABELS[c.platform]}${c.placement ? ` · ${c.placement}` : ""} · ${c.creativeType}\n\nscript.txt      full script, copy, claims and AI render prompt\nstoryboard.html scenes with images (print to PDF from a browser)\nimages/         every image, named by scene and pixel size ("-with-text" = brand text added)\n${pack ? "pack-photo.*    the product pack reference\n" : ""}\nStatus: ${c.status}. Only run ads marked Approved.\n`,
  );

  const buf = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  return new Response(new Uint8Array(buf), {
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="${folder}-handoff.zip"`,
      "cache-control": "no-store",
    },
  });
}
