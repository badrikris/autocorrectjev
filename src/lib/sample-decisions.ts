/**
 * SAMPLE decisions for preview mode only (no API key).
 *
 * These are hand-written, deterministic fixture values. They are NOT OpenJEV
 * output and must always be presented as sample data. They pass through the
 * same routing policy as live decisions so the review experience is identical.
 */
import type { OpenJevDecision, Route } from "./policy";

function d(route: Route, probs: [number, number, number, number], findingValid: number, meaningPreserved: number | null): OpenJevDecision {
  const [a, s, m, n] = probs;
  const routeProbabilities = { AUTO_APPLY: a, SUGGEST: s, MANUAL_REVIEW: m, NO_CHANGE: n };
  return { route, routeConfidence: routeProbabilities[route], routeProbabilities, findingValid, meaningPreserved };
}

export const SAMPLE_DECISIONS: Record<string, OpenJevDecision> = {
  f01: d("AUTO_APPLY", [0.98, 0.015, 0.003, 0.002], 0.99, 0.995),
  f02: d("MANUAL_REVIEW", [0.01, 0.04, 0.84, 0.11], 0.31, 0.04),
  f03: d("AUTO_APPLY", [0.99, 0.008, 0.001, 0.001], 0.99, 0.999),
  f04: d("NO_CHANGE", [0.01, 0.1, 0.01, 0.88], 0.09, 0.93),
  f05: d("AUTO_APPLY", [0.96, 0.03, 0.005, 0.005], 0.97, 0.995),
  f06: d("MANUAL_REVIEW", [0.01, 0.17, 0.78, 0.04], 0.86, 0.71),
  f07: d("AUTO_APPLY", [0.93, 0.06, 0.005, 0.005], 0.97, 0.99),
  f08: d("AUTO_APPLY", [0.97, 0.02, 0.005, 0.005], 0.96, 0.999),
  f09: d("AUTO_APPLY", [0.98, 0.015, 0.003, 0.002], 0.99, 0.999),
  f10: d("AUTO_APPLY", [0.96, 0.035, 0.003, 0.002], 0.99, 0.99),
  f11: d("SUGGEST", [0.04, 0.86, 0.02, 0.08], 0.82, 0.98),
  f12: d("NO_CHANGE", [0.01, 0.06, 0.02, 0.91], 0.12, 0.9),
  f13: d("MANUAL_REVIEW", [0.0, 0.03, 0.9, 0.07], 0.72, 0.12),
  f14: d("AUTO_APPLY", [0.99, 0.007, 0.002, 0.001], 0.99, 0.998),
  f15: d("MANUAL_REVIEW", [0.01, 0.2, 0.74, 0.05], 0.81, 0.55),
  f16: d("SUGGEST", [0.07, 0.88, 0.02, 0.03], 0.9, 0.97),
  f17: d("NO_CHANGE", [0.0, 0.03, 0.03, 0.94], 0.04, 0.88),
  f18: d("NO_CHANGE", [0.0, 0.06, 0.13, 0.81], 0.14, 0.35),
  f19: d("SUGGEST", [0.02, 0.72, 0.19, 0.07], 0.41, 0.3),
  f20: d("MANUAL_REVIEW", [0.0, 0.07, 0.88, 0.05], 0.83, null),
  f21: d("AUTO_APPLY", [0.97, 0.025, 0.003, 0.002], 0.99, 0.995),
  f22: d("NO_CHANGE", [0.0, 0.03, 0.02, 0.95], 0.03, 0.62),
  // Deeper copyediting
  f23: d("SUGGEST", [0.05, 0.86, 0.06, 0.03], 0.9, 0.97),
  f24: d("SUGGEST", [0.12, 0.82, 0.03, 0.03], 0.92, 0.99),
  f25: d("SUGGEST", [0.03, 0.8, 0.14, 0.03], 0.88, 0.96),
  f26: d("AUTO_APPLY", [0.9, 0.08, 0.01, 0.01], 0.95, 0.97),
  f27: d("MANUAL_REVIEW", [0.0, 0.08, 0.86, 0.06], 0.9, 0.4),
  f28: d("AUTO_APPLY", [0.97, 0.02, 0.005, 0.005], 0.97, 0.999),
  f29: d("MANUAL_REVIEW", [0.0, 0.05, 0.88, 0.07], 0.85, 0.2),
  // Structure
  x01: d("AUTO_APPLY", [0.97, 0.02, 0.005, 0.005], 0.97, 0.99),
  x02: d("AUTO_APPLY", [0.96, 0.03, 0.005, 0.005], 0.96, 0.99),
  x03: d("AUTO_APPLY", [0.96, 0.03, 0.005, 0.005], 0.96, 0.99),
  x04: d("MANUAL_REVIEW", [0.0, 0.03, 0.9, 0.07], 0.92, null),
  x05: d("MANUAL_REVIEW", [0.0, 0.05, 0.85, 0.1], 0.9, null),
  // Figures
  g01: d("SUGGEST", [0.06, 0.84, 0.07, 0.03], 0.9, 0.96),
  g02: d("MANUAL_REVIEW", [0.0, 0.04, 0.9, 0.06], 0.93, null),
  g03: d("SUGGEST", [0.05, 0.78, 0.15, 0.02], 0.88, 0.7),
  g04: d("SUGGEST", [0.08, 0.85, 0.04, 0.03], 0.9, 0.99),
  g05: d("SUGGEST", [0.02, 0.8, 0.15, 0.03], 0.9, 0.95),
};
