/**
 * Routing policy.
 *
 * OpenJEV provides the judgment; this function provides conservative safety
 * boundaries around it. Thresholds are illustrative prototype values, NOT
 * validated production thresholds.
 */
import type { CandidateCategory } from "./candidates";
import { detectProtectedChanges, mechanicalShape, PROTECTED_KIND_LABEL, type MechanicalShape, type ProtectedHit } from "./protected";

export const ROUTES = ["AUTO_APPLY", "SUGGEST", "MANUAL_REVIEW", "NO_CHANGE"] as const;
export type Route = (typeof ROUTES)[number];

export interface OpenJevDecision {
  route: Route;
  /** Choice confidence reported by OpenJEV for the selected route. */
  routeConfidence: number;
  /** Per-label probabilities reported by OpenJEV. */
  routeProbabilities: Record<Route, number>;
  /** Noul: probability the finding is legitimate. */
  findingValid: number;
  /** Noul: probability the replacement preserves meaning; null when not asked. */
  meaningPreserved: number | null;
}

export const THRESHOLDS = {
  auto: { routeConfidence: 0.95, findingValid: 0.95, meaningPreserved: 0.98 },
  suggest: { routeConfidence: 0.7, findingValid: 0.8, meaningPreserved: 0.95 },
  noChange: { routeConfidence: 0.7 },
} as const;

/** Categories that may ever auto-apply, and the structural shape each must have. */
export const MECHANICAL_ALLOWLIST: Partial<Record<CandidateCategory, MechanicalShape[]>> = {
  typo: ["single_word_spelling"],
  whitespace: ["whitespace"],
  punctuation: ["punctuation"],
  style_normalisation: ["case", "single_word_spelling"],
};

export interface PolicyInput {
  decision: OpenJevDecision;
  category: CandidateCategory;
  original: string;
  replacement: string | null;
  /** The exact original text is still present at the anchor. */
  targetValid: boolean;
  /** Who made the decision, for explanations. Sample fixtures must never be called "OpenJEV". */
  decider?: string;
}

export interface PolicyCheck {
  id: string;
  /** Which treatment this requirement belongs to. */
  group: "auto" | "suggest" | "suppress";
  label: string;
  passed: boolean;
}

export interface PolicyOutcome {
  treatment: Route;
  openjevRoute: Route;
  /** True when the application's safety rules changed OpenJEV's proposed route. */
  adjusted: boolean;
  checks: PolicyCheck[];
  protectedHits: ProtectedHit[];
  /** Application-authored explanation (never attributed to OpenJEV). */
  summary: string;
}

const ROUTE_PHRASE: Record<Route, string> = {
  AUTO_APPLY: "automatic correction",
  SUGGEST: "a suggestion for editor approval",
  MANUAL_REVIEW: "manual review",
  NO_CHANGE: "no change",
};

const f2 = (n: number | null) => (n === null ? "—" : n.toFixed(2));

export function routeFinding(input: PolicyInput): PolicyOutcome {
  const { decision: d, replacement } = input;
  const who = input.decider ?? "OpenJEV";
  const protectedHits = replacement === null ? [] : detectProtectedChanges(input.original, replacement);
  const shape = replacement === null ? null : mechanicalShape(input.original, replacement);
  const allowlisted = !!shape && !!MECHANICAL_ALLOWLIST[input.category]?.includes(shape);
  const hasTarget = input.targetValid && replacement !== null;
  const noProtected = protectedHits.length === 0;
  const protectedPhrase = protectedHits.map((h) => PROTECTED_KIND_LABEL[h.kind]).filter((v, i, a) => a.indexOf(v) === i).join(", ");

  const outcome = (treatment: Route, checks: PolicyCheck[], summary: string): PolicyOutcome => ({
    treatment,
    openjevRoute: d.route,
    adjusted: treatment !== d.route,
    checks,
    protectedHits,
    summary,
  });

  if (d.route === "NO_CHANGE") {
    const confident = d.routeConfidence >= THRESHOLDS.noChange.routeConfidence;
    const checks: PolicyCheck[] = [{ id: "nochange-conf", group: "suppress", label: `Route confidence ≥ ${THRESHOLDS.noChange.routeConfidence.toFixed(2)} to suppress`, passed: confident }];
    return confident
      ? outcome("NO_CHANGE", checks, `${who} judged the proposed edit unnecessary or unsupported, so it is suppressed from normal review.`)
      : outcome("MANUAL_REVIEW", checks, `${who} leaned towards no change, but with confidence ${f2(d.routeConfidence)}, so the prototype asks for editorial judgment instead of suppressing it.`);
  }

  if (d.route === "MANUAL_REVIEW") {
    return outcome("MANUAL_REVIEW", [], `${who} routed this to manual review. The prototype never upgrades a manual-review decision.`);
  }

  const autoChecks: PolicyCheck[] = [
    { id: "auto-route", group: "auto", label: "Proposed route is AUTO_APPLY", passed: d.route === "AUTO_APPLY" },
    { id: "auto-conf", group: "auto", label: `Route confidence ≥ ${THRESHOLDS.auto.routeConfidence}`, passed: d.routeConfidence >= THRESHOLDS.auto.routeConfidence },
    { id: "auto-valid", group: "auto", label: `Finding valid ≥ ${THRESHOLDS.auto.findingValid}`, passed: d.findingValid >= THRESHOLDS.auto.findingValid },
    { id: "auto-meaning", group: "auto", label: `Meaning preserved ≥ ${THRESHOLDS.auto.meaningPreserved}`, passed: d.meaningPreserved !== null && d.meaningPreserved >= THRESHOLDS.auto.meaningPreserved },
    { id: "target", group: "auto", label: "Exact replacement target verified", passed: hasTarget },
    { id: "allowlist", group: "auto", label: "Change is on the mechanical allowlist", passed: allowlisted },
    { id: "protected", group: "auto", label: "No protected scientific content changed", passed: noProtected },
  ];
  if (autoChecks.every((c) => c.passed)) {
    return outcome("AUTO_APPLY", autoChecks, `${who} proposed automatic correction with high routing confidence. This correction is mechanical and does not alter protected scientific content.`);
  }

  const suggestChecks: PolicyCheck[] = [
    { group: "suggest", id: "sug-route", label: "Proposed route is SUGGEST or AUTO_APPLY", passed: true },
    { group: "suggest", id: "sug-conf", label: `Route confidence ≥ ${THRESHOLDS.suggest.routeConfidence}`, passed: d.routeConfidence >= THRESHOLDS.suggest.routeConfidence },
    { group: "suggest", id: "sug-valid", label: `Finding valid ≥ ${THRESHOLDS.suggest.findingValid}`, passed: d.findingValid >= THRESHOLDS.suggest.findingValid },
    { group: "suggest", id: "sug-meaning", label: `Meaning preserved ≥ ${THRESHOLDS.suggest.meaningPreserved}`, passed: d.meaningPreserved !== null && d.meaningPreserved >= THRESHOLDS.suggest.meaningPreserved },
    { group: "suggest", id: "target", label: "Exact replacement target verified", passed: hasTarget },
    { group: "suggest", id: "protected", label: "No protected scientific content changed", passed: noProtected },
  ];
  const proposed = ROUTE_PHRASE[d.route];

  if (suggestChecks.every((c) => c.passed)) {
    if (d.route === "SUGGEST") {
      return outcome("SUGGEST", suggestChecks, `${who} proposed this as a suggestion for editor approval.`);
    }
    const why = autoFailureReason(autoChecks, d, allowlisted, input.category);
    return outcome("SUGGEST", [...autoChecks, ...suggestChecks.filter((c) => c.id !== "target" && c.id !== "protected")], `${who} proposed automatic correction. Because ${why}, the prototype asks for editor approval.`);
  }

  // Falls through to manual review.
  const checks = d.route === "AUTO_APPLY" ? [...autoChecks, ...suggestChecks.filter((c) => !["target", "protected"].includes(c.id))] : suggestChecks;
  if (replacement === null) {
    return outcome("MANUAL_REVIEW", checks, `${who} proposed ${proposed}, but there is no replacement text to apply, so this needs the editor's judgment.`);
  }
  if (!noProtected) {
    return outcome("MANUAL_REVIEW", checks, `${who} proposed ${proposed}. Because the proposed change affects ${protectedPhrase}, the prototype requires editorial review.`);
  }
  if (!input.targetValid) {
    return outcome("MANUAL_REVIEW", checks, `${who} proposed ${proposed}, but the original text is no longer at the expected place, so the prototype requires editorial review.`);
  }
  const failed = suggestChecks.find((c) => !c.passed);
  return outcome("MANUAL_REVIEW", checks, `${who} proposed ${proposed}, but ${describeFailure(failed?.id, d)}, so the prototype requires editorial review.`);
}

function autoFailureReason(checks: PolicyCheck[], d: OpenJevDecision, allowlisted: boolean, category: CandidateCategory): string {
  if (!allowlisted) return `a ${category.replace(/_/g, " ")} change is not on the narrow mechanical allowlist`;
  const failed = checks.find((c) => !c.passed);
  return describeFailure(failed?.id, d);
}

function describeFailure(id: string | undefined, d: OpenJevDecision): string {
  switch (id) {
    case "auto-conf":
      return `routing confidence (${f2(d.routeConfidence)}) is below the ${THRESHOLDS.auto.routeConfidence} auto-apply threshold`;
    case "auto-valid":
      return `the finding-validity estimate (${f2(d.findingValid)}) is below ${THRESHOLDS.auto.findingValid}`;
    case "auto-meaning":
      return `the meaning-preservation estimate (${f2(d.meaningPreserved)}) is below ${THRESHOLDS.auto.meaningPreserved}`;
    case "sug-conf":
      return `routing confidence (${f2(d.routeConfidence)}) is below ${THRESHOLDS.suggest.routeConfidence}`;
    case "sug-valid":
      return `the finding-validity estimate (${f2(d.findingValid)}) is below ${THRESHOLDS.suggest.findingValid}`;
    case "sug-meaning":
      return `the meaning-preservation estimate (${f2(d.meaningPreserved)}) is below ${THRESHOLDS.suggest.meaningPreserved}`;
    default:
      return "a safety check did not pass";
  }
}
