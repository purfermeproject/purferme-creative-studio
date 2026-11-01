import { slideLayout } from "@/lib/ad-layout";
import type { BrandKit } from "@/lib/brand-kit";
import type { Slide } from "@/lib/listing-plan";
import { loadBrandFont, uploadAsset } from "./fonts";
import { wrap } from "./overlay-render";

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Couldn't load the image."));
    img.src = src;
  });
}

const INK = "#24183f";
const SOFT = "#5c5170";
const CREAM = "#f7f3ec";
const GREEN = "#2f6b3a";
const RED = "#a8261b";

function centred(ctx: CanvasRenderingContext2D, lines: string[], cx: number, y: number, lh: number) {
  ctx.textAlign = "center";
  for (const l of lines) {
    ctx.fillText(l, cx, y);
    y += lh;
  }
  return y;
}

/** ✓ and ✗ as drawn marks (fonts don't all have them), anything else as text. */
function cell(ctx: CanvasRenderingContext2D, value: string, cx: number, cy: number, size: number, head: string) {
  const v = value.trim();
  const yes = /^(✓|✔|yes|y|true)$/i.test(v);
  const no = /^(✗|✘|×|x|no|n|false|-)$/i.test(v);
  if (yes || no) {
    ctx.fillStyle = yes ? GREEN : RED;
    ctx.beginPath();
    ctx.arc(cx, cy, size * 0.62, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = size * 0.16;
    ctx.lineCap = "round";
    ctx.beginPath();
    if (yes) {
      ctx.moveTo(cx - size * 0.3, cy);
      ctx.lineTo(cx - size * 0.06, cy + size * 0.24);
      ctx.lineTo(cx + size * 0.32, cy - size * 0.22);
    } else {
      ctx.moveTo(cx - size * 0.24, cy - size * 0.24);
      ctx.lineTo(cx + size * 0.24, cy + size * 0.24);
      ctx.moveTo(cx + size * 0.24, cy - size * 0.24);
      ctx.lineTo(cx - size * 0.24, cy + size * 0.24);
    }
    ctx.stroke();
    return;
  }
  ctx.fillStyle = INK;
  ctx.font = `700 ${size}px ${head}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(v, cx, cy);
}

/**
 * The words on a listing slide, in the brand fonts: header and sub-header in the band, the ONE feature as
 * callout chips on the panel next to the pack, or the comparison table. Saved as "Listing slide N".
 */
export async function finishSlide(opts: { baseUrl: string; kit: BrandKit; slide: Slide; slot: number; panel: string }): Promise<{ id: string; url: string }> {
  const base = await loadImage(opts.baseUrl);
  await Promise.all([loadBrandFont(opts.kit.headingFont), loadBrandFont(opts.kit.bodyFont)]);
  const S = base.naturalWidth;
  const L = slideLayout(S);
  const c = document.createElement("canvas");
  c.width = S;
  c.height = S;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("Couldn't draw the slide.");
  ctx.drawImage(base, 0, 0, S, S);
  const head = `"${opts.kit.headingFont.name}", sans-serif`;
  const body = `"${opts.kit.bodyFont.name}", serif`;
  const s = opts.slide;

  // Header and sub-header, centred in the band.
  const hSize = Math.round(S * 0.062);
  const subSize = Math.round(S * 0.03);
  ctx.textBaseline = "top";
  ctx.font = `800 ${hSize}px ${head}`;
  const hLines = wrap(ctx, s.header.trim(), S * 0.88).slice(0, 2);
  ctx.font = `400 ${subSize}px ${body}`;
  const sLines = wrap(ctx, s.sub.trim(), S * 0.84).slice(0, 2);
  const blockH = hLines.length * hSize * 1.05 + subSize * 0.5 + sLines.length * subSize * 1.3;
  let y = Math.max(S * 0.025, (L.photo.top + S * 0.02 - blockH) / 2);
  ctx.fillStyle = opts.panel;
  ctx.font = `800 ${hSize}px ${head}`;
  y = centred(ctx, hLines, S / 2, y, hSize * 1.05) + subSize * 0.5;
  ctx.fillStyle = SOFT;
  ctx.font = `400 ${subSize}px ${body}`;
  centred(ctx, sLines, S / 2, y, subSize * 1.3);

  if (s.kind === "comparison" && s.comparison) {
    const T = L.comparison.table;
    const rows = s.comparison.rows.slice(0, 6);
    const nameSize = Math.round(S * 0.03);
    const nameY = L.comparison.packs.top + L.comparison.packs.height + S * 0.012;
    ctx.textBaseline = "top";
    ctx.font = `800 ${nameSize}px ${head}`;
    ctx.fillStyle = opts.panel;
    ctx.textAlign = "center";
    ctx.fillText(s.comparison.us, L.comparison.us, nameY);
    ctx.fillStyle = SOFT;
    ctx.fillText(s.comparison.them, L.comparison.them, nameY);
    const rowH = Math.min(T.height / Math.max(rows.length, 1), S * 0.075);
    const cellSize = Math.round(rowH * 0.42);
    rows.forEach((r, i) => {
      const top = T.top + i * rowH;
      if (i % 2 === 0) {
        ctx.fillStyle = CREAM;
        ctx.beginPath();
        ctx.roundRect(T.left, top, T.width, rowH, rowH * 0.25);
        ctx.fill();
      }
      ctx.fillStyle = INK;
      ctx.font = `600 ${cellSize}px ${head}`;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(wrap(ctx, r.label, L.comparison.us - T.left - S * 0.12)[0] ?? r.label, T.left + S * 0.025, top + rowH / 2);
      cell(ctx, r.us, L.comparison.us, top + rowH / 2, cellSize, head);
      cell(ctx, r.them, L.comparison.them, top + rowH / 2, cellSize, head);
    });
  } else {
    // The feature as chips on the panel, beside the pack: one line each, up to four.
    const C = L.callouts;
    const parts = s.feature
      .split("|")
      .map((x) => x.trim())
      .filter(Boolean)
      .slice(0, 4);
    let size = Math.round(S * 0.028);
    const pad = size * 0.7;
    const gap = size * 0.55;
    ctx.font = `700 ${size}px ${head}`;
    let chips = parts.map((p) => wrap(ctx, p, C.width - pad * 2).slice(0, 2));
    const height = () => chips.reduce((h, l) => h + l.length * size * 1.2 + pad * 1.2 + gap, -gap);
    while (height() > C.height && size > S * 0.016) {
      size -= 2;
      ctx.font = `700 ${size}px ${head}`;
      chips = parts.map((p) => wrap(ctx, p, C.width - pad * 2).slice(0, 2));
    }
    let cy = C.top + Math.max(0, (C.height - height()) / 2);
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    for (const lines of chips) {
      const w = Math.min(C.width, Math.max(...lines.map((l) => ctx.measureText(l).width)) + pad * 2);
      const h = lines.length * size * 1.2 + pad * 1.2;
      ctx.fillStyle = CREAM;
      ctx.beginPath();
      ctx.roundRect(C.left, cy, w, h, Math.min(h / 2, size));
      ctx.fill();
      ctx.fillStyle = opts.panel;
      let ty = cy + pad * 0.6;
      for (const l of lines) {
        ctx.fillText(l, C.left + pad, ty);
        ty += size * 1.2;
      }
      cy += h + gap;
    }
  }

  const blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", 0.92));
  if (!blob) throw new Error("Couldn't export the slide.");
  const a = await uploadAsset(blob, { kind: "listing", label: `Listing slide ${opts.slot}` }, `slide-${opts.slot}.jpg`);
  return { id: a.id, url: a.url };
}
