"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { categoryFrom } from "@/lib/landscape";
import { readNdjson } from "@/lib/ndjson";
import { PLACEMENTS } from "@/lib/placements";
import { can } from "@/lib/roles";
import type { Proposal } from "@/lib/schemas";
import type { ScanResult } from "@/lib/compliance";
import { OBJECTIVES, PLATFORM_FULL_LABELS, type Platform, type Role } from "@/lib/types";

type ProductRow = { id: string; name: string; competitors: number; playbooks: { platform: "amazon" | "flipkart"; date: string }[] };
type IdeaSet = { id: string; productId: string; platform: Platform; creativeType: string; proposals: (Proposal & { scan: ScanResult })[]; mock: boolean; date: string };
type Step = { key: string; label: string; status: "waiting" | "running" | "done" | "error"; detail: string };

const RESEARCH_LABEL: Record<Platform, string> = {
  meta: "Instagram & Facebook: competitors' ads and hooks",
  amazon: "Amazon.in: best-selling listings and why they win",
  flipkart: "Flipkart: best-selling listings and why they win",
};

async function post(url: string, body?: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Failed (${res.status}).`);
  return data;
}

function IdeaCard({ p, href }: { p: Proposal & { scan: ScanResult }; href: string }) {
  const reds = p.scan.hits.filter((h) => h.severity === "red").length;
  return (
    <li className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-4 text-sm" data-testid="research-idea">
      <p className="font-semibold">{p.title}</p>
      <p className="font-serif text-base text-ink">“{p.hook}”</p>
      <p className="flex-1 text-ink-soft">{p.big_idea}</p>
      {p.based_on ? <p className="text-xs font-semibold text-caramel-ink">{p.based_on}</p> : null}
      <div className="flex items-center justify-between gap-2">
        {reds ? <span className="chip-red">{reds} red flag{reds > 1 ? "s" : ""}</span> : <span className="chip-green">No flagged words</span>}
        <Link href={href} className="btn-primary px-3 py-1 text-xs">
          Develop
        </Link>
      </div>
    </li>
  );
}

export function ResearchClient({
  role,
  language,
  creativeTypes,
  products,
  sets,
}: {
  role: Role;
  language: string;
  creativeTypes: Record<Platform, string[]>;
  products: ProductRow[];
  sets: IdeaSet[];
}) {
  const router = useRouter();
  const [productId, setProductId] = useState(products.find((p) => p.name.startsWith("Chocolate"))?.id ?? products[0]?.id ?? "");
  const [platforms, setPlatforms] = useState<Platform[]>(["meta", "amazon", "flipkart"]);
  const [objective, setObjective] = useState("conversion");
  const [count, setCount] = useState(5);
  const [steps, setSteps] = useState<Step[]>([]);
  const [running, setRunning] = useState(false);
  const product = products.find((p) => p.id === productId);
  const mine = sets.filter((s) => s.productId === productId);
  const latest = (["meta", "amazon", "flipkart"] as Platform[]).map((pl) => mine.find((s) => s.platform === pl)).filter((s): s is IdeaSet => Boolean(s));
  const canRun = can(role, "generate");

  const update = (key: string, patch: Partial<Step>) => setSteps((list) => list.map((s) => (s.key === key ? { ...s, ...patch } : s)));

  async function run() {
    if (!product) return;
    const category = categoryFrom(product.name);
    const plan: Step[] = [
      ...platforms.map((pl) => ({ key: `research-${pl}`, label: RESEARCH_LABEL[pl], status: "waiting" as const, detail: "" })),
      { key: "analyse", label: "Break down each competitor", status: "waiting", detail: "" },
      ...platforms.map((pl) => ({ key: `ideas-${pl}`, label: `Ideas for ${PLATFORM_FULL_LABELS[pl]}`, status: "waiting" as const, detail: "" })),
    ];
    setSteps(plan);
    setRunning(true);
    const toAnalyse = new Set<string>();
    for (const pl of platforms) {
      const key = `research-${pl}`;
      update(key, { status: "running", detail: "Searching… (1–4 minutes)" });
      try {
        const data =
          pl === "meta"
            ? await post("/api/competitors/discover", { category, focus: "ads", count, productId })
            : await post("/api/competitors/marketplace", { platform: pl, category, count, productId });
        (data.ids as string[]).forEach((id) => toAnalyse.add(id));
        update(key, {
          status: "done",
          detail: `${pl === "meta" ? `${data.ids.length} new brands${data.linked ? `, ${data.linked} already known` : ""}` : `${data.ids.length} listings studied`}${data.mock ? " (mock: sample data)" : ""}`,
        });
      } catch (e) {
        update(key, { status: "error", detail: e instanceof Error ? e.message : "Failed." });
      }
    }
    const ids = [...toAnalyse];
    update("analyse", { status: "running", detail: `0 of ${ids.length}` });
    let done = 0;
    for (let i = 0; i < ids.length; i += 3) {
      await Promise.all(
        ids.slice(i, i + 3).map((id) =>
          post(`/api/competitors/${id}/analyse`)
            .catch(() => null)
            .then(() => update("analyse", { detail: `${++done} of ${ids.length}` })),
        ),
      );
    }
    update("analyse", { status: "done", detail: ids.length ? `${done} broken down` : "Nothing new to break down" });
    for (const pl of platforms) {
      const key = `ideas-${pl}`;
      update(key, { status: "running", detail: "Writing 3 ideas…" });
      try {
        const creativeType = creativeTypes[pl][0] ?? "";
        const placement = PLACEMENTS[pl][0]?.label ?? "";
        const res = await fetch("/api/generate", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            mode: "proposals",
            platform: pl,
            productId,
            creativeType,
            placement: placement || undefined,
            angle: "auto",
            persona: "auto",
            language,
            objective,
            deliverable: "concept",
            n: 3,
            useLandscape: true,
            usePlaybook: true,
          }),
        });
        const result = await readNdjson<{ proposals: (Proposal & { scan: ScanResult })[]; mock: boolean }>(res, () => {});
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const proposals = result.proposals.map(({ scan, ...p }) => p);
        await post("/api/idea-sets", { productId, platform: pl, creativeType, placement, proposals, mock: result.mock });
        update(key, { status: "done", detail: `${proposals.length} ideas` });
      } catch (e) {
        update(key, { status: "error", detail: e instanceof Error ? e.message : "Failed." });
      }
    }
    setRunning(false);
    router.refresh();
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
      <form
        className="card h-fit space-y-4 lg:sticky lg:top-4"
        aria-label="Research a product"
        onSubmit={(e) => {
          e.preventDefault();
          run();
        }}
      >
        <div>
          <label htmlFor="r-product" className="label">
            Product
          </label>
          <select id="r-product" className="input" value={productId} onChange={(e) => setProductId(e.target.value)} disabled={running}>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          {product ? (
            <p className="hint mt-1 text-xs" data-testid="research-known">
              Known so far: {product.competitors} competitor{product.competitors === 1 ? "" : "s"} broken down
              {product.playbooks.length ? `; playbooks for ${[...new Set(product.playbooks.map((b) => (b.platform === "amazon" ? "Amazon" : "Flipkart")))].join(" and ")}` : ""}.
            </p>
          ) : null}
        </div>
        <fieldset>
          <legend className="label">Platforms</legend>
          <div className="space-y-1.5">
            {(["meta", "amazon", "flipkart"] as Platform[]).map((pl) => (
              <label key={pl} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4 accent-(--purple)"
                  checked={platforms.includes(pl)}
                  disabled={running}
                  onChange={(e) => setPlatforms((list) => (e.target.checked ? [...list, pl].sort((a, b) => ["meta", "amazon", "flipkart"].indexOf(a) - ["meta", "amazon", "flipkart"].indexOf(b)) : list.filter((x) => x !== pl)))}
                />
                {PLATFORM_FULL_LABELS[pl]}
              </label>
            ))}
          </div>
        </fieldset>
        <div>
          <label htmlFor="r-objective" className="label">
            Objective for the ideas
          </label>
          <select id="r-objective" className="input" value={objective} onChange={(e) => setObjective(e.target.value)} disabled={running}>
            {OBJECTIVES.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <fieldset>
          <legend className="label">Competitors per platform</legend>
          <div className="grid grid-cols-3 gap-1 rounded-lg border border-line bg-surface-2 p-1">
            {[3, 5, 8].map((k) => (
              <label key={k} className={`cursor-pointer rounded-md py-1.5 text-center text-sm font-semibold has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-purple ${count === k ? "bg-purple text-accent-ink" : "text-ink-soft"}`}>
                <input type="radio" name="r-count" value={k} checked={count === k} onChange={() => setCount(k)} className="sr-only" disabled={running} />
                {k}
              </label>
            ))}
          </div>
        </fieldset>
        <button type="submit" className="btn-primary w-full py-3" disabled={running || !canRun || !product || platforms.length === 0}>
          {running ? "Researching…" : "Research and propose ideas"}
        </button>
        <p className="hint text-xs">
          Takes about 3–10 minutes for three platforms and uses web search plus AI on your account. Keep this tab open. Brands already researched are not searched again.
        </p>
        {!canRun ? <p className="hint">Your role can view research but not run it.</p> : null}
      </form>

      <section className="min-w-0 space-y-5" aria-label="Research results" aria-live="polite">
        {steps.length ? (
          <ol className="card space-y-2" data-testid="research-steps">
            {steps.map((s) => (
              <li key={s.key} className="flex items-start gap-3 text-sm" data-status={s.status}>
                <span
                  className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                    s.status === "done" ? "bg-leaf text-white" : s.status === "error" ? "bg-red text-white" : s.status === "running" ? "animate-pulse bg-caramel text-white" : "bg-surface-2 text-ink-soft"
                  }`}
                  aria-hidden
                >
                  {s.status === "done" ? "✓" : s.status === "error" ? "!" : "…"}
                </span>
                <span>
                  <span className="font-semibold">{s.label}</span>
                  {s.detail ? <span className={`block ${s.status === "error" ? "text-red" : "text-ink-soft"}`}>{s.detail}</span> : null}
                </span>
              </li>
            ))}
          </ol>
        ) : null}

        {latest.length ? (
          latest.map((set) => (
            <div key={set.id} className="space-y-3" data-testid={`ideas-${set.platform}`}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="display text-2xl">Ideas for {PLATFORM_FULL_LABELS[set.platform]}</h2>
                <p className="text-xs text-ink-soft">
                  {set.creativeType} · {new Date(set.date).toLocaleDateString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                  {set.mock ? " · sample output (mock mode)" : ""}
                </p>
              </div>
              <ul className="grid gap-3 md:grid-cols-3">
                {set.proposals.map((p, i) => (
                  <IdeaCard key={i} p={p} href={`/create?ideas=${set.id}&i=${i}`} />
                ))}
              </ul>
            </div>
          ))
        ) : !steps.length ? (
          <div className="card border-dashed text-center" data-testid="research-empty">
            <p className="display text-xl">No research for this product yet</p>
            <p className="hint mt-1">Choose the platforms on the left and press “Research and propose ideas”.</p>
          </div>
        ) : null}
        <p className="hint text-xs">
          All competitors found are on the <Link href="/competitors" className="font-semibold text-purple underline">Competitors</Link> page, with sources and breakdowns.
        </p>
      </section>
    </div>
  );
}
