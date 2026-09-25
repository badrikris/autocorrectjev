/**
 * Figures as editable specifications. The manuscript renders each figure from
 * its spec, so a correction (palette, axis label, text size, alt text) really
 * re-renders the graphic, and undo restores it exactly.
 *
 * Data are synthetic and deterministic.
 */

export type Palette = "red-green" | "olive-sequential";
export type FigureProp = "palette" | "yAxisLabel" | "tickFontPt" | "altText" | "source";
export type FigureRegion = "image" | "legend" | "y-axis" | "ticks" | "alt";

export interface FigureSpec {
  id: string;
  blockId: string;
  label: string;
  kind: "map" | "scatter";
  palette: Palette;
  xAxisLabel: string;
  yAxisLabel: string;
  /** Size of axis and legend text at final print size. */
  tickFontPt: number;
  altText: string | null;
  /** What the author supplied. */
  source: { format: "PNG" | "SVG"; pxWidth: number | null; pxHeight: number | null; printWidthMm: number };
}

export type FigureState = Record<string, FigureSpec>;

export const FIGURES: FigureState = {
  fig1: {
    id: "fig1",
    blockId: "fig-1",
    label: "Figure 1",
    kind: "map",
    palette: "red-green",
    xAxisLabel: "",
    yAxisLabel: "",
    tickFontPt: 8,
    altText: "Map of Easthollow’s census blocks shaded by tree canopy cover, with lower cover in the dense centre and industrial east and higher cover in the older western districts.",
    source: { format: "PNG", pxWidth: 1180, pxHeight: 820, printWidthMm: 170 },
  },
  fig2: {
    id: "fig2",
    blockId: "fig-2",
    label: "Figure 2",
    kind: "scatter",
    palette: "olive-sequential",
    xAxisLabel: "Tree canopy cover (%)",
    yAxisLabel: "Surface temperature (°F)",
    tickFontPt: 5.5,
    altText: null,
    source: { format: "SVG", pxWidth: null, pxHeight: null, printWidthMm: 170 },
  },
};

/** Effective resolution of a raster at its print width; null for vector graphics. */
export function effectiveDpi(spec: FigureSpec): number | null {
  if (spec.source.format === "SVG" || !spec.source.pxWidth) return null;
  return Math.round(spec.source.pxWidth / (spec.source.printWidthMm / 25.4));
}

export type FigureValue = string | number | null;

export function figureValue(spec: FigureSpec, prop: FigureProp): FigureValue {
  if (prop === "source") return `${spec.source.format} ${spec.source.pxWidth ?? "vector"}`;
  return spec[prop];
}

/** Set one property, only if it still holds the expected value. */
export function patchFigure(
  figures: FigureState,
  figureId: string,
  prop: Exclude<FigureProp, "source">,
  expected: FigureValue,
  next: FigureValue,
): { ok: true; figures: FigureState } | { ok: false } {
  const spec = figures[figureId];
  if (!spec || spec[prop] !== expected) return { ok: false };
  return { ok: true, figures: { ...figures, [figureId]: { ...spec, [prop]: next } } };
}

/* ---------------- Synthetic data ---------------- */

const round2 = (v: number) => Math.round(v * 100) / 100;

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

export interface MapCell {
  col: number;
  row: number;
  canopy: number;
  excluded: boolean;
}

export const MAP_COLS = 16;
export const MAP_ROWS = 10;

/** Canopy by block: leafy west, dense centre, industrial east, a river running through. */
export const MAP_CELLS: MapCell[] = (() => {
  const r = rng(7);
  const cells: MapCell[] = [];
  for (let row = 0; row < MAP_ROWS; row++) {
    for (let col = 0; col < MAP_COLS; col++) {
      const west = 1 - col / (MAP_COLS - 1);
      // Plain arithmetic only (no exp/pow): identical on server and in every browser.
      const dx = (col - 7.5) / 3.2;
      const dy = (row - 4.5) / 2.6;
      const centre = 1 / (1 + dx * dx + dy * dy);
      let canopy = 8 + 44 * west - 14 * centre + (r() - 0.5) * 14;
      if (col >= 12 && row >= 5) canopy -= 10; // industrial east
      const riverRow = 2 + Math.round(col * 0.35);
      const excluded = row === riverRow && col % 3 !== 1;
      cells.push({ col, row, canopy: round2(Math.max(1, Math.min(58, canopy))), excluded });
    }
  }
  return cells;
})();

export interface ScatterPoint {
  canopy: number;
  lst: number;
}

/** 202 analysed blocks: temperature falls as canopy rises. */
export const SCATTER_POINTS: ScatterPoint[] = (() => {
  const r = rng(42);
  const pts: ScatterPoint[] = [];
  for (let i = 0; i < 202; i++) {
    const u = r();
    const canopy = round2(2 + (0.35 * u * u + 0.65 * u) * 56);
    const noise = (r() + r() + r() - 1.5) * 2.4;
    const lst = round2(Math.max(27.4, Math.min(38.9, 36.6 - 0.118 * canopy + noise)));
    pts.push({ canopy, lst });
  }
  return pts;
})();

export const SCATTER_FIT = (() => {
  const n = SCATTER_POINTS.length;
  const mx = SCATTER_POINTS.reduce((s, p) => s + p.canopy, 0) / n;
  const my = SCATTER_POINTS.reduce((s, p) => s + p.lst, 0) / n;
  const sxy = SCATTER_POINTS.reduce((s, p) => s + (p.canopy - mx) * (p.lst - my), 0);
  const sxx = SCATTER_POINTS.reduce((s, p) => s + (p.canopy - mx) ** 2, 0);
  const slope = sxy / sxx;
  return { slope, intercept: my - slope * mx };
})();
