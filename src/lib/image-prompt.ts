import { isVideoType } from "./prompts";
import type { Concept } from "./schemas";
import { PLATFORM_LABELS, type Platform } from "./types";

export type ImageSize = "1024x1536" | "1536x1024" | "1024x1024";

/** Portrait for Meta feeds, landscape for marketplace video/banners, square for listing images. */
export function imageSizeFor(platform: Platform, creativeType: string): ImageSize {
  const t = creativeType.toLowerCase();
  if (t.includes("16:9") || t.includes("banner") || t.includes("a+")) return "1536x1024";
  if (t.includes("listing image") || t.includes("headline + custom image")) return "1024x1024";
  if (platform === "meta" || t.includes("9:16") || t.includes("4:5")) return "1024x1536";
  return "1024x1024";
}

/** Pure, testable: turns one frame of a concept into an image-model prompt. */
export function buildImagePrompt(opts: {
  concept: Pick<Concept, "ai_prompt" | "frames" | "copy" | "needs_real_person" | "title">;
  frameIndex: number;
  platform: Platform;
  creativeType: string;
  productName: string;
  hasPackReference: boolean;
}): string {
  const { concept: c, platform } = opts;
  const frame = c.frames[Math.min(Math.max(opts.frameIndex, 0), Math.max(c.frames.length - 1, 0))];
  const text = (frame?.onscreen || c.copy.headline || "").trim();
  const isMainListing = platform === "amazon" && opts.creativeType.toLowerCase().includes("listing") && opts.frameIndex === 0;
  const lines = [
    `Advertising image for ${PLATFORM_LABELS[platform]} (${opts.creativeType}${isVideoType(opts.creativeType) ? ", a still for one scene of the video" : ""}).`,
    `Product: ${opts.productName}.`,
    opts.hasPackReference
      ? "The attached photo is the real pack. Show it exactly as it is: same shape, colours, logo and printed text. Do not redesign or invent pack text."
      : "Show the product pack clearly; do not invent detailed pack text.",
    isMainListing ? "Main listing image: the pack alone on a pure white background, centred, no props, no text." : `Scene: ${frame?.visual ?? c.ai_prompt}`,
    isMainListing ? "" : `Style and details: ${c.ai_prompt}`,
    !isMainListing && text ? `On-image text, rendered exactly, large and legible on a phone: "${text}". No other words except what is printed on the pack.` : "No added text other than what is printed on the pack.",
    platform === "amazon" || c.needs_real_person
      ? "No people's faces; if hands are needed, show only hands."
      : "If a person appears, keep them natural and incidental; no doctors, experts or before/after framing.",
    "Warm, natural light; Indian home or work setting; clean, appetising, photo-real. No health claims, badges or certification marks.",
  ];
  return lines.filter(Boolean).join("\n");
}

/** Placeholder used in mock mode so the flow works with no API key. */
export function mockImageSvg(size: ImageSize, label: string): string {
  const [w, h] = size.split("x").map(Number);
  const safe = label.replace(/[<>&"]/g, " ").slice(0, 80);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="100%" height="100%" fill="#f3ede4"/><rect x="${w / 2 - 140}" y="${h / 2 - 200}" width="280" height="360" rx="24" fill="#6b3f2a"/><text x="50%" y="${h / 2 - 20}" text-anchor="middle" font-family="sans-serif" font-size="36" fill="#fbf8f3">Puŕ Fermé</text><text x="50%" y="${h - 120}" text-anchor="middle" font-family="sans-serif" font-size="34" fill="#2b1d14">${safe}</text><text x="50%" y="${h - 70}" text-anchor="middle" font-family="sans-serif" font-size="24" fill="#5e4c3f">Placeholder: add OPENAI_API_KEY for real images</text></svg>`;
}
