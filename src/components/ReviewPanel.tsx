"use client";

import { Check, ChevronDown } from "lucide-react";
import { useState } from "react";
import { candidateOf, isAutoApplied, isSuppressed, needsEditor, type FindingState, type ReviewState, type ReviewSummary } from "@/lib/review";
import { SECTIONS } from "@/lib/manuscript";
import { FindingCard, type CardActions } from "./FindingCard";

export type Filter = "all" | "needs" | "auto";

interface Props {
  state: ReviewState;
  summary: ReviewSummary;
  scopeFindings: FindingState[];
  showAll: boolean;
  onToggleShowAll: () => void;
  filter: Filter;
  onFilter: (f: Filter) => void;
  passageLabel: { section: string; sub: string | null };
  selectedId: string | null;
  onToggleCard: (id: string) => void;
  actions: CardActions;
  onInteracting: (id: string, active: boolean) => void;
  onStart: () => void;
  canStart: boolean;
  onPointerInside: (inside: boolean) => void;
  onRetryFailed: () => void;
}

export function ReviewPanel(p: Props) {
  const { state, summary } = p;
  const [showSuppressed, setShowSuppressed] = useState(false);
  const started = state.mode !== "idle";

  const visible = p.scopeFindings.filter((f) => f.status !== "idle" && !isSuppressed(f));
  const suppressed = p.scopeFindings.filter(isSuppressed);
  const needsCount = visible.filter(needsEditor).length;
  const autoCount = visible.filter(isAutoApplied).length;
  const filtered = visible.filter((f) => (p.filter === "needs" ? needsEditor(f) || f.id === p.selectedId : p.filter === "auto" ? isAutoApplied(f) : true));

  const done = summary.evaluated + summary.failed;

  return (
    <aside
      className="flex h-full w-[380px] shrink-0 flex-col border-l border-line bg-[#f9f8f2] max-[1360px]:w-[360px]"
      onPointerEnter={() => p.onPointerInside(true)}
      onPointerLeave={() => p.onPointerInside(false)}
      aria-label="Review panel"
    >
      <div className="px-5 pb-0 pt-5">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-[14px] font-semibold tracking-[-0.005em] text-ink">{p.showAll ? "All findings" : "In this passage"}</h2>
          <label className="flex cursor-pointer select-none items-center gap-1.5 text-[12px] text-ink-2 hover:text-ink">
            <input type="checkbox" checked={p.showAll} onChange={p.onToggleShowAll} className="h-3.5 w-3.5 accent-[#66733a]" />
            Show all findings
          </label>
        </div>
        <p className="mt-0.5 truncate text-[12.5px] text-ink-2">
          {p.showAll ? "Whole manuscript, in manuscript order" : (
            <>
              {p.passageLabel.section}
              {p.passageLabel.sub && <span className="text-ink-3"> · {p.passageLabel.sub}</span>}
            </>
          )}
        </p>

        {started && (
          <div className="mt-4 flex items-center gap-4 border-b border-line text-[12.5px]" role="tablist" aria-label="Filter findings">
            {(
              [
                ["all", "All", null],
                ["needs", "Needs you", needsCount],
                ["auto", "Auto-applied", autoCount],
              ] as const
            ).map(([id, label, count]) => (
              <button
                key={id}
                role="tab"
                aria-selected={p.filter === id}
                onClick={() => p.onFilter(id)}
                className={`-mb-px border-b-2 pb-2 transition ${p.filter === id ? "border-olive text-ink" : "border-transparent text-ink-2 hover:text-ink"}`}
              >
                {label}
                {count !== null && count > 0 && <span className="tabular ml-1 text-ink-3">{count}</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      {state.mode === "live" && summary.pending > 0 && (
        <div className="px-5 pt-3">
          <div className="flex items-center justify-between text-[11.5px] text-ink-2">
            <span>OpenJEV is evaluating prepared candidates</span>
            <span className="tabular">
              {done} of {summary.total}
            </span>
          </div>
          <div className="mt-1.5 h-[2px] overflow-hidden rounded-full bg-line-soft">
            <div className="h-full rounded-full bg-olive transition-[width] duration-500" style={{ width: `${(done / summary.total) * 100}%` }} />
          </div>
        </div>
      )}

      {state.mode === "live" && summary.pending === 0 && summary.failed > 0 && (
        <div className="mx-5 mt-3 flex items-center gap-2 rounded-[5px] border border-terra-pale bg-terra-wash px-2.5 py-1.5 text-[11.5px] text-ink-2">
          <span className="h-1.5 w-1.5 rounded-full bg-terra-line" />
          <span className="tabular">
            {summary.failed} not evaluated · nothing was changed
          </span>
          <button type="button" onClick={p.onRetryFailed} className="ml-auto font-medium text-olive-dark underline decoration-olive-soft underline-offset-2 hover:text-olive-deep">
            Retry all
          </button>
        </div>
      )}

      {state.mode === "preview" && (
        <div className="mx-5 mt-3 flex items-center gap-2 rounded-[5px] border border-amber-line/40 bg-amber-wash px-2.5 py-1.5 text-[11.5px] text-amber">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-line" />
          Sample decisions · OpenJEV not connected
        </div>
      )}

      <div className="quiet-scroll min-h-0 flex-1 overflow-y-auto px-5 pb-6 pt-4" id="review-list">
        {!started ? (
          <IntroState onStart={p.onStart} canStart={p.canStart} total={summary.total} />
        ) : (
          <>
            {summary.complete && (
              <div className="card-enter mb-4 rounded-md border border-olive-soft/60 bg-olive-wash px-3.5 py-3">
                <div className="flex items-center gap-2 text-[13px] font-medium text-olive-deep">
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-olive text-paper">
                    <Check size={10} strokeWidth={3} />
                  </span>
                  All current demo findings reviewed
                </div>
                <p className="tabular mt-1 pl-6 text-[12px] text-ink-2">
                  {summary.autoHandled} handled automatically · {summary.reviewedByYou} reviewed by you
                  {summary.suppressed > 0 && <> · {summary.suppressed} not needed</>}
                </p>
              </div>
            )}

            {filtered.length === 0 ? (
              <EmptyScope filter={p.filter} showAll={p.showAll} anyInScope={visible.length > 0} />
            ) : (
              <div className="space-y-2">
                {filtered.map((f, i) => {
                  const block = f.anchor ? state.doc.blocks[f.anchor.blockId] : null;
                  const sectionHeader =
                    p.showAll && (i === 0 || sectionOf(filtered[i - 1], state) !== sectionOf(f, state)) ? SECTIONS.find((s) => s.id === sectionOf(f, state))?.title : null;
                  return (
                    <div key={f.id}>
                      {sectionHeader && <p className={`mb-1.5 text-[10.5px] font-medium uppercase tracking-[0.12em] text-ink-3 ${i === 0 ? "" : "mt-4"}`}>{sectionHeader}</p>}
                      <FindingCard
                        finding={f}
                        candidate={candidateOf(f.id)}
                        blockText={block?.text ?? null}
                        selected={p.selectedId === f.id}
                        onToggle={p.onToggleCard}
                        actions={p.actions}
                        onInteracting={p.onInteracting}
                      />
                    </div>
                  );
                })}
              </div>
            )}

            {suppressed.length > 0 && p.filter === "all" && (
              <div className="mt-5">
                <button
                  type="button"
                  onClick={() => setShowSuppressed((v) => !v)}
                  aria-expanded={showSuppressed}
                  className="flex w-full items-center gap-1.5 text-left text-[12px] text-ink-3 hover:text-ink-2"
                >
                  <ChevronDown size={13} className={`transition-transform ${showSuppressed ? "" : "-rotate-90"}`} />
                  {suppressed.length} proposed edit{suppressed.length > 1 ? "s" : ""} not shown — OpenJEV judged {suppressed.length > 1 ? "them" : "it"} unnecessary
                </button>
                {showSuppressed && (
                  <div className="mt-2 space-y-2">
                    {suppressed.map((f) => (
                      <FindingCard
                        key={f.id}
                        finding={f}
                        candidate={candidateOf(f.id)}
                        blockText={f.anchor ? state.doc.blocks[f.anchor.blockId].text : null}
                        selected={p.selectedId === f.id}
                        onToggle={p.onToggleCard}
                        actions={p.actions}
                        onInteracting={p.onInteracting}
                        muted
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      <footer className="border-t border-line px-5 py-3 text-[11px] leading-relaxed text-ink-3">
        <p className="text-ink-2">Prepared suggestions · Live OpenJEV decisions</p>
        <p>Model confidence is not a guarantee of editorial correctness.</p>
      </footer>
    </aside>
  );
}

function sectionOf(f: FindingState, state: ReviewState) {
  const c = candidateOf(f.id);
  return state.doc.blocks[f.anchor?.blockId ?? c.blockId].sectionId;
}

function IntroState({ onStart, canStart, total }: { onStart: () => void; canStart: boolean; total: number }) {
  return (
    <div className="pt-6">
      <p className="font-serif text-[18px] leading-snug text-ink">Read first. Review when you’re ready.</p>
      <p className="mt-3 text-[13px] leading-relaxed text-ink-2">
        {total} candidate edits have been prepared for this manuscript. Start review and OpenJEV will judge each one: routine corrections are applied for you and marked, likely
        improvements wait for your approval, and anything that could change meaning is left for your judgment.
      </p>
      <ul className="mt-4 space-y-2 text-[12.5px] text-ink-2">
        <li className="flex items-center gap-2.5">
          <span className="inline-block h-3 w-5 rounded-[2px] bg-olive-pale ring-1 ring-olive-soft/40" /> Auto-applied, reversible
        </li>
        <li className="flex items-center gap-2.5">
          <span className="inline-block h-[2px] w-5 bg-amber-line" /> Suggested for your approval
        </li>
        <li className="flex items-center gap-2.5">
          <span className="inline-block w-5 border-b-2 border-dotted border-terra-line" /> Needs your judgment
        </li>
      </ul>
      <button
        type="button"
        onClick={onStart}
        disabled={!canStart}
        className="mt-6 h-9 rounded-md bg-olive px-4 text-[13px] font-medium text-paper shadow-[var(--shadow-hair)] transition hover:bg-olive-dark disabled:opacity-50"
      >
        Start review
      </button>
    </div>
  );
}

function EmptyScope({ filter, showAll, anyInScope }: { filter: Filter; showAll: boolean; anyInScope: boolean }) {
  const text =
    filter === "needs"
      ? anyInScope
        ? "Nothing here needs you right now."
        : "Nothing in this passage needs you."
      : filter === "auto"
        ? "No automatic corrections here."
        : showAll
          ? "No findings."
          : "No findings in this passage.";
  return (
    <div className="flex items-center gap-2 py-6 text-[12.5px] text-ink-3">
      <span className="h-px w-5 bg-line" />
      {text}
    </div>
  );
}
