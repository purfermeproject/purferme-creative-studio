import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { createHash } from "node:crypto";
import type { z } from "zod";
import { db, schema } from "@/db";
import type { Platform } from "./types";

export const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";
export const isMock = () => process.env.ANTHROPIC_MOCK === "true";

/** An error whose message is safe and useful to show the team. */
export class UserFacingError extends Error {}

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new UserFacingError("The Anthropic API key isn't set (ANTHROPIC_API_KEY). Ask an admin to add it in Vercel.");
  }
  client ??= new Anthropic();
  return client;
}

export type LogMeta = { user: string; kind: string; platform?: Platform | null; productId?: string | null };

async function logUsage(meta: LogMeta, prompt: string, model: string, inputTokens: number, outputTokens: number) {
  try {
    await db.insert(schema.generationLogs).values({
      user: meta.user,
      kind: meta.kind,
      platform: meta.platform ?? null,
      productId: meta.productId ?? null,
      promptHash: createHash("sha256").update(prompt).digest("hex").slice(0, 16),
      model,
      inputTokens,
      outputTokens,
    });
  } catch (e) {
    // Never fail a generation because the cost log failed.
    console.error("generation_logs insert failed", e);
  }
}

function friendlyApiError(e: unknown): Error {
  if (e instanceof UserFacingError) return e;
  if (e instanceof Anthropic.AuthenticationError) return new UserFacingError("The Anthropic API key was rejected. Ask an admin to check ANTHROPIC_API_KEY.");
  if (e instanceof Anthropic.RateLimitError) return new UserFacingError("The model is rate-limited right now. Wait a minute and try again.");
  if (e instanceof Anthropic.NotFoundError) return new UserFacingError(`Model "${MODEL}" wasn't found. Ask an admin to check ANTHROPIC_MODEL.`);
  if (e instanceof Anthropic.BadRequestError) return new UserFacingError(`The model rejected the request: ${e.message}`);
  if (e instanceof Anthropic.APIError) return new UserFacingError(`The model service had a problem (${e.status ?? "network"}). Try again in a moment.`);
  return e instanceof Error ? e : new Error(String(e));
}

export type StructuredCall<S extends z.ZodType> = {
  schema: S;
  system?: string;
  prompt: string;
  image?:
    | { mediaType: "image/png" | "image/jpeg" | "image/webp" | "image/gif"; base64: string }
    | { url: string }
    | null;
  maxTokens?: number;
  effort?: "low" | "medium" | "high";
  meta: LogMeta;
  onText?: (delta: string) => void;
  /** Used instead of the API when ANTHROPIC_MOCK=true. */
  mock: () => z.infer<S>;
};

/**
 * Streams a structured-output call, validates with zod, and retries once on
 * invalid JSON. Every attempt's token usage is logged for the Usage page.
 */
export async function structuredCall<S extends z.ZodType>(call: StructuredCall<S>): Promise<z.infer<S>> {
  if (isMock()) {
    const value = call.mock();
    const json = JSON.stringify(value);
    if (call.onText) {
      for (let i = 0; i < json.length; i += 400) {
        call.onText(json.slice(i, i + 400));
        await new Promise((r) => setTimeout(r, 15));
      }
    }
    await logUsage(call.meta, call.prompt, "mock", Math.ceil(call.prompt.length / 4), Math.ceil(json.length / 4));
    return call.schema.parse(value);
  }

  const anthropic = getClient();
  const content: Anthropic.Beta.BetaContentBlockParam[] = [];
  if (call.image) {
    content.push({
      type: "image",
      source:
        "url" in call.image
          ? { type: "url", url: call.image.url }
          : { type: "base64", media_type: call.image.mediaType, data: call.image.base64 },
    });
  }
  content.push({ type: "text", text: call.prompt });

  let lastProblem = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    let message: Anthropic.Beta.BetaMessage;
    try {
      const stream = anthropic.beta.messages.stream({
        model: MODEL,
        max_tokens: call.maxTokens ?? 32000,
        ...(call.system ? { system: call.system } : {}),
        messages: [{ role: "user", content }],
        output_config: { format: zodOutputFormat(call.schema), effort: call.effort ?? "medium" },
        // Route policy refusals to a fallback model instead of failing outright.
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
      });
      if (call.onText) stream.on("text", call.onText);
      message = await stream.finalMessage();
    } catch (e) {
      // The SDK throws if structured output can't be parsed; treat that as invalid JSON.
      if (e instanceof Anthropic.APIError || e instanceof UserFacingError) throw friendlyApiError(e);
      lastProblem = e instanceof Error ? e.message : String(e);
      continue;
    }

    await logUsage(call.meta, call.prompt, message.model, message.usage.input_tokens, message.usage.output_tokens);

    if (message.stop_reason === "refusal") {
      throw new UserFacingError("The model declined this request. Rephrase the direction and try again.");
    }
    if (message.stop_reason === "max_tokens") {
      lastProblem = "The response was cut off before it finished.";
      continue;
    }
    const text = message.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    try {
      const parsed = call.schema.safeParse(JSON.parse(text));
      if (parsed.success) return parsed.data;
      lastProblem = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    } catch {
      lastProblem = "The response wasn't valid JSON.";
    }
    call.onText?.("\n");
  }
  throw new UserFacingError(`The model returned an invalid response twice (${lastProblem}). Try again.`);
}

export function errorMessage(e: unknown): string {
  const err = friendlyApiError(e);
  if (err instanceof UserFacingError) return err.message;
  console.error(err);
  return "Something went wrong on the server. Try again; if it keeps happening, check the server logs.";
}
