"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { Platform } from "@/lib/types";

type Mock = "reels" | "feed" | "amazon-search" | "amazon-listing" | "flipkart-card" | "qc-grid";
const MOCKS: Record<Platform, { id: Mock; label: string }[]> = {
  meta: [
    { id: "reels", label: "Reels / Stories" },
    { id: "feed", label: "Feed post" },
  ],
  amazon: [
    { id: "amazon-search", label: "Search results" },
    { id: "amazon-listing", label: "Listing page" },
    { id: "qc-grid", label: "Quick-commerce tile" },
  ],
  flipkart: [
    { id: "flipkart-card", label: "Mobile listing card" },
    { id: "amazon-listing", label: "Product page gallery" },
    { id: "qc-grid", label: "Quick-commerce tile" },
  ],
};

const Dot = ({ className = "" }: { className?: string }) => <span className={`inline-block size-7 rounded-full bg-white/85 ${className}`} aria-hidden />;
const Stars = () => (
  <span className="text-[11px] text-amber-500" aria-label="4.5 stars">
    ★★★★☆ <span className="text-neutral-500">1,204</span>
  </span>
);

/** Generic phone-UI mock-ups (no platform logos) to judge an image where it will actually run. */
export function PlacementPreview({
  imageUrl,
  allImages,
  platform,
  brandName,
  productName,
  price,
  caption,
  cta,
  onClose,
  initialMock,
}: {
  imageUrl: string;
  allImages: string[];
  platform: Platform;
  brandName: string;
  productName: string;
  price: string;
  caption: string;
  cta: string;
  onClose: () => void;
  initialMock?: Mock;
}) {
  const [mock, setMock] = useState<Mock>(initialMock && MOCKS[platform].some((m) => m.id === initialMock) ? initialMock : MOCKS[platform][0].id);
  const [zones, setZones] = useState(true);
  const [ratio, setRatio] = useState(1);

  useEffect(() => {
    const img = new Image();
    img.onload = () => setRatio(img.naturalWidth / img.naturalHeight || 1);
    img.src = imageUrl;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [imageUrl, onClose]);

  const priceText = price || "₹ —";
  const phone = (children: ReactNode) => (
    <div className="relative mx-auto w-[300px] overflow-hidden rounded-[2.2rem] border-[10px] border-neutral-900 bg-white text-neutral-900 shadow-2xl" style={{ aspectRatio: "9 / 19.5" }}>
      {children}
    </div>
  );

  let body: ReactNode;
  if (mock === "reels") {
    body = phone(
      <div className="absolute inset-0 bg-black">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-x-0 top-0 flex items-center gap-2 bg-gradient-to-b from-black/50 to-transparent p-3 pt-5 text-xs text-white">
          <span className="size-7 rounded-full bg-white/80" aria-hidden />
          <span className="font-semibold">{brandName}</span>
          <span className="opacity-80">Sponsored</span>
        </div>
        <div className="absolute right-2 bottom-28 flex flex-col items-center gap-4">
          <Dot />
          <Dot />
          <Dot />
          <Dot />
        </div>
        <div className="absolute inset-x-0 bottom-0 space-y-2 bg-gradient-to-t from-black/70 to-transparent p-3 pb-4 text-xs text-white">
          <p className="line-clamp-2 pr-10">{caption}</p>
          <div className="rounded-md bg-white/90 py-2 text-center text-sm font-semibold text-neutral-900">{cta} ›</div>
        </div>
        {zones ? (
          <>
            <div className="absolute inset-x-0 top-0 flex h-[14%] items-end justify-center border-b-2 border-dashed border-red-400 bg-red-500/25 text-[10px] font-bold text-white">
              Covered by UI · keep text out
            </div>
            <div className="absolute inset-x-0 bottom-0 flex h-[20%] items-start justify-center border-t-2 border-dashed border-red-400 bg-red-500/25 pt-1 text-[10px] font-bold text-white">
              Covered by caption &amp; button
            </div>
            <div className="absolute top-[14%] right-0 bottom-[20%] w-[15%] border-l-2 border-dashed border-amber-300 bg-amber-400/20" aria-hidden />
          </>
        ) : null}
      </div>,
    );
  } else if (mock === "feed") {
    body = phone(
      <div className="absolute inset-0 overflow-y-auto bg-white text-xs">
        <div className="flex items-center gap-2 p-3">
          <span className="size-8 rounded-full bg-neutral-300" aria-hidden />
          <div>
            <p className="font-semibold">{brandName}</p>
            <p className="text-neutral-500">Sponsored</p>
          </div>
        </div>
        <div className="relative w-full bg-neutral-100" style={{ aspectRatio: String(Math.max(ratio, 0.8)) }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
          {zones && ratio < 0.8 ? (
            <div className="absolute inset-x-0 bottom-0 bg-red-500/30 p-1 text-center text-[10px] font-bold text-white">Taller than 4:5: feed crops this</div>
          ) : null}
        </div>
        <div className="flex items-center justify-between border-b border-neutral-200 bg-neutral-50 px-3 py-2 font-semibold">
          <span className="truncate">{productName}</span>
          <span className="rounded bg-neutral-200 px-2 py-1">{cta}</span>
        </div>
        <div className="flex gap-3 p-3">
          <span className="size-5 rounded-full bg-neutral-300" />
          <span className="size-5 rounded-full bg-neutral-300" />
          <span className="size-5 rounded-full bg-neutral-300" />
        </div>
        <p className="px-3 pb-4">
          <span className="font-semibold">{brandName}</span> {caption}
        </p>
      </div>,
    );
  } else if (mock === "amazon-search") {
    body = phone(
      <div className="absolute inset-0 overflow-y-auto bg-white text-xs">
        <div className="bg-neutral-800 p-3 pt-5">
          <div className="rounded-md bg-white px-3 py-2 text-neutral-500">millet cookies</div>
        </div>
        {[0, 1, 2].map((i) => (
          <div key={i} className={`flex gap-3 border-b border-neutral-200 p-3 ${i === 0 ? "" : "opacity-40"}`}>
            <div className="relative size-28 shrink-0 bg-neutral-100">
              {i === 0 ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imageUrl} alt="" className="h-full w-full object-contain" />
              ) : (
                <span className="absolute inset-3 rounded bg-neutral-300" />
              )}
            </div>
            <div className="min-w-0 space-y-1">
              {i === 0 ? <p className="text-[10px] text-neutral-500">Sponsored</p> : null}
              <p className="line-clamp-2 font-medium">{i === 0 ? productName : "Another brand's cookies, family pack"}</p>
              <Stars />
              <p className="text-base font-semibold">{i === 0 ? priceText : "₹ 299"}</p>
              <p className="text-neutral-500">Free delivery</p>
            </div>
          </div>
        ))}
        {zones ? <p className="p-3 text-[11px] text-neutral-600">Check: is the pack recognisable at this small size, on white, next to competitors?</p> : null}
      </div>,
    );
  } else if (mock === "amazon-listing") {
    const thumbs = [imageUrl, ...allImages.filter((u) => u !== imageUrl)].slice(0, 7);
    body = phone(
      <div className="absolute inset-0 overflow-y-auto bg-white text-xs">
        <div className="p-3 pt-5">
          <p className="text-neutral-500">{brandName}</p>
          <p className="font-medium">{productName}</p>
          <Stars />
        </div>
        <div className="relative aspect-square w-full bg-white">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageUrl} alt="" className="h-full w-full object-contain" />
          {zones ? <div className="pointer-events-none absolute inset-[7.5%] border-2 border-dashed border-sky-400" title="Product should fill about 85% of the frame" /> : null}
        </div>
        <div className="flex gap-1 overflow-x-auto p-2">
          {thumbs.map((t, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={i} src={t} alt="" className={`size-12 shrink-0 rounded border object-cover ${i === 0 ? "border-sky-500" : "border-neutral-200"}`} />
          ))}
        </div>
        <p className="px-3 text-lg font-semibold">{priceText}</p>
        <div className="m-3 rounded-full bg-amber-400 py-2 text-center font-semibold">Add to cart</div>
        {zones ? <p className="px-3 pb-3 text-[11px] text-neutral-600">Blue box: the pack should fill about 85% of a main image.</p> : null}
      </div>,
    );
  } else if (mock === "qc-grid") {
    // Blinkit / Zepto / Instamart-style category grid: three small tiles per row, roughly 100 px wide on a phone.
    body = phone(
      <div className="absolute inset-0 overflow-y-auto bg-neutral-50 text-[10px]" data-testid="qc-grid">
        <div className="bg-yellow-300 p-3 pt-5">
          <p className="text-[11px] font-bold">Delivery in 10 minutes</p>
          <div className="mt-1 rounded-lg bg-white px-3 py-2 text-xs text-neutral-500">Search &quot;healthy snacks&quot;</div>
        </div>
        <div className="grid grid-cols-3 gap-1.5 p-2">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className={`space-y-0.5 rounded-lg border border-neutral-200 bg-white p-1.5 ${i === 0 ? "" : "opacity-40"}`}>
              <div className="relative aspect-square bg-white">
                {i === 0 ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imageUrl} alt="" className="h-full w-full object-contain" />
                ) : (
                  <span className="absolute inset-3 rounded bg-neutral-300" />
                )}
              </div>
              <p className="line-clamp-2 leading-tight font-medium">{i === 0 ? productName : "Other brand snack"}</p>
              <div className="flex items-center justify-between">
                <span className="font-semibold">{i === 0 ? priceText : "₹ 99"}</span>
                <span className="rounded border border-green-700 px-1.5 font-bold text-green-700">ADD</span>
              </div>
            </div>
          ))}
        </div>
        {zones ? (
          <p className="p-3 text-[11px] text-neutral-600">
            Thumbnail test: at this size can a shopper tell the product, flavour and pack size in under a second? If not, simplify the image or use a cleaner pack shot.
          </p>
        ) : null}
      </div>,
    );
  } else {
    body = phone(
      <div className="absolute inset-0 overflow-y-auto bg-neutral-100 text-xs">
        <div className="bg-blue-600 p-3 pt-5">
          <div className="rounded bg-white px-3 py-2 text-neutral-500">millet cookies</div>
        </div>
        <div className="grid grid-cols-2 gap-1 p-1">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className={`space-y-1 bg-white p-2 ${i === 0 ? "" : "opacity-40"}`}>
              <div className="relative aspect-square bg-white">
                {i === 0 ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imageUrl} alt="" className="h-full w-full object-contain" />
                ) : (
                  <span className="absolute inset-4 rounded bg-neutral-300" />
                )}
              </div>
              {i === 0 ? <p className="text-[10px] text-neutral-500">Ad</p> : null}
              <p className="line-clamp-2 font-medium">{i === 0 ? productName : "Other brand cookies"}</p>
              <span className="inline-block rounded bg-green-700 px-1 text-[10px] text-white">4.3 ★</span>
              <p className="font-semibold">{i === 0 ? priceText : "₹ 249"}</p>
            </div>
          ))}
        </div>
        {zones ? <p className="p-3 text-[11px] text-neutral-600">Check: one message per image, readable at this size on a phone.</p> : null}
      </div>,
    );
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="Preview in place" className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4" data-testid="placement-preview">
      <div className="w-full max-w-3xl rounded-2xl border border-line bg-surface p-4 sm:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-bold">Preview in place</h2>
          <div className="flex flex-wrap items-center gap-2">
            {MOCKS[platform].map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setMock(m.id)}
                aria-pressed={mock === m.id}
                className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${mock === m.id ? "bg-accent text-accent-ink" : "bg-surface-2 text-ink-soft hover:text-ink"}`}
              >
                {m.label}
              </button>
            ))}
            <label className="ml-2 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={zones} onChange={(e) => setZones(e.target.checked)} /> Safe zones
            </label>
            <button type="button" className="btn-secondary px-3 py-1.5 text-sm" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
        {body}
        <p className="hint mt-4 text-center">Simplified mock-ups for judging layout and legibility; real apps differ slightly.</p>
      </div>
    </div>
  );
}
