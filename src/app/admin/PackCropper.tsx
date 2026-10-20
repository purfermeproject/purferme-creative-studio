"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type PointerEvent } from "react";

type Box = { x: number; y: number; w: number; h: number };
type Mode = "move" | "nw" | "ne" | "sw" | "se";
const MIN = 0.05;
const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

/** Draw a box around just the pack; the crop is saved as the pack photo (pixels copied as-is). */
export function PackCropper({ productId, productName }: { productId: string; productName: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [source, setSource] = useState<{ id: string; url: string } | null>(null);
  const [box, setBox] = useState<Box>({ x: 0.15, y: 0.1, w: 0.7, h: 0.8 });
  const [suggested, setSuggested] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  const area = useRef<HTMLDivElement>(null);
  const drag = useRef<{ mode: Mode; x: number; y: number; start: Box } | null>(null);

  async function start() {
    setOpen(true);
    setLoading(true);
    setMessage(null);
    const res = await fetch(`/api/products/${productId}/pack`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "detect" }) });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) return setMessage({ text: data.error ?? "Couldn't load the photo.", ok: false });
    setSource({ id: data.sourceId, url: data.sourceUrl });
    setSuggested(Boolean(data.box));
    if (data.box) setBox(data.box);
  }

  async function save() {
    if (!source) return;
    setSaving(true);
    const res = await fetch(`/api/products/${productId}/pack`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "crop", sourceId: source.id, box }) });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) return setMessage({ text: data.error ?? "Couldn't save the crop.", ok: false });
    setMessage({ text: "Saved: images now use just the pack.", ok: true });
    setOpen(false);
    router.refresh();
  }

  /** The handle's data-mode says what dragging it does (move the box or resize from a corner). */
  function onDown(e: PointerEvent<HTMLElement>) {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { mode: (e.currentTarget.dataset.mode as Mode) ?? "move", x: e.clientX, y: e.clientY, start: box };
  }

  function onMove(e: PointerEvent) {
    const d = drag.current;
    const r = area.current?.getBoundingClientRect();
    if (!d || !r) return;
    const dx = (e.clientX - d.x) / r.width;
    const dy = (e.clientY - d.y) / r.height;
    const s = d.start;
    if (d.mode === "move") return setBox({ ...s, x: clamp(s.x + dx, 0, 1 - s.w), y: clamp(s.y + dy, 0, 1 - s.h) });
    let { x, y, w, h } = s;
    if (d.mode.includes("w")) {
      const nx = clamp(s.x + dx, 0, s.x + s.w - MIN);
      w = s.w + (s.x - nx);
      x = nx;
    } else w = clamp(s.w + dx, MIN, 1 - s.x);
    if (d.mode.includes("n")) {
      const ny = clamp(s.y + dy, 0, s.y + s.h - MIN);
      h = s.h + (s.y - ny);
      y = ny;
    } else h = clamp(s.h + dy, MIN, 1 - s.y);
    setBox({ x, y, w, h });
  }

  const pct = (v: number) => Math.round(v * 1000) / 10;
  const setPct = (k: keyof Box) => (v: string) => {
    const n = clamp(Number(v) / 100, 0, 1);
    if (Number.isNaN(n)) return;
    setBox((b) => {
      const next = { ...b, [k]: n };
      next.w = clamp(next.w, MIN, 1 - next.x);
      next.h = clamp(next.h, MIN, 1 - next.y);
      return next;
    });
  };

  return (
    <div className="space-y-2" data-testid={`pack-cropper-${productId}`}>
      {!open ? (
        <button type="button" className="btn-secondary px-3 py-1.5 text-sm" onClick={start}>
          Adjust pack crop
        </button>
      ) : (
        <div className="space-y-3 rounded-xl border border-line bg-surface p-3" role="group" aria-label={`Crop the pack for ${productName}`}>
          {loading ? (
            <div className="skeleton h-64 w-full" aria-label="Finding the pack…" />
          ) : source ? (
            <>
              <p className="text-sm">
                {suggested ? "The AI found the pack here. " : ""}Drag the box (or its corners) so it fits tightly around just the pack, leaving out props in front or around it.
              </p>
              <div
                ref={area}
                className="relative mx-auto w-full max-w-md touch-none select-none"
                onPointerMove={onMove}
                onPointerUp={() => (drag.current = null)}
                onPointerCancel={() => (drag.current = null)}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={source.url} alt={`${productName} photo to crop`} className="block w-full rounded-lg" draggable={false} />
                <div className="pointer-events-none absolute inset-0 rounded-lg bg-black/45" style={{ clipPath: `polygon(0 0,100% 0,100% 100%,0 100%,0 0,${box.x * 100}% ${box.y * 100}%,${box.x * 100}% ${(box.y + box.h) * 100}%,${(box.x + box.w) * 100}% ${(box.y + box.h) * 100}%,${(box.x + box.w) * 100}% ${box.y * 100}%,${box.x * 100}% ${box.y * 100}%)` }} />
                <div
                  className="absolute cursor-move border-2 border-gold"
                  style={{ left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${box.w * 100}%`, height: `${box.h * 100}%` }}
                  data-mode="move"
                  onPointerDown={onDown}
                  data-testid="crop-box"
                >
                  {(["nw", "ne", "sw", "se"] as Mode[]).map((m) => (
                    <span
                      key={m}
                      data-mode={m}
                      onPointerDown={onDown}
                      className={`absolute size-4 rounded-full border-2 border-purple bg-gold ${m.includes("n") ? "-top-2" : "-bottom-2"} ${m.includes("w") ? "-left-2" : "-right-2"} ${m === "nw" || m === "se" ? "cursor-nwse-resize" : "cursor-nesw-resize"}`}
                      aria-hidden
                    />
                  ))}
                </div>
              </div>
              <fieldset className="grid grid-cols-4 gap-2 text-xs">
                <legend className="sr-only">Crop box in percent</legend>
                {(
                  [
                    ["x", "Left %"],
                    ["y", "Top %"],
                    ["w", "Width %"],
                    ["h", "Height %"],
                  ] as [keyof Box, string][]
                ).map(([k, label]) => (
                  <label key={k} className="block">
                    <span className="text-ink-soft">{label}</span>
                    <input type="number" step="0.5" min={0} max={100} className="input py-1 text-sm" value={pct(box[k])} onChange={(e) => setPct(k)(e.target.value)} />
                  </label>
                ))}
              </fieldset>
              <div className="flex gap-2">
                <button type="button" className="btn-primary px-3 py-1.5 text-sm" onClick={save} disabled={saving}>
                  {saving ? "Saving…" : "Use this as the pack"}
                </button>
                <button type="button" className="btn-secondary px-3 py-1.5 text-sm" onClick={() => setOpen(false)}>
                  Cancel
                </button>
              </div>
            </>
          ) : null}
        </div>
      )}
      {message ? (
        <p role={message.ok ? "status" : "alert"} className={`text-sm ${message.ok ? "text-leaf" : "text-red"}`}>
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
