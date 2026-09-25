import { describe, expect, it, vi } from "vitest";
import { getCandidate } from "@/lib/candidates";
import { createDoc } from "@/lib/document";
import { callJev, parseJevResponse, type JevConfig } from "@/lib/jev/client";
import { buildJevPayload } from "@/lib/jev/payload";

const validBody = {
  model: "jev-latest",
  answers: {
    route: {
      type: "choice",
      choice: "AUTO_APPLY",
      confidence: 0.97,
      probabilities: { AUTO_APPLY: 0.97, SUGGEST: 0.02, MANUAL_REVIEW: 0.005, NO_CHANGE: 0.005 },
    },
    finding_valid: { type: "noul", noul: 0.99 },
    meaning_preserved: { type: "noul", noul: 0.995 },
  },
  usage: { input_tokens: 812, output_tokens: 3 },
};

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

function payload() {
  const c = getCandidate("f01")!;
  const text = createDoc().blocks["abs-1"].text;
  return buildJevPayload(c, { blockText: text, anchorStart: text.indexOf("teh"), sectionTitle: "Abstract", precedingText: null, followingText: null, related: [] }, "jev-latest");
}

const config = (fetchImpl: typeof fetch, extra: Partial<JevConfig> = {}): JevConfig => ({
  apiKey: "test-key",
  model: "jev-latest",
  baseURL: "https://api.typesafe.ai",
  timeoutMs: 1000,
  retryDelayMs: 0,
  fetchImpl,
  ...extra,
});

describe("Jev payload", () => {
  it("uses the documented System One shape with choice and noul questions", () => {
    const p = payload();
    expect(p.model).toBe("jev-latest");
    expect(p.questions.route).toMatchObject({ type: "choice", criteria: { AUTO_APPLY: expect.any(String), SUGGEST: expect.any(String), MANUAL_REVIEW: expect.any(String), NO_CHANGE: expect.any(String) } });
    expect(p.questions.finding_valid).toMatchObject({ type: "noul" });
    expect(p.questions.meaning_preserved).toMatchObject({ type: "noul" });
    expect(p.state.proposed_edit.target_in_context).toContain("⟦teh⟧");
  });

  it("omits meaning_preserved when there is no replacement", () => {
    const c = getCandidate("f20")!;
    const text = createDoc().blocks["disc-2"].text;
    const p = buildJevPayload(c, { blockText: text, anchorStart: text.indexOf(c.original), sectionTitle: "Discussion", precedingText: null, followingText: null, related: [] }, "jev-latest");
    expect(p.questions.meaning_preserved).toBeUndefined();
  });
});

describe("Jev response parsing", () => {
  it("parses the documented response", () => {
    expect(parseJevResponse(validBody, true)).toEqual({
      route: "AUTO_APPLY",
      routeConfidence: 0.97,
      routeProbabilities: validBody.answers.route.probabilities,
      findingValid: 0.99,
      meaningPreserved: 0.995,
    });
  });

  it("rejects malformed responses instead of filling gaps", () => {
    const broken = [
      {},
      { answers: {} },
      { answers: { ...validBody.answers, route: { ...validBody.answers.route, choice: "MAYBE" } } },
      { answers: { ...validBody.answers, route: { ...validBody.answers.route, confidence: 1.4 } } },
      { answers: { ...validBody.answers, route: { ...validBody.answers.route, probabilities: { AUTO_APPLY: 1 } } } },
      { answers: { ...validBody.answers, finding_valid: { type: "noul" } } },
      { answers: { route: validBody.answers.route, finding_valid: validBody.answers.finding_valid } },
    ];
    for (const b of broken) expect(parseJevResponse(b, true)).toBeNull();
  });
});

describe("Jev client", () => {
  it("sends Bearer auth to /v1/systemone and returns the decision", async () => {
    const fetchImpl = vi.fn(async () => json(validBody, 200, { "x-typesafe-request-id": "req_1" }));
    const r = await callJev(payload(), config(fetchImpl as unknown as typeof fetch));
    expect(r.ok).toBe(true);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.typesafe.ai/v1/systemone");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer test-key");
    if (r.ok) expect(r.technical.requestId).toBe("req_1");
  });

  it("reports missing configuration without calling the network", async () => {
    const fetchImpl = vi.fn();
    const r = await callJev(payload(), config(fetchImpl as unknown as typeof fetch, { apiKey: undefined }));
    expect(r).toMatchObject({ ok: false, error: { kind: "not_configured" } });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("authentication failure is not retried", async () => {
    const fetchImpl = vi.fn(async () => json({ error: "invalid api key" }, 401));
    const r = await callJev(payload(), config(fetchImpl as unknown as typeof fetch));
    expect(r).toMatchObject({ ok: false, error: { kind: "auth", status: 401 } });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("invalid request is reported", async () => {
    const fetchImpl = vi.fn(async () => json({ detail: [{ loc: ["body", "questions"], msg: "bad" }] }, 422));
    const r = await callJev(payload(), config(fetchImpl as unknown as typeof fetch));
    expect(r).toMatchObject({ ok: false, error: { kind: "invalid_request", status: 422 } });
  });

  it("temporary failures retry once, then fail", async () => {
    const fetchImpl = vi.fn(async () => json({ error: "overloaded" }, 503));
    const r = await callJev(payload(), config(fetchImpl as unknown as typeof fetch));
    expect(r).toMatchObject({ ok: false, error: { kind: "server" } });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("a temporary failure followed by success succeeds", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(json({}, 500)).mockResolvedValueOnce(json(validBody));
    const r = await callJev(payload(), config(fetchImpl as unknown as typeof fetch));
    expect(r.ok).toBe(true);
  });

  it("times out without retrying", async () => {
    const fetchImpl = vi.fn((_url: string, init: RequestInit) =>
      new Promise<Response>((_, reject) => init.signal!.addEventListener("abort", () => reject(new Error("aborted")))),
    );
    const r = await callJev(payload(), config(fetchImpl as unknown as typeof fetch, { timeoutMs: 20 }));
    expect(r).toMatchObject({ ok: false, error: { kind: "timeout" } });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("a malformed 200 response is an error, not a decision", async () => {
    const fetchImpl = vi.fn(async () => json({ answers: { route: { type: "choice", choice: "AUTO_APPLY" } } }));
    const r = await callJev(payload(), config(fetchImpl as unknown as typeof fetch));
    expect(r).toMatchObject({ ok: false, error: { kind: "malformed" } });
  });
});
