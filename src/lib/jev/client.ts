/**
 * Server-side Jev HTTP client. Never import this from client components:
 * it reads TYPESAFE_API_KEY.
 */
import { ROUTES, type JevDecision, type Route } from "../policy";
import type { JevError, JevErrorKind, JevTechnical } from "./types";

export interface JevConfig {
  apiKey: string | undefined;
  model: string;
  baseURL: string;
  timeoutMs: number;
  fetchImpl?: typeof fetch;
  /** Delay before the single retry for transient failures. Tests set this to 0. */
  retryDelayMs?: number;
}

export function jevConfigFromEnv(): JevConfig {
  return {
    apiKey: process.env.TYPESAFE_API_KEY?.trim() || undefined,
    model: process.env.JEV_MODEL?.trim() || "jev-latest",
    baseURL: (process.env.TYPESAFE_BASE_URL?.trim() || "https://api.typesafe.ai").replace(/\/+$/, ""),
    timeoutMs: 20_000,
  };
}

export type JevCallResult =
  | { ok: true; decision: JevDecision; technical: JevTechnical }
  | { ok: false; error: JevError; technical?: Partial<JevTechnical> };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isProb = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1;

/**
 * Parse the documented System One response:
 *   { model, answers: { route: {type:"choice", choice, confidence, probabilities},
 *                       finding_valid: {type:"noul", noul}, meaning_preserved?: {type:"noul", noul} }, usage }
 * Returns null when anything required is missing or out of range. Never fills gaps.
 */
export function parseJevResponse(body: unknown, expectMeaning: boolean): JevDecision | null {
  if (!isRecord(body) || !isRecord(body.answers)) return null;
  const { route, finding_valid, meaning_preserved } = body.answers as Record<string, unknown>;
  if (!isRecord(route) || route.type !== "choice") return null;
  if (typeof route.choice !== "string" || !(ROUTES as readonly string[]).includes(route.choice)) return null;
  if (!isProb(route.confidence) || !isRecord(route.probabilities)) return null;
  const probabilities = {} as Record<Route, number>;
  for (const r of ROUTES) {
    const p = route.probabilities[r];
    if (!isProb(p)) return null;
    probabilities[r] = p;
  }
  if (!isRecord(finding_valid) || finding_valid.type !== "noul" || !isProb(finding_valid.noul)) return null;
  let meaning: number | null = null;
  if (expectMeaning) {
    if (!isRecord(meaning_preserved) || meaning_preserved.type !== "noul" || !isProb(meaning_preserved.noul)) return null;
    meaning = meaning_preserved.noul;
  }
  return {
    route: route.choice as Route,
    routeConfidence: route.confidence,
    routeProbabilities: probabilities,
    findingValid: finding_valid.noul,
    meaningPreserved: meaning,
  };
}

function kindForStatus(status: number): JevErrorKind {
  if (status === 401 || status === 403) return "auth";
  if (status === 429) return "rate_limited";
  if (status === 408) return "timeout";
  if (status >= 500) return "server";
  return "invalid_request";
}

function extractMessage(body: unknown): string | undefined {
  if (typeof body === "string") return body.slice(0, 200) || undefined;
  if (!isRecord(body)) return undefined;
  const { error, message, detail } = body;
  if (typeof error === "string") return error;
  if (isRecord(error) && typeof error.message === "string") return error.message;
  if (typeof message === "string") return message;
  if (typeof detail === "string") return detail;
  return undefined;
}

async function readBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/**
 * One evaluation. At most one retry, and only for transient failures
 * (429, 5xx, connection errors). Timeouts are not retried.
 */
export async function callJev(payload: { model: string; questions: Record<string, unknown> } & Record<string, unknown>, config: JevConfig): Promise<JevCallResult> {
  if (!config.apiKey) {
    return { ok: false, error: { kind: "not_configured", message: "TYPESAFE_API_KEY is not set." } };
  }
  const doFetch = config.fetchImpl ?? fetch;
  const expectMeaning = "meaning_preserved" in payload.questions;
  const url = `${config.baseURL}/v1/systemone`;

  let lastError: JevError | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeoutMs);
    let res: Response;
    let body: unknown;
    try {
      res = await doFetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
        cache: "no-store",
      });
      body = await readBody(res);
    } catch (err) {
      clearTimeout(timer);
      if (controller.signal.aborted) {
        return { ok: false, error: { kind: "timeout", message: `No response within ${Math.round(config.timeoutMs / 1000)} s.` } };
      }
      lastError = { kind: "network", message: err instanceof Error ? err.message : "Connection failed." };
      if (attempt === 0) {
        await wait(config.retryDelayMs ?? 1000);
        continue;
      }
      return { ok: false, error: lastError };
    }
    clearTimeout(timer);
    const requestId = res.headers.get("x-typesafe-request-id") ?? undefined;
    const latencyMs = Date.now() - started;

    if (!res.ok) {
      const kind = kindForStatus(res.status);
      lastError = { kind, status: res.status, requestId, message: extractMessage(body) ?? `HTTP ${res.status}` };
      if (attempt === 0 && (kind === "rate_limited" || kind === "server")) {
        const retryAfter = Number(res.headers.get("retry-after"));
        await wait(Number.isFinite(retryAfter) && retryAfter > 0 && retryAfter <= 5 ? retryAfter * 1000 : config.retryDelayMs ?? 1000);
        continue;
      }
      return { ok: false, error: lastError, technical: { request: payload, response: body, requestId, latencyMs } };
    }

    const decision = parseJevResponse(body, expectMeaning);
    const technical: JevTechnical = {
      model: isRecord(body) && typeof body.model === "string" ? body.model : payload.model,
      requestId,
      latencyMs,
      usage: isRecord(body) && isRecord(body.usage) ? (body.usage as JevTechnical["usage"]) : undefined,
      request: payload,
      response: body,
    };
    if (!decision) {
      return { ok: false, error: { kind: "malformed", requestId, message: "Response did not match the documented System One format." }, technical };
    }
    return { ok: true, decision, technical };
  }
  return { ok: false, error: lastError ?? { kind: "network", message: "Unknown failure." } };
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
