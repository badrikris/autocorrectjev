import { NextResponse } from "next/server";
import { jevConfigFromEnv } from "@/lib/jev/client";
import type { JevStatusBody } from "@/lib/jev/types";

export const dynamic = "force-dynamic";

/** Reports whether a key is configured. Never returns the key itself. */
export function GET() {
  const config = jevConfigFromEnv();
  const body: JevStatusBody = { configured: !!config.apiKey, model: config.model };
  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
}
