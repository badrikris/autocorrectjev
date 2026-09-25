/**
 * Server-side OpenAI Responses API client (POST /v1/responses), used only for
 * the few steps that need generation. Never import from client components:
 * it reads OPENAI_API_KEY.
 *
 * Request/response fields follow the official `openai` SDK (v7) types:
 * { model, instructions, input, max_output_tokens, reasoning: { effort },
 *   text: { format: { type: "json_schema", name, schema, strict } }, store }
 * → { status, output: [{ type: "message", content: [{ type: "output_text", text }] }], usage }
 */

export type Tier = "fast" | "standard" | "frontier";
export type Effort = "minimal" | "low" | "medium" | "high";

export interface AiConfig {
  apiKey: string | undefined;
  baseURL: string;
  models: Record<Tier, string>;
  timeoutMs: number;
  maxRequestsPerHour: number;
  fetchImpl?: typeof fetch;
  retryDelayMs?: number;
}

export function aiConfigFromEnv(): AiConfig {
  const env = (k: string) => process.env[k]?.trim() || undefined;
  return {
    apiKey: env("OPENAI_API_KEY"),
    baseURL: (env("OPENAI_BASE_URL") ?? "https://api.openai.com").replace(/\/+$/, ""),
    models: {
      fast: env("OPENAI_MODEL_FAST") ?? "gpt-5.4-nano",
      standard: env("OPENAI_MODEL_STANDARD") ?? "gpt-5.4-mini",
      frontier: env("OPENAI_MODEL_FRONTIER") ?? "gpt-5.5",
    },
    timeoutMs: 45_000,
    maxRequestsPerHour: Number(env("OPENAI_MAX_REQUESTS_PER_HOUR") ?? 60),
  };
}

export interface AiUsage {
  input_tokens: number;
  output_tokens: number;
  reasoning_tokens?: number;
  cached_tokens?: number;
}

export type AiErrorKind = "not_configured" | "auth" | "invalid_request" | "rate_limited" | "timeout" | "server" | "network" | "malformed" | "incomplete" | "budget";

export type AiCallResult =
  | { ok: true; json: unknown; usage: AiUsage | null; latencyMs: number; model: string }
  | { ok: false; error: { kind: AiErrorKind; message: string; status?: number } };

export interface AiRequest {
  model: string;
  effort: Effort;
  instructions: string;
  input: string;
  schemaName: string;
  schema: Record<string, unknown>;
  maxOutputTokens: number;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Pull the model's text out of a Responses API body. */
export function outputText(body: unknown): string | null {
  if (!isRecord(body) || !Array.isArray(body.output)) return null;
  const texts: string[] = [];
  for (const item of body.output) {
    if (!isRecord(item) || item.type !== "message" || !Array.isArray(item.content)) continue;
    for (const c of item.content) if (isRecord(c) && c.type === "output_text" && typeof c.text === "string") texts.push(c.text);
  }
  return texts.length ? texts.join("") : null;
}

function usageOf(body: unknown): AiUsage | null {
  if (!isRecord(body) || !isRecord(body.usage)) return null;
  const u = body.usage;
  const n = (v: unknown) => (typeof v === "number" ? v : undefined);
  return {
    input_tokens: n(u.input_tokens) ?? 0,
    output_tokens: n(u.output_tokens) ?? 0,
    reasoning_tokens: isRecord(u.output_tokens_details) ? n(u.output_tokens_details.reasoning_tokens) : undefined,
    cached_tokens: isRecord(u.input_tokens_details) ? n(u.input_tokens_details.cached_tokens) : undefined,
  };
}

function kindForStatus(status: number): AiErrorKind {
  if (status === 401 || status === 403) return "auth";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "server";
  return "invalid_request";
}

/** One structured call. At most one retry, for 429/5xx/connection errors only. */
export async function callOpenAI(req: AiRequest, config: AiConfig): Promise<AiCallResult> {
  if (!config.apiKey) return { ok: false, error: { kind: "not_configured", message: "OPENAI_API_KEY is not set." } };
  const doFetch = config.fetchImpl ?? fetch;
  const body = {
    model: req.model,
    instructions: req.instructions,
    input: req.input,
    max_output_tokens: req.maxOutputTokens,
    reasoning: { effort: req.effort },
    text: { format: { type: "json_schema", name: req.schemaName, schema: req.schema, strict: true } },
    store: false,
  };
  for (let attempt = 0; attempt < 2; attempt++) {
    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeoutMs);
    let res: Response;
    let parsed: unknown;
    try {
      res = await doFetch(`${config.baseURL}/v1/responses`, {
        method: "POST",
        headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
        cache: "no-store",
      });
      const text = await res.text();
      try {
        parsed = text ? JSON.parse(text) : undefined;
      } catch {
        parsed = text;
      }
    } catch (err) {
      clearTimeout(timer);
      if (controller.signal.aborted) return { ok: false, error: { kind: "timeout", message: `No response within ${config.timeoutMs / 1000} s.` } };
      if (attempt === 0) {
        await wait(config.retryDelayMs ?? 1000);
        continue;
      }
      return { ok: false, error: { kind: "network", message: err instanceof Error ? err.message : "Connection failed." } };
    }
    clearTimeout(timer);
    if (!res.ok) {
      const kind = kindForStatus(res.status);
      const message = isRecord(parsed) && isRecord(parsed.error) && typeof parsed.error.message === "string" ? parsed.error.message : `HTTP ${res.status}`;
      if (attempt === 0 && (kind === "rate_limited" || kind === "server")) {
        await wait(config.retryDelayMs ?? 1000);
        continue;
      }
      return { ok: false, error: { kind, message, status: res.status } };
    }
    if (isRecord(parsed) && parsed.status === "incomplete") {
      return { ok: false, error: { kind: "incomplete", message: "The model stopped before finishing (output limit reached)." } };
    }
    const text = outputText(parsed);
    if (text === null) return { ok: false, error: { kind: "malformed", message: "No output text in the response." } };
    try {
      return { ok: true, json: JSON.parse(text), usage: usageOf(parsed), latencyMs: Date.now() - started, model: isRecord(parsed) && typeof parsed.model === "string" ? parsed.model : req.model };
    } catch {
      return { ok: false, error: { kind: "malformed", message: "The output was not valid JSON." } };
    }
  }
  return { ok: false, error: { kind: "network", message: "Unknown failure." } };
}
