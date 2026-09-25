"use client";

import { Check, Copy } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { kindOf } from "@/lib/candidates";
import { buildJats, isLinkApplied, jatsToString, type XmlPart } from "@/lib/jats";
import { highlightKind } from "@/lib/present";
import { candidateOf, type ReviewState } from "@/lib/review";

interface Props {
  state: ReviewState;
  selectedId: string | null;
  activeId: string | null;
  flashId: string | null;
  onSelect: (id: string) => void;
}

/** Colour a tag: element names olive, attribute names quiet, values warm, punctuation faint. */
function renderTag(text: string): ReactNode {
  const out: ReactNode[] = [];
  let first = true;
  let last = 0;
  for (const m of text.matchAll(/("[^"]*")|([\w:.-]+)(?==)|([\w:.-]+)/g)) {
    const i = m.index!;
    if (i > last) out.push(<span key={`p${i}`} className="text-ink-3">{text.slice(last, i)}</span>);
    if (m[1]) out.push(<span key={i} className="text-[#8a6424]">{m[1]}</span>);
    else if (m[2]) out.push(<span key={i} className="text-ink-2">{m[2]}</span>);
    else {
      out.push(<span key={i} className={first ? "text-olive-dark" : "text-ink-2"}>{m[3]}</span>);
      first = false;
    }
    last = i + m[0].length;
  }
  if (last < text.length) out.push(<span key="end" className="text-ink-3">{text.slice(last)}</span>);
  return out;
}

export function XmlView({ state, selectedId, activeId, flashId, onSelect }: Props) {
  const groups = useMemo(() => buildJats(state), [state]);
  const [copied, setCopied] = useState(false);

  const stats = useMemo(() => {
    const all = Object.values(state.findings);
    const links = all.filter(isLinkApplied).length;
    const structural = all.filter((f) => kindOf(candidateOf(f.id)) === "structure" && candidateOf(f.id).structure?.rid).length;
    const missingAlt = Object.values(state.figures).filter((f) => !f.altText).length;
    return { links, structural, missingAlt };
  }, [state]);

  let n = 0;
  const part = (p: XmlPart, key: string) => {
    if (p.t === "tag") {
      const f = p.findingId ? state.findings[p.findingId] : null;
      return (
        <span
          key={key}
          data-finding-id={p.linked ? undefined : p.findingId}
          onClick={p.findingId ? () => onSelect(p.findingId!) : undefined}
          className={`${p.linked ? "xml-link" : ""} ${p.findingId && f && highlightKind(f) ? "cursor-pointer" : ""}`}
        >
          {renderTag(p.text)}
        </span>
      );
    }
    if (p.t === "comment") {
      const f = p.findingId ? state.findings[p.findingId] : null;
      const kind = f ? highlightKind(f) : null;
      return (
        <span
          key={key}
          data-finding-id={kind ? p.findingId : undefined}
          onClick={kind ? () => onSelect(p.findingId!) : undefined}
          className={`italic text-ink-3 ${kind ? `hl hl-${kind} ${p.findingId === selectedId ? "hl-selected" : p.findingId === activeId ? "hl-active" : ""}` : ""}`}
        >
          {p.text}
        </span>
      );
    }
    const f = p.findingId ? state.findings[p.findingId] : null;
    const kind = f ? highlightKind(f) : null;
    if (!kind) return <span key={key} className={p.linked ? "xml-link" : undefined}>{p.text}</span>;
    return (
      <span
        key={key}
        data-finding-id={p.findingId}
        onClick={() => onSelect(p.findingId!)}
        className={`hl hl-${kind} ${p.linked ? "xml-link" : ""} ${p.findingId === selectedId ? "hl-selected" : p.findingId === activeId ? "hl-active" : ""} ${p.findingId === flashId ? "hl-flash" : ""}`}
      >
        {p.text}
      </span>
    );
  };

  return (
    <div className="mx-auto my-8 w-full max-w-[880px]">
      <div className="mb-3 flex items-center gap-3 px-1 text-[12px] text-ink-2">
        <span className="font-medium text-ink">JATS 1.3 XML</span>
        <span className="text-ink-3">generated live from the manuscript</span>
        <span className="tabular ml-auto text-ink-3">
          {stats.links} of {stats.structural} cross-references linked · {stats.missingAlt ? `${stats.missingAlt} figure without alt text` : "all figures have alt text"}
        </span>
        <button
          type="button"
          onClick={() =>
            void navigator.clipboard?.writeText(jatsToString(groups)).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1400);
            })
          }
          className="inline-flex h-7 items-center gap-1.5 rounded-md border border-line bg-paper px-2.5 text-[12px] text-ink hover:bg-olive-wash"
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? "Copied" : "Copy XML"}
        </button>
      </div>
      <div className="overflow-hidden rounded-[3px] border border-line-soft bg-paper py-4 shadow-[var(--shadow-hair)]">
        <div className="xml-code font-mono text-[12.5px] leading-[1.75] text-ink">
          {groups.map((g, gi) => (
            <div key={gi} data-block-id={g.blockId ?? undefined}>
              {g.lines.map((l, li) => {
                n += 1;
                return (
                  <div key={li} className="grid grid-cols-[44px_1fr] hover:bg-olive-wash/60">
                    <span className="tabular select-none pr-3 text-right text-[11px] leading-[2.05] text-ink-3/70">{n}</span>
                    <span className="whitespace-pre-wrap break-words pr-6" style={{ paddingLeft: `${l.indent * 1.25}em`, textIndent: 0 }}>
                      {l.parts.map((p, pi) => part(p, `${gi}-${li}-${pi}`))}
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
