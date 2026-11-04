/** Pure geometry shared by the server (placing the pack) and the browser (placing the text). */

type Rect = { left: number; top: number; width: number; height: number };

/**
 * How the photo and the brand panel share the canvas: panel along the bottom (portrait, square) or on the
 * right (wide). The photo runs under the panel's edge and fades into it, so it reads as one picture.
 * `text` is the free part of the panel beside the pack, for the second line and the button.
 */
export function adLayout(canvas: { w: number; h: number }): {
  kind: "bottom" | "right";
  photo: Rect;
  fade: Rect;
  panel: Rect;
  text: Rect;
  floor: number;
  packH: number;
} {
  const { w, h } = canvas;
  if (w / h > 1.2) {
    const photoW = Math.round(w * 0.68);
    const fadeW = Math.round(w * 0.12);
    const panelX = photoW - Math.round(fadeW * 0.3);
    const floor = Math.round(h * 0.8);
    return {
      kind: "right",
      photo: { left: 0, top: 0, width: photoW, height: h },
      fade: { left: photoW - fadeW, top: 0, width: fadeW, height: h },
      panel: { left: panelX, top: 0, width: w - panelX, height: h },
      text: { left: panelX, top: floor, width: w - panelX, height: h - floor },
      floor,
      packH: Math.round(h * 0.62),
    };
  }
  const tall = h / w >= 1.7;
  // Reels/Stories: Meta's caption and buttons cover the bottom 20%, so the pack and words stay above that.
  const photoH = Math.round(h * (tall ? 0.72 : 0.8));
  const fadeH = Math.round(h * (tall ? 0.16 : 0.2));
  const floor = Math.round(h * (tall ? 0.8 : 0.93));
  const textTop = photoH - Math.round(fadeH * 0.45);
  const side = Math.round(w * 0.06);
  return {
    kind: "bottom",
    photo: { left: 0, top: 0, width: w, height: photoH },
    fade: { left: 0, top: photoH - fadeH, width: w, height: fadeH },
    panel: { left: 0, top: photoH, width: w, height: h - photoH },
    text: { left: side, top: textTop, width: Math.round(w * 0.48) - side, height: floor - textTop },
    floor,
    packH: Math.round(h * (tall ? 0.36 : h / w > 1.1 ? 0.44 : 0.46)),
  };
}

/**
 * A listing slide in the style of the team's examples: one warm scene, the real pack large at the left,
 * the header top left, and the feature as an icon list on a card at the right ("card") or as a pill bar
 * along the bottom ("bar", for slides with a person, who then stands on the right).
 */
export function sceneLayout(size: number, style: "card" | "bar") {
  const s = size;
  return {
    header: { left: Math.round(s * 0.065), top: Math.round(s * 0.05), width: Math.round(style === "bar" ? s * 0.56 : s * 0.62) },
    card: { left: Math.round(s * 0.62), top: Math.round(s * 0.27), width: Math.round(s * 0.335), height: Math.round(s * 0.52) },
    bar: { left: Math.round(s * 0.05), top: Math.round(s * 0.845), width: Math.round(s * 0.9), height: Math.round(s * 0.12) },
    /** Matches packBox() for the pack in the scene: left, "hero" (card) or "medium" (bar). */
    pack: style === "card" ? { scale: "hero" as const, bottom: 0.07, top: Math.round(s * 0.33) } : { scale: "medium" as const, bottom: 0.19, top: Math.round(s * 0.36) },
    /** Photos for a split or grid slide, as tiles on the right. */
    tiles: { left: Math.round(s * 0.56), top: Math.round(s * 0.25), width: Math.round(s * 0.39), height: Math.round(s * 0.56) },
    tip: style === "card" ? { x: Math.round(s * 0.6), y: Math.round(s * 0.84) } : { x: Math.round(s * 0.58), y: Math.round(s * 0.72) },
  };
}

/** A comparison slide: header centred on top, our pack left, a plain generic container right, the table between. */
export function comparisonLayout(size: number) {
  const s = size;
  return {
    header: { left: Math.round(s * 0.08), top: Math.round(s * 0.05), width: Math.round(s * 0.84) },
    table: { left: Math.round(s * 0.31), top: Math.round(s * 0.3), width: Math.round(s * 0.5), height: Math.round(s * 0.52) },
    us: { cx: Math.round(s * 0.16), floor: Math.round(s * 0.74), maxH: Math.round(s * 0.36), maxW: Math.round(s * 0.27) },
    them: { cx: Math.round(s * 0.9), floor: Math.round(s * 0.72), maxH: Math.round(s * 0.32), maxW: Math.round(s * 0.2) },
  };
}

/**
 * An ad made as one photographed scene: the real pack stands at the lower right (painted into the
 * scene), the hook top left in the brand's serif with the sub-line and the button under it. Tall
 * formats keep the words below Meta's top bar and the pack above the caption area.
 */
export function adScene(w: number, h: number) {
  const tall = h / w >= 1.7;
  const wide = w / h > 1.2;
  const scale: "medium" | "large" = tall || wide ? "medium" : "large";
  const bottom = tall ? 0.22 : 0.07;
  // Same proportions as packBox(): the pack's height share for each scale.
  const packTop = h * (1 - bottom - (scale === "large" ? 0.62 : 0.45));
  return {
    pack: { position: "right" as const, scale, bottom },
    header: { left: Math.round(w * 0.065), top: Math.round(h * (tall ? 0.15 : 0.06)), width: Math.round(w * (wide ? 0.44 : 0.6)) },
    headerSize: Math.round(Math.min(w, h) * (tall ? 0.088 : 0.078)),
    /** The words (and button) end above the pack. */
    maxBottom: Math.round(wide ? h * 0.92 : packTop - h * 0.015),
  };
}

/** Where the real panel photo (a side, the back, the nutrition table) sits on a panel slide; the words go at the top and left. */
export function panelBox(S: number, centred = false) {
  // With no pointers down the left, the photo (or the list) takes the middle.
  return centred
    ? { left: Math.round(S * 0.17), top: Math.round(S * 0.27), width: Math.round(S * 0.66), height: Math.round(S * 0.68) }
    : { left: Math.round(S * 0.4), top: Math.round(S * 0.27), width: Math.round(S * 0.55), height: Math.round(S * 0.66) };
}
