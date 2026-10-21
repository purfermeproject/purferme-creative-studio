"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { createFromConcept, restoreCreativeVersion, reviewClaims, setWorkspaceStatus } from "@/app/create/actions";
import { setQa, setQaAll } from "@/app/library/actions";
import { ImageMaker } from "@/components/ImageMaker";
import { applyPlatform } from "@/components/PlatformSwitch";
import type { BrandKit } from "@/lib/brand-kit";
import type { Term } from "@/lib/compliance";
import { conceptToText, type ScoredConcept } from "@/lib/concepts";
import { requestImageWithStages } from "@/lib/image-client";
import { readNdjson } from "@/lib/ndjson";
import { PLACEMENTS } from "@/lib/placements";
import { AUTO } from "@/lib/prompts";
import { GATED_STATUSES, requiredQaItems } from "@/lib/qa";
import { can } from "@/lib/roles";
import type { Proposal } from "@/lib/schemas";
import { DELIVERABLES, OBJECTIVES, PLATFORM_FULL_LABELS, type CreativeStatus, type Platform, type Role } from "@/lib/types";
import { validateCreative } from "@/lib/validation";
import { conceptToSnapshot, snapshotToConcept } from "@/lib/versions";
import type { CreativeSnapshot } from "@/db/schema";
import { BriefPanel } from "./BriefPanel";
import { CopyBlockView, CreativePreview, SceneList } from "./CreativePreview";
import { EditorForm } from "./EditorForm";
import { HistoryPanel } from "./HistoryPanel";
import { matchesProduct } from "@/lib/landscape";
import type { Brief, CompetitorOption, InitialBrief, InitialIdeas, LandscapeSummary, OpenCreative, PlaybookOption, ProductCard, RecentCreative, ScoredProposal } from "./types";
import { FlowBar, flowStep } from "./FlowBar";
import { ProposalVisual, sketchRatio } from "./ProposalVisual";
import type { MadeImage } from "@/components/ImageMaker";
import { findPlacement } from "@/lib/placements";
import type { Concept } from "@/lib/schemas";
import { addTextAutomatically, defaultOverlay, packLayoutOf } from "@/components/OverlayEditor";
import { useAutosave, type SaveState } from "./useAutosave";
import { ValidationPanel } from "./ValidationPanel";

const BRIEF_KEY = "pf-brief-v1";
type Progress = { label: string; chars: number; items: number; total: number } | null;
type Tab = "check" | "edit" | "history";

function SaveIndicator({ state, savedAt, error, onRetry }: { state: SaveState; savedAt: Date | null; error: string; onRetry: () => void }) {
  const text: Record<SaveState, string> = {
    saved: savedAt ? `Saved ${savedAt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}` : "All changes saved",
    dirty: "Unsaved changes…",
    saving: "Saving…",
    error: "Couldn't save. Retrying…",
    invalid: error || "This edit can't be saved.",
    conflict: "Changed elsewhere",
  };
  const tone = state === "error" || state === "invalid" || state === "conflict" ? "text-red" : state === "saved" ? "text-leaf" : "text-ink-soft";
  return (
    <span className={`inline-flex items-center gap-2 text-xs font-semibold ${tone}`} role="status" aria-live="polite" data-testid="save-state" data-state={state}>
      <span className={`size-2 rounded-full ${state === "saved" ? "bg-leaf" : state === "saving" || state === "dirty" ? "animate-pulse bg-caramel" : "bg-red"}`} aria-hidden />
      {text[state]}
      {state === "error" ? (
        <button type="button" className="underline" onClick={onRetry}>
          Retry now
        </button>
      ) : null}
    </span>
  );
}

function MockBadge() {
  return (
    <span className="chip-amber" data-testid="mock-badge" title="ANTHROPIC_MOCK=true: sample text, not a real model response">
      Sample output (mock mode)
    </span>
  );
}

function ProposalCard({
  p,
  index,
  mock,
  deliverableLabel,
  busy,
  onDevelop,
  visual,
}: {
  p: ScoredProposal;
  index: number;
  mock: boolean;
  deliverableLabel: string;
  busy: boolean;
  onDevelop: () => void;
  visual: React.ReactNode;
}) {
  const reds = p.scan.hits.filter((h) => h.severity === "red").length;
  const ambers = p.scan.hits.filter((h) => h.severity === "amber").length;
  return (
    <article className="card grid gap-4 sm:grid-cols-[11rem_minmax(0,1fr)]" data-testid={`proposal-${index}`} aria-label={p.title}>
      {visual}
      <div className="min-w-0 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="eyebrow">Direction {index + 1}</span>
        {mock ? <MockBadge /> : null}
        {reds ? <span className="chip-red">{reds} red flag{reds > 1 ? "s" : ""}</span> : ambers ? <span className="chip-amber">{ambers} to check</span> : <span className="chip-green">No flagged words</span>}
      </div>
      <h3 className="display text-xl">{p.title}</h3>
      <p className="font-serif text-lg leading-snug text-ink">“{p.hook}”</p>
      <p className="text-sm text-ink-soft">{p.big_idea}</p>
      {p.based_on ? (
        <p className="text-xs font-semibold text-caramel-ink" data-testid="based-on">
          {p.based_on}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-1.5">
        <span className="chip">{p.persona}</span>
        <span className="chip">{p.angle}</span>
        {p.hook_mechanism ? <span className="chip">{p.hook_mechanism}</span> : null}
        {p.lever ? (
          <span className="chip-green" title="The persuasion principle this idea builds on" data-testid="lever">
            Lever: {p.lever}
          </span>
        ) : null}
      </div>
      <p className="text-sm">
        <span className="font-semibold">Why: </span>
        {p.why}
      </p>
      <button type="button" className="btn-primary w-full sm:w-auto" onClick={onDevelop} disabled={busy}>
        Develop as {deliverableLabel.toLowerCase()}
      </button>
      </div>
    </article>
  );
}

function ProgressCard({ progress }: { progress: NonNullable<Progress> }) {
  return (
    <div className="space-y-3" data-testid="progress" aria-busy="true">
      <div className="card space-y-3">
        <p className="font-semibold">
          {progress.label}
          {progress.total > 1 ? `: ${Math.min(progress.items + 1, progress.total)} of ${progress.total}` : ""}
        </p>
        <div className="h-1.5 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.items} aria-label={progress.label}>
          <div className="h-full bg-gradient-to-r from-purple to-caramel transition-all" style={{ width: `${Math.max(6, (progress.items / Math.max(progress.total, 1)) * 100)}%` }} />
        </div>
        <p className="hint text-xs">{progress.chars > 0 ? `${progress.chars.toLocaleString()} characters received` : "Waiting for the model…"} · Checked against the claims library when it finishes.</p>
      </div>
      {Array.from({ length: Math.min(progress.total, 3) }, (_, i) => (
        <div key={i} className="card space-y-3" aria-hidden>
          <div className="skeleton h-3 w-24" />
          <div className="skeleton h-6 w-2/3" />
          <div className="skeleton h-4 w-full" />
          <div className="skeleton h-4 w-5/6" />
        </div>
      ))}
    </div>
  );
}

export function Workspace({
  initialPlatform,
  products,
  creativeTypes,
  angles,
  personas,
  languages,
  avoidPhrases,
  terms,
  kit,
  role,
  user,
  initialCreative,
  recent,
  competitors,
  initialCompetitorId,
  playbooks,
  landscapes,
  competitorLines,
  initialIdeas,
  initialBrief,
}: {
  initialPlatform: Platform;
  products: ProductCard[];
  creativeTypes: Record<Platform, string[]>;
  angles: string[];
  personas: string[];
  languages: string[];
  avoidPhrases: string[];
  terms: Term[];
  kit: BrandKit;
  role: Role;
  user: string;
  initialCreative: OpenCreative | null;
  recent: RecentCreative[];
  competitors: CompetitorOption[];
  initialCompetitorId: string;
  playbooks: PlaybookOption[];
  landscapes: Record<string, LandscapeSummary>;
  competitorLines: Record<string, string[]>;
  initialIdeas: InitialIdeas | null;
  initialBrief: InitialBrief | null;
}) {
  const defaultBrief = (platform: Platform): Brief => ({
    productId: products.find((p) => p.name.startsWith("Chocolate") && p.status === "ready")?.id ?? products.find((p) => p.status === "ready")?.id ?? products[0]?.id ?? "",
    objective: "conversion",
    persona: AUTO,
    platform,
    creativeType: creativeTypes[platform][0] ?? "",
    placement: PLACEMENTS[platform][0]?.label ?? "",
    deliverable: "concept",
    angle: AUTO,
    language: languages[0] ?? "English",
    extra: "",
    inspiration: "",
    pack: null,
    competitorId: initialCompetitorId,
    autoImage: true,
    usePlaybook: true,
    useLandscape: true,
  });

  const [brief, setBrief] = useState<Brief>(() => ({ ...defaultBrief(initialCreative?.platform ?? initialBrief?.platform ?? initialPlatform), ...(initialBrief ?? {}) }));
  const [step, setStep] = useState<1 | 2 | 3>(initialCreative || initialIdeas ? 2 : 1);
  const [proposals, setProposals] = useState<ScoredProposal[] | null>(initialIdeas?.proposals ?? null);
  const [ideasFrom, setIdeasFrom] = useState(initialIdeas?.brand ?? "");
  const [proposalsMock, setProposalsMock] = useState(Boolean(initialIdeas?.mock));
  const [ideasNote, setIdeasNote] = useState(initialIdeas?.note ?? "");
  const [variations, setVariations] = useState<ScoredConcept[] | null>(null);
  const [progress, setProgress] = useState<Progress>(null);
  const [error, setError] = useState<{ text: string; retry?: () => void } | null>(null);
  const [lastProposal, setLastProposal] = useState<Proposal | null>(null);
  const [creative, setCreative] = useState<OpenCreative | null>(initialCreative);
  const [snapshot, setSnapshot] = useState<CreativeSnapshot | null>(initialCreative?.snapshot ?? null);
  const [tab, setTab] = useState<Tab>("check");
  const [message, setMessage] = useState<{ text: string; ok?: boolean; missing?: string[] } | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [historyKey, setHistoryKey] = useState(0);
  const [packError, setPackError] = useState("");
  const [copied, setCopied] = useState(false);
  const [briefReady, setBriefReady] = useState(false);

  const autosave = useAutosave({
    id: creative?.id ?? null,
    revision: creative?.revision ?? 1,
    snapshot,
    onSaved: (r) => {
      setCreative((c) => (c ? { ...c, revision: r.revision, status: r.status, claimsReviewedBy: r.claimsReviewedBy, approvedBy: r.demoted ? "" : c.approvedBy } : c));
      if (r.demoted) setNotice("You edited an approved ad, so it's back to Draft and needs approving again.");
      else if (r.reviewCleared) setNotice("The words changed, so the claims sign-off was cleared. An approver needs to check again.");
    },
  });

  // Restore this viewer's last brief (a convenience; never required).
  useEffect(() => {
    let saved: Partial<Brief> | null = null;
    try {
      saved = JSON.parse(localStorage.getItem(BRIEF_KEY) ?? "null") as Partial<Brief> | null;
    } catch {
      // Storage unavailable: start from defaults.
    }
    const restored = initialCreative || initialBrief ? null : saved;
    const frame = requestAnimationFrame(() => {
      setBriefReady(true);
      if (!restored) return;
      setBrief((b) => {
        const saved = restored;
        const platform = saved.platform && saved.platform in creativeTypes ? saved.platform : b.platform;
        const productId = products.some((p) => p.id === saved.productId) ? saved.productId! : b.productId;
        if (platform !== b.platform) applyPlatform(platform);
        const competitorId = saved.competitorId && competitors.some((c) => c.id === saved.competitorId) ? saved.competitorId : "";
        // A competitor chosen via a link (?competitor=) wins over the remembered brief.
        return { ...b, ...saved, platform, productId, pack: null, competitorId: initialCompetitorId || competitorId };
      });
    });
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { pack, ...rest } = brief;
      localStorage.setItem(BRIEF_KEY, JSON.stringify(rest));
    } catch {
      // Ignore: private mode or storage blocked.
    }
  }, [brief]);

  const product = products.find((p) => p.id === brief.productId);
  const creativeProduct = products.find((p) => p.id === creative?.productId) ?? null;
  const canGenerate = can(role, "generate");
  const canEdit = can(role, "edit");
  const working = progress !== null;
  const deliverableLabel = DELIVERABLES.find((d) => d.id === brief.deliverable)?.label ?? "Ad concept";

  function setBriefPatch(patch: Partial<Brief>) {
    setBrief((b) => {
      const next = { ...b, ...patch };
      // A competitor focus only makes sense for the product it was researched for.
      if (patch.productId && patch.productId !== b.productId && next.competitorId) {
        const p = products.find((x) => x.id === patch.productId);
        const c = competitors.find((x) => x.id === next.competitorId);
        if (!p || !c || !matchesProduct(c, p)) next.competitorId = "";
      }
      if (patch.platform && patch.platform !== b.platform) {
        applyPlatform(patch.platform);
        next.creativeType = creativeTypes[patch.platform][0] ?? "";
        next.placement = PLACEMENTS[patch.platform][0]?.label ?? "";
      }
      return next;
    });
  }

  function onPackFile(file: File | undefined) {
    setPackError("");
    if (!file) return setBriefPatch({ pack: null });
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) return setPackError("Use a PNG, JPG or WebP image.");
    if (file.size > 5 * 1024 * 1024) return setPackError("That image is over 5 MB. Use a smaller photo.");
    const reader = new FileReader();
    reader.onload = () => setBriefPatch({ pack: { mediaType: file.type as "image/png", base64: String(reader.result).split(",")[1] ?? "", name: file.name } });
    reader.readAsDataURL(file);
  }

  const requestBody = (extra: Record<string, unknown>) => ({
    platform: brief.platform,
    productId: brief.productId,
    creativeType: brief.creativeType.trim(),
    placement: brief.placement.trim() || undefined,
    angle: brief.angle.trim() || AUTO,
    persona: brief.persona.trim() || AUTO,
    language: brief.language.trim() || "English",
    objective: brief.objective,
    deliverable: brief.deliverable,
    n: 3,
    extra: brief.extra || undefined,
    inspiration: brief.inspiration.trim() || undefined,
    image: brief.pack ? { mediaType: brief.pack.mediaType, base64: brief.pack.base64 } : null,
    competitorId: brief.competitorId || undefined,
    usePlaybook: brief.usePlaybook,
    useLandscape: brief.useLandscape,
    ...extra,
  });

  // Images made for proposals (before developing), keyed by proposal title.
  const [proposalImages, setProposalImages] = useState<Record<string, { image: MadeImage | null; withText?: MadeImage | null; busy: boolean; error: string }>>({});
  const [firstImage, setFirstImage] = useState<{ busy: boolean; error: string; stage?: string }>({ busy: false, error: "" });

  const placementSpec = (platform: Platform, placement: string) => findPlacement(platform, placement)?.specId ?? null;

  async function requestImage(body: Record<string, unknown>, onStage: (text: string) => void = () => {}): Promise<MadeImage> {
    const data = await requestImageWithStages(body, onStage);
    return { id: data.id, url: data.url, label: data.label, frameIndex: 0 };
  }

  /** The same image with the hook, CTA and logo on it (the pack sits at the bottom, so the text goes on top). Null if it can't be drawn. */
  async function withHook(image: MadeImage, concept: Pick<Concept, "hook" | "frames" | "copy">, creativeId: string | null): Promise<MadeImage | null> {
    const onscreen = concept.frames[0]?.onscreen;
    try {
      const t = await addTextAutomatically({
        imageUrl: image.url,
        kit,
        options: defaultOverlay(
          kit,
          { headline: onscreen || concept.hook, sub: concept.copy.headline && concept.copy.headline !== (onscreen || concept.hook) ? concept.copy.headline : "", cta: concept.copy.cta || "Shop now" },
          packLayoutOf(image.label),
        ),
        label: image.label ?? "Image",
        creativeId,
        frameIndex: 0,
      });
      return { ...t, frameIndex: 0 };
    } catch {
      return null;
    }
  }

  const proposalConcept = (p: Proposal): Concept => ({
    title: p.title,
    persona: p.persona,
    angle: p.angle,
    format: p.format,
    language: brief.language,
    hook: p.hook,
    frames: [{ slot: "Key visual", visual: p.big_idea, onscreen: p.hook }],
    copy: { headline: p.hook },
    ai_prompt: p.big_idea,
    needs_real_person: false,
    ai_label_needed: false,
    claims: p.claims,
    why_it_fits: p.why,
  });

  async function imageForProposal(p: Proposal) {
    setProposalImages((m) => ({ ...m, [p.title]: { image: null, busy: true, error: "" } }));
    try {
      const image = await requestImage({
        platform: brief.platform,
        productId: brief.productId,
        creativeType: brief.creativeType.trim(),
        concept: proposalConcept(p),
        frameIndex: 0,
        creativeId: null,
        specId: placementSpec(brief.platform, brief.placement),
        packImage: brief.pack ? { mediaType: brief.pack.mediaType, base64: brief.pack.base64 } : null,
        packMode: "layout",
      });
      const withText = await withHook(image, proposalConcept(p), null);
      setProposalImages((m) => ({ ...m, [p.title]: { image, withText, busy: false, error: "" } }));
    } catch (e) {
      setProposalImages((m) => ({ ...m, [p.title]: { image: null, busy: false, error: e instanceof Error ? e.message : "Couldn't make the image." } }));
    }
  }

  /** The first image for a freshly developed ad, so it never opens as text only. */
  async function makeFirstImage(c: OpenCreative) {
    if (!c.productId) return;
    setFirstImage({ busy: true, error: "" });
    try {
      const image = await requestImage({
        platform: c.platform,
        productId: c.productId,
        creativeType: c.creativeType,
        concept: snapshotToConcept(c.snapshot),
        frameIndex: 0,
        creativeId: c.id,
        specId: placementSpec(c.platform, c.placement),
        packImage: brief.pack ? { mediaType: brief.pack.mediaType, base64: brief.pack.base64 } : null,
        packMode: "layout",
      }, (stage) => setFirstImage({ busy: true, error: "", stage }));
      setCreative((cur) => (cur && cur.id === c.id ? { ...cur, images: [...cur.images, image] } : cur));
      setFirstImage({ busy: true, error: "", stage: "Adding the hook, button and logo" });
      const withText = await withHook(image, snapshotToConcept(c.snapshot), c.id);
      if (withText) setCreative((cur) => (cur && cur.id === c.id ? { ...cur, images: [...cur.images, withText] } : cur));
      setFirstImage({ busy: false, error: "" });
    } catch (e) {
      setFirstImage({ busy: false, error: e instanceof Error ? e.message : "Couldn't make the first image." });
    }
  }

  async function stream<T>(body: unknown, label: string, total: number): Promise<T> {
    setProgress({ label, chars: 0, items: 0, total });
    const res = await fetch("/api/generate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    return readNdjson<T>(res, (chars, items) => setProgress({ label, chars, items, total }));
  }

  async function propose() {
    setError(null);
    setVariations(null);
    setStep(2);
    try {
      const done = await stream<{ proposals: ScoredProposal[]; mock: boolean }>(requestBody({ mode: "proposals" }), "Writing proposals", 3);
      setProposals(done.proposals);
      setProposalsMock(done.mock);
      setIdeasFrom("");
      setIdeasNote("");
      setProposalImages({});
    } catch (e) {
      setError({ text: e instanceof Error ? e.message : "Couldn't write proposals.", retry: propose });
    } finally {
      setProgress(null);
    }
  }

  function openCreative(c: OpenCreative) {
    setCreative(c);
    setSnapshot(c.snapshot);
    autosave.reset(c.snapshot, c.revision);
    setMessage(null);
    setNotice("");
    setTab("check");
    setStep(2);
    window.history.replaceState(null, "", `/create?creative=${c.id}`);
  }

  async function develop(p: Proposal) {
    setError(null);
    setLastProposal(p);
    const prod = product!;
    const carried = proposalImages[p.title]?.image;
    const carriedText = proposalImages[p.title]?.withText;
    const carriedAll = [carried, carriedText].filter((x): x is MadeImage => Boolean(x));
    try {
      const done = await stream<{ creative: { id: string; revision: number; status: CreativeStatus }; concept: ReturnType<typeof snapshotToConcept>; mock: boolean }>(
        requestBody({ mode: "develop", proposal: p, imageIds: carriedAll.length ? carriedAll.map((i) => i.id) : undefined }),
        `Developing “${p.title}”`,
        1,
      );
      const opened: OpenCreative = {
        id: done.creative.id,
        platform: brief.platform,
        productId: prod.id,
        productName: prod.name,
        creativeType: brief.creativeType,
        placement: PLACEMENTS[brief.platform].length ? brief.placement : "",
        objective: brief.objective,
        deliverable: brief.deliverable,
        status: done.creative.status,
        revision: done.creative.revision,
        snapshot: conceptToSnapshot(done.concept),
        images: carriedAll,
        qaChecked: [],
        claimsReviewedBy: "",
        approvedBy: "",
        createdBy: user,
        createdAt: new Date().toISOString(),
        mock: done.mock,
        model: done.mock ? "mock" : "",
      };
      openCreative(opened);
      if (!carried && brief.autoImage) void makeFirstImage(opened);
    } catch (e) {
      setError({ text: e instanceof Error ? e.message : "Couldn't develop that concept.", retry: () => develop(p) });
    } finally {
      setProgress(null);
    }
  }

  async function redevelop() {
    if (!creative || !lastProposal) return;
    if (!(await autosave.flush())) return;
    setError(null);
    try {
      const done = await stream<{ creative: { id: string; revision: number; status: CreativeStatus }; concept: ReturnType<typeof snapshotToConcept> }>(
        requestBody({ mode: "develop", proposal: lastProposal, creativeId: creative.id, baseRevision: autosave.revision }),
        `Re-developing “${lastProposal.title}”`,
        1,
      );
      const s = conceptToSnapshot(done.concept);
      setSnapshot(s);
      autosave.reset(s, done.creative.revision);
      setCreative((c) => (c ? { ...c, revision: done.creative.revision, status: done.creative.status, claimsReviewedBy: "" } : c));
      setHistoryKey((k) => k + 1);
      setNotice("Re-developed. The previous text is in History if you want it back.");
    } catch (e) {
      setError({ text: e instanceof Error ? e.message : "Couldn't re-develop." });
    } finally {
      setProgress(null);
    }
  }

  async function makeVariations() {
    if (!creative || !snapshot) return;
    setError(null);
    try {
      const done = await stream<{ concepts: ScoredConcept[] }>(
        { ...requestBody({ mode: "variations", concept: snapshotToConcept(snapshot) }), platform: creative.platform, creativeType: creative.creativeType, productId: creative.productId },
        "Writing structural variations",
        6,
      );
      setVariations(done.concepts);
    } catch (e) {
      setError({ text: e instanceof Error ? e.message : "Couldn't make variations." });
    } finally {
      setProgress(null);
    }
  }

  async function openVariation(c: ScoredConcept) {
    if (!creative) return;
    setBusy(true);
    const res = await createFromConcept({
      concept: snapshotToConcept(conceptToSnapshot(c)),
      platform: creative.platform,
      productId: creative.productId!,
      creativeType: creative.creativeType,
      placement: creative.placement,
      objective: creative.objective,
      deliverable: creative.deliverable,
      mock: creative.mock,
      note: `Variation of “${creative.snapshot.title}”`,
    });
    setBusy(false);
    if (!res.ok) return setError({ text: res.message });
    setVariations((v) => v?.filter((x) => x !== c) ?? null);
    openCreative({ ...creative, id: res.id, revision: res.revision, platform: c.platform, status: "Draft", snapshot: conceptToSnapshot(c), images: [], qaChecked: [], claimsReviewedBy: "", approvedBy: "", createdBy: user, createdAt: new Date().toISOString() });
  }

  async function changeStatus(status: CreativeStatus) {
    if (!creative) return;
    if (!(await autosave.flush())) return;
    setBusy(true);
    setMessage(null);
    const res = await setWorkspaceStatus(creative.id, status);
    setBusy(false);
    if (res.ok) {
      setCreative((c) => (c ? { ...c, status, approvedBy: GATED_STATUSES.includes(status) ? c.approvedBy || user : "" } : c));
      setMessage({ text: `Moved to ${status}.`, ok: true });
    } else setMessage({ text: res.message, missing: "missing" in res ? res.missing : undefined });
  }

  async function review(reviewed: boolean) {
    if (!creative) return;
    if (!(await autosave.flush())) return;
    setBusy(true);
    const res = await reviewClaims(creative.id, autosave.revision, reviewed);
    setBusy(false);
    if (res.ok) {
      setCreative((c) => (c ? { ...c, claimsReviewedBy: res.by, ...(!reviewed && GATED_STATUSES.includes(c.status) ? { status: "Draft" as const, approvedBy: "" } : {}) } : c));
    } else setMessage({ text: res.message });
  }

  async function qa(n: number, on: boolean) {
    if (!creative) return;
    const next = on ? [...new Set([...creative.qaChecked, n])] : creative.qaChecked.filter((x) => x !== n);
    const demote = !on && GATED_STATUSES.includes(creative.status);
    setCreative({ ...creative, qaChecked: next, ...(demote ? { status: "Draft" as const } : {}) });
    const res = await setQa(creative.id, n, on);
    if (!res.ok) setMessage({ text: res.message });
  }

  async function qaAll(on: boolean) {
    if (!creative) return;
    const demote = !on && GATED_STATUSES.includes(creative.status);
    setCreative({ ...creative, qaChecked: on ? requiredQaItems(creative.platform).map((i) => i.n) : [], ...(demote ? { status: "Draft" as const } : {}) });
    const res = await setQaAll(creative.id, on);
    if (!res.ok) setMessage({ text: res.message });
  }

  async function restore(versionId: string) {
    if (!creative) return;
    if (!(await autosave.flush())) return;
    const res = await restoreCreativeVersion(creative.id, versionId, autosave.revision);
    if (!res.ok) return setMessage({ text: res.message });
    setSnapshot(res.snapshot);
    autosave.reset(res.snapshot, res.revision);
    setCreative((c) => (c ? { ...c, revision: res.revision, status: res.status, claimsReviewedBy: res.claimsReviewedBy } : c));
    setHistoryKey((k) => k + 1);
    setNotice(res.demoted ? "Restored. It was approved, so it's back to Draft." : "Restored. The version you replaced is still in History.");
  }

  function newBrief() {
    setCreative(null);
    setSnapshot(null);
    setVariations(null);
    setMessage(null);
    setNotice("");
    setStep(1);
    window.history.replaceState(null, "", "/create");
  }

  // Follow navigation (e.g. a "Pick up where you left off" link or the Create tab). Server refreshes
  // after actions re-send the ad that's already open, which must not reset the workspace.
  const lastInitial = useRef(initialCreative?.id ?? null);
  const openId = useRef(creative?.id ?? null);
  openId.current = creative?.id ?? null;
  useEffect(() => {
    const id = initialCreative?.id ?? null;
    if (id === lastInitial.current) return;
    lastInitial.current = id;
    if (initialCreative && id !== openId.current) openCreative(initialCreative);
    else if (!id && openId.current) newBrief();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCreative]);

  const validation = useMemo(
    () =>
      snapshot && creative
        ? validateCreative({
            concept: snapshotToConcept(snapshot),
            platform: creative.platform,
            product: creativeProduct,
            terms,
            avoidPhrases,
            competitorLines: creative.productId ? (competitorLines[creative.productId] ?? []) : [],
          })
        : null,
    [snapshot, creative, creativeProduct, terms, avoidPhrases, competitorLines],
  );

  const show = (n: 1 | 2 | 3) => (step === n ? "" : "hidden lg:block");
  const steps: { n: 1 | 2 | 3; label: string; disabled?: boolean }[] = [
    { n: 1, label: "Brief" },
    { n: 2, label: "Concepts" },
    { n: 3, label: "Refine & approve", disabled: !creative },
  ];
  const objectiveLabel = OBJECTIVES.find((o) => o.id === creative?.objective)?.label;
  const flow = progress?.label.startsWith("Developing") ? 2 : flowStep({ hasIdeas: Boolean(proposals?.length), hasCreative: Boolean(creative), hasImages: Boolean(creative?.images.length), status: creative?.status });
  const approved = Boolean(creative && ["Approved", "In production", "Live", "Winner"].includes(creative.status));
  const now = progress
    ? `${progress.label}…`
    : firstImage.busy
      ? `${firstImage.stage ?? "Making the first image"}…`
      : [
          "Fill in the brief on the left, then press Propose 3 concepts.",
          "Pick the idea you like best and press Develop.",
          "",
          "Make images for this ad below: Make image, or make every size the platform needs.",
          approved ? "Approved: download the handoff pack and upload it to the platform." : "Check the panel on the right: fix anything red, then send it for approval.",
        ][flow];

  return (
    <div className="space-y-4">
      <FlowBar step={flow} now={now} done={approved} />
      <nav aria-label="Workflow steps" className="lg:hidden">
        <ol className="grid grid-cols-3 gap-1 rounded-xl border border-line bg-surface p-1">
          {steps.map((s) => (
            <li key={s.n}>
              <button
                type="button"
                className={`w-full rounded-lg px-2 py-2 text-sm font-semibold ${step === s.n ? "bg-purple text-accent-ink" : "text-ink-soft"} disabled:opacity-40`}
                aria-current={step === s.n ? "step" : undefined}
                disabled={s.disabled}
                onClick={() => setStep(s.n)}
              >
                {s.n}. {s.label}
              </button>
            </li>
          ))}
        </ol>
      </nav>

      <div className="grid gap-6 lg:grid-cols-[19rem_minmax(0,1fr)_23rem] xl:grid-cols-[21rem_minmax(0,1fr)_26rem]">
        {/* 1. Brief */}
        <aside className={`${show(1)} lg:sticky lg:top-4 lg:max-h-[calc(100dvh-2rem)] lg:self-start lg:overflow-y-auto lg:pr-1`} aria-label="Brief controls">
          <div className="mb-4">
            <p className="eyebrow">Creative workspace</p>
            <h1 className="display text-3xl">New brief</h1>
          </div>
          <BriefPanel
            brief={brief}
            set={setBriefPatch}
            products={products}
            creativeTypes={creativeTypes}
            angles={angles}
            personas={personas}
            languages={languages}
            canGenerate={canGenerate}
            busy={working}
            onPropose={propose}
            packError={packError}
            onPackFile={onPackFile}
            ready={briefReady}
            competitors={competitors}
            playbooks={playbooks}
            landscape={landscapes[brief.productId] ?? null}
          />
        </aside>

        {/* 2. Concepts and preview */}
        <section className={`${show(2)} min-w-0 space-y-5`} aria-label="Concepts" aria-live="polite" aria-busy={working}>
          {error ? (
            <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red/30 bg-red-bg p-4 text-red">
              <p>{error.text}</p>
              {error.retry ? (
                <button type="button" className="btn-danger px-3 py-1.5 text-sm" onClick={error.retry} disabled={working}>
                  Try again
                </button>
              ) : null}
            </div>
          ) : null}

          {progress ? <ProgressCard progress={progress} /> : null}

          {creative && snapshot ? (
            <div className="space-y-5" data-testid="workspace-creative">
              <header className="space-y-3">
                <p className="eyebrow">
                  {PLATFORM_FULL_LABELS[creative.platform]}
                  {creative.placement ? ` · ${creative.placement}` : ""} · {DELIVERABLES.find((d) => d.id === creative.deliverable)?.label}
                  {objectiveLabel ? ` · ${objectiveLabel}` : ""}
                </p>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <h2 className="display text-3xl" data-testid="creative-title">
                    {snapshot.title}
                  </h2>
                  <SaveIndicator state={autosave.state} savedAt={autosave.savedAt} error={autosave.error} onRetry={autosave.retry} />
                </div>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="chip">{creative.productName}</span>
                  {creative.mock ? <MockBadge /> : null}
                  <span className="hint text-xs">
                    Made by {creative.createdBy} · {new Date(creative.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="btn-secondary px-3 py-1.5 text-sm lg:hidden" onClick={() => setStep(3)}>
                    Refine &amp; approve →
                  </button>
                  {lastProposal && canGenerate ? (
                    <button type="button" className="btn-secondary px-3 py-1.5 text-sm" onClick={redevelop} disabled={working}>
                      Re-develop
                    </button>
                  ) : null}
                  {canGenerate ? (
                    <button type="button" className="btn-secondary px-3 py-1.5 text-sm" onClick={makeVariations} disabled={working}>
                      Make variations
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="btn-secondary px-3 py-1.5 text-sm"
                    onClick={async () => {
                      await navigator.clipboard.writeText(conceptToText({ ...snapshotToConcept(snapshot), platform: creative.platform, scan: validation?.scan }));
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1500);
                    }}
                  >
                    {copied ? "Copied" : "Copy as text"}
                  </button>
                  <a href={`/api/creatives/${creative.id}/pack`} className="btn-secondary px-3 py-1.5 text-sm" download>
                    Handoff pack (.zip)
                  </a>
                  <Link href={`/library?highlight=${creative.id}&platform=all`} className="btn-secondary px-3 py-1.5 text-sm">
                    In library
                  </Link>
                  <button type="button" className="btn-secondary px-3 py-1.5 text-sm" onClick={newBrief}>
                    New brief
                  </button>
                </div>
              </header>

              {firstImage.busy ? (
                <p className="rounded-xl bg-gold-soft p-3 text-sm" role="status" data-testid="first-image-busy">
                  {firstImage.stage ? `⏳ ${firstImage.stage}…` : "Making the first image with your real pack…"} (up to a minute). You can start editing meanwhile.
                </p>
              ) : firstImage.error ? (
                <p className="rounded-xl border border-red/30 bg-red-bg p-3 text-sm text-red" role="alert">
                  {firstImage.error}{" "}
                  <button type="button" className="font-semibold underline" onClick={() => creative && makeFirstImage(creative)}>
                    Try again
                  </button>
                </p>
              ) : null}
              <div className="grid gap-5 xl:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
                <CreativePreview
                  snapshot={snapshot}
                  platform={creative.platform}
                  placement={creative.placement}
                  creativeType={creative.creativeType}
                  images={creative.images}
                  productName={creative.productName}
                  priceText={creativeProduct?.priceText ?? ""}
                />
                <div className="min-w-0 space-y-5">
                  <div>
                    <p className="eyebrow mb-1">Hook</p>
                    <p className="font-serif text-2xl leading-snug text-purple">{snapshot.hook}</p>
                  </div>
                  <section aria-label="Copy" className="space-y-2">
                    <p className="eyebrow">Copy</p>
                    <CopyBlockView snapshot={snapshot} />
                  </section>
                  <section aria-label="Scenes" className="space-y-2">
                    <p className="eyebrow">{snapshot.frames.length > 1 ? `Scenes (${snapshot.frames.length})` : "Visual"}</p>
                    <SceneList snapshot={snapshot} />
                  </section>
                  {snapshot.whyItFits ? (
                    <p className="rounded-xl bg-pink-soft p-3 text-sm">
                      <span className="font-semibold">Why it works: </span>
                      {snapshot.whyItFits}
                    </p>
                  ) : null}
                </div>
              </div>

              {canGenerate && creative.productId ? (
                <section aria-label="Images" className="space-y-2">
                  <p className="eyebrow">Images</p>
                  <ImageMaker
                    concept={snapshotToConcept(snapshot)}
                    platform={creative.platform}
                    creativeType={creative.creativeType}
                    productId={creative.productId}
                    creativeId={creative.id}
                    packImage={brief.pack ? { mediaType: brief.pack.mediaType, base64: brief.pack.base64 } : null}
                    images={creative.images}
                    onImages={(images) => setCreative((c) => (c ? { ...c, images } : c))}
                    kit={kit}
                    productName={creative.productName}
                    placement={creative.placement}
                    priceText={creativeProduct?.priceText}
                    photos={creativeProduct?.photos ?? []}
                  />
                </section>
              ) : null}
            </div>
          ) : null}

          {variations?.length ? (
            <section className="space-y-3" aria-label="Variations" data-testid="variations">
              <div className="flex items-center justify-between">
                <h2 className="display text-xl">Variations of this ad</h2>
                <button type="button" className="text-sm font-semibold text-ink-soft underline" onClick={() => setVariations(null)}>
                  Hide
                </button>
              </div>
              <ul className="grid gap-3 md:grid-cols-2">
                {variations.map((v, i) => (
                  <li key={i} className="card space-y-2 p-4" data-testid={`variation-${i}`}>
                    <p className="eyebrow">{PLATFORM_FULL_LABELS[v.platform]}</p>
                    <p className="font-semibold">{v.title}</p>
                    <p className="font-serif text-ink">“{v.hook}”</p>
                    <button type="button" className="btn-secondary px-3 py-1.5 text-sm" onClick={() => openVariation(v)} disabled={busy || working}>
                      Open as new draft
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {proposals?.length && !working ? (
            creative ? (
              <details className="rounded-2xl border border-line bg-surface p-4">
                <summary className="cursor-pointer font-semibold">Other directions from this brief ({proposals.length})</summary>
                <div className="mt-3 space-y-3">
                  {proposals.map((p, i) => (
                    <ProposalCard key={i} p={p} index={i} mock={proposalsMock} deliverableLabel={deliverableLabel} busy={working || !canGenerate} onDevelop={() => develop(p)}
                      visual={
                        <ProposalVisual
                          hook={p.hook}
                          packUrl={product?.packImageUrl ?? null}
                          ratio={sketchRatio(brief.platform, brief.placement, brief.creativeType)}
                          image={proposalImages[p.title]?.withText ?? proposalImages[p.title]?.image ?? null}
                          busy={Boolean(proposalImages[p.title]?.busy)}
                          error={proposalImages[p.title]?.error ?? ""}
                          canMake={canGenerate && !working}
                          onMake={() => imageForProposal(p)}
                        />
                      }
                    />
                  ))}
                </div>
              </details>
            ) : (
              <div className="space-y-3">
                <div>
                  <p className="eyebrow">Step 2</p>
                  <h2 className="display text-2xl">Pick a direction to develop</h2>
                  {ideasNote ? (
                    <p className="mt-2 rounded-xl bg-gold-soft p-3 text-sm" data-testid="ideas-from">
                      {ideasNote}
                    </p>
                  ) : ideasFrom ? (
                    <p className="mt-2 rounded-xl bg-gold-soft p-3 text-sm" data-testid="ideas-from">
                      These are the ideas from your research on <strong>{ideasFrom}</strong>, built to stand apart from them. Check the brief on the left (product, platform, type of ad), then
                      develop one. It will use only your approved claims.
                    </p>
                  ) : null}
                  <p className="hint mt-1">Each one is a different idea. Developing turns it into a full {deliverableLabel.toLowerCase()} and saves it as a draft.</p>
                </div>
                {proposals.map((p, i) => (
                  <ProposalCard key={i} p={p} index={i} mock={proposalsMock} deliverableLabel={deliverableLabel} busy={working || !canGenerate} onDevelop={() => develop(p)}
                      visual={
                        <ProposalVisual
                          hook={p.hook}
                          packUrl={product?.packImageUrl ?? null}
                          ratio={sketchRatio(brief.platform, brief.placement, brief.creativeType)}
                          image={proposalImages[p.title]?.withText ?? proposalImages[p.title]?.image ?? null}
                          busy={Boolean(proposalImages[p.title]?.busy)}
                          error={proposalImages[p.title]?.error ?? ""}
                          canMake={canGenerate && !working}
                          onMake={() => imageForProposal(p)}
                        />
                      }
                    />
                ))}
                <button type="button" className="btn-secondary" onClick={propose} disabled={working || !canGenerate}>
                  Propose 3 more
                </button>
              </div>
            )
          ) : null}

          {!creative && !proposals && !working ? (
            <div className="space-y-5" data-testid="empty-state">
              <div className="rounded-3xl border border-line bg-gradient-to-br from-surface via-surface to-pink-soft p-6 sm:p-8">
                <p className="eyebrow">How it works</p>
                <h2 className="display mt-1 text-3xl">From brief to approved ad, in one place.</h2>
                <ol className="mt-5 grid gap-3 sm:grid-cols-2">
                  {[
                    ["Brief", "Pick the product, objective, audience, platform and angle."],
                    ["Three directions", "Compare three different ideas before spending time on one."],
                    ["Develop and refine", "Get the full concept, UGC script or copy set. Edit freely: it saves as you type."],
                    ["Check and approve", "Claims are checked against the product library; uncertain ones go to a person."],
                  ].map(([t, d], i) => (
                    <li key={t} className="flex gap-3">
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-gold font-serif text-sm font-semibold text-[#2d1b54]">{i + 1}</span>
                      <span className="text-sm">
                        <strong className="block text-ink">{t}</strong>
                        <span className="text-ink-soft">{d}</span>
                      </span>
                    </li>
                  ))}
                </ol>
                <button type="button" className="btn-primary mt-6 lg:hidden" onClick={() => setStep(1)}>
                  Start a brief
                </button>
              </div>
              {recent.length ? (
                <div>
                  <p className="eyebrow mb-2">Pick up where you left off</p>
                  <ul className="divide-y divide-line rounded-2xl border border-line bg-surface" data-testid="recent">
                    {recent.map((r) => (
                      <li key={r.id}>
                        <Link href={`/create?creative=${r.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-surface-2">
                          <span className="min-w-0">
                            <span className="block truncate font-semibold">{r.title}</span>
                            <span className="block truncate text-xs text-ink-soft">
                              {PLATFORM_FULL_LABELS[r.platform]} · {r.productName}
                            </span>
                          </span>
                          <span className={r.status === "Draft" ? "chip" : r.status === "Killed" ? "chip-red" : "chip-green"}>{r.status}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}
        </section>

        {/* 3. Refine, check and approve */}
        <aside className={`${show(3)} lg:sticky lg:top-4 lg:max-h-[calc(100dvh-2rem)] lg:self-start lg:overflow-y-auto`} aria-label="Check and edit">
          {creative && snapshot && validation ? (
            <div className="space-y-4 rounded-2xl border border-line bg-surface p-4">
              {autosave.conflict ? (
                <div role="alert" className="space-y-2 rounded-xl border border-red/30 bg-red-bg p-3 text-sm text-red" data-testid="conflict">
                  <p className="font-semibold">{autosave.error}</p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="btn-secondary px-3 py-1 text-sm"
                      onClick={() => {
                        const theirs = autosave.resolveConflict("theirs");
                        if (theirs) setSnapshot(theirs);
                      }}
                    >
                      Load the latest version
                    </button>
                    <button type="button" className="btn-secondary px-3 py-1 text-sm" onClick={() => autosave.resolveConflict("mine")}>
                      Keep my edit
                    </button>
                  </div>
                </div>
              ) : null}
              {notice ? (
                <p role="status" className="rounded-xl bg-gold-soft p-3 text-sm text-ink" data-testid="notice">
                  {notice}
                </p>
              ) : null}
              <div role="tablist" aria-label="Inspector" className="grid grid-cols-3 gap-1 rounded-xl bg-surface-2 p-1">
                {(
                  [
                    ["check", "Check"],
                    ["edit", "Edit"],
                    ["history", "History"],
                  ] as [Tab, string][]
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    id={`tab-${id}`}
                    aria-selected={tab === id}
                    aria-controls={`panel-${id}`}
                    onClick={() => setTab(id)}
                    className={`rounded-lg py-1.5 text-sm font-semibold ${tab === id ? "bg-surface text-purple shadow-sm" : "text-ink-soft hover:text-ink"}`}
                  >
                    {label}
                    {id === "check" && validation.blocking ? <span className="ml-1 text-red">•</span> : null}
                  </button>
                ))}
              </div>
              <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
                {tab === "check" ? (
                  <ValidationPanel
                    validation={validation}
                    platform={creative.platform}
                    status={creative.status}
                    claimsReviewedBy={creative.claimsReviewedBy}
                    approvedBy={creative.approvedBy}
                    qaChecked={creative.qaChecked}
                    role={role}
                    busy={busy}
                    dirty={autosave.state !== "saved"}
                    message={message}
                    onReview={review}
                    onStatus={changeStatus}
                    onQa={qa}
                    onQaAll={qaAll}
                    onEdit={() => setTab("edit")}
                  />
                ) : tab === "edit" ? (
                  <EditorForm value={snapshot} onChange={setSnapshot} platform={creative.platform} approvedClaims={creativeProduct?.greenClaims ?? []} readOnly={!canEdit || Boolean(autosave.conflict)} />
                ) : (
                  <HistoryPanel creativeId={creative.id} current={snapshot} revision={autosave.revision} canEdit={canEdit} onRestore={restore} refreshKey={historyKey} />
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-line p-5 text-sm text-ink-soft" data-testid="inspector-empty">
              <p className="font-semibold text-ink">Checks, editing and history</p>
              <p className="mt-1">Develop a concept to see its claims check, edit every line (saved as you type) and restore earlier versions.</p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
