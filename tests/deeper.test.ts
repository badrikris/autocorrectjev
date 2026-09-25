import { describe, expect, it } from "vitest";
import { buildJats, jatsToString } from "@/lib/jats";
import type { OpenJevDecision, Route } from "@/lib/policy";
import { createReviewState, reviewReducer, type ReviewAction, type ReviewState } from "@/lib/review";

function decision(route: Route, conf = 0.99, valid = 0.99, meaning: number | null = 0.999): OpenJevDecision {
  const rest = (1 - conf) / 3;
  const p = { AUTO_APPLY: rest, SUGGEST: rest, MANUAL_REVIEW: rest, NO_CHANGE: rest };
  p[route] = conf;
  return { route, routeConfidence: conf, routeProbabilities: p, findingValid: valid, meaningPreserved: meaning };
}
const run = (s: ReviewState, ...a: ReviewAction[]) => a.reduce(reviewReducer, s);
function evaluate(s: ReviewState, id: string, d: OpenJevDecision): ReviewState {
  s = run(s, { type: "queue", ids: [id] }, { type: "evalStart", id });
  const f = s.findings[id];
  return run(s, { type: "evalSuccess", id, attempt: f.attempt, epoch: s.doc.blocks[f.anchor!.blockId].editEpoch, decision: d, source: "live" });
}

/** Minimal well-formedness check: every opened element is closed in order. */
function balanced(xml: string): boolean {
  const stack: string[] = [];
  for (const m of xml.matchAll(/<(\/?)([A-Za-z][\w:.-]*)[^>]*?(\/?)>/g)) {
    const [, close, name, self] = m;
    if (self) continue;
    if (close) {
      if (stack.pop() !== name) return false;
    } else stack.push(name);
  }
  return stack.length === 0;
}

describe("figures", () => {
  it("a palette suggestion re-renders the figure spec, and undo restores it", () => {
    let s = evaluate(createReviewState(), "g01", decision("SUGGEST", 0.9, 0.9, 0.97));
    expect(s.findings.g01.outcome?.treatment).toBe("SUGGEST");
    s = run(s, { type: "apply", id: "g01" });
    expect(s.figures.fig1.palette).toBe("olive-sequential");
    s = run(s, { type: "undo", id: "g01" });
    expect(s.figures.fig1.palette).toBe("red-green");
  });

  it("figure changes are never auto-applied, even at maximum confidence", () => {
    const s = evaluate(createReviewState(), "g04", decision("AUTO_APPLY", 1, 1, 1));
    expect(s.findings.g04.outcome?.treatment).toBe("SUGGEST");
    expect(s.figures.fig2.tickFontPt).toBe(5.5);
  });

  it("an axis unit change is protected content and needs judgment", () => {
    const s = evaluate(createReviewState(), "g03", decision("SUGGEST", 0.95, 0.95, 0.99));
    expect(s.findings.g03.outcome?.treatment).toBe("MANUAL_REVIEW");
    expect(s.findings.g03.outcome?.protectedHits.map((h) => h.kind)).toContain("unit");
    expect(s.figures.fig2.yAxisLabel).toBe("Surface temperature (°F)");
  });

  it("the editor can apply a judgment item's figure fix as their own decision", () => {
    let s = evaluate(createReviewState(), "g03", decision("MANUAL_REVIEW", 0.9, 0.9, 0.7));
    s = run(s, { type: "apply", id: "g03" });
    expect(s.figures.fig2.yAxisLabel).toBe("Surface temperature (°C)");
    expect(s.findings.g03.appliedBy).toBe("editor");
  });

  it("edited alt text is stored as the editor's wording", () => {
    let s = evaluate(createReviewState(), "g05", decision("SUGGEST", 0.9, 0.9, 0.96));
    s = run(s, { type: "apply", id: "g05", text: "Scatter plot: temperature against canopy cover." });
    expect(s.figures.fig2.altText).toBe("Scatter plot: temperature against canopy cover.");
    expect(s.findings.g05.resolution).toBe("applied_edited");
    s = run(s, { type: "undo", id: "g05" });
    expect(s.figures.fig2.altText).toBeNull();
  });

  it("editing a caption does not disturb findings about the graphic", () => {
    let s = evaluate(createReviewState(), "g01", decision("SUGGEST", 0.9, 0.9, 0.97));
    const b = s.doc.blocks["fig-1"];
    s = run(s, { type: "editBlock", blockId: "fig-1", text: b.text.replace("Tree canopy", "Canopy"), expectedRevision: b.revision });
    expect(s.findings.g01.status).toBe("evaluated");
  });
});

describe("structure (JATS XML)", () => {
  it("an exact, existing citation link can auto-apply and appears as <xref> in the XML", () => {
    let s = evaluate(createReviewState(), "x01", decision("AUTO_APPLY"));
    expect(s.findings.x01.outcome?.treatment).toBe("AUTO_APPLY");
    const xml = jatsToString(buildJats(s));
    expect(xml).toContain('<xref ref-type="bibr" rid="r1">(Marsh and Idowu, 2017)</xref>');
    // The manuscript text itself is unchanged by tagging.
    expect(s.doc.blocks["intro-1"].text).toContain("(Marsh and Idowu, 2017).");
    s = run(s, { type: "undo", id: "x01" });
    expect(jatsToString(buildJats(s))).not.toContain('rid="r1"');
  });

  it("a citation to a figure that doesn't exist can never be linked automatically", () => {
    const s = evaluate(createReviewState(), "x04", decision("AUTO_APPLY", 1, 1, null));
    expect(s.findings.x04.outcome?.treatment).toBe("MANUAL_REVIEW");
    expect(jatsToString(buildJats(s))).not.toContain("Figure 3</xref>");
  });

  it("generates well-formed JATS with body sections, figures and a reference list", () => {
    let s = createReviewState();
    for (const id of ["x01", "x02", "x03"]) s = evaluate(s, id, decision("AUTO_APPLY"));
    const xml = jatsToString(buildJats(s));
    expect(balanced(xml)).toBe(true);
    for (const needle of ["<abstract>", '<sec id="sec-methods">', '<fig id="fig1"', '<ref id="r3">', "</ref-list>", "p &lt; 0.001"]) {
      expect(xml).toContain(needle);
    }
    expect(xml).toContain("<!-- alt-text missing -->");
  });
});

describe("deeper copyediting", () => {
  it("the en dash in a page range is mechanical and auto-applies", () => {
    const s = evaluate(createReviewState(), "f28", decision("AUTO_APPLY", 0.97, 0.97, 0.999));
    expect(s.findings.f28.outcome?.treatment).toBe("AUTO_APPLY");
    expect(s.doc.blocks["ref-1"].text).toContain("pp. 211–229");
  });

  it("a citation-year mismatch touches a citation and a number, so it needs judgment", () => {
    const s = evaluate(createReviewState(), "f27", decision("SUGGEST", 0.95, 0.95, 0.99));
    expect(s.findings.f27.outcome?.treatment).toBe("MANUAL_REVIEW");
  });

  it("tense and dangling-modifier fixes are suggestions, not automatic", () => {
    for (const id of ["f25", "f26"]) {
      const s = evaluate(createReviewState(), id, decision("AUTO_APPLY", 0.99, 0.99, 0.99));
      expect(s.findings[id].outcome?.treatment, id).toBe("SUGGEST");
    }
  });
});
