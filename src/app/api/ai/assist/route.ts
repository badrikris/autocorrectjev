import { NextResponse } from "next/server";
import { getCandidate, kindOf } from "@/lib/candidates";
import { FIGURES, type FigureSpec } from "@/lib/figures";
import { aiConfigFromEnv } from "@/lib/ai/openai";
import { runTask, type AssistResponse, type TaskPlan } from "@/lib/ai/router";
import {
  altTextInput,
  authorQueryInput,
  figureFacts,
  REWRITE_CATEGORIES,
  rewriteInput,
  validateAltText,
  validateAuthorQuery,
  validateRewrites,
  type TaskId,
  type TextContext,
} from "@/lib/ai/tasks";
import { openjevConfigFromEnv } from "@/lib/openjev/client";
import { STYLE_PROFILE } from "@/lib/style-profile";

export const dynamic = "force-dynamic";

interface Body {
  task: TaskId;
  findingId: string;
  paragraph?: string;
  anchorStart?: number;
  sectionTitle?: string;
  caption?: string;
  figure?: Partial<Pick<FigureSpec, "xAxisLabel" | "yAxisLabel">>;
}

const fail = (kind: string, message: string, status: number) =>
  NextResponse.json({ ok: false, error: { kind, message }, trace: [] }, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return fail("invalid_request", "Body must be JSON.", 400);
  }
  const candidate = typeof body.findingId === "string" ? getCandidate(body.findingId) : undefined;
  if (!candidate) return fail("invalid_request", "Unknown finding.", 404);

  const config = aiConfigFromEnv();
  if (!config.apiKey) return fail("not_configured", "OPENAI_API_KEY is not set on the server.", 503);

  // Build the text context from the passage as it stands now.
  const textContext = (): TextContext | null => {
    if (kindOf(candidate) === "figure") {
      return { candidate, paragraph: String(body.caption ?? ""), anchorStart: 0, anchorText: candidate.original, sectionTitle: "Figure" };
    }
    if (typeof body.paragraph !== "string" || typeof body.anchorStart !== "number") return null;
    const anchorText = body.paragraph.slice(body.anchorStart, body.anchorStart + candidate.original.length);
    if (anchorText !== candidate.original) return null;
    return { candidate, paragraph: body.paragraph, anchorStart: body.anchorStart, anchorText, sectionTitle: String(body.sectionTitle ?? "") };
  };

  let plan: TaskPlan;
  switch (body.task) {
    case "author_query": {
      const ctx = textContext();
      if (!ctx) return fail("target_mismatch", "The passage has changed.", 409);
      const prompt = authorQueryInput(ctx);
      plan = {
        task: "author_query",
        prompt,
        accept: (json) => {
          const v = validateAuthorQuery(json, prompt.input);
          return v.ok ? { ok: true, result: { task: "author_query", text: v.value } } : v;
        },
      };
      break;
    }
    case "alt_text": {
      if (!candidate.figure) return fail("invalid_request", "Alt text applies to figures only.", 400);
      const base = FIGURES[candidate.figure.figureId];
      const spec: FigureSpec = {
        ...base,
        xAxisLabel: typeof body.figure?.xAxisLabel === "string" ? body.figure.xAxisLabel : base.xAxisLabel,
        yAxisLabel: typeof body.figure?.yAxisLabel === "string" ? body.figure.yAxisLabel : base.yAxisLabel,
      };
      const facts = figureFacts(spec, String(body.caption ?? ""));
      const prompt = altTextInput(facts);
      plan = {
        task: "alt_text",
        prompt,
        accept: (json) => {
          const v = validateAltText(json, prompt.input);
          return v.ok ? { ok: true, result: { task: "alt_text", text: v.value } } : v;
        },
      };
      break;
    }
    case "rewrite_options": {
      // A frontier call is only justified for meaning-sensitive text findings.
      if (kindOf(candidate) !== "text" || !REWRITE_CATEGORIES.has(candidate.category)) {
        return fail("invalid_request", "Rewrites are offered only for meaning-sensitive passages.", 400);
      }
      const ctx = textContext();
      if (!ctx) return fail("target_mismatch", "The passage has changed.", 409);
      const prompt = rewriteInput(ctx, STYLE_PROFILE.rules);
      plan = {
        task: "rewrite_options",
        prompt,
        accept: (json) => {
          const { accepted, rejected } = validateRewrites(json, candidate.original);
          if (!accepted.length) return { ok: false, reason: rejected.map((r) => r.reason).join("; ") || "no usable options" };
          return { ok: true, result: { task: "rewrite_options", options: accepted.map((o) => ({ ...o, meaningPreserved: null })), rejected } };
        },
        verify: { original: candidate.original, context: ctx.paragraph.slice(Math.max(0, ctx.anchorStart - 300), ctx.anchorStart + candidate.original.length + 300) },
      };
      break;
    }
    default:
      return fail("invalid_request", "Unknown task.", 400);
  }

  const openjev = openjevConfigFromEnv();
  const result: AssistResponse = await runTask(plan, config, openjev.apiKey ? openjev : null);
  return NextResponse.json(result, { status: result.ok ? 200 : 502, headers: { "Cache-Control": "no-store" } });
}
