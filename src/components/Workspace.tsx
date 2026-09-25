"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { OpenJevStatusBody } from "@/lib/openjev/types";
import { sectionTitle, SECTIONS } from "@/lib/manuscript";
import { candidateOf, createReviewState, isAutoApplied, needsEditor, reviewReducer, sortedFindings, summarise, type FindingState } from "@/lib/review";
import { QueryDialog, SettingsDialog } from "./Dialogs";
import type { CardActions } from "./FindingCard";
import { Manuscript } from "./Manuscript";
import { OutlineRail } from "./OutlineRail";
import { ReviewPanel, type Filter } from "./ReviewPanel";
import { TopBar, type OpenJevIndicator } from "./TopBar";
import { useEvaluator } from "./useEvaluator";
import { XmlView } from "./XmlView";
import type { AiStatus } from "./Assist";
import { usePanelFollow } from "./usePanelFollow";

export function Workspace() {
  const [state, dispatch] = useReducer(reviewReducer, undefined, () => createReviewState());
  const [openjevStatus, setOpenJevStatus] = useState<OpenJevStatusBody | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [flashId, setFlashId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [showAll, setShowAll] = useState(false);
  const [editing, setEditing] = useState<{ blockId: string; selectStart?: number; selectEnd?: number } | null>(null);
  const [queryId, setQueryId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [startPrompt, setStartPrompt] = useState(false);
  const [view, setView] = useState<"text" | "xml">("text");
  const [aiStatus, setAiStatus] = useState<AiStatus | null>(null);

  const mainRef = useRef<HTMLElement>(null);
  const visibleRef = useRef<string[]>([]);
  const [visibleBlocks, setVisibleBlocks] = useState<string[]>([]);
  const [readingBlock, setReadingBlock] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [pointerInPanel, setPointerInPanel] = useState(false);
  const [interactingCards, setInteractingCards] = useState<Set<string>>(new Set());

  useEvaluator(state, dispatch, visibleRef);

  useEffect(() => {
    let alive = true;
    fetch("/api/openjev/status", { cache: "no-store" })
      .then((r) => r.json() as Promise<OpenJevStatusBody>)
      .then((s) => alive && setOpenJevStatus(s))
      .catch(() => alive && setOpenJevStatus({ configured: false, model: "openjev" }));
    fetch("/api/ai/status", { cache: "no-store" })
      .then((r) => r.json() as Promise<AiStatus>)
      .then((s) => alive && setAiStatus(s))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  /* ---------- Which passage is the editor reading? ---------- */
  const docOrder = state.doc.order;
  useEffect(() => {
    const root = mainRef.current;
    if (!root) return;
    const inView = new Set<string>();
    let timer: ReturnType<typeof setTimeout> | null = null;
    // Presentation only: scrolling never triggers OpenJEV requests.
    const recompute = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        const ordered = docOrder.filter((id) => inView.has(id));
        visibleRef.current = ordered;
        setVisibleBlocks((prev) => (prev.join() === ordered.join() ? prev : ordered));
        // The block under the reading line (about a third of the way down) names the passage.
        const line = root.getBoundingClientRect().top + root.clientHeight * 0.33;
        const reading = ordered.find((id) => {
          const el = root.querySelector<HTMLElement>(`[data-block-id="${id}"]`);
          return !!el && el.getBoundingClientRect().bottom > line;
        });
        setReadingBlock(reading ?? ordered[ordered.length - 1] ?? null);
      }, 90);
    };
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const id = (e.target as HTMLElement).dataset.blockId!;
          if (e.isIntersecting) inView.add(id);
          else inView.delete(id);
        }
        recompute();
      },
      { root, rootMargin: "-8% 0px -24% 0px", threshold: 0 },
    );
    root.querySelectorAll<HTMLElement>("[data-block-id]").forEach((el) => io.observe(el));
    root.addEventListener("scroll", recompute, { passive: true });
    return () => {
      io.disconnect();
      root.removeEventListener("scroll", recompute);
      if (timer) clearTimeout(timer);
    };
  }, [docOrder, editing, view]);

  // The panel follows the manuscript, except while the editor is working in it.
  const interacting = pointerInPanel || interactingCards.size > 0 || queryId !== null;
  const follow = usePanelFollow({ mainRef, listRef, paused: interacting, onActive: setActiveId });

  const onInteracting = useCallback((id: string, active: boolean) => {
    setInteractingCards((prev) => {
      if (active === prev.has(id)) return prev;
      const next = new Set(prev);
      if (active) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const blockOfFinding = useCallback((f: FindingState) => f.anchor?.blockId ?? candidateOf(f.id).blockId, []);

  const passageLabel = useMemo(() => {
    const first = readingBlock ?? "abs-1";
    const block = state.doc.blocks[first];
    let sub: string | null = null;
    const idx = state.doc.order.indexOf(first);
    for (let i = idx; i >= 0; i--) {
      const b = state.doc.blocks[state.doc.order[i]];
      if (b.sectionId !== block.sectionId || b.kind === "heading") break;
      if (b.kind === "subheading") {
        sub = b.text;
        break;
      }
    }
    return { section: sectionTitle(block.sectionId), sub, sectionId: block.sectionId };
  }, [readingBlock, state.doc]);

  const currentSection = readingBlock ? state.doc.blocks[readingBlock].sectionId : "abstract";

  const all = useMemo(() => sortedFindings(state), [state]);
  const summary = useMemo(() => summarise(state), [state]);

  // Findings in the passage being read stay in focus; the rest fade back.
  const relevantIds = useMemo(() => {
    const set = new Set(visibleBlocks);
    return new Set(all.filter((f) => set.has(blockOfFinding(f)) || f.id === selectedId).map((f) => f.id));
  }, [all, visibleBlocks, selectedId, blockOfFinding]);

  // Re-align after the list changes shape (new results, filter, expanded card).
  useEffect(() => {
    const t = setTimeout(() => follow.sync(), 60);
    return () => clearTimeout(t);
  }, [state.findings, filter, follow]);

  const findingsByBlock = useMemo(() => {
    const map: Record<string, FindingState[]> = {};
    for (const f of all) {
      if (!f.anchor) continue;
      (map[f.anchor.blockId] ??= []).push(f);
    }
    return map;
  }, [all]);

  const needsBySection = useMemo(() => {
    const out: Record<string, number> = {};
    for (const f of all) {
      if (!needsEditor(f)) continue;
      const s = state.doc.blocks[blockOfFinding(f)].sectionId;
      out[s] = (out[s] ?? 0) + 1;
    }
    return out;
  }, [all, state.doc, blockOfFinding]);

  /* ---------- Navigation ---------- */
  const flash = useCallback((id: string) => {
    setFlashId(null);
    requestAnimationFrame(() => setFlashId(id));
    window.setTimeout(() => setFlashId((cur) => (cur === id ? null : cur)), 1200);
  }, []);

  const revealInManuscript = useCallback(
    (id: string) => {
      const main = mainRef.current;
      if (!main) return;
      const f = state.findings[id];
      const el = main.querySelector<HTMLElement>(`[data-finding-id="${id}"]`) ?? main.querySelector<HTMLElement>(`[data-block-id="${blockOfFinding(f)}"]`);
      if (!el) return;
      const mr = main.getBoundingClientRect();
      const rel = el.getBoundingClientRect().top - mr.top;
      if (rel < mr.height * 0.12 || rel > mr.height * 0.68) {
        main.scrollTo({ top: main.scrollTop + rel - mr.height * 0.32, behavior: "smooth" });
      }
      flash(id);
    },
    [state.findings, blockOfFinding, flash],
  );

  const onToggleCard = useCallback(
    (id: string) => {
      if (selectedId === id) {
        setSelectedId(null);
        return;
      }
      setSelectedId(id);
      revealInManuscript(id);
      // Keep the expanded card fully visible within the panel.
      requestAnimationFrame(() =>
        requestAnimationFrame(() => document.getElementById(`card-${id}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" })),
      );
    },
    [selectedId, revealInManuscript],
  );

  const selectFromManuscript = useCallback(
    (id: string) => {
      setSelectedId(id);
      const f = state.findings[id];
      if (filter === "auto" && !isAutoApplied(f)) setFilter("all");
      if (filter === "needs" && !needsEditor(f)) setFilter("all");
      // Glide the card to sit beside the highlight that was clicked.
      requestAnimationFrame(() => requestAnimationFrame(() => follow.alignCard(id)));
    },
    [state.findings, filter, follow],
  );

  const navigateSection = useCallback((sectionId: string) => {
    const main = mainRef.current;
    const el = main?.querySelector<HTMLElement>(`[data-block-id="h-${sectionId}"]`);
    if (!main || !el) return;
    const top = sectionId === SECTIONS[0].id ? 0 : main.scrollTop + el.getBoundingClientRect().top - main.getBoundingClientRect().top - 28;
    main.scrollTo({ top, behavior: "smooth" });
  }, []);

  /* ---------- Review actions ---------- */
  const finish = useCallback((id: string) => setSelectedId((cur) => (cur === id ? null : cur)), []);

  const actions: CardActions = useMemo(
    () => ({
      keep: (id) => {
        dispatch({ type: "keep", id });
        finish(id);
      },
      undo: (id) => dispatch({ type: "undo", id }),
      apply: (id, text) => {
        dispatch({ type: "apply", id, text });
        finish(id);
      },
      dismiss: (id) => {
        dispatch({ type: "dismiss", id });
        finish(id);
      },
      markReviewed: (id) => {
        dispatch({ type: "markReviewed", id });
        finish(id);
      },
      editPassage: (id) => {
        const f = state.findings[id];
        if (!f.anchor) return;
        setEditing({ blockId: f.anchor.blockId, selectStart: f.anchor.start, selectEnd: f.anchor.end });
        revealInManuscript(id);
      },
      openQuery: (id) => setQueryId(id),
      retry: (id) => dispatch({ type: "queue", ids: [id] }),
      applyEditorText: (id, text) => {
        dispatch({ type: "applyEditorText", id, text });
        finish(id);
      },
    }),
    [state.findings, revealInManuscript, finish],
  );

  const onSaveEdit = useCallback(
    (blockId: string, text: string, baseRevision: number, force: boolean) => {
      const block = state.doc.blocks[blockId];
      if (block.revision !== baseRevision && !force) return false;
      if (text !== block.text) dispatch({ type: "editBlock", blockId, text, expectedRevision: block.revision });
      setEditing(null);
      return true;
    },
    [state.doc],
  );

  /* ---------- Start / reset ---------- */
  const startLive = () => {
    dispatch({ type: "start", mode: "live" });
    dispatch({ type: "queue", ids: Object.keys(state.findings) });
  };
  const startPreview = () => {
    setStartPrompt(false);
    dispatch({ type: "start", mode: "preview" });
    dispatch({ type: "queue", ids: Object.keys(state.findings) });
  };
  const onStart = () => {
    if (!openjevStatus) return;
    if (openjevStatus.configured) startLive();
    else setStartPrompt(true);
  };
  const reset = () => {
    dispatch({ type: "reset" });
    setSelectedId(null);
    setEditing(null);
    setQueryId(null);
    setFilter("all");
    setShowAll(false);
    setStartPrompt(false);
    mainRef.current?.scrollTo({ top: 0 });
  };

  const indicator: OpenJevIndicator = useMemo(() => {
    if (state.mode === "preview") return { kind: "preview" };
    if (!openjevStatus) return { kind: "checking" };
    if (!openjevStatus.configured) return { kind: "not_configured" };
    if (state.openjevConnected) return { kind: "connected" };
    if (state.lastLiveError) {
      const k = state.lastLiveError.kind;
      return { kind: "error", text: k === "auth" ? "OpenJEV key rejected" : k === "timeout" || k === "network" || k === "server" || k === "rate_limited" ? "OpenJEV unavailable" : "OpenJEV error" };
    }
    return { kind: "configured" };
  }, [state.mode, state.openjevConnected, state.lastLiveError, openjevStatus]);

  const queryFinding = queryId ? state.findings[queryId] : null;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-ivory">
      <TopBar
        indicator={indicator}
        started={state.mode !== "idle"}
        progress={{ done: summary.evaluated + summary.failed, total: summary.total, pending: summary.pending, needsYou: summary.needsYou, auto: summary.autoHandled, complete: summary.complete }}
        onStart={onStart}
        canStart={openjevStatus !== null}
        onReset={reset}
        onSettings={() => setSettingsOpen(true)}
        startPrompt={
          startPrompt && (
            <div className="fade-in absolute right-0 top-11 z-30 w-[320px] rounded-md border border-line bg-paper p-4 shadow-[var(--shadow-pop)]" role="dialog" aria-label="OpenJEV is not configured">
              <p className="text-[13px] font-medium text-ink">OpenJEV isn’t configured</p>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-2">
                Add <code className="rounded bg-ivory px-1 text-[11.5px]">OPENJEV_API_KEY</code> to <code className="rounded bg-ivory px-1 text-[11.5px]">.env.local</code> and restart the server
                for live OpenJEV decisions. Or explore with fixture data, clearly labelled as samples.
              </p>
              <div className="mt-3.5 flex justify-end gap-2">
                <button type="button" onClick={() => setStartPrompt(false)} className="h-8 rounded-md px-3 text-[12.5px] text-ink-2 hover:bg-ivory hover:text-ink">
                  Cancel
                </button>
                <button type="button" onClick={startPreview} className="h-8 rounded-md bg-olive px-3 text-[12.5px] font-medium text-paper hover:bg-olive-dark">
                  Preview with sample decisions
                </button>
              </div>
            </div>
          )
        }
      />

      <div className="flex min-h-0 flex-1">
        <OutlineRail currentSection={currentSection} needsBySection={needsBySection} onNavigate={navigateSection} onStyle={() => setSettingsOpen(true)} />

        <main ref={mainRef} className="quiet-scroll relative min-w-0 flex-1 overflow-y-auto px-6">
          <div className="sticky top-0 z-10 -mx-6 flex justify-center bg-gradient-to-b from-ivory via-ivory/90 to-transparent pb-3 pt-4">
            <div role="tablist" aria-label="View" className="flex rounded-full border border-line bg-paper/90 p-[3px] text-[12.5px] shadow-[var(--shadow-hair)] backdrop-blur-sm">
              {(
                [
                  ["text", "Manuscript"],
                  ["xml", "XML structure"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  role="tab"
                  aria-selected={view === id}
                  onClick={() => {
                    setEditing(null);
                    setView(id);
                  }}
                  className={`view-tab rounded-full px-3.5 py-1 ${view === id ? "bg-olive text-paper shadow-[var(--shadow-hair)]" : "text-ink-2 hover:text-ink"}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          {view === "xml" ? (
            <div key="xml" className="view-enter -mt-6">
              <XmlView state={state} selectedId={selectedId} activeId={state.mode === "idle" ? null : activeId} flashId={flashId} onSelect={selectFromManuscript} />
            </div>
          ) : (
          <div key="text" className="view-enter -mt-6">
          <Manuscript
            doc={state.doc}
            figures={state.figures}
            findingsByBlock={findingsByBlock}
            selectedId={selectedId}
            activeId={state.mode === "idle" ? null : activeId}
            flashId={flashId}
            editing={editing}
            onSelect={selectFromManuscript}
            onStartEdit={(blockId) => setEditing({ blockId })}
            onSaveEdit={onSaveEdit}
            onCancelEdit={() => setEditing(null)}
          />
          </div>
          )}
        </main>

        <ReviewPanel
          state={state}
          summary={summary}
          scopeFindings={all}
          relevantIds={relevantIds}
          activeId={activeId}
          listRef={listRef}
          showAll={showAll}
          onToggleShowAll={() => setShowAll((v) => !v)}
          filter={filter}
          onFilter={setFilter}
          passageLabel={passageLabel}
          selectedId={selectedId}
          onToggleCard={onToggleCard}
          actions={actions}
          onInteracting={onInteracting}
          onStart={onStart}
          canStart={openjevStatus !== null}
          onPointerInside={setPointerInPanel}
          ai={aiStatus}
          onRetryFailed={() => dispatch({ type: "queue", ids: all.filter((f) => f.status === "failed").map((f) => f.id) })}
        />
      </div>

      {queryFinding && (
        <QueryDialog
          ai={aiStatus}
          finding={queryFinding}
          paragraph={queryFinding.anchor ? state.doc.blocks[queryFinding.anchor.blockId].text : ""}
          candidate={candidateOf(queryFinding.id)}
          draft={queryFinding.query ?? ""}
          onSave={(text) => dispatch({ type: "saveQuery", id: queryFinding.id, text })}
          onClose={() => setQueryId(null)}
        />
      )}
      {settingsOpen && (
        <SettingsDialog
          onClose={() => setSettingsOpen(false)}
          configured={openjevStatus?.configured ?? null}
          model={openjevStatus?.model ?? "openjev"}
          mode={state.mode}
          ai={aiStatus}
          onPreview={startPreview}
        />
      )}
    </div>
  );
}
