import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import sharp, { type OverlayOptions } from "sharp";
import { db, schema } from "@/db";
import { UserFacingError } from "./ai";
import { preparePack } from "./pack-composite";
import { guessLinks, normaliseStoreUrl, parseProducts, parseThemeColors, rgbToHex, SHOPIFY_IMAGE, type ShopifyProduct, type StoreSnapshot } from "./shopify-parse";

/**
 * Shopify, the server part: reads the live store's public catalogue and home page, and composes
 * listing images from our real pack photos. SHOPIFY_FIXTURE_DIR (tests only) reads a saved store
 * from disk instead of the network.
 */

const FIXTURE = process.env.SHOPIFY_FIXTURE_DIR;
const UA = "PurFermeCreativeStudio/1.0 (+catalogue check)";

/** Only public web addresses: never this server, the local network or a bare IP. */
function assertPublicHost(origin: string) {
  const host = new URL(origin).hostname;
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal") || /^[\d.]+$/.test(host) || host.includes(":")) {
    throw new UserFacingError("Use your store's public web address, e.g. purferme.com.");
  }
}

async function getText(url: string): Promise<{ ok: boolean; status: number; text: string }> {
  if (FIXTURE) {
    const u = new URL(url);
    const file = u.pathname === "/" ? "home.html" : `${path.basename(u.pathname)}${u.searchParams.get("page") && u.searchParams.get("page") !== "1" ? `-${u.searchParams.get("page")}` : ""}`;
    try {
      return { ok: true, status: 200, text: await readFile(path.join(FIXTURE, file), "utf8") };
    } catch {
      return { ok: false, status: 404, text: "" };
    }
  }
  const res = await fetch(url, { headers: { "user-agent": UA, accept: "application/json,text/html" }, signal: AbortSignal.timeout(20_000), redirect: "follow" });
  return { ok: res.ok, status: res.status, text: await res.text() };
}

/** Bytes of an image on the store (Shopify's CDN can serve a smaller copy with ?width=). */
export async function loadStoreImage(src: string, width?: number): Promise<Buffer> {
  if (FIXTURE) return readFile(path.join(FIXTURE, path.basename(new URL(src, "https://fixture.test").pathname)));
  const url = new URL(src.startsWith("//") ? `https:${src}` : src);
  if (width) url.searchParams.set("width", String(width));
  const res = await fetch(url, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`image ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/** The colour around the edges of a product photo: what the store's image grid sits on. */
export async function edgeColour(image: Buffer): Promise<string> {
  const { data, info } = await sharp(image).flatten({ background: "#ffffff" }).resize(64, 64, { fit: "fill" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if (x > 2 && x < info.width - 3 && y > 2 && y < info.height - 3) continue;
      const i = (y * info.width + x) * 3;
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
      n++;
    }
  }
  return rgbToHex(r / n, g / n, b / n);
}

/** Reads the live store and saves a snapshot. Keeps the team's earlier product links. */
export async function fetchStore(input: string, ours: { id: string; name: string }[]): Promise<StoreSnapshot> {
  const origin = normaliseStoreUrl(input);
  if (!FIXTURE) assertPublicHost(origin);
  const products: ShopifyProduct[] = [];
  for (let page = 1; page <= 8; page++) {
    let res: Awaited<ReturnType<typeof getText>>;
    try {
      res = await getText(`${origin}/products.json?limit=250&page=${page}`);
    } catch {
      throw new UserFacingError(`Couldn't reach ${origin}. Check the address, or try again in a minute.`);
    }
    if (!res.ok) {
      if (page > 1) break;
      throw new UserFacingError(
        res.status === 404
          ? `${origin} didn't return a product list. Check it's your Shopify store's address (your own domain or the .myshopify.com one).`
          : `${origin} answered with an error (${res.status}). If the store is password-protected, turn the password off or use the .myshopify.com address.`,
      );
    }
    let batch: ShopifyProduct[];
    try {
      batch = parseProducts(JSON.parse(res.text));
    } catch {
      throw new UserFacingError(`${origin} didn't return a Shopify product list. Check it's your Shopify store's address.`);
    }
    products.push(...batch);
    if (batch.length < 250) break;
  }

  const home = await getText(`${origin}/`).catch(() => ({ ok: false, status: 0, text: "" }));
  const theme = parseThemeColors(home.ok ? home.text : "");

  // The background the current main images sit on (most common edge colour across products).
  const counts = new Map<string, number>();
  for (const p of products.slice(0, 8)) {
    const first = p.images[0];
    if (!first) continue;
    try {
      const c = await edgeColour(await loadStoreImage(first.src, 200));
      counts.set(c, (counts.get(c) ?? 0) + 1);
    } catch {
      // A missing image just doesn't count.
    }
  }
  const imageBackground = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "#ffffff";

  const [prev] = await db.select().from(schema.shopifyStore).where(eq(schema.shopifyStore.id, 1));
  const oldLinks = prev?.snapshot.storeUrl === origin ? prev.snapshot.links : {};
  const links: Record<string, string[]> = {};
  for (const p of products) links[p.handle] = oldLinks[p.handle] ?? guessLinks(p, ours);

  const snapshot: StoreSnapshot = { storeUrl: origin, fetchedAt: new Date().toISOString(), theme, imageBackground, products, links };
  await db
    .insert(schema.shopifyStore)
    .values({ id: 1, snapshot })
    .onConflictDoUpdate({ target: schema.shopifyStore.id, set: { snapshot, updatedAt: new Date() } });
  return snapshot;
}

export async function getStore(): Promise<StoreSnapshot | null> {
  const [row] = await db.select().from(schema.shopifyStore).where(eq(schema.shopifyStore.id, 1));
  return row?.snapshot ?? null;
}

export async function setLinks(handle: string, productIds: string[]) {
  const store = await getStore();
  if (!store) throw new UserFacingError("Fetch your store first.");
  if (!store.products.some((p) => p.handle === handle)) throw new UserFacingError("That product isn't in the last fetch. Fetch the store again.");
  const snapshot = { ...store, links: { ...store.links, [handle]: productIds } };
  await db.update(schema.shopifyStore).set({ snapshot, updatedAt: new Date() }).where(eq(schema.shopifyStore.id, 1));
  return snapshot;
}

type Area = { left: number; top: number; width: number; height: number };

/**
 * Our real packs (one, or several for a combo) standing in an area of a square image, on a plain
 * colour, with soft ground shadows. Packs are only scaled, never redrawn. A combo stands in a row,
 * slightly overlapping, the middle one in front.
 */
export async function packsOn(packs: Buffer[], background: string, area?: Area, size = SHOPIFY_IMAGE): Promise<Buffer> {
  const a = area ?? { left: 0, top: 0, width: size, height: size };
  const prepared = await Promise.all(packs.map(async (p) => (await preparePack(p)).source));
  const metas = await Promise.all(prepared.map((p) => sharp(p).metadata()));
  const n = prepared.length;
  // Heights: one pack fills ~78% of the area; in a combo the front one is largest.
  const front = n === 1 ? 0 : Math.floor((n - 1) / 2);
  const baseH = a.height * (n === 1 ? 0.78 : n === 2 ? 0.66 : 0.58);
  const sizes = metas.map((m, i) => {
    const hTarget = baseH * (i === front ? 1 : 0.9);
    const k = hTarget / (m.height ?? 1);
    return { w: Math.max(1, Math.round((m.width ?? 1) * k)), h: Math.max(1, Math.round((m.height ?? 1) * k)) };
  });
  // Fit the row inside the area (shrink if needed), overlapping each by 18% of its width.
  const overlap = 0.18;
  let rowW = sizes.reduce((s, z, i) => s + (i === 0 ? z.w : z.w * (1 - overlap)), 0);
  const maxW = a.width * 0.9;
  if (rowW > maxW) {
    const k = maxW / rowW;
    for (const z of sizes) {
      z.w = Math.round(z.w * k);
      z.h = Math.round(z.h * k);
    }
    rowW = maxW;
  }
  // Centre the group vertically (a touch low, so it stands rather than floats).
  const groupH = Math.max(...sizes.map((z) => z.h));
  const floor = Math.min(a.top + Math.round(a.height * 0.92), a.top + Math.round((a.height + groupH) / 2 + a.height * 0.03));
  let x = a.left + Math.round((a.width - rowW) / 2);
  const placed = sizes.map((z, i) => {
    const p = { left: Math.round(x), top: floor - z.h, ...z, i };
    x += z.w * (1 - overlap);
    return p;
  });
  // Back packs first, the front one last.
  const order = [...placed].sort((p, q) => Math.abs(q.i - front) - Math.abs(p.i - front));
  const layers: OverlayOptions[] = [];
  for (const p of order) {
    const sw = Math.round(p.w * 1.1);
    const sh = Math.max(10, Math.round(p.h * 0.06));
    const blur = Math.max(4, Math.round(sh * 0.5));
    const W = sw + blur * 4;
    const H = sh + blur * 4;
    const shadow = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><ellipse cx="${W / 2}" cy="${H / 2}" rx="${sw / 2}" ry="${sh / 2}" fill="black" fill-opacity="0.32"/></svg>`))
      .blur(blur)
      .png()
      .toBuffer();
    const sx = Math.round(p.left + p.w / 2 - W / 2);
    const sy = Math.round(floor - H / 2);
    if (sx >= 0 && sy >= 0 && sx + W <= size && sy + H <= size) layers.push({ input: shadow, left: sx, top: sy });
    layers.push({ input: await sharp(prepared[p.i]).resize(p.w, p.h, { fit: "fill", kernel: "lanczos3" }).png().toBuffer(), left: p.left, top: p.top });
  }
  return sharp({ create: { width: size, height: size, channels: 3, background } }).composite(layers).jpeg({ quality: 92, mozjpeg: true }).toBuffer();
}
