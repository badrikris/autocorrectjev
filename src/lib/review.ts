/**
 * Review state: a pure reducer over the document and findings.
 *
 * Invariants:
 *  - Text changes only through applyExactEdit / applyManualBlockEdit (verified, offset-anchored).
 *  - An OpenJEV result is applied only if the passage has not been freely edited since
 *    the request (editEpoch) and it answers the latest request for that finding (attempt).
 *  - Every automatic edit keeps what is needed to undo it.
 */
import { CANDIDATES, type Candidate } from "./candidates";
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
  return { doc, findings, mode: "idle", openjevConnected: false, actionSeq: 0 };
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
      const targetValid = textAt(state.doc, f.anchor) === c.original;
      const outcome = routeFinding({
        decision: action.decision,
        category: c.category,
        original: c.original,
        replacement: c.replacement,
        targetValid,
        decider: action.source === "sample" ? "The sample decision" : "OpenJEV",
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
        const edit = applyExactEdit(state.doc, { anchor: f.anchor, expected: c.original, replacement: c.replacement });
        if (!edit.ok) {
          // Policy verified the target, so this is defensive: never force the edit.
          return update(base, f.id, { ...evaluated, outcome: { ...outcome, treatment: "MANUAL_REVIEW", adjusted: true, summary: "The target text could not be verified at apply time, so the prototype requires editorial review." } });
        }
        const findings = remapAnchors(base.findings, edit.change, f.id);
        findings[f.id] = { ...findings[f.id], ...evaluated, anchor: edit.anchor, appliedText: c.replacement, appliedBy: "system" };
        return { ...base, doc: edit.doc, findings };
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
      const edit = applyExactEdit(state.doc, { anchor: f.anchor, expected: f.appliedText, replacement: c.original });
      if (!edit.ok) {
        return update(state, f.id, { note: "This passage has changed since the edit, so it can’t be undone automatically." });
      }
      const findings = remapAnchors(state.findings, edit.change, f.id);
      const wasAuto = f.appliedBy === "system";
      findings[f.id] = {
        ...findings[f.id],
        anchor: edit.anchor,
        appliedText: undefined,
        appliedBy: undefined,
        resolution: wasAuto ? "undone" : "open",
        note: undefined,
      };
      return { ...state, doc: edit.doc, findings, actionSeq: state.actionSeq + 1 };
    }

    case "apply": {
      const f = state.findings[action.id];
      if (!f?.anchor || f.resolution !== "open" || f.status !== "evaluated") return state;
      if (f.outcome?.treatment !== "SUGGEST") return state;
      const c = candidateOf(f.id);
      const text = action.text ?? c.replacement;
      if (text === null || text === undefined) return state;
      const edit = applyExactEdit(state.doc, { anchor: f.anchor, expected: c.original, replacement: text });
      if (!edit.ok) return update(state, f.id, { note: "The original text is no longer where this suggestion expects it." });
      const findings = remapAnchors(state.findings, edit.change, f.id);
      findings[f.id] = {
        ...findings[f.id],
        anchor: edit.anchor,
        appliedText: text,
        appliedBy: "editor",
        resolution: text === c.replacement ? "applied" : "applied_edited",
      };
      return { ...state, doc: edit.doc, findings, actionSeq: state.actionSeq + 1 };
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
