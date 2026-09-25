"use client";

import { Ellipsis, RotateCcw, Settings2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { MANUSCRIPT_META } from "@/lib/manuscript";

export type OpenJevIndicator =
  | { kind: "checking" }
  | { kind: "not_configured" }
  | { kind: "configured" }
  | { kind: "connected" }
  | { kind: "error"; text: string }
  | { kind: "preview" };

interface Props {
  indicator: OpenJevIndicator;
  started: boolean;
  progress: { done: number; total: number; pending: number; needsYou: number; auto: number; complete: boolean };
  onStart: () => void;
  canStart: boolean;
  onReset: () => void;
  onSettings: () => void;
  startPrompt: React.ReactNode;
}

export function TopBar({ indicator, started, progress, onStart, canStart, onReset, onSettings, startPrompt }: Props) {
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenu(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setMenu(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [menu]);

  return (
    <header className="relative z-20 flex h-14 shrink-0 items-center gap-4 border-b border-line bg-paper/80 px-5 backdrop-blur-sm">
      <div className="flex items-baseline gap-2.5">
        <span className="flex items-baseline gap-1 font-serif text-[20px] font-semibold tracking-[-0.02em] text-ink">
          Edit
          <span className="inline-block h-[5px] w-[5px] translate-y-[-1px] rounded-full bg-olive" aria-hidden />
        </span>
        <span className="hidden text-[11.5px] italic text-ink-3 min-[1200px]:inline font-serif">Copyediting, with judgment.</span>
        <span className="rounded-[3px] border border-line px-1.5 py-[1px] text-[9.5px] font-medium uppercase tracking-[0.12em] text-ink-3">Prototype</span>
      </div>

      <div className="h-5 w-px bg-line" aria-hidden />
      <p className="min-w-0 flex-1 truncate text-[13px] text-ink-2" title={MANUSCRIPT_META.title}>
        {MANUSCRIPT_META.shortTitle}
        <span className="text-ink-3"> · Demo manuscript</span>
      </p>

      <Indicator indicator={indicator} />

      <div className="relative">
        {!started ? (
          <button
            type="button"
            onClick={onStart}
            disabled={!canStart}
            className="h-8 rounded-md bg-olive px-3.5 text-[13px] font-medium text-paper shadow-[var(--shadow-hair)] transition hover:bg-olive-dark disabled:opacity-50"
          >
            Start review
          </button>
        ) : progress.pending > 0 ? (
          <span className="tabular flex h-8 items-center gap-2 rounded-md border border-line px-3 text-[12.5px] text-ink-2">
            <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-olive" />
            Evaluating · {progress.done} of {progress.total}
          </span>
        ) : (
          <span className="tabular flex h-8 items-center gap-1.5 px-1 text-[12.5px] text-ink-2">
            {progress.complete ? (
              <span className="text-olive-dark">All current demo findings reviewed</span>
            ) : (
              <>
                <span className="text-ink">{progress.needsYou}</span> need{progress.needsYou === 1 ? "s" : ""} you
                <span className="text-ink-3">·</span>
                <span className="text-ink">{progress.auto}</span> auto-applied
              </>
            )}
          </span>
        )}
        {startPrompt}
      </div>

      <div className="relative" ref={menuRef}>
        <button
          type="button"
          onClick={() => setMenu((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={menu}
          aria-label="Menu"
          className="flex h-8 w-8 items-center justify-center rounded-md text-ink-2 transition hover:bg-ivory hover:text-ink"
        >
          <Ellipsis size={17} />
        </button>
        {menu && (
          <div role="menu" className="fade-in absolute right-0 top-10 w-48 rounded-md border border-line bg-paper py-1 shadow-[var(--shadow-pop)]">
            <MenuItem
              icon={<RotateCcw size={14} />}
              onClick={() => {
                setMenu(false);
                onReset();
              }}
            >
              Reset demo
            </MenuItem>
            <MenuItem
              icon={<Settings2 size={14} />}
              onClick={() => {
                setMenu(false);
                onSettings();
              }}
            >
              Demo settings
            </MenuItem>
          </div>
        )}
      </div>
    </header>
  );
}

function MenuItem({ children, icon, onClick }: { children: React.ReactNode; icon: React.ReactNode; onClick: () => void }) {
  return (
    <button role="menuitem" type="button" onClick={onClick} className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[13px] text-ink hover:bg-olive-wash">
      <span className="text-ink-2">{icon}</span>
      {children}
    </button>
  );
}

function Indicator({ indicator }: { indicator: OpenJevIndicator }) {
  const map: Record<OpenJevIndicator["kind"], { dot: string; text: string; cls: string; title: string }> = {
    checking: { dot: "border border-ink-3", text: "Checking OpenJEV…", cls: "text-ink-3", title: "Checking server configuration" },
    not_configured: { dot: "border border-ink-3", text: "OpenJEV not configured", cls: "text-ink-2", title: "No OPENJEV_API_KEY on the server" },
    configured: { dot: "border-[1.5px] border-olive", text: "OpenJEV configured", cls: "text-ink-2", title: "API key present; no successful request yet" },
    connected: { dot: "bg-olive", text: "OpenJEV connected", cls: "text-olive-dark", title: "At least one live OpenJEV request succeeded" },
    error: { dot: "bg-terra-line", text: indicator.kind === "error" ? indicator.text : "", cls: "text-terra", title: "Live OpenJEV requests are failing" },
    preview: { dot: "bg-amber-line", text: "Sample decisions · OpenJEV not connected", cls: "text-amber", title: "Preview mode with fixture data" },
  };
  const m = map[indicator.kind];
  return (
    <span className={`flex shrink-0 items-center gap-1.5 text-[12px] ${m.cls}`} title={m.title} aria-live="polite">
      <span className={`h-[7px] w-[7px] rounded-full ${m.dot}`} />
      {m.text}
    </span>
  );
}
