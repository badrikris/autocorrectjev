/**
 * Review state: a pure reducer over the document and findings.
 *
 * Invariants:
 *  - Text changes only through applyExactEdit / applyManualBlockEdit (verified, offset-anchored).
 *  - An OpenJEV result is applied only if the passage has not been freely edited since
 *    the request (editEpoch) and it answers the latest request for that finding (attempt).
 *  - Every automatic edit keeps what is needed to undo it.
 */
import { CANDIDATES, kindOf, type Candidate } from "./candidates";
import { FIGURES, patchFigure, type FigureState } from "./figures";
import { BLOCKS } from "./manuscript";
import {
  applyExactEdit,
  applyManualBlockEdit,
  countOccurrences,
  createDoc,
  findOccurrence,
  mapAnchor,
  textAt,
  type Anchor,
  type ChangeRegion,
  type DocState,
} from "./document";
import type { OpenJevError, OpenJevTechnical } from "./openjev/types";
import { routeFinding, type OpenJevDecision, type PolicyOutcome, type Route } from "./policy";
import { detectProtectedChanges, type ProtectedHit } from "./protected";

export type EvalStatus = "idle" | "waiting" | "evaluating" | "evaluated" | "failed" | "stale";
export type Resolution =
  | "open"
  | "kept"
  | "undone"
  | "applied"
  | "applied_edited"
  | "dismissed"
  | "reviewed"
  | "superseded";
export type DecisionSource = "live" | "sample";
export type ReviewMode = "idle" | "live" | "preview";

export interface FindingState {
  id: string;
  /** Position of the finding's text (original, or applied text once changed). Null if lost. */
  anchor: Anchor | null;
  /** Manuscript order, fixed at creation. */
  order: number;
  status: EvalStatus;
  /** Incremented for every request; only the latest request's response is accepted. */
  attempt: number;
  /** editEpoch of the block when the current request was made. */
  requestEpoch?: number;
  error?: OpenJevError;
  decision?: OpenJevDecision;
  outcome?: PolicyOutcome;
  source?: DecisionSource;
  technical?: OpenJevTechnical;
  resolution: Resolution;
  /** The text this finding put into the manuscript, if applied. */
  appliedText?: string;
  appliedBy?: "system" | "editor";
  note?: string;
  /** Editor's working copy of the author query. */
  query?: string;
}

export interface ReviewState {
  doc: DocState;
  /** Figure specifications; figure findings patch these. */
  figures: FigureState;
  findings: Record<string, FindingState>;
  mode: ReviewMode;
  /** True only after at least one successful live OpenJEV response. */
  openjevConnected: boolean;
  lastLiveError?: OpenJevError;
  /** Monotonic counter for human actions; used for UI transitions. */
  actionSeq: number;
}

export type ReviewAction =
  | { type: "start"; mode: "live" | "preview" }
  | { type: "queue"; ids: string[] }
  | { type: "evalStart"; id: string }
  | { type: "evalSuccess"; id: string; attempt: number; epoch: number; decision: OpenJevDecision; source: DecisionSource; technical?: OpenJevTechnical }
  | { type: "evalFailure"; id: string; attempt: number; epoch: number; error: OpenJevError }
  | { type: "keep"; id: string }
  | { type: "undo"; id: string }
  | { type: "apply"; id: string; text?: string }
  /** The editor chooses their own wording for a judgment item (e.g. one of the offered rewrites). */
  | { type: "applyEditorText"; id: string; text: string }
  | { type: "dismiss"; id: string }
  | { type: "markReviewed"; id: string }
  | { type: "saveQuery"; id: string; text: string }
  | { type: "editBlock"; blockId: string; text: string; expectedRevision: number }
  | { type: "reset" };

const candidateById = new Map(CANDIDATES.map((c) => [c.id, c]));
export const candidateOf = (id: string): Candidate => {
  const c = candidateById.get(id);
  if (!c) throw new Error(`Unknown candidate ${id}`);
  return c;
};

export function createReviewState(candidates: Candidate[] = CANDIDATES, doc: DocState = createDoc()): ReviewState {
  const findings: Record<string, FindingState> = {};
  const blockIndex = new Map(doc.order.map((id, i) => [id, i]));
  for (const c of candidates) {
    const block = doc.blocks[c.blockId];
    if (kindOf(c) === "figure") {
      // Figure findings point at the whole figure, not at caption text.
      if (!block || !c.figure || !FIGURES[c.figure.figureId]) throw new Error(`Figure candidate ${c.id} has no figure`);
      findings[c.id] = {
        id: c.id,
        anchor: { blockId: c.blockId, start: 0, end: 0 },
        order: (blockIndex.get(c.blockId) ?? 0) * 100_000,
        status: "idle",
        attempt: 0,
        resolution: "open",
        query: c.authorQuery,
      };
      continue;
    }
    const start = block ? findOccurrence(block.text, c.original, c.occurrence) : -1;
    if (start < 0) throw new Error(`Candidate ${c.id} does not match its block text`);
    findings[c.id] = {
      id: c.id,
      anchor: { blockId: c.blockId, start, end: start + c.original.length },
      order: (blockIndex.get(c.blockId) ?? 0) * 100_000 + start,
      status: "idle",
      attempt: 0,
      resolution: "open",
      query: c.authorQuery,
    };
  }
  return { doc, figures: FIGURES, findings, mode: "idle", openjevConnected: false, actionSeq: 0 };
}

/* ------------------------------------------------------------------ */
/* What each kind of finding changes                                   */
/* ------------------------------------------------------------------ */

const REF_IDS = new Set(BLOCKS.filter((b) => b.refId).map((b) => b.refId!));

/** Is the thing this finding would change still exactly as the finding expects? */
export function targetValid(state: ReviewState, f: FindingState, c: Candidate): boolean {
  if (!f.anchor) return false;
  const kind = kindOf(c);
  if (kind === "figure") {
    const fig = c.figure!;
    if (fig.prop === "source") return true;
    return state.figures[fig.figureId]?.[fig.prop] === fig.from;
  }
  if (textAt(state.doc, f.anchor) !== c.original) return false;
  if (kind === "structure" && c.structure?.rid) {
    // A link is only valid if its target really exists.
    return c.structure.refType === "bibr" ? REF_IDS.has(c.structure.rid) : !!state.figures[c.structure.rid];
  }
  return true;
}

/**
 * Protected content for non-text findings. Data-bearing figure properties (axis
 * labels carry units) are checked like text; presentation-only properties are not.
 * Tagging text as XML never changes the wording.
 */
function policyOverrides(c: Candidate, valid: boolean): { protectedHits?: ProtectedHit[]; mechanical?: boolean } {
  const kind = kindOf(c);
  if (kind === "figure") {
    const fig = c.figure!;
    const hits = fig.prop === "yAxisLabel" && typeof fig.from === "string" && typeof fig.to === "string" ? detectProtectedChanges(fig.from, fig.to) : [];
    return { protectedHits: hits, mechanical: false };
  }
  if (kind === "structure") {
    // Only an exact, unique, existing target is mechanical enough to link automatically.
    return { protectedHits: [], mechanical: c.category === "structure_link" && valid };
  }
  return {};
}

type ChangeResult = { ok: true; state: ReviewState; anchor: Anchor } | { ok: false };

/** Make the change a finding proposes. `text` is the editor's wording for text (or alt text). */
function applyChange(state: ReviewState, f: FindingState, c: Candidate, text: string): ChangeResult {
  if (!f.anchor) return { ok: false };
  const kind = kindOf(c);
  if (kind === "figure") {
    const fig = c.figure!;
    if (fig.prop === "source") return { ok: false };
    const next = fig.prop === "altText" ? text : fig.to;
    const r = patchFigure(state.figures, fig.figureId, fig.prop, fig.from, next);
    return r.ok ? { ok: true, state: { ...state, figures: r.figures }, anchor: f.anchor } : { ok: false };
  }
  if (kind === "structure") {
    // Tagging leaves the text untouched; the XML is generated from applied links.
    return textAt(state.doc, f.anchor) === c.original ? { ok: true, state, anchor: f.anchor } : { ok: false };
  }
  const edit = applyExactEdit(state.doc, { anchor: f.anchor, expected: c.original, replacement: text });
  if (!edit.ok) return { ok: false };
  return { ok: true, state: { ...state, doc: edit.doc, findings: remapAnchors(state.findings, edit.change, f.id) }, anchor: edit.anchor };
}

/** Reverse exactly what applyChange did, after checking it is still in place. */
function revertChange(state: ReviewState, f: FindingState, c: Candidate): ChangeResult {
  if (!f.anchor || f.appliedText === undefined) return { ok: false };
  const kind = kindOf(c);
  if (kind === "figure") {
    const fig = c.figure!;
    if (fig.prop === "source") return { ok: false };
    const current = state.figures[fig.figureId][fig.prop];
    const r = patchFigure(state.figures, fig.figureId, fig.prop, current, fig.from);
    const expected = fig.prop === "altText" ? current !== fig.from : current === fig.to;
    return r.ok && expected ? { ok: true, state: { ...state, figures: r.figures }, anchor: f.anchor } : { ok: false };
  }
  if (kind === "structure") return { ok: true, state, anchor: f.anchor };
  const edit = applyExactEdit(state.doc, { anchor: f.anchor, expected: f.appliedText, replacement: c.original });
  if (!edit.ok) return { ok: false };
  return { ok: true, state: { ...state, doc: edit.doc, findings: remapAnchors(state.findings, edit.change, f.id) }, anchor: edit.anchor };
}

/** The label stored as the finding's applied change. */
function appliedLabel(c: Candidate, text: string): string {
  if (kindOf(c) === "figure") return c.figure!.prop === "altText" ? `Alt text: ${text}` : c.replacement ?? "";
  if (kindOf(c) === "structure") return c.replacement ?? "";
  return text;
}

/** Move every other finding's anchor across a change in the same block. */
function remapAnchors(findings: Record<string, FindingState>, change: ChangeRegion, exceptId: string | null): Record<string, FindingState> {
  const next = { ...findings };
  for (const f of Object.values(findings)) {
    if (f.id === exceptId || !f.anchor || f.anchor.blockId !== change.blockId) continue;
    const mapped = mapAnchor(f.anchor, change);
    if (mapped) next[f.id] = { ...f, anchor: mapped };
    else next[f.id] = { ...f, anchor: null, resolution: "superseded", note: "An overlapping change replaced this passage." };
  }
  return next;
}

function update(state: ReviewState, id: string, patch: Partial<FindingState>): ReviewState {
  return { ...state, findings: { ...state.findings, [id]: { ...state.findings[id], ...patch } } };
}

export function reviewReducer(state: ReviewState, action: ReviewAction): ReviewState {
  switch (action.type) {
    case "reset":
      return createReviewState();

    case "start":
      return { ...state, mode: action.mode };

    case "queue": {
      const findings = { ...state.findings };
      for (const id of action.ids) {
        const f = findings[id];
        if (!f || f.resolution !== "open" || !f.anchor) continue;
        if (f.status === "evaluating" || f.status === "evaluated") continue;
        findings[id] = { ...f, status: "waiting", error: undefined, outcome: undefined, decision: undefined, note: undefined };
      }
      return { ...state, findings };
    }

    case "evalStart": {
      const f = state.findings[action.id];
      if (!f?.anchor || f.status !== "waiting") return state;
      const epoch = state.doc.blocks[f.anchor.blockId].editEpoch;
      return update(state, action.id, { status: "evaluating", attempt: f.attempt + 1, requestEpoch: epoch, error: undefined });
    }

    case "evalFailure": {
      const f = state.findings[action.id];
      if (!f || f.attempt !== action.attempt || f.status !== "evaluating") return state;
      const next = update(state, action.id, { status: "failed", error: action.error });
      return state.mode === "live" ? { ...next, lastLiveError: action.error } : next;
    }

    case "evalSuccess": {
      const f = state.findings[action.id];
      // Only the latest in-flight request for this finding may answer.
      if (!f || f.attempt !== action.attempt || f.status !== "evaluating") return state;
      const connected = state.openjevConnected || action.source === "live";
      const base = { ...state, openjevConnected: connected, lastLiveError: action.source === "live" ? undefined : state.lastLiveError };
      if (f.resolution !== "open") return base;
      if (!f.anchor) return base;
      const block = state.doc.blocks[f.anchor.blockId];
      if (block.editEpoch !== action.epoch) {
        return update(base, f.id, {
          status: "stale",
          note: "The passage was edited while OpenJEV was evaluating, so that decision was discarded.",
        });
      }
      const c = candidateOf(f.id);
      const valid = targetValid(state, f, c);
      const outcome = routeFinding({
        decision: action.decision,
        category: c.category,
        original: c.original,
        replacement: c.replacement,
        targetValid: valid,
        decider: action.source === "sample" ? "The sample decision" : "OpenJEV",
        ...policyOverrides(c, valid),
      });
      const evaluated: Partial<FindingState> = {
        status: "evaluated",
        decision: action.decision,
        outcome,
        source: action.source,
        technical: action.technical,
        note: undefined,
      };
      if (outcome.treatment === "AUTO_APPLY" && c.replacement !== null) {
        const r = applyChange(base, f, c, c.replacement);
        if (!r.ok) {
          // Policy verified the target, so this is defensive: never force the edit.
          return update(base, f.id, { ...evaluated, outcome: { ...outcome, treatment: "MANUAL_REVIEW", adjusted: true, summary: "The target could not be verified at apply time, so the prototype requires editorial review." } });
        }
        return update(r.state, f.id, { ...evaluated, anchor: r.anchor, appliedText: appliedLabel(c, c.replacement), appliedBy: "system" });
      }
      return update(base, f.id, evaluated);
    }

    case "keep": {
      const f = state.findings[action.id];
      if (!f || f.outcome?.treatment !== "AUTO_APPLY" || f.resolution !== "open") return state;
      return { ...update(state, f.id, { resolution: "kept" }), actionSeq: state.actionSeq + 1 };
    }

    case "undo": {
      const f = state.findings[action.id];
      if (!f?.anchor || f.appliedText === undefined) return state;
      if (!["open", "kept", "applied", "applied_edited"].includes(f.resolution)) return state;
      const c = candidateOf(f.id);
      const r = revertChange(state, f, c);
      if (!r.ok) {
        return update(state, f.id, { note: "This has changed since the edit, so it can’t be undone automatically." });
      }
      const wasAuto = f.appliedBy === "system";
      return {
        ...update(r.state, f.id, { anchor: r.anchor, appliedText: undefined, appliedBy: undefined, resolution: wasAuto ? "undone" : "open", note: undefined }),
        actionSeq: state.actionSeq + 1,
      };
    }

    case "apply": {
      const f = state.findings[action.id];
      if (!f?.anchor || f.resolution !== "open" || f.status !== "evaluated") return state;
      const c = candidateOf(f.id);
      // Suggestions can be applied; for figures (which have no "edit passage"), the editor may
      // also apply a judgment item's proposed change as their own decision.
      const manualFigure = f.outcome?.treatment === "MANUAL_REVIEW" && kindOf(c) === "figure";
      if (f.outcome?.treatment !== "SUGGEST" && !manualFigure) return state;
      const proposed = kindOf(c) === "figure" && c.figure?.prop === "altText" ? (c.figure.to as string) : c.replacement;
      const text = action.text ?? proposed;
      if (text === null || text === undefined) return state;
      const r = applyChange(state, f, c, text);
      if (!r.ok) return update(state, f.id, { note: "The original is no longer what this suggestion expects." });
      return {
        ...update(r.state, f.id, {
          anchor: r.anchor,
          appliedText: appliedLabel(c, text),
          appliedBy: "editor",
          resolution: text === proposed ? "applied" : "applied_edited",
        }),
        actionSeq: state.actionSeq + 1,
      };
    }

    case "applyEditorText": {
      const f = state.findings[action.id];
      if (!f?.anchor || f.resolution !== "open" || f.status !== "evaluated") return state;
      if (f.outcome?.treatment !== "MANUAL_REVIEW") return state;
      const c = candidateOf(f.id);
      if (kindOf(c) !== "text" || !action.text) return state;
      const r = applyChange(state, f, c, action.text);
      if (!r.ok) return update(state, f.id, { note: "The passage has changed, so this wording can’t be applied here." });
      return {
        ...update(r.state, f.id, { anchor: r.anchor, appliedText: action.text, appliedBy: "editor", resolution: "applied_edited" }),
        actionSeq: state.actionSeq + 1,
      };
    }

    case "dismiss": {
      const f = state.findings[action.id];
      if (!f || f.resolution !== "open" || f.outcome?.treatment !== "SUGGEST") return state;
      return { ...update(state, f.id, { resolution: "dismissed" }), actionSeq: state.actionSeq + 1 };
    }

    case "markReviewed": {
      const f = state.findings[action.id];
      if (!f || f.resolution !== "open") return state;
      return { ...update(state, f.id, { resolution: "reviewed" }), actionSeq: state.actionSeq + 1 };
    }

    case "saveQuery":
      return update(state, action.id, { query: action.text });

    case "editBlock": {
      const result = applyManualBlockEdit(state.doc, action.blockId, action.text, action.expectedRevision);
      if (!result.ok || !result.change) return state;
      const change = result.change;
      const newText = result.doc.blocks[action.blockId].text;
      const findings = { ...state.findings };
      for (const f of Object.values(state.findings)) {
        if (!f.anchor || f.anchor.blockId !== action.blockId) continue;
        // Figure findings concern the graphic, not its caption text.
        if (kindOf(candidateOf(f.id)) === "figure") continue;
        const mapped = mapAnchor(f.anchor, change);
        const applied = f.appliedText !== undefined && ["open", "kept", "applied", "applied_edited"].includes(f.resolution);

        if (mapped) {
          if (applied || f.resolution !== "open") {
            findings[f.id] = { ...f, anchor: mapped };
          } else if (f.status === "evaluated") {
            findings[f.id] = { ...f, anchor: mapped, status: "stale", note: "The passage was edited after this decision. Re-evaluate to get a current decision." };
          } else {
            // waiting / evaluating / failed / stale / idle: in-flight responses are rejected by editEpoch.
            findings[f.id] = { ...f, anchor: mapped };
          }
          continue;
        }

        // The edit touched this finding's own text.
        if (applied) {
          findings[f.id] = { ...f, anchor: null, resolution: "superseded", note: "You later rewrote this passage, so this change can no longer be undone on its own." };
          continue;
        }
        if (f.resolution !== "open") {
          findings[f.id] = { ...f, anchor: null };
          continue;
        }
        const c = candidateOf(f.id);
        if (countOccurrences(newText, c.original) === 1) {
          const start = newText.indexOf(c.original);
          findings[f.id] = {
            ...f,
            anchor: { blockId: f.anchor.blockId, start, end: start + c.original.length },
            status: f.status === "idle" ? "idle" : "stale",
            note: "The passage was edited after this decision. Re-evaluate to get a current decision.",
          };
        } else {
          findings[f.id] = { ...f, anchor: null, resolution: "superseded", note: "Your edit rewrote this passage, so this finding no longer applies." };
        }
      }
      return { ...state, doc: result.doc, findings, actionSeq: state.actionSeq + 1 };
    }
  }
}

/* ------------------------------------------------------------------ */
/* Selectors                                                           */
/* ------------------------------------------------------------------ */

export type Treatment = Route;

export function treatmentOf(f: FindingState): Treatment | null {
  return f.status === "evaluated" && f.outcome ? f.outcome.treatment : null;
}

/** Needs the editor: an open suggestion/manual item, a failure, or a stale decision. */
export function needsEditor(f: FindingState): boolean {
  if (f.resolution !== "open") return false;
  if (f.status === "failed" || f.status === "stale") return true;
  const t = treatmentOf(f);
  return t === "SUGGEST" || t === "MANUAL_REVIEW";
}

export function isSuppressed(f: FindingState): boolean {
  return treatmentOf(f) === "NO_CHANGE" && f.resolution === "open";
}

export function isAutoApplied(f: FindingState): boolean {
  return f.outcome?.treatment === "AUTO_APPLY" && f.status === "evaluated";
}

export function sortedFindings(state: ReviewState): FindingState[] {
  return Object.values(state.findings).sort((a, b) => a.order - b.order);
}

export interface ReviewSummary {
  total: number;
  evaluated: number;
  pending: number;
  failed: number;
  stale: number;
  autoHandled: number;
  reviewedByYou: number;
  suppressed: number;
  needsYou: number;
  complete: boolean;
}

export function summarise(state: ReviewState): ReviewSummary {
  const all = Object.values(state.findings);
  const count = (p: (f: FindingState) => boolean) => all.filter(p).length;
  const pending = count((f) => f.status === "waiting" || f.status === "evaluating");
  const failed = count((f) => f.status === "failed" && f.resolution === "open");
  const stale = count((f) => f.status === "stale" && f.resolution === "open");
  const needsYou = count(needsEditor);
  const autoHandled = count((f) => isAutoApplied(f) && (f.resolution === "open" || f.resolution === "kept"));
  // Decisions the editor made (keeping an automatic edit is counted as automatic).
  const reviewedByYou = count((f) => ["applied", "applied_edited", "dismissed", "reviewed", "undone"].includes(f.resolution));
  const suppressed = count(isSuppressed);
  const evaluated = count((f) => f.status === "evaluated");
  return {
    total: all.length,
    evaluated,
    pending,
    failed,
    stale,
    autoHandled,
    reviewedByYou,
    suppressed,
    needsYou,
    complete: state.mode !== "idle" && pending === 0 && needsYou === 0 && count((f) => f.status === "idle" && f.resolution === "open") === 0,
  };
}
