/**
 * Protected scientific content checks.
 *
 * Evaluates what a proposed edit actually changes — not what else happens to
 * be nearby. A number elsewhere in the passage never blocks an unrelated typo fix.
 */
import { diffRegion } from "./document";
import { changedWords, editDistance, tokenize } from "./diff";
import { STYLE_PROFILE } from "./style-profile";

export type ProtectedKind =
  | "number"
  | "unit"
  | "statistic"
  | "negation"
  | "causation"
  | "claim_strength"
  | "terminology"
  | "name"
  | "quotation"
  | "citation";

export interface ProtectedHit {
  kind: ProtectedKind;
  detail: string;
}

export const PROTECTED_KIND_LABEL: Record<ProtectedKind, string> = {
  number: "numerical value",
  unit: "unit",
  statistic: "statistical expression",
  negation: "negation",
  causation: "association versus causation",
  claim_strength: "strength of a claim",
  terminology: "technical terminology",
  name: "a name",
  quotation: "a quotation",
  citation: "a citation identifier",
};

const NEGATION = new Set([
  "not", "no", "never", "none", "neither", "nor", "without", "cannot", "nothing", "nobody", "lack", "lacked", "absent",
]);

const CAUSATION = new Set([
  "associated", "association", "associations", "correlated", "correlation", "correlates", "linked", "related",
  "relationship", "cause", "causes", "caused", "causing", "causal", "causally", "drive", "drives", "drove", "driven",
  "lead", "leads", "led", "determine", "determines", "determined", "effect", "effects", "affect", "affects",
  "affected", "produce", "produces", "produced", "result", "results", "resulted", "predict", "predicts", "predicted",
]);

const CLAIM_STRENGTH = new Set([
  "suggest", "suggests", "suggested", "indicate", "indicates", "indicated", "demonstrate", "demonstrates",
  "demonstrated", "prove", "proves", "proved", "proven", "show", "shows", "showed", "shown", "confirm", "confirms",
  "confirmed", "establish", "establishes", "established", "may", "might", "could", "can", "would", "likely",
  "unlikely", "possibly", "possible", "probably", "perhaps", "clearly", "strongly", "definitely", "certainly",
  "undoubtedly", "significant", "significantly", "substantial", "substantially", "marginally", "slightly",
  "meaningfully", "robust", "robustly", "conclusive", "conclusively", "always", "all", "some", "every",
]);

// A sign only counts when it doesn't follow a digit ("211-229" is a range, not 211 and −229).
const NUMBER_WITH_UNIT =
  /(?:(?<!\d)[−\-+])?\d+(?:[.,]\d+)*(?:\s?(?:°C|°F|%|km²|km|m²|mm|cm|m|ha|K|h|min|s)(?![\p{L}]))?/gu;
const UNIT_ONLY = /(?:°C|°F|%|km²|m²)/gu;
const STATISTIC =
  /(?:\b[pPrRnNtFβχ]²?\s?[=<>≤≥]\s?[−\-]?\d+(?:\.\d+)?)|(?:\d+\s?%\s?CI\b)|\bCI\b|β/gu;
const CITATION =
  /\([A-Z][\p{L}\-]+(?:\s(?:and|&)\s[A-Z][\p{L}\-]+|\set al\.)?,?\s\d{4}[a-z]?(?:;[^)]*)?\)|\[\d+(?:[,–\-]\s?\d+)*\]/gu;
const QUOTATION = /“[^”]*”|"[^"]*"|‘[^’]*’/gu;
const STAT_CHARS = /[=<>±≤≥]/u;
const QUOTE_CHARS = /[“”"]/u;

interface Span {
  start: number;
  end: number;
  kind: ProtectedKind;
  text: string;
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function spans(text: string): Span[] {
  const out: Span[] = [];
  const collect = (re: RegExp, kind: ProtectedKind) => {
    re.lastIndex = 0;
    for (const m of text.matchAll(re)) {
      if (m.index === undefined || m[0].length === 0) continue;
      out.push({ start: m.index, end: m.index + m[0].length, kind, text: m[0] });
    }
  };
  collect(NUMBER_WITH_UNIT, "number");
  collect(UNIT_ONLY, "unit");
  collect(STATISTIC, "statistic");
  collect(CITATION, "citation");
  collect(QUOTATION, "quotation");
  for (const term of STYLE_PROFILE.protectedTerms) {
    collect(new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(term)}(?![\\p{L}\\p{N}])`, "giu"), "terminology");
  }
  for (const name of STYLE_PROFILE.protectedNames) {
    collect(new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(name)}(?![\\p{L}\\p{N}])`, "gu"), "name");
  }
  return out;
}

function intersects(regionStart: number, regionLength: number, span: Span): boolean {
  if (regionLength === 0) return span.start < regionStart && regionStart < span.end;
  return regionStart < span.end && span.start < regionStart + regionLength;
}

/** Which protected categories does replacing `original` with `replacement` touch? */
export function detectProtectedChanges(original: string, replacement: string): ProtectedHit[] {
  const hits: ProtectedHit[] = [];
  const add = (kind: ProtectedKind, detail: string) => {
    if (!hits.some((h) => h.kind === kind && h.detail === detail)) hits.push({ kind, detail });
  };
  const region = diffRegion(original, replacement);
  if (!region) return hits;

  const removedChars = original.slice(region.start, region.start + region.removedLength);
  const insertedChars = replacement.slice(region.start, region.start + region.insertedLength);

  // Defining an abbreviation at first use — "land surface temperature" → "land surface temperature (LST)" —
  // adds nothing but the initials of the words it follows. That does not alter the author's terminology.
  if (region.removedLength === 0 && region.start === original.length) {
    const abbr = /^ \(([A-Z]{2,6})\)$/.exec(insertedChars)?.[1];
    if (abbr) {
      const initials = original
        .trim()
        .split(/\s+/)
        .slice(-abbr.length)
        .map((w) => w[0]?.toUpperCase())
        .join("");
      if (initials === abbr) return hits;
    }
  }

  // Span-level checks, on both sides of the change.
  for (const s of spans(original)) {
    if (intersects(region.start, region.removedLength, s)) add(s.kind, s.text);
  }
  for (const s of spans(replacement)) {
    if (intersects(region.start, region.insertedLength, s)) add(s.kind, s.text);
  }
  // Character-level: any digit, statistical operator or quotation mark changed.
  if (/\d/u.test(removedChars) || /\d/u.test(insertedChars)) add("number", `${removedChars}→${insertedChars}`);
  if (STAT_CHARS.test(removedChars) || STAT_CHARS.test(insertedChars)) add("statistic", `${removedChars}→${insertedChars}`);
  if (QUOTE_CHARS.test(removedChars) || QUOTE_CHARS.test(insertedChars)) add("quotation", `${removedChars}→${insertedChars}`);

  // Word-level semantic checks on words actually removed or added.
  const { removed, added } = changedWords(original, replacement);
  for (const w of [...removed, ...added]) {
    const bare = w.replace(/n['’]t$/, "not");
    if (NEGATION.has(bare) || /n['’]t$/.test(w)) add("negation", w);
    if (CAUSATION.has(w)) add("causation", w);
    if (CLAIM_STRENGTH.has(w)) add("claim_strength", w);
  }
  return hits;
}

export type MechanicalShape = "whitespace" | "punctuation" | "case" | "single_word_spelling";

/** Structural shape of an edit, independent of how it was labelled. */
export function mechanicalShape(original: string, replacement: string): MechanicalShape | null {
  if (original === replacement) return null;
  const noWs = (s: string) => s.replace(/\s+/gu, "");
  if (noWs(original) === noWs(replacement)) return "whitespace";
  const lettersOnly = (s: string) => s.replace(/[^\p{L}\p{N}\s]/gu, "").replace(/\s+/gu, " ").trim();
  if (lettersOnly(original) === lettersOnly(replacement)) return "punctuation";
  if (original.toLowerCase() === replacement.toLowerCase()) return "case";
  const a = tokenize(original).filter((t) => /\S/u.test(t));
  const b = tokenize(replacement).filter((t) => /\S/u.test(t));
  if (
    a.length === 1 &&
    b.length === 1 &&
    /^\p{L}+$/u.test(a[0]) &&
    /^\p{L}+$/u.test(b[0]) &&
    editDistance(a[0].toLowerCase(), b[0].toLowerCase()) <= 2
  ) {
    return "single_word_spelling";
  }
  return null;
}
