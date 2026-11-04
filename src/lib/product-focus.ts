import { propsFromIngredients } from "./scene-spec";

/**
 * What each product's images should put across, and what it's shown with: the team's own messaging
 * priorities first, then what we've learned for that kind of product (cookies: fibre and complex carbs,
 * with chai or coffee). Pure, so prompts, planners and tests share it.
 */

type Kind = { test: RegExp; messages: string[]; pairings: string[]; usage: string[]; callouts: string[] };

const KINDS: Kind[] = [
  {
    test: /cookie|biscuit/i,
    messages: ["fibre from millets and oats", "complex carbs for slow, steady energy"],
    pairings: ["a cup of chai", "a cup of coffee"],
    usage: ["With chai", "With coffee", "With peanut butter", "In the tiffin"],
    callouts: ["High Fibre", "Complex Carbs"],
  },
  {
    test: /peanut butter|spread/i,
    messages: ["protein from real peanuts", "no added refined sugar or palm oil"],
    pairings: ["toast", "a banana", "oats"],
    usage: ["On toast", "In smoothies", "With fruit", "In oats"],
    callouts: ["Real Peanuts", "No Palm Oil"],
  },
  {
    test: /bar\b|protein bar|energy bar/i,
    messages: ["protein and fibre for steady energy", "real nuts and dates"],
    pairings: ["a bottle of water", "a gym bag"],
    usage: ["Before a workout", "At the desk", "On the go", "In the tiffin"],
    callouts: ["Real Nuts", "Dates"],
  },
];

export type ProductFocus = { messages: string[]; pairings: string[]; usage: string[]; /** Short labels for callouts (still checked against the compliance terms). */ callouts: string[] };

export function productFocus(p: { name: string; messagingPriorities?: string[] }): ProductFocus {
  const kind = KINDS.find((k) => k.test.test(p.name));
  const team = (p.messagingPriorities ?? []).map((m) => m.trim()).filter(Boolean);
  return {
    // The team's priorities lead; the learned ones fill in what they don't already say.
    messages: [...team, ...(kind?.messages ?? []).filter((m) => !team.some((t) => t.toLowerCase().includes(m.split(" ")[0])))],
    pairings: kind?.pairings ?? [],
    usage: kind?.usage ?? [],
    callouts: kind?.callouts ?? [],
  };
}

/** Props for a scene: what it's served with (chai or coffee for cookies), then its real ingredients. */
export function scenePropsFor(p: { name: string; ingredients: string; messagingPriorities?: string[] }): string[] {
  const f = productFocus(p);
  const ingredients = propsFromIngredients(p.ingredients);
  return [...(f.pairings.length ? [f.pairings.join(" or ")] : []), ...ingredients];
}

/** One line for prompts and planners. */
export function focusLine(f: ProductFocus): string {
  return [
    f.messages.length ? `Messages to put across (in this order): ${f.messages.join("; ")}.` : "",
    f.pairings.length ? `Show it with ${f.pairings.join(" or ")} in the scene.` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

// ── No repeating words between the sub-line and the callouts ─────────────────

const STOP = new Set(["with", "and", "the", "for", "your", "our", "you", "every", "real", "just", "like", "keep", "keeps", "away", "till", "into", "from", "that", "this", "more", "less", "made", "per", "only", "good", "inside", "free", "zero", "no", "not", "all", "one"]);

/** The meaningful words of a line (singular, lower case): "Millets and oats keep hunger away" → millet, oat, hunger. */
export function keyWords(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9%\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP.has(w))
      .map((w) => w.replace(/(ies)$/, "y").replace(/(es|s)$/, "")),
  );
}

/**
 * Callouts that don't repeat the headline or sub-line (one idea is said once): "Foxtail Millet + Rolled
 * Oats" is dropped under "Millets and oats keep hunger away". Dropped ones are replaced from `spare`.
 */
export function withoutRepeats(headline: string, sub: string, callouts: string[], spare: string[] = [], max = 4): { kept: string[]; dropped: string[] } {
  const said = new Set([...keyWords(headline), ...keyWords(sub)]);
  const fresh = (c: string, used: Set<string>) => {
    const k = keyWords(c);
    return k.size > 0 && ![...k].some((w) => used.has(w));
  };
  const used = new Set(said);
  const kept: string[] = [];
  const dropped: string[] = [];
  for (const c of callouts) {
    if (fresh(c, used)) {
      kept.push(c);
      keyWords(c).forEach((w) => used.add(w));
    } else dropped.push(c);
  }
  for (const c of spare) {
    if (kept.length >= Math.min(max, Math.max(callouts.length, 2))) break;
    if (!kept.includes(c) && fresh(c, used)) {
      kept.push(c);
      keyWords(c).forEach((w) => used.add(w));
    }
  }
  return { kept: kept.slice(0, max), dropped };
}
