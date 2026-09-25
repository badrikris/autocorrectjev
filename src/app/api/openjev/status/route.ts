import { NextResponse } from "next/server";
import { openjevConfigFromEnv } from "@/lib/openjev/client";
import type { OpenJevStatusBody } from "@/lib/openjev/types";

export const dynamic = "force-dynamic";

/** Reports whether a key is configured. Never returns the key itself. */
export function GET() {
  const config = openjevConfigFromEnv();
  const body: OpenJevStatusBody = { configured: !!config.apiKey, model: config.model };
  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
}
