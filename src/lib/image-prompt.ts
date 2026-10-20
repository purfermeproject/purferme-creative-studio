import { isVideoType } from "./prompts";
import type { Concept } from "./schemas";
import { PLATFORM_LABELS, type Platform } from "./types";

const PACK_WORDS = "pack(?:et)?s?|pouch(?:es)?|box(?:es)?|jars?|wrappers?|cartons?|packaging|tins?|tubs?";
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Scene text with every mention of the pack replaced, so the model leaves the spot empty instead of drawing one. */
export function withoutPack(text: string, productName: string): string {
  const name = escapeRe(productName.trim());
  return text
    .replace(new RegExp(`\\b(?:the\\s+)?(?:${name}\\s*)?(?:${PACK_WORDS})\\b`, "gi"), "[empty spot: the real pack is added later]")
    .replace(new RegExp(name, "gi"), "the product");
}

export type ImageSize = `${number}x${number}`;

/** Pure, testable: turns one frame of a concept into an image-model prompt. */
export function buildImagePrompt(opts: {
  concept: Pick<Concept, "ai_prompt" | "frames" | "copy" | "needs_real_person" | "title">;
  frameIndex: number;
  platform: Platform;
  creativeType: string;
  productName: string;
  hasPackReference: boolean;
  /**
   * "locked": the model leaves space and the original pack photo is composited afterwards (pack never redrawn).
   * "reference": the model redraws the pack from the photo (can alter printed text).
   */
  packMode?: "locked" | "reference" | "none";
  packPosition?: "right" | "center" | "left";
  /** "overlay" = no words in the picture; crisp brand text is added afterwards. */
  textMode?: "overlay" | "ai";
  /** Final pixel size after cropping, so the model keeps important things inside the crop. */
  target?: { w: number; h: number; label: string; note?: string };
}): string {
  const { concept: c, platform } = opts;
  const frame = c.frames[Math.min(Math.max(opts.frameIndex, 0), Math.max(c.frames.length - 1, 0))];
  const text = (frame?.onscreen || c.copy.headline || "").trim();
  const isMainListing = platform === "amazon" && opts.creativeType.toLowerCase().includes("listing") && opts.frameIndex === 0;
  const locked = opts.packMode === "locked";
  const spot = { right: "lower right", center: "lower centre", left: "lower left" }[opts.packPosition ?? "right"];
  const lines = [
    `Advertising image for ${PLATFORM_LABELS[platform]} (${opts.creativeType}${isVideoType(opts.creativeType) ? ", a still for one scene of the video" : ""}).`,
    `Product: ${opts.productName}.`,
    locked
      ? `Do NOT show any product pack, box, jar, wrapper, label or brand logo anywhere: the real, unaltered pack photo will be placed into the image afterwards. Leave a clear, uncluttered spot on a surface at the ${spot} of the frame where a pack can stand, lit to match the scene, with nothing in front of it.`
      : opts.hasPackReference
        ? "The attached photo is the real pack. Show it exactly as it is: same shape, colours, logo and printed text. Do not redesign or invent pack text."
        : "Show the product pack clearly; do not invent detailed pack text.",
    isMainListing
      ? locked
        ? "Main listing image: a plain pure white background only, no objects, no props, no text (the pack is added afterwards)."
        : "Main listing image: the pack alone on a pure white background, centred, no props, no text."
      : `Scene: ${locked ? withoutPack(frame?.visual ?? c.ai_prompt, opts.productName) : (frame?.visual ?? c.ai_prompt)}`,
    isMainListing ? "" : `Style and details: ${locked ? withoutPack(c.ai_prompt, opts.productName) : c.ai_prompt}`,
    locked ? "Nobody holds, carries or shows any packaged product: no pouches, boxes, wrappers, jars or snack packets anywhere, and no brand names or logos." : "",
    isMainListing
      ? "No added text other than what is printed on the pack."
      : opts.textMode === "overlay"
        ? "Do not render any added words, letters, numbers, prices, badges or logos anywhere (only what is physically printed on the pack). Leave a calm, uncluttered area across the lower third for a headline that will be added afterwards."
        : text
          ? `On-image text, rendered exactly, large and legible on a phone: "${text}". No other words except what is printed on the pack.`
          : "No added text other than what is printed on the pack.",
    platform === "amazon" || c.needs_real_person
      ? "No people's faces; if hands are needed, show only hands."
      : "If a person appears, keep them natural and incidental; no doctors, experts or before/after framing.",
    "Warm, natural light; Indian home or work setting; clean, appetising, photo-real. No health claims, badges or certification marks.",
  ];
  if (opts.target) {
    const { w, h, label, note } = opts.target;
    lines.push(
      `Final image is ${w}×${h} px (${label}). It will be centre-cropped to that shape, so keep the pack, faces and all text well inside the centre, with comfortable margins on every side.${note ? ` ${note}` : ""}`,
    );
  }
  return lines.filter(Boolean).join("\n");
}

/** Placeholder used in mock mode so the flow works with no API key. */
export function mockImageSvg(size: ImageSize, label: string, opts: { drawPack?: boolean } = {}): string {
  const [w, h] = size.split("x").map(Number);
  const pack = opts.drawPack === false ? "" : `<rect x="${w / 2 - 140}" y="${h / 2 - 200}" width="280" height="360" rx="24" fill="#6b3f2a"/><text x="50%" y="${h / 2 - 20}" text-anchor="middle" font-family="sans-serif" font-size="36" fill="#fbf8f3">Puŕ Fermé</text>`;
  const safe = label.replace(/[<>&"]/g, " ").slice(0, 80);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="100%" height="100%" fill="#f3ede4"/>${pack}<text x="50%" y="${h - 120}" text-anchor="middle" font-family="sans-serif" font-size="34" fill="#2b1d14">${safe}</text><text x="50%" y="${h - 70}" text-anchor="middle" font-family="sans-serif" font-size="24" fill="#5e4c3f">Placeholder: add OPENAI_API_KEY for real images</text></svg>`;
}
