import { isVideoType } from "./prompts";
import type { Concept } from "./schemas";
import { imageAttention } from "./psychology";
import { PLATFORM_LABELS, type Platform } from "./types";

const PACK_WORDS = "pack(?:et)?s?|pouch(?:es)?|box(?:es)?|jars?|wrappers?|cartons?|packaging|tins?|tubs?";
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const HANDLING =
  "(?:hold|holds|holding|pick(?:s|ing)?\\s+up|read|reads|reading|flip|flips|flipping|turn|turns|turning|open|opens|opening|show|shows|showing|grab|grabs|grabbing|lift|lifts|lifting|shake|shakes|shaking|scan|scans|scanning|point(?:s|ing)?\\s+(?:at|to)|examin(?:e|es|ing)|inspect(?:s|ing)?)";

/**
 * Scene text with every mention of the pack replaced, so the model leaves the spot empty instead of drawing one.
 * Someone "holding/reading/flipping the pack" would make the model paint a second, invented pack in their
 * hands, so those actions become a glance at the pack standing on the surface.
 */
export function withoutPack(text: string, productName: string, replacement = "[empty spot: the real pack is added later]"): string {
  const name = escapeRe(productName.trim());
  const pack = `(?:the\\s+|a\\s+|an\\s+|our\\s+|his\\s+|her\\s+|their\\s+)?(?:${name}\\s*)?(?:${PACK_WORDS})`;
  const glance = replacement.startsWith("[empty") ? "glances toward the empty spot on the table (hands empty of any jar, box or packet)" : "glances at our pack standing on the table (nobody holds it)";
  const part = "(?:the\\s+)?(?:label|back|front|ingredients?(?:\\s+list)?|nutrition(?:\\s+panel)?)\\s+(?:on|of)\\s+";
  return text
    .replace(new RegExp(`\\b${HANDLING}\\s+(?:up\\s+)?(?:${part})?${pack}\\b(?:\\s+up\\b)?`, "gi"), "\u0000")
    .replace(new RegExp(`\\b(?:the\\s+)?(?:${name}\\s*)?(?:${PACK_WORDS})\\b`, "gi"), replacement)
    .replace(new RegExp(name, "gi"), "the product")
    .replaceAll("\u0000", glance);
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
  /** Designed layout: a brand panel with our real pack will cover the bottom (or right) of this photo. */
  layout?: "bottom" | "right";
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
    imageAttention(platform, isMainListing),
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
      ? `The image already contains our real product pack at its final size and position (${spot}). Build the whole scene around it so it truly belongs, at real-world scale (hands, cups and props sized correctly next to it): it stands on a real surface (counter, table or shelf) that runs under it at the right height and scale; the camera is at the pack's eye level and looks at it front-on, like the pack photo, so the scene's perspective matches; light comes from the same direction and colour temperature as the light on the pack; add a soft contact shadow where it meets a matte surface (no mirror reflection of the pack, no shiny tabletop); things around it sit naturally beside or behind it, never in front of it. There must be exactly ONE pack in the whole image, the one already there: never draw a copy of it, a second or bigger box behind it, a stack of boxes or any other pack, box, jar or logo. Do not cover, repaint, recolour or resize it.`
      : locked
        ? `Do NOT show any product pack, box, jar, wrapper, label or brand logo anywhere: the real, unaltered pack photo will be placed into the image afterwards. Leave a clear, uncluttered spot on a surface at the ${spot} of the frame where a pack can stand, lit to match the scene, with nothing in front of it.`
        : "Do NOT show any product pack, box, jar, wrapper, label or brand logo anywhere: this image shows the scene only.",
    isMainListing
      ? inScene
        ? "Main listing image: keep the pack and make everything else plain pure white, with only a very soft natural shadow under the pack; no props, no text."
        : "Main listing image: a plain pure white background only, no objects, no props, no text (the pack is added afterwards)."
      : "",
    opts.layout
      ? opts.layout === "bottom"
        ? "This photo is the top of a designed ad: a brand-colour panel with our real pack will cover the bottom third. Put the moment, the hands and any faces in the upper two-thirds, with the action reading clearly there; keep the bottom third simple (table surface or background) because it will be covered."
        : "This photo fills the left 60% of a designed ad: a brand-colour panel with our real pack covers the right 40%. Put the moment, hands and faces in the left half; keep the right side simple because it will be covered."
      : "",
    inScene && !isMainListing
      ? "Compose it as an ad, not a candid photo: our pack is the hero and the eye lands on it first. The action happens right beside it and leads to it (a hand spreading the product on toast, a spoon dipping into a small bowl of it, a piece broken over a cup). People are secondary: they sit beside or behind the pack, never overlapped or cut by it, and look toward the food or the pack."
      : "",
    inScene
      ? "Apart from our real pack, nobody holds, carries or shows any packaged product (no pouches, boxes, wrappers, jars or snack packets) and there are no other brand names or logos."
      : "Nobody holds, carries or shows any packaged product: no pouches, boxes, wrappers, jars or snack packets anywhere, and no brand names or logos. Never invent packaging: only the brand's real pack photo is ever used.",
    "Food from the product (the spread on a spoon or toast, a broken cookie, a bar) may be shown close and appetising, but true to the real product: its real colour and texture, no exaggerated styling, nothing it doesn't contain.",
    isMainListing
      ? "No added text other than what is printed on the pack."
      : opts.textMode === "ai" && text
        ? `On-image text, rendered exactly, large and legible on a phone: "${text}". No other words except what is printed on the pack.`
        : `Do not render any added words, letters, numbers, prices, badges or logos anywhere (only what is physically printed on the pack). Leave a calm, uncluttered area across the ${locked || opts.layout ? "top quarter" : "lower third"} for a headline that will be added afterwards.`,
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

/**
 * One photo of a listing slide, from the team's own description. It leads with exactly what they
 * asked for; the frame shape matches where the photo sits on the slide, so nothing gets cropped.
 * Icons, tips and words are drawn on the slide afterwards, and the real pack stands beside it.
 */
export function buildListingPhotoPrompt(opts: { description: string; shape: "wide" | "tall" | "square"; style?: ImageStyle; small?: boolean }): string {
  const style = opts.style ?? DEFAULT_IMAGE_STYLE;
  const frame = {
    wide: "a wide landscape frame",
    tall: "a tall portrait frame",
    square: "a square frame",
  }[opts.shape];
  return [
    `Professional photograph for an Indian food brand's product page on Amazon and Flipkart (${opts.small ? "a small round close-up inset" : "the photo part of a designed listing image"}).`,
    `SHOW EXACTLY THIS, with every part clearly visible: ${opts.description}.`,
    `Framing: ${frame}. The subject sits fully inside the frame with breathing room: no cropped heads, hands or food, nothing important touching the edges.`,
    "Quality: crisp focus on the subject, high detail, bright soft natural light, true-to-life colours, real and appetising food texture; the look of a professional commercial shoot, not a stock photo.",
    `Photography: ${style.look}`,
    `Places: ${style.places}`,
    `People: ${style.people}`,
    `Props and food: ${style.props}`,
    `Colour and mood: ${style.mood}`,
    `Avoid: ${style.avoid}`,
    "RULES: no packaging of any kind (no boxes, jars, pouches, packets, wrappers, labels or logos); no written words, numbers, icons, badges or graphics; no doctors or experts; nothing that isn't in the description.",
  ].join("\n");
}

/**
 * A whole listing scene in the style of the team's examples: one warm, real-looking scene built around
 * our real pack (standing large at the left), with the product's ingredients as props, and calm areas
 * where the header and the feature list go. inScene: the pack is already in the image (paint around it);
 * otherwise leave its spot empty (it is placed afterwards).
 */
export function buildListingScenePrompt(opts: {
  description: string;
  props: string[];
  style?: ImageStyle;
  layout: "card" | "bar" | "ad";
  inScene: boolean;
  productName: string;
  forAd?: string;
  /** The AI draws our pack into the scene from the attached pack photo, adapting angle, light and hands to the moment. */
  aiPack?: boolean;
  /** With aiPack: what the attached photo shows when it's one of the product's other photos (not the pack). */
  photoShows?: string;
  /** With aiPack: the attached photos are our one pack from these sides, in this order (the first is the side to show). */
  views?: string[];
}): string {
  const style = opts.style ?? DEFAULT_IMAGE_STYLE;
  const side = opts.layout === "ad" ? "lower right" : "lower left";
  if (opts.aiPack) {
    return [
      `Professional advertising photograph for an Indian food brand${opts.forAd ? ` (${opts.forAd})` : ""}: one real, warm, inviting photographed scene.`,
      opts.photoShows
        ? `The attached photo is our real product (${opts.productName}): ${opts.photoShows}. Put it into the scene naturally, exactly as it looks in the photo, as the hero of the picture, with the scene's own light, shadows and perspective, clearly visible and in sharp focus.`
        : opts.views && opts.views.length > 1
          ? `The ${opts.views.length} attached photos all show our ONE real product pack (${opts.productName}) from different sides: ${opts.views.map((v, i) => `photo ${i + 1} = ${v}`).join(", ")}. Use them together to understand its true 3D shape and every printed side, then put exactly ONE pack into the scene, showing mostly ${({ angle: "its front and one side (a 3/4 view)", open: "it opened, with the product showing" } as Record<string, string>)[opts.views[0]] ?? `its ${opts.views[0]}`}, naturally, as the hero of the picture: held in a hand, standing on the table, or being opened, whichever fits the moment. It takes the scene's own light, shadows and reflections and the camera's perspective, at a believable real-world size next to hands, cups and plates, clearly visible, in sharp focus and never cut off by the edge of the picture.`
          : `The attached photo is our real product pack (${opts.productName}). Put exactly ONE of it into the scene, naturally, as the hero of the picture: held in a hand, standing on the table at a slight angle, or being opened, whichever fits the moment. It takes the scene's own light, shadows and reflections and the camera's perspective, at a believable real-world size next to hands, cups and plates, clearly visible, in sharp focus and never cut off by the edge of the picture.`,
      "Copy the pack's design exactly: the same shape and proportions, the same colours, the same logo, brand name and illustrations, and every printed word spelled exactly the same. Do not redesign, simplify, translate, mirror or add anything to it. No other pack, jar, box, pouch, packet or label anywhere in the picture.",
      `SHOW EXACTLY THIS, every part clearly visible: ${opts.description.trim()}.`,
      opts.props.length ? `Props, placed naturally (small wooden bowls or loose pieces): ${opts.props.join(", ")}.` : "",
      "Composition: the people, the moment and our pack fill the frame naturally, with the pack in the right half or the centre; keep the top left calm and softly out of focus for a headline.",
      "Quality: crisp focus on the pack, the people and the food, high detail, bright soft natural light, shallow depth of field with a softly blurred background, real and appetising textures; the look of a professional commercial shoot.",
      `Photography: ${style.look}`,
      `Places: ${style.places}`,
      `People: ${style.people}`,
      `Colour and mood: ${style.mood}`,
      `Avoid: ${style.avoid}`,
      "RULES: apart from what is printed on our pack, no written words, numbers, icons, badges, graphics or logos anywhere (they are added afterwards); any phone, laptop or TV screen is dark or softly blurred with nothing readable on it (no apps, charts, icons or QR codes); no doctors or experts; nothing that isn't described.",
    ]
      .filter(Boolean)
      .join("\n");
  }
  return [
    opts.forAd
      ? `Professional advertising photograph for an Indian food brand (${opts.forAd}): one real, warm, inviting photographed scene.`
      : "Professional product-page image for an Indian food brand on Amazon and Flipkart: one real, warm, inviting photographed scene.",
    opts.inScene
      ? `The image already contains our real product pack, standing large at the ${side}. Build the whole scene around it so it truly belongs: it stands on a wooden board or table that runs under it at the right height, the camera sees it front-on at its eye level, the light matches the light on the pack, with a soft contact shadow. Never cover, repaint, recolour, resize or copy it: exactly ONE pack in the whole image, and no other jar, box, pouch, packet or label anywhere.`
      : `Leave a clear spot on the wooden table at the ${side} where our product pack will stand (it is added afterwards). Do NOT draw any pack, jar, box, pouch, packet or label anywhere.`,
    `SHOW EXACTLY THIS, every part clearly visible: ${withoutPack(opts.description, opts.productName, "the product")}.`,
    opts.props.length ? `Props on the table, placed naturally around the pack (small wooden bowls or loose pieces): ${opts.props.join(", ")}.` : "",
    opts.layout === "ad"
      ? "Composition: people and the action at the left and in the middle, facing or leaning towards the pack; keep the top left calm and softly out of focus for a headline."
      : opts.layout === "card"
        ? "Composition: keep the top left (above the pack) calm and softly out of focus for a headline, and keep the right third behind the action soft and uncluttered for a feature list."
        : "Composition: people and the action on the right half; keep the top left calm and softly out of focus for a headline, and the bottom strip of the table plain for a feature bar.",
    "Quality: crisp focus on the subject and the food, high detail, bright soft window light, warm cream and wood tones, shallow depth of field with a softly blurred background, real and appetising textures; the look of a professional commercial shoot.",
    `Photography: ${style.look}`,
    `Places: ${style.places}`,
    `People: ${style.people}`,
    `Colour and mood: ${style.mood}`,
    `Avoid: ${style.avoid}`,
    "RULES: no written words, numbers, icons, badges, graphics or logos anywhere (they are added afterwards); any phone, laptop or TV screen is dark or softly blurred with nothing readable on it (no apps, charts, icons or QR codes); no doctors or experts; nothing that isn't described.",
  ]
    .filter(Boolean)
    .join("\n");
}
