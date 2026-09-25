"use client";

import { SECTIONS } from "@/lib/manuscript";

interface Props {
  currentSection: string;
  needsBySection: Record<string, number>;
  onNavigate: (sectionId: string) => void;
  onStyle: () => void;
}

export function OutlineRail({ currentSection, needsBySection, onNavigate, onStyle }: Props) {
  return (
    <nav className="flex w-[196px] shrink-0 flex-col justify-between px-5 pb-5 pt-8 max-[1360px]:w-[168px]" aria-label="Document outline">
      <div>
        <p className="mb-3 pl-3 text-[10.5px] font-medium uppercase tracking-[0.14em] text-ink-3">Contents</p>
        <ul className="space-y-px">
          {SECTIONS.map((s) => {
            const active = s.id === currentSection;
            const n = needsBySection[s.id] ?? 0;
            return (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => onNavigate(s.id)}
                  aria-current={active ? "location" : undefined}
                  className={`relative flex w-full items-center justify-between py-[5px] pl-3 pr-1 text-left text-[13px] transition ${
                    active ? "text-olive-deep" : "text-ink-2 hover:text-ink"
                  }`}
                >
                  <span className={`absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-full transition ${active ? "bg-olive" : "bg-transparent"}`} aria-hidden />
                  <span className={active ? "font-medium" : ""}>{s.title}</span>
                  {n > 0 && (
                    <span className="tabular text-[11px] text-ink-3" title={`${n} need${n === 1 ? "s" : ""} you`}>
                      {n}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
      <div className="space-y-2 pl-3 text-[11px] leading-relaxed text-ink-3">
        <button type="button" onClick={onStyle} className="block text-left text-ink-2 underline decoration-line underline-offset-[3px] hover:text-ink">
          Demo Journal Style
        </button>
        <p>Fictional house rules for this demonstration.</p>
      </div>
    </nav>
  );
}
