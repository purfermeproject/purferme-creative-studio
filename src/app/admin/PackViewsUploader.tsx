"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { shrinkForUpload } from "@/components/ImageFileInput";
import { initialActionState } from "@/lib/action-state";
import { PACK_VIEWS, VIEW_NAMES } from "@/lib/pack-views";
import { uploadPackView } from "./actions";

/** Several photos of the pack (every side) at once: each is shrunk and sent on its own, and its side is worked out. */
export function PackViewsUploader({ productId, productName }: { productId: string; productName: string }) {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [view, setView] = useState("auto");
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<{ ok: boolean; text: string }[]>([]);

  async function upload() {
    setBusy(true);
    setLog([]);
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const say = (ok: boolean, text: string) => setLog((l) => [...l, { ok, text: `${f.name}: ${text}` }]);
      try {
        const { file } = await shrinkForUpload(f);
        const fd = new FormData();
        fd.append("id", productId);
        fd.append("view", files.length > 1 ? "auto" : view);
        fd.append("file", file, f.name);
        const r = await uploadPackView(initialActionState, fd);
        say(r.ok === true, r.message);
      } catch (e) {
        say(false, e instanceof Error ? e.message : "Couldn't upload it.");
      }
    }
    setBusy(false);
    setFiles([]);
    router.refresh();
  }

  return (
    <div className="space-y-2" data-testid={`pack-views-upload-${productId}`}>
      <div className="flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="label">Pack photos</span>
          <input type="file" accept="image/*" multiple aria-label={`Pack photos from every side for ${productName}`} onChange={(e) => setFiles(Array.from(e.currentTarget.files ?? []))} className="text-sm" />
        </label>
        {files.length <= 1 ? (
          <label className="block">
            <span className="label">Side</span>
            <select className="input" value={view} onChange={(e) => setView(e.target.value)} aria-label="Which side">
              <option value="auto">Work it out</option>
              {PACK_VIEWS.map((v) => (
                <option key={v} value={v}>
                  {VIEW_NAMES[v]}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <button type="button" className="btn-secondary" disabled={!files.length || busy} onClick={upload}>
          {busy ? `Uploading ${log.length + 1} of ${files.length}…` : files.length > 1 ? `Upload ${files.length} photos` : "Upload"}
        </button>
      </div>
      {log.length ? (
        <ul className="space-y-0.5 text-xs" data-testid="pack-views-log">
          {log.map((l, i) => (
            <li key={i} className={l.ok ? "text-leaf" : "text-red"}>
              {l.text}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
