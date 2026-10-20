"use client";

import type { MadeImage } from "@/components/ImageMaker";
import { findPlacement } from "@/lib/placements";
import { isVideoType } from "@/lib/prompts";
import type { Platform } from "@/lib/types";

/** Shape of the frame the ad will run in, for the sketch. */
export function sketchRatio(platform: Platform, placement: string, creativeType: string): string {
  const place = findPlacement(platform, placement);
  if (place) return place.preview === "reels" ? "9 / 16" : "4 / 5";
  if (platform === "meta") return isVideoType(creativeType) ? "9 / 16" : "4 / 5";
  return isVideoType(creativeType) ? "16 / 9" : "1 / 1";
}

/**
 * A free, instant layout sketch with the real pack photo and the hook, or the
 * real AI image once one is made. The sketch is labelled so nobody mistakes it
 * for finished artwork.
 */
export function ProposalVisual({
  hook,
  packUrl,
  ratio,
  image,
  busy,
  error,
  canMake,
  onMake,
}: {
  hook: string;
  packUrl: string | null;
  ratio: string;
  image: MadeImage | null;
  busy: boolean;
  error: string;
  canMake: boolean;
  onMake: () => void;
}) {
  return (
    <div className="space-y-2" data-testid="proposal-visual">
      <div className="relative w-full overflow-hidden rounded-xl border border-line bg-gradient-to-br from-purple via-[#4a2c5e] to-caramel" style={{ aspectRatio: ratio }}>
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image.url} alt={`Image for: ${hook}`} className="absolute inset-0 h-full w-full object-cover" data-testid="proposal-image" />
        ) : (
          <>
            <p className="absolute top-3 right-3 left-3 font-serif text-lg leading-tight font-semibold text-[#f7f3ec]">{hook}</p>
            {packUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={packUrl} alt="Your pack" className="absolute right-[6%] bottom-[8%] h-[45%] max-w-[50%] object-contain drop-shadow-xl" data-testid="proposal-pack" />
            ) : (
              <p className="absolute right-3 bottom-3 left-3 text-xs text-[#f7f3ec]/80">No pack photo on file yet. Add one in Settings → Products to see your real pack here.</p>
            )}
            <span className="absolute bottom-2 left-2 rounded bg-black/40 px-1.5 py-0.5 text-[10px] font-semibold text-white">Sketch · not an AI image</span>
          </>
        )}
        {busy ? (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-sm font-semibold text-white" aria-live="polite">
            Making the image… (up to a minute)
          </div>
        ) : null}
      </div>
      {canMake && !image ? (
        <button type="button" className="btn-secondary w-full px-3 py-1.5 text-sm" onClick={onMake} disabled={busy}>
          Make a real image
        </button>
      ) : null}
      {error ? (
        <p role="alert" className="text-xs text-red">
          {error}
        </p>
      ) : null}
    </div>
  );
}
