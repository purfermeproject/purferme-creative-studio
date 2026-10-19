"use client";

import { useState } from "react";
import { defaultSpecFor, IMAGE_SPECS, MAX_SIDE, MIN_SIDE } from "@/lib/image-specs";
import type { Concept } from "@/lib/schemas";
import type { Platform } from "@/lib/types";

export type MadeImage = { id: string; url: string; label?: string };
const CUSTOM = "custom";
type PackImage = { mediaType: "image/png" | "image/jpeg" | "image/webp" | "image/gif"; base64: string } | null;

export function ImageMaker({
  concept,
  platform,
  creativeType,
  productId,
  creativeId,
  packImage,
  images,
  onImages,
}: {
  concept: Concept;
  platform: Platform;
  creativeType: string;
  productId: string;
  creativeId?: string | null;
  packImage?: PackImage;
  images: MadeImage[];
  onImages: (next: MadeImage[]) => void;
}) {
  const [frame, setFrame] = useState(0);
  const specs = IMAGE_SPECS[platform];
  const [specId, setSpecId] = useState(() => defaultSpecFor(platform, creativeType).id);
  const [cw, setCw] = useState("1080");
  const [ch, setCh] = useState("1080");
  const [dims, setDims] = useState<Record<string, string>>({});
  const customW = Number(cw);
  const customH = Number(ch);
  const customValid =
    Number.isInteger(customW) && Number.isInteger(customH) && customW >= MIN_SIDE && customH >= MIN_SIDE && customW <= MAX_SIDE && customH <= MAX_SIDE;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");

  async function make() {
    setBusy(true);
    setError("");
    setNote("");
    try {
      const res = await fetch("/api/image", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          platform,
          productId,
          creativeType,
          concept,
          frameIndex: frame,
          creativeId: creativeId ?? null,
          packImage: packImage ?? null,
          specId: specId === CUSTOM ? null : specId,
          custom: specId === CUSTOM ? { w: customW, h: customH } : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't make the image. Try again.");
      onImages([...images, { id: data.id, url: data.url, label: data.label }]);
      if (!data.usedPackPhoto) setNote("Tip: add a pack photo (Tools → Settings → Products) so the pack in the image matches your real one.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't make the image. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-dashed border-line p-3" data-testid="image-maker">
      <div className="flex flex-wrap items-center gap-2">
        {concept.frames.length > 1 ? (
          <>
            <label htmlFor={`frame-${concept.title}`} className="sr-only">
              Which scene
            </label>
            <select id={`frame-${concept.title}`} className="input w-auto py-1.5 text-sm" value={frame} onChange={(e) => setFrame(Number(e.target.value))}>
              {concept.frames.map((f, i) => (
                <option key={i} value={i}>
                  Scene {i + 1}: {f.slot}
                </option>
              ))}
            </select>
          </>
        ) : null}
        <label htmlFor={`size-${concept.title}`} className="sr-only">
          Image size
        </label>
        <select id={`size-${concept.title}`} className="input w-auto py-1.5 text-sm" value={specId} onChange={(e) => setSpecId(e.target.value)}>
          {specs.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label} · {s.w}×{s.h}
            </option>
          ))}
          <option value={CUSTOM}>✏️ Custom size…</option>
        </select>
        {specId === CUSTOM ? (
          <span className="flex items-center gap-1 text-sm">
            <input aria-label="Width in pixels" className="input w-20 py-1.5 text-sm" inputMode="numeric" value={cw} onChange={(e) => setCw(e.target.value.replace(/\D/g, ""))} />
            ×
            <input aria-label="Height in pixels" className="input w-20 py-1.5 text-sm" inputMode="numeric" value={ch} onChange={(e) => setCh(e.target.value.replace(/\D/g, ""))} />
            px
          </span>
        ) : null}
        <button type="button" className="btn-secondary" onClick={make} disabled={busy || (specId === CUSTOM && !customValid)}>
          {busy ? "Making image… (up to a minute)" : images.length ? "Make another image" : "Make image"}
        </button>
      </div>
      {specId === CUSTOM && !customValid ? (
        <p className="hint">Width and height must be whole numbers between {MIN_SIDE} and {MAX_SIDE} px.</p>
      ) : specs.find((s) => s.id === specId)?.note ? (
        <p className="hint">{specs.find((s) => s.id === specId)?.note}</p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-red">
          {error}
        </p>
      ) : null}
      {note ? <p className="hint">{note}</p> : null}
      {images.length ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {images.map((img) => (
            <li key={img.id} className="space-y-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={img.url}
                alt={`Generated image for ${concept.title}`}
                className="w-full rounded-lg border border-line bg-surface-2"
                onLoad={(e) => {
                  const el = e.currentTarget;
                  setDims((d) => ({ ...d, [img.id]: `${el.naturalWidth}×${el.naturalHeight}` }));
                }}
              />
              <p className="text-xs text-ink-soft" data-testid="image-dims">
                {dims[img.id] ?? ""}
                {img.label ? ` · ${img.label}` : ""}
              </p>
              <a href={`${img.url}?download`} className="text-sm font-semibold text-accent hover:underline">
                Download
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
