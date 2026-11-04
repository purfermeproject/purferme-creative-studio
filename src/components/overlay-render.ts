import { adLayout } from "@/lib/ad-layout";
import type { BrandKit } from "@/lib/brand-kit";

export type OverlayLayout = "band" | "top" | "centre" | "clean" | "none" | "scene";
export type LogoCorner = "top-left" | "top-right" | "bottom-left" | "bottom-right" | "none";

export type OverlayOptions = {
  layout: OverlayLayout;
  headline: string;
  sub: string;
  cta: string;
  showCta: boolean;
  logoCorner: LogoCorner;
  textScale: number; // 0.7–1.5
  bandOpacity: number; // 0–1
  /** Designed layout (photo + brand panel with the pack): the button sits on the panel, beside the pack. */
  ctaOnPanel?: boolean;
  /** Scene ads: auto picks white or dark from the photo behind the words; brand = the brand's main colour. */
  textColour?: TextColour;
};

export type TextColour = "auto" | "white" | "dark" | "brand";

/** White text when the photo behind the words is dark or busy (faces, a room); dark ink only on a calm, light area. */
export function pickTone(ctx: CanvasRenderingContext2D, r: { left: number; top: number; width: number; height: number }): "white" | "dark" {
  try {
    const d = ctx.getImageData(Math.max(0, r.left), Math.max(0, r.top), Math.max(1, r.width), Math.max(1, r.height)).data;
    let n = 0;
    let sum = 0;
    let sq = 0;
    for (let i = 0; i < d.length; i += 4 * 7) {
      const l = (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
      sum += l;
      sq += l * l;
      n++;
    }
    const mean = sum / n;
    const sd = Math.sqrt(Math.max(0, sq / n - mean * mean));
    return mean > 0.7 && sd < 0.16 ? "dark" : "white";
  } catch {
    return "white";
  }
}

/** Areas platforms cover with their own UI (fractions of height). Reels/Stories hide top 14% and bottom 20%. */
export function safeArea(w: number, h: number) {
  const tall = h / w >= 1.7;
  const side = Math.round(w * 0.06);
  return {
    x: side,
    y: Math.round(h * (tall ? 0.14 : 0.06)),
    w: w - side * 2,
    h: Math.round(h * (tall ? 1 - 0.14 - 0.2 : 0.88)),
  };
}

/** Hooks are often written in quotes (“…”); on the image they read better without them. */
export function unquote(s: string): string {
  return s.trim().replace(/^["“”'‘’]+|["“”'‘’]+$/g, "").trim();
}

export function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxW && line) {
        out.push(line);
        line = word;
      } else line = test;
    }
    if (line) out.push(line);
  }
  return out;
}

const hexToRgba = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

/** Draws the base image plus crisp brand text and logo at full resolution. */
export function drawOverlay(
  ctx: CanvasRenderingContext2D,
  base: CanvasImageSource,
  logo: HTMLImageElement | null,
  kit: BrandKit,
  o: OverlayOptions,
  W: number,
  H: number,
) {
  ctx.clearRect(0, 0, W, H);
  ctx.drawImage(base, 0, 0, W, H);
  if (o.layout === "scene") {
    drawSceneText(ctx, logo, kit, o, W, H);
    return;
  }
  const safe = safeArea(W, H);
  const short = Math.min(W, H);
  const hSize = Math.round(short * 0.085 * o.textScale);
  const sSize = Math.round(short * 0.042 * o.textScale);
  const cSize = Math.round(short * 0.038 * o.textScale);
  const pad = Math.round(short * 0.035);
  const head = `"${kit.headingFont.name}", sans-serif`;
  const body = `"${kit.bodyFont.name}", serif`;

  const panel = o.ctaOnPanel ? adLayout({ w: W, h: H }) : null;
  if (o.layout !== "none" && (o.headline.trim() || o.sub.trim() || o.showCta)) {
    // On a wide layout the text stays over the photo, clear of the panel on the right.
    const maxW = (panel?.kind === "right" ? panel.photo.width - safe.x : safe.w) - pad * 2;
    ctx.font = `800 ${hSize}px ${head}`;
    const hLines = o.headline.trim() ? wrap(ctx, unquote(o.headline), maxW) : [];
    ctx.font = `400 ${sSize}px ${body}`;
    // On a brand panel the second line sits on the panel beside the pack, not under the hook.
    const sLines = o.sub.trim() && !panel ? wrap(ctx, unquote(o.sub), maxW) : [];
    ctx.font = `700 ${cSize}px ${head}`;
    const ctaW = o.showCta && o.cta.trim() ? ctx.measureText(o.cta.trim()).width + cSize * 1.6 : 0;
    const ctaH = ctaW ? cSize * 2.1 : 0;
    const inBlock = ctaH && !panel;
    const blockH =
      hLines.length * hSize * 1.08 + (sLines.length ? sSize * 0.6 + sLines.length * sSize * 1.3 : 0) + (inBlock ? sSize * 0.8 + ctaH : 0);

    let top: number;
    if (o.layout === "top") top = safe.y + pad;
    else if (o.layout === "centre") top = H / 2 - blockH / 2;
    else top = safe.y + safe.h - pad - blockH;

    // Background behind the text so it stays readable on any photo.
    const fillW = panel?.kind === "right" ? panel.photo.width : W;
    if (o.layout === "band") {
      ctx.fillStyle = hexToRgba(kit.colors.band, o.bandOpacity);
      ctx.fillRect(0, top - pad, fillW, blockH + pad * 2);
    } else if (o.layout === "top" || o.layout === "centre") {
      const g = ctx.createLinearGradient(0, top - pad * 2, 0, top + blockH + pad * 2);
      g.addColorStop(0, hexToRgba(kit.colors.band, 0));
      g.addColorStop(0.25, hexToRgba(kit.colors.band, o.bandOpacity * 0.85));
      g.addColorStop(0.75, hexToRgba(kit.colors.band, o.bandOpacity * 0.85));
      g.addColorStop(1, hexToRgba(kit.colors.band, 0));
      ctx.fillStyle = g;
      ctx.fillRect(0, top - pad * 2, fillW, blockH + pad * 4);
    }

    const align = o.layout === "centre" ? "center" : "left";
    const x = align === "center" ? W / 2 : safe.x + pad;
    ctx.textAlign = align;
    ctx.textBaseline = "top";
    ctx.fillStyle = kit.colors.text;
    if (o.layout === "clean") {
      ctx.shadowColor = "rgba(0,0,0,0.55)";
      ctx.shadowBlur = Math.round(short * 0.02);
    }
    let y = top;
    ctx.font = `800 ${hSize}px ${head}`;
    for (const l of hLines) {
      ctx.fillText(l, x, y);
      y += hSize * 1.08;
    }
    if (sLines.length) {
      y += sSize * 0.6;
      ctx.font = `400 ${sSize}px ${body}`;
      for (const l of sLines) {
        ctx.fillText(l, x, y);
        y += sSize * 1.3;
      }
    }
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    if (panel && panel.kind === "bottom") {
      // Logo, then the ad's second line, large and readable, in the free part of the panel beside the pack.
      const t = panel.text;
      let ty = t.top;
      if (logo && o.logoCorner !== "none" && logo.naturalWidth) {
        const lw = Math.round(Math.min(t.width * 0.55, W * 0.2));
        const lh = Math.round((logo.naturalHeight / logo.naturalWidth) * lw);
        ctx.drawImage(logo, t.left, ty, lw, lh);
        ty += lh + pad * 0.6;
      }
      const size = Math.round(short * 0.05 * o.textScale);
      ctx.font = `700 ${size}px ${head}`;
      const lines = o.sub.trim() ? wrap(ctx, unquote(o.sub), t.width).slice(0, 3) : [];
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillStyle = kit.colors.text;
      for (const l of lines) {
        ctx.fillText(l, t.left, ty);
        ty += size * 1.15;
      }
      y = ty + size * 0.5;
    }
    if (ctaW) {
      let cx: number;
      if (panel) {
        // Under the second line beside the pack, or under the pack on a right-hand panel; accent colour so it shows on the panel.
        cx = panel.kind === "right" ? panel.panel.left + (panel.panel.width - ctaW) / 2 : panel.text.left;
        y = panel.kind === "right" ? Math.min(panel.floor + pad * 0.8, H - ctaH - pad) : Math.min(y, panel.floor - ctaH);
      } else {
        y += sSize * 0.8;
        cx = align === "center" ? W / 2 - ctaW / 2 : x;
      }
      ctx.fillStyle = panel ? kit.colors.accent : kit.colors.primary;
      const r = ctaH / 2;
      ctx.beginPath();
      ctx.roundRect(cx, y, ctaW, ctaH, r);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.font = `700 ${cSize}px ${head}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(o.cta.trim(), cx + ctaW / 2, y + ctaH / 2);
    }
  }

  if (logo && o.logoCorner !== "none" && logo.naturalWidth && (panel?.kind !== "bottom" || o.layout === "none")) {
    const lw = Math.round(W * 0.2);
    const lh = Math.round((logo.naturalHeight / logo.naturalWidth) * lw);
    const lx = o.logoCorner.endsWith("left") ? safe.x + pad * 0.5 : safe.x + safe.w - lw - pad * 0.5;
    const ly = o.logoCorner.startsWith("top") ? safe.y + pad * 0.5 : safe.y + safe.h - lh - pad * 0.5;
    ctx.drawImage(logo, lx, ly, lw, lh);
  }
}

const INK = "#2a1b38";
const CREAM = "255,251,244";

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
export function headline(
  ctx: CanvasRenderingContext2D,
  o: { header: string; sub: string; left: number; top: number; width: number; size: number; colour: string; serif: string; sans: string; centred?: boolean; maxBottom: number; /** Extra height under the words (e.g. a button) the glow also covers. */ below?: number;
    /** white = white words on a soft dark shade from the top (no haze over faces); default = a cream glow. */ tone?: "white" | "cream";
    /** Leave out the sparks and the hand-drawn underline (cleaner, for ads). */ plain?: boolean },
): number {
  ctx.textBaseline = "top";
  // Shrink header and sub-header together until the block (with its underline) ends above maxBottom.
  let size = o.size;
  let hLines: string[] = [];
  let sLines: string[] = [];
  let subSize = 0;
  let blockH = 0;
  for (;;) {
    subSize = Math.round(size * 0.5);
    // Every word of the header and sub-header, at whatever size fits.
    ctx.font = `800 ${size}px ${o.serif}`;
    hLines = wrap(ctx, unquote(o.header), o.width);
    ctx.font = `700 ${subSize}px ${o.sans}`;
    sLines = o.sub.trim() ? wrap(ctx, unquote(o.sub), o.width * 0.95) : [];
    blockH = hLines.length * size * 1.02 + (sLines.length ? subSize * 0.5 + sLines.length * subSize * 1.22 : 0) + subSize * 1.1;
    if (o.top + blockH <= o.maxBottom || size <= o.size * 0.5) break;
    size = Math.floor(size * 0.94);
  }

  const glowH = blockH + (o.below ?? 0);
  const white = o.tone === "white";
  if (white) {
    // A soft dark shade from the top edge, fading out below the words: keeps white words readable, faces stay clear.
    const bottom = o.top + glowH + size * 2.2;
    const shade = ctx.createLinearGradient(0, 0, 0, bottom);
    shade.addColorStop(0, "rgba(18,10,6,0.62)");
    shade.addColorStop(0.6, "rgba(18,10,6,0.38)");
    shade.addColorStop(1, "rgba(18,10,6,0)");
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, ctx.canvas.width, bottom);
  }
  // A soft cream glow behind the words keeps them readable on any photo.
  // An ellipse fading to nothing on every side, so it never shows an edge.
  if (!white) {
  const rx = o.width * 0.8;
  const ry = glowH / 2 + size * 1.3;
  ctx.save();
  ctx.translate(o.left + o.width * (o.centred ? 0.5 : 0.4), o.top + glowH / 2);
  ctx.scale(1, ry / rx);
  const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
  glow.addColorStop(0, `rgba(${CREAM},0.74)`);
  glow.addColorStop(0.55, `rgba(${CREAM},0.5)`);
  glow.addColorStop(1, `rgba(${CREAM},0)`);
  ctx.fillStyle = glow;
  ctx.fillRect(-rx, -rx, rx * 2, rx * 2);
  ctx.restore();
  }

  const x = o.centred ? o.left + o.width / 2 : o.left;
  ctx.textAlign = o.centred ? "center" : "left";
  let y = o.top;
  ctx.save();
  if (white) {
    ctx.shadowColor = "rgba(0,0,0,0.45)";
    ctx.shadowBlur = size * 0.25;
    ctx.shadowOffsetY = size * 0.04;
  }
  ctx.fillStyle = o.colour;
  ctx.font = `800 ${size}px ${o.serif}`;
  const firstW = ctx.measureText(hLines[0] ?? "").width;
  for (const l of hLines) {
    ctx.fillText(l, x, y);
    y += size * 1.02;
  }
  ctx.restore();
  if (o.plain) {
    if (sLines.length) {
      y += subSize * 0.5;
      ctx.save();
      if (white) {
        ctx.shadowColor = "rgba(0,0,0,0.45)";
        ctx.shadowBlur = subSize * 0.3;
      }
      ctx.fillStyle = white ? "rgba(255,255,255,0.92)" : INK;
      ctx.font = `700 ${subSize}px ${o.sans}`;
      for (const l of sLines) {
        ctx.fillText(l, x, y);
        y += subSize * 1.22;
      }
      ctx.restore();
    }
    ctx.textAlign = "left";
    return y + subSize * 0.2;
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
    ctx.font = `700 ${subSize}px ${o.sans}`;
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
  return uy + size * 0.12;
}

/** Where the words of a scene ad go: logo and hook at the top, the button at the bottom left (above Meta's caption area on Reels/Stories). */
export function sceneTextLayout(W: number, H: number) {
  const tall = H / W >= 1.7;
  const short = Math.min(W, H);
  const left = Math.round(W * 0.07);
  const top = Math.round(H * (tall ? 0.15 : 0.055));
  const cSize = Math.round(short * (tall ? 0.044 : 0.04));
  const ctaH = Math.round(cSize * 2.5);
  return {
    left,
    top,
    width: Math.round(W * 0.82),
    hookSize: Math.round(short * (tall ? 0.095 : 0.085)),
    /** The hook block ends here at the latest. */
    hookBottom: Math.round(top + H * (tall ? 0.2 : 0.26)),
    logoW: Math.round(W * (tall ? 0.22 : 0.18)),
    cSize,
    ctaH,
    ctaTop: Math.round(H * (tall ? 0.79 : 0.945) - ctaH),
  };
}

/**
 * Words for an ad made as one scene: logo top left, the hook under it in the brand's serif (white on a soft
 * shade over busy photos, dark ink on calm light ones), and a clear button at the bottom left.
 */
function drawSceneText(ctx: CanvasRenderingContext2D, logo: HTMLImageElement | null, kit: BrandKit, o: OverlayOptions, W: number, H: number) {
  const L = sceneTextLayout(W, H);
  const sans = `"${kit.headingFont.name}", sans-serif`;
  const choice = o.textColour ?? "auto";
  const tone = choice === "auto" ? pickTone(ctx, { left: L.left, top: L.top, width: L.width, height: Math.max(1, L.hookBottom - L.top) }) : choice;
  let top = L.top;
  if (logo && o.logoCorner !== "none" && logo.naturalWidth) {
    const lh = Math.round((logo.naturalHeight / logo.naturalWidth) * L.logoW);
    ctx.save();
    if (tone === "white") {
      ctx.shadowColor = "rgba(0,0,0,0.35)";
      ctx.shadowBlur = L.logoW * 0.06;
    }
    ctx.drawImage(logo, L.left, top, L.logoW, lh);
    ctx.restore();
    top += lh + Math.round(H * 0.02);
  }
  if (o.headline.trim() || o.sub.trim()) {
    headline(ctx, {
      header: o.headline,
      sub: o.sub,
      left: L.left,
      top,
      width: L.width,
      size: Math.round(L.hookSize * o.textScale),
      colour: tone === "white" ? "#ffffff" : tone === "brand" ? kit.colors.primary : INK,
      // Bold sans for the hook (the team found the serif too soft).
      serif: sans,
      sans,
      maxBottom: L.hookBottom,
      tone: tone === "white" ? "white" : "cream",
      plain: true,
    });
  }
  const cta = o.cta.trim();
  if (o.showCta && cta) {
    const cSize = Math.round(L.cSize * Math.min(1.2, o.textScale));
    const ctaH = Math.round(cSize * 2.5);
    const label = `${cta}  →`;
    ctx.font = `700 ${cSize}px ${sans}`;
    const w = Math.max(ctx.measureText(label).width + cSize * 2.4, W * 0.36);
    const y = L.ctaTop + (L.ctaH - ctaH);
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.35)";
    ctx.shadowBlur = cSize * 0.8;
    ctx.shadowOffsetY = cSize * 0.12;
    ctx.fillStyle = kit.colors.accent;
    ctx.beginPath();
    ctx.roundRect(L.left, y, w, ctaH, ctaH / 2);
    ctx.fill();
    ctx.restore();
    // A thin white edge keeps the button visible on photos the same colour as it.
    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    ctx.lineWidth = Math.max(2, cSize * 0.08);
    ctx.beginPath();
    ctx.roundRect(L.left, y, w, ctaH, ctaH / 2);
    ctx.stroke();
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, L.left + w / 2, y + ctaH / 2 + cSize * 0.04);
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
  }
}
