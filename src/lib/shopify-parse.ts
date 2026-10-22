/**
 * Shopify, the pure part: reading a store's public catalogue (/products.json) and home page,
 * checking listings against Shopify's image guidance, and writing the import file. No network
 * here, so it can be tested with sample data.
 */

/** Shopify recommends square 2048×2048 product images (sharp zoom, consistent grid). */
export const SHOPIFY_IMAGE = 2048;

export type ShopifyImage = { src: string; width: number; height: number; alt: string; position: number };
export type ShopifyVariant = { title: string; sku: string; price: string; compareAtPrice: string; barcode: string; grams: number; available: boolean };
export type ShopifyProduct = {
  handle: string;
  title: string;
  bodyHtml: string;
  vendor: string;
  productType: string;
  tags: string[];
  variants: ShopifyVariant[];
  images: ShopifyImage[];
};
export type StoreTheme = { background: string; text: string; accent: string };
export type StoreSnapshot = {
  storeUrl: string;
  fetchedAt: string;
  theme: StoreTheme;
  /** Background colour of the store's current main product images, so new images match the grid. */
  imageBackground: string;
  products: ShopifyProduct[];
  /** Which of our products each Shopify product shows (several for a combo). */
  links: Record<string, string[]>;
};

/** "purferme.com/products/x" → "https://purferme.com". Throws a readable error for anything else. */
export function normaliseStoreUrl(input: string): string {
  const raw = input.trim();
  if (!raw) throw new Error("Enter your store's web address, e.g. purferme.com.");
  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    throw new Error(`“${raw}” isn't a web address. Enter it like purferme.com.`);
  }
  if (!u.hostname.includes(".")) throw new Error(`“${raw}” isn't a web address. Enter it like purferme.com.`);
  return `https://${u.hostname.toLowerCase()}`;
}

type RawProduct = {
  handle?: string;
  title?: string;
  body_html?: string | null;
  vendor?: string;
  product_type?: string;
  tags?: string[] | string;
  variants?: { title?: string; sku?: string | null; price?: string; compare_at_price?: string | null; barcode?: string | null; grams?: number; available?: boolean }[];
  images?: { src?: string; width?: number; height?: number; alt?: string | null; position?: number }[];
};

/** A page of Shopify's public /products.json. */
export function parseProducts(json: unknown): ShopifyProduct[] {
  const list = (json as { products?: RawProduct[] })?.products;
  if (!Array.isArray(list)) throw new Error("That address didn't return a Shopify product list. Check it's your Shopify store's address.");
  return list
    .filter((p) => p.handle && p.title)
    .map((p) => ({
      handle: p.handle!,
      title: p.title!.trim(),
      bodyHtml: p.body_html ?? "",
      vendor: p.vendor ?? "",
      productType: p.product_type ?? "",
      tags: (Array.isArray(p.tags) ? p.tags : (p.tags ?? "").split(",")).map((t) => t.trim()).filter(Boolean),
      variants: (p.variants ?? []).map((v) => ({
        title: v.title ?? "",
        sku: v.sku ?? "",
        price: v.price ?? "",
        compareAtPrice: v.compare_at_price ?? "",
        barcode: v.barcode ?? "",
        grams: v.grams ?? 0,
        available: v.available ?? true,
      })),
      images: (p.images ?? [])
        .filter((i) => i.src)
        .map((i, k) => ({ src: i.src!, width: i.width ?? 0, height: i.height ?? 0, alt: i.alt ?? "", position: i.position ?? k + 1 }))
        .sort((a, b) => a.position - b.position),
    }));
}

const hex = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
export const rgbToHex = (r: number, g: number, b: number) => `#${hex(r)}${hex(g)}${hex(b)}`;

/** A CSS colour value as #rrggbb: "#abc", "#aabbcc", "rgb(1,2,3)", or Shopify's bare "45, 27, 84". */
export function toHex(value: string): string | null {
  const v = value.trim().toLowerCase();
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(v);
  if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`;
  if (/^#[0-9a-f]{6}$/.test(v)) return v;
  if (/^#[0-9a-f]{8}$/.test(v)) return v.slice(0, 7);
  const nums = /^(?:rgba?\()?\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/.exec(v);
  if (nums) return rgbToHex(Number(nums[1]), Number(nums[2]), Number(nums[3]));
  return null;
}

/**
 * The store's colours from its home page: Shopify themes (Dawn and most others) set them as CSS
 * variables, e.g. --color-base-background-1: 255,255,255. Falls back to neutral defaults.
 */
export function parseThemeColors(html: string): StoreTheme {
  const vars = new Map<string, string>();
  for (const m of html.matchAll(/--([a-z0-9-]+)\s*:\s*([^;}{]+)[;}]/gi)) {
    const name = m[1].toLowerCase();
    const colour = toHex(m[2]);
    if (colour && !vars.has(name)) vars.set(name, colour);
  }
  const first = (...names: string[]) => names.map((n) => vars.get(n)).find(Boolean) ?? null;
  const metaTheme = /<meta[^>]+name=["']theme-color["'][^>]+content=["']([^"']+)["']/i.exec(html)?.[1];
  return {
    background: first("color-base-background-1", "color-background", "color-body-bg", "colors-background-1", "background") ?? "#ffffff",
    text: first("color-base-text", "color-foreground", "color-text", "color-body-text", "colors-text") ?? "#121212",
    accent:
      first("color-base-accent-1", "color-button", "color-base-solid-button-labels-bg", "color-accent", "color-primary", "colors-accent-1", "color-sale-price") ??
      (metaTheme ? toHex(metaTheme) : null) ??
      "#2d1b54",
  };
}

export type ImageIssue = { position: number; problem: string };

/** What to fix on a live listing, against Shopify's image guidance and basic listing hygiene. */
export function auditProduct(p: ShopifyProduct): { images: ImageIssue[]; listing: string[] } {
  const images: ImageIssue[] = [];
  for (const img of p.images) {
    if (img.width && img.height && img.width !== img.height) images.push({ position: img.position, problem: `not square (${img.width}×${img.height})` });
    if (img.width && Math.min(img.width, img.height) < SHOPIFY_IMAGE) images.push({ position: img.position, problem: `smaller than ${SHOPIFY_IMAGE}×${SHOPIFY_IMAGE} (zoom looks soft)` });
    if (!img.alt.trim()) images.push({ position: img.position, problem: "no alt text (screen readers and Google image search)" });
  }
  const listing: string[] = [];
  if (p.images.length < 4) listing.push(`only ${p.images.length} image${p.images.length === 1 ? "" : "s"} (aim for 5–7: pack, facts, ingredients, how to enjoy, lifestyle)`);
  const text = p.bodyHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  if (text.length < 300) listing.push("short description (under 300 characters)");
  if (p.title.length > 70) listing.push(`title is ${p.title.length} characters (Google shows about 70)`);
  if (!p.tags.length) listing.push("no tags (used for collections and site search)");
  if (p.variants.some((v) => !v.sku)) listing.push("a variant has no SKU");
  if (p.variants.some((v) => !v.barcode)) listing.push("a variant has no barcode (GTIN), which Google Shopping needs");
  return { images, listing };
}

/** Combos and multi-packs show several of our products in one listing. */
export function isCombo(p: Pick<ShopifyProduct, "title">): boolean {
  return /\b(combo|bundle|pack of \d+|\d+\s?(x|×)\s|trial pack|assorted|gift (box|hamper)|variety)\b/i.test(p.title);
}

const STOP = new Set(["the", "and", "with", "for", "pur", "ferme", "project", "purferme", "pack", "combo", "of"]);
const words = (s: string) =>
  new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9 ]+/g, " ")
      .split(/\s+/)
      .map((w) => (w.length > 3 && w.endsWith("s") ? w.slice(0, -1) : w))
      .filter((w) => w.length > 2 && !STOP.has(w)),
  );

/**
 * Our products a Shopify product most likely shows (best first). Words that set one of our products
 * apart ("chocolate", "ragi") count most; words every product shares ("millet", "cookie") barely count.
 */
export function guessLinks(p: Pick<ShopifyProduct, "title">, ours: { id: string; name: string }[]): string[] {
  const t = words(p.title);
  const sets = ours.map((o) => ({ id: o.id, w: words(o.name) }));
  const df = new Map<string, number>();
  for (const o of sets) for (const w of o.w) df.set(w, (df.get(w) ?? 0) + 1);
  const scored = sets
    .map((o) => {
      const shared = [...o.w].filter((x) => t.has(x));
      const distinctive = shared.filter((x) => (df.get(x) ?? 0) <= Math.max(1, Math.floor(sets.length / 3))).length;
      return { id: o.id, distinctive, score: distinctive + shared.length * 0.1 };
    })
    .filter((s) => s.distinctive > 0)
    .sort((a, b) => b.score - a.score);
  return isCombo(p) ? scored.map((s) => s.id).slice(0, 4) : scored.slice(0, 1).map((s) => s.id);
}

const csvCell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

export type ListingRow = { handle: string; title: string; bodyHtml: string; productType: string; tags: string[]; seoTitle: string; seoDescription: string };

/**
 * Shopify's product CSV with only the listing columns. Import it with "Overwrite products with
 * matching handles": the columns here are replaced, and images, prices and stock (not in the file)
 * are not touched.
 */
export function listingCsv(rows: ListingRow[]): string {
  const head = ["Handle", "Title", "Body (HTML)", "Type", "Tags", "SEO Title", "SEO Description"];
  const lines = rows.map((r) => [r.handle, r.title, r.bodyHtml, r.productType, r.tags.join(", "), r.seoTitle, r.seoDescription].map(csvCell).join(","));
  return [head.join(","), ...lines].join("\n") + "\n";
}
