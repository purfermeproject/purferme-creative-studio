export type MetaThresholds = {
  minSpendMultiple: number; // spend < this × target CPA = not enough data
  hookKill: number; // %
  ctrKill: number; // %
  cpaKillMultiple: number; // CPA > this × target = kill (once spend is enough)
  hookScale: number; // %
  ctrScale: number; // %
  frequencyWarn: number;
};

export type MarketplaceThresholds = {
  minClicks: number;
  ctrFloor: number; // %
  conversionFloor: number; // %
  acosCutMultiple: number;
};

export type VerdictThresholds = { meta: MetaThresholds; marketplace: MarketplaceThresholds };

export const DEFAULT_THRESHOLDS: VerdictThresholds = {
  meta: {
    minSpendMultiple: 1.5,
    hookKill: 20,
    ctrKill: 0.8,
    cpaKillMultiple: 2,
    hookScale: 30,
    ctrScale: 1.5,
    frequencyWarn: 3,
  },
  marketplace: { minClicks: 30, ctrFloor: 0.3, conversionFloor: 5, acosCutMultiple: 1.5 },
};

export function withDefaults(t: Partial<VerdictThresholds> | null | undefined): VerdictThresholds {
  return {
    meta: { ...DEFAULT_THRESHOLDS.meta, ...(t?.meta ?? {}) },
    marketplace: { ...DEFAULT_THRESHOLDS.marketplace, ...(t?.marketplace ?? {}) },
  };
}

export type MetaInput = {
  targetCpa: number;
  spend: number;
  hookRate: number; // %
  ctr: number; // link CTR %
  cpa: number | null; // null = no conversions yet
  frequency: number; // 7-day
};

export type MetaVerdict = "Kill" | "Hold" | "Scale";
export type MarketplaceVerdict = "Cut" | "Hold" | "Scale";

export type VerdictResult<V extends string> = {
  verdict: V;
  notEnoughData: boolean;
  reasons: string[];
  warnings: string[];
  nextStep: string;
};

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, ""));

export function metaVerdict(input: MetaInput, thresholds: MetaThresholds = DEFAULT_THRESHOLDS.meta): VerdictResult<MetaVerdict> {
  const t = thresholds;
  const reasons: string[] = [];
  const warnings: string[] = [];
  const minSpend = t.minSpendMultiple * input.targetCpa;
  const notEnoughData = input.spend < minSpend;

  if (notEnoughData) {
    warnings.push(
      `Not enough data: spend Rs ${fmt(input.spend)} is under ${fmt(t.minSpendMultiple)} × target CPA (Rs ${fmt(minSpend)}). Only kill rules apply.`,
    );
  }
  if (input.frequency > t.frequencyWarn) {
    warnings.push(`7-day frequency ${fmt(input.frequency)} is above ${fmt(t.frequencyWarn)}: plan replacements.`);
  }

  const kill: string[] = [];
  if (input.hookRate < t.hookKill) kill.push(`Hook rate ${fmt(input.hookRate)}% is under ${fmt(t.hookKill)}%.`);
  if (input.ctr < t.ctrKill) kill.push(`Link CTR ${fmt(input.ctr)}% is under ${fmt(t.ctrKill)}%.`);
  if (!notEnoughData && input.cpa != null && input.cpa > t.cpaKillMultiple * input.targetCpa) {
    kill.push(`CPA Rs ${fmt(input.cpa)} is over ${fmt(t.cpaKillMultiple)} × target (Rs ${fmt(t.cpaKillMultiple * input.targetCpa)}).`);
  }
  if (kill.length > 0) {
    return {
      verdict: "Kill",
      notEnoughData,
      reasons: kill,
      warnings,
      nextStep: "Pause it and note what failed (hook, offer, persona or format) so the next brief avoids it.",
    };
  }

  if (!notEnoughData) {
    const scale: string[] = [];
    if (input.hookRate > t.hookScale) scale.push(`Hook rate ${fmt(input.hookRate)}% is above ${fmt(t.hookScale)}%.`);
    if (input.ctr > t.ctrScale) scale.push(`Link CTR ${fmt(input.ctr)}% is above ${fmt(t.ctrScale)}%.`);
    if (input.cpa != null && input.cpa <= input.targetCpa) scale.push(`CPA Rs ${fmt(input.cpa)} is at or under target (Rs ${fmt(input.targetCpa)}).`);
    if (scale.length >= 2) {
      return {
        verdict: "Scale",
        notEnoughData,
        reasons: scale,
        warnings,
        nextStep: "Raise budget 20–30% every 2–3 days and make structural variations (new hook, persona, language, format).",
      };
    }
    reasons.push(scale.length === 1 ? `Only one scale signal: ${scale[0]}` : "No scale signals yet.");
  } else {
    reasons.push("No kill rule triggered.");
  }

  return { verdict: "Hold", notEnoughData, reasons, warnings, nextStep: "Keep it running to day 7, then check again." };
}

export type MarketplaceInput = {
  targetAcos: number; // %
  acos: number; // %
  ctr: number; // %
  conversionRate: number; // %
  clicks: number;
};

export function marketplaceVerdict(
  input: MarketplaceInput,
  thresholds: MarketplaceThresholds = DEFAULT_THRESHOLDS.marketplace,
): VerdictResult<MarketplaceVerdict> {
  const t = thresholds;
  const warnings: string[] = [];
  const notEnoughData = input.clicks < t.minClicks;

  if (notEnoughData) {
    warnings.push(`Not enough data for conversion: ${fmt(input.clicks)} clicks (need ${fmt(t.minClicks)}).`);
  }
  if (input.ctr < t.ctrFloor) {
    warnings.push(`CTR ${fmt(input.ctr)}% is under ${fmt(t.ctrFloor)}%: fix the main image and title first.`);
  } else if (!notEnoughData && input.conversionRate < t.conversionFloor) {
    warnings.push(
      `CTR is fine but conversion ${fmt(input.conversionRate)}% is under ${fmt(t.conversionFloor)}%: check price, rating, reviews and the image stack.`,
    );
  }

  const cutLine = t.acosCutMultiple * input.targetAcos;
  if (!notEnoughData && input.acos > cutLine) {
    return {
      verdict: "Cut",
      notEnoughData,
      reasons: [`ACoS ${fmt(input.acos)}% is over ${fmt(t.acosCutMultiple)} × target (${fmt(cutLine)}%) with ${fmt(input.clicks)} clicks.`],
      warnings,
      nextStep: "Lower the bid or pause this term/ad.",
    };
  }
  if (input.acos <= input.targetAcos) {
    return {
      verdict: "Scale",
      notEnoughData,
      reasons: [`ACoS ${fmt(input.acos)}% is at or under target (${fmt(input.targetAcos)}%).`],
      warnings,
      nextStep: "Raise bids 10–20%, move the term to exact match, and reuse its wording in Meta hooks.",
    };
  }
  return {
    verdict: "Hold",
    notEnoughData,
    reasons: [
      input.acos > cutLine
        ? `ACoS ${fmt(input.acos)}% is over the cut line (${fmt(cutLine)}%), but ${fmt(input.clicks)} clicks isn't enough to cut yet.`
        : `ACoS ${fmt(input.acos)}% is between target (${fmt(input.targetAcos)}%) and the cut line (${fmt(cutLine)}%).`,
    ],
    warnings,
    nextStep: "Keep it running and check again once it has more clicks.",
  };
}
