import { adLayout } from "@/lib/ad-layout";
import type { BrandKit } from "@/lib/brand-kit";

export type OverlayLayout = "band" | "top" | "centre" | "clean" | "none";
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
};

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

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
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
    const hLines = o.headline.trim() ? wrap(ctx, o.headline.trim(), maxW) : [];
    ctx.font = `400 ${sSize}px ${body}`;
    const sLines = o.sub.trim() ? wrap(ctx, o.sub.trim(), maxW) : [];
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
    if (ctaW) {
      let cx: number;
      if (panel) {
        // Beside the pack on the bottom panel, or under it on a right-hand panel; accent colour so it shows on the panel.
        cx = panel.kind === "right" ? panel.panel.left + (panel.panel.width - ctaW) / 2 : safe.x + pad;
        y = panel.kind === "right" ? Math.min(panel.floor + pad * 0.8, H - ctaH - pad) : panel.panel.top + pad * 1.6;
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

  if (logo && o.logoCorner !== "none" && logo.naturalWidth) {
    const lw = Math.round(W * 0.2);
    const lh = Math.round((logo.naturalHeight / logo.naturalWidth) * lw);
    const lx = o.logoCorner.endsWith("left") ? safe.x + pad * 0.5 : safe.x + safe.w - lw - pad * 0.5;
    const ly = o.logoCorner.startsWith("top") ? safe.y + pad * 0.5 : safe.y + safe.h - lh - pad * 0.5;
    ctx.drawImage(logo, lx, ly, lw, lh);
  }
}
