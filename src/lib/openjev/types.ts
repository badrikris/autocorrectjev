import type { OpenJevDecision } from "../policy";

/** Sent by the browser to our server route. Contains no secrets. */
export interface EvaluateRequestBody {
  findingId: string;
  blockText: string;
  anchorStart: number;
  sectionTitle: string;
  precedingText: string | null;
  followingText: string | null;
  related: { label: string; text: string }[];
}

export type OpenJevErrorKind =
  | "not_configured"
  | "auth"
  | "invalid_request"
  | "rate_limited"
  | "timeout"
  | "server"
  | "network"
  | "malformed"
  | "target_mismatch"
  | "unknown_finding";

export interface OpenJevError {
  kind: OpenJevErrorKind;
  message: string;
  status?: number;
  requestId?: string;
}

export interface OpenJevTechnical {
  model: string;
  requestId?: string;
  latencyMs: number;
  usage?: { input_tokens: number; output_tokens: number };
  /** The request body sent to OpenJEV (no credentials). */
  request: unknown;
  /** The raw response body returned by OpenJEV. */
  response: unknown;
}

export type EvaluateResponseBody =
  | { ok: true; decision: OpenJevDecision; technical: OpenJevTechnical }
  | { ok: false; error: OpenJevError };

export interface OpenJevStatusBody {
  configured: boolean;
  model: string;
}

export const ERROR_COPY: Record<OpenJevErrorKind, string> = {
  not_configured: "OpenJEV is not configured on the server.",
  auth: "OpenJEV rejected the API key.",
  invalid_request: "OpenJEV rejected the request.",
  rate_limited: "OpenJEV’s rate limit was reached.",
  timeout: "OpenJEV did not respond in time.",
  server: "OpenJEV had a temporary server error.",
  network: "OpenJEV could not be reached.",
  malformed: "OpenJEV’s response did not match the documented format.",
  target_mismatch: "The passage changed before it could be evaluated.",
  unknown_finding: "Unknown finding.",
};
