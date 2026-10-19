import type { Platform } from "./types";

/** Where an ad runs inside a platform. Shapes the brief, the default image size and the preview. */
export type Placement = { id: string; label: string; specId: string; preview: "reels" | "feed"; guidance: string };

export const PLACEMENTS: Record<Platform, Placement[]> = {
  meta: [
    {
      id: "ig-reels",
      label: "Instagram Reels",
      specId: "meta-916",
      preview: "reels",
      guidance:
        "Full-screen vertical 9:16 video that feels native, like a creator made it, not an ad. Hook in the first second, product by 3s. Burned-in captions. 15–30s. Keep text out of the top 14% and bottom 20% (UI covers it). No copyrighted music; describe the audio mood instead.",
    },
    {
      id: "ig-stories",
      label: "Instagram Stories",
      specId: "meta-916",
      preview: "reels",
      guidance:
        "Full-screen 9:16, viewed in quick taps: plan 1–3 cards of about 5 seconds each, one idea per card, big centred text readable in 2 seconds. Use story-native visual ideas (poll or question sticker look, hand-written text, phone-shot feel). Last card: clear 'Shop now' prompt above the bottom 20% (link area).",
    },
    {
      id: "ig-feed",
      label: "Instagram Feed post",
      specId: "meta-45",
      preview: "feed",
      guidance:
        "Single 4:5 image (or short 4:5 video) that stops a thumb in the feed: one strong visual, very little text on the image. The caption's first line (under 125 characters, before '…more') must carry the hook.",
    },
    {
      id: "ig-carousel",
      label: "Instagram Carousel",
      specId: "meta-11",
      preview: "feed",
      guidance:
        "3–5 square (1:1) cards that tell a swipe story: card 1 is the hook and must make people swipe, middle cards give one proof each (ingredient %, jaggery, QR, pairing), last card is the CTA. Same layout and colours on every card; one frame per card.",
    },
    {
      id: "fb-feed",
      label: "Facebook Feed",
      specId: "meta-45",
      preview: "feed",
      guidance:
        "4:5 or 1:1 image or video in a broader, slightly older feed. Clear, plain benefit in the primary text above the image; headline under 40 characters under it. Works with sound off.",
    },
    {
      id: "fb-reels-stories",
      label: "Facebook Reels & Stories",
      specId: "meta-916",
      preview: "reels",
      guidance: "Full-screen 9:16, same rules as Instagram Reels/Stories: hook in 1s, captions, keep text out of the top 14% and bottom 20%.",
    },
    {
      id: "advantage",
      label: "All placements (Advantage+)",
      specId: "meta-45",
      preview: "feed",
      guidance:
        "Meta will place this everywhere, cropping to 9:16, 4:5 and 1:1. Keep the pack and all text in the centre square so every crop works; make sure the first second reads in any shape.",
    },
  ],
  amazon: [],
  flipkart: [],
};

export const findPlacement = (platform: Platform, idOrLabel: string | null | undefined) =>
  PLACEMENTS[platform].find((p) => p.id === idOrLabel || p.label === idOrLabel) ?? null;
