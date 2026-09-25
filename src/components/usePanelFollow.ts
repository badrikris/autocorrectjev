"use client";

/**
 * Keeps the review panel in step with the manuscript.
 *
 * As the editor scrolls, the finding nearest the reading line becomes "active"
 * and its card glides to sit beside its highlight. Motion uses a critically
 * damped spring (the physics behind Apple's system animations): it follows the
 * reading position continuously, retargets smoothly when the active finding
 * changes, and never overshoots. Purely presentational — no requests.
 */
import { useCallback, useEffect, useMemo, useRef, type RefObject } from "react";

/** Spring response (seconds) and damping ratio, in the style of SwiftUI's `.spring(response:dampingFraction:)`. */
const RESPONSE = 0.5;
const DAMPING = 1;
const STIFFNESS = (2 * Math.PI / RESPONSE) ** 2;
const FRICTION = (4 * Math.PI * DAMPING) / RESPONSE;
/** Where the editor's eye rests in the manuscript, as a fraction of its height. */
const READING_LINE = 0.33;

interface Options {
  mainRef: RefObject<HTMLElement | null>;
  listRef: RefObject<HTMLElement | null>;
  /** True while the editor is working in the panel; following pauses. */
  paused: boolean;
  onActive: (id: string | null) => void;
}

export function usePanelFollow({ mainRef, listRef, paused, onActive }: Options) {
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const onActiveRef = useRef(onActive);
  onActiveRef.current = onActive;
  const activeRef = useRef<string | null>(null);

  // Spring state
  const anim = useRef<{ x: number; v: number; target: number; raf: number | null; last: number; wrote: number }>({
    x: 0,
    v: 0,
    target: 0,
    raf: null,
    last: 0,
    wrote: -1,
  });

  const stop = useCallback(() => {
    const a = anim.current;
    if (a.raf !== null) cancelAnimationFrame(a.raf);
    a.raf = null;
    a.v = 0;
  }, []);

  const animateTo = useCallback((target: number) => {
    const list = listRef.current;
    if (!list) return;
    const a = anim.current;
    a.target = target;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      list.scrollTop = target;
      return;
    }
    if (a.raf !== null) return; // already running; it will pick up the new target
    a.x = list.scrollTop;
    a.v = 0;
    a.last = performance.now();
    const step = (now: number) => {
      const el = listRef.current;
      if (!el) return;
      // The editor scrolled the panel themselves: yield to them.
      if (a.wrote >= 0 && Math.abs(el.scrollTop - a.wrote) > 2) {
        a.raf = null;
        a.v = 0;
        return;
      }
      const dt = Math.min(0.032, (now - a.last) / 1000);
      a.last = now;
      const force = STIFFNESS * (a.target - a.x) - FRICTION * a.v;
      a.v += force * dt;
      a.x += a.v * dt;
      if (Math.abs(a.target - a.x) < 0.4 && Math.abs(a.v) < 4) {
        a.x = a.target;
        el.scrollTop = a.x;
        a.wrote = el.scrollTop;
        a.raf = null;
        return;
      }
      el.scrollTop = a.x;
      a.wrote = el.scrollTop;
      a.raf = requestAnimationFrame(step);
    };
    a.wrote = list.scrollTop;
    a.raf = requestAnimationFrame(step);
  }, [listRef]);

  /** Align a card beside its highlight (or near the top if it has none). */
  const alignCard = useCallback(
    (id: string) => {
      const main = mainRef.current;
      const list = listRef.current;
      const card = list?.querySelector<HTMLElement>(`#card-${id}`);
      if (!main || !list || !card) return;
      const listRect = list.getBoundingClientRect();
      const hl = main.querySelector<HTMLElement>(`[data-finding-id="${id}"]`);
      const cardTop = card.getBoundingClientRect().top - listRect.top + list.scrollTop;
      // Sit level with the highlight, but keep the card comfortably on screen.
      const beside = hl ? hl.getBoundingClientRect().top - listRect.top - 14 : 24;
      const desired = Math.min(Math.max(beside, 16), list.clientHeight * 0.5);
      const max = list.scrollHeight - list.clientHeight;
      animateTo(Math.min(Math.max(cardTop - desired, 0), Math.max(0, max)));
    },
    [mainRef, listRef, animateTo],
  );

  /** Find the finding nearest the reading line, then follow it. */
  const sync = useCallback(
    (force = false) => {
      const main = mainRef.current;
      const list = listRef.current;
      if (!main || !list) return;
      const mr = main.getBoundingClientRect();
      const line = mr.top + mr.height * READING_LINE;
      let best: string | null = null;
      let bestDist = Infinity;
      for (const hl of main.querySelectorAll<HTMLElement>("[data-finding-id]")) {
        const id = hl.dataset.findingId!;
        if (!list.querySelector(`#card-${id}`)) continue; // filtered out of the panel
        const r = hl.getBoundingClientRect();
        if (r.bottom < mr.top || r.top > mr.bottom) continue;
        const d = Math.abs((r.top + r.bottom) / 2 - line);
        if (d < bestDist) {
          bestDist = d;
          best = id;
        }
      }
      if (best !== activeRef.current) {
        activeRef.current = best;
        onActiveRef.current(best);
      }
      if (best && (force || !pausedRef.current)) alignCard(best);
    },
    [mainRef, listRef, alignCard],
  );

  // Follow the manuscript's scroll, once per frame.
  useEffect(() => {
    const main = mainRef.current;
    if (!main) return;
    let frame: number | null = null;
    const onScroll = () => {
      if (frame !== null) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        sync();
      });
    };
    main.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      main.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [mainRef, sync]);

  // Any direct interaction with the panel hands control back to the editor.
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const yield_ = () => stop();
    list.addEventListener("wheel", yield_, { passive: true });
    list.addEventListener("touchstart", yield_, { passive: true });
    list.addEventListener("pointerdown", yield_);
    return () => {
      list.removeEventListener("wheel", yield_);
      list.removeEventListener("touchstart", yield_);
      list.removeEventListener("pointerdown", yield_);
    };
  }, [listRef, stop]);

  useEffect(() => () => stop(), [stop]);

  return useMemo(() => ({ sync, alignCard }), [sync, alignCard]);
}
