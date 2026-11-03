/** Photos of the pack from every side, stored as product photos labelled "Pack view: <side>". Pure helpers (no server code). */

export const PACK_VIEWS = ["front", "back", "left side", "right side", "top", "bottom", "angle", "open"] as const;
export type PackView = (typeof PACK_VIEWS)[number];

export const VIEW_NAMES: Record<PackView, string> = {
  front: "Front",
  back: "Back (ingredients, nutrition)",
  "left side": "Left side",
  "right side": "Right side",
  top: "Top",
  bottom: "Bottom",
  angle: "3/4 angle (front and a side)",
  open: "Open (product showing)",
};

const PREFIX = "Pack view: ";
export const viewLabel = (v: PackView) => `${PREFIX}${v}`;
export function viewOf(label: string | null | undefined): PackView | null {
  if (!label?.startsWith(PREFIX)) return null;
  const v = label.slice(PREFIX.length).trim() as PackView;
  return PACK_VIEWS.includes(v) ? v : null;
}

/** A side guessed from the file name (pack-back.jpg, IMG_side_left.png …), or null. */
export function viewFromFilename(name: string): PackView | null {
  const n = name.toLowerCase().replace(/\.[a-z0-9]+$/, "").replace(/[_\-.]+/g, " ");
  if (/\bopen(ed)?\b|\binside\b/.test(n)) return "open";
  if (/\b(3 ?4|three quarter|angle|angled|perspective)\b/.test(n)) return "angle";
  if (/\bback\b|\brear\b|\bingredients?\b|\bnutrition\b/.test(n)) return "back";
  if (/\bleft\b/.test(n)) return "left side";
  if (/\bright\b|\bside\b/.test(n)) return "right side";
  if (/\btop\b/.test(n)) return "top";
  if (/\bbottom\b|\bbase\b/.test(n)) return "bottom";
  if (/\bfront\b/.test(n)) return "front";
  return null;
}

/**
 * Which sides of the pack suit the scene, best first (used without an AI, and as the AI's fallback).
 * The front is always included, since it carries the name and the logo.
 */
export function pickViewsByRules(scene: string, available: PackView[]): PackView[] {
  const s = scene.toLowerCase();
  const want: PackView[] = [];
  const add = (...v: PackView[]) => v.forEach((x) => available.includes(x) && !want.includes(x) && want.push(x));
  if (/\b(ingredient|nutrition|label|back of|read(s|ing)?\b|turns? (it|the pack) over|check)/.test(s)) add("back");
  if (/\b(open|unbox|unwrap|takes? (one|a cookie|out)|taking out|inside|pour|dip)/.test(s)) add("open");
  if (/\b(top[- ]down|flat ?lay|overhead|from above|bird'?s[- ]eye)\b/.test(s)) add("top");
  if (/\b(shelf|lined up|row of|side view|profile|pantry|cupboard)\b/.test(s)) add("left side", "right side");
  if (/\b(hold|held|hand|gift|pass|carr(y|ies|ying)|bag|tiffin)/.test(s)) add("angle");
  add("front");
  if (want.length < 2) add("angle");
  return want.slice(0, 3);
}

/**
 * How the person in the scene uses the pack, so it is part of the moment instead of a product shot standing
 * beside it (used without an AI, and as the AI's fallback).
 */
export function packActionByRules(scene: string, hook = ""): string {
  const s = `${scene} ${hook}`.toLowerCase();
  if (/\b(gift|present|wrap|ribbon|surprise|secret santa)/.test(s))
    return "the pack is the gift: the person is wrapping it or tying a ribbon round it, or holds it out to give it, both hands on it, turned at an angle so its front still reads";
  if (/\b(ingredient|nutrition|label|read(s|ing)?\b|check)/.test(s)) return "the person holds the pack up and turns it to read it, the pack at an angle, close to the camera";
  if (/\b(open|unbox|unwrap|tear|first bite|takes? (one|a cookie|out))/.test(s)) return "the person has just opened the pack and is taking a cookie out of it, the open pack in one hand";
  if (/\b(chai|tea|coffee|dip|breakfast|snack|bite|eat)/.test(s)) return "the pack is open on the table within reach, turned at an angle, and the person holds a cookie taken from it";
  if (/\b(bag|tiffin|office|desk|commute|travel|hostel|college|school)/.test(s)) return "the person is putting the pack into a bag or tiffin, or taking it out, holding it at an angle";
  return "the person holds the pack in one hand at a natural angle while doing what the scene describes";
}
