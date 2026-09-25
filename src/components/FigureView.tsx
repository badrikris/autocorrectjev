"use client";

/**
 * Renders a figure from its spec. Because the graphic is drawn from data, a
 * correction (palette, axis label, text size) genuinely re-renders it — and
 * before/after previews are the same component with two specs.
 */
import { MAP_CELLS, MAP_COLS, MAP_ROWS, SCATTER_FIT, SCATTER_POINTS, type FigureRegion, type FigureSpec, type Palette } from "@/lib/figures";

/** SVG units per printed point, for a 560-unit-wide figure printed at 170 mm. */
const UNITS_PER_PT = (560 / 170) * 0.3528;

const PALETTES: Record<Palette, [string, string, string]> = {
  "red-green": ["#d73027", "#fee08b", "#1a9850"],
  "olive-sequential": ["#f3f1e2", "#a8b080", "#39431f"],
};

function mix(a: string, b: string, t: number) {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return `rgb(${x.map((v, i) => Math.round(v + (y[i] - v) * t)).join(",")})`;
}
function colourFor(palette: Palette, t: number) {
  const [lo, mid, hi] = PALETTES[palette];
  return t < 0.5 ? mix(lo, mid, t * 2) : mix(mid, hi, (t - 0.5) * 2);
}

/** Close-up viewBoxes for before/after previews of one region. */
export const REGION_CROP: Record<string, Partial<Record<FigureRegion, string>>> = {
  map: { legend: "380 0 180 90", image: "0 0 560 360" },
  scatter: { "y-axis": "0 0 120 380", ticks: "20 290 300 90", alt: "0 0 560 380" },
};

/** Where a finding's pin sits on the figure, as a fraction of its width and height. */
export const REGION_PIN: Record<string, Partial<Record<FigureRegion, [number, number]>>> = {
  map: { legend: [0.93, 0.2], image: [0.05, 0.08] },
  scatter: { "y-axis": [0.035, 0.42], ticks: [0.16, 0.9], alt: [0.95, 0.07] },
};

export function FigureGraphic({ spec, crop, className }: { spec: FigureSpec; crop?: string; className?: string }) {
  return spec.kind === "map" ? <MapGraphic spec={spec} crop={crop} className={className} /> : <ScatterGraphic spec={spec} crop={crop} className={className} />;
}

function MapGraphic({ spec, crop, className }: { spec: FigureSpec; crop?: string; className?: string }) {
  const fs = spec.tickFontPt * UNITS_PER_PT;
  const x0 = 20;
  const y0 = 24;
  const cw = 22;
  const ch = 30;
  // The supplied raster is soft at print size; show it honestly.
  const soft = spec.source.format === "PNG" && (spec.source.pxWidth ?? 9999) < 2000;
  return (
    <svg viewBox={crop ?? "0 0 560 360"} className={className} role="img" aria-label={spec.altText ?? undefined} style={soft ? { filter: "blur(0.35px)" } : undefined}>
      <rect x="0" y="0" width="560" height="360" fill="#fffefa" />
      {MAP_CELLS.map((c) => (
        <rect
          key={`${c.col}-${c.row}`}
          x={x0 + c.col * cw}
          y={y0 + c.row * ch}
          width={cw - 1.2}
          height={ch - 1.2}
          fill={c.excluded ? "#cfcdc3" : colourFor(spec.palette, c.canopy / 58)}
        />
      ))}
      <path
        d={`M ${x0} ${y0 + 2.5 * ch} C ${x0 + 120} ${y0 + 3 * ch}, ${x0 + 220} ${y0 + 5 * ch}, ${x0 + MAP_COLS * cw} ${y0 + 7.8 * ch}`}
        stroke="#9fb1b4"
        strokeWidth="7"
        fill="none"
        opacity="0.85"
      />
      <rect x={x0} y={y0} width={MAP_COLS * cw} height={MAP_ROWS * ch} fill="none" stroke="#25251f" strokeWidth="0.8" />
      {/* Legend */}
      <g transform="translate(398 22)">
        <text x="0" y="0" fontSize={fs} fill="#25251f" fontFamily="Inter, sans-serif">
          Canopy cover (%)
        </text>
        {Array.from({ length: 40 }).map((_, i) => (
          <rect key={i} x={i * 3.6} y={8} width={3.7} height={12} fill={colourFor(spec.palette, i / 39)} />
        ))}
        {[0, 30, 60].map((v, i) => (
          <text key={v} x={i * 72} y={20 + fs * 1.3} fontSize={fs} fill="#25251f" textAnchor={i === 0 ? "start" : i === 2 ? "end" : "middle"} fontFamily="Inter, sans-serif">
            {v}
          </text>
        ))}
        <rect x="0" y={36 + fs} width="12" height="10" fill="#cfcdc3" />
        <text x="17" y={45 + fs} fontSize={fs} fill="#25251f" fontFamily="Inter, sans-serif">
          Excluded
        </text>
      </g>
      {/* North arrow and scale bar */}
      <g transform="translate(410 250)" fontFamily="Inter, sans-serif" fill="#25251f">
        <path d="M 8 0 L 14 18 L 8 14 L 2 18 Z" />
        <text x="8" y="32" fontSize={fs} textAnchor="middle">
          N
        </text>
        <rect x="40" y="18" width="80" height="4" fill="#25251f" />
        <text x="80" y={34 + fs * 0.3} fontSize={fs} textAnchor="middle">
          2 km
        </text>
      </g>
    </svg>
  );
}

function ScatterGraphic({ spec, crop, className }: { spec: FigureSpec; crop?: string; className?: string }) {
  const fs = spec.tickFontPt * UNITS_PER_PT;
  const L = 78;
  const R = 540;
  const T = 20;
  const B = 310;
  const x = (v: number) => L + (v / 60) * (R - L);
  const y = (v: number) => B - ((v - 26) / 14) * (B - T);
  return (
    <svg viewBox={crop ?? "0 0 560 380"} className={className} role="img" aria-label={spec.altText ?? undefined}>
      <rect x="0" y="0" width="560" height="380" fill="#fffefa" />
      {[28, 32, 36, 40].map((v) => (
        <line key={v} x1={L} x2={R} y1={y(v)} y2={y(v)} stroke="#ecebe2" />
      ))}
      {SCATTER_POINTS.map((p, i) => (
        <circle key={i} cx={x(p.canopy).toFixed(2)} cy={y(p.lst).toFixed(2)} r="2.6" fill="#66733a" fillOpacity="0.55" />
      ))}
      <line x1={x(0)} y1={y(SCATTER_FIT.intercept).toFixed(2)} x2={x(60)} y2={y(SCATTER_FIT.intercept + SCATTER_FIT.slope * 60).toFixed(2)} stroke="#25251f" strokeWidth="1.6" />
      <line x1={L} x2={R} y1={B} y2={B} stroke="#25251f" strokeWidth="0.9" />
      <line x1={L} x2={L} y1={T} y2={B} stroke="#25251f" strokeWidth="0.9" />
      <g fontFamily="Inter, sans-serif" fill="#25251f" fontSize={fs}>
        {[0, 10, 20, 30, 40, 50, 60].map((v) => (
          <g key={v}>
            <line x1={x(v)} x2={x(v)} y1={B} y2={B + 4} stroke="#25251f" strokeWidth="0.9" />
            <text x={x(v)} y={B + 6 + fs} textAnchor="middle">
              {v}
            </text>
          </g>
        ))}
        {[26, 28, 30, 32, 34, 36, 38, 40].map((v) => (
          <g key={v}>
            <line x1={L - 4} x2={L} y1={y(v)} y2={y(v)} stroke="#25251f" strokeWidth="0.9" />
            <text x={L - 7} y={y(v) + fs * 0.35} textAnchor="end">
              {v}
            </text>
          </g>
        ))}
        <text x={(L + R) / 2} y={B + 16 + fs * 2.2} textAnchor="middle" fontSize={fs * 1.15}>
          {spec.xAxisLabel}
        </text>
        <text transform={`translate(${L - 30 - fs * 1.2} ${(T + B) / 2}) rotate(-90)`} textAnchor="middle" fontSize={fs * 1.15}>
          {spec.yAxisLabel}
        </text>
      </g>
    </svg>
  );
}
