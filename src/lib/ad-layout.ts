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
 * A square listing slide: a header band on top, the photo in the middle fading into a brand panel, the
 * real pack standing on the panel at the right, and the feature callouts on the panel at the left.
 * A comparison slide keeps the band and puts two packs and a table below it.
 */
export function slideLayout(size: number) {
  const s = size;
  const band = { left: 0, top: 0, width: s, height: Math.round(s * 0.2) };
  const photo = { left: 0, top: Math.round(s * 0.16), width: s, height: Math.round(s * 0.64) };
  const panelTop = Math.round(s * 0.74);
  return {
    band,
    photo,
    /** The photo fades into the band above and the panel below. */
    fadeTop: { left: 0, top: photo.top, width: s, height: Math.round(s * 0.06) },
    fadeBottom: { left: 0, top: panelTop - Math.round(s * 0.12), width: s, height: Math.round(s * 0.12) },
    panel: { left: 0, top: panelTop, width: s, height: s - panelTop },
    pack: { floor: Math.round(s * 0.955), height: Math.round(s * 0.46), right: Math.round(s * 0.05), maxWidth: Math.round(s * 0.4) },
    callouts: { left: Math.round(s * 0.05), top: panelTop + Math.round(s * 0.035), width: Math.round(s * 0.5), height: s - panelTop - Math.round(s * 0.06) },
    comparison: {
      packs: { top: band.height + Math.round(s * 0.03), height: Math.round(s * 0.3) },
      table: { left: Math.round(s * 0.06), top: Math.round(s * 0.6), width: Math.round(s * 0.88), height: Math.round(s * 0.36) },
      us: Math.round(s * 0.55),
      them: Math.round(s * 0.82),
    },
  };
}
