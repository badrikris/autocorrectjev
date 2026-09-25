/** Presentation helpers shared by the manuscript and the review panel. */
import { type FindingState, treatmentOf } from "./review";

export type Tone = "olive" | "amber" | "terra" | "neutral";

export type HighlightKind = "auto" | "kept" | "applied" | "suggest" | "manual" | "pending" | null;

export function highlightKind(f: FindingState): HighlightKind {
  if (!f.anchor) return null;
  if (f.appliedText !== undefined) {
    if (f.appliedBy === "system") return f.resolution === "kept" ? "kept" : f.resolution === "open" ? "auto" : null;
    return f.resolution === "applied" || f.resolution === "applied_edited" ? "applied" : null;
  }
  if (f.resolution !== "open") return null;
  if (f.status === "waiting" || f.status === "evaluating" || f.status === "failed" || f.status === "stale") return "pending";
  const t = treatmentOf(f);
  if (t === "SUGGEST") return "suggest";
  if (t === "MANUAL_REVIEW") return "manual";
  return null;
}

export interface StatusLabel {
  text: string;
  tone: Tone;
}

/** The small status label on a card. */
export function statusLabel(f: FindingState): StatusLabel {
  switch (f.resolution) {
    case "kept":
      return { text: "Auto-applied · kept", tone: "olive" };
    case "undone":
      return { text: "Undone", tone: "neutral" };
    case "applied":
      return { text: "Applied", tone: "olive" };
    case "applied_edited":
      return { text: "Applied · your wording", tone: "olive" };
    case "dismissed":
      return { text: "Dismissed", tone: "neutral" };
    case "reviewed":
      return { text: "Reviewed", tone: "neutral" };
    case "superseded":
      return { text: "No longer applies", tone: "neutral" };
  }
  switch (f.status) {
    case "idle":
      return { text: "Not yet reviewed", tone: "neutral" };
    case "waiting":
      return { text: "Waiting", tone: "neutral" };
    case "evaluating":
      return { text: "Evaluating", tone: "neutral" };
    case "failed":
      return { text: "Not evaluated", tone: "terra" };
    case "stale":
      return { text: "Out of date", tone: "neutral" };
  }
  switch (treatmentOf(f)) {
    case "AUTO_APPLY":
      return { text: "Auto-applied", tone: "olive" };
    case "SUGGEST":
      return { text: "Suggested", tone: "amber" };
    case "MANUAL_REVIEW":
      return { text: "Needs judgment", tone: "terra" };
    case "NO_CHANGE":
      return { text: "Not applied", tone: "neutral" };
  }
  return { text: "", tone: "neutral" };
}

export const TONE_TEXT: Record<Tone, string> = {
  olive: "text-olive-dark",
  amber: "text-amber",
  terra: "text-terra",
  neutral: "text-ink-2",
};

export const TONE_DOT: Record<Tone, string> = {
  olive: "bg-olive",
  amber: "bg-amber-line",
  terra: "bg-terra-line",
  neutral: "bg-ink-3/60",
};

/** A few words either side of an anchor, trimmed to word boundaries. */
export function contextAround(text: string, start: number, end: number, reach = 34): { before: string; after: string } {
  let b = Math.max(0, start - reach);
  if (b > 0) {
    const sp = text.indexOf(" ", b);
    b = sp !== -1 && sp < start ? sp + 1 : b;
  }
  let a = Math.min(text.length, end + reach);
  if (a < text.length) {
    const sp = text.lastIndexOf(" ", a);
    a = sp > end ? sp : a;
  }
  return {
    before: (b > 0 ? "…" : "") + text.slice(b, start),
    after: text.slice(end, a) + (a < text.length ? "…" : ""),
  };
}

export const ROUTE_LABEL = {
  AUTO_APPLY: "Automatic correction",
  SUGGEST: "Suggestion",
  MANUAL_REVIEW: "Manual review",
  NO_CHANGE: "No change",
} as const;
