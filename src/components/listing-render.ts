import { comparisonLayout, sceneLayout } from "@/lib/ad-layout";
import type { BrandKit } from "@/lib/brand-kit";
import type { Slide } from "@/lib/listing-plan";
import { sceneSpec, slideStyle } from "@/lib/scene-spec";
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

const INK = "#2a1b38";
const CREAM = "255,251,244";
const GREEN = "#3f8a3a";
const RED = "#c0392b";

// ── Icons ─────────────────────────────────────────────────────────────────────
// Line pictograms on a 24×24 grid, drawn in the brand colour. Picked by keywords in each feature.
type Icon = "palm" | "drop" | "flask" | "cube" | "dumbbell" | "grain" | "cookie" | "tiffin" | "qr" | "leaf";
const PATHS: Partial<Record<Icon, string[]>> = {
  drop: ["M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"],
  flask: ["M10 2v7.527a2 2 0 0 1-.211.896L4.72 20.55a1 1 0 0 0 .9 1.45h12.76a1 1 0 0 0 .9-1.45l-5.069-10.127A2 2 0 0 1 14 9.527V2", "M8.5 2h7", "M7 16h10"],
  cube: ["M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z", "M12 22V12", "M3.3 7l8.7 5 8.7-5"],
  leaf: ["M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z", "M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"],
  palm: ["M12 22V11", "M12 11C10 7 6 6 3 7", "M12 11c2-4 6-5 9-4", "M12 11c-1-4-4-7-8-8", "M12 11c1-4 4-7 8-8", "M8 22h8"],
  dumbbell: ["M6 6v12", "M18 6v12", "M3 9v6", "M21 9v6", "M6 12h12"],
  grain: ["M12 22V6", "M12 6c-2-1-3-3-3-4 2 0 3 2 3 4z", "M12 11c-3-1-4-3-4-5 2 0 4 2 4 5z", "M12 11c3-1 4-3 4-5-2 0-4 2-4 5z", "M12 16c-3-1-4-3-4-5 2 0 4 2 4 5z", "M12 16c3-1 4-3 4-5-2 0-4 2-4 5z"],
  cookie: ["M12 3a9 9 0 1 0 9 9 4 4 0 0 1-5-5 4 4 0 0 1-4-4z", "M8.5 9.5h.01", "M7 14h.01", "M12 16h.01", "M15.5 13h.01"],
  tiffin: ["M4 9h16v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z", "M4 9a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2", "M9 7V5a3 3 0 0 1 6 0v2", "M4 14h16"],
  qr: ["M3 3h7v7H3z", "M14 3h7v7h-7z", "M3 14h7v7H3z", "M14 14h3v3h-3z", "M20 14v7", "M14 20h3"],
};

export function iconFor(text: string): Icon {
  const t = text.toLowerCase();
  if (/palm/.test(t)) return "palm";
  if (/preserv|stabil|artificial|chemical|additive|colour|color/.test(t)) return "flask";
  if (/hydrogen|trans fat|\bfat\b|\boil\b/.test(t)) return "drop";
  if (/sugar|jaggery|sweet/.test(t)) return "cube";
  if (/protein/.test(t)) return "dumbbell";
  if (/fib(re|er)|millet|\boats?\b|ragi|grain|wheat|maida/.test(t)) return "grain";
  if (/cookie|biscuit|\d+\s*cookies/.test(t)) return "cookie";
  if (/tiffin|carry|travel|lunch|pack\b|\bg pack|\d+\s?g\b/.test(t)) return "tiffin";
  if (/\bqr\b|trace|farm|scan/.test(t)) return "qr";
  if (/cream|spread|smooth|texture/.test(t)) return "drop";
  return "leaf";
}

const negative = (t: string) => /^(no|0\s?%|0\s?g|zero|without|free from)\b/i.test(t.trim());

/** A round line icon; negatives ("No Palm Oil") get a strike through it. */
function drawIcon(ctx: CanvasRenderingContext2D, label: string, cx: number, cy: number, r: number, colour: string) {
  ctx.save();
  ctx.strokeStyle = colour;
  ctx.lineWidth = Math.max(2, r * 0.07);
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  const icon = iconFor(label);
  const k = (r * 1.1) / 24;
  ctx.translate(cx - 12 * k, cy - 12 * k);
  ctx.scale(k, k);
  ctx.lineWidth = 1.7;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const d of PATHS[icon] ?? PATHS.leaf!) ctx.stroke(new Path2D(d));
  ctx.restore();
  if (negative(label)) {
    ctx.save();
    ctx.strokeStyle = colour;
    ctx.lineWidth = Math.max(2, r * 0.08);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.68, cy + r * 0.68);
    ctx.lineTo(cx + r * 0.68, cy - r * 0.68);
    ctx.stroke();
    ctx.restore();
  }
}

/** ✓ and ✗ as drawn marks (fonts don't all have them). */
function mark(ctx: CanvasRenderingContext2D, yes: boolean, cx: number, cy: number, size: number) {
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (yes) {
    ctx.strokeStyle = GREEN;
    ctx.lineWidth = size * 0.22;
    ctx.beginPath();
    ctx.moveTo(cx - size * 0.45, cy);
    ctx.lineTo(cx - size * 0.1, cy + size * 0.35);
    ctx.lineTo(cx + size * 0.5, cy - size * 0.4);
    ctx.stroke();
  } else {
    ctx.fillStyle = RED;
    ctx.beginPath();
    ctx.arc(cx, cy, size * 0.55, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = size * 0.14;
    ctx.beginPath();
    ctx.moveTo(cx - size * 0.22, cy - size * 0.22);
    ctx.lineTo(cx + size * 0.22, cy + size * 0.22);
    ctx.moveTo(cx + size * 0.22, cy - size * 0.22);
    ctx.lineTo(cx - size * 0.22, cy + size * 0.22);
    ctx.stroke();
  }
  ctx.restore();
}
const isYes = (v: string) => /^(✓|✔|yes|y|true)$/i.test(v.trim());
const isNo = (v: string) => /^(✗|✘|×|x|no|n|false|-)$/i.test(v.trim());

/**
 * Wraps text into lines that each fit maxW, shrinking the size until it takes at most maxLines (long words
 * too). Never drops words: the team's wording is shown in full, even if that means one more line.
 */
export function fit(ctx: CanvasRenderingContext2D, text: string, maxW: number, maxLines: number, size: number, font: (px: number) => string, minSize = size * 0.5) {
  let px = size;
  for (;;) {
    ctx.font = font(px);
    const lines = wrap(ctx, text, maxW);
    if ((lines.length <= maxLines && lines.every((l) => ctx.measureText(l).width <= maxW)) || px <= minSize) return { lines, size: px };
    px = Math.max(minSize, Math.floor(px * 0.92));
  }
}

// ── Headline ──────────────────────────────────────────────────────────────────

/** Header (serif, brand colour), sub-header, a hand-drawn underline and three little "spark" strokes. */
function headline(
  ctx: CanvasRenderingContext2D,
  o: { header: string; sub: string; left: number; top: number; width: number; size: number; colour: string; serif: string; sans: string; centred?: boolean; maxBottom: number },
) {
  ctx.textBaseline = "top";
  // Shrink header and sub-header together until the block (with its underline) ends above maxBottom.
  let size = o.size;
  let hLines: string[] = [];
  let sLines: string[] = [];
  let subSize = 0;
  let blockH = 0;
  for (;;) {
    subSize = Math.round(size * 0.46);
    // Every word of the header and sub-header, at whatever size fits.
    ctx.font = `800 ${size}px ${o.serif}`;
    hLines = wrap(ctx, unquote(o.header), o.width);
    ctx.font = `400 ${subSize}px ${o.sans}`;
    sLines = o.sub.trim() ? wrap(ctx, unquote(o.sub), o.width * 0.95) : [];
    blockH = hLines.length * size * 1.02 + (sLines.length ? subSize * 0.5 + sLines.length * subSize * 1.22 : 0) + subSize * 1.1;
    if (o.top + blockH <= o.maxBottom || size <= o.size * 0.5) break;
    size = Math.floor(size * 0.94);
  }

  // A soft cream glow behind the words keeps them readable on any photo.
  const glow = ctx.createRadialGradient(o.left + o.width * (o.centred ? 0.5 : 0.35), o.top + blockH / 2, 0, o.left + o.width * (o.centred ? 0.5 : 0.35), o.top + blockH / 2, o.width * 0.75);
  glow.addColorStop(0, `rgba(${CREAM},0.72)`);
  glow.addColorStop(0.6, `rgba(${CREAM},0.45)`);
  glow.addColorStop(1, `rgba(${CREAM},0)`);
  ctx.fillStyle = glow;
  ctx.fillRect(o.left - o.width * 0.3, o.top - size, o.width * 1.6, blockH + size * 2);

  const x = o.centred ? o.left + o.width / 2 : o.left;
  ctx.textAlign = o.centred ? "center" : "left";
  let y = o.top;
  ctx.fillStyle = o.colour;
  ctx.font = `800 ${size}px ${o.serif}`;
  const firstW = ctx.measureText(hLines[0] ?? "").width;
  for (const l of hLines) {
    ctx.fillText(l, x, y);
    y += size * 1.02;
  }
  // Sparks beside the first line.
  const sx = o.centred ? x + firstW / 2 + size * 0.25 : o.left - size * 0.55;
  const sy = o.top + size * 0.15;
  ctx.strokeStyle = o.colour;
  ctx.lineWidth = Math.max(3, size * 0.06);
  ctx.lineCap = "round";
  for (const [a, b, c, d] of [
    [0, 0.1, 0.35, 0.25],
    [-0.05, 0.45, 0.35, 0.45],
    [0, 0.8, 0.35, 0.65],
  ]) {
    ctx.beginPath();
    ctx.moveTo(sx + a * size, sy + b * size);
    ctx.lineTo(sx + c * size, sy + d * size);
    ctx.stroke();
  }
  if (sLines.length) {
    y += subSize * 0.5;
    ctx.fillStyle = INK;
    ctx.font = `400 ${subSize}px ${o.sans}`;
    for (const l of sLines) {
      ctx.fillText(l, x, y);
      y += subSize * 1.22;
    }
  }
  // Hand-drawn underline.
  const uw = o.width * 0.42;
  const ux = o.centred ? x - uw / 2 : o.left + o.width * 0.1;
  const uy = y + subSize * 0.55;
  ctx.strokeStyle = o.colour;
  ctx.lineWidth = Math.max(3, size * 0.055);
  ctx.beginPath();
  ctx.moveTo(ux, uy + size * 0.06);
  ctx.quadraticCurveTo(ux + uw * 0.5, uy - size * 0.1, ux + uw, uy + size * 0.02);
  ctx.stroke();
  ctx.textAlign = "left";
}

/** The feature parts to show: crossed-out items from the photo description ("No maida") first, then the feature. */
export function featureItems(slide: Slide): string[] {
  const spec = sceneSpec(slide.scene);
  const parts = slide.feature
    .split("|")
    .map((x) => x.trim())
    .filter(Boolean);
  const crossed = spec.crossed.map((c) => `No ${c}`);
  const seen = new Set<string>();
  return [...crossed, ...parts].filter((p) => {
    const k = p.toLowerCase().replace(/^(no|0\s?%)\s+/, "");
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/**
 * The words, icons and table on a listing slide, in the style of the team's examples: serif header top
 * left, the feature as an icon list on a cream card (or a pill bar along the bottom), a hand-drawn tip
 * label, or the comparison table. Saved as "Listing slide N".
 */
export async function finishSlide(opts: {
  baseUrl: string;
  kit: BrandKit;
  slide: Slide;
  slot: number;
  panel: string;
  generic?: { shape: "jar" | "box"; labelY: number; width: number } | null;
}): Promise<{ id: string; url: string }> {
  const base = await loadImage(opts.baseUrl);
  await Promise.all([loadBrandFont(opts.kit.headingFont), loadBrandFont(opts.kit.bodyFont)]);
  const S = base.naturalWidth;
  const c = document.createElement("canvas");
  c.width = S;
  c.height = S;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("Couldn't draw the slide.");
  ctx.drawImage(base, 0, 0, S, S);
  const sans = `"${opts.kit.headingFont.name}", sans-serif`;
  const serif = `"${opts.kit.bodyFont.name}", Georgia, serif`;
  const colour = opts.panel;
  const s = opts.slide;

  if (s.kind === "comparison" && s.comparison) {
    const C = comparisonLayout(S);
    headline(ctx, { header: s.header, sub: s.sub, left: C.header.left, top: C.header.top, width: C.header.width, size: Math.round(S * 0.072), colour, serif, sans, centred: true, maxBottom: C.table.top - S * 0.02 });
    // The generic name on the plain container's label.
    if (opts.generic) {
      const size = Math.round(S * 0.026);
      ctx.font = `800 ${size}px ${serif}`;
      ctx.fillStyle = colour;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const lines = wrap(ctx, s.comparison.them, opts.generic.width * 0.86).slice(0, 3);
      lines.forEach((l, i) => ctx.fillText(l, C.them.cx, opts.generic!.labelY + (i - (lines.length - 1) / 2) * size * 1.15));
    }
    const T = C.table;
    const rows = s.comparison.rows.slice(0, 6);
    const rowH = T.height / Math.max(rows.length, 1);
    const colW = [T.width * 0.38, T.width * 0.24, T.width * 0.38];
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.18)";
    ctx.shadowBlur = S * 0.02;
    ctx.fillStyle = `rgba(${CREAM},0.97)`;
    ctx.beginPath();
    ctx.roundRect(T.left, T.top, T.width, T.height, S * 0.02);
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(T.left, T.top, T.width, T.height, S * 0.02);
    ctx.clip();
    ctx.fillStyle = "rgba(63,138,58,0.09)";
    ctx.fillRect(T.left, T.top, colW[0], T.height);
    ctx.fillStyle = "rgba(192,57,43,0.08)";
    ctx.fillRect(T.left + colW[0] + colW[1], T.top, colW[2], T.height);
    ctx.restore();
    const txt = Math.round(Math.min(rowH * 0.2, S * 0.024));
    rows.forEach((r, i) => {
      const top = T.top + i * rowH;
      const cy = top + rowH / 2;
      if (i) {
        ctx.strokeStyle = "rgba(42,27,56,0.12)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(T.left, top);
        ctx.lineTo(T.left + T.width, top);
        ctx.stroke();
      }
      const topic = r.label.replace(/^(no|made with|has|with)\s+/i, "").replace(/^\w/, (m) => m.toUpperCase());
      // Ours: ✓ and the good wording; middle: icon and topic; theirs: ✗ and their value if written.
      mark(ctx, !isNo(r.us), T.left + txt * 1.6, cy, txt * 1.4);
      ctx.fillStyle = INK;
      ctx.font = `700 ${txt}px ${sans}`;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      const ours = isYes(r.us) || isNo(r.us) ? r.label.replace(/^\w/, (m) => m.toUpperCase()) : `${r.us} ${topic}`;
      const o = fit(ctx, ours, colW[0] - txt * 3.6, 2, txt, (px) => `700 ${px}px ${sans}`);
      ctx.font = `700 ${o.size}px ${sans}`;
      o.lines.forEach((l, k) => ctx.fillText(l, T.left + txt * 3.1, cy + (k - (o.lines.length - 1) / 2) * o.size * 1.15));
      const mx = T.left + colW[0] + colW[1] / 2;
      drawIcon(ctx, topic, mx, cy - txt * 0.6, txt * 1.05, colour);
      const m = fit(ctx, topic, colW[1] * 0.9, 1, Math.round(txt * 0.8), (px) => `600 ${px}px ${sans}`);
      ctx.font = `600 ${m.size}px ${sans}`;
      ctx.textAlign = "center";
      ctx.fillText(m.lines[0] ?? topic, mx, cy + txt * 1.15);
      const tx = T.left + colW[0] + colW[1];
      mark(ctx, isYes(r.them), tx + txt * 1.6, cy, txt * 1.4);
      if (!isYes(r.them) && !isNo(r.them)) {
        ctx.font = `700 ${txt}px ${sans}`;
        ctx.textAlign = "left";
        ctx.fillStyle = INK;
        const t = fit(ctx, r.them, colW[2] - txt * 3.6, 2, txt, (px) => `700 ${px}px ${sans}`);
        ctx.font = `700 ${t.size}px ${sans}`;
        t.lines.forEach((l, k) => ctx.fillText(l, tx + txt * 3.1, cy + (k - (t.lines.length - 1) / 2) * t.size * 1.15));
      }
    });
  } else {
    const style = slideStyle(s);
    const L = sceneLayout(S, style);
    headline(ctx, { header: s.header, sub: s.sub, left: L.header.left, top: L.header.top, width: L.header.width, size: Math.round(S * 0.07), colour, serif, sans, maxBottom: L.pack.top - S * 0.015 });
    const items = featureItems(s);
    if (style === "card" && items.length) {
      const C = L.card;
      const list = items.slice(0, 5);
      const rowH = C.height / list.length;
      const r = Math.min(rowH * 0.3, S * 0.042);
      const txt = Math.round(Math.min(rowH * 0.2, S * 0.028));
      ctx.save();
      ctx.fillStyle = `rgba(${CREAM},0.86)`;
      ctx.beginPath();
      ctx.roundRect(C.left, C.top, C.width, C.height, S * 0.03);
      ctx.fill();
      ctx.restore();
      list.forEach((item, i) => {
        const cy = C.top + rowH * i + rowH / 2;
        if (i) {
          ctx.strokeStyle = "rgba(42,27,56,0.25)";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(C.left + C.width * 0.35, C.top + rowH * i);
          ctx.lineTo(C.left + C.width * 0.88, C.top + rowH * i);
          ctx.stroke();
        }
        drawIcon(ctx, item, C.left + C.width * 0.06 + r, cy, r, colour);
        ctx.fillStyle = INK;
        ctx.font = `800 ${txt}px ${sans}`;
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        const tx = C.left + C.width * 0.06 + r * 2 + txt * 0.8;
        const f = fit(ctx, item, C.left + C.width - tx - C.width * 0.05, 3, txt, (px) => `800 ${px}px ${sans}`);
        ctx.font = `800 ${f.size}px ${sans}`;
        f.lines.forEach((l, k) => ctx.fillText(l, tx, cy + (k - (f.lines.length - 1) / 2) * f.size * 1.15));
      });
    } else if (items.length) {
      const B = L.bar;
      const list = items.slice(0, 3);
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.15)";
      ctx.shadowBlur = S * 0.015;
      ctx.fillStyle = `rgba(${CREAM},0.95)`;
      ctx.beginPath();
      ctx.roundRect(B.left, B.top, B.width, B.height, B.height / 2);
      ctx.fill();
      ctx.restore();
      const cw = B.width / list.length;
      const r = B.height * 0.34;
      const room = cw - cw * 0.08 - r * 2 - cw * 0.06;
      // One size for the whole bar: the largest that lets every item fit in two lines.
      const txt = Math.min(...list.map((item) => fit(ctx, item, room, 2, Math.round(Math.min(B.height * 0.22, S * 0.026)), (px) => `800 ${px}px ${sans}`).size));
      list.forEach((item, i) => {
        const x0 = B.left + cw * i;
        const cy = B.top + B.height / 2;
        if (i) {
          ctx.strokeStyle = "rgba(42,27,56,0.2)";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(x0, B.top + B.height * 0.25);
          ctx.lineTo(x0, B.top + B.height * 0.75);
          ctx.stroke();
        }
        drawIcon(ctx, item, x0 + cw * 0.08 + r, cy, r, colour);
        ctx.fillStyle = INK;
        ctx.font = `800 ${txt}px ${sans}`;
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        const tx = x0 + cw * 0.08 + r * 2 + txt * 0.7;
        ctx.font = `800 ${txt}px ${sans}`;
        const lines = fit(ctx, item, x0 + cw - tx - cw * 0.04, 2, txt, (px) => `800 ${px}px ${sans}`, txt).lines;
        lines.forEach((l, k) => ctx.fillText(l, tx, cy + (k - (lines.length - 1) / 2) * txt * 1.15));
      });
    }
    const spec = sceneSpec(s.scene);
    if (spec.tip) {
      // A hand-written style label on a cream blob, with an arrow up towards the product.
      const size = Math.round(S * 0.04);
      ctx.font = `italic 700 ${size}px ${serif}`;
      const w = ctx.measureText(spec.tip).width + size * 1.6;
      const h = size * 1.9;
      const x = L.tip.x;
      const y = L.tip.y;
      ctx.fillStyle = `rgba(${CREAM},0.95)`;
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, h / 2);
      ctx.fill();
      ctx.fillStyle = colour;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(spec.tip, x + w / 2, y + h / 2);
      ctx.strokeStyle = colour;
      ctx.lineWidth = Math.max(3, size * 0.08);
      ctx.lineCap = "round";
      // From the label's left edge, curving up and left towards the product.
      const ax = x - size * 0.2;
      const ay = y + h * 0.4;
      const ex = x - size * 1.9;
      const ey = y - size * 1.4;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.quadraticCurveTo(ex + size * 0.2, ay, ex, ey);
      ctx.moveTo(ex, ey);
      ctx.lineTo(ex - size * 0.3, ey + size * 0.45);
      ctx.moveTo(ex, ey);
      ctx.lineTo(ex + size * 0.42, ey + size * 0.3);
      ctx.stroke();
      ctx.textAlign = "left";
    }
  }

  const blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", 0.92));
  if (!blob) throw new Error("Couldn't export the slide.");
  const a = await uploadAsset(blob, { kind: "listing", label: `Listing slide ${opts.slot}` }, `slide-${opts.slot}.jpg`);
  return { id: a.id, url: a.url };
}
