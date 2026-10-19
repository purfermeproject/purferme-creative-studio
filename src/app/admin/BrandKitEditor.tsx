"use client";

import { useEffect, useState } from "react";
import { loadBrandFont, uploadAsset } from "@/components/fonts";
import type { BrandFont, BrandKit } from "@/lib/brand-kit";
import { saveBrandKit } from "./actions";

const COLOR_LABELS: Record<keyof BrandKit["colors"], string> = {
  primary: "Primary (buttons, CTA)",
  accent: "Accent (highlights)",
  text: "Text on bands",
  band: "Band / scrim behind text",
};

function FontPicker({ label, value, onChange }: { label: string; value: BrandFont; onChange: (f: BrandFont) => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  return (
    <fieldset className="space-y-2">
      <legend className="label">{label}</legend>
      <input
        className="input"
        value={value.name}
        onChange={(e) => onChange({ name: e.target.value, url: value.url })}
        aria-label={`${label} name`}
        placeholder="Google Fonts name, e.g. Poppins"
      />
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <input
          type="file"
          accept=".ttf,.otf,.woff,.woff2"
          aria-label={`Upload ${label} file`}
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            setBusy(true);
            setErr("");
            try {
              const a = await uploadAsset(f, { kind: "font", label: f.name }, f.name);
              onChange({ name: value.name || f.name.replace(/\\.[^.]+$/, ""), url: a.url });
            } catch (x) {
              setErr(x instanceof Error ? x.message : "Upload failed.");
            } finally {
              setBusy(false);
            }
          }}
        />
        {busy ? <span className="hint">Uploading…</span> : null}
        {value.url ? (
          <button type="button" className="text-accent underline" onClick={() => onChange({ name: value.name, url: null })}>
            Use Google Fonts instead of the uploaded file
          </button>
        ) : (
          <span className="hint">Or upload your own font file.</span>
        )}
      </div>
      {err ? <p className="text-sm text-red">{err}</p> : null}
      <p className="rounded-lg bg-surface-2 p-3 text-2xl" style={{ fontFamily: `"${value.name}", sans-serif` }}>
        Your morning coffee&apos;s new crunch-mate
      </p>
    </fieldset>
  );
}

export function BrandKitEditor({ initial }: { initial: BrandKit }) {
  const [kit, setKit] = useState<BrandKit>(initial);
  const [msg, setMsg] = useState<{ ok: boolean | null; text: string }>({ ok: null, text: "" });
  const [saving, setSaving] = useState(false);
  const [logoBusy, setLogoBusy] = useState(false);

  useEffect(() => {
    loadBrandFont(kit.headingFont);
    loadBrandFont(kit.bodyFont);
  }, [kit.headingFont, kit.bodyFont]);

  return (
    <div className="card space-y-6" data-testid="brand-kit">
      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-2">
          <p className="label">Logo</p>
          <div className="flex items-center gap-4">
            <div className="flex size-24 items-center justify-center rounded-lg border border-dashed border-line bg-[repeating-conic-gradient(#ccc_0%_25%,#fff_0%_50%)] bg-[length:16px_16px]">
              {kit.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={kit.logoUrl} alt="Brand logo" className="max-h-20 max-w-20 object-contain" />
              ) : (
                <span className="text-xs text-neutral-600">No logo</span>
              )}
            </div>
            <div className="space-y-2 text-sm">
              <input
                type="file"
                accept="image/png,image/webp"
                aria-label="Upload logo"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  setLogoBusy(true);
                  try {
                    const a = await uploadAsset(f, { kind: "logo", label: f.name }, f.name);
                    setKit((k) => ({ ...k, logoUrl: a.url }));
                  } catch (x) {
                    setMsg({ ok: false, text: x instanceof Error ? x.message : "Upload failed." });
                  } finally {
                    setLogoBusy(false);
                  }
                }}
              />
              <p className="hint">{logoBusy ? "Uploading…" : "Use a PNG with a transparent background."}</p>
              {kit.logoUrl ? (
                <button type="button" className="text-accent underline" onClick={() => setKit((k) => ({ ...k, logoUrl: null }))}>
                  Remove logo
                </button>
              ) : null}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {(Object.keys(COLOR_LABELS) as (keyof BrandKit["colors"])[]).map((key) => (
            <label key={key} className="block text-sm">
              <span className="mb-1 block font-semibold">{COLOR_LABELS[key]}</span>
              <span className="flex items-center gap-2">
                <input
                  type="color"
                  value={kit.colors[key]}
                  onChange={(e) => setKit((k) => ({ ...k, colors: { ...k.colors, [key]: e.target.value } }))}
                  className="h-10 w-12 cursor-pointer rounded border border-line bg-surface"
                />
                <input
                  className="input py-1.5 font-mono text-sm"
                  value={kit.colors[key]}
                  aria-label={`${COLOR_LABELS[key]} hex`}
                  onChange={(e) => setKit((k) => ({ ...k, colors: { ...k.colors, [key]: e.target.value } }))}
                />
              </span>
            </label>
          ))}
        </div>
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <FontPicker label="Headline font" value={kit.headingFont} onChange={(f) => setKit((k) => ({ ...k, headingFont: f }))} />
        <FontPicker label="Body font" value={kit.bodyFont} onChange={(f) => setKit((k) => ({ ...k, bodyFont: f }))} />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="btn-primary"
          disabled={saving}
          onClick={async () => {
            setSaving(true);
            const r = await saveBrandKit(kit);
            setMsg({ ok: r.ok, text: r.message });
            setSaving(false);
          }}
        >
          {saving ? "Saving…" : "Save brand kit"}
        </button>
        <p role="status" className={`text-sm ${msg.ok === false ? "text-red" : "text-leaf"}`}>
          {msg.text}
        </p>
      </div>
    </div>
  );
}
