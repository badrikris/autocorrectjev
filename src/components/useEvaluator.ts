"use client";

/**
 * Evaluation queue. Sends each prepared candidate to our server route
 * (which calls OpenJEV) with bounded concurrency, visible passages first.
 * Scrolling never triggers requests; it only changes priority for queued items.
 */
import { useCallback, useEffect, useRef, type Dispatch, type MutableRefObject } from "react";
import { candidateOf, sortedFindings, type ReviewAction, type ReviewState } from "@/lib/review";
import type { EvaluateRequestBody, EvaluateResponseBody } from "@/lib/openjev/types";
import { sectionTitle } from "@/lib/manuscript";
import { SAMPLE_DECISIONS } from "@/lib/sample-decisions";
import { effectiveDpi } from "@/lib/figures";

const CONCURRENCY = 3;

function buildBody(state: ReviewState, id: string): EvaluateRequestBody | null {
  const f = state.findings[id];
  if (!f.anchor) return null;
  const { doc } = state;
  const block = doc.blocks[f.anchor.blockId];
  const i = doc.order.indexOf(block.id);
  const neighbour = (j: number) => (j >= 0 && j < doc.order.length ? doc.blocks[doc.order[j]].text : null);
  const c = candidateOf(id);
  return {
    findingId: id,
    blockText: block.text,
    anchorStart: f.anchor.start,
    sectionTitle: block.kind === "subheading" ? `${sectionTitle(block.sectionId)} (subheading)` : sectionTitle(block.sectionId),
    precedingText: neighbour(i - 1),
    followingText: neighbour(i + 1),
    figure: c.figure ? { ...state.figures[c.figure.figureId], effective_dpi: effectiveDpi(state.figures[c.figure.figureId]) } : undefined,
    related: (c.relatedBlocks ?? []).map((bid) => ({
      label: `${sectionTitle(doc.blocks[bid].sectionId)} paragraph`,
      text: doc.blocks[bid].text,
    })),
  };
}

export function useEvaluator(
  state: ReviewState,
  dispatch: Dispatch<ReviewAction>,
  visibleRef: MutableRefObject<string[]>,
) {
  const stateRef = useRef(state);
  stateRef.current = state;
  const inflight = useRef(new Set<string>());

  const pickNext = useCallback((): string | null => {
    const s = stateRef.current;
    const waiting = sortedFindings(s).filter((f) => f.status === "waiting" && f.anchor && !inflight.current.has(f.id));
    if (waiting.length === 0) return null;
    const visible = new Set(visibleRef.current);
    return (waiting.find((f) => visible.has(f.anchor!.blockId)) ?? waiting[0]).id;
  }, [visibleRef]);

  const run = useCallback(
    async (id: string) => {
      const s = stateRef.current;
      const f = s.findings[id];
      const body = buildBody(s, id);
      if (!f.anchor || !body) return;
      // Mirror the reducer's bookkeeping so the response can be matched to this request.
      const attempt = f.attempt + 1;
      const epoch = s.doc.blocks[f.anchor.blockId].editEpoch;
      inflight.current.add(id);
      dispatch({ type: "evalStart", id });
      try {
        const res = await fetch("/api/openjev/evaluate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        let data: EvaluateResponseBody;
        try {
          data = (await res.json()) as EvaluateResponseBody;
        } catch {
          data = { ok: false, error: { kind: "malformed", message: `Server returned HTTP ${res.status} without JSON.` } };
        }
        if (data.ok) {
          dispatch({ type: "evalSuccess", id, attempt, epoch, decision: data.decision, source: "live", technical: data.technical });
        } else {
          dispatch({ type: "evalFailure", id, attempt, epoch, error: data.error });
        }
      } catch (err) {
        dispatch({
          type: "evalFailure",
          id,
          attempt,
          epoch,
          error: { kind: "network", message: err instanceof Error ? err.message : "Request failed." },
        });
      } finally {
        inflight.current.delete(id);
      }
    },
    [dispatch],
  );

  // Pump the live queue whenever state changes.
  useEffect(() => {
    if (state.mode !== "live") return;
    while (inflight.current.size < CONCURRENCY) {
      const next = pickNext();
      if (!next) break;
      inflight.current.add(next);
      void run(next);
    }
  }, [state, pickNext, run]);

  // Preview mode: sample decisions are fixture data, applied immediately (no fake latency).
  useEffect(() => {
    if (state.mode !== "preview") return;
    const waiting = sortedFindings(state).filter((f) => f.status === "waiting" && f.anchor);
    for (const f of waiting) {
      const epoch = state.doc.blocks[f.anchor!.blockId].editEpoch;
      dispatch({ type: "evalStart", id: f.id });
      dispatch({ type: "evalSuccess", id: f.id, attempt: f.attempt + 1, epoch, decision: SAMPLE_DECISIONS[f.id], source: "sample" });
    }
  }, [state, dispatch]);
}
