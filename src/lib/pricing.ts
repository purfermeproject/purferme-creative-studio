/** USD per million tokens. Update when prices change; unknown models fall back to Sonnet pricing. */
export const PRICING: Record<string, { input: number; output: number }> = {
  "claude-sonnet-5-5": { input: 2, output: 10 },
  "claude-sonnet-5": { input: 2, output: 10 },
  "claude-opus-5-5": { input: 4, output: 20 },
  "claude-opus-5": { input: 5, output: 25 },
  "claude-haiku-4-5": { input: 1, output: 5 },
  "claude-fable-5-1": { input: 10, output: 50 },
  mock: { input: 0, output: 0 },
};

export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  // Image models are billed by OpenAI differently; see your OpenAI usage page.
  if (model.startsWith("gpt-image")) return 0;
  const key = Object.keys(PRICING).find((k) => model === k || model.startsWith(k + "-")) ?? "claude-sonnet-5-5";
  const p = PRICING[key];
  return (inputTokens * p.input + outputTokens * p.output) / 1_000_000;
}
