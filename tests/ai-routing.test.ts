import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCandidate } from "@/lib/candidates";
import { callOpenAI, outputText, type AiConfig } from "@/lib/ai/openai";
import { resetAiState, runTask, type TaskPlan } from "@/lib/ai/router";
import { authorQueryInput, TASK_ROUTES, validateAuthorQuery, validateRewrites } from "@/lib/ai/tasks";
import type { OpenJevConfig } from "@/lib/openjev/client";

const responseBody = (json: unknown, model = "m") => ({
  model,
  status: "completed",
  output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(json) }] }],
  usage: { input_tokens: 120, output_tokens: 40, output_tokens_details: { reasoning_tokens: 0 }, input_tokens_details: { cached_tokens: 0 } },
});
const http = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function config(fetchImpl: typeof fetch, extra: Partial<AiConfig> = {}): AiConfig {
  return {
    apiKey: "sk-test",
    baseURL: "https://api.openai.com",
    models: { fast: "nano", standard: "mini", frontier: "frontier" },
    timeoutMs: 1000,
    maxRequestsPerHour: 60,
    retryDelayMs: 0,
    fetchImpl,
    ...extra,
  };
}

function queryPlan(): TaskPlan {
  const c = getCandidate("f06")!;
  const paragraph = "Earlier studies compared canopy maps with thermal imagery, but they were often collected at different times of day.";
  const prompt = authorQueryInput({ candidate: c, paragraph, anchorStart: paragraph.indexOf(c.original), anchorText: c.original, sectionTitle: "Introduction" });
  return {
    task: "author_query",
    prompt,
    accept: (json) => {
      const v = validateAuthorQuery(json, prompt.input);
      return v.ok ? { ok: true, result: { task: "author_query", text: v.value } } : v;
    },
  };
}

const GOOD_QUERY = { query: "AQ: In “but they were often collected”, please clarify whether “they” refers to the canopy maps or the thermal images." };

beforeEach(() => resetAiState());

describe("routing policy", () => {
  it("routes each task to the cheapest adequate tier", () => {
    expect(TASK_ROUTES.author_query).toMatchObject({ tier: "fast", escalateTo: "standard" });
    expect(TASK_ROUTES.alt_text).toMatchObject({ tier: "standard", escalateTo: "frontier" });
    expect(TASK_ROUTES.rewrite_options).toMatchObject({ tier: "frontier", escalateTo: null });
  });

  it("accepts a valid fast-tier answer without escalating", async () => {
    const f = vi.fn(async () => http(responseBody(GOOD_QUERY, "nano")));
    const r = await runTask(queryPlan(), config(f as unknown as typeof fetch), null);
    expect(r.ok).toBe(true);
    expect(f).toHaveBeenCalledTimes(1);
    expect(JSON.parse((f.mock.calls[0] as unknown as [string, RequestInit])[1].body as string).model).toBe("nano");
  });

  it("escalates exactly one tier when the output fails validation", async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(http(responseBody({ query: "Please check this, it says 1,000 things." }, "nano")))
      .mockResolvedValueOnce(http(responseBody(GOOD_QUERY, "mini")));
    const r = await runTask(queryPlan(), config(f as unknown as typeof fetch), null);
    expect(r.ok).toBe(true);
    expect(r.trace.map((t) => [t.model, t.outcome])).toEqual([
      ["nano", "rejected"],
      ["mini", "accepted"],
    ]);
  });

  it("never escalates beyond one step", async () => {
    const f = vi.fn(async () => http(responseBody({ query: "no prefix" })));
    const r = await runTask(queryPlan(), config(f as unknown as typeof fetch), null);
    expect(r.ok).toBe(false);
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("does not escalate on transport or auth errors", async () => {
    const f = vi.fn(async () => http({ error: { message: "Incorrect API key" } }, 401));
    const r = await runTask(queryPlan(), config(f as unknown as typeof fetch), null);
    expect(r).toMatchObject({ ok: false, error: { kind: "auth" } });
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("serves an identical request from cache with no model call", async () => {
    const f = vi.fn(async () => http(responseBody(GOOD_QUERY)));
    await runTask(queryPlan(), config(f as unknown as typeof fetch), null);
    const again = await runTask(queryPlan(), config(f as unknown as typeof fetch), null);
    expect(f).toHaveBeenCalledTimes(1);
    expect(again).toMatchObject({ ok: true, cached: true });
  });

  it("stops at the hourly budget", async () => {
    const f = vi.fn(async () => http(responseBody({ query: "bad" })));
    const r = await runTask(queryPlan(), config(f as unknown as typeof fetch, { maxRequestsPerHour: 1 }), null);
    expect(r).toMatchObject({ ok: false, error: { kind: "budget" } });
    expect(f).toHaveBeenCalledTimes(1);
  });
});

describe("rewrite safety", () => {
  it("rejects options that change protected content, keeps safe ones", () => {
    const { accepted, rejected } = validateRewrites(
      {
        options: [
          { text: "but the two datasets were often collected", note: "names the referent" },
          { text: "but they were never collected", note: "x" },
          { text: "which caused them to be collected", note: "x" },
        ],
      },
      "but they were often collected",
    );
    expect(accepted.map((a) => a.text)).toEqual(["but the two datasets were often collected"]);
    expect(rejected.map((r) => r.reason).join(" ")).toMatch(/negation/);
    expect(rejected.map((r) => r.reason).join(" ")).toMatch(/causation/);
  });

  it("a frontier rewrite is checked by a single batched OpenJEV call and sorted by meaning preservation", async () => {
    const c = getCandidate("f06")!;
    const ai = vi.fn(async () =>
      http(responseBody({ options: [{ text: "but both datasets were often collected", note: "a" }, { text: "but the maps were often collected", note: "b" }] }, "frontier")),
    );
    const jev = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string);
      expect(Object.keys(body.questions)).toEqual(["option_1", "option_2"]);
      return http({ model: "openjev", answers: { option_1: { type: "noul", noul: 0.62 }, option_2: { type: "noul", noul: 0.94 } } });
    });
    const openjev: OpenJevConfig = { apiKey: "k", model: "openjev", baseURL: "https://api.openjev.sh", timeoutMs: 1000, retryDelayMs: 0, fetchImpl: jev as unknown as typeof fetch };
    const plan: TaskPlan = {
      task: "rewrite_options",
      prompt: { instructions: "i", input: "x", schemaName: "rewrite_options", schema: {} },
      accept: (json) => {
        const { accepted, rejected } = validateRewrites(json, c.original);
        return { ok: true, result: { task: "rewrite_options", options: accepted.map((o) => ({ ...o, meaningPreserved: null })), rejected } };
      },
      verify: { original: c.original, context: "…" },
    };
    const r = await runTask(plan, config(ai as unknown as typeof fetch), openjev);
    expect(jev).toHaveBeenCalledTimes(1);
    expect(r.ok && r.result.task === "rewrite_options" && r.result.options.map((o) => o.meaningPreserved)).toEqual([0.94, 0.62]);
  });
});

describe("OpenAI client", () => {
  it("sends a strict JSON-schema Responses request with bounded output and no storage", async () => {
    const f = vi.fn(async () => http(responseBody(GOOD_QUERY)));
    await callOpenAI({ model: "nano", effort: "minimal", instructions: "i", input: "x", schemaName: "q", schema: { type: "object" }, maxOutputTokens: 300 }, config(f as unknown as typeof fetch));
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.openai.com/v1/responses");
    expect(JSON.parse(init.body as string)).toMatchObject({
      model: "nano",
      max_output_tokens: 300,
      reasoning: { effort: "minimal" },
      store: false,
      text: { format: { type: "json_schema", name: "q", strict: true } },
    });
  });

  it("treats an incomplete response as an error, not a result", async () => {
    const f = vi.fn(async () => http({ status: "incomplete", output: [] }));
    const r = await callOpenAI({ model: "m", effort: "low", instructions: "", input: "", schemaName: "s", schema: {}, maxOutputTokens: 10 }, config(f as unknown as typeof fetch));
    expect(r).toMatchObject({ ok: false, error: { kind: "incomplete" } });
  });

  it("extracts output text from message content", () => {
    expect(outputText(responseBody({ a: 1 }))).toBe('{"a":1}');
    expect(outputText({ output: [{ type: "reasoning" }] })).toBeNull();
  });
});
