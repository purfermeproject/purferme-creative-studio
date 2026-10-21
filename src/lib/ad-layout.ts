/** Pure geometry shared by the server (placing the pack) and the browser (placing the text). */

/** How the photo and the brand panel share the canvas: panel along the bottom (portrait, square) or on the right (wide). */
export function adLayout(canvas: { w: number; h: number }) {
  const { w, h } = canvas;
  if (w / h > 1.2) {
    const panelX = Math.round(w * 0.62);
    return { kind: "right" as const, photo: { left: 0, top: 0, width: panelX, height: h }, panel: { left: panelX, top: 0, width: w - panelX, height: h }, floor: Math.round(h * 0.86), packH: Math.round(h * 0.66) };
  }
  const tall = h / w >= 1.7;
  // Reels/Stories: Meta's caption and buttons cover the bottom 20%, so the pack stands above that.
  const panelTop = Math.round(h * (tall ? 0.6 : 0.68));
  return {
    kind: "bottom" as const,
    photo: { left: 0, top: 0, width: w, height: panelTop },
    panel: { left: 0, top: panelTop, width: w, height: h - panelTop },
    floor: Math.round(h * (tall ? 0.78 : 0.93)),
    packH: Math.round(h * (tall ? 0.34 : h / w > 1.1 ? 0.42 : 0.44)),
  };
}
