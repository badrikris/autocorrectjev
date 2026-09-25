"use client";

/** Client helpers and UI for on-demand generation (never automatic). */
import { ArrowRight, Check, X } from "lucide-react";
import type { AssistResponse, TraceStep } from "@/lib/ai/router";

export interface AiStatus {
  configured: boolean;
  models: { fast: string; standard: string; frontier: string };
  maxRequestsPerHour: number;
  routes: Record<string, { tier: string; model: string; escalateTo: string | null; rationale: string }>;
}

export async function requestAssist(body: Record<string, unknown>): Promise<AssistResponse> {
  try {
    const res = await fetch("/api/ai/assist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return (await res.json()) as AssistResponse;
  } catch (err) {
    return { ok: false, error: { kind: "network", message: err instanceof Error ? err.message : "Request failed." }, trace: [] };
  }
}

const tokens = (s: TraceStep) => (s.usage ? s.usage.input_tokens + s.usage.output_tokens : 0);

/** The route a request actually took: each model tried, what happened, tokens used. */
export function AiTrace({ response }: { response: AssistResponse }) {
  const steps = response.trace;
  const total = steps.reduce((n, s) => n + tokens(s), 0);
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] text-ink-3" title={response.ok ? response.rationale : undefined}>
      {steps.map((s, i) => (
        <span key={i} className="inline-flex items-center gap-1">
          {i > 0 && <ArrowRight size={10} className="text-ink-3/70" />}
          {s.kind === "cache" ? (
            <span>cached · no model call</span>
          ) : (
            <>
              <span className="tabular font-medium text-ink-2">{s.model}</span>
              {s.outcome === "accepted" ? <Check size={11} className="text-olive" /> : s.outcome === "skipped" ? null : <X size={11} className="text-terra" />}
              {s.outcome === "rejected" && <span className="text-terra">{s.detail}</span>}
              {s.outcome === "error" && <span className="text-terra">{s.detail}</span>}
              {s.kind === "verify" && s.outcome === "skipped" && <span>{s.detail}</span>}
            </>
          )}
        </span>
      ))}
      {total > 0 && <span className="tabular">· {total.toLocaleString()} tokens</span>}
    </div>
  );
}
