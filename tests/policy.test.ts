import { describe, expect, it } from "vitest";
import { routeFinding, type OpenJevDecision, type Route } from "@/lib/policy";
import { detectProtectedChanges, mechanicalShape } from "@/lib/protected";

function decision(route: Route, conf: number, valid: number, meaning: number | null): OpenJevDecision {
  const rest = (1 - conf) / 3;
  const routeProbabilities = { AUTO_APPLY: rest, SUGGEST: rest, MANUAL_REVIEW: rest, NO_CHANGE: rest };
  routeProbabilities[route] = conf;
  return { route, routeConfidence: conf, routeProbabilities, findingValid: valid, meaningPreserved: meaning };
}

const typo = { category: "typo" as const, original: "teh", replacement: "the", targetValid: true };

describe("routing policy", () => {
  it("auto-applies a mechanical typo when OpenJEV is confident", () => {
    const out = routeFinding({ ...typo, decision: decision("AUTO_APPLY", 0.97, 0.99, 0.995) });
    expect(out.treatment).toBe("AUTO_APPLY");
    expect(out.adjusted).toBe(false);
  });

  it("downgrades AUTO_APPLY to SUGGEST when route confidence is below 0.95", () => {
    const out = routeFinding({ ...typo, decision: decision("AUTO_APPLY", 0.9, 0.99, 0.99) });
    expect(out.treatment).toBe("SUGGEST");
    expect(out.adjusted).toBe(true);
    expect(out.summary).toMatch(/OpenJEV proposed automatic correction/);
  });

  it("downgrades AUTO_APPLY to SUGGEST when meaning_preserved < 0.98", () => {
    const out = routeFinding({ ...typo, decision: decision("AUTO_APPLY", 0.99, 0.99, 0.96) });
    expect(out.treatment).toBe("SUGGEST");
  });

  it("never auto-applies a change outside the mechanical allowlist (grammar)", () => {
    const out = routeFinding({
      decision: decision("AUTO_APPLY", 0.999, 0.999, 0.999),
      category: "grammar",
      original: "The measurements was collected",
      replacement: "The measurements were collected",
      targetValid: true,
    });
    expect(out.treatment).toBe("SUGGEST");
    expect(out.summary).toMatch(/allowlist/);
  });

  it("rejects a mislabelled 'typo' whose structure is not a single-word spelling fix", () => {
    const out = routeFinding({
      decision: decision("AUTO_APPLY", 0.999, 0.999, 0.999),
      category: "typo",
      original: "in order to",
      replacement: "to",
      targetValid: true,
    });
    expect(out.treatment).not.toBe("AUTO_APPLY");
  });

  it("never upgrades a MANUAL_REVIEW decision", () => {
    const out = routeFinding({ ...typo, decision: decision("MANUAL_REVIEW", 0.99, 0.99, 0.99) });
    expect(out.treatment).toBe("MANUAL_REVIEW");
  });

  it("suppresses confident NO_CHANGE and sends uncertain NO_CHANGE to manual review", () => {
    expect(routeFinding({ ...typo, decision: decision("NO_CHANGE", 0.9, 0.1, 0.9) }).treatment).toBe("NO_CHANGE");
    expect(routeFinding({ ...typo, decision: decision("NO_CHANGE", 0.5, 0.4, 0.9) }).treatment).toBe("MANUAL_REVIEW");
  });

  it("requires manual review when SUGGEST thresholds are not met", () => {
    expect(routeFinding({ ...typo, decision: decision("SUGGEST", 0.65, 0.99, 0.99) }).treatment).toBe("MANUAL_REVIEW");
    expect(routeFinding({ ...typo, decision: decision("SUGGEST", 0.9, 0.7, 0.99) }).treatment).toBe("MANUAL_REVIEW");
    expect(routeFinding({ ...typo, decision: decision("SUGGEST", 0.9, 0.9, 0.9) }).treatment).toBe("MANUAL_REVIEW");
    expect(routeFinding({ ...typo, decision: decision("SUGGEST", 0.9, 0.9, 0.99) }).treatment).toBe("SUGGEST");
  });

  it("requires manual review when there is no replacement", () => {
    const out = routeFinding({ decision: decision("SUGGEST", 0.9, 0.9, null), category: "ambiguity", original: "it", replacement: null, targetValid: true });
    expect(out.treatment).toBe("MANUAL_REVIEW");
  });

  it("requires manual review when the exact target is no longer valid", () => {
    const out = routeFinding({ ...typo, targetValid: false, decision: decision("AUTO_APPLY", 0.99, 0.99, 0.99) });
    expect(out.treatment).toBe("MANUAL_REVIEW");
  });
});

describe("protected-change vetoes", () => {
  const maxAuto = decision("AUTO_APPLY", 1, 1, 1);

  it("association → causation can never auto-apply, even at maximum confidence", () => {
    const out = routeFinding({
      decision: maxAuto,
      category: "style_normalisation",
      original: "was associated with",
      replacement: "caused",
      targetValid: true,
    });
    expect(out.treatment).toBe("MANUAL_REVIEW");
    expect(out.protectedHits.map((h) => h.kind)).toContain("causation");
    expect(out.summary).toMatch(/association versus causation/);
  });

  it("a changed numerical result is manual review, never auto or suggest", () => {
    for (const route of ["AUTO_APPLY", "SUGGEST"] as const) {
      const out = routeFinding({ decision: decision(route, 1, 1, 1), category: "typo", original: "1.8 °C", replacement: "1.6 °C", targetValid: true });
      expect(out.treatment).toBe("MANUAL_REVIEW");
    }
    expect(detectProtectedChanges("1.8 °C", "1.6 °C").map((h) => h.kind)).toContain("number");
  });

  it("flags units, statistics, negation, claim strength, terminology, names, citations, quotations", () => {
    const kinds = (a: string, b: string) => detectProtectedChanges(a, b).map((h) => h.kind);
    expect(kinds("27.4 °C", "27.4 K")).toContain("number");
    expect(kinds("p < 0.001", "p = 0.001")).toContain("statistic");
    expect(kinds("was not significant", "was significant")).toContain("negation");
    expect(kinds("These results suggest", "These results demonstrate")).toContain("claim_strength");
    expect(kinds("significantly cooler", "substantially cooler")).toContain("claim_strength");
    expect(kinds("canopy cover and LST", "tree coverage and LST")).toContain("terminology");
    expect(kinds("in Easthollow", "in Eastholow")).toContain("name");
    expect(kinds("(Lindell, 2021)", "(Lindell, 2012)")).toEqual(expect.arrayContaining(["citation", "number"]));
    expect(kinds("“cool islands”", "“cool zones”")).toContain("quotation");
  });

  it("a number next to the edit does not block an unrelated punctuation fix", () => {
    expect(detectProtectedChanges("Landsat 9,,", "Landsat 9,")).toEqual([]);
    expect(mechanicalShape("Landsat 9,,", "Landsat 9,")).toBe("punctuation");
    const out = routeFinding({ decision: decision("AUTO_APPLY", 0.99, 0.99, 0.999), category: "punctuation", original: "Landsat 9,,", replacement: "Landsat 9,", targetValid: true });
    expect(out.treatment).toBe("AUTO_APPLY");
  });

  it("a page-range hyphen → en dash is punctuation, not a change to a number", () => {
    expect(detectProtectedChanges("211-229", "211–229")).toEqual([]);
    expect(mechanicalShape("211-229", "211–229")).toBe("punctuation");
    expect(detectProtectedChanges("−0.27", "0.27").map((h) => h.kind)).toContain("number");
  });

  it("defining an abbreviation at first use does not count as altering terminology", () => {
    expect(detectProtectedChanges("summer land surface temperature", "summer land surface temperature (LST)")).toEqual([]);
    // …but an abbreviation that doesn't match the words it follows is not exempt.
    expect(detectProtectedChanges("summer surface heat", "summer surface heat (LST)").map((h) => h.kind)).toContain("terminology");
  });

  it("ordinary typo fixes, spacing and heading case are unprotected", () => {
    expect(detectProtectedChanges("teh", "the")).toEqual([]);
    expect(detectProtectedChanges("surfaces  absorb", "surfaces absorb")).toEqual([]);
    expect(detectProtectedChanges("Study Area", "Study area")).toEqual([]);
    expect(mechanicalShape("surfaces  absorb", "surfaces absorb")).toBe("whitespace");
    expect(mechanicalShape("Study Area", "Study area")).toBe("case");
    expect(mechanicalShape("neighborhood", "neighbourhood")).toBe("single_word_spelling");
  });
});
