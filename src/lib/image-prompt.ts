import { isVideoType } from "./prompts";
import type { Concept } from "./schemas";
import { PLATFORM_LABELS, type Platform } from "./types";

const PACK_WORDS = "pack(?:et)?s?|pouch(?:es)?|box(?:es)?|jars?|wrappers?|cartons?|packaging|tins?|tubs?";
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Scene text with every mention of the pack replaced, so the model leaves the spot empty instead of drawing one. */
export function withoutPack(text: string, productName: string, replacement = "[empty spot: the real pack is added later]"): string {
  const name = escapeRe(productName.trim());
  return text
    .replace(new RegExp(`\\b(?:the\\s+)?(?:${name}\\s*)?(?:${PACK_WORDS})\\b`, "gi"), replacement)
    .replace(new RegExp(name, "gi"), "the product");
}

export type ImageSize = `${number}x${number}`;

/** Pure, testable: turns one frame of a concept into an image-model prompt. */
/** The brand's photography style, edited in Settings → Image style. */
export type ImageStyle = { look: string; places: string; people: string; props: string; mood: string; avoid: string };

export const DEFAULT_IMAGE_STYLE: ImageStyle = {
  look: "Real photography, not CGI: 35mm lens, natural window or daylight, shallow depth of field, true-to-life colours, gentle film grain. One clear focal point.",
  places: "Real Indian homes, offices, commutes and kitchens with lived-in detail: steel tumblers, cutting chai, a laptop on a cluttered desk, a tiffin, a balcony in the evening.",
  people: "Everyday Indians, candid mid-moment, not looking at the camera, not posed like stock models; natural skin and hair, simple everyday clothes.",
  props: "Few props, all real and relevant to the moment; food looks real and slightly imperfect (crumbs, a broken piece); nothing glossy or plastic.",
  mood: "Warm, honest and a little witty; muted, natural colours with a warm cast; calm backgrounds.",
  avoid: "Stock-photo smiles, studio seamless backdrops, floating objects, extra fingers, garbled text, oversaturated colours, fake bokeh lights.",
};

export function withImageStyleDefaults(s: Partial<ImageStyle> | null | undefined): ImageStyle {
  const out = { ...DEFAULT_IMAGE_STYLE };
  for (const k of Object.keys(out) as (keyof ImageStyle)[]) if (s?.[k]?.trim()) out[k] = s[k]!.trim();
  return out;
}

type ImagePromptOpts = {
  concept: Pick<Concept, "ai_prompt" | "frames" | "copy" | "needs_real_person" | "title">;
  frameIndex: number;
  platform: Platform;
  creativeType: string;
  productName: string;
  /**
   * "locked": our real pack photo goes into the image (the model never draws it).
   * "none": a scene without the product. The model never draws a pack in either case.
   */
  packMode?: "locked" | "none";
  packPosition?: "right" | "center" | "left";
  /** The real pack is already in the input image (paint-around mode): build the scene around it. */
  packInScene?: boolean;
  /** "overlay" = no words in the picture; crisp brand text is added afterwards. */
  textMode?: "overlay" | "ai";
  /** Final pixel size after cropping, so the model keeps important things inside the crop. */
  target?: { w: number; h: number; label: string; note?: string };
  /** Brand photography style (Settings → Image style). */
  style?: ImageStyle;
  /** The team's own edited direction (scene, style); replaces the generated one. Rules still apply. */
  direction?: string;
};

/**
 * Pure, testable. Two parts: the direction (what the picture shows and how it's shot;
 * the team can edit it) and the rules (pack protection, compliance, size), which always apply.
 */
export function buildImagePromptParts(opts: ImagePromptOpts): { direction: string; rules: string; prompt: string } {
  const { concept: c, platform } = opts;
  const frame = c.frames[Math.min(Math.max(opts.frameIndex, 0), Math.max(c.frames.length - 1, 0))];
  const text = (frame?.onscreen || c.copy.headline || "").trim();
  const isMainListing = platform === "amazon" && opts.creativeType.toLowerCase().includes("listing") && opts.frameIndex === 0;
  const locked = opts.packMode !== "none";
  const inScene = locked && opts.packInScene;
  const scenePack = (t: string) => withoutPack(t, opts.productName, inScene ? "[our real pack, already in the image]" : undefined);
  const spot = { right: "lower right", center: "lower centre", left: "lower left" }[opts.packPosition ?? "right"];
  const style = opts.style ?? DEFAULT_IMAGE_STYLE;

  const generated = [
    `Advertising image for ${PLATFORM_LABELS[platform]} (${opts.creativeType}${isVideoType(opts.creativeType) ? ", a still for one scene of the video" : ""}).`,
    isMainListing ? "" : `Scene: ${scenePack(frame?.visual ?? c.ai_prompt)}`,
    isMainListing ? "" : `Style and details: ${scenePack(c.ai_prompt)}`,
    `Photography: ${style.look}`,
    `Places: ${style.places}`,
    `People: ${style.people}`,
    `Props and food: ${style.props}`,
    `Colour and mood: ${style.mood}`,
    `Avoid: ${style.avoid}`,
  ]
    .filter(Boolean)
    .join("\n");
  const direction = opts.direction?.trim() ? scenePack(opts.direction.trim()) : generated;

  const rules = [
    `Product: ${opts.productName}.`,
    inScene
      ? `The image already contains our real product pack at its final size and position (${spot}). Build the whole scene around it so it truly belongs: it stands on a real surface (counter, table or shelf) that runs under it at the right height and scale; the camera is at the pack's eye level and looks at it front-on, like the pack photo, so the scene's perspective matches; light comes from the same direction and colour temperature as the light on the pack; add a soft contact shadow and a faint reflection where it meets the surface; things around it sit naturally beside or behind it, never in front of it. Do not cover, repaint, recolour, resize or duplicate the pack, and do not add any other pack, box, jar or logo.`
      : locked
        ? `Do NOT show any product pack, box, jar, wrapper, label or brand logo anywhere: the real, unaltered pack photo will be placed into the image afterwards. Leave a clear, uncluttered spot on a surface at the ${spot} of the frame where a pack can stand, lit to match the scene, with nothing in front of it.`
        : "Do NOT show any product pack, box, jar, wrapper, label or brand logo anywhere: this image shows the scene only.",
    isMainListing
      ? inScene
        ? "Main listing image: keep the pack and make everything else plain pure white, with only a very soft natural shadow under the pack; no props, no text."
        : "Main listing image: a plain pure white background only, no objects, no props, no text (the pack is added afterwards)."
      : "",
    inScene
      ? "Apart from our real pack, nobody holds, carries or shows any packaged product (no pouches, boxes, wrappers, jars or snack packets) and there are no other brand names or logos."
      : "Nobody holds, carries or shows any packaged product: no pouches, boxes, wrappers, jars or snack packets anywhere, and no brand names or logos. Never invent packaging: only the brand's real pack photo is ever used.",
    "No close-ups of the product itself (cookies, spread, bars): if food appears, keep it small and natural in the scene, so it can't be mistaken for the real product shot.",
    isMainListing
      ? "No added text other than what is printed on the pack."
      : opts.textMode === "ai" && text
        ? `On-image text, rendered exactly, large and legible on a phone: "${text}". No other words except what is printed on the pack.`
        : "Do not render any added words, letters, numbers, prices, badges or logos anywhere (only what is physically printed on the pack). Leave a calm, uncluttered area across the lower third for a headline that will be added afterwards.",
    platform === "amazon" || c.needs_real_person
      ? "No people's faces; if hands are needed, show only hands."
      : "If a person appears, keep them natural and incidental; no doctors, experts or before/after framing.",
    "No health claims, badges or certification marks.",
    opts.target
      ? `Final image is ${opts.target.w}×${opts.target.h} px (${opts.target.label}). It will be centre-cropped to that shape, so keep the pack, faces and all text well inside the centre, with comfortable margins on every side.${opts.target.note ? ` ${opts.target.note}` : ""}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  return { direction, rules, prompt: `${direction}\n\nRULES (always apply):\n${rules}` };
}

export function buildImagePrompt(opts: ImagePromptOpts): string {
  return buildImagePromptParts(opts).prompt;
}

/** Placeholder used in mock mode so the flow works with no API key. */
export function mockImageSvg(size: ImageSize, label: string, opts: { drawPack?: boolean } = {}): string {
  const [w, h] = size.split("x").map(Number);
  const pack = opts.drawPack === false ? "" : `<rect x="${w / 2 - 140}" y="${h / 2 - 200}" width="280" height="360" rx="24" fill="#6b3f2a"/><text x="50%" y="${h / 2 - 20}" text-anchor="middle" font-family="sans-serif" font-size="36" fill="#fbf8f3">Puŕ Fermé</text>`;
  const safe = label.replace(/[<>&"]/g, " ").slice(0, 80);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="100%" height="100%" fill="#f3ede4"/>${pack}<text x="50%" y="${h - 120}" text-anchor="middle" font-family="sans-serif" font-size="34" fill="#2b1d14">${safe}</text><text x="50%" y="${h - 70}" text-anchor="middle" font-family="sans-serif" font-size="24" fill="#5e4c3f">Placeholder: add OPENAI_API_KEY for real images</text></svg>`;
}
