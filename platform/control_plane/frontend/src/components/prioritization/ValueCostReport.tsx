import { useMemo } from 'react';
import {
  CartesianGrid,
  Label,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts';
import type { UseCase } from '../../api/client';

type Props = {
  open: boolean;
  onClose: () => void;
  items: UseCase[];
};

const VALUE_WEIGHTS = {
  business_value: 0.35,
  strategic_alignment: 0.25,
  org_readiness: 0.15,
  technical_feasibility: 0.15,
  risk_governance: 0.10,
} as const;

const AI_COLORS: Record<string, string> = {
  'Traditional ML': '#2563eb',
  'Generative AI': '#7c3aed',
  'Agentic AI': '#c026d3',
};

type Point = {
  id: string;
  name: string;
  ai_type: string;
  x: number;
  y: number;
  components: {
    business_value: number;
    strategic_alignment: number;
    org_readiness: number;
    technical_feasibility: number;
    risk_governance: number;
    cost_efficiency: number;
    cost_index: number;
    overall_value: number;
  };
};

function buildPoints(items: UseCase[]): Point[] {
  return items.map((u) => {
    const sub = (u.computed?.dimension_subtotals as any) || {};
    const bv = Number(sub.business_value ?? 0);
    const sa = Number(sub.strategic_alignment ?? 0);
    const orr = Number(sub.org_readiness ?? 0);
    const tf = Number(sub.technical_feasibility ?? 0);
    const rg = Number(sub.risk_governance ?? 0);
    const ce = Number(sub.cost_efficiency ?? 0);

    const overall_value =
      VALUE_WEIGHTS.business_value * bv
      + VALUE_WEIGHTS.strategic_alignment * sa
      + VALUE_WEIGHTS.org_readiness * orr
      + VALUE_WEIGHTS.technical_feasibility * tf
      + VALUE_WEIGHTS.risk_governance * rg;

    // cost_efficiency: 5 = cheap, 1 = expensive. Flip so 5 = expensive on the x-axis.
    const cost_index = 6 - ce;

    return {
      id: u.use_case_id,
      name: u.name,
      ai_type: u.ai_type,
      x: clamp(cost_index, 1, 5),
      y: clamp(overall_value, 1, 5),
      components: {
        business_value: bv,
        strategic_alignment: sa,
        org_readiness: orr,
        technical_feasibility: tf,
        risk_governance: rg,
        cost_efficiency: ce,
        cost_index,
        overall_value,
      },
    };
  });
}

function clamp(n: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, n)); }

function quadrantOf(p: Point): 'quick_win' | 'strategic_bet' | 'fill_in' | 'avoid' {
  const highValue = p.y >= 3;
  const highCost = p.x >= 3;
  if (highValue && !highCost) return 'quick_win';
  if (highValue && highCost) return 'strategic_bet';
  if (!highValue && !highCost) return 'fill_in';
  return 'avoid';
}

const QUADRANT_LABEL: Record<ReturnType<typeof quadrantOf>, string> = {
  quick_win: 'Quick Win',
  strategic_bet: 'Strategic Bet',
  fill_in: 'Fill-in',
  avoid: 'Avoid / Reconsider',
};

const QUADRANT_BADGE: Record<ReturnType<typeof quadrantOf>, string> = {
  quick_win: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  strategic_bet: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  fill_in: 'bg-slate-50 text-slate-600 border-slate-200',
  avoid: 'bg-red-50 text-red-700 border-red-200',
};

export default function ValueCostReport({ open, onClose, items }: Props) {
  const points = useMemo(() => buildPoints(items), [items]);

  const grouped = useMemo(() => {
    const groups: Record<string, Point[]> = {};
    points.forEach((p) => {
      const k = p.ai_type || 'Other';
      if (!groups[k]) groups[k] = [];
      groups[k].push(p);
    });
    return groups;
  }, [points]);

  const counts = useMemo(() => {
    const c = { quick_win: 0, strategic_bet: 0, fill_in: 0, avoid: 0 };
    points.forEach((p) => { c[quadrantOf(p)]++; });
    return c;
  }, [points]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-stretch overflow-y-auto">
      <div className="w-full bg-white animate-fade-in-scale">
        <div className="max-w-7xl mx-auto px-6 py-8">
          {/* Header */}
          <div className="flex items-start justify-between gap-4 mb-6">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-violet-700 mb-1">Report</div>
              <h2 className="text-2xl font-semibold text-slate-900 tracking-tight">Value vs. Cost Quadrant</h2>
              <p className="text-sm text-slate-500 mt-1 max-w-3xl">
                Overall Value blends Business Value (35%), Strategic Alignment (25%), Org Readiness (15%), Technical Feasibility (15%), and Risk &amp; Governance (10%).
                Cost is the inverse of the Cost Efficiency sub-criteria (Implementation Cost, Ongoing OpEx, ROI Timeline).
              </p>
            </div>
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:border-slate-400"
            >
              Close
            </button>
          </div>

          {/* Quadrant counts */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <QuadrantStat label="Quick Wins" hint="Low cost · High value" value={counts.quick_win} tone="emerald" />
            <QuadrantStat label="Strategic Bets" hint="High cost · High value" value={counts.strategic_bet} tone="indigo" />
            <QuadrantStat label="Fill-ins" hint="Low cost · Low value" value={counts.fill_in} tone="slate" />
            <QuadrantStat label="Avoid / Reconsider" hint="High cost · Low value" value={counts.avoid} tone="red" />
          </div>

          {/* Chart */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 mb-6">
            <div className="h-[480px]">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 24, right: 140, bottom: 56, left: 56 }}>
                  <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
                  <XAxis
                    type="number"
                    dataKey="x"
                    domain={[1, 5]}
                    ticks={[1, 2, 3, 4, 5]}
                    stroke="#64748b"
                    tick={{ fontSize: 12 }}
                  >
                    <Label value="Cost  (1 = lowest cost · 5 = highest cost)" position="bottom" offset={28} style={{ fontSize: 12, fill: '#475569' }} />
                  </XAxis>
                  <YAxis
                    type="number"
                    dataKey="y"
                    domain={[1, 5]}
                    ticks={[1, 2, 3, 4, 5]}
                    stroke="#64748b"
                    tick={{ fontSize: 12 }}
                  >
                    <Label value="Overall Value (1-5)" position="left" angle={-90} offset={32} style={{ fontSize: 12, fill: '#475569' }} />
                  </YAxis>
                  <ZAxis range={[120, 120]} />

                  <ReferenceLine x={3} stroke="#94a3b8" strokeDasharray="4 4" />
                  <ReferenceLine y={3} stroke="#94a3b8" strokeDasharray="4 4" />

                  {/* Quadrant labels */}
                  <ReferenceLine y={4.85} stroke="transparent" ifOverflow="extendDomain">
                    <Label value="Quick Wins" position="insideTopLeft" style={{ fontSize: 11, fontWeight: 700, fill: '#047857' }} />
                    <Label value="Strategic Bets" position="insideTopRight" style={{ fontSize: 11, fontWeight: 700, fill: '#4338ca' }} />
                  </ReferenceLine>
                  <ReferenceLine y={1.15} stroke="transparent" ifOverflow="extendDomain">
                    <Label value="Fill-ins" position="insideBottomLeft" style={{ fontSize: 11, fontWeight: 700, fill: '#64748b' }} />
                    <Label value="Avoid / Reconsider" position="insideBottomRight" style={{ fontSize: 11, fontWeight: 700, fill: '#b91c1c' }} />
                  </ReferenceLine>

                  <Tooltip content={<PointTooltip />} />

                  {Object.entries(grouped).map(([ai, pts]) => (
                    <Scatter
                      key={ai}
                      name={ai}
                      data={pts}
                      fill={AI_COLORS[ai] || '#64748b'}
                      stroke="#fff"
                      strokeWidth={1.5}
                    >
                      <LabelList dataKey="name" content={renderPointLabel} />
                    </Scatter>
                  ))}
                </ScatterChart>
              </ResponsiveContainer>
            </div>

            {/* Legend */}
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-3 text-xs">
              {Object.entries(grouped).map(([ai, pts]) => (
                <div key={ai} className="inline-flex items-center gap-2 text-slate-600">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: AI_COLORS[ai] || '#64748b' }} />
                  <span className="font-medium">{ai}</span>
                  <span className="text-slate-400">({pts.length})</span>
                </div>
              ))}
              {points.length === 0 && (
                <span className="text-slate-400">No use cases match the current filters.</span>
              )}
            </div>
          </div>

          {/* Per-UC value composition table */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-200 bg-slate-50/60">
              <h3 className="text-sm font-semibold text-slate-800">Overall Value composition</h3>
              <p className="text-[11px] text-slate-500 mt-0.5">All component scores are 1-5 (5 = best). Cost Index is `6 − Cost Efficiency`.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[960px] text-sm">
                <thead className="bg-white">
                  <tr className="text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-100">
                    <th className="px-5 py-2.5">Use Case</th>
                    <th className="px-3 py-2.5">AI Type</th>
                    <th className="px-3 py-2.5 text-right">BV ×0.35</th>
                    <th className="px-3 py-2.5 text-right">SA ×0.25</th>
                    <th className="px-3 py-2.5 text-right">OR ×0.15</th>
                    <th className="px-3 py-2.5 text-right">TF ×0.15</th>
                    <th className="px-3 py-2.5 text-right">RG ×0.10</th>
                    <th className="px-3 py-2.5 text-right">Cost Idx</th>
                    <th className="px-3 py-2.5 text-right">Value</th>
                    <th className="px-3 py-2.5">Quadrant</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {points
                    .slice()
                    .sort((a, b) => b.y - a.y)
                    .map((p) => {
                      const q = quadrantOf(p);
                      return (
                        <tr key={p.id} className="hover:bg-slate-50/40">
                          <td className="px-5 py-2.5 font-medium text-slate-800 truncate max-w-[280px]">{p.name}</td>
                          <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">{p.ai_type}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">{p.components.business_value.toFixed(2)}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">{p.components.strategic_alignment.toFixed(2)}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">{p.components.org_readiness.toFixed(2)}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">{p.components.technical_feasibility.toFixed(2)}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">{p.components.risk_governance.toFixed(2)}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">{p.components.cost_index.toFixed(2)}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums font-bold text-slate-900">{p.components.overall_value.toFixed(2)}</td>
                          <td className="px-3 py-2.5">
                            <span className={`inline-block text-[10px] font-bold px-2 py-1 rounded-full border ${QUADRANT_BADGE[q]}`}>
                              {QUADRANT_LABEL[q]}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  {points.length === 0 && (
                    <tr><td colSpan={10} className="px-5 py-8 text-center text-sm text-slate-400">No use cases to show.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function QuadrantStat({ label, hint, value, tone }: { label: string; hint: string; value: number; tone: 'emerald' | 'indigo' | 'slate' | 'red' }) {
  const toneMap: Record<string, string> = {
    emerald: 'from-emerald-500 to-teal-600',
    indigo: 'from-indigo-500 to-violet-600',
    slate: 'from-slate-400 to-slate-600',
    red: 'from-red-500 to-pink-600',
  };
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4">
      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{label}</div>
      <div className={`text-2xl font-bold bg-gradient-to-r ${toneMap[tone]} bg-clip-text text-transparent mt-1 tabular-nums`}>{value}</div>
      <div className="text-[11px] text-slate-500 mt-0.5">{hint}</div>
    </div>
  );
}

function renderPointLabel(props: any) {
  const { x, y, value, viewBox } = props;
  const raw =
    typeof value === 'string' ? value
    : Array.isArray(value) ? String(value[0] ?? '')
    : value != null ? String(value)
    : '';
  if (!raw || typeof x !== 'number' || typeof y !== 'number') return null;

  const trimmed = raw.length > 24 ? raw.slice(0, 22) + '…' : raw;
  const DOT_RADIUS = 7;

  return (
    <text
      x={x + DOT_RADIUS + 8}
      y={y + 6}
      dy="0.32em"
      textAnchor="start"
      style={{ fontSize: 10, fontWeight: 600, fill: '#334155', pointerEvents: 'none' }}
    >
      {trimmed}
    </text>
  );
}

function PointTooltip({ active, payload }: any) {
  if (!active || !payload || !payload.length) return null;
  const p = payload[0].payload as Point;
  const q = quadrantOf(p);
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg p-3 text-xs min-w-[240px]">
      <div className="font-semibold text-slate-800 mb-1">{p.name}</div>
      <div className="text-slate-500 mb-2">{p.ai_type} · <span className="font-semibold text-slate-700">{QUADRANT_LABEL[q]}</span></div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-slate-600">
        <div>Business Value</div><div className="text-right tabular-nums">{p.components.business_value.toFixed(2)}</div>
        <div>Strategic Alignment</div><div className="text-right tabular-nums">{p.components.strategic_alignment.toFixed(2)}</div>
        <div>Org Readiness</div><div className="text-right tabular-nums">{p.components.org_readiness.toFixed(2)}</div>
        <div>Technical Feasibility</div><div className="text-right tabular-nums">{p.components.technical_feasibility.toFixed(2)}</div>
        <div>Risk &amp; Governance</div><div className="text-right tabular-nums">{p.components.risk_governance.toFixed(2)}</div>
        <div className="text-slate-500">Cost Efficiency</div><div className="text-right tabular-nums">{p.components.cost_efficiency.toFixed(2)}</div>
      </div>
      <div className="mt-2 pt-2 border-t border-slate-100 grid grid-cols-2 gap-x-3 text-slate-800 font-semibold">
        <div>Cost Index</div><div className="text-right tabular-nums">{p.components.cost_index.toFixed(2)}</div>
        <div>Overall Value</div><div className="text-right tabular-nums">{p.components.overall_value.toFixed(2)}</div>
      </div>
    </div>
  );
}
