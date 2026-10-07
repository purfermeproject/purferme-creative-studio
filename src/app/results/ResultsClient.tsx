"use client";

import Papa from "papaparse";
import { useMemo, useState } from "react";
import {
  guessMapping,
  MARKET_FIELDS,
  META_FIELDS,
  rowToMarketplaceInput,
  rowToMetaInput,
  type MarketField,
  type MetaField,
} from "@/lib/csv-import";
import { PLATFORM_LABELS, type Platform } from "@/lib/types";
import { marketplaceVerdict, metaVerdict, type VerdictResult, type VerdictThresholds } from "@/lib/verdicts";
import { saveResults, type ResultInputT } from "./actions";

type CreativeOption = { id: string; title: string };
const VERDICT_STYLE: Record<string, string> = {
  Kill: "border-red/30 bg-red-bg text-red",
  Cut: "border-red/30 bg-red-bg text-red",
  Hold: "border-amber/30 bg-amber-bg text-amber",
  Scale: "border-leaf/30 bg-green-bg text-leaf",
};
const CHIP: Record<string, string> = { Kill: "chip-red", Cut: "chip-red", Hold: "chip-amber", Scale: "chip-green" };

function NumberField({ id, label, value, onChange, suffix }: { id: string; label: string; value: string; onChange: (v: string) => void; suffix?: string }) {
  return (
    <div>
      <label htmlFor={id} className="label">
        {label}
      </label>
      <div className="relative">
        <input id={id} type="number" inputMode="decimal" step="any" min={0} className="input pr-10" value={value} onChange={(e) => onChange(e.target.value)} />
        {suffix ? <span className="pointer-events-none absolute top-2 right-3 text-ink-soft">{suffix}</span> : null}
      </div>
    </div>
  );
}

function VerdictBox({ v }: { v: VerdictResult<string> }) {
  return (
    <div className={`space-y-2 rounded-xl border p-4 ${VERDICT_STYLE[v.verdict]}`} data-testid="verdict" aria-live="polite">
      <p className="text-2xl font-extrabold">{v.verdict}</p>
      <ul className="list-disc pl-5 text-sm">
        {v.reasons.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>
      {v.warnings.length ? (
        <ul className="space-y-1 text-sm font-semibold">
          {v.warnings.map((w) => (
            <li key={w}>⚠ {w}</li>
          ))}
        </ul>
      ) : null}
      <p className="text-sm text-ink">
        <strong>Next step:</strong> {v.nextStep}
      </p>
    </div>
  );
}

const n = (s: string) => (s.trim() === "" ? null : Number(s));

export function ResultsClient({ platform, thresholds, creatives }: { platform: Platform; thresholds: VerdictThresholds; creatives: CreativeOption[] }) {
  const isMeta = platform === "meta";
  const [f, setF] = useState<Record<string, string>>({});
  const set = (k: string) => (v: string) => setF((cur) => ({ ...cur, [k]: v }));
  const [creativeId, setCreativeId] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [notes, setNotes] = useState("");
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const manual = useMemo(() => {
    if (isMeta) {
      const req = ["targetCpa", "spend", "hookRate", "ctr"];
      if (req.some((k) => n(f[k] ?? "") == null)) return null;
      const input = { targetCpa: n(f.targetCpa)!, spend: n(f.spend)!, hookRate: n(f.hookRate)!, ctr: n(f.ctr)!, cpa: n(f.cpa ?? ""), frequency: n(f.frequency ?? "") ?? 0 };
      return { input, v: metaVerdict(input, thresholds.meta) };
    }
    const req = ["targetAcos", "acos", "ctr", "conversionRate", "clicks"];
    if (req.some((k) => n(f[k] ?? "") == null)) return null;
    const input = { targetAcos: n(f.targetAcos)!, acos: n(f.acos)!, ctr: n(f.ctr)!, conversionRate: n(f.conversionRate)!, clicks: n(f.clicks)! };
    return { input, v: marketplaceVerdict(input, thresholds.marketplace) };
  }, [f, isMeta, thresholds]);

  async function save(rows: ResultInputT[]) {
    setSaving(true);
    setSaveMsg(null);
    const res = await saveResults(rows);
    setSaving(false);
    setSaveMsg(res.ok ? { ok: true, text: `Saved ${res.count} ${res.count === 1 ? "result" : "results"}.` } : { ok: false, text: res.message });
  }

  // ---- CSV upload ----
  const [csv, setCsv] = useState<{ headers: string[]; rows: Record<string, string>[]; file: string } | null>(null);
  const [csvError, setCsvError] = useState("");
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [target, setTarget] = useState("");
  const [csvSaveMsg, setCsvSaveMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const fields = isMeta ? META_FIELDS : MARKET_FIELDS;

  function onFile(file: File | undefined) {
    setCsvError("");
    setCsv(null);
    setCsvSaveMsg(null);
    if (!file) return;
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        const headers = (res.meta.fields ?? []).filter(Boolean);
        if (!headers.length || !res.data.length) return setCsvError("That file has no rows. Export the report as CSV with a header row and try again.");
        setCsv({ headers, rows: res.data.slice(0, 1000), file: file.name });
        setMapping(guessMapping(headers, fields as { key: string; patterns: RegExp[] }[]) as Record<string, string>);
      },
      error: (err) => setCsvError(`Couldn't read that file: ${err.message}`),
    });
  }

  const mapped = useMemo(() => {
    if (!csv || n(target) == null) return null;
    return csv.rows.map((row) => {
      if (isMeta) {
        const r = rowToMetaInput(row, mapping as Partial<Record<MetaField, string>>, n(target)!);
        return { ...r, v: r.input ? metaVerdict(r.input, thresholds.meta) : null };
      }
      const r = rowToMarketplaceInput(row, mapping as Partial<Record<MarketField, string>>, n(target)!);
      return { ...r, v: r.input ? marketplaceVerdict(r.input, thresholds.marketplace) : null };
    });
  }, [csv, mapping, target, isMeta, thresholds]);

  return (
    <div className="space-y-8">
      <section aria-labelledby="manual-h" className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <form
          className="card space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (manual) save([{ platform, creativeId: creativeId || null, periodStart, periodEnd, metrics: manual.input, notes }]);
          }}
        >
          <h2 id="manual-h" className="text-2xl font-bold tracking-tight">
            Enter numbers
          </h2>
          {isMeta ? (
            <div className="grid gap-3 sm:grid-cols-3">
              <NumberField id="targetCpa" label="Target CPA" suffix="Rs" value={f.targetCpa ?? ""} onChange={set("targetCpa")} />
              <NumberField id="spend" label="Spend" suffix="Rs" value={f.spend ?? ""} onChange={set("spend")} />
              <NumberField id="hookRate" label="Hook rate" suffix="%" value={f.hookRate ?? ""} onChange={set("hookRate")} />
              <NumberField id="ctr" label="Link CTR" suffix="%" value={f.ctr ?? ""} onChange={set("ctr")} />
              <NumberField id="cpa" label="CPA (blank if no sales)" suffix="Rs" value={f.cpa ?? ""} onChange={set("cpa")} />
              <NumberField id="frequency" label="7-day frequency" value={f.frequency ?? ""} onChange={set("frequency")} />
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-3">
              <NumberField id="targetAcos" label="Target ACoS" suffix="%" value={f.targetAcos ?? ""} onChange={set("targetAcos")} />
              <NumberField id="acos" label="Actual ACoS" suffix="%" value={f.acos ?? ""} onChange={set("acos")} />
              <NumberField id="ctr" label="CTR" suffix="%" value={f.ctr ?? ""} onChange={set("ctr")} />
              <NumberField id="conversionRate" label="Conversion rate" suffix="%" value={f.conversionRate ?? ""} onChange={set("conversionRate")} />
              <NumberField id="clicks" label="Clicks" value={f.clicks ?? ""} onChange={set("clicks")} />
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="sm:col-span-3">
              <label htmlFor="creative" className="label">
                Link to a saved creative <span className="font-normal text-ink-soft">(optional)</span>
              </label>
              <select id="creative" className="input" value={creativeId} onChange={(e) => setCreativeId(e.target.value)}>
                <option value="">Not linked</option>
                {creatives.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="ps" className="label">
                Period start
              </label>
              <input id="ps" type="date" className="input" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
            </div>
            <div>
              <label htmlFor="pe" className="label">
                Period end
              </label>
              <input id="pe" type="date" className="input" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
            </div>
            <div>
              <label htmlFor="notes" className="label">
                Notes
              </label>
              <input id="notes" className="input" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" className="btn-primary" disabled={!manual || saving}>
              {saving ? "Saving…" : "Save result"}
            </button>
            {saveMsg ? (
              <p role={saveMsg.ok ? "status" : "alert"} className={`text-sm ${saveMsg.ok ? "text-leaf" : "text-red"}`}>
                {saveMsg.text}
              </p>
            ) : null}
          </div>
        </form>
        <div className="space-y-2">
          {manual ? <VerdictBox v={manual.v} /> : <div className="card hint">Fill in the numbers to see the verdict. It updates as you type.</div>}
        </div>
      </section>

      <section aria-labelledby="csv-h" className="card space-y-4">
        <div>
          <h2 id="csv-h" className="text-2xl font-bold tracking-tight">
            Upload a report
          </h2>
          <p className="hint">
            {isMeta
              ? "Export from Meta Ads Manager at ad level as CSV (include amount spent, impressions, 3-second video plays, link CTR, results, cost per result, frequency)."
              : `Upload a ${PLATFORM_LABELS[platform]} ${platform === "amazon" ? "search-term" : "campaign"} report as CSV. Check the column mapping, then review the verdict per row.`}
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="csvfile" className="label">
              CSV file
            </label>
            <input id="csvfile" type="file" accept=".csv,text/csv" className="text-sm" onChange={(e) => onFile(e.target.files?.[0])} />
          </div>
          <NumberField id="target" label={isMeta ? "Target CPA for this report" : "Target ACoS for this report"} suffix={isMeta ? "Rs" : "%"} value={target} onChange={setTarget} />
        </div>
        {csvError ? (
          <p role="alert" className="text-red">
            {csvError}
          </p>
        ) : null}
        {csv ? (
          <>
            <fieldset className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <legend className="label mb-2">
                Column mapping for {csv.file} ({csv.rows.length} rows)
              </legend>
              {fields.map((fd) => (
                <div key={fd.key}>
                  <label htmlFor={`map-${fd.key}`} className="text-sm font-semibold">
                    {fd.label}
                  </label>
                  <select id={`map-${fd.key}`} className="input" value={mapping[fd.key] ?? ""} onChange={(e) => setMapping((m) => ({ ...m, [fd.key]: e.target.value }))}>
                    <option value="">(not in file)</option>
                    {csv.headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </fieldset>
            {mapped ? (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm" data-testid="csv-verdicts">
                    <thead className="border-b border-line text-ink-soft">
                      <tr>
                        <th className="py-2 pr-3">{isMeta ? "Ad" : "Term / campaign"}</th>
                        <th className="py-2 pr-3">Numbers</th>
                        <th className="py-2 pr-3">Verdict</th>
                        <th className="py-2">Why / next step</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mapped.map((r, i) => (
                        <tr key={i} className="border-b border-line align-top">
                          <td className="py-2 pr-3 font-semibold">{r.name}</td>
                          <td className="py-2 pr-3 whitespace-nowrap text-ink-soft">
                            {r.input
                              ? Object.entries(r.input)
                                  .filter(([k]) => !k.startsWith("target"))
                                  .map(([k, v]) => `${k} ${v == null ? "–" : Number(v).toFixed(2).replace(/\.?0+$/, "")}`)
                                  .join(" · ")
                              : "–"}
                          </td>
                          <td className="py-2 pr-3">{r.v ? <span className={CHIP[r.v.verdict]}>{r.v.verdict}</span> : <span className="chip">Can&apos;t judge</span>}</td>
                          <td className="py-2">{r.v ? [...r.v.reasons, ...r.v.warnings, r.v.nextStep].join(" ") : `Missing ${r.missing.join(", ")}. Check the column mapping.`}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    className="btn-primary"
                    disabled={saving || !mapped.some((r) => r.input)}
                    onClick={async () => {
                      const rows = mapped.filter((r) => r.input).map((r) => ({ platform, metrics: { ...r.input!, name: r.name }, periodStart, periodEnd, notes: `From ${csv.file}` }));
                      setSaving(true);
                      const res = await saveResults(rows);
                      setSaving(false);
                      setCsvSaveMsg(res.ok ? { ok: true, text: `Saved ${res.count} results.` } : { ok: false, text: res.message });
                    }}
                  >
                    Save {mapped.filter((r) => r.input).length} rows to results
                  </button>
                  {csvSaveMsg ? (
                    <p role={csvSaveMsg.ok ? "status" : "alert"} className={`text-sm ${csvSaveMsg.ok ? "text-leaf" : "text-red"}`}>
                      {csvSaveMsg.text}
                    </p>
                  ) : null}
                </div>
              </>
            ) : (
              <p className="hint">Enter the target above to see a verdict per row.</p>
            )}
          </>
        ) : null}
      </section>
    </div>
  );
}
