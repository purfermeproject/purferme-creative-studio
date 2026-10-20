import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { z as zod } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { createHash } from "node:crypto";
import type { z } from "zod";
import { db, schema } from "@/db";
import type { Platform } from "./types";
import { ForbiddenError } from "./roles";

export const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";
export const OPENAI_TEXT_MODEL = process.env.OPENAI_MODEL || "gpt-5.5";
export const isMock = () => process.env.ANTHROPIC_MOCK === "true" || process.env.AI_MOCK === "true";

/**
 * Which service writes the text. AI_PROVIDER forces it; otherwise Anthropic when
 * its key is set, else OpenAI when its key is set.
 */
export function textProvider(): "anthropic" | "openai" {
  const forced = process.env.AI_PROVIDER;
  if (forced === "anthropic" || forced === "openai") return forced;
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.OPENAI_API_KEY) return "openai";
  return "anthropic";
}

/** An error whose message is safe and useful to show the team. */
export class UserFacingError extends Error {}

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new UserFacingError("No AI key is set. Add OPENAI_API_KEY (or ANTHROPIC_API_KEY) to .env.local and restart the app.");
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

/** Digs the low-level reason (e.g. ENOTFOUND, ECONNRESET, certificate error) out of a connection error. */
function connectionCause(e: unknown): string {
  let cur: unknown = e;
  let last = "";
  for (let i = 0; i < 5 && cur; i++) {
    const c = cur as { code?: string; message?: string; cause?: unknown };
    last = [c.code, c.message].filter(Boolean).join(": ") || last;
    cur = c.cause;
  }
  return last || "no details";
}

function friendlyApiError(e: unknown): Error {
  if (e instanceof UserFacingError) return e;
  if (e instanceof ForbiddenError) return new UserFacingError(e.message);
  if (e instanceof OpenAI.AuthenticationError) return new UserFacingError("OpenAI rejected the key. Check OPENAI_API_KEY in .env.local.");
  if (e instanceof OpenAI.RateLimitError) return new UserFacingError("OpenAI is rate-limiting or your credit has run out. Check your OpenAI billing, then try again.");
  if (e instanceof OpenAI.NotFoundError) return new UserFacingError(`OpenAI model "${OPENAI_TEXT_MODEL}" isn't available on your account. Set OPENAI_MODEL in .env.local (e.g. gpt-5.5 or gpt-4.1).`);
  if (e instanceof OpenAI.BadRequestError) return new UserFacingError(`OpenAI rejected the request: ${e.message}`);
  if (e instanceof OpenAI.APIConnectionError) {
    console.error("OpenAI connection error:", e, (e as { cause?: unknown }).cause);
    return new UserFacingError(`Couldn't reach OpenAI from this computer (${connectionCause(e)}). Check your internet, VPN, proxy or antivirus, then try again.`);
  }
  if (e instanceof OpenAI.APIError) {
    // Errors sent inside the stream have no HTTP status; OpenAI's own message says what went wrong.
    console.error("OpenAI error:", e);
    return new UserFacingError(`OpenAI returned an error${e.status ? ` (${e.status})` : ""}: ${e.message}`);
  }
  if (e instanceof Anthropic.AuthenticationError) return new UserFacingError("The Anthropic API key was rejected. Ask an admin to check ANTHROPIC_API_KEY.");
  if (e instanceof Anthropic.RateLimitError) return new UserFacingError("The model is rate-limited right now. Wait a minute and try again.");
  if (e instanceof Anthropic.NotFoundError) return new UserFacingError(`Model "${MODEL}" wasn't found. Ask an admin to check ANTHROPIC_MODEL.`);
  if (e instanceof Anthropic.BadRequestError) return new UserFacingError(`The model rejected the request: ${e.message}`);
  if (e instanceof Anthropic.APIConnectionError) {
    console.error("Anthropic connection error:", e, (e as { cause?: unknown }).cause);
    return new UserFacingError(`Couldn't reach Anthropic from this computer (${connectionCause(e)}). Check your internet, VPN, proxy or antivirus, then try again.`);
  }
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
  /** Let the model search the web (India) before answering. */
  webSearch?: { maxUses: number };
  /** Receives the pages the search tool actually returned, to check the model's citations against. */
  onSources?: (sources: WebSource[]) => void;
};

export type WebSource = { title: string; url: string };

/** The JSON object in a reply that may have some prose around it (web search replies can). */
export function extractJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("no JSON object");
  return JSON.parse(text.slice(start, end + 1));
}

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

  if (textProvider() === "openai") return openaiStructuredCall(call);

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
  // If the API won't combine web search with a strict output format, ask for the JSON in the prompt instead (still zod-validated).
  let schemaInPrompt = false;
  for (let attempt = 0; attempt < 2; attempt++) {
    let message: Anthropic.Beta.BetaMessage;
    const blocks: Anthropic.Beta.BetaContentBlock[] = [];
    try {
      const messages: Anthropic.Beta.BetaMessageParam[] = [
        { role: "user", content: schemaInPrompt ? [...content, { type: "text" as const, text: schemaInstruction(call.schema) }] : content },
      ];
      // Long searches can pause the turn; send it back to let the model carry on (a few times at most).
      for (let turn = 0; ; turn++) {
        const stream = anthropic.beta.messages.stream({
          model: MODEL,
          max_tokens: call.maxTokens ?? 32000,
          ...(call.system ? { system: call.system } : {}),
          messages,
          output_config: schemaInPrompt ? { effort: call.effort ?? "medium" } : { format: zodOutputFormat(call.schema), effort: call.effort ?? "medium" },
          ...(call.webSearch
            ? { tools: [{ type: "web_search_20260318" as const, name: "web_search" as const, max_uses: call.webSearch.maxUses, user_location: { type: "approximate" as const, country: "IN" } }] }
            : {}),
          // Route policy refusals to a fallback model instead of failing outright.
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
        });
        if (call.onText) stream.on("text", call.onText);
        message = await stream.finalMessage();
        blocks.push(...message.content);
        if (message.stop_reason !== "pause_turn" || turn >= 3) break;
        messages.push({ role: "assistant", content: message.content as Anthropic.Beta.BetaContentBlockParam[] });
      }
    } catch (e) {
      if (call.webSearch && !schemaInPrompt && e instanceof Anthropic.BadRequestError && /format|schema|output/i.test(e.message)) {
        schemaInPrompt = true;
        attempt--;
        continue;
      }
      // The SDK throws if structured output can't be parsed; treat that as invalid JSON.
      if (e instanceof Anthropic.APIError || e instanceof UserFacingError) throw friendlyApiError(e);
      lastProblem = e instanceof Error ? e.message : String(e);
      continue;
    }

    await logUsage(call.meta, call.prompt, message.model, message.usage.input_tokens, message.usage.output_tokens);
    if (call.onSources) {
      const found: WebSource[] = [];
      for (const b of blocks) if (b.type === "web_search_tool_result" && Array.isArray(b.content)) for (const r of b.content) found.push({ title: r.title, url: r.url });
      call.onSources(found);
    }

    if (message.stop_reason === "refusal") {
      throw new UserFacingError("The model declined this request. Rephrase the direction and try again.");
    }
    if (message.stop_reason === "max_tokens") {
      lastProblem = "The response was cut off before it finished.";
      continue;
    }
    // With web search, the answer is the text after the last search result.
    const lastResult = blocks.map((b) => b.type).lastIndexOf("web_search_tool_result");
    const text = blocks.slice(lastResult + 1).map((b) => (b.type === "text" ? b.text : "")).join("");
    try {
      const parsed = call.schema.safeParse(dropNulls(call.webSearch || schemaInPrompt ? extractJson(text) : JSON.parse(text)));
      if (parsed.success) return parsed.data;
      lastProblem = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    } catch {
      lastProblem = "The response wasn't valid JSON.";
    }
    call.onText?.("\n");
  }
  throw new UserFacingError(`The model returned an invalid response twice (${lastProblem}). Try again.`);
}

/**
 * OpenAI strict mode needs every property listed as required and no extra keys.
 * Optional properties become nullable instead (nulls are dropped again before zod validation).
 */
export function toOpenAIStrictSchema(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(toOpenAIStrictSchema);
  if (!node || typeof node !== "object") return node;
  const n = Object.fromEntries(Object.entries(node).map(([k, v]) => [k, toOpenAIStrictSchema(v)])) as Record<string, unknown>;
  if (n.type === "object" && n.properties && typeof n.properties === "object") {
    const props = n.properties as Record<string, Record<string, unknown>>;
    const required = new Set((n.required as string[] | undefined) ?? []);
    for (const key of Object.keys(props)) {
      if (!required.has(key)) props[key] = { anyOf: [props[key], { type: "null" }] };
    }
    n.required = Object.keys(props);
    n.additionalProperties = false;
  }
  return n;
}

/** Models sometimes write null for optional fields; treat null as "not provided" before validating. */
export function dropNulls(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(dropNulls);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== null).map(([k, v]) => [k, dropNulls(v)]));
  }
  return value;
}

export function errorMessage(e: unknown): string {
  const err = friendlyApiError(e);
  if (err instanceof UserFacingError) return err.message;
  console.error(err);
  return "Something went wrong on the server. Try again; if it keeps happening, check the server logs.";
}

let openaiClient: OpenAI | null = null;
let openaiCanStream = true;

/** Same contract as the Anthropic path: stream, validate with zod, retry once, log usage. */
async function openaiStructuredCall<S extends z.ZodType>(call: StructuredCall<S>): Promise<z.infer<S>> {
  if (!process.env.OPENAI_API_KEY) {
    throw new UserFacingError("No AI key is set. Add OPENAI_API_KEY (or ANTHROPIC_API_KEY) to .env.local and restart the app.");
  }
  openaiClient ??= new OpenAI();
  const { $schema: _ignored, ...rawSchema } = zod.toJSONSchema(call.schema) as Record<string, unknown>;
  void _ignored;
  const jsonSchema = toOpenAIStrictSchema(rawSchema) as Record<string, unknown>;

  const content: OpenAI.Responses.ResponseInputContent[] = [];
  if (call.image) {
    content.push({
      type: "input_image",
      detail: "auto",
      image_url: "url" in call.image ? call.image.url : `data:${call.image.mediaType};base64,${call.image.base64}`,
    });
  }
  content.push({ type: "input_text", text: call.prompt });

  const baseParams = {
    model: OPENAI_TEXT_MODEL,
    ...(call.system ? { instructions: call.system } : {}),
    input: [{ role: "user" as const, content }],
    max_output_tokens: call.maxTokens ?? 32000,
    text: { format: { type: "json_schema" as const, name: "result", schema: jsonSchema, strict: true } },
    ...(call.webSearch
      ? {
          tools: [{ type: "web_search" as const, user_location: { type: "approximate" as const, country: "IN" } }],
          include: ["web_search_call.action.sources" as const],
        }
      : {}),
  };

  let lastProblem = "";
  let schemaInPrompt = false;
  for (let attempt = 0; attempt < 2; attempt++) {
    let response: OpenAI.Responses.Response;
    const params = schemaInPrompt
      ? { ...baseParams, text: undefined, input: [{ role: "user" as const, content: [...content, { type: "input_text" as const, text: schemaInstruction(call.schema) }] }] }
      : baseParams;
    try {
      if (!openaiCanStream) {
        response = await openaiClient.responses.create(params);
      } else {
        try {
          const stream = openaiClient.responses.stream(params);
          if (call.onText) stream.on("response.output_text.delta", (e) => call.onText!(e.delta));
          response = await stream.finalResponse();
        } catch (e) {
          // Some OpenAI accounts must be verified before they can stream newer models.
          // Fall back to a normal (non-streamed) request and remember for next time.
          if (e instanceof OpenAI.APIError && /verif|stream/i.test(e.message)) {
            console.warn("OpenAI won't stream for this account; using non-streamed requests:", e.message);
            openaiCanStream = false;
            response = await openaiClient.responses.create(params);
          } else {
            throw e;
          }
        }
      }
    } catch (e) {
      if (call.webSearch && !schemaInPrompt && e instanceof OpenAI.BadRequestError && /format|schema|json|web_search/i.test(e.message)) {
        schemaInPrompt = true;
        attempt--;
        continue;
      }
      // The SDK throws its own error when the JSON can't be parsed; treat that as invalid output and retry.
      if (e instanceof OpenAI.APIError || e instanceof UserFacingError) throw friendlyApiError(e);
      console.error("OpenAI response problem:", e);
      lastProblem = e instanceof Error ? e.message : String(e);
      continue;
    }

    await logUsage(call.meta, call.prompt, response.model, response.usage?.input_tokens ?? 0, response.usage?.output_tokens ?? 0);
    if (call.onSources) call.onSources(openaiSources(response));

    if (response.status === "incomplete") {
      lastProblem = response.incomplete_details?.reason === "content_filter" ? "OpenAI's safety filter stopped the response." : "The response was cut off before it finished.";
      continue;
    }
    try {
      const parsed = call.schema.safeParse(dropNulls(schemaInPrompt ? extractJson(response.output_text) : JSON.parse(response.output_text)));
      if (parsed.success) return parsed.data;
      lastProblem = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    } catch {
      lastProblem = "The response wasn't valid JSON.";
    }
    call.onText?.("\n");
  }
  throw new UserFacingError(`The model returned an invalid response twice (${lastProblem}). Try again.`);
}

/** Pages OpenAI's web search returned or cited. */
function openaiSources(response: OpenAI.Responses.Response): WebSource[] {
  const out: WebSource[] = [];
  for (const item of response.output) {
    if (item.type === "web_search_call") {
      const action = item.action as { sources?: { url?: string }[] } | undefined;
      for (const s of action?.sources ?? []) if (s.url) out.push({ title: "", url: s.url });
    }
    if (item.type === "message") {
      for (const c of item.content) {
        if (c.type !== "output_text") continue;
        for (const a of c.annotations) if (a.type === "url_citation") out.push({ title: a.title, url: a.url });
      }
    }
  }
  return out;
}

/** Fallback instruction when a strict output format can't be used together with tools. */
function schemaInstruction(schema: z.ZodType): string {
  const { $schema: _ignored, ...json } = zod.toJSONSchema(schema) as Record<string, unknown>;
  void _ignored;
  return `When you have finished researching, reply with ONLY one JSON object (no prose, no code fences) matching this JSON Schema:\n${JSON.stringify(json)}`;
}
