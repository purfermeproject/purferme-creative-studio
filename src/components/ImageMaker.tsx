"use client";

import { useState } from "react";
import type { BrandKit } from "@/lib/brand-kit";
import { defaultSpecFor, IMAGE_SPECS, MAX_SIDE, MIN_SIDE, neededSpecsFor } from "@/lib/image-specs";
import { findPlacement } from "@/lib/placements";
import { OverlayEditor, addTextAutomatically, defaultOverlay, packLayoutOf } from "./OverlayEditor";
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
  photos = [],
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
  /** Extra real product photos that can be placed instead of the pack photo. */
  photos?: { id: string; label: string }[];
}) {
  const place = findPlacement(platform, placement);
  const [previewing, setPreviewing] = useState<MadeImage | null>(null);
  const [wordsFor, setWordsFor] = useState<string | null>(null);
  const [instruction, setInstruction] = useState("");
  const [working, setWorking] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [comparing, setComparing] = useState(false);
  const [textMode, setTextMode] = useState<"auto" | "overlay" | "ai">("auto");
  const [packMode, setPackMode] = useState<"layout" | "locked" | "none">("layout");
  const [packPosition, setPackPosition] = useState<"right" | "center" | "left">("right");
  const [packScale, setPackScale] = useState<"small" | "medium" | "large">("medium");
  const [photoId, setPhotoId] = useState("");
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

  // The editable part of the image prompt. null = use the app's own direction for each scene.
  const [promptOpen, setPromptOpen] = useState(false);
  const [direction, setDirection] = useState<string | null>(null);
  const [draftDirection, setDraftDirection] = useState("");
  const [rules, setRules] = useState("");
  const [promptBusy, setPromptBusy] = useState(false);

  const needed = neededSpecsFor(platform, creativeType);
  const imageBody = (frameIndex: number, spec?: string) => ({
    platform,
    productId,
    creativeType,
    concept,
    frameIndex,
    creativeId: creativeId ?? null,
    packImage: packImage ?? null,
    specId: spec ?? (specId === CUSTOM ? null : specId),
    textMode: textMode === "ai" ? "ai" : "overlay",
    packMode,
    packPosition,
    packScale,
    photoId: packMode !== "none" && photoId ? photoId : null,
    custom: !spec && specId === CUSTOM ? { w: customW, h: customH } : null,
    direction: direction ?? undefined,
  });

  async function loadPrompt(reset = false) {
    setPromptBusy(true);
    setError("");
    try {
      const res = await fetch("/api/image", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...imageBody(frame), direction: reset ? undefined : (direction ?? undefined), preview: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't load the prompt.");
      setDraftDirection(data.direction);
      setRules(data.rules);
      if (reset) setDirection(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load the prompt.");
    } finally {
      setPromptBusy(false);
    }
  }

  async function requestImage(frameIndex: number, spec?: string): Promise<MadeImage & { usedPackPhoto: boolean; warning: string }> {
    const res = await fetch("/api/image", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(imageBody(frameIndex, spec)),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Couldn't make the image. Try again.");
    return { id: data.id, url: data.url, label: data.label, frameIndex, usedPackPhoto: data.usedPackPhoto || packMode === "none", warning: data.warning || "" };
  }

  /** frames × sizes: each size is made for its own shape (pack placed and text laid out to fit), not cropped. */
  async function make(frames: number[], sizes: (string | undefined)[] = [undefined]) {
    setBusy(true);
    setError("");
    setNote("");
    let acc = [...images];
    let usedPack = true;
    const warnings: string[] = [];
    try {
      const jobs = frames.flatMap((f) => sizes.map((size) => ({ f, size })));
      for (let j = 0; j < jobs.length; j++) {
        const { f, size } = jobs[j];
        const i = frames.indexOf(f);
        const sizeLabel = size ? specs.find((x) => x.id === size)?.label : "";
        if (jobs.length > 1) setProgress(`${sizeLabel || `Scene ${i + 1}`} (${j + 1} of ${jobs.length})…`);
        const img = await requestImage(frames[i], size);
        usedPack &&= img.usedPackPhoto;
        if (img.warning) warnings.push(img.warning);
        acc = [...acc, { id: img.id, url: img.url, label: img.label, frameIndex: img.frameIndex }];
        onImages(acc);
        if (textMode === "auto") {
          // The finished ad carries its hook: add the scene's on-screen line, CTA and logo straight away.
          if (jobs.length === 1) setProgress("Adding the hook and logo…");
          try {
            const t = await addTextAutomatically({
              imageUrl: img.url,
              kit,
              options: defaultOverlay(kit, textDefaults(frames[i]), packMode === "layout" ? "panel" : packMode === "locked" ? "scene" : "none"),
              label: img.label ?? "Image",
              creativeId,
              frameIndex: frames[i],
            });
            acc = [...acc, { ...t, frameIndex: frames[i] }];
            onImages(acc);
          } catch {
            warnings.push("Couldn't add the text automatically; use Add text on the image.");
          }
        }
      }
      if (!usedPack) warnings.push("No pack photo on file, so the pack was left out. Add one in Tools → Settings → Products to place the real pack in images.");
      if (warnings.length) setNote(warnings.join(" "));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't make the image. Try again.");
    } finally {
      setBusy(false);
      setProgress("");
    }
  }

  /** The words for a scene's image: its on-screen line (the hook on scene 1), headline as the sub-line, and the CTA. */
  function textDefaults(frameIndex: number) {
    const onscreen = concept.frames[frameIndex]?.onscreen;
    return {
      headline: onscreen || (frameIndex === 0 ? concept.hook : "") || concept.copy.headline || concept.hook,
      sub: concept.copy.headline && concept.copy.headline !== onscreen ? concept.copy.headline : "",
      cta: concept.copy.cta || "Shop now",
    };
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
          <option value="auto">Text: add the hook and logo automatically</option>
          <option value="overlay">Text: I&apos;ll add it after</option>
          <option value="ai">Text: AI draws it in the image</option>
        </select>
        <label htmlFor={`pack-${concept.title}`} className="sr-only">
          Pack in the image
        </label>
        <select id={`pack-${concept.title}`} className="input w-auto py-1.5 text-sm" value={packMode} onChange={(e) => setPackMode(e.target.value as typeof packMode)}>
          <option value="layout">Pack: real pack on a brand panel (recommended)</option>
          <option value="locked">Pack: real pack inside the scene (AI blends it; check it)</option>
          <option value="none">No pack in this image</option>
        </select>
        {packMode !== "none" ? (
          <>
            {photos.length ? (
              <>
                <label htmlFor={`photo-${concept.title}`} className="sr-only">
                  Which product photo
                </label>
                <select id={`photo-${concept.title}`} className="input w-auto py-1.5 text-sm" value={photoId} onChange={(e) => setPhotoId(e.target.value)}>
                  <option value="">Photo: pack</option>
                  {photos.map((p) => (
                    <option key={p.id} value={p.id}>
                      Photo: {p.label}
                    </option>
                  ))}
                </select>
              </>
            ) : null}
            <label htmlFor={`packpos-${concept.title}`} className="sr-only">
              Pack position
            </label>
            <select id={`packpos-${concept.title}`} className="input w-auto py-1.5 text-sm" value={packPosition} onChange={(e) => setPackPosition(e.target.value as typeof packPosition)}>
              <option value="right">Pack on the right</option>
              <option value="center">Pack in the centre</option>
              <option value="left">Pack on the left</option>
            </select>
            {packMode === "locked" ? (
              <>
                <label htmlFor={`packsize-${concept.title}`} className="sr-only">
                  Pack size
                </label>
                <select id={`packsize-${concept.title}`} className="input w-auto py-1.5 text-sm" value={packScale} onChange={(e) => setPackScale(e.target.value as typeof packScale)}>
                  <option value="small">Small pack</option>
                  <option value="medium">Medium pack</option>
                  <option value="large">Large pack</option>
                </select>
              </>
            ) : null}
          </>
        ) : null}
        <button type="button" className="btn-secondary" onClick={() => make([frame])} disabled={busy || (specId === CUSTOM && !customValid)}>
          {busy ? progress || "Making image… (up to a minute)" : images.length ? "Make another image" : "Make image"}
        </button>
        {needed.length > 1 ? (
          <button
            type="button"
            className="btn-secondary"
            onClick={() => make([frame], needed.map((s) => s.id))}
            disabled={busy}
            title={`Makes ${needed.map((s) => `${s.label} (${s.w}×${s.h})`).join(", ")}, each composed for its own shape`}
          >
            Make all {needed.length} sizes {platform === "meta" ? "Instagram & Facebook" : platform === "amazon" ? "Amazon" : "Flipkart"} needs
          </button>
        ) : null}
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
      <div className="rounded-lg border border-line" data-testid="prompt-editor">
        <button
          type="button"
          className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-semibold"
          aria-expanded={promptOpen}
          onClick={() => {
            const next = !promptOpen;
            setPromptOpen(next);
            if (next) void loadPrompt();
          }}
        >
          <span>
            Prompt{direction !== null ? <span className="ml-2 chip-amber">edited</span> : null}
          </span>
          <span aria-hidden>{promptOpen ? "▾" : "▸"}</span>
        </button>
        {promptOpen ? (
          <div className="space-y-2 border-t border-line p-3">
            {promptBusy && !draftDirection ? (
              <div className="skeleton h-28 w-full" />
            ) : (
              <>
                <label htmlFor={`direction-${concept.title}`} className="text-sm font-semibold">
                  What the picture shows and how it&apos;s shot <span className="font-normal text-ink-soft">(edit freely)</span>
                </label>
                <textarea id={`direction-${concept.title}`} className="input font-mono text-xs" rows={9} value={draftDirection} onChange={(e) => setDraftDirection(e.target.value)} />
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" className="btn-secondary px-3 py-1 text-xs" onClick={() => setDirection(draftDirection)} disabled={!draftDirection.trim() || draftDirection === direction}>
                    Use this for the next images
                  </button>
                  <button type="button" className="btn-secondary px-3 py-1 text-xs" onClick={() => loadPrompt(true)} disabled={promptBusy}>
                    Reset to the app&apos;s version
                  </button>
                  {direction !== null ? <span className="text-xs text-amber">Your version is used until you reset it.</span> : null}
                </div>
                <details className="text-xs">
                  <summary className="cursor-pointer text-ink-soft">Rules always added (can&apos;t be removed)</summary>
                  <p className="mt-1 rounded bg-surface-2 p-2 font-mono whitespace-pre-wrap text-ink-soft">{rules}</p>
                </details>
                <p className="hint text-xs">The brand-wide photography style is in Settings → Image style.</p>
              </>
            )}
          </div>
        ) : null}
      </div>
      {packMode === "layout" ? (
        <p className="hint">The AI makes the photo only and never sees or draws a pack. Your real pack then stands on a brand-colour panel, unchanged, with the hook on top: it can&apos;t float, be copied or come out the wrong size.</p>
      ) : packMode === "locked" ? (
        <p className="hint">The AI paints the scene around your real pack. It can look natural, but check every image: it sometimes floats, is copied or is the wrong scale.</p>
      ) : (
        <p className="hint">Scene only: no pack at all (the AI is told never to draw one).</p>
      )}
      {specId === CUSTOM && !customValid ? (
        <p className="hint">Width and height must be whole numbers between {MIN_SIDE} and {MAX_SIDE} px.</p>
      ) : specs.find((s) => s.id === specId)?.note ? (
        <p className="hint">{specs.find((s) => s.id === specId)?.note}</p>
      ) : null}
      <p className="hint" data-testid="needed-sizes">
        This ad runs at: {needed.map((s) => `${s.label} (${s.w}×${s.h})`).join(" · ")}.
      </p>
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
                {img.label?.includes("original pack") ? null : (
                  <button type="button" className="text-accent hover:underline" onClick={() => setWordsFor(wordsFor === img.id ? null : img.id)}>
                    Edit with words
                  </button>
                )}
                {img.label?.includes("brand panel") ? null : (
                  // A designed layout would be cut by cropping; "Make all sizes" lays out each size properly instead.
                  <button type="button" className="text-accent hover:underline disabled:opacity-50" disabled={working === img.id} onClick={() => allSizes(img)}>
                    {working === img.id && wordsFor !== img.id ? "Resizing…" : "All sizes"}
                  </button>
                )}
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
                  <button
                    type="submit"
                    className="btn-secondary px-3 py-1 text-sm"
                    disabled={working === img.id || instruction.trim().length < 3}
                  >
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
          defaults={textDefaults(editing.frameIndex ?? 0)}
          pack={packLayoutOf(editing.label)}
          onSaved={(img) => onImages([...images, { ...img, frameIndex: editing.frameIndex ?? null }])}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}
