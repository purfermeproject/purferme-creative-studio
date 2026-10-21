import type { Platform } from "./types";

/** Exact output sizes per platform. Images are generated near the right shape, then cropped to these pixels. */
export type ImageSpec = { id: string; label: string; w: number; h: number; note?: string };

export const IMAGE_SPECS: Record<Platform, ImageSpec[]> = {
  meta: [
    { id: "meta-916", label: "Reels / Stories 9:16", w: 1080, h: 1920, note: "Keep text out of the top 14% and bottom 20% (Meta's buttons cover them)." },
    { id: "meta-45", label: "Feed 4:5", w: 1080, h: 1350 },
    { id: "meta-11", label: "Feed / carousel card 1:1", w: 1080, h: 1080 },
    { id: "meta-191", label: "Link ad 1.91:1", w: 1200, h: 628 },
  ],
  amazon: [
    { id: "amz-listing", label: "Listing image 1:1", w: 2000, h: 2000, note: "Main image: pack only on pure white, filling ~85% of the frame." },
    { id: "amz-sbv", label: "Sponsored Brands video frame 16:9", w: 1920, h: 1080 },
    { id: "amz-sb", label: "SB custom image 1.91:1", w: 1200, h: 628 },
    { id: "amz-aplus", label: "A+ module 970×600", w: 970, h: 600 },
    { id: "amz-aplus-banner", label: "A+ header banner 970×300", w: 970, h: 300 },
  ],
  flipkart: [
    { id: "fk-listing", label: "Listing image 1:1", w: 2000, h: 2000, note: "2000×2000 master (Flipkart needs 1100+ for zoom). Mobile-first: big text, one message per image." },
    { id: "fk-video", label: "Product video frame 16:9", w: 1920, h: 1080 },
    { id: "fk-banner-wide", label: "Banner, wide 3:1 (adapt in Ads panel)", w: 1800, h: 600 },
    { id: "fk-banner-sq", label: "Banner, square 1:1 (adapt in Ads panel)", w: 1080, h: 1080 },
  ],
};

export const allSpecs = () => Object.values(IMAGE_SPECS).flat();
export const findSpec = (id: string) => allSpecs().find((s) => s.id === id) ?? null;

/** The size that best matches a creative type on a platform. */
export function defaultSpecFor(platform: Platform, creativeType: string): ImageSpec {
  const t = creativeType.toLowerCase();
  const specs = IMAGE_SPECS[platform];
  const pick = (id: string) => specs.find((s) => s.id === id)!;
  if (platform === "meta") {
    if (t.includes("9:16") || t.includes("video") || t.includes("reel") || t.includes("stor")) return pick("meta-916");
    if (t.includes("carousel") || t.includes("1:1")) return pick("meta-11");
    return pick("meta-45");
  }
  if (platform === "amazon") {
    if (t.includes("video") || t.includes("16:9")) return pick("amz-sbv");
    if (t.includes("headline") || t.includes("custom image")) return pick("amz-sb");
    if (t.includes("a+")) return pick("amz-aplus");
    return pick("amz-listing");
  }
  if (t.includes("video") || t.includes("16:9")) return pick("fk-video");
  if (t.includes("banner")) return pick("fk-banner-wide");
  return pick("fk-listing");
}

export type GenSize = "1024x1536" | "1536x1024" | "1024x1024";

/** Closest shape the image model can produce for a target aspect ratio. */
export function generationSizeFor(w: number, h: number): GenSize {
  const r = w / h;
  if (r > 1.15) return "1536x1024";
  if (r < 0.87) return "1024x1536";
  return "1024x1024";
}

export const ratioLabel = (w: number, h: number) => {
  const g = (a: number, b: number): number => (b ? g(b, a % b) : a);
  const d = g(w, h);
  const [a, b] = [w / d, h / d];
  return a > 30 || b > 30 ? `${(w / h).toFixed(2)}:1` : `${a}:${b}`;
};

export const MAX_SIDE = 4096;
export const MIN_SIDE = 200;

export type SizeCheck = { ok: boolean; match: ImageSpec | null; ratio: string; issues: string[]; closest: ImageSpec };

/** How well an uploaded design's pixel size fits a platform. */
export function checkSize(platform: Platform, w: number, h: number): SizeCheck {
  const specs = IMAGE_SPECS[platform];
  const r = w / h;
  const match = specs.find((s) => s.w === w && s.h === h) ?? null;
  const closest = [...specs].sort((a, b) => Math.abs(a.w / a.h - r) - Math.abs(b.w / b.h - r))[0];
  const issues: string[] = [];
  if (!match) {
    const sameShape = Math.abs(closest.w / closest.h - r) < 0.02;
    issues.push(
      sameShape
        ? `Right shape (${ratioLabel(w, h)}) but not the standard size. ${closest.label} is ${closest.w}×${closest.h}.`
        : `Not a standard ${platform === "meta" ? "Meta" : platform === "amazon" ? "Amazon" : "Flipkart"} shape. Closest is ${closest.label} (${closest.w}×${closest.h}).`,
    );
  }
  if (platform === "meta") {
    // Meta recommends at least 1080 px on the short side.
    if (Math.min(w, h) < 1080) issues.push(`Too small: the short side is ${Math.min(w, h)} px; Meta recommends at least 1080 px.`);
  } else if (Math.max(w, h) < 1000) {
    issues.push(`Too small: the long side is ${Math.max(w, h)} px; use at least 1000 px so it stays sharp${platform === "amazon" ? " and zoom works" : ""}.`);
  }
  return { ok: issues.length === 0, match, ratio: ratioLabel(w, h), issues, closest };
}
