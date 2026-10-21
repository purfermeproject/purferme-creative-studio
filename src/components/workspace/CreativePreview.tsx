"use client";

import { useState } from "react";
import type { CreativeSnapshot } from "@/db/schema";
import type { MadeImage } from "@/components/ImageMaker";
import { findPlacement } from "@/lib/placements";
import { isVideoType } from "@/lib/prompts";
import type { Platform } from "@/lib/types";

function frameShape(platform: Platform, placement: string, creativeType: string): { ratio: string; label: string } {
  const place = findPlacement(platform, placement);
  if (place) return place.preview === "reels" ? { ratio: "9 / 16", label: place.label } : { ratio: "4 / 5", label: place.label };
  if (platform === "meta") return isVideoType(creativeType) ? { ratio: "9 / 16", label: "Reels" } : { ratio: "4 / 5", label: "Feed" };
  if (platform === "amazon") return isVideoType(creativeType) ? { ratio: "16 / 9", label: "Sponsored Brands video" } : { ratio: "1 / 1", label: "Listing image" };
  return { ratio: "1 / 1", label: "Listing card" };
}

/** A realistic-looking preview of how the ad reads on the platform. */
export function CreativePreview({
  snapshot: s,
  platform,
  placement,
  creativeType,
  images,
  productName,
  priceText,
}: {
  snapshot: CreativeSnapshot;
  platform: Platform;
  placement: string;
  creativeType: string;
  images: MadeImage[];
  productName: string;
  priceText: string;
}) {
  const [more, setMore] = useState(false);
  const shape = frameShape(platform, placement, creativeType);
  const first = images.filter((i) => (i.frameIndex ?? 0) === 0);
  const pick = (list: MadeImage[]) => list.filter((i) => i.label?.includes("with text")).at(-1) ?? list.at(-1);
  const hero = pick(first) ?? pick(images);
  const caption = s.copy.body || s.hook;
  const short = caption.length > 125 && !more ? `${caption.slice(0, 125).trimEnd()}…` : caption;
  const tall = shape.ratio === "9 / 16";

  return (
    <figure className="space-y-3" aria-label="Ad preview" data-testid="creative-preview">
      <div className={`mx-auto overflow-hidden rounded-[1.75rem] border border-line bg-surface shadow-[0_12px_32px_-16px_rgba(45,27,84,0.35)] ${tall ? "max-w-[18rem]" : "max-w-[24rem]"}`}>
        {platform === "meta" ? (
          <div className="flex items-center gap-2 px-3 py-2 text-xs">
            <span className="flex size-7 items-center justify-center rounded-full bg-purple font-serif text-[11px] text-accent-ink" aria-hidden>
              PF
            </span>
            <span className="leading-tight">
              <span className="block font-semibold">purferme</span>
              <span className="text-ink-soft">Sponsored</span>
            </span>
          </div>
        ) : null}
        <div className="relative w-full overflow-hidden bg-gradient-to-br from-purple via-[#4a2c5e] to-caramel" style={{ aspectRatio: shape.ratio }}>
          {hero ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={hero.url} alt={`Image for ${s.title}`} className="absolute inset-0 h-full w-full object-cover" />
          ) : (
            <div className="absolute inset-0 flex flex-col justify-between p-5 text-[#f7f3ec]">
              <span className="eyebrow text-gold">{shape.label} · no image yet</span>
              <p className="font-serif text-2xl leading-tight font-semibold" style={{ fontVariationSettings: '"SOFT" 100' }}>
                {s.frames[0]?.onscreen || s.hook}
              </p>
              <p className="line-clamp-3 text-xs opacity-80">{s.frames[0]?.visual}</p>
            </div>
          )}
        </div>
        <div className="space-y-2 p-3 text-sm">
          {platform === "meta" ? (
            <>
              <p className="whitespace-pre-line">
                <span className="font-semibold">purferme </span>
                {short}
                {caption.length > 125 ? (
                  <button type="button" className="ml-1 text-ink-soft" onClick={() => setMore((m) => !m)}>
                    {more ? "less" : "more"}
                  </button>
                ) : null}
              </p>
              <div className="flex items-center justify-between gap-3 rounded-lg bg-surface-2 px-3 py-2">
                <span className="min-w-0 truncate font-semibold">{s.copy.headline || productName}</span>
                <span className="shrink-0 rounded-md bg-purple px-3 py-1 text-xs font-semibold text-accent-ink">{s.copy.cta || "Shop now"}</span>
              </div>
            </>
          ) : (
            <>
              <p className="font-semibold">{s.copy.headline || productName}</p>
              <p className="text-ink-soft">{productName}</p>
              <div className="flex items-center justify-between">
                <span className="font-semibold">{priceText || "Price on listing"}</span>
                <span className="rounded-full bg-gold px-3 py-1 text-xs font-semibold text-[#2d1b54]">{s.copy.cta || "Shop now"}</span>
              </div>
            </>
          )}
        </div>
      </div>
      <figcaption className="text-center text-xs text-ink-soft">
        Preview · {shape.label}. Platform UI is approximate; use Preview on an image to check safe zones.
      </figcaption>
    </figure>
  );
}

export function SceneList({ snapshot: s }: { snapshot: CreativeSnapshot }) {
  return (
    <ol className="space-y-2" aria-label="Scenes" data-testid="scene-list">
      {s.frames.map((f, i) => (
        <li key={i} className="grid grid-cols-[2rem_1fr] gap-3 rounded-xl border border-line bg-surface p-3 text-sm">
          <span className="flex size-7 items-center justify-center rounded-full bg-gold-soft font-serif text-sm font-semibold text-purple">{i + 1}</span>
          <div className="min-w-0 space-y-1">
            <p className="eyebrow">{f.slot}</p>
            {f.onscreen ? <p className="font-semibold text-ink">{f.onscreen}</p> : null}
            <p className="text-ink-soft">{f.visual}</p>
            {f.audio ? <p className="text-ink-soft">🔊 {f.audio}</p> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

export function CopyBlockView({ snapshot: s }: { snapshot: CreativeSnapshot }) {
  const rows = [
    ["Headline", s.copy.headline],
    ["Primary text", s.copy.body],
    ["Second version", s.copy.body_alt],
    ["Call to action", s.copy.cta],
  ].filter(([, v]) => v);
  return (
    <div className="space-y-3">
      <dl className="grid gap-2 text-sm sm:grid-cols-[8rem_1fr]">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="font-semibold text-ink-soft">{k}</dt>
            <dd className="whitespace-pre-line">{v}</dd>
          </div>
        ))}
      </dl>
      {s.copy.variants?.length ? (
        <div>
          <p className="eyebrow mb-2">Copy variants to test</p>
          <ol className="grid gap-2 sm:grid-cols-2" data-testid="copy-variants">
            {s.copy.variants.map((v, i) => (
              <li key={i} className="rounded-xl border border-line bg-surface p-3 text-sm">
                <p className="font-semibold">{v.headline}</p>
                <p className="mt-1 text-ink-soft">{v.body}</p>
                <p className="mt-2 text-xs font-semibold text-caramel-ink">{v.cta}</p>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </div>
  );
}
