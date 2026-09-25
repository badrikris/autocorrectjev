import { NextResponse } from "next/server";
import { getCandidate } from "@/lib/candidates";
import { callJev, jevConfigFromEnv } from "@/lib/jev/client";
import { buildJevPayload } from "@/lib/jev/payload";
import type { EvaluateRequestBody, EvaluateResponseBody } from "@/lib/jev/types";

export const dynamic = "force-dynamic";

const reply = (body: EvaluateResponseBody, status = 200) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(req: Request) {
  let input: EvaluateRequestBody;
  try {
    input = (await req.json()) as EvaluateRequestBody;
  } catch {
    return reply({ ok: false, error: { kind: "invalid_request", message: "Body must be JSON." } }, 400);
  }

  // Prepared candidate content is authoritative on the server.
  const candidate = typeof input?.findingId === "string" ? getCandidate(input.findingId) : undefined;
  if (!candidate) return reply({ ok: false, error: { kind: "unknown_finding", message: "Unknown finding." } }, 404);
  if (typeof input.blockText !== "string" || typeof input.anchorStart !== "number") {
    return reply({ ok: false, error: { kind: "invalid_request", message: "Missing passage text." } }, 400);
  }
  const at = input.blockText.slice(input.anchorStart, input.anchorStart + candidate.original.length);
  if (at !== candidate.original) {
    return reply({ ok: false, error: { kind: "target_mismatch", message: "The original text is not at the expected position." } }, 409);
  }

  const config = jevConfigFromEnv();
  if (!config.apiKey) {
    return reply({ ok: false, error: { kind: "not_configured", message: "TYPESAFE_API_KEY is not set on the server." } }, 503);
  }

  const payload = buildJevPayload(
    candidate,
    {
      blockText: input.blockText,
      anchorStart: input.anchorStart,
      sectionTitle: String(input.sectionTitle ?? ""),
      precedingText: typeof input.precedingText === "string" ? input.precedingText : null,
      followingText: typeof input.followingText === "string" ? input.followingText : null,
      related: Array.isArray(input.related)
        ? input.related.filter((r) => r && typeof r.text === "string").slice(0, 3)
        : [],
    },
    config.model,
  );

  const result = await callJev(payload, config);
  if (!result.ok) return reply({ ok: false, error: result.error }, 502);
  return reply({ ok: true, decision: result.decision, technical: result.technical });
}
