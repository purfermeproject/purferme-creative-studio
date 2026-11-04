import { withoutRepeats } from "./product-focus";

/**
 * "Designed" images: the image AI lays out the whole ad like a finished brand post (a big headline with
 * hand-drawn accents, a sub-line, the real pack as the hero, callouts with icons or a comparison table,
 * warm props). Every word comes from the team's approved text and is read back afterwards. Pure code.
 */

export type Callout = { label: string; icon: string; crossed: boolean };
export type DesignTable = { us: string; them: string; rows: { label: string; us: string; them: string }[] };
export type DesignLayout = "callouts-left" | "callouts-both" | "comparison" | "badge" | "hero3d";
/** Where an image happens and how it feels: every image in a set gets its own. */
export type Setting = { key: string; place: string; light: string; surface: string; mood: string; colours: string };

/** where = the place a description names (it wins); fits = the story or theme of the image. */
export const SETTINGS: (Setting & { where: RegExp; fits: RegExp })[] = [
  { key: "grandma-kitchen", place: "a traditional Indian home kitchen with brass and steel utensils on open shelves", light: "soft early-morning sun through a window, gentle haze", surface: "a worn wooden kitchen table", mood: "nostalgia and warmth, like grandma's recipes", colours: "warm honey, cream and brass", where: /\b(traditional kitchen|grand(ma|mother)'?s? kitchen|nani|dadi)(s|es)?\b/i, fits: /\b(grand|nani|dadi|tradition|recipe|jaggery|heritage|nostalgi)/i },
  { key: "farm", place: "a millet field with ripe golden stalks and a farmer's hut far behind", light: "golden-hour sun low in the sky, long soft shadows", surface: "a rustic wooden plank on hay", mood: "pride and trust in where food comes from", colours: "golden wheat, sky blue and green", where: /\b(farm|field|village|crop|harvest)(s|es)?\b/i, fits: /\b(farm|field|grow|grew|trace|origin|harvest|where it)/i },
  { key: "school-morning", place: "a bright family dining room on a busy school morning, a school bag on a chair", light: "crisp bright daylight", surface: "a white dining table with a steel tiffin box", mood: "a happy, rushed morning: kids who actually finish their breakfast", colours: "fresh white, sunny yellow and soft blue", where: /\b(school|tiffin|lunch ?box|dining (room|table)|breakfast table)(s|es)?\b/i, fits: /\b(kid|child|school|tiffin|lunch ?box|son|daughter|mom|mother|parent)/i },
  { key: "office", place: "a modern office desk at 11 am, a laptop with its screen off, a notebook and a mug", light: "cool clean window light", surface: "a light oak desk", mood: "a focused break that keeps you going", colours: "cool grey, white and a touch of green from a desk plant", where: /\b(office|desk|laptop|workplace|cubicle|meeting|co-?working)(s|es)?\b/i, fits: /\b(office|desk|work|meeting|11 ?am|3 ?pm|snack|hunger|full|energy|focus)/i },
  { key: "chai-balcony", place: "a cosy home balcony with potted plants and fairy lights at dusk", light: "warm evening light with a soft orange sky", surface: "a small cane side table with a cup of cutting chai", mood: "an unhurried evening moment for yourself", colours: "dusky orange, plum and green", where: /\b(balcony|terrace|veranda|porch)(s|es)?\b/i, fits: /\b(chai|tea|evening|relax|me ?time|dunk|dip)/i },
  { key: "gym", place: "a bright home workout corner with a yoga mat and dumbbells", light: "fresh morning daylight", surface: "a wooden bench", mood: "energy and feeling good about what you eat", colours: "fresh mint, white and charcoal", where: /\b(gym|workout|yoga mat|treadmill)(s|es)?\b/i, fits: /\b(gym|workout|fit|protein|run|yoga|active|sport)/i },
  { key: "hostel", place: "a student hostel room with fairy lights, books and posters", light: "a warm desk lamp at night", surface: "a study desk with books", mood: "comfort and a taste of home when you're away", colours: "warm lamp amber, deep blue and plum", where: /\b(hostel|dorm|pg room|college room|study table)(s|es)?\b/i, fits: /\b(hostel|college|student|study|exam|night|away from home)/i },
  { key: "festive", place: "a home decorated for a festival with marigold garlands and diyas", light: "warm glowing diya light and soft bokeh", surface: "a festive table with a brass plate", mood: "joy and sharing with family", colours: "marigold orange, deep red and gold", where: /\b(diwali|festival|diya|puja|rakhi|marigold)(s|es)?\b/i, fits: /\b(gift|festiv|diwali|celebrat|share|sharing|family|together|rakhi|present)/i },
  { key: "picnic", place: "a green park with trees, a picnic on the grass", light: "dappled afternoon sunlight through leaves", surface: "a checked picnic mat", mood: "carefree fun outdoors", colours: "leaf green, sky blue and red check", where: /\b(park|picnic|garden|lawn|outdoors)(s|es)?\b/i, fits: /\b(travel|trip|picnic|outdoor|park|on the go|road|journey)/i },
  { key: "studio-nuts", place: "a clean food-photography set with ingredients arranged around", light: "soft directional studio light with a gentle shadow", surface: "a dark walnut board", mood: "craving: rich, crunchy, real ingredients up close", colours: "deep chocolate brown, cream and caramel", where: /\b(close-?up|macro|studio|flat ?lay)(s|es)?\b/i, fits: /\b(nut|almond|cashew|crunch|cocoa|chocolate|butter)/i },
  { key: "bright-kitchen", place: "a modern bright Indian kitchen with marble counters and a window", light: "soft natural daylight", surface: "a white marble counter", mood: "clean, honest everyday goodness", colours: "white, pale sage and wood", where: /\b(kitchen|counter|marble)(s|es)?\b/i, fits: /\b(no |zero|maida|palm|sugar|clean|honest|good stuff|preservative|better than|compare|regular)/i },
  { key: "living-room", place: "a cosy living room with a sofa, cushions and a rug", light: "warm afternoon light", surface: "a low wooden coffee table", mood: "a shared, happy snack moment at home", colours: "terracotta, cream and teal", where: /\b(living room|sofa|couch|tv|movie night)(s|es)?\b/i, fits: /\b(home|sofa|weekend|movie|binge|friends)/i },
];

const strip = ({ where: _w, fits: _f, ...x }: (typeof SETTINGS)[number]): Setting => (void _w, void _f, x);

/**
 * The world an image happens in. The team's description comes first: if it names a place ("an office desk at
 * 11 am"), that place is used, always. Otherwise the image's theme picks a setting not already used by the
 * other images in the set, and with no clear fit the seed spreads images across different ones.
 */
export function pickSetting(scene: string, theme = "", used: string[] = [], seed = 0): Setting {
  const named = SETTINGS.find((x) => x.where.test(scene));
  if (named) return strip(named);
  const free = SETTINGS.filter((x) => !used.includes(x.key));
  const pool = free.length ? free : SETTINGS;
  const fit = pool.find((x) => x.fits.test(scene)) ?? pool.find((x) => x.fits.test(theme)) ?? pool[Math.abs(seed) % pool.length];
  // A described place the library doesn't know (a train, a café…): keep it, and borrow only light and feeling.
  if (/\b(room|street|café|cafe|shop|market|terrace|bedroom|classroom|car|train|bus|beach|mountain|lake|temple|stadium|bakery|store|in a|at a|on a)\b/i.test(scene)) {
    return { ...strip(fit), key: `own-${fit.key}`, place: "exactly the place the description says", surface: "the surface the description says (else a table that suits the place)" };
  }
  return strip(fit);
}

/** A small stable number from text (so the same ad keeps its setting, and different ads get different ones). */
export const seedOf = (s: string) => [...s].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) | 0, 7);

export type DesignSpec = {
  headline: string;
  sub: string;
  layout: DesignLayout;
  callouts: Callout[];
  table?: DesignTable;
  /** Who and where behind the pack, e.g. "a grandmother and granddaughter in a sunlit kitchen; the girl bites a cookie". */
  scene: string;
  /** Short words for a small plum card (badge layout), e.g. "Seed-to-Fork Traceability". */
  badge?: string;
  /** The button text, when the ad has one (Create); listings have none. */
  cta?: string;
  /** Where it happens and how it feels (its own for every image). */
  setting: Setting;
};

const ICONS: [RegExp, string][] = [
  [/\bchai\b|\btea\b/i, "a steaming glass of cutting chai"],
  [/coffee/i, "a cup of coffee"],
  [/peanut butter/i, "a spoonful of peanut butter"],
  [/\bmilk\b/i, "a glass of milk"],
  [/on the go|travel|\bbag\b/i, "a small backpack"],
  [/carb/i, "a few golden grains"],
  [/maida|refined flour|flour/i, "a small heap of white flour"],
  [/palm/i, "an oil drop"],
  [/sugar/i, "three sugar cubes"],
  [/preservative|additive|chemical/i, "a lab flask"],
  [/fib(re|er)/i, "a green leaf"],
  [/protein/i, "a small dumbbell"],
  [/millet/i, "a millet stalk"],
  [/oat/i, "a few oat flakes"],
  [/almond|cashew|nut/i, "two almonds"],
  [/jaggery|gur/i, "golden jaggery cubes"],
  [/cocoa|chocolate/i, "a cocoa bean"],
  [/cardamom|elaichi/i, "two green cardamom pods"],
  [/cinnamon/i, "two cinnamon sticks"],
  [/butter|ghee/i, "a curl of butter"],
  [/gluten|wheat/i, "a wheat stalk"],
  [/trans fat|fat/i, "a drop of oil"],
  [/trace|farm|seed|source|qr/i, "a small sprout"],
  [/kid|child|tiffin|school/i, "a tiffin box"],
  [/energy|full|hunger/i, "a small sun"],
];

/** A simple, real-looking icon for a callout, and whether it is shown crossed out ("No maida"). */
export function calloutFor(label: string): Callout {
  const l = label.trim();
  const crossed = /^(no|zero|without|0\s?g|free from)\b/i.test(l);
  const icon = ICONS.find(([re]) => re.test(l))?.[1] ?? "a small green leaf";
  return { label: l, icon, crossed };
}

const isPerson = (s: string) => /\b(mother|mom|mum|father|dad|child|kid|girl|boy|woman|man|grand|family|person|people|student|friend|farmer|teen|couple)/i.test(s);

/** A listing slide as a design: its header, sub-header, features (or comparison) and scene. */
export function specFromSlide(
  slide: {
    header: string;
    sub: string;
    feature: string;
    scene: string;
    kind: string;
    comparison?: DesignTable;
  },
  /** Settings the earlier slides of the stack already use, so this one gets its own. */
  used: string[] = [],
  /** Other approved points to fill in for any callout dropped for repeating the header or sub-header. */
  spare: string[] = [],
): DesignSpec {
  const setting = pickSetting(slide.scene, `${slide.header} ${slide.sub}`, used, seedOf(slide.header) + used.length);
  // Each idea is said once: a pointer never repeats the header or sub-header.
  const parts = withoutRepeats(
    slide.header,
    slide.sub,
    slide.feature
      .split("|")
      .map((p) => p.trim())
      .filter(Boolean),
    spare,
    6,
  ).kept;
  if (slide.kind === "hero3d") {
    return { headline: slide.header, sub: slide.sub, layout: "hero3d", callouts: parts.slice(0, 3).map(calloutFor), scene: slide.scene, setting };
  }
  if (slide.kind === "comparison" && slide.comparison?.rows.length) {
    return { headline: slide.header, sub: slide.sub, layout: "comparison", callouts: [], table: { ...slide.comparison, rows: slide.comparison.rows.slice(0, 5) }, scene: slide.scene, setting };
  }
  const callouts = parts.map(calloutFor);
  return {
    headline: slide.header,
    sub: slide.sub,
    layout: callouts.length >= 4 && !isPerson(slide.scene) ? "callouts-both" : callouts.length ? "callouts-left" : "badge",
    callouts,
    badge: callouts.length ? undefined : parts[0],
    scene: slide.scene,
    setting,
  };
}

/** Every piece of text the design draws (the pack's own print aside), for the compliance scan and the read-back. */
export function designWords(spec: DesignSpec): string[] {
  const words = [spec.headline, spec.sub, ...spec.callouts.map((c) => c.label), spec.badge ?? "", spec.cta ?? ""];
  if (spec.table) words.push("Ours", "Others", spec.table.us, spec.table.them, ...spec.table.rows.flatMap((r) => [r.label, r.us, r.them]));
  // Ticks and crosses are drawn as marks, not words.
  return words.map((w) => w.trim()).filter((w) => w && !/^[✓✗✔✘x×]$/i.test(w));
}

export type DesignPromptOpts = {
  productName: string;
  brandName: string;
  primary: string;
  accent: string;
  w: number;
  h: number;
  forWhat: string;
  props: string[];
  /** The attached photos are our one pack from these sides, in order. */
  views?: string[];
  packAction?: string;
  trim?: { sides: number; topBottom: number };
  look?: string;
  /** The brand's own image style rules (Settings → Image style). */
  people?: string;
  avoid?: string;
  /** The font style for the words (Settings → Image style → Text on images). */
  type?: string;
  /** How many photos of our real food (cookies) are attached after the pack photos. */
  foodPhotos?: number;
};

/** The image prompt for a designed ad, in the style of the team's examples. */
export function buildDesignedPrompt(spec: DesignSpec, o: DesignPromptOpts): string {
  const tall = o.h / o.w >= 1.7;
  const shape = o.w === o.h ? "square" : o.h > o.w ? "portrait" : "landscape";
  const q = (s: string) => `“${s}”`;
  const people = isPerson(spec.scene);
  const packLine =
    o.views && o.views.length > 1
      ? `The ${o.views.length} attached photos all show our ONE real product pack (${o.productName}) from different sides (${o.views.map((v, i) => `photo ${i + 1} = ${v}`).join(", ")}).`
      : `The attached photo is our real product pack (${o.productName}).`;
  const calloutLines = spec.callouts.map(
    (c, i) => `   ${i + 1}. ${q(c.label)}, icon: ${c.icon}${c.crossed ? " with a thin red diagonal line crossing it out" : ""}`,
  );
  const placement: Record<DesignLayout, string> = {
    "callouts-left": `The pack stands large in the centre-right, slightly turned; a column of ${spec.callouts.length} callouts runs down the left side.`,
    "callouts-both": `The pack stands large in the centre, slightly turned; the callouts sit in two columns, half on the left and half on the right of the pack.`,
    comparison:
      "Our pack stands on the left, slightly turned, with a small plum tag above it reading “Ours”; at the far right stands a plain, unbranded generic biscuit packet (a plain white or grey wrapper with no logo, no brand name and no words) with a small grey tag above it reading “Others”; the comparison table sits between them.",
    hero3d:
      "The pack is the hero: a premium, realistic 3D product shot at a 3/4 angle (the front and one side visible, with real depth and thickness), standing tall in the centre on a round podium, dramatic soft light and gentle reflections; the callouts float at the sides.",
    badge: "The pack stands large in the centre, slightly turned; one small card sits on the right.",
  };
  return [
    `A finished, professional ${shape} advertising design for ${o.brandName}, an Indian food brand (${o.forWhat}): a warm, real photograph with designed text on it, like a premium D2C brand's post. Polished, clean and bright, with every element crisp and fully inside the frame.`,
    `LAYOUT: headline and sub-line at the top${people ? " (left-aligned on the left, the people on the right)" : ", centred"}. ${placement[spec.layout]} A few whole and broken cookies in the foreground on ${spec.setting.surface}.`,
    "",
    "TEXT: draw EXACTLY these words, spelled exactly as written, with the same capital letters, and NO other words anywhere in the picture (only the print on our pack is allowed besides them):",
    `- FONT for all the words: ${o.type ?? "an extra-bold, heavy, modern geometric sans-serif (like Poppins ExtraBold), never thin, script or serif"}.`,
    `- HEADLINE, the largest text, BIG and BOLD (each line about 11–13% of the image height, 1–2 lines, spanning most of the width), in deep plum ${o.primary}, with three short hand-drawn ${o.accent} spark strokes on each side and a ${o.accent} brush underline under it: ${q(spec.headline)}`,
    spec.sub ? `- SUB-LINE, one line just under the headline, bold and large (about half the headline's size), in plum: ${q(spec.sub)}` : "",
    spec.callouts.length
      ? `- CALLOUTS, each a soft cream rounded pill or circle with a gentle shadow, a small, simple, realistic illustrated icon and its label in big, bold plum letters that read easily on a phone (each label exactly once):\n${calloutLines.join("\n")}`
      : "",
    spec.table
      ? `- COMPARISON TABLE on a rounded cream card with a soft shadow: three columns. Column headers: ${q(spec.table.us)} on a plum band with white text, ${q(spec.table.them)} on a pale pink band. Each row has a small line icon and its label in the first column; our column is pale green with a green tick and the value; their column is pale pink with a red cross and the value. Rows:\n${spec.table.rows.map((r, i) => `   ${i + 1}. ${q(r.label)} | ours: ${q(r.us)} | theirs: ${q(r.them)}`).join("\n")}`
      : "",
    spec.badge ? `- A small rounded plum card with white bold text: ${q(spec.badge)}` : "",
    spec.cta ? `- A rounded ${o.accent} button with white bold text near the bottom left: ${q(spec.cta)}` : "",
    "",
    `PACK: ${packLine} Show exactly ONE pack, large and in sharp focus as the hero, standing on ${spec.setting.surface}${o.packAction ? ` (${o.packAction})` : ""}, slightly turned so it looks real, lit by the same light as the scene, with a soft shadow. Copy its design exactly: the same shape and proportions, colours, logo, brand name, illustrations and every printed word spelled exactly the same. Do not redesign, simplify, mirror or add anything to it. No other pack, box, jar or packet anywhere.`,
    o.foodPhotos
      ? `OUR REAL FOOD: the last ${o.foodPhotos === 1 ? "attached photo shows" : `${o.foodPhotos} attached photos show`} our real product out of the pack. Every cookie (or piece of food) in the picture must look exactly like it: the same colour, texture, size, shape, cracks and visible nuts, oats and millet. Never draw a generic or different-looking cookie.`
      : "",
    `SCENE (the most important part: show exactly this, as the team wrote it, every person, object and place in it): ${spec.scene}. ${people ? "Real Indian people, candid and natural, behind or beside the pack, never covering it or the text; their faces and body language carry the feeling below. " : ""}`,
    `SETTING (this image's own world, matching the scene above; never a generic beige studio): ${spec.setting.place}; ${spec.setting.light}; the pack and props on ${spec.setting.surface}; the background softly out of focus${o.props.length ? `; small real props: ${o.props.join(", ")}` : ""}.`,
    `EMOTION: ${spec.setting.mood}. Colour palette: ${spec.setting.colours} (the headline stays plum so it reads; the callout pills stay soft cream).`,
    o.trim && o.trim.sides > 0.02
      ? `FRAMING: about ${Math.round(o.trim.sides * 100)}% of the picture is cut off at the left and right edges, so keep all text, the pack and faces inside the middle ${Math.round((1 - 2 * o.trim.sides) * 100 - 6)}% of the width.`
      : o.trim && o.trim.topBottom > 0.02
        ? `FRAMING: about ${Math.round(o.trim.topBottom * 100)}% of the picture is cut off at the top and bottom, so keep all text, the pack and faces inside the middle ${Math.round((1 - 2 * o.trim.topBottom) * 100 - 6)}% of the height.`
        : "FRAMING: keep every word and the whole pack well inside the edges, with a comfortable margin.",
    tall ? "This is a Reels/Stories image: keep all text below the top 14% and above the bottom 20% (the app's own buttons cover those)." : "",
    o.look ? `Photography: ${o.look}` : "",
    o.people && people ? `People: ${o.people}` : "",
    o.avoid ? `Avoid: ${o.avoid}` : "",
    "RULES: no other words, numbers, prices, badges, seals, certifications, ratings or logos than the ones listed; no QR codes; no phone, tablet or laptop screens; no doctors or experts; the text must be perfectly spelled and easy to read.",
  ]
    .filter((l) => l !== "")
    .join("\n");
}

// ── Reading the words back ───────────────────────────────────────────────────

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[’'`]/g, "'")
    .replace(/[^a-z0-9%'&\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Edit distance, for spotting a misspelled word. */
function distance(a: string, b: string): number {
  const d = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = d[0];
    d[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const t = d[j];
      d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = t;
    }
  }
  return d[b.length];
}
const similar = (a: string, b: string) => 1 - distance(a, b) / Math.max(a.length, b.length, 1);

/**
 * Compares the words the AI drew (read back from the image, not counting the pack's own print) with the
 * words it was given: what is missing or misspelled, what appears twice, and anything added.
 */
export function compareDesignText(expected: string[], found: string[]): string[] {
  const all = norm(found.join(" "));
  const pieces = found.map(norm).filter(Boolean);
  const problems: string[] = [];
  const want = expected.map((e) => ({ raw: e, n: norm(e) })).filter((e) => e.n);
  for (const e of want) {
    if (all.includes(e.n)) {
      // A label drawn more often than asked (a repeated callout like "Millets, Millets") is a mistake.
      if (e.n.length > 5) {
        const count = (hay: string) => hay.match(new RegExp(`(?<=^| )${e.n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?= |$)`, "g"))?.length ?? 0;
        const times = count(all);
        const asked = want.filter((x) => count(x.n) > 0).length;
        if (times > asked) problems.push(`“${e.raw}” appears ${times} times`);
      }
      continue;
    }
    // Close enough to be the same words misspelled?
    const words = all.split(" ");
    const len = e.n.split(" ").length;
    let best = 0;
    let bestText = "";
    for (let i = 0; i + len <= words.length; i++) {
      const window = words.slice(i, i + len).join(" ");
      const s = similar(window, e.n);
      if (s > best) {
        best = s;
        bestText = window;
      }
    }
    problems.push(best >= 0.7 ? `“${e.raw}” is misspelled as “${bestText}”` : `“${e.raw}” is missing`);
  }
  // Words drawn that were never asked for (an invented claim, a price, a badge).
  const allowedWords = new Set(want.flatMap((e) => e.n.split(" ")));
  const extra = pieces.filter((p) => {
    const ws = p.split(" ").filter((w) => w.length > 2);
    if (!ws.length) return false;
    const unknown = ws.filter((w) => ![...allowedWords].some((a) => a === w || (a.length > 3 && similar(a, w) >= 0.75)));
    return unknown.length / ws.length > 0.5;
  });
  for (const x of extra.slice(0, 4)) problems.push(`extra text “${x}”`);
  return problems;
}
