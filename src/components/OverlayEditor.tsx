"use client";

import { useEffect, useRef, useState } from "react";
import type { BrandKit } from "@/lib/brand-kit";
import { loadBrandFont, uploadAsset } from "./fonts";
import { drawOverlay, type LogoCorner, type OverlayLayout, type OverlayOptions } from "./overlay-render";

const LAYOUTS: { id: OverlayLayout; label: string }[] = [
  { id: "band", label: "Band at the bottom" },
  { id: "top", label: "Text at the top" },
  { id: "centre", label: "Big centred" },
  { id: "clean", label: "Clean (no band)" },
  { id: "none", label: "Logo only" },
];
const CORNERS: { id: LogoCorner; label: string }[] = [
  { id: "top-left", label: "Top left" },
  { id: "top-right", label: "Top right" },
  { id: "bottom-left", label: "Bottom left" },
  { id: "bottom-right", label: "Bottom right" },
  { id: "none", label: "No logo" },
];

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Couldn't load the image."));
    img.src = src;
  });
}

export function OverlayEditor({
  imageUrl,
  kit,
  defaults,
  creativeId,
  frameIndex,
  baseLabel,
  onSaved,
  onClose,
}: {
  imageUrl: string;
  kit: BrandKit;
  defaults: { headline: string; sub: string; cta: string };
  creativeId?: string | null;
  frameIndex?: number | null;
  baseLabel?: string;
  onSaved: (img: { id: string; url: string; label: string }) => void;
  onClose: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [base, setBase] = useState<HTMLImageElement | null>(null);
  const [logo, setLogo] = useState<HTMLImageElement | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [o, setO] = useState<OverlayOptions>({
    layout: "band",
    headline: defaults.headline,
    sub: defaults.sub,
    cta: defaults.cta || "Shop now",
    showCta: true,
    logoCorner: kit.logoUrl ? "top-left" : "none",
    textScale: 1,
    bandOpacity: 0.85,
  });

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [b, l] = await Promise.all([loadImage(imageUrl), kit.logoUrl ? loadImage(kit.logoUrl).catch(() => null) : Promise.resolve(null)]);
        await Promise.all([loadBrandFont(kit.headingFont), loadBrandFont(kit.bodyFont)]);
        if (!alive) return;
        setBase(b);
        setLogo(l);
        setReady(true);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "Couldn't load the image.");
      }
    })();
    return () => {
      alive = false;
    };
  }, [imageUrl, kit]);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c || !base) return;
    c.width = base.naturalWidth;
    c.height = base.naturalHeight;
    const ctx = c.getContext("2d");
    if (ctx) drawOverlay(ctx, base, logo, kit, o, c.width, c.height);
  }, [base, logo, kit, o]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function save() {
    const c = canvasRef.current;
    if (!c) return;
    setBusy(true);
    setError("");
    try {
      const blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", 0.92));
      if (!blob) throw new Error("Couldn't export the image.");
      const label = `${baseLabel ? `${baseLabel} · ` : ""}with text`;
      const a = await uploadAsset(
        blob,
        { kind: "overlay", label, ...(creativeId ? { creativeId } : {}), ...(frameIndex != null ? { frameIndex: String(frameIndex) } : {}) },
        "overlay.jpg",
      );
      onSaved({ id: a.id, url: a.url, label });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const set = <K extends keyof OverlayOptions>(k: K, v: OverlayOptions[K]) => setO((cur) => ({ ...cur, [k]: v }));

  return (
    <div role="dialog" aria-modal="true" aria-label="Add text and logo" className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4" data-testid="overlay-editor">
      <div className="w-full max-w-6xl rounded-2xl border border-line bg-surface p-4 sm:p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-xl font-bold">Add text &amp; logo</h2>
          <button type="button" className="btn-secondary px-3 py-1.5 text-sm" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
          <div className="flex items-start justify-center rounded-xl bg-surface-2 p-3">
            {!ready && !error ? <p className="hint p-10">Loading image and brand fonts…</p> : null}
            <canvas ref={canvasRef} className={`max-h-[70vh] w-auto max-w-full rounded-lg shadow ${ready ? "" : "hidden"}`} data-testid="overlay-canvas" />
          </div>
          <div className="space-y-4">
            <div>
              <label className="label" htmlFor="ov-layout">
                Layout
              </label>
              <select id="ov-layout" className="input" value={o.layout} onChange={(e) => set("layout", e.target.value as OverlayLayout)}>
                {LAYOUTS.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="ov-headline">
                Headline
              </label>
              <textarea id="ov-headline" className="input" rows={2} value={o.headline} onChange={(e) => set("headline", e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="ov-sub">
                Sub-line <span className="font-normal text-ink-soft">(optional)</span>
              </label>
              <textarea id="ov-sub" className="input" rows={2} value={o.sub} onChange={(e) => set("sub", e.target.value)} />
            </div>
            <div className="flex items-end gap-3">
              <label className="flex items-center gap-2 pb-2 text-sm">
                <input type="checkbox" checked={o.showCta} onChange={(e) => set("showCta", e.target.checked)} /> Button
              </label>
              <div className="flex-1">
                <label className="label" htmlFor="ov-cta">
                  Button text
                </label>
                <input id="ov-cta" className="input" value={o.cta} disabled={!o.showCta} onChange={(e) => set("cta", e.target.value)} />
              </div>
            </div>
            <div>
              <label className="label" htmlFor="ov-logo">
                Logo
              </label>
              <select id="ov-logo" className="input" value={o.logoCorner} onChange={(e) => set("logoCorner", e.target.value as LogoCorner)} disabled={!kit.logoUrl}>
                {CORNERS.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
              {!kit.logoUrl ? <p className="hint mt-1">Add your logo in Tools → Settings → Brand kit.</p> : null}
            </div>
            <label className="block text-sm">
              <span className="label">Text size</span>
              <input type="range" min={0.7} max={1.5} step={0.05} value={o.textScale} onChange={(e) => set("textScale", Number(e.target.value))} className="w-full" />
            </label>
            <label className="block text-sm">
              <span className="label">Band strength</span>
              <input type="range" min={0} max={1} step={0.05} value={o.bandOpacity} onChange={(e) => set("bandOpacity", Number(e.target.value))} className="w-full" />
            </label>
            <p className="hint">Text stays inside the platform safe zone. Fonts and colours come from your brand kit.</p>
            {error ? (
              <p role="alert" className="text-sm text-red">
                {error}
              </p>
            ) : null}
            <button type="button" className="btn-primary w-full" disabled={!ready || busy} onClick={save}>
              {busy ? "Saving…" : "Save as new image"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
