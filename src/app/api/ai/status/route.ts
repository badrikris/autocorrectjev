import { NextResponse } from "next/server";
import { aiConfigFromEnv } from "@/lib/ai/openai";
import { TASK_ROUTES } from "@/lib/ai/tasks";

export const dynamic = "force-dynamic";

/** Whether generation is available, and which model each task would start on. Never returns the key. */
export function GET() {
  const c = aiConfigFromEnv();
  return NextResponse.json(
    {
      configured: !!c.apiKey,
      models: c.models,
      maxRequestsPerHour: c.maxRequestsPerHour,
      routes: Object.fromEntries(Object.entries(TASK_ROUTES).map(([k, r]) => [k, { tier: r.tier, model: c.models[r.tier], escalateTo: r.escalateTo, rationale: r.rationale }])),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
