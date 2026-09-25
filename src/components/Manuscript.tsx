"use client";

import { Pencil } from "lucide-react";
import { memo, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { Block, DocState } from "@/lib/document";
import { MANUSCRIPT_META } from "@/lib/manuscript";
import { highlightKind } from "@/lib/present";
import type { FindingState } from "@/lib/review";

interface ManuscriptProps {
  doc: DocState;
  findingsByBlock: Record<string, FindingState[]>;
  selectedId: string | null;
  flashId: string | null;
  editing: { blockId: string; selectStart?: number; selectEnd?: number } | null;
  onSelect: (id: string) => void;
  onStartEdit: (blockId: string) => void;
  onSaveEdit: (blockId: string, text: string, baseRevision: number, force: boolean) => boolean;
  onCancelEdit: () => void;
}

export function Manuscript(props: ManuscriptProps) {
  const { doc, findingsByBlock } = props;
  return (
    <article className="relative mx-auto my-8 w-full max-w-[816px] rounded-[3px] border border-line-soft bg-paper px-[72px] pb-28 pt-16 shadow-[var(--shadow-hair)] max-[1360px]:px-14">
      <header className="mb-12">
        <p className="mb-7 text-[11px] font-medium uppercase tracking-[0.14em] text-ink-3">{MANUSCRIPT_META.label}</p>
        <h1 className="font-serif text-[31px] font-semibold leading-[1.22] tracking-[-0.01em] text-ink [text-wrap:balance]">
          {MANUSCRIPT_META.title}
        </h1>
        <p className="mt-5 font-serif text-[17px] text-ink">
          {MANUSCRIPT_META.authors.map((a, i) => (
            <span key={a}>
              {a}
              {i < MANUSCRIPT_META.authors.length - 1 ? <span className="text-ink-3">{i === MANUSCRIPT_META.authors.length - 2 ? " and " : ", "}</span> : null}
            </span>
          ))}
        </p>
        <p className="mt-1 font-serif text-[15px] italic text-ink-2">{MANUSCRIPT_META.affiliation}</p>
        <div className="mt-9 h-px w-16 bg-olive-soft/70" />
      </header>

      <div className="ms-body">
        {doc.order.map((id) => (
          <BlockView
            key={id}
            block={doc.blocks[id]}
            findings={findingsByBlock[id]}
            selectedId={props.selectedId}
            flashId={props.flashId}
            editing={props.editing?.blockId === id ? props.editing : null}
            onSelect={props.onSelect}
            onStartEdit={props.onStartEdit}
            onSaveEdit={props.onSaveEdit}
            onCancelEdit={props.onCancelEdit}
          />
        ))}
      </div>

      <footer className="mt-16 border-t border-line-soft pt-6 font-sans text-[12px] leading-relaxed text-ink-3">
        End of demo manuscript. Synthetic text written for this prototype; the city, authors, citations and data are fictional.
      </footer>
    </article>
  );
}

interface BlockViewProps {
  block: Block;
  findings: FindingState[] | undefined;
  selectedId: string | null;
  flashId: string | null;
  editing: { blockId: string; selectStart?: number; selectEnd?: number } | null;
  onSelect: (id: string) => void;
  onStartEdit: (blockId: string) => void;
  onSaveEdit: (blockId: string, text: string, baseRevision: number, force: boolean) => boolean;
  onCancelEdit: () => void;
}

const BlockView = memo(function BlockView({ block, findings, selectedId, flashId, editing, onSelect, onStartEdit, onSaveEdit, onCancelEdit }: BlockViewProps) {
  const marks = (findings ?? [])
    .map((f) => ({ f, kind: highlightKind(f) }))
    .filter((m) => m.kind !== null && m.f.anchor)
    .sort((a, b) => a.f.anchor!.start - b.f.anchor!.start);

  const nodes: ReactNode[] = [];
  let pos = 0;
  for (const { f, kind } of marks) {
    const { start, end } = f.anchor!;
    if (start < pos) continue;
    if (start > pos) nodes.push(block.text.slice(pos, start));
    const selected = f.id === selectedId;
    const segment = block.text.slice(start, end);
    nodes.push(
      <span
        key={f.id}
        data-finding-id={f.id}
        role="button"
        tabIndex={-1}
        aria-label="Show finding"
        onClick={(e) => {
          e.stopPropagation();
          onSelect(f.id);
        }}
        className={`hl hl-${kind} ${selected ? "hl-selected" : ""} ${flashId === f.id ? "hl-flash" : ""}`}
      >
        {segment.length > 0 && segment.trim() === "" ? <span className="whitespace-pre">{segment}</span> : segment}
      </span>,
    );
    pos = end;
  }
  if (pos < block.text.length) nodes.push(block.text.slice(pos));

  const manualCount = marks.filter((m) => m.kind === "manual").length;
  const suggestCount = marks.filter((m) => m.kind === "suggest").length;
  const editable = block.kind === "paragraph" || block.kind === "subheading";

  if (editing) {
    return (
      <div data-block-id={block.id} className={block.kind === "paragraph" ? "mb-[1.05em]" : "mb-3 mt-9"}>
        <BlockEditor block={block} editing={editing} onSave={onSaveEdit} onCancel={onCancelEdit} />
      </div>
    );
  }

  const content =
    block.kind === "heading" ? (
      <h2 className="mb-4 mt-12 font-serif text-[22px] font-semibold tracking-[-0.005em] text-ink first:mt-0">{nodes}</h2>
    ) : block.kind === "subheading" ? (
      <h3 className="mb-2.5 mt-8 font-serif text-[18.5px] font-semibold italic text-ink">{nodes}</h3>
    ) : (
      <p className="mb-[1.05em]">{nodes}</p>
    );

  return (
    <div data-block-id={block.id} className="group relative">
      {(manualCount > 0 || suggestCount > 0) && (
        <div className="pointer-events-none absolute -left-[30px] top-[0.62em] flex flex-col gap-[5px]" aria-hidden>
          {Array.from({ length: manualCount }).map((_, i) => (
            <span key={`m${i}`} className="block h-[13px] w-[3px] rounded-full bg-terra-line/90" />
          ))}
          {Array.from({ length: suggestCount }).map((_, i) => (
            <span key={`s${i}`} className="block h-[5px] w-[5px] rounded-full bg-amber-line/80" />
          ))}
        </div>
      )}
      {content}
      {editable && (
        <button
          type="button"
          onClick={() => onStartEdit(block.id)}
          className="absolute -right-[42px] top-[0.4em] flex h-7 w-7 items-center justify-center rounded-md text-ink-3 opacity-0 transition hover:bg-olive-pale hover:text-olive-dark focus-visible:opacity-100 group-hover:opacity-100"
          aria-label="Edit this passage"
          title="Edit this passage"
        >
          <Pencil size={14} strokeWidth={1.75} />
        </button>
      )}
    </div>
  );
});

function BlockEditor({
  block,
  editing,
  onSave,
  onCancel,
}: {
  block: Block;
  editing: { selectStart?: number; selectEnd?: number };
  onSave: (blockId: string, text: string, baseRevision: number, force: boolean) => boolean;
  onCancel: () => void;
}) {
  const [text, setText] = useState(block.text);
  const [baseRevision] = useState(block.revision);
  const [conflict, setConflict] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [text]);

  // Opening the editor is an explicit request, so focusing it here is expected.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    if (editing.selectStart !== undefined && editing.selectEnd !== undefined) el.setSelectionRange(editing.selectStart, editing.selectEnd);
    else el.setSelectionRange(el.value.length, el.value.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const changedUnderneath = block.revision !== baseRevision;
  const save = (force: boolean) => {
    const ok = onSave(block.id, text, baseRevision, force);
    if (!ok) setConflict(true);
  };

  return (
    <div className="-mx-4 rounded-md bg-olive-wash px-4 pb-3 pt-2 ring-1 ring-olive-soft/60">
      <div className="mb-1.5 flex items-center justify-between font-sans text-[11px] font-medium uppercase tracking-[0.1em] text-olive-dark">
        <span>Editing passage</span>
        <span className="normal-case tracking-normal text-ink-3">⌘↵ save · Esc cancel</span>
      </div>
      <textarea
        ref={ref}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") onCancel();
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            save(false);
          }
        }}
        spellCheck
        className={`block w-full resize-none bg-transparent text-ink outline-none ${block.kind === "subheading" ? "font-semibold italic" : ""}`}
        style={{ font: "inherit", lineHeight: "inherit" }}
      />
      {(conflict || changedUnderneath) && (
        <p className="mt-2 font-sans text-[12.5px] leading-snug text-terra">
          This paragraph changed while you were editing (for example, a correction was applied). Saving will replace it with your text.
        </p>
      )}
      <div className="mt-3 flex items-center gap-2 font-sans">
        <button
          type="button"
          onClick={() => save(conflict || changedUnderneath)}
          className="h-8 rounded-md bg-olive px-3 text-[13px] font-medium text-paper transition hover:bg-olive-dark"
        >
          {conflict || changedUnderneath ? "Save anyway" : "Save changes"}
        </button>
        <button type="button" onClick={onCancel} className="h-8 rounded-md px-3 text-[13px] text-ink-2 transition hover:bg-ivory hover:text-ink">
          Cancel
        </button>
        <span className="ml-auto text-[11.5px] text-ink-3">Saving marks Jev decisions in this paragraph out of date.</span>
      </div>
    </div>
  );
}
