import { describe, expect, it } from "vitest";
import { CANDIDATES } from "@/lib/candidates";
import { applyExactEdit, createDoc, findOccurrence, mapAnchor } from "@/lib/document";
import type { JevDecision, Route } from "@/lib/policy";
import { createReviewState, reviewReducer, summarise, type ReviewAction, type ReviewState } from "@/lib/review";
import { SAMPLE_DECISIONS } from "@/lib/sample-decisions";

function decision(route: Route, conf = 0.99, valid = 0.99, meaning: number | null = 0.999): JevDecision {
  const rest = (1 - conf) / 3;
  const p = { AUTO_APPLY: rest, SUGGEST: rest, MANUAL_REVIEW: rest, NO_CHANGE: rest };
  p[route] = conf;
  return { route, routeConfidence: conf, routeProbabilities: p, findingValid: valid, meaningPreserved: meaning };
}

const run = (s: ReviewState, ...actions: ReviewAction[]) => actions.reduce(reviewReducer, s);

/** Start + succeed one evaluation, as the evaluation queue does. */
function evaluate(s: ReviewState, id: string, d: JevDecision): ReviewState {
  s = run(s, { type: "queue", ids: [id] }, { type: "evalStart", id });
  const f = s.findings[id];
  const epoch = s.doc.blocks[f.anchor!.blockId].editEpoch;
  return run(s, { type: "evalSuccess", id, attempt: f.attempt, epoch, decision: d, source: "live" });
}

const text = (s: ReviewState, blockId: string) => s.doc.blocks[blockId].text;

describe("prepared data", () => {
  it("every candidate anchors to its block and has a sample decision", () => {
    const doc = createDoc();
    for (const c of CANDIDATES) {
      expect(findOccurrence(doc.blocks[c.blockId].text, c.original, c.occurrence), c.id).toBeGreaterThanOrEqual(0);
      expect(SAMPLE_DECISIONS[c.id], c.id).toBeDefined();
    }
    expect(CANDIDATES.length).toBeGreaterThanOrEqual(18);
    expect(CANDIDATES.length).toBeLessThanOrEqual(22);
  });
});

describe("exact edit application", () => {
  it("refuses to edit when the source text does not match", () => {
    const doc = createDoc();
    const r = applyExactEdit(doc, { anchor: { blockId: "abs-1", start: 0, end: 3 }, expected: "teh", replacement: "the" });
    expect(r.ok).toBe(false);
  });

  it("refuses to edit an out-of-date block revision", () => {
    const doc = createDoc();
    const start = doc.blocks["abs-1"].text.indexOf("teh");
    const r = applyExactEdit(doc, { anchor: { blockId: "abs-1", start, end: start + 3 }, expected: "teh", replacement: "the", expectedBlockRevision: 7 });
    expect(r).toEqual({ ok: false, reason: "stale_revision" });
  });

  it("maps anchors across an earlier change and drops overlapping ones", () => {
    const change = { blockId: "b", start: 10, removedLength: 3, insertedLength: 5 };
    expect(mapAnchor({ blockId: "b", start: 0, end: 10 }, change)).toEqual({ blockId: "b", start: 0, end: 10 });
    expect(mapAnchor({ blockId: "b", start: 13, end: 20 }, change)).toEqual({ blockId: "b", start: 15, end: 22 });
    expect(mapAnchor({ blockId: "b", start: 11, end: 20 }, change)).toBeNull();
    expect(mapAnchor({ blockId: "other", start: 11, end: 20 }, change)).toEqual({ blockId: "other", start: 11, end: 20 });
  });

  it("applies a suggestion to exactly its own occurrence when the text repeats elsewhere", () => {
    let s = createReviewState();
    s.mode = "live";
    // "in order to" appears in meth-3 (f11) and in disc-3 (not a candidate).
    const discBefore = text(s, "disc-3");
    s = evaluate(s, "f11", decision("SUGGEST", 0.9, 0.9, 0.99));
    expect(s.findings.f11.outcome?.treatment).toBe("SUGGEST");
    s = run(s, { type: "apply", id: "f11" });
    expect(text(s, "meth-3")).toContain("as covariates to separate");
    expect(text(s, "meth-3")).not.toContain("in order to");
    expect(text(s, "disc-3")).toBe(discBefore);
    expect(text(s, "disc-3")).toContain("in order to");
  });

  it("targets the second occurrence within the same paragraph", () => {
    let s = createReviewState();
    const before = text(s, "res-3");
    s = evaluate(s, "f18", decision("SUGGEST", 0.9, 0.9, 0.99));
    // Terminology change is protected → manual, never applied.
    expect(s.findings.f18.outcome?.treatment).toBe("MANUAL_REVIEW");
    expect(text(s, "res-3")).toBe(before);
    const first = before.indexOf("canopy cover");
    expect(s.findings.f18.anchor!.start).toBeGreaterThan(first);
  });

  it("editor-modified suggestion is recorded as a human-authored edit", () => {
    let s = evaluate(createReviewState(), "f16", decision("SUGGEST", 0.9, 0.9, 0.99));
    s = run(s, { type: "apply", id: "f16", text: "several of the warmest blocks" });
    expect(text(s, "res-2")).toContain("and several of the warmest blocks");
    expect(s.findings.f16.resolution).toBe("applied_edited");
    expect(s.findings.f16.appliedBy).toBe("editor");
  });
});

describe("auto-apply and undo", () => {
  it("auto-applies an eligible correction and undo restores exactly the original", () => {
    let s = createReviewState();
    const original = text(s, "abs-1");
    s = evaluate(s, "f01", decision("AUTO_APPLY", 0.98, 0.99, 0.995));
    expect(s.findings.f01.outcome?.treatment).toBe("AUTO_APPLY");
    expect(text(s, "abs-1")).toContain("estimated from the thermal bands");
    s = run(s, { type: "undo", id: "f01" });
    expect(text(s, "abs-1")).toBe(original);
    expect(s.findings.f01.resolution).toBe("undone");
  });

  it("a meaning-sensitive edit is never auto-applied, even if Jev says AUTO_APPLY", () => {
    let s = createReviewState();
    const original = text(s, "abs-1");
    s = evaluate(s, "f02", decision("AUTO_APPLY", 1, 1, 1));
    expect(s.findings.f02.outcome?.treatment).toBe("MANUAL_REVIEW");
    expect(text(s, "abs-1")).toBe(original);
  });

  it("undoing one correction does not undo an unrelated correction in the same paragraph", () => {
    let s = createReviewState();
    // res-2 has f13 (1.8 °C), f14 (recieved), f15, f16.
    s = evaluate(s, "f14", decision("AUTO_APPLY"));
    s = evaluate(s, "f16", decision("SUGGEST", 0.9, 0.9, 0.99));
    s = run(s, { type: "apply", id: "f16" });
    expect(text(s, "res-2")).toContain("Sites that received afternoon shade");
    expect(text(s, "res-2")).toContain("and many of the warmest");
    s = run(s, { type: "undo", id: "f14" });
    expect(text(s, "res-2")).toContain("Sites that recieved afternoon shade");
    expect(text(s, "res-2")).toContain("and many of the warmest");
    s = run(s, { type: "undo", id: "f16" });
    expect(text(s, "res-2")).toBe(createDoc().blocks["res-2"].text);
  });

  it("keeps anchors correct after an earlier length-changing edit in the same block", () => {
    let s = createReviewState();
    // f09 (",," → ",") shortens meth-2 before f10.
    s = evaluate(s, "f09", decision("AUTO_APPLY"));
    expect(text(s, "meth-2")).toContain("Landsat 9, acquired");
    s = evaluate(s, "f10", decision("SUGGEST", 0.9, 0.95, 0.99));
    s = run(s, { type: "apply", id: "f10" });
    expect(text(s, "meth-2")).toContain("The measurements were collected");
  });
});

describe("stale result handling", () => {
  it("a Jev response that arrives after a manual edit is discarded, never applied", () => {
    let s = createReviewState();
    s = run(s, { type: "queue", ids: ["f01"] }, { type: "evalStart", id: "f01" });
    const { attempt } = s.findings.f01;
    const epoch = s.doc.blocks["abs-1"].editEpoch;
    // Editor rewrites the paragraph (elsewhere) while the request is in flight.
    const edited = text(s, "abs-1").replace("Urban heat is", "Urban heat remains");
    s = run(s, { type: "editBlock", blockId: "abs-1", text: edited, expectedRevision: s.doc.blocks["abs-1"].revision });
    s = run(s, { type: "evalSuccess", id: "f01", attempt, epoch, decision: decision("AUTO_APPLY"), source: "live" });
    expect(s.findings.f01.status).toBe("stale");
    expect(text(s, "abs-1")).toBe(edited);
    expect(text(s, "abs-1")).toContain("teh");
  });

  it("an older response for a re-requested finding is ignored", () => {
    let s = createReviewState();
    s = run(s, { type: "queue", ids: ["f01"] }, { type: "evalStart", id: "f01" });
    const first = s.findings.f01.attempt;
    s = run(s, { type: "evalFailure", id: "f01", attempt: first, epoch: 0, error: { kind: "timeout", message: "t" } });
    s = run(s, { type: "queue", ids: ["f01"] }, { type: "evalStart", id: "f01" });
    s = run(s, { type: "evalSuccess", id: "f01", attempt: first, epoch: 0, decision: decision("AUTO_APPLY"), source: "live" });
    expect(s.findings.f01.status).toBe("evaluating");
    expect(text(s, "abs-1")).toContain("teh");
  });

  it("manual edits invalidate open decisions in that paragraph but keep applied edits reversible", () => {
    let s = createReviewState();
    s = evaluate(s, "f14", decision("AUTO_APPLY"));
    s = evaluate(s, "f16", decision("SUGGEST", 0.9, 0.9, 0.99));
    const t = text(s, "res-2");
    s = run(s, { type: "editBlock", blockId: "res-2", text: t.replace("comparable unshaded sites", "similar unshaded sites"), expectedRevision: s.doc.blocks["res-2"].revision });
    expect(s.findings.f16.status).toBe("stale");
    expect(s.findings.f14.resolution).toBe("open");
    s = run(s, { type: "undo", id: "f14" });
    expect(text(s, "res-2")).toContain("recieved");
    expect(text(s, "res-2")).toContain("similar unshaded sites");
  });

  it("a manual edit that rewrites a finding's own text supersedes it", () => {
    let s = evaluate(createReviewState(), "f21", decision("SUGGEST", 0.9, 0.9, 0.99));
    const t = text(s, "disc-2").replace("an unique challenge", "a distinct challenge");
    s = run(s, { type: "editBlock", blockId: "disc-2", text: t, expectedRevision: s.doc.blocks["disc-2"].revision });
    expect(s.findings.f21.resolution).toBe("superseded");
    s = run(s, { type: "apply", id: "f21" });
    expect(text(s, "disc-2")).toBe(t);
  });

  it("failures never produce a decision or modify text", () => {
    let s = createReviewState();
    s.mode = "live";
    const before = s.doc;
    s = run(s, { type: "queue", ids: ["f01"] }, { type: "evalStart", id: "f01" });
    s = run(s, { type: "evalFailure", id: "f01", attempt: s.findings.f01.attempt, epoch: 0, error: { kind: "auth", message: "bad key", status: 401 } });
    expect(s.findings.f01.status).toBe("failed");
    expect(s.findings.f01.outcome).toBeUndefined();
    expect(s.doc.blocks).toEqual(before.blocks);
    expect(s.jevConnected).toBe(false);
  });
});

describe("summary", () => {
  it("counts only what state contains", () => {
    let s = createReviewState();
    s = run(s, { type: "start", mode: "preview" });
    for (const id of Object.keys(s.findings)) {
      s = run(s, { type: "queue", ids: [id] }, { type: "evalStart", id });
      const f = s.findings[id];
      s = run(s, { type: "evalSuccess", id, attempt: f.attempt, epoch: 0, decision: SAMPLE_DECISIONS[id], source: "sample" });
    }
    const sum = summarise(s);
    expect(sum.autoHandled).toBe(6);
    expect(sum.suppressed).toBe(5);
    expect(sum.needsYou).toBe(11);
    expect(sum.complete).toBe(false);
    expect(s.jevConnected).toBe(false);
  });
});
