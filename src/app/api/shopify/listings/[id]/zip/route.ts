import { eq, inArray } from "drizzle-orm";
import JSZip from "jszip";
import { requireUser } from "@/auth";
import { db, schema } from "@/db";
import { getStore } from "@/lib/shopify";
import { listingCsv, SHOPIFY_IMAGE } from "@/lib/shopify-parse";

/** Upload order on Shopify, and the file name part for each kind of image. */
const ORDER: [label: string, name: string][] = [
  ["Shopify main", "main"],
  ["Shopify facts", "key-facts"],
  ["Shopify lifestyle", "lifestyle"],
];

/** Everything to update one product on Shopify: images in upload order, the listing CSV and a paste-ready text file. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireUser();
  } catch {
    return new Response("Sign in first.", { status: 401 });
  }
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 });
  const [row] = await db.select().from(schema.shopifyListings).where(eq(schema.shopifyListings.id, id));
  if (!row) return new Response("Not found", { status: 404 });
  const assets = row.imageIds.length
    ? await db.select({ id: schema.assets.id, label: schema.assets.label, mime: schema.assets.mime, data: schema.assets.dataBase64 }).from(schema.assets).where(inArray(schema.assets.id, row.imageIds))
    : [];
  const store = await getStore();
  const current = store?.products.find((p) => p.handle === row.handle);
  const L = row.listing;

  const zip = new JSZip();
  const files: string[] = [];
  let n = 1;
  for (const [label, name] of ORDER) {
    // The latest image of each kind (the facts base is only an ingredient, so it isn't included).
    const a = [...assets].reverse().find((x) => x.label === label || x.label?.startsWith(`${label} ·`));
    if (!a) continue;
    const file = `${row.handle}-${n}-${name}-${SHOPIFY_IMAGE}x${SHOPIFY_IMAGE}.jpg`;
    zip.file(file, Buffer.from(a.data, "base64"));
    files.push(`${n}. ${file}\n   Alt text: ${L.image_alts[n - 1] ?? L.title}`);
    n++;
  }
  zip.file(
    "listing.csv",
    listingCsv([{ handle: row.handle, title: L.title, bodyHtml: L.body_html, productType: L.product_type, tags: L.tags, seoTitle: L.seo_title, seoDescription: L.seo_description }]),
  );
  zip.file(
    "listing.txt",
    `Shopify product: ${current?.title ?? row.handle} (${row.handle})${store ? `\n${store.storeUrl}/products/${row.handle}` : ""}
${row.mock ? "\nSAMPLE TEXT (mock mode): don't publish.\n" : ""}
TITLE (${L.title.length}/70)
${L.title}

SEO TITLE (${L.seo_title.length}/70)
${L.seo_title}

SEO DESCRIPTION (${L.seo_description.length}/160)
${L.seo_description}

PRODUCT TYPE
${L.product_type}

TAGS
${L.tags.join(", ")}

DESCRIPTION (paste into the description box with the <> code view)
${L.body_html}

IMAGES (upload in this order, then add each alt text)
${files.join("\n")}

HOW TO UPDATE THE PRODUCT
Text: Shopify admin → Products → Import → choose listing.csv → tick "Overwrite products with matching handles". Only the columns in the file change (title, description, type, tags, SEO); prices, stock and images stay as they are. Try it on one product first.
Or paste the fields above into the product page by hand.
Images: open the product → Media → upload the images above in order → drag them to the top → add the alt text to each.
`,
  );
  const body = await zip.generateAsync({ type: "uint8array" });
  return new Response(body as unknown as BodyInit, {
    headers: { "content-type": "application/zip", "content-disposition": `attachment; filename="shopify-${row.handle}.zip"` },
  });
}
