"use client";

import { Check, Copy, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Candidate } from "@/lib/candidates";
import { THRESHOLDS } from "@/lib/policy";
import { STYLE_PROFILE } from "@/lib/style-profile";

function Modal({ title, subtitle, onClose, children, width = 520 }: { title: string; subtitle?: string; onClose: () => void; children: ReactNode; width?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    // Return focus to wherever it was when the dialog opened.
    const prev = document.activeElement as HTMLElement | null;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && closeRef.current();
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("keydown", esc);
      prev?.focus?.({ preventScroll: true });
    };
  }, []);
  return (
    <div className="fade-in fixed inset-0 z-50 flex items-start justify-center bg-[#25251f]/20 pt-[12vh]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title} className="card-enter max-h-[76vh] overflow-hidden rounded-lg border border-line bg-paper shadow-[var(--shadow-pop)]" style={{ width }}>
        <div className="flex items-start justify-between border-b border-line-soft px-5 pb-3 pt-4">
          <div>
            <h2 className="text-[14px] font-semibold text-ink">{title}</h2>
            {subtitle && <p className="mt-0.5 text-[12.5px] text-ink-2">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="-mr-1.5 flex h-7 w-7 items-center justify-center rounded-md text-ink-2 hover:bg-ivory hover:text-ink">
            <X size={15} />
          </button>
        </div>
        <div className="quiet-scroll max-h-[calc(76vh-64px)] overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

export function QueryDialog({ candidate, draft, onSave, onClose }: { candidate: Candidate; draft: string; onSave: (text: string) => void; onClose: () => void }) {
  const [text, setText] = useState(draft);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
  }, []);
  return (
    <Modal title="Author query" subtitle={`${candidate.label} · prepared draft — edit as needed`} onClose={onClose}>
      <div className="px-5 py-4">
        <textarea
          ref={ref}
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={6}
          className="block w-full resize-y rounded-md border border-line bg-paper px-3 py-2.5 font-serif text-[15.5px] leading-relaxed text-ink outline-none focus:border-olive-soft focus:ring-2 focus:ring-olive-pale"
        />
        <p className="mt-2 text-[11.5px] text-ink-3">This prototype does not send queries. Your draft is kept with the finding until you reset the demo.</p>
      </div>
      <div className="flex items-center gap-2 border-t border-line-soft px-5 py-3">
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(text).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1400);
            });
          }}
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line px-3 text-[12.5px] text-ink hover:bg-olive-wash"
        >
          {copied ? <Check size={13} /> : <Copy size={13} />}
          {copied ? "Copied" : "Copy"}
        </button>
        <div className="ml-auto flex gap-2">
          <button type="button" onClick={onClose} className="h-8 rounded-md px-3 text-[12.5px] text-ink-2 hover:bg-ivory hover:text-ink">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              onSave(text);
              onClose();
            }}
            className="h-8 rounded-md bg-olive px-3.5 text-[12.5px] font-medium text-paper hover:bg-olive-dark"
          >
            Save draft
          </button>
        </div>
      </div>
    </Modal>
  );
}

export function SettingsDialog({
  onClose,
  configured,
  model,
  mode,
  onPreview,
}: {
  onClose: () => void;
  configured: boolean | null;
  model: string;
  mode: "idle" | "live" | "preview";
  onPreview: () => void;
}) {
  const row = (k: string, v: ReactNode) => (
    <div className="grid grid-cols-[150px_1fr] gap-3 py-1 text-[12.5px]">
      <span className="text-ink-2">{k}</span>
      <span className="text-ink">{v}</span>
    </div>
  );
  return (
    <Modal title="Demo settings" subtitle="What is prepared, what is live, and the rules applied" onClose={onClose} width={600}>
      <section className="px-5 py-4">
        <h3 className="mb-2 text-[10.5px] font-medium uppercase tracking-[0.12em] text-ink-3">Decisions</h3>
        {row("Server API key", configured === null ? "Checking…" : configured ? "Configured (never sent to the browser)" : "Not configured")}
        {row("Model", <span className="tabular">{model}</span>)}
        {row("Current mode", mode === "idle" ? "Not started" : mode === "live" ? "Live OpenJEV decisions" : "Sample decisions · OpenJEV not connected")}
        {row("Candidate edits", "Prepared in advance (original, replacement, explanation, optional author query)")}
        {row("Routing", "OpenJEV’s live answers, bounded by the application’s safety policy")}
        {mode === "idle" && (
          <div className="mt-3 flex items-center gap-3 rounded-md bg-ivory px-3 py-2.5 text-[12px] text-ink-2">
            <span className="flex-1">Explore the interface without an API key using deterministic sample data, clearly labelled as such.</span>
            <button
              type="button"
              onClick={() => {
                onPreview();
                onClose();
              }}
              className="h-8 shrink-0 rounded-md border border-line bg-paper px-3 text-[12.5px] text-ink hover:border-olive-soft hover:bg-olive-wash"
            >
              Preview with sample decisions
            </button>
          </div>
        )}
      </section>

      <section className="border-t border-line-soft px-5 py-4">
        <h3 className="mb-2 text-[10.5px] font-medium uppercase tracking-[0.12em] text-ink-3">Routing thresholds</h3>
        <p className="mb-2 text-[12px] text-ink-2">Illustrative prototype values — not validated production thresholds.</p>
        <table className="tabular w-full text-[12.5px]">
          <thead>
            <tr className="text-left text-ink-3">
              <th className="py-1 font-normal" />
              <th className="py-1 font-normal">Route conf.</th>
              <th className="py-1 font-normal">Finding valid</th>
              <th className="py-1 font-normal">Meaning preserved</th>
            </tr>
          </thead>
          <tbody className="text-ink">
            <tr className="border-t border-line-soft">
              <td className="py-1.5">Auto-apply</td>
              <td>≥ {THRESHOLDS.auto.routeConfidence}</td>
              <td>≥ {THRESHOLDS.auto.findingValid}</td>
              <td>≥ {THRESHOLDS.auto.meaningPreserved}</td>
            </tr>
            <tr className="border-t border-line-soft">
              <td className="py-1.5">Suggest</td>
              <td>≥ {THRESHOLDS.suggest.routeConfidence}</td>
              <td>≥ {THRESHOLDS.suggest.findingValid}</td>
              <td>≥ {THRESHOLDS.suggest.meaningPreserved}</td>
            </tr>
          </tbody>
        </table>
        <p className="mt-2.5 text-[12px] leading-relaxed text-ink-2">
          Auto-apply also requires a mechanical change (ordinary typo, duplicate whitespace, mechanical punctuation, or defined style normalisation), a verified target, and no change to
          protected content: numbers, units, statistics, negation, association vs causation, claim strength, terminology, names, quotations or citations. OpenJEV’s manual-review decisions are never
          upgraded.
        </p>
      </section>

      <section className="border-t border-line-soft px-5 py-4">
        <h3 className="mb-2 text-[10.5px] font-medium uppercase tracking-[0.12em] text-ink-3">{STYLE_PROFILE.name}</h3>
        <ul className="list-disc space-y-1 pl-4 text-[12.5px] leading-relaxed text-ink marker:text-olive-soft">
          {STYLE_PROFILE.rules.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
        <p className="mt-2.5 text-[12px] text-ink-2">{STYLE_PROFILE.disclaimer}</p>
      </section>

      <section className="border-t border-line-soft bg-ivory/60 px-5 py-3 text-[11.5px] leading-relaxed text-ink-3">
        Model confidence is not a guarantee of editorial correctness. All state is in memory; reloading the page resets the demo.
      </section>
    </Modal>
  );
}
