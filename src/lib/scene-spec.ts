/**
 * Reads the team's "What kind of photo?" text into what the slide must contain, so each part is made
 * the right way: the layout (one photo, a split, a grid) and each photo by the image model; icons,
 * tips and labels drawn exactly in the brand fonts (image models garble them); a small inset photo
 * for "a small callout showing …"; the real pack always from the pack photo. Pure, shared by the
 * server (photos) and the browser (words and icons).
 */

export type SceneSpec = {
  layout: "single" | "split" | "grid";
  /** What each photo shows (one, two for a split, up to four for a grid), with pack-only parts taken out. */
  photos: string[];
  /** "Three crossed-out icons (maida, palm oil, sugar)" → drawn as crossed-out badges. */
  crossed: string[];
  /** A short tip in quotes ("Stir & Enjoy"), drawn as a label next to the pack. */
  tip: string | null;
  /** "A small callout showing millet and oat grains" → a small round photo. */
  inset: string | null;
  /** The description has someone holding, reading or scanning the pack: only a real photo shows that exactly. */
  packInHands: boolean;
};

const NUMBER = "(?:\\d+|one|two|three|four|five|six)";
const PACK = "(?:pack|packet|box|jar|pouch|bottle|tub)";

/** Clauses that only say where the pack is: the slide always shows the real pack, so the photo doesn't need them. */
const PACK_ONLY = new RegExp(
  `(?:^|[,;.]\\s*|\\s+(?:with|and)\\s+)(?:the\\s+|our\\s+|a\\s+)?(?:purferme\\s+)?${PACK}\\s+(?:is\\s+)?(?:visible|blurred|in the (?:front|foreground|background)|on the (?:side|table|counter)|beside [^,;.]*|next to [^,;.]*|in (?:the )?background)[^,;.]*`,
  "gi",
);

const tidy = (s: string) =>
  s
    .replace(/\s+([,;.])/g, "$1")
    .replace(/([,;])\s*([,;.])/g, "$2")
    .replace(/^[\s,;.]+|[\s,;]+$/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();

const items = (s: string) =>
  s
    .split(/\s*(?:,|;|\band\b|\+|\/)\s*/i)
    .map((x) => x.replace(/^(?:a|an|the)\s+/i, "").trim())
    .filter((x) => x.length > 1);

export function sceneSpec(scene: string): SceneSpec {
  let text = ` ${scene.trim()} `;
  const crossed: string[] = [];
  let tip: string | null = null;
  let inset: string | null = null;

  // Icons, tips and callouts are drawn, not photographed.
  text = text.replace(new RegExp(`[,;.]?\\s*(?:${NUMBER}\\s+)?(?:small\\s+)?crossed[- ]?out icons?\\s*\\(([^)]+)\\)[^,;.]*`, "i"), (_, list: string) => {
    crossed.push(...items(list));
    return "";
  });
  text = text.replace(/[,;.]?\s*(?:a\s+)?(?:small\s+)?[“"']([^”"']{2,40})[”"']\s+(?:tip|label|tag|note|sticker)[^,;.]*/i, (_, t: string) => {
    tip = t.trim();
    return "";
  });
  text = text.replace(/[,;.]?\s*(?:a\s+)?small (?:callout|inset|circle|bubble) (?:showing|of|with) ([^.;]+)/i, (_, t: string) => {
    inset = t.trim();
    return "";
  });

  // Containers that aren't our pack (a lunch box, a jar of overnight oats) don't count.
  const notOurs = (s: string) => s.replace(/\b(?:lunch|tiffin|bread|spice|mason|cookie|oats|overnight oats|glass|steel)\s+(?:box|jar|tub|bottle)\b/gi, "container");
  const packInHands =
    new RegExp(`\\b(?:holding|holds|reading|reads|scanning|scans|flipping|flips|opening|opens|points? at|showing|stirring|stirs|dipping into|scooping from)\\b[^,;.]{0,40}\\b${PACK}`, "i").test(notOurs(text)) ||
    /\bqr\b/i.test(text);
  // The image model may not draw our pack (it would invent one), so the parts that need it in hand become
  // something it can photograph honestly; the real pack still stands beside the photo on the slide.
  const handsFree = (s: string) =>
    s
      .replace(new RegExp(`\\b(stirring|stirs|dipping into|scooping from)\\s+(?:the|a|our)\\s+${PACK}\\b`, "gi"), "$1 creamy spread in a plain open bowl")
      .replace(new RegExp(`\\bscanning\\s+(?:the\\s+)?qr(?:\\s+code)?(?:\\s+on\\s+(?:the|a|our)\\s+${PACK})?(?:\\s+with\\s+a\\s+phone)?`, "gi"), "holding a smartphone")
      .replace(
        new RegExp(`\\s*(?:while\\s+)?\\b(?:holding|holds|reading|reads|flipping|flips|opening|opens|showing|shows|pointing at|points at)\\s+(?:up\\s+)?(?:the\\s+(?:back|front|label|ingredients)\\s+(?:of|on)\\s+)?(?:the|a|our)\\s+${PACK}\\b[^,;.]*`, "gi"),
        "",
      );
  const clean = (s: string) => tidy(handsFree(s.replace(PACK_ONLY, "")));

  // Split: "Split image: A on the left; B on the right" (or "left: A; right: B").
  const split =
    /split (?:image|screen|frame)?\s*:?\s*(.+?)\s+on the left\s*[;,]\s*(.+?)\s+on the right/i.exec(text) ??
    /left\s*:\s*(.+?)\s*[;,]\s*right\s*:\s*(.+)/i.exec(text);
  if (split) return { layout: "split", photos: [clean(split[1]), clean(split[2])], crossed, tip, inset, packInHands };

  // Grid: "4-tile grid: toast, a pancake stack, an overnight oats jar and a smoothie glass, each with the jar visible".
  const grid = new RegExp(`${NUMBER}[- ]?(?:tile|panel|photo|image)?\\s*grid\\s*:\\s*(.+)`, "i").exec(text);
  if (grid) {
    const body = grid[1].replace(/,?\s*each with[^.;]*/i, "");
    const cells = items(body)
      .map((x) => clean(x))
      .filter(Boolean)
      .slice(0, 4);
    if (cells.length >= 2) return { layout: "grid", photos: cells, crossed, tip, inset, packInHands };
  }

  return { layout: "single", photos: [clean(text)], crossed, tip, inset, packInHands };
}

/** The things a photo must visibly show, to check the result against (people, actions, objects, setting). */
export function mustShow(description: string): string[] {
  return description
    .split(/\s*(?:[,;]|\.\s)\s*/)
    .map((x) => x.replace(/\.$/, "").trim())
    // Keep real things to look for: at least two words, and not just a description of the light.
    .filter((x) => x.split(/\s+/).length >= 2 && !/^(?:warm|soft|bright|golden|natural|morning)\b[^,]*\blight\b$/i.test(x))
    .slice(0, 6);
}

/** Card (icon list at the right) for product and food slides; a bar along the bottom when a person shares the scene. */
export function slideStyle(slide: { kind: string; feature: string; scene: string }): "card" | "bar" {
  const spec = sceneSpec(slide.scene);
  if (spec.layout !== "single") return "bar";
  const parts = slide.feature.split("|").filter((x) => x.trim()).length;
  return slide.kind === "lifestyle" && parts <= 3 ? "bar" : "card";
}

/** Props for the table from the product's real ingredients ("Foxtail millet (23.8%), Jaggery…" → "foxtail millet, jaggery"). */
export function propsFromIngredients(ingredients: string | undefined, max = 4): string[] {
  return (ingredients ?? "")
    .replace(/\([^)]*\)/g, "")
    .split(/[,;]/)
    .map((x) =>
      x
        .replace(/\d+(\.\d+)?\s*%/g, "")
        .replace(/^(?:and|with)\s+/i, "")
        .trim()
        .toLowerCase(),
    )
    .filter((x) => x.length > 2 && x.length < 30 && !/\b(?:salt|water|oil|emulsifier|flavour|flavor|preservative|lecithin|baking|soda|powder of)\b/.test(x))
    .slice(0, max);
}
