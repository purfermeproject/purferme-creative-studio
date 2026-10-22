import type { BrandKit } from "@/lib/brand-kit";
import type { StoreTheme } from "@/lib/shopify-parse";
import { loadBrandFont, uploadAsset } from "./fonts";
import { unquote, wrap } from "./overlay-render";

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Couldn't load the image."));
    img.src = src;
  });
}

/** Light or dark text for a background colour. */
function readableOn(bg: string, preferred: string): string {
  const n = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const lum = (h: string) => {
    const [r, g, b] = n(h).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contrast = (a: string, b: string) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  };
  if (/^#[0-9a-f]{6}$/i.test(bg) && /^#[0-9a-f]{6}$/i.test(preferred) && contrast(bg, preferred) >= 4.5) return preferred;
  return /^#[0-9a-f]{6}$/i.test(bg) && lum(bg) < 0.4 ? "#ffffff" : "#1b1424";
}

/**
 * The key facts card: the base (our packs on the left) with the product name and 3–4 facts on the
 * right, in the brand's fonts and the store's colours. Saved as "Shopify facts".
 */
export async function makeFactsCard(opts: { baseUrl: string; kit: BrandKit; theme: StoreTheme; background: string; title: string; facts: string[] }): Promise<{ id: string; url: string; label: string }> {
  const base = await loadImage(opts.baseUrl);
  await Promise.all([loadBrandFont(opts.kit.headingFont), loadBrandFont(opts.kit.bodyFont)]);
  const W = base.naturalWidth;
  const H = base.naturalHeight;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("Couldn't draw the facts.");
  ctx.drawImage(base, 0, 0, W, H);

  const ink = readableOn(opts.background, opts.theme.text);
  const accent = /^#[0-9a-f]{6}$/i.test(opts.theme.accent) ? opts.theme.accent : opts.kit.colors.accent;
  const head = `"${opts.kit.headingFont.name}", sans-serif`;
  const x = Math.round(W * 0.52);
  const maxW = Math.round(W * 0.42);
  const tSize = Math.round(W * 0.05);
  const fSize = Math.round(W * 0.036);
  ctx.textAlign = "left";
  ctx.textBaseline = "top";

  ctx.font = `800 ${tSize}px ${head}`;
  const tLines = wrap(ctx, unquote(opts.title), maxW).slice(0, 3);
  ctx.font = `600 ${fSize}px ${head}`;
  const fLines = opts.facts.slice(0, 4).map((f) => wrap(ctx, unquote(f), maxW - fSize * 1.4).slice(0, 2));
  const blockH = tLines.length * tSize * 1.1 + tSize * 0.8 + fLines.reduce((s, l) => s + l.length * fSize * 1.25 + fSize * 0.9, 0);
  let y = Math.max(H * 0.08, (H - blockH) / 2);

  ctx.fillStyle = ink;
  ctx.font = `800 ${tSize}px ${head}`;
  for (const l of tLines) {
    ctx.fillText(l, x, y);
    y += tSize * 1.1;
  }
  // A short accent rule under the name, then each fact with an accent marker.
  ctx.fillStyle = accent;
  ctx.fillRect(x, y + tSize * 0.25, W * 0.08, Math.max(6, W * 0.004));
  y += tSize * 0.8;
  ctx.font = `600 ${fSize}px ${head}`;
  for (const lines of fLines) {
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.arc(x + fSize * 0.35, y + fSize * 0.55, fSize * 0.28, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = ink;
    for (const l of lines) {
      ctx.fillText(l, x + fSize * 1.1, y);
      y += fSize * 1.25;
    }
    y += fSize * 0.9;
  }

  const blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", 0.92));
  if (!blob) throw new Error("Couldn't export the facts image.");
  const a = await uploadAsset(blob, { kind: "shopify", label: "Shopify facts" }, "facts.jpg");
  return { id: a.id, url: a.url, label: "Shopify facts" };
}
