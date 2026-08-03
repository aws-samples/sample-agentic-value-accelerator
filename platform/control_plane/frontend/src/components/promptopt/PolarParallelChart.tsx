import { useMemo, useState } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// Polar parallel-coordinates chart (Highcharts-style) — pure SVG, no deps.
//
// Unlike a radar chart, each axis has its OWN scale (min/max + units), so you
// can mix percentages, milliseconds, and dollars on the same plot. Each series
// is a closed polyline connecting its normalized position on every spoke.
// ─────────────────────────────────────────────────────────────────────────────

export interface PolarAxis {
  key: string;
  label: string;
  min: number;
  max: number;
  higherBetter: boolean; // controls which end of the spoke is "good"
  format: (v: number) => string; // tick + tooltip formatting
}

export interface PolarSeries {
  id: string;
  label: string;
  color: string;
  values: Record<string, number>; // axisKey -> raw value
}

interface Props {
  axes: PolarAxis[];
  series: PolarSeries[];
  size?: number;
  ticks?: number; // rings
}

export default function PolarParallelChart({ axes, series, size = 360, ticks = 4 }: Props) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [hover, setHover] = useState<{ x: number; y: number; lines: string[] } | null>(null);

  const cx = size / 2;
  const cy = size / 2;
  const rOuter = size * 0.34;
  const rInner = size * 0.1; // small hole so center labels don't collide

  // Normalize a raw value to a 0..1 fraction along its spoke (0 = inner/worst).
  const frac = (axis: PolarAxis, v: number) => {
    const span = axis.max - axis.min || 1;
    const t = Math.max(0, Math.min(1, (v - axis.min) / span));
    return axis.higherBetter ? t : 1 - t;
  };

  const angleOf = (i: number) => (Math.PI * 2 * i) / axes.length - Math.PI / 2; // start at top
  const pointAt = (i: number, f: number) => {
    const a = angleOf(i);
    const r = rInner + (rOuter - rInner) * f;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as const;
  };

  const polylines = useMemo(
    () =>
      series.map((s) => ({
        ...s,
        points: axes.map((ax, i) => pointAt(i, frac(ax, s.values[ax.key] ?? ax.min))),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [series, axes, size],
  );

  const toggle = (id: string) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="flex flex-col items-center w-full">
      <svg
        viewBox={`0 0 ${size} ${size}`}
        className="w-full max-w-[420px] h-auto overflow-visible"
        role="img"
        aria-label="Polar parallel coordinates comparison"
      >
        {/* Concentric guide rings */}
        {Array.from({ length: ticks + 1 }).map((_, t) => {
          const f = t / ticks;
          const ring = axes.map((_, i) => pointAt(i, f).join(",")).join(" ");
          return (
            <polygon
              key={`ring-${t}`}
              points={ring}
              fill="none"
              stroke="#e2e8f0"
              strokeWidth={1}
              strokeDasharray={t === ticks ? "" : "3 3"}
            />
          );
        })}

        {/* Spokes + axis scale labels */}
        {axes.map((ax, i) => {
          const [ox, oy] = pointAt(i, 0);
          const [ex, ey] = pointAt(i, 1);
          const [lx, ly] = pointAt(i, 1.2);
          const anchor = Math.abs(lx - cx) < 8 ? "middle" : lx > cx ? "start" : "end";
          const vAlign = Math.abs(ly - cy) < 8 ? "middle" : ly > cy ? "hanging" : "auto";
          // good-end value vs bad-end value, respecting higherBetter
          const goodVal = ax.higherBetter ? ax.max : ax.min;
          const badVal = ax.higherBetter ? ax.min : ax.max;
          return (
            <g key={ax.key}>
              <line x1={ox} y1={oy} x2={ex} y2={ey} stroke="#cbd5e1" strokeWidth={1} />
              {/* outer (best) scale tick, pulled just inside the label */}
              <circle cx={ex} cy={ey} r={2} fill="#94a3b8" />
              <text
                x={lx}
                y={ly}
                fontSize={11}
                fontWeight={600}
                fill="#475569"
                textAnchor={anchor}
                dominantBaseline={vAlign}
              >
                {ax.label}
              </text>
              <text
                x={lx}
                y={ly + (ly > cy ? 13 : -13)}
                fontSize={8.5}
                fill="#94a3b8"
                textAnchor={anchor}
                dominantBaseline={vAlign}
              >
                {ax.format(badVal)} → {ax.format(goodVal)}
              </text>
            </g>
          );
        })}

        {/* Series polygons */}
        {polylines
          .filter((s) => !hidden.has(s.id))
          .map((s) => (
            <g key={s.id}>
              <polygon
                points={s.points.map((p) => p.join(",")).join(" ")}
                fill={s.color}
                fillOpacity={0.1}
                stroke={s.color}
                strokeWidth={2}
                strokeLinejoin="round"
              />
              {s.points.map((p, i) => (
                <circle
                  key={i}
                  cx={p[0]}
                  cy={p[1]}
                  r={3.5}
                  fill="#fff"
                  stroke={s.color}
                  strokeWidth={2}
                  onMouseEnter={() =>
                    setHover({
                      x: p[0],
                      y: p[1],
                      lines: [
                        `${axes[i].label}`,
                        ...series
                          .filter((ss) => !hidden.has(ss.id))
                          .map(
                            (ss) => `${ss.label}: ${axes[i].format(ss.values[axes[i].key] ?? 0)}`,
                          ),
                      ],
                    })
                  }
                  onMouseLeave={() => setHover(null)}
                />
              ))}
            </g>
          ))}

        {/* Tooltip */}
        {hover && (
          <g transform={`translate(${hover.x + 10}, ${hover.y - 10})`} pointerEvents="none">
            <rect
              x={0}
              y={-14}
              width={Math.max(90, hover.lines[0].length * 7)}
              height={hover.lines.length * 15 + 8}
              rx={6}
              fill="#0f172a"
              opacity={0.92}
            />
            {hover.lines.map((ln, i) => (
              <text
                key={i}
                x={8}
                y={i * 15}
                fontSize={i === 0 ? 10 : 10}
                fontWeight={i === 0 ? 700 : 400}
                fill={i === 0 ? "#94a3b8" : "#fff"}
              >
                {ln}
              </text>
            ))}
          </g>
        )}
      </svg>

      {/* Legend (click to toggle) */}
      <div className="flex flex-wrap justify-center gap-3 mt-2">
        {series.map((s) => {
          const off = hidden.has(s.id);
          return (
            <button
              key={s.id}
              onClick={() => toggle(s.id)}
              className={`flex items-center gap-1.5 text-[11px] font-medium transition-opacity ${off ? "opacity-35" : ""}`}
            >
              <span className="w-3 h-3 rounded-sm" style={{ background: s.color }} />
              <span className={off ? "line-through text-slate-400" : "text-slate-600"}>
                {s.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
