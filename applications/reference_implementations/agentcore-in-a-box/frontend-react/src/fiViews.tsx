// fiViews.tsx — production-grade fixed-income visualizations for the new bond tools.
// These render the REAL outputs of the FI swarm (curve_lookup, spread_lookup, bond_screen,
// price_bond, portfolio_risk, evolve_portfolio) at the quant-weather bar: KPI tiles with
// benchmark deltas, an evolutionary fitness curve + leaderboard, rate-shock stress profiles,
// rating/sector allocation, and the Treasury curve. Every number traces to the real data.
//
// All components are defensive: bad/partial data falls back to the shared RawFallback. They
// never throw (the ToolResultView error boundary is the final net).

import * as React from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Dna, TrendingUp, TrendingDown, Layers, Activity, Gauge, ArrowRight } from 'lucide-react';
import { cn } from './lib/cn';
import { Panel } from './components/ui/Panel';
import { Card } from './components/ui/Card';

// ── shared helpers ───────────────────────────────────────────────────────────
// NOTE: num / money / Kpi are also consumed by govViews.tsx (the identity-governed
// HoldingsView) — keep them exported so both files render at the same bar.
export function num(v: unknown, d = 0): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? parseFloat(v) : NaN;
  return Number.isFinite(n) ? n : d;
}
const RATING_TONE: Record<string, string> = {
  AAA: 'var(--chart-1)', AA: 'var(--chart-2)', A: 'var(--chart-3)',
  BBB: 'var(--chart-4)', BB: 'var(--chart-5)', B: 'var(--destructive)', CCC: '#7f1d1d',
};
// Chart tokens first, then muted engraving-ink overflow tones (harmonize with the paper
// palette rather than the old neon set) for books with more than five sectors.
const SECTOR_VARS = [
  'var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)',
  '#7a6a3e', '#4a6a7a', '#8a5a6a', '#5a7a5a', '#6a5a8a', '#a8763e',
];
const sectorColor = (i: number) => SECTOR_VARS[((i % SECTOR_VARS.length) + SECTOR_VARS.length) % SECTOR_VARS.length];

function fmt(n: number, dp = 2): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp });
}
function signed(n: number, dp = 2, unit = ''): string {
  const s = n > 0 ? '+' : n < 0 ? '−' : '';
  return `${s}${fmt(Math.abs(n), dp)}${unit}`;
}

/** Compact money formatter: $8.85B / $465.3M / $12.4K. (Shared with govViews.HoldingsView.) */
export function money(v: unknown, dp = 1): string {
  const n = num(v);
  const a = Math.abs(n);
  const sign = n < 0 ? '−' : '';
  if (a >= 1e9) return `${sign}$${fmt(a / 1e9, dp)}B`;
  if (a >= 1e6) return `${sign}$${fmt(a / 1e6, dp)}M`;
  if (a >= 1e3) return `${sign}$${fmt(a / 1e3, dp === 1 ? 0 : dp)}K`;
  return `${sign}$${fmt(a, 0)}`;
}

/** A KPI tile: big value, optional benchmark delta (green/red), optional caption. */
export function Kpi({
  label, value, delta, deltaUnit = '', caption, tone = 'neutral',
}: {
  label: string; value: string; delta?: number; deltaUnit?: string; caption?: string;
  tone?: 'pos' | 'neg' | 'neutral';
}): JSX.Element {
  const valTone = tone === 'pos' ? 'text-ok' : tone === 'neg' ? 'text-destructive' : 'text-foreground';
  return (
    <Card variant="elevated" className="px-3 py-2.5">
      <div className="field-key truncate">{label}</div>
      <div className={cn('tabular mt-0.5 text-lg font-semibold leading-none', valTone)}>{value}</div>
      {delta !== undefined && (
        <div className={cn('tabular mt-1 text-[11px] font-medium', delta >= 0 ? 'text-ok' : 'text-destructive')}>
          {signed(delta, 2, deltaUnit)} {caption || 'vs Agg'}
        </div>
      )}
      {delta === undefined && caption && (
        <div className="mt-1 text-[10.5px] text-muted-foreground">{caption}</div>
      )}
    </Card>
  );
}

function ChartTip({ active, payload, label, unit }: any): JSX.Element | null {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 shadow-lg">
      {label != null && label !== '' && <div className="field-key mb-1">{String(label)}</div>}
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center gap-2 text-xs">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: p.color || p.fill || 'var(--chart-1)' }} />
          <span className="text-muted-foreground">{p.name ?? p.dataKey}</span>
          <span className="tabular text-foreground">{typeof p.value === 'number' ? fmt(p.value, 3) : String(p.value)}{unit ?? ''}</span>
        </div>
      ))}
    </div>
  );
}

// ── allocation: rating + sector mix as stacked horizontal bars ─────────────────
function MixBars({ mix, kind }: { mix: Record<string, number>; kind: 'rating' | 'sector' }): JSX.Element | null {
  const entries = Object.entries(mix).filter(([, v]) => num(v) > 0.01).sort((a, b) => num(b[1]) - num(a[1]));
  if (!entries.length) return null;
  const max = Math.max(...entries.map(([, v]) => num(v)));
  return (
    <div className="flex flex-col gap-1.5">
      {entries.map(([k, v], i) => {
        const w = max > 0 ? Math.max(2, (num(v) / max) * 100) : 0;
        const color = kind === 'rating' ? (RATING_TONE[k] || sectorColor(i)) : sectorColor(i);
        return (
          <div key={k} className="flex items-center gap-2">
            <span className="w-24 shrink-0 truncate text-[11px] text-foreground" title={k}>{k}</span>
            <div className="relative h-3 flex-1 overflow-hidden rounded bg-secondary">
              <div className="h-full rounded" style={{ width: `${w}%`, background: color, opacity: 0.9 }} />
            </div>
            <span className="tabular w-12 shrink-0 text-right text-[11px] text-muted-foreground">{fmt(num(v), 1)}%</span>
          </div>
        );
      })}
    </div>
  );
}

// ── 1. Evolutionary portfolio construction (the flagship) ──────────────────────
export function EvolveView({ data }: { data: any }): JSX.Element {
  const gens: any[] = Array.isArray(data?.generations) ? data.generations : [];
  const board: any[] = Array.isArray(data?.leaderboard) ? data.leaderboard : [];
  const winner = data?.winner;
  const m = winner?.metrics || {};
  const source: string = typeof data?.source === 'string' ? data.source : '';

  const curve = gens.map((g) => ({
    gen: `G${g.generation}`,
    best: num(g.best_fitness),
    avg: num(g.avg_fitness),
  }));

  return (
    <div className="flex flex-col gap-3">
      {/* Winner KPI row */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Kpi label="Yield (YTM)" value={`${fmt(num(m.yield))}%`} delta={num(m.yield_pickup_vs_agg)} deltaUnit="%" tone="pos" />
        <Kpi label="Duration" value={`${fmt(num(m.duration))}y`} caption={m.duration_gap != null ? `${signed(num(m.duration_gap))}y vs target` : 'modified'} />
        <Kpi label="Tracking error" value={fmt(num(m.tracking_error))} caption="bps-equiv vs Agg" />
        <Kpi label="+200bps stress" value={`${fmt(num(m.stress_200bps))}%`} tone={num(m.stress_200bps) < 0 ? 'neg' : 'pos'} caption="price impact" />
      </div>

      {/* Fitness-by-generation — the evolution proof */}
      {curve.length >= 2 && (
        <Panel
          title={<span className="flex items-center gap-1.5"><Dna size={12} /> evolutionary search · fitness by generation</span>}
          action={data?.evaluated_total ? `${data.evaluated_total} portfolios evaluated` : undefined}
          className="h-[200px]"
        >
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={curve} margin={{ top: 8, right: 10, left: -12, bottom: 2 }}>
              <defs>
                <linearGradient id="fitFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <XAxis dataKey="gen" tick={{ fontSize: 11, fill: 'var(--chart-axis)' }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--chart-axis)' }} tickLine={false} axisLine={false} width={40} domain={['auto', 'auto']} />
              <Tooltip content={<ChartTip />} />
              <Area type="monotone" dataKey="best" name="best fitness" stroke="var(--chart-1)" strokeWidth={2} fill="url(#fitFill)" dot={{ r: 2.5, fill: 'var(--chart-1)', strokeWidth: 0 }} />
              <Line type="monotone" dataKey="avg" name="population avg" stroke="var(--chart-3)" strokeWidth={1.5} strokeDasharray="4 3" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </Panel>
      )}

      {/* Allocation: rating + sector mix of the winner */}
      {(m.rating_mix || m.sector_mix) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {m.rating_mix && (
            <Panel title={<span className="flex items-center gap-1.5"><Layers size={12} /> winner · rating mix</span>} className="h-auto">
              <MixBars mix={m.rating_mix} kind="rating" />
            </Panel>
          )}
          {m.sector_mix && (
            <Panel title="winner · sector mix" className="h-auto">
              <MixBars mix={m.sector_mix} kind="sector" />
            </Panel>
          )}
        </div>
      )}

      {/* Leaderboard — the quant-weather strategy board analog */}
      {board.length > 0 && (
        <Panel title="portfolio leaderboard" action={`top ${board.length}`} className="h-auto">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="field-key">
                  {['#', 'Fitness', 'Yield', 'Duration', 'TE', '+200bps', 'Bonds', 'Diversif.'].map((h) => (
                    <th key={h} className="whitespace-nowrap border-b border-border px-2 py-1.5">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {board.map((row, i) => (
                  <tr key={i} className={cn('border-b border-border/50 last:border-0', i === 0 && 'bg-primary/5')}>
                    <td className="px-2 py-1.5 tabular text-muted-foreground">{row.rank ?? i + 1}</td>
                    <td className="px-2 py-1.5 tabular font-semibold text-primary">{fmt(num(row.fitness), 4)}</td>
                    <td className="px-2 py-1.5 tabular text-foreground">{fmt(num(row.yield))}%</td>
                    <td className="px-2 py-1.5 tabular text-foreground">{fmt(num(row.duration))}y</td>
                    <td className="px-2 py-1.5 tabular text-muted-foreground">{fmt(num(row.tracking_error))}</td>
                    <td className={cn('px-2 py-1.5 tabular', num(row.stress_200bps) < 0 ? 'text-destructive' : 'text-ok')}>{fmt(num(row.stress_200bps), 1)}%</td>
                    <td className="px-2 py-1.5 tabular text-muted-foreground">{row.n_bonds ?? '—'}</td>
                    <td className="px-2 py-1.5 tabular text-muted-foreground">{fmt(num(row.diversification), 2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {/* Winning trade list (top holdings) */}
      {Array.isArray(winner?.holdings) && winner.holdings.length > 0 && (
        <Panel title="winning portfolio · top holdings" action={`${winner.holdings.length} names`} className="h-auto">
          <HoldingsTable holdings={winner.holdings} />
        </Panel>
      )}

      {source && (
        <p className="px-1 text-[10.5px] italic text-muted-foreground">{source}{data?.eligible_pool ? ` · ${data.eligible_pool} eligible bonds` : ''}</p>
      )}
    </div>
  );
}

function HoldingsTable({ holdings }: { holdings: any[] }): JSX.Element {
  const top = [...holdings].sort((a, b) => num(b.weight) - num(a.weight)).slice(0, 12);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="field-key">
            {['Issuer', 'Ticker', 'Rating', 'Sector', 'YTM', 'Dur', 'Weight'].map((h) => (
              <th key={h} className="whitespace-nowrap border-b border-border px-2 py-1.5">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {top.map((h, i) => (
            <tr key={i} className="border-b border-border/50 last:border-0">
              <td className="px-2 py-1.5 text-foreground max-w-[160px] truncate" title={h.issuer}>{h.issuer || '—'}</td>
              <td className="px-2 py-1.5 tabular text-foreground">{h.ticker || '—'}</td>
              <td className="px-2 py-1.5"><span className="rounded px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: `color-mix(in srgb, ${RATING_TONE[h.rating] || 'var(--chart-3)'} 18%, transparent)`, color: RATING_TONE[h.rating] || 'var(--chart-3)' }}>{h.rating || '—'}</span></td>
              <td className="px-2 py-1.5 text-muted-foreground">{h.sector || '—'}</td>
              <td className="px-2 py-1.5 tabular text-foreground">{fmt(num(h.ytm))}%</td>
              <td className="px-2 py-1.5 tabular text-muted-foreground">{fmt(num(h.mod_duration), 1)}</td>
              <td className="px-2 py-1.5 tabular font-medium text-primary">{fmt(num(h.weight) * 100, 1)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── 2. Portfolio risk (duration/convexity/yield + rate-shock stress) ───────────
export function PortfolioRiskView({ data }: { data: any }): JSX.Element {
  const shocks = data?.rate_shocks_pct || {};
  const shockData = [
    { k: '−200bps', v: num(shocks['parallel_-200bps']) },
    { k: '−100bps', v: num(shocks['parallel_-100bps']) },
    { k: '+100bps', v: num(shocks['parallel_+100bps']) },
    { k: '+200bps', v: num(shocks['parallel_+200bps']) },
  ].filter((d) => Number.isFinite(d.v) && d.v !== 0);

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Kpi label="Weighted yield" value={`${fmt(num(data?.weighted_ytm))}%`} delta={data?.yield_pickup_vs_agg != null ? num(data.yield_pickup_vs_agg) : undefined} deltaUnit="%" tone="pos" />
        <Kpi label="Duration" value={`${fmt(num(data?.weighted_duration))}y`} delta={data?.duration_gap_vs_agg != null ? num(data.duration_gap_vs_agg) : undefined} deltaUnit="y" caption="vs Agg" />
        <Kpi label="Convexity" value={fmt(num(data?.weighted_convexity), 1)} caption="curvature cushion" />
        <Kpi label="OAS" value={`${fmt(num(data?.weighted_oas) * 100, 0)}bps`} caption="credit spread" />
      </div>

      {shockData.length > 0 && (
        <Panel
          title={<span className="flex items-center gap-1.5"><Gauge size={12} /> rate-shock stress · price impact</span>}
          action="parallel curve shift"
          className="h-[200px]"
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={shockData} margin={{ top: 8, right: 10, left: -12, bottom: 2 }}>
              <XAxis dataKey="k" tick={{ fontSize: 11, fill: 'var(--chart-axis)' }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--chart-axis)' }} tickLine={false} axisLine={false} width={40} tickFormatter={(v) => `${v}%`} />
              <Tooltip content={<ChartTip unit="%" />} />
              <ReferenceLine y={0} stroke="var(--border)" />
              <Bar dataKey="v" name="price impact" radius={[3, 3, 0, 0]}>
                {shockData.map((d, i) => (
                  <Cell key={i} fill={d.v >= 0 ? 'var(--ok)' : 'var(--destructive)'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Panel>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {data?.rating_mix_pct && (
          <Panel title={<span className="flex items-center gap-1.5"><Layers size={12} /> rating mix</span>} className="h-auto">
            <MixBars mix={data.rating_mix_pct} kind="rating" />
          </Panel>
        )}
        {data?.sector_mix_pct && (
          <Panel title="sector mix" className="h-auto">
            <MixBars mix={data.sector_mix_pct} kind="sector" />
          </Panel>
        )}
      </div>
    </div>
  );
}

// ── 3. Treasury curve (real, from FRED) ────────────────────────────────────────
export function CurveView({ data }: { data: any }): JSX.Element {
  const points: any[] = Array.isArray(data?.curve) ? data.curve : [];
  const chart = points
    .map((p) => ({ label: tenorLabel(num(p.months)), months: num(p.months), yield: num(p.yield) }))
    .filter((p) => p.yield > 0)
    .sort((a, b) => a.months - b.months);
  if (chart.length < 2) return <CurveTableOnly points={points} source={data?.source} asOf={data?.as_of} />;

  return (
    <Panel
      title={<span className="flex items-center gap-1.5"><Activity size={12} /> US Treasury par-yield curve</span>}
      action={data?.source || (data?.as_of ? `as of ${data.as_of}` : undefined)}
      className="h-[240px]"
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chart} margin={{ top: 8, right: 12, left: -10, bottom: 2 }}>
          <defs>
            <linearGradient id="curveFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--chart-2)" stopOpacity={0.3} />
              <stop offset="100%" stopColor="var(--chart-2)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--chart-axis)' }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fontSize: 11, fill: 'var(--chart-axis)' }} tickLine={false} axisLine={false} width={38} domain={['auto', 'auto']} tickFormatter={(v) => `${v}%`} />
          <Tooltip content={<ChartTip unit="%" />} />
          <Area type="monotone" dataKey="yield" name="yield" stroke="var(--chart-2)" strokeWidth={2} fill="url(#curveFill)" dot={{ r: 3, fill: 'var(--chart-2)', strokeWidth: 0 }} activeDot={{ r: 4 }} />
        </AreaChart>
      </ResponsiveContainer>
    </Panel>
  );
}

function CurveTableOnly({ points, source, asOf }: { points: any[]; source?: string; asOf?: string }): JSX.Element {
  return (
    <Panel title="US Treasury curve" action={source || asOf} className="h-auto">
      <div className="flex flex-wrap gap-1.5">
        {points.map((p, i) => (
          <span key={i} className="tabular rounded-md bg-secondary px-2 py-1 text-[11px]">
            {tenorLabel(num(p.months))} · {fmt(num(p.yield))}%
          </span>
        ))}
      </div>
    </Panel>
  );
}

function tenorLabel(months: number): string {
  if (months < 12) return `${Math.round(months)}M`;
  return `${Math.round(months / 12)}Y`;
}

// ── 4. Credit spread ladder ─────────────────────────────────────────────────--
export function SpreadView({ data }: { data: any }): JSX.Element {
  const ladder: any[] = Array.isArray(data?.ladder) ? data.ladder : [];
  const chart = ladder.map((r) => ({ rating: r.rating, oas: num(r.oas) * 100 })); // → bps
  // nosemgrep: jsx-not-internationalized (single-locale demo)
  if (!chart.length) return <Panel title="credit spreads" className="h-auto"><span className="text-xs text-muted-foreground">No spread data.</span></Panel>;
  return (
    <Panel
      title={<span className="flex items-center gap-1.5"><Activity size={12} /> ICE BofA credit-spread ladder (OAS)</span>}
      action={data?.source || (data?.as_of ? `as of ${data.as_of}` : undefined)}
      className="h-[200px]"
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chart} margin={{ top: 8, right: 10, left: -12, bottom: 2 }}>
          <XAxis dataKey="rating" tick={{ fontSize: 11, fill: 'var(--chart-axis)' }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fontSize: 11, fill: 'var(--chart-axis)' }} tickLine={false} axisLine={false} width={42} tickFormatter={(v) => `${v}bps`} />
          <Tooltip content={<ChartTip unit="bps" />} />
          <Bar dataKey="oas" name="OAS" radius={[3, 3, 0, 0]}>
            {chart.map((d, i) => (<Cell key={i} fill={RATING_TONE[d.rating] || sectorColor(i)} />))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </Panel>
  );
}

// ── 5. Bond screen results ─────────────────────────────────────────────────--
export function ScreenView({ data }: { data: any }): JSX.Element {
  const bonds: any[] = Array.isArray(data?.bonds) ? data.bonds : [];
  const s = data?.summary || {};
  // nosemgrep: jsx-not-internationalized (single-locale demo)
  if (!bonds.length) return <Panel title="bond screen" className="h-auto"><span className="text-xs text-muted-foreground">No bonds matched the screen.</span></Panel>;
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Kpi label="Matched" value={String(data?.matched ?? bonds.length)} caption={`showing ${bonds.length}`} />
        <Kpi label="Avg yield" value={`${fmt(num(s.avg_ytm))}%`} />
        <Kpi label="Avg duration" value={`${fmt(num(s.avg_duration))}y`} />
        <Kpi label="Avg OAS" value={`${fmt(num(s.avg_oas) * 100, 0)}bps`} />
      </div>
      <Panel title="screen results" action={`${bonds.length} bonds`} className="h-auto">
        <HoldingsLikeScreen bonds={bonds} />
      </Panel>
    </div>
  );
}

function HoldingsLikeScreen({ bonds }: { bonds: any[] }): JSX.Element {
  const top = bonds.slice(0, 18);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="field-key">
            {['Issuer', 'Ticker', 'Rating', 'Sector', 'Mat', 'YTM', 'Dur', 'OAS'].map((h) => (
              <th key={h} className="whitespace-nowrap border-b border-border px-2 py-1.5">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {top.map((b, i) => (
            <tr key={i} className="border-b border-border/50 last:border-0">
              <td className="px-2 py-1.5 text-foreground max-w-[150px] truncate" title={b.issuer}>{b.issuer || '—'}</td>
              <td className="px-2 py-1.5 tabular text-foreground">{b.ticker || '—'}</td>
              <td className="px-2 py-1.5"><span className="rounded px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: `color-mix(in srgb, ${RATING_TONE[b.rating] || 'var(--chart-3)'} 18%, transparent)`, color: RATING_TONE[b.rating] || 'var(--chart-3)' }}>{b.rating || '—'}</span></td>
              <td className="px-2 py-1.5 text-muted-foreground">{b.sector || '—'}</td>
              <td className="px-2 py-1.5 tabular text-muted-foreground">{fmt(num(b.years), 1)}y</td>
              <td className="px-2 py-1.5 tabular text-foreground">{fmt(num(b.ytm))}%</td>
              <td className="px-2 py-1.5 tabular text-muted-foreground">{fmt(num(b.mod_duration), 1)}</td>
              <td className="px-2 py-1.5 tabular text-muted-foreground">{fmt(num(b.oas) * 100, 0)}bps</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── 6. Price a bond ─────────────────────────────────────────────────────────--
export function PriceBondView({ data }: { data: any }): JSX.Element {
  const inp = data?.inputs || {};
  return (
    <Panel title="bond valuation" action={data?.curve_source || undefined} className="h-auto">
      <div className="flex flex-wrap items-baseline gap-2 text-sm">
        <span className="tabular text-base font-semibold text-foreground">{inp.years ? `${fmt(num(inp.years), 0)}y` : ''} {inp.rating || ''}</span>
        {inp.coupon != null && <span className="text-muted-foreground">· {fmt(num(inp.coupon))}% coupon</span>}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Kpi label="Treasury base" value={`${fmt(num(data?.treasury_base))}%`} />
        <Kpi label="+ OAS" value={`${fmt(num(data?.oas) * 100, 0)}bps`} caption={inp.rating} />
        <Kpi label="Yield" value={`${fmt(num(data?.ytm))}%`} tone="pos" />
        <Kpi label="Price" value={fmt(num(data?.price))} caption="per 100 face" />
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Kpi label="Mod duration" value={`${fmt(num(data?.mod_duration))}y`} />
        <Kpi label="Convexity" value={fmt(num(data?.convexity), 1)} />
        <Kpi label="DV01 /100" value={fmt(num(data?.dv01_per_100), 4)} />
      </div>
    </Panel>
  );
}
