"use client";

import { Check, ChevronDown, FileQuestion, PenLine, RotateCw, Undo2, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { kindOf, passOf, type Candidate } from "@/lib/candidates";
import { effectiveDpi, type FigureSpec, type FigureState } from "@/lib/figures";
import { FigureGraphic, REGION_CROP } from "./FigureView";
import { AiTrace, requestAssist, type AiStatus } from "./Assist";
import { REWRITE_CATEGORIES } from "@/lib/ai/tasks";
import type { AssistResponse } from "@/lib/ai/router";
import { wordDiff } from "@/lib/diff";
import { ERROR_COPY } from "@/lib/openjev/types";
import { ROUTES } from "@/lib/policy";
import { contextAround, ROUTE_LABEL, statusLabel, TONE_DOT, TONE_TEXT } from "@/lib/present";
import { treatmentOf, type FindingState } from "@/lib/review";

export interface CardActions {
  keep: (id: string) => void;
  undo: (id: string) => void;
  apply: (id: string, text?: string) => void;
  dismiss: (id: string) => void;
  markReviewed: (id: string) => void;
  editPassage: (id: string) => void;
  openQuery: (id: string) => void;
  retry: (id: string) => void;
  applyEditorText: (id: string, text: string) => void;
}

interface Props {
  finding: FindingState;
  candidate: Candidate;
  blockText: string | null;
  /** Current figure specs, for before/after previews of figure findings. */
  figures: FigureState;
  /** Generation availability; null while unknown. */
  ai: AiStatus | null;
  selected: boolean;
  /** Outside the passage being read: fade back. */
  dim?: boolean;
  /** Nearest the reading line: gently emphasised. */
  active?: boolean;
  onToggle: (id: string) => void;
  actions: CardActions;
  onInteracting: (id: string, active: boolean) => void;
  muted?: boolean;
}

export function FindingCard({ finding: f, candidate: c, blockText, figures, ai, selected, dim = false, active = false, onToggle, actions, onInteracting, muted }: Props) {
  const status = statusLabel(f);
  const treatment = treatmentOf(f);
  const [editText, setEditText] = useState<string | null>(null);
  const [whyOpen, setWhyOpen] = useState(false);
  const editRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    onInteracting(f.id, editText !== null);
    return () => onInteracting(f.id, false);
  }, [editText, f.id, onInteracting]);

  useEffect(() => {
    if (!selected) {
      setEditText(null);
    }
  }, [selected]);

  // Expand/collapse: keep the body mounted while it animates closed.
  const [expanded, setExpanded] = useState(selected);
  const [renderBody, setRenderBody] = useState(selected);
  useEffect(() => {
    if (selected) {
      setRenderBody(true);
      let inner = 0;
      const outer = requestAnimationFrame(() => (inner = requestAnimationFrame(() => setExpanded(true))));
      return () => {
        cancelAnimationFrame(outer);
        cancelAnimationFrame(inner);
      };
    }
    setExpanded(false);
    const t = setTimeout(() => setRenderBody(false), 520);
    return () => clearTimeout(t);
  }, [selected]);

  // What text should the before/after compare?
  const shownReplacement = f.appliedText ?? c.replacement;
  const anchorText = f.anchor && blockText !== null ? blockText.slice(f.anchor.start, f.anchor.end) : null;
  const ctx = f.anchor && blockText !== null ? contextAround(blockText, f.anchor.start, f.anchor.end) : { before: "", after: "" };
  const resolvedMuted = muted || ["undone", "dismissed", "reviewed", "superseded"].includes(f.resolution);
  const busy = f.status === "waiting" || f.status === "evaluating";

  return (
    <div
      id={`card-${f.id}`}
      data-dim={dim || undefined}
      className={`card-enter card-motion group/card relative rounded-md border ${
        selected
          ? "border-olive-soft/80 bg-olive-wash shadow-[var(--shadow-hair)]"
          : active
            ? "border-olive-soft/60 bg-paper shadow-[var(--shadow-lift)]"
            : "border-line-soft bg-paper hover:border-line"
      } ${dim && !selected ? "card-dim" : ""}`}
    >
      <span
        className={`absolute -left-px bottom-2 top-2 w-[2px] origin-center rounded-full bg-olive transition-[opacity,transform] duration-500 ease-apple ${
          selected || active ? "scale-y-100 opacity-100" : "scale-y-50 opacity-0"
        }`}
        aria-hidden
      />
      <button
        type="button"
        onClick={() => onToggle(f.id)}
        aria-expanded={selected}
        className="block w-full rounded-md px-3.5 pb-2.5 pt-2.5 text-left"
      >
        <div className="flex items-center gap-2">
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${TONE_DOT[status.tone]} ${f.status === "evaluating" ? "pulse-dot" : ""}`} />
          <span className={`truncate text-[12.5px] font-medium ${resolvedMuted ? "text-ink-2" : "text-ink"}`}>{c.label}</span>
          <span className="shrink-0 text-[10px] font-medium uppercase tracking-[0.1em] text-ink-3">{passOf(c)}</span>
          <span className={`ml-auto flex items-center gap-1 text-[11.5px] ${TONE_TEXT[status.tone]}`}>
            {(f.resolution === "kept" || f.resolution === "applied" || f.resolution === "applied_edited" || f.resolution === "reviewed") && <Check size={12} strokeWidth={2} />}
            {status.text}
          </span>
        </div>
        <Collapse open={!expanded}>
          <div className={`mt-1 truncate pl-3.5 font-serif text-[14.5px] leading-snug ${resolvedMuted ? "text-ink-3" : "text-ink-2"}`}>
            {kindOf(c) === "structure" ? (
              <span>
                “{c.original}”
                {c.structure?.rid && (
                  <>
                    <span className="mx-1.5 font-sans text-[12px] text-ink-3">→</span>
                    <span className="font-mono text-[12.5px] text-ink">xref {c.structure.rid}</span>
                  </>
                )}
              </span>
            ) : (
              <CompactPreview original={c.original} replacement={shownReplacement} />
            )}
          </div>
        </Collapse>
      </button>

      {renderBody && (
        <Collapse open={expanded}>
        <div className="px-3.5 pb-3.5">
          {kindOf(c) === "figure" ? (
            <FigureDiff candidate={c} finding={f} figures={figures} replacementLabel={treatment === "SUGGEST" ? "Suggestion" : "Proposed"} />
          ) : kindOf(c) === "structure" ? (
            <StructureDiff candidate={c} before={ctx.before} after={ctx.after} />
          ) : shownReplacement !== null ? (
            <DiffRows
              before={ctx.before}
              after={ctx.after}
              original={c.original}
              replacement={shownReplacement}
              replacementLabel={f.appliedBy === "editor" ? (f.resolution === "applied_edited" ? "Your edit" : "Applied") : treatment === "AUTO_APPLY" ? "Correction" : treatment === "SUGGEST" ? "Suggestion" : "Proposed"}
            />
          ) : (
            <div className="rounded-[5px] border border-line-soft bg-paper px-3 py-2.5 font-serif text-[15px] leading-relaxed text-ink-2">
              {ctx.before}
              <span className="rounded-[2px] bg-terra-wash text-ink underline decoration-terra-line decoration-dotted decoration-2 underline-offset-4">{anchorText ?? c.original}</span>
              {ctx.after}
            </div>
          )}

          <p className="mt-2.5 text-[13px] leading-relaxed text-ink-2">{c.explanation}</p>

          {f.resolution === "applied_edited" && (
            <p className="mt-2 text-[12.5px] leading-relaxed text-ink-2">
              Your wording was applied as a human-authored edit. OpenJEV evaluated the original suggestion, not this text.
            </p>
          )}
          {f.note && <p className="mt-2 text-[12.5px] leading-relaxed text-terra">{f.note}</p>}

          {f.status === "failed" && f.error && (
            <div className="mt-3 rounded-[5px] border border-terra-pale bg-terra-wash px-3 py-2 text-[12.5px] leading-relaxed text-ink-2">
              <span className="font-medium text-terra">Not evaluated.</span> {ERROR_COPY[f.error.kind]}
              {f.error.status ? <span className="tabular text-ink-3"> (HTTP {f.error.status})</span> : null} Nothing was changed.
            </div>
          )}

          {editText !== null && (
            <div className="mt-3">
              <label htmlFor={`edit-${f.id}`} className="mb-1 block text-[11px] font-medium uppercase tracking-[0.1em] text-ink-3">
                Your wording
              </label>
              <textarea
                id={`edit-${f.id}`}
                ref={editRef}
                value={editText}
                rows={2}
                onChange={(e) => setEditText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setEditText(null);
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && editText.length > 0) {
                    e.preventDefault();
                    actions.apply(f.id, editText);
                  }
                }}
                className="block w-full resize-y rounded-[5px] border border-line bg-paper px-2.5 py-1.5 font-serif text-[15px] leading-snug text-ink outline-none focus:border-olive-soft focus:ring-2 focus:ring-olive-pale"
              />
              <p className="mt-1.5 text-[11.5px] leading-snug text-ink-3">Applied as your edit, not as an OpenJEV-approved suggestion.</p>
              {c.figure?.prop === "altText" && ai?.configured && (
                <AltTextDraft
                  finding={f}
                  candidate={c}
                  figures={figures}
                  caption={blockText ?? ""}
                  model={ai.routes.alt_text?.model}
                  onDraft={(t) => setEditText(t)}
                />
              )}
            </div>
          )}

          <div className="mt-3.5 flex flex-wrap items-center gap-1.5">{renderActions()}</div>

          {treatment === "MANUAL_REVIEW" &&
            f.resolution === "open" &&
            kindOf(c) === "text" &&
            REWRITE_CATEGORIES.has(c.category) &&
            f.anchor &&
            blockText !== null &&
            ai?.configured && (
              <RewriteOptions
                finding={f}
                candidate={c}
                paragraph={blockText}
                model={ai.routes.rewrite_options?.model}
                onUse={(t) => actions.applyEditorText(f.id, t)}
              />
            )}

          {(f.outcome || f.status === "failed" || f.status === "stale") && (
            <div className="mt-3 border-t border-line-soft pt-2.5">
              <button
                type="button"
                onClick={() => setWhyOpen((v) => !v)}
                aria-expanded={whyOpen}
                className="flex items-center gap-1 text-[12px] text-olive-dark underline decoration-olive-soft/70 underline-offset-[3px] hover:text-olive-deep"
              >
                Why this treatment?
                <ChevronDown size={13} className={`transition-transform ${whyOpen ? "rotate-180" : ""}`} />
              </button>
              {whyOpen && <WhyTreatment finding={f} />}
            </div>
          )}
        </div>
        </Collapse>
      )}
    </div>
  );

  function renderActions(): ReactNode {
    if (busy) {
      return (
        <span className="flex items-center gap-2 text-[12.5px] text-ink-2">
          <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-olive" />
          {f.status === "evaluating" ? "OpenJEV is evaluating this finding…" : "Waiting for evaluation"}
        </span>
      );
    }
    if (f.status === "failed") {
      return (
        <Btn kind="primary" onClick={() => actions.retry(f.id)} icon={<RotateCw size={13} />}>
          Retry
        </Btn>
      );
    }
    if (f.status === "stale" && f.resolution === "open") {
      return (
        <>
          <Btn kind="primary" onClick={() => actions.retry(f.id)} icon={<RotateCw size={13} />}>
            Re-evaluate
          </Btn>
          {c.authorQuery && <Btn kind="quiet" onClick={() => actions.openQuery(f.id)} icon={<FileQuestion size={13} />}>Draft author query</Btn>}
        </>
      );
    }
    const auto = f.appliedBy === "system";
    if (f.appliedText !== undefined && ["open", "kept", "applied", "applied_edited"].includes(f.resolution)) {
      return (
        <>
          {auto && f.resolution === "open" && (
            <Btn kind="primary" onClick={() => actions.keep(f.id)} icon={<Check size={13} />}>
              Keep
            </Btn>
          )}
          <Btn onClick={() => actions.undo(f.id)} icon={<Undo2 size={13} />}>
            Undo
          </Btn>
        </>
      );
    }
    if (f.resolution !== "open") {
      if (f.resolution === "reviewed" && c.authorQuery) {
        return <Btn kind="quiet" onClick={() => actions.openQuery(f.id)} icon={<FileQuestion size={13} />}>View author query</Btn>;
      }
      return null;
    }
    if (treatment === "SUGGEST") {
      if (editText !== null) {
        return (
          <>
            <Btn kind="primary" disabled={editText.length === 0} onClick={() => actions.apply(f.id, editText)} icon={<Check size={13} />}>
              Apply your wording
            </Btn>
            <Btn onClick={() => setEditText(null)}>Cancel</Btn>
          </>
        );
      }
      return (
        <>
          <Btn kind="primary" onClick={() => actions.apply(f.id)} icon={<Check size={13} />}>
            Apply
          </Btn>
          {(kindOf(c) === "text" || c.figure?.prop === "altText") && (
            <Btn
              onClick={() => {
                setEditText(kindOf(c) === "figure" ? String(c.figure?.to ?? "") : (c.replacement ?? ""));
                requestAnimationFrame(() => editRef.current?.focus());
              }}
              icon={<PenLine size={13} />}
            >
              Edit suggestion
            </Btn>
          )}
          <Btn kind="quiet" onClick={() => actions.dismiss(f.id)} icon={<X size={13} />}>
            Dismiss
          </Btn>
        </>
      );
    }
    if (treatment === "MANUAL_REVIEW") {
      // Figures can't be fixed with "Edit passage", so the editor may apply the proposed change
      // themselves — recorded as their decision, not the system's.
      const figureFix = kindOf(c) === "figure" && c.replacement !== null;
      const editable = kindOf(c) !== "figure";
      return (
        <>
          <Btn kind="primary" onClick={() => actions.markReviewed(f.id)} icon={<Check size={13} />}>
            Mark reviewed
          </Btn>
          {figureFix && (
            <Btn onClick={() => actions.apply(f.id)} icon={<PenLine size={13} />}>
              Apply proposed change
            </Btn>
          )}
          {editable && (
            <Btn onClick={() => actions.editPassage(f.id)} icon={<PenLine size={13} />}>
              Edit passage
            </Btn>
          )}
          {c.authorQuery && (
            <Btn kind="quiet" onClick={() => actions.openQuery(f.id)} icon={<FileQuestion size={13} />}>
              Draft author query
            </Btn>
          )}
        </>
      );
    }
    return null;
  }
}

/** Height + opacity transition that feels native: rows animate from 0fr to 1fr. */
function Collapse({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <div className="collapse-motion grid" style={{ gridTemplateRows: open ? "1fr" : "0fr", opacity: open ? 1 : 0 }} aria-hidden={!open || undefined}>
      <div className="min-h-0 overflow-hidden">{children}</div>
    </div>
  );
}

function Btn({ children, onClick, icon, kind = "ghost", disabled }: { children: ReactNode; onClick: () => void; icon?: ReactNode; kind?: "primary" | "ghost" | "quiet"; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`inline-flex h-[30px] items-center gap-1.5 rounded-[5px] px-2.5 text-[12.5px] font-medium transition disabled:opacity-40 ${
        kind === "primary"
          ? "bg-olive text-paper hover:bg-olive-dark"
          : kind === "quiet"
            ? "px-2 text-ink-2 hover:bg-olive-pale/60 hover:text-ink"
            : "border border-line bg-paper text-ink hover:border-olive-soft hover:bg-olive-wash"
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

/* ---------------- Before / after ---------------- */

function renderChange(text: string, kind: "removed" | "added") {
  const isWs = text.trim() === "" && text.length > 0;
  const cls =
    kind === "removed"
      ? "rounded-[2px] bg-[#f3ebe4] text-ink line-through decoration-ink-3/60 decoration-1"
      : "rounded-[2px] bg-olive-pale font-medium text-olive-deep";
  if (isWs) {
    return (
      <span className={`ws-mark ${kind === "removed" ? "rounded-[2px] bg-[#f3ebe4]" : "rounded-[2px] bg-olive-pale"} px-[1px]`} title={`${text.length} space${text.length > 1 ? "s" : ""}`}>
        {"·".repeat(text.length)}
      </span>
    );
  }
  return <span className={`${cls} px-[1px]`}>{text}</span>;
}

function DiffRows({ before, after, original, replacement, replacementLabel }: { before: string; after: string; original: string; replacement: string; replacementLabel: string }) {
  const ops = wordDiff(original, replacement);
  const row = (side: "original" | "replacement") =>
    ops.map((op, i) => {
      if (op.type === "equal") return <span key={i}>{op.text}</span>;
      if (side === "original" && op.type === "removed") return <span key={i}>{renderChange(op.text, "removed")}</span>;
      if (side === "replacement" && op.type === "added") return <span key={i}>{renderChange(op.text, "added")}</span>;
      return null;
    });
  return (
    <div className="overflow-hidden rounded-[5px] border border-line-soft bg-paper">
      <div className="px-3 pb-2 pt-1.5">
        <span className="text-[10px] font-medium uppercase tracking-[0.11em] text-ink-3">Original</span>
        <p className="mt-0.5 font-serif text-[15px] leading-[1.55] text-ink-2">
          {before}
          <span className="text-ink">{row("original")}</span>
          {after}
        </p>
      </div>
      <div className="border-t border-line-soft px-3 pb-2 pt-1.5">
        <span className="text-[10px] font-medium uppercase tracking-[0.11em] text-olive-dark">{replacementLabel}</span>
        <p className="mt-0.5 font-serif text-[15px] leading-[1.55] text-ink-2">
          {before}
          <span className="text-ink">{row("replacement")}</span>
          {after}
        </p>
      </div>
    </div>
  );
}

/** On-demand rewrite options for a meaning-sensitive passage (frontier model, then verified). */
function RewriteOptions({ finding: f, candidate: c, paragraph, model, onUse }: { finding: FindingState; candidate: Candidate; paragraph: string; model?: string; onUse: (text: string) => void }) {
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");
  const [res, setRes] = useState<AssistResponse | null>(null);
  const ask = async () => {
    setState("loading");
    const r = await requestAssist({ task: "rewrite_options", findingId: f.id, paragraph, anchorStart: f.anchor!.start });
    setRes(r);
    setState("done");
  };
  if (state === "idle") {
    return (
      <div className="mt-3 border-t border-line-soft pt-2.5">
        <button type="button" onClick={ask} className="text-[12px] text-olive-dark underline decoration-olive-soft/70 underline-offset-[3px] hover:text-olive-deep" title={`Sends only this passage to ${model ?? "OpenAI"}; options are then checked by safety rules and OpenJEV.`}>
          Suggest rewrites
        </button>
        <span className="ml-1.5 text-[11px] text-ink-3">· {model ?? "frontier model"} for "{c.label.toLowerCase()}", checked by rules and OpenJEV</span>
      </div>
    );
  }
  return (
    <div className="fade-in mt-3 border-t border-line-soft pt-2.5">
      <p className="text-[10.5px] font-medium uppercase tracking-[0.1em] text-ink-3">Rewrite options</p>
      {state === "loading" ? (
        <p className="mt-2 flex items-center gap-2 text-[12.5px] text-ink-2">
          <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-olive" /> Asking {model ?? "the frontier model"}, then checking each option…
        </p>
      ) : res && res.ok && res.result.task === "rewrite_options" ? (
        <ul className="mt-1.5 space-y-1.5">
          {res.result.options.map((o) => (
            <li key={o.text} className="rounded-[5px] border border-line-soft bg-paper px-2.5 py-2">
              <p className="font-serif text-[14.5px] leading-snug text-ink">{o.text}</p>
              <div className="mt-1 flex items-center gap-2 text-[11.5px] text-ink-3">
                <span className="truncate">{o.note}</span>
                {o.meaningPreserved !== null && (
                  <span className={`tabular shrink-0 ${o.meaningPreserved >= 0.8 ? "text-olive-dark" : "text-terra"}`} title="OpenJEV: probability the option preserves meaning and claim strength">
                    meaning {o.meaningPreserved.toFixed(2)}
                  </span>
                )}
                <button type="button" onClick={() => onUse(o.text)} className="ml-auto shrink-0 rounded-[4px] px-1.5 py-0.5 font-medium text-olive-dark hover:bg-olive-pale">
                  Use this
                </button>
              </div>
            </li>
          ))}
          {res.result.rejected.length > 0 && (
            <li className="text-[11.5px] text-ink-3">
              {res.result.rejected.length} option{res.result.rejected.length > 1 ? "s" : ""} withheld: {res.result.rejected.map((r) => r.reason).join("; ")}
            </li>
          )}
        </ul>
      ) : (
        <p className="mt-1.5 text-[12.5px] text-terra">{res && !res.ok ? res.error.message : "No options."} Nothing was changed.</p>
      )}
      {res && <AiTrace response={res} />}
    </div>
  );
}

/** Draft alt text from the figure's data (standard tier, validated, escalates once). */
function AltTextDraft({ finding: f, candidate: c, figures, caption, model, onDraft }: { finding: FindingState; candidate: Candidate; figures: FigureState; caption: string; model?: string; onDraft: (t: string) => void }) {
  const [loading, setLoading] = useState(false);
  const [res, setRes] = useState<AssistResponse | null>(null);
  const spec = figures[c.figure!.figureId];
  const draft = async () => {
    setLoading(true);
    const r = await requestAssist({ task: "alt_text", findingId: f.id, caption, figure: { xAxisLabel: spec.xAxisLabel, yAxisLabel: spec.yAxisLabel } });
    setRes(r);
    setLoading(false);
    if (r.ok && r.result.task === "alt_text") onDraft(r.result.text);
  };
  return (
    <div className="mt-2">
      <button type="button" disabled={loading} onClick={draft} className="text-[12px] text-olive-dark underline decoration-olive-soft/70 underline-offset-[3px] hover:text-olive-deep disabled:opacity-50">
        {loading ? "Drafting…" : "Draft from figure data"}
      </button>
      <span className="ml-1.5 text-[11px] text-ink-3">· {model ?? "standard model"}</span>
      {res && !res.ok && <p className="mt-1 text-[12px] text-terra">{res.error.message}</p>}
      {res && <AiTrace response={res} />}
    </div>
  );
}

/** Before/after close-ups of the part of the figure that changes. */
function FigureDiff({ candidate: c, finding: f, figures, replacementLabel }: { candidate: Candidate; finding: FindingState; figures: FigureState; replacementLabel: string }) {
  const fig = c.figure!;
  const spec = figures[fig.figureId];
  const crop = REGION_CROP[spec.kind][fig.region];
  const applied = f.appliedText !== undefined;
  const dpi = effectiveDpi(spec);

  if (fig.prop === "altText" || fig.prop === "source") {
    return (
      <div className="overflow-hidden rounded-[5px] border border-line-soft bg-paper">
        <FigureGraphic spec={spec} crop={crop} className="block h-auto w-full" />
        <div className="border-t border-line-soft px-3 py-2 text-[12.5px] leading-relaxed text-ink-2">
          {fig.prop === "source" ? (
            <span className="tabular">
              {spec.source.format} · {spec.source.pxWidth?.toLocaleString()} × {spec.source.pxHeight?.toLocaleString()} px · printed at {spec.source.printWidthMm} mm ={" "}
              <span className="font-medium text-terra">{dpi} dpi</span> <span className="text-ink-3">(300 required)</span>
            </span>
          ) : (
            <>
              <span className="mb-0.5 block text-[10px] font-medium uppercase tracking-[0.11em] text-olive-dark">{applied ? "Alt text" : replacementLabel}</span>
              <span className="font-serif text-[14.5px] text-ink">{applied ? spec.altText : String(fig.to)}</span>
            </>
          )}
        </div>
      </div>
    );
  }
  const before: FigureSpec = { ...spec, [fig.prop]: fig.from };
  const after: FigureSpec = { ...spec, [fig.prop]: fig.to };
  return (
    <div className="grid grid-cols-2 gap-2">
      {[
        ["Original", before],
        [applied ? "Applied" : replacementLabel, after],
      ].map(([label, sp]) => (
        <div key={label as string} className="overflow-hidden rounded-[5px] border border-line-soft bg-paper">
          <span className={`block px-2 pt-1.5 text-[10px] font-medium uppercase tracking-[0.11em] ${label === "Original" ? "text-ink-3" : "text-olive-dark"}`}>{label as string}</span>
          <FigureGraphic spec={sp as FigureSpec} crop={crop} className="block h-[96px] w-full" />
        </div>
      ))}
      <p className="col-span-2 font-serif text-[14px] text-ink-2">
        <CompactPreview original={c.original} replacement={c.replacement} />
      </p>
    </div>
  );
}

/** Before/after of an XML tagging decision. */
function StructureDiff({ candidate: c, before, after }: { candidate: Candidate; before: string; after: string }) {
  return (
    <div className="overflow-hidden rounded-[5px] border border-line-soft bg-paper">
      <div className="px-3 pb-2 pt-1.5">
        <span className="text-[10px] font-medium uppercase tracking-[0.11em] text-ink-3">Text</span>
        <p className="mt-0.5 font-serif text-[15px] leading-[1.55] text-ink-2">
          {before}
          <span className="text-ink">{c.original}</span>
          {after}
        </p>
      </div>
      <div className="border-t border-line-soft px-3 pb-2 pt-1.5">
        <span className="text-[10px] font-medium uppercase tracking-[0.11em] text-olive-dark">{c.replacement ? "XML" : "XML — cannot link"}</span>
        <p className="xml-code mt-1 break-words text-[12px] leading-[1.6] text-ink">
          {c.replacement ? (
            <>
              <span className="xml-link text-olive-dark">{`<xref ref-type="${c.structure?.refType}" rid="${c.structure?.rid}">`}</span>
              <span className="xml-link">{c.original}</span>
              <span className="xml-link text-olive-dark">{"</xref>"}</span>
            </>
          ) : (
            <span className="text-ink-2">{c.original} <span className="italic text-ink-3">{"<!-- no matching target -->"}</span></span>
          )}
        </p>
      </div>
    </div>
  );
}

function CompactPreview({ original, replacement }: { original: string; replacement: string | null }) {
  if (replacement === null) return <span>“{original}”</span>;
  if (original.trim() === replacement.trim() || original.replace(/\s+/g, " ") === replacement.replace(/\s+/g, " ")) {
    return <span>Double space → single space</span>;
  }
  if (original.length <= 16 && replacement.length <= 16) {
    return (
      <span>
        <span className="text-ink-2">{original}</span>
        <span className="mx-1.5 font-sans text-[12px] text-ink-3">→</span>
        <span className="text-ink">{replacement}</span>
      </span>
    );
  }
  // Trim words shared at both ends so the preview shows only what changes.
  const a = original.split(" ");
  const b = replacement.split(" ");
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  let j = 0;
  while (j < a.length - i && j < b.length - i && a[a.length - 1 - j] === b[b.length - 1 - j]) j++;
  // A pure insertion or deletion needs a neighbouring word to make sense.
  if (i === a.length - j || i === b.length - j) {
    i = Math.max(0, i - 1);
    j = Math.max(0, j - 1);
  }
  const from = a.slice(i, a.length - j).join(" ");
  const to = b.slice(i, b.length - j).join(" ");
  return (
    <span>
      <span className="text-ink-2">{from}</span>
      <span className="mx-1.5 font-sans text-[12px] text-ink-3">→</span>
      <span className="text-ink">{to}</span>
    </span>
  );
}

/* ---------------- Why this treatment? ---------------- */

const SHORT_ROUTE = { AUTO_APPLY: "Auto-apply", SUGGEST: "Suggest", MANUAL_REVIEW: "Manual review", NO_CHANGE: "No change" } as const;

function fmt(n: number | null | undefined) {
  return n === null || n === undefined ? "—" : n.toFixed(2);
}

function WhyTreatment({ finding: f }: { finding: FindingState }) {
  const [tech, setTech] = useState(false);
  const d = f.decision;
  const o = f.outcome;
  const sample = f.source === "sample";

  return (
    <div className="fade-in mt-2.5 space-y-3 text-[12.5px] leading-relaxed text-ink-2">
      {f.status === "failed" && <p>OpenJEV did not return a usable decision, so the prototype has not made one. The manuscript is unchanged.</p>}
      {f.status === "stale" && <p>{f.note ?? "The passage changed after this decision."} The previous decision is no longer applied.</p>}

      {d && o && (
        <>
          <div className={`rounded-[5px] px-2.5 py-1.5 text-[11.5px] ${sample ? "bg-amber-wash text-amber" : "bg-olive-pale/70 text-olive-dark"}`}>
            {sample ? (
              <>Sample decision · fixture values written for preview mode, not OpenJEV output</>
            ) : (
              <>
                Live OpenJEV · <span className="tabular">{f.technical?.model ?? "openjev"}</span>
                {f.technical?.latencyMs !== undefined && <span className="tabular"> · {f.technical.latencyMs} ms</span>}
              </>
            )}
          </div>

          <p className="border-l-2 border-olive-soft/70 pl-2.5 text-ink">
            {o.summary}
          </p>
          <div>
            <p className="text-ink">
              {sample ? "Sample route" : "OpenJEV proposed"}: <span className="font-medium">{ROUTE_LABEL[o.openjevRoute]}</span>
              <span className="tabular text-ink-2"> · confidence {fmt(d.routeConfidence)}</span>
            </p>
            <div className="mt-2 space-y-1">
              {ROUTES.map((r) => (
                <div key={r} className="grid grid-cols-[92px_1fr_34px] items-center gap-2">
                  <span className={r === d.route ? "text-ink" : ""}>{SHORT_ROUTE[r]}</span>
                  <span className="h-[3px] overflow-hidden rounded-full bg-line-soft">
                    <span className={`block h-full rounded-full ${r === d.route ? "bg-olive" : "bg-olive-soft/60"}`} style={{ width: `${Math.round(d.routeProbabilities[r] * 100)}%` }} />
                  </span>
                  <span className="tabular text-right">{fmt(d.routeProbabilities[r])}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5">
            <span>Finding valid (yes probability)</span>
            <span className="tabular text-ink">{fmt(d.findingValid)}</span>
            <span>Meaning preserved (yes probability)</span>
            <span className="tabular text-ink">{d.meaningPreserved === null ? "not asked" : fmt(d.meaningPreserved)}</span>
          </div>

          {o.checks.length > 0 && (
            <div className="space-y-2">
              {(["auto", "suggest", "suppress"] as const).map((g) => {
                const list = o.checks.filter((c) => c.group === g);
                if (list.length === 0) return null;
                return (
                  <div key={g}>
                    <p className="mb-1 text-[10.5px] font-medium uppercase tracking-[0.1em] text-ink-3">
                      {g === "auto" ? "Safety rules · automatic application" : g === "suggest" ? "Safety rules · suggestion" : "Safety rules · suppression"}
                    </p>
                    <ul className="space-y-0.5">
                      {list.map((c) => (
                        <li key={`${g}-${c.id}`} className="flex items-start gap-1.5">
                          {c.passed ? <Check size={12} className="mt-[3px] shrink-0 text-olive" /> : <X size={12} className="mt-[3px] shrink-0 text-terra" />}
                          <span className={c.passed ? "" : "text-ink"}>{c.label}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}

          {o.protectedHits.length > 0 && (
            <p className="text-[11.5px] text-ink-3">
              Protected content in this change: {o.protectedHits.map((h) => `${h.kind.replace(/_/g, " ")} (“${h.detail}”)`).join(", ")}
            </p>
          )}
        </>
      )}

      {(f.technical || f.error || (sample && d)) && (
        <div>
          <button type="button" onClick={() => setTech((v) => !v)} className="flex items-center gap-1 text-[11.5px] text-ink-3 hover:text-ink-2" aria-expanded={tech}>
            Technical details
            <ChevronDown size={12} className={`transition-transform ${tech ? "rotate-180" : ""}`} />
          </button>
          {tech && (
            <pre className="quiet-scroll mt-1.5 max-h-72 overflow-auto rounded-[5px] border border-line-soft bg-ivory/70 p-2.5 font-mono text-[10.5px] leading-snug text-ink-2">
              {JSON.stringify(
                sample
                  ? { source: "sample fixture (not OpenJEV output)", decision: d }
                  : { error: f.error, requestId: f.technical?.requestId ?? f.error?.requestId, usage: f.technical?.usage, request: f.technical?.request, response: f.technical?.response },
                null,
                2,
              )}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
