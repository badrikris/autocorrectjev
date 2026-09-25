import type { JevDecision } from "../policy";

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

export type JevErrorKind =
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

export interface JevError {
  kind: JevErrorKind;
  message: string;
  status?: number;
  requestId?: string;
}

export interface JevTechnical {
  model: string;
  requestId?: string;
  latencyMs: number;
  usage?: { input_tokens: number; output_tokens: number };
  /** The request body sent to Jev (no credentials). */
  request: unknown;
  /** The raw response body returned by Jev. */
  response: unknown;
}

export type EvaluateResponseBody =
  | { ok: true; decision: JevDecision; technical: JevTechnical }
  | { ok: false; error: JevError };

export interface JevStatusBody {
  configured: boolean;
  model: string;
}

export const ERROR_COPY: Record<JevErrorKind, string> = {
  not_configured: "Jev is not configured on the server.",
  auth: "Jev rejected the API key.",
  invalid_request: "Jev rejected the request.",
  rate_limited: "Jev’s rate limit was reached.",
  timeout: "Jev did not respond in time.",
  server: "Jev had a temporary server error.",
  network: "Jev could not be reached.",
  malformed: "Jev’s response did not match the documented format.",
  target_mismatch: "The passage changed before it could be evaluated.",
  unknown_finding: "Unknown finding.",
};
