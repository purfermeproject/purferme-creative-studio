"use client";

import { useState } from "react";
import type { BrandKit } from "@/lib/brand-kit";
import { defaultSpecFor, IMAGE_SPECS, MAX_SIDE, MIN_SIDE } from "@/lib/image-specs";
import { findPlacement } from "@/lib/placements";
import { OverlayEditor } from "./OverlayEditor";
import { PlacementPreview } from "./PlacementPreview";
import type { Concept } from "@/lib/schemas";
import type { Platform } from "@/lib/types";

export type MadeImage = { id: string; url: string; label?: string; frameIndex?: number | null };
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
  kit,
  productName = "",
  priceText = "",
  placement = "",
}: {
  concept: Concept;
  platform: Platform;
  creativeType: string;
  productId: string;
  creativeId?: string | null;
  packImage?: PackImage;
  images: MadeImage[];
  onImages: (next: MadeImage[]) => void;
  kit: BrandKit;
  productName?: string;
  priceText?: string;
  placement?: string;
}) {
  const place = findPlacement(platform, placement);
  const [previewing, setPreviewing] = useState<MadeImage | null>(null);
  const [wordsFor, setWordsFor] = useState<string | null>(null);
  const [instruction, setInstruction] = useState("");
  const [working, setWorking] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [comparing, setComparing] = useState(false);
  const [textMode, setTextMode] = useState<"overlay" | "ai">("overlay");
  const [editing, setEditing] = useState<MadeImage | null>(null);
  const [frame, setFrame] = useState(0);
  const specs = IMAGE_SPECS[platform];
  const [specId, setSpecId] = useState(() => place?.specId ?? defaultSpecFor(platform, creativeType).id);
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

  const [progress, setProgress] = useState("");

  async function requestImage(frameIndex: number): Promise<MadeImage & { usedPackPhoto: boolean }> {
    const res = await fetch("/api/image", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        platform,
        productId,
        creativeType,
        concept,
        frameIndex,
        creativeId: creativeId ?? null,
        packImage: packImage ?? null,
        specId: specId === CUSTOM ? null : specId,
        textMode,
        custom: specId === CUSTOM ? { w: customW, h: customH } : null,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Couldn't make the image. Try again.");
    return { id: data.id, url: data.url, label: data.label, frameIndex, usedPackPhoto: data.usedPackPhoto };
  }

  async function make(frames: number[]) {
    setBusy(true);
    setError("");
    setNote("");
    let acc = [...images];
    let usedPack = true;
    try {
      for (let i = 0; i < frames.length; i++) {
        if (frames.length > 1) setProgress(`Scene ${i + 1} of ${frames.length}…`);
        const img = await requestImage(frames[i]);
        usedPack &&= img.usedPackPhoto;
        acc = [...acc, { id: img.id, url: img.url, label: img.label, frameIndex: img.frameIndex }];
        onImages(acc);
      }
      if (!usedPack) setNote("Tip: add a pack photo (Tools → Settings → Products) so the pack in the image matches your real one.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't make the image. Try again.");
    } finally {
      setBusy(false);
      setProgress("");
    }
  }

  async function post(url: string, body: unknown) {
    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "That didn't work. Try again.");
    return data;
  }

  async function editWithWords(img: MadeImage) {
    setWorking(img.id);
    setError("");
    try {
      const a = await post("/api/image/edit", { assetId: img.id, instruction, creativeId: creativeId ?? null });
      onImages([...images, { id: a.id, url: a.url, label: a.label, frameIndex: img.frameIndex ?? null }]);
      setWordsFor(null);
      setInstruction("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't edit the image.");
    } finally {
      setWorking(null);
    }
  }

  async function allSizes(img: MadeImage) {
    setWorking(img.id);
    setError("");
    try {
      const data = await post("/api/image/resize", { assetId: img.id, platform, creativeId: creativeId ?? null });
      onImages([...images, ...data.images.map((a: MadeImage) => ({ id: a.id, url: a.url, label: a.label, frameIndex: img.frameIndex ?? null }))]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't make the other sizes.");
    } finally {
      setWorking(null);
    }
  }

  // Latest image for each scene, preferring versions with brand text added.
  const storyboard = concept.frames.map((f, i) => {
    const forScene = images.filter((im) => (im.frameIndex ?? 0) === i);
    const withText = forScene.filter((im) => im.label?.includes("with text"));
    return { frame: f, image: (withText.length ? withText : forScene).at(-1) ?? null };
  });
  const showStoryboard = concept.frames.length > 1 && storyboard.some((s) => s.image);

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
        <label htmlFor={`text-${concept.title}`} className="sr-only">
          Text on image
        </label>
        <select id={`text-${concept.title}`} className="input w-auto py-1.5 text-sm" value={textMode} onChange={(e) => setTextMode(e.target.value as "overlay" | "ai")}>
          <option value="overlay">Text: add crisp brand text after</option>
          <option value="ai">Text: AI draws it in the image</option>
        </select>
        <button type="button" className="btn-secondary" onClick={() => make([frame])} disabled={busy || (specId === CUSTOM && !customValid)}>
          {busy ? progress || "Making image… (up to a minute)" : images.length ? "Make another image" : "Make image"}
        </button>
        {concept.frames.length > 1 ? (
          <button
            type="button"
            className="btn-secondary"
            onClick={() => make(concept.frames.map((_, i) => i))}
            disabled={busy || (specId === CUSTOM && !customValid)}
            title="One image per scene, for a storyboard"
          >
            Make all {concept.frames.length} scenes
          </button>
        ) : null}
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
      {picked.length >= 2 ? (
        <button type="button" className="btn-secondary px-3 py-1.5 text-sm" onClick={() => setComparing(true)}>
          Compare {picked.length} images side by side
        </button>
      ) : null}
      {comparing ? (
        <div role="dialog" aria-modal="true" aria-label="Compare images" className="fixed inset-0 z-50 overflow-y-auto bg-black/80 p-4" data-testid="compare" onKeyDown={(e) => e.key === "Escape" && setComparing(false)}>
          <div className="mx-auto max-w-7xl space-y-4">
            <div className="flex justify-end">
              <button type="button" className="btn-secondary" onClick={() => setComparing(false)} autoFocus>
                Close
              </button>
            </div>
            <div className={`grid gap-4 ${picked.length > 2 ? "md:grid-cols-4" : "md:grid-cols-2"}`}>
              {picked.map((id) => {
                const im = images.find((x) => x.id === id);
                if (!im) return null;
                return (
                  <figure key={id} className="space-y-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={im.url} alt={im.label ?? "Image"} className="max-h-[80vh] w-full rounded-lg bg-white object-contain" />
                    <figcaption className="text-center text-sm text-white">{im.label}</figcaption>
                  </figure>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}
      {showStoryboard ? (
        <div data-testid="storyboard">
          <p className="mb-2 text-xs font-bold tracking-wide text-ink-soft uppercase">Storyboard</p>
          <ol className="flex gap-3 overflow-x-auto pb-2">
            {storyboard.map(({ frame: f, image }, i) => (
              <li key={i} className="w-36 shrink-0 space-y-1 text-xs">
                <div className="flex aspect-[9/16] items-center justify-center overflow-hidden rounded-lg border border-line bg-surface-2">
                  {image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={image.url} alt={`Scene ${i + 1}`} className="h-full w-full object-cover" />
                  ) : (
                    <span className="hint p-2 text-center">No image yet</span>
                  )}
                </div>
                <p className="font-bold">
                  {i + 1}. {f.slot}
                </p>
                <p className="line-clamp-2 font-semibold">{f.onscreen}</p>
                {f.audio ? <p className="line-clamp-2 text-ink-soft">🔊 {f.audio}</p> : null}
              </li>
            ))}
          </ol>
        </div>
      ) : null}
      {images.length ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3" data-testid="image-gallery">
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
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm font-semibold">
                <button type="button" className="text-accent hover:underline" onClick={() => setEditing(img)}>
                  Add text &amp; logo
                </button>
                <button type="button" className="text-accent hover:underline" onClick={() => setPreviewing(img)}>
                  Preview
                </button>
                <button type="button" className="text-accent hover:underline" onClick={() => setWordsFor(wordsFor === img.id ? null : img.id)}>
                  Edit with words
                </button>
                <button type="button" className="text-accent hover:underline disabled:opacity-50" disabled={working === img.id} onClick={() => allSizes(img)}>
                  {working === img.id && wordsFor !== img.id ? "Resizing…" : "All sizes"}
                </button>
                <a href={`${img.url}?download`} className="text-accent hover:underline">
                  Download
                </a>
              </div>
              <label className="flex items-center gap-1.5 text-xs text-ink-soft">
                <input
                  type="checkbox"
                  checked={picked.includes(img.id)}
                  onChange={(e) => setPicked((p) => (e.target.checked ? [...p, img.id].slice(-4) : p.filter((x) => x !== img.id)))}
                />
                Compare
              </label>
              {wordsFor === img.id ? (
                <form
                  className="space-y-1"
                  onSubmit={(e) => {
                    e.preventDefault();
                    editWithWords(img);
                  }}
                >
                  <input
                    className="input py-1.5 text-sm"
                    aria-label="Describe the change"
                    autoFocus
                    value={instruction}
                    onChange={(e) => setInstruction(e.target.value)}
                    placeholder="e.g. make the background lighter, add steam to the chai"
                  />
                  <button type="submit" className="btn-secondary px-3 py-1 text-sm" disabled={working === img.id || instruction.trim().length < 3}>
                    {working === img.id ? "Editing… (up to a minute)" : "Apply change"}
                  </button>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {previewing ? (
        <PlacementPreview
          imageUrl={previewing.url}
          allImages={images.map((i) => i.url)}
          platform={platform}
          brandName="Puŕ Fermé"
          productName={productName || concept.title}
          price={priceText}
          caption={concept.copy.body || concept.hook}
          cta={concept.copy.cta || "Shop now"}
          initialMock={place?.preview}
          onClose={() => setPreviewing(null)}
        />
      ) : null}
      {editing ? (
        <OverlayEditor
          imageUrl={editing.url}
          kit={kit}
          creativeId={creativeId}
          frameIndex={editing.frameIndex ?? null}
          baseLabel={editing.label}
          defaults={{
            headline: concept.frames[editing.frameIndex ?? 0]?.onscreen || concept.copy.headline || concept.hook,
            sub: concept.copy.headline && concept.copy.headline !== concept.frames[editing.frameIndex ?? 0]?.onscreen ? concept.copy.headline : "",
            cta: concept.copy.cta || "Shop now",
          }}
          onSaved={(img) => onImages([...images, { ...img, frameIndex: editing.frameIndex ?? null }])}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}
