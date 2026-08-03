// toolViews.tsx — renders AgentCore tool results as executive-grade financial
// visuals (donuts, allocation bars, KPI tiles, yield curves) with graceful,
// never-throwing fallback to pretty-printed JSON for bad parses / unknown tools.

import * as React from 'react';
import {
  Bar,
  BarChart,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Code2,
  FileText,
  Globe,
  Lock,
  LockOpen,
  ShieldAlert,
  TrendingDown,
  TrendingUp,
  CircleSlash,
} from 'lucide-react';
import { cn } from './lib/cn';
import { Panel } from './components/ui/Panel';
import { Card } from './components/ui/Card';
import {
  EvolveView,
  PortfolioRiskView,
  CurveView,
  SpreadView,
  ScreenView,
  PriceBondView,
} from './fiViews';
import { HoldingsView, MarketQuoteView } from './govViews';

// ── Public contract ─────────────────────────────────────────────────────────
export type ToolResultProps = { tool: string; args?: string; result?: string };

type DetectedTool =
  | 'positions'
  | 'trade'
  | 'vault'
  | 'userdata'
  | 'browser'
  | 'code'
  | 'evolve'
  | 'portfolio_risk'
  | 'curve'
  | 'spread'
  | 'screen'
  | 'price_bond'
  // capital markets — identity-governed DB (positions-db OpenAPI target)
  | 'holdings'
  // capital markets — internal EKS service exposed as a governed Gateway OpenAPI tool
  | 'market_quote'
  | 'unknown';

// ── Safe helpers ──────────────────────────────────────────────────────────--
/** Parse a JSON string, returning null on any failure (never throws). */
export function safeJson(s?: string): any | null {
  if (s == null) return null;
  if (typeof s !== 'string') return null;
  const trimmed = s.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

/** Strip any object key whose name starts with `__` (machine routing hints). */
function stripMachineKeys(obj: any): Record<string, any> {
  const out: Record<string, any> = {};
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return out;
  for (const k of Object.keys(obj)) {
    if (k.startsWith('__')) continue;
    out[k] = obj[k];
  }
  return out;
}

/** Parse a percent string like "35%" / "12.5 %" / 0.35 → number (in percent). */
function pct(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (typeof v === 'string') {
    const n = parseFloat(v.replace(/[^0-9.\-]/g, ''));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

const CHART_VARS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
];
const chartColor = (i: number) => CHART_VARS[((i % CHART_VARS.length) + CHART_VARS.length) % CHART_VARS.length];

function fmtPct(n: number): string {
  const r = Math.round(n * 10) / 10;
  return (Number.isInteger(r) ? r.toFixed(0) : r.toFixed(1)) + '%';
}

/** Truncate a long string for compact display (e.g. a code-interpreter arg blob). */
function truncStr(s: string, max = 90): string {
  const oneLine = s.replace(/\s+/g, ' ').trim();
  return oneLine.length > max ? oneLine.slice(0, max) + '…' : oneLine;
}

/** A UUID-ish opaque id we should NOT surface as a human "PM" label. */
function looksLikeUuid(s: unknown): boolean {
  return typeof s === 'string' && /^[0-9a-f]{6,}-[0-9a-f-]{6,}/i.test(s);
}

/** PM label shown on cards — only if it reads as a name, never a raw id. */
function pmLabel(pm: unknown): string | undefined {
  return typeof pm === 'string' && pm && !looksLikeUuid(pm) ? `pm · ${pm}` : undefined;
}

// ── Tool detection ────────────────────────────────────────────────────────--
export function detectTool(label: string, args?: string): DetectedTool {
  // Priority 1: a smuggled `__tool` raw machine name inside args.
  const parsed = safeJson(args);
  const raw =
    parsed && typeof parsed === 'object' && typeof parsed.__tool === 'string'
      ? String(parsed.__tool)
      : '';
  const rawMap: Record<string, DetectedTool> = {
    positions_view: 'positions',
    trade_execute: 'trade',
    secure_vault: 'vault',
    user_data_lookup: 'userdata',
    web_browser: 'browser',
    code_interpreter: 'code',
    // Fixed-income tools.
    evolve_portfolio: 'evolve',
    portfolio_risk: 'portfolio_risk',
    curve_lookup: 'curve',
    spread_lookup: 'spread',
    bond_screen: 'screen',
    price_bond: 'price_bond',
    // Capital markets — identity-governed DB.
    query_holdings: 'holdings',
    // Capital markets — internal EKS service via a Gateway OpenAPI target. The Gateway namespaces
    // the tool as "<target>___<tool>"; the runtime may surface either the bare or namespaced name.
    market_quote: 'market_quote',
    'market-data___market_quote': 'market_quote',
  };
  if (raw && rawMap[raw]) return rawMap[raw];

  // Priority 2: substring-match the human label.
  const l = (label || '').toLowerCase();
  // Check governed-DB holdings before the generic 'positions' check below, since "Client
  // Holdings" is desk data, not the 3LO positions view.
  if (l.includes('holdings')) return 'holdings';
  // EKS market-data tool — match the label ("Market Quotes (EKS)") and the namespaced action.
  if (l.includes('market quote') || l.includes('market-data') || l.includes('market data')) return 'market_quote';
  if (l.includes('evolve portfolio') || l.includes('evolve')) return 'evolve';
  if (l.includes('portfolio risk')) return 'portfolio_risk';
  if (l.includes('treasury curve') || l.includes('curve')) return 'curve';
  if (l.includes('spread ladder') || l.includes('credit spread')) return 'spread';
  if (l.includes('bond screen')) return 'screen';
  if (l.includes('price bond')) return 'price_bond';
  if (l.includes('view positions') || l.includes('positions')) return 'positions';
  if (l.includes('execute trade') || l.includes('trade')) return 'trade';
  if (l.includes('secure vault') || l.includes('vault')) return 'vault';
  if (l.includes('data lookup')) return 'userdata';
  if (l.includes('web browser') || l.includes('browser')) return 'browser';
  if (l.includes('code interpreter') || l.includes('code')) return 'code';
  return 'unknown';
}

// ── Shared primitives ─────────────────────────────────────────────────────--
function ChartTooltip({
  active,
  payload,
  label,
  unit,
}: {
  active?: boolean;
  payload?: any[];
  label?: any;
  unit?: string;
}): JSX.Element | null {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 shadow-lg">
      {label != null && label !== '' && (
        <div className="field-key mb-1">{String(label)}</div>
      )}
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2 text-xs">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ background: (p.payload && p.payload.fill) || p.color || 'var(--chart-1)' }}
          />
          <span className="text-muted-foreground">{p.name ?? p.dataKey}</span>
          <span className="font-mono tabular-nums text-foreground">
            {typeof p.value === 'number' ? fmtPct(p.value) : String(p.value)}
            {unit ?? ''}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Compact summary of real args (after stripping `__` keys). */
function ArgsSummary({ args }: { args?: string }): JSX.Element | null {
  const parsed = safeJson(args);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const clean = stripMachineKeys(parsed);
  const entries = Object.entries(clean);
  if (!entries.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {entries.map(([k, v]) => {
        const raw = typeof v === 'object' ? JSON.stringify(v) : String(v);
        // Long values (e.g. a code_interpreter `code` blob) are collapsed to a
        // compact preview so the arg chip never becomes a wall of text.
        const display = truncStr(raw);
        return (
          <span
            key={k}
            title={raw.length > display.length ? raw : undefined}
            className="inline-flex max-w-full items-center gap-1 rounded-md bg-secondary px-2 py-0.5 text-[11px]"
          >
            <span className="field-key shrink-0">{k}</span>
            <span className="truncate font-mono tabular-nums text-secondary-foreground">{display}</span>
          </span>
        );
      })}
    </div>
  );
}

/** A horizontal allocation bar (ticker → weight%) with optional highlight tag. */
function AllocBar({
  ticker,
  weight,
  max,
  color,
  highlight,
}: {
  ticker: string;
  weight: number;
  max: number;
  color: string;
  highlight?: boolean;
}): JSX.Element {
  const w = max > 0 ? Math.max(2, (weight / max) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <span
        className={cn(
          'w-16 shrink-0 font-mono text-xs tabular-nums',
          highlight ? 'text-primary font-semibold' : 'text-foreground',
        )}
      >
        {ticker}
      </span>
      <div className="relative h-3 flex-1 overflow-hidden rounded bg-secondary">
        <div
          className="h-full rounded transition-all"
          style={{
            width: `${w}%`,
            background: highlight ? 'var(--chart-1)' : color,
            opacity: highlight ? 1 : 0.85,
          }}
        />
      </div>
      {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
      {highlight && (
        <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
          traded
        </span>
      )}
      <span className="w-12 shrink-0 text-right font-mono text-xs tabular-nums text-muted-foreground">
        {fmtPct(weight)}
      </span>
    </div>
  );
}

/** Clean fallback: pretty JSON or raw string in a mono <pre>. */
function RawFallback({ result }: { result?: string }): JSX.Element {
  const parsed = safeJson(result);
  const text =
    parsed != null
      ? JSON.stringify(parsed, null, 2)
      : result != null && String(result).length
        ? String(result)
        : '— no result —';
  return (
    <Panel title="Result" dense>
      <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words text-xs font-mono text-muted-foreground">
        {text}
      </pre>
    </Panel>
  );
}

// ── 1. Positions ────────────────────────────────────────────────────────────
function PositionsView({ result }: { result?: string }): JSX.Element {
  const data = safeJson(result);
  if (!data || typeof data !== 'object') return <RawFallback result={result} />;
  const pmTag = pmLabel(data.pm);
  const funds: any[] = Array.isArray(data.positions) ? data.positions : [];

  // A fund with no holdings (positions: []) is a valid, common answer — show a
  // clean empty state, never raw JSON with the opaque PM id.
  if (!funds.length) {
    return (
      <Panel title="Positions" action={pmTag} className="h-auto">
        <div className="flex items-center gap-2 py-1 text-[13px] text-muted-foreground">
          <CircleSlash size={15} className="shrink-0" />
          No positions on record for this fund.
        </div>
      </Panel>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {funds.map((fund, fi) => {
        const fundName =
          fund && typeof fund.dataType === 'string' ? fund.dataType : `Fund ${fi + 1}`;
        const rawPos =
          fund && fund.positions && typeof fund.positions === 'object'
            ? fund.positions
            : {};
        const rows = Object.entries(rawPos as Record<string, unknown>)
          .map(([ticker, w]) => ({ ticker, weight: pct(w) }))
          .filter((r) => r.weight > 0)
          .sort((a, b) => b.weight - a.weight);
        if (!rows.length) return null;
        const max = rows[0].weight;
        const pieData = rows.map((r, i) => ({
          name: r.ticker,
          value: r.weight,
          fill: chartColor(i),
        }));

        return (
          <Panel
            key={fi}
            title={fundName}
            action={pmTag}
            className="h-auto"
          >
            <div className="flex flex-col gap-3">
              <div className="h-[150px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      dataKey="value"
                      nameKey="name"
                      innerRadius="58%"
                      outerRadius="92%"
                      paddingAngle={2}
                      stroke="var(--elevated)"
                      strokeWidth={1.5}
                    >
                      {pieData.map((d, i) => (
                        <Cell key={i} fill={d.fill} />
                      ))}
                    </Pie>
                    <Tooltip content={<ChartTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-col gap-1.5">
                {rows.map((r, i) => (
                  <AllocBar
                    key={r.ticker}
                    ticker={r.ticker}
                    weight={r.weight}
                    max={max}
                    color={chartColor(i)}
                  />
                ))}
              </div>
            </div>
          </Panel>
        );
      })}
    </div>
  );
}

// ── 2. Trade ────────────────────────────────────────────────────────────────
function TradeView({ result }: { result?: string }): JSX.Element {
  const data = safeJson(result);
  if (!data || typeof data !== 'object') return <RawFallback result={result} />;

  const side: string = typeof data.side === 'string' ? data.side.toLowerCase() : '';
  const ticker: string = typeof data.ticker === 'string' ? data.ticker : '';
  const fund: string = typeof data.fund === 'string' ? data.fund : '';
  const target: string =
    typeof data.target_allocation === 'string'
      ? data.target_allocation
      : data.target_allocation != null
        ? String(data.target_allocation)
        : '';
  const pmTag = pmLabel(data.pm);

  const rawPos =
    data.positions && typeof data.positions === 'object' ? data.positions : {};
  const rows = Object.entries(rawPos as Record<string, unknown>)
    .map(([t, w]) => ({ ticker: t, weight: pct(w) }))
    .filter((r) => r.weight > 0)
    .sort((a, b) => b.weight - a.weight);
  const max = rows.length ? rows[0].weight : 0;

  const sideColor =
    side === 'buy' ? 'text-ok' : side === 'sell' ? 'text-destructive' : 'text-foreground';

  return (
    <Panel
      title={fund || 'Trade Execution'}
      action={pmTag}
      className="h-auto"
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline gap-2 text-sm">
          {side && (
            <span className={cn('font-mono font-bold uppercase tracking-wide', sideColor)}>
              {side}
            </span>
          )}
          {ticker && (
            <span className="font-mono text-base font-semibold tabular-nums text-foreground">
              {ticker}
            </span>
          )}
          {target && (
            <>
              <span className="text-muted-foreground">→</span>
              <span className="font-mono tabular-nums text-primary">{fmtPct(pct(target))}</span>
            </>
          )}
          {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
          {fund && <span className="text-muted-foreground">in {fund}</span>}
        </div>
        {rows.length ? (
          <div className="flex flex-col gap-1.5">
            {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
            <div className="field-key">Resulting allocation</div>
            {rows.map((r, i) => (
              <AllocBar
                key={r.ticker}
                ticker={r.ticker}
                weight={r.weight}
                max={max}
                color={chartColor(i)}
                highlight={!!ticker && r.ticker.toUpperCase() === ticker.toUpperCase()}
              />
            ))}
          </div>
        ) : null}
      </div>
    </Panel>
  );
}

// ── 3. Vault ────────────────────────────────────────────────────────────────
function VaultView({ result }: { result?: string }): JSX.Element {
  const data = safeJson(result);
  if (!data || typeof data !== 'object') return <RawFallback result={result} />;

  // NOTE: a blocked-by-policy / access-denied vault result is caught by DeniedCard in the
  // top-level dispatcher (ToolResultInner) before this view renders, so the "Blocked by Cedar
  // policy" card is now shared across every tool — no vault-specific denial branch needed here.

  // Available secret names → chips.
  if (Array.isArray(data.available_secrets)) {
    const names: string[] = data.available_secrets.map((s: unknown) => String(s));
    return (
      <Panel title="Secure Vault" action={`${names.length} secrets`} className="h-auto">
        <div className="flex flex-wrap gap-1.5">
          {names.map((n, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-xs"
            >
              <Lock size={11} className="text-muted-foreground" />
              <span className="font-mono text-secondary-foreground">{n}</span>
            </span>
          ))}
          {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
          {!names.length && (
            <span className="text-xs text-muted-foreground">No secrets available.</span>
          )}
        </div>
      </Panel>
    );
  }

  // Revealed secret.
  if (data.secret_name != null || data.secret_value != null) {
    return (
      <Card variant="elevated" className="p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-ok/15 text-ok">
            <LockOpen size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="field-key">{String(data.secret_name ?? 'Secret')}</div>
            <div className="break-all font-mono text-sm tabular-nums text-foreground">
              {String(data.secret_value ?? '••••••')}
            </div>
          </div>
        </div>
      </Card>
    );
  }

  // Plain error.
  if (data.error != null) {
    return (
      <Panel title="Secure Vault" dense>
        <p className="break-words text-xs text-muted-foreground">{String(data.error)}</p>
      </Panel>
    );
  }

  return <RawFallback result={result} />;
}

// ── 4. User data ──────────────────────────────────────────────────────────--
function KeyValueGrid({ obj }: { obj: Record<string, unknown> }): JSX.Element {
  const entries = Object.entries(obj).filter(([k]) => k !== 'dataType');
  return (
    <div className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
      {entries.map(([k, v]) => (
        <div key={k} className="flex flex-col gap-0.5 border-b border-border/60 pb-1.5">
          <span className="field-key">{k.replace(/_/g, ' ')}</span>
          <span className="break-words font-mono text-sm tabular-nums text-foreground">
            {v == null
              ? '—'
              : typeof v === 'object'
                ? JSON.stringify(v)
                : String(v)}
          </span>
        </div>
      ))}
      {!entries.length && <span className="text-xs text-muted-foreground">— empty —</span>}
    </div>
  );
}

function MiniTable({ items }: { items: any[] }): JSX.Element {
  const cols = Array.from(
    items.reduce((set: Set<string>, it: any) => {
      if (it && typeof it === 'object') {
        for (const k of Object.keys(it)) if (k !== 'dataType') set.add(k);
      }
      return set;
    }, new Set<string>()),
  );
  if (!cols.length) return <KeyValueGrid obj={{}} />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead>
          <tr>
            {cols.map((c) => (
              <th
                key={c}
                className="field-key whitespace-nowrap border-b border-border px-2 py-1.5"
              >
                {c.replace(/_/g, ' ')}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((it, ri) => (
            <tr key={ri} className="border-b border-border/50 last:border-0">
              {cols.map((c) => {
                const v = it && typeof it === 'object' ? it[c] : undefined;
                return (
                  <td
                    key={c}
                    className="whitespace-nowrap px-2 py-1.5 font-mono tabular-nums text-foreground"
                  >
                    {v == null
                      ? '—'
                      : typeof v === 'object'
                        ? JSON.stringify(v)
                        : String(v)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function UserDataView({ result }: { result?: string }): JSX.Element {
  const data = safeJson(result);
  const entries: any[] = data && Array.isArray(data.data) ? data.data : [];
  if (!entries.length) return <RawFallback result={result} />;

  return (
    <div className="flex flex-col gap-3">
      {entries.map((entry, i) => {
        const dataType =
          entry && typeof entry.dataType === 'string' ? entry.dataType : `data ${i + 1}`;
        // Human-friendly section title from the record type (e.g. "profile" → "Profile",
        // "portfolios" → "Portfolios"). Underscores become spaces.
        const title = dataType.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());

        if (dataType === 'portfolios') {
          const arr = Array.isArray(entry.portfolios)
            ? entry.portfolios
            : Array.isArray(entry.items)
              ? entry.items
              : Array.isArray(entry.data)
                ? entry.data
                : Object.values(entry).find((v) => Array.isArray(v)) ?? [];
          const items = (arr as any[]).filter((x) => x && typeof x === 'object');
          return (
            <Panel key={i} title={title} className="h-auto">
              {items.length ? (
                <MiniTable items={items} />
              ) : (
                <KeyValueGrid obj={stripMachineKeys(entry)} />
              )}
            </Panel>
          );
        }

        // profile / preferences / anything else → key/value grid.
        return (
          <Panel key={i} title={title} className="h-auto">
            <KeyValueGrid obj={stripMachineKeys(entry)} />
          </Panel>
        );
      })}
    </div>
  );
}

// ── 5. Browser ──────────────────────────────────────────────────────────────
const MATURITY_MONTHS: Record<string, number> = {
  mo: 1,
  month: 1,
  months: 1,
  yr: 12,
  year: 12,
  years: 12,
};

/** Extract maturity → yield pairs from unstructured page text. */
function parseYieldCurve(content: string): { label: string; months: number; yield: number }[] {
  const out: { label: string; months: number; yield: number }[] = [];
  const seen = new Set<number>();
  // Matches "1 Mo 4.35", "3 Month 4.50", "10 Yr 4.21", "2 Year 4.10"
  const re = /(\d{1,2})\s*(mo|month|months|yr|year|years)\b[^0-9\-]{0,12}(\d{1,2}\.\d{1,2})/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    const qty = parseInt(m[1], 10);
    const unit = m[2].toLowerCase();
    const factor = MATURITY_MONTHS[unit] ?? 1;
    const months = qty * factor;
    const y = parseFloat(m[3]);
    if (!Number.isFinite(months) || !Number.isFinite(y) || y <= 0 || y > 25) continue;
    if (seen.has(months)) continue;
    seen.add(months);
    const unitLabel = factor === 12 ? 'Y' : 'M';
    out.push({ label: `${qty}${unitLabel}`, months, yield: y });
  }
  return out.sort((a, b) => a.months - b.months);
}

function BrowserView({ result }: { result?: string }): JSX.Element {
  const data = safeJson(result);
  const url: string = data && typeof data.url === 'string' ? data.url : '';
  const title: string = data && typeof data.title === 'string' ? data.title : '';
  const source: string = data && typeof data.source === 'string' ? data.source : '';
  const note: string = data && typeof data.note === 'string' ? data.note : '';
  const errMsg: string = data && typeof data.error === 'string' ? data.error : '';
  const content: string =
    data && typeof data.content === 'string'
      ? data.content
      : data == null && typeof result === 'string'
        ? result
        : '';

  const curve = content ? parseYieldCurve(content) : [];

  if (curve.length >= 3) {
    return (
      <Panel
        title={title || 'Yield Curve'}
        action={source || (url ? 'Web' : undefined)}
        className="h-[260px]"
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={curve} margin={{ top: 8, right: 12, left: -8, bottom: 4 }}>
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: 'var(--chart-axis)' }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: 'var(--chart-axis)' }}
              tickLine={false}
              axisLine={false}
              width={36}
              domain={['auto', 'auto']}
              tickFormatter={(v) => `${v}%`}
            />
            <Tooltip content={<ChartTooltip />} />
            <Line
              type="monotone"
              dataKey="yield"
              name="yield"
              stroke="var(--chart-1)"
              strokeWidth={2}
              dot={{ r: 3, fill: 'var(--chart-1)', strokeWidth: 0 }}
              activeDot={{ r: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </Panel>
    );
  }

  // Expected common path: readable page text.
  return (
    <Panel
      title={title || 'Web Browser'}
      action={source || undefined}
      className="h-auto"
    >
      <div className="flex flex-col gap-2">
        {url && (
          <div className="flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
            <Globe size={12} className="shrink-0" />
            <span className="truncate">{url}</span>
          </div>
        )}
        {content ? (
          <div className="max-h-56 overflow-auto whitespace-pre-wrap break-words text-xs leading-relaxed text-foreground/90">
            {content}
          </div>
        ) : (
          <div className="flex items-start gap-2 rounded-md border border-warn/30 bg-warn/5 px-2.5 py-2 text-xs text-muted-foreground">
            <CircleSlash size={14} className="mt-0.5 shrink-0 text-warn" />
            <span className="break-words">
              {errMsg || note || 'The page loaded but no readable text could be extracted.'}
            </span>
          </div>
        )}
      </div>
    </Panel>
  );
}

// ── 6. Code interpreter ─────────────────────────────────────────────────────
type Metric = { key: string; label: string; value: string; tone: 'pos' | 'neg' | 'neutral' };

function parseCodeMetrics(output: string): Metric[] {
  const metrics: Metric[] = [];
  const push = (key: string, label: string, value: string, tone: Metric['tone']) => {
    if (metrics.some((m) => m.key === key)) return;
    metrics.push({ key, label, value, tone });
  };

  const sharpe = output.match(/sharpe(?:\s*ratio)?[^0-9\-]{0,12}(-?\d+(?:\.\d+)?)/i);
  if (sharpe) {
    const v = parseFloat(sharpe[1]);
    push('sharpe', 'Sharpe ratio', v.toFixed(2), v >= 0 ? 'pos' : 'neg');
  }

  const dd = output.match(/max(?:imum)?\s*draw\s*down[^0-9\-]{0,12}(-?\d+(?:\.\d+)?)\s*%?/i);
  if (dd) {
    const v = parseFloat(dd[1]);
    push('maxdd', 'Max drawdown', `${v > 0 ? '-' : ''}${Math.abs(v).toFixed(1)}%`, 'neg');
  }

  const ret = output.match(
    /(?:annual(?:ized)?\s*return|annual\s*return|cagr)[^0-9\-]{0,12}(-?\d+(?:\.\d+)?)\s*%?/i,
  );
  if (ret) {
    const v = parseFloat(ret[1]);
    push('return', 'Annualized return', `${v.toFixed(1)}%`, v >= 0 ? 'pos' : 'neg');
  }

  const vol = output.match(/volatility[^0-9\-]{0,12}(-?\d+(?:\.\d+)?)\s*%?/i);
  if (vol) {
    const v = parseFloat(vol[1]);
    push('vol', 'Volatility', `${v.toFixed(1)}%`, 'neutral');
  }

  return metrics;
}

function MetricTile({ metric }: { metric: Metric }): JSX.Element {
  const tone =
    metric.tone === 'pos'
      ? 'text-ok'
      : metric.tone === 'neg'
        ? 'text-destructive'
        : 'text-foreground';
  const Icon = metric.tone === 'neg' ? TrendingDown : metric.tone === 'pos' ? TrendingUp : null;
  return (
    <Card variant="elevated" className="px-3 py-2.5">
      <div className="field-key">{metric.label}</div>
      <div className={cn('mt-0.5 flex items-center gap-1.5', tone)}>
        {Icon && <Icon size={16} />}
        <span className="font-mono text-xl font-semibold tabular-nums">{metric.value}</span>
      </div>
    </Card>
  );
}

function CodeView({ result }: { result?: string }): JSX.Element {
  const data = safeJson(result);
  const output: string =
    data && typeof data.output === 'string'
      ? data.output
      : data == null && typeof result === 'string'
        ? result
        : '';
  const note: string = data && typeof data.note === 'string' ? data.note : '';
  const source: string = data && typeof data.source === 'string' ? data.source : '';

  const metrics = output ? parseCodeMetrics(output) : [];

  if (!output && !note && !source) return <RawFallback result={result} />;

  return (
    <Panel
      title="Code Interpreter"
      action={source || undefined}
      className="h-auto"
    >
      <div className="flex flex-col gap-3">
        {note && (
          <div className="flex items-center gap-1.5 text-xs text-warn">
            <FileText size={12} className="shrink-0" />
            <span>{note}</span>
          </div>
        )}
        {metrics.length > 0 && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {metrics.map((m) => (
              <MetricTile key={m.key} metric={m} />
            ))}
          </div>
        )}
        {output ? (
          metrics.length > 0 ? (
            <details className="group">
              <summary className="flex cursor-pointer select-none items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
                <Code2 size={12} />
                {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
                <span className="field-key">Output</span>
              </summary>
              <pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap break-words rounded-md bg-background/60 p-2.5 text-xs font-mono text-muted-foreground">
                {output}
              </pre>
            </details>
          ) : (
            <pre className="max-h-60 overflow-auto whitespace-pre-wrap break-words rounded-md bg-background/60 p-2.5 text-xs font-mono text-foreground/90">
              {output}
            </pre>
          )
        ) : null}
      </div>
    </Panel>
  );
}

// ── Router ────────────────────────────────────────────────────────────────--
// ── Access denial (RBAC) / Cedar-policy block — shown for ANY tool, not just the vault. ─────────
// The runtime shapes both as { error, blocked_by_policy, ... }; an RBAC denial also carries
// access_denied + scope. We distinguish the two so the message is honest: an admin-governed
// access-control denial vs. a live Cedar policy block (the vault-toggle demo). Returns null when
// the result isn't a denial, so the caller can fall through to the normal per-tool view.
function DeniedCard({ result }: { result?: string }): JSX.Element | null {
  const data = safeJson(result);
  if (!data || typeof data !== 'object') return null;
  const isDenial = data.access_denied === true || data.blocked_by_policy === true;
  if (!isDenial) return null;

  // access_denied (+ scope) → RBAC access control. Otherwise → Cedar policy engine.
  const rbac = data.access_denied === true;
  const scope = typeof data.scope === 'string' ? data.scope : '';
  const title = rbac
    ? (scope === 'agent-credential' ? 'Credential revoked' : scope === 'error' ? 'Access check unavailable' : 'Access denied')
    : 'Blocked by Cedar policy';
  const heading = rbac ? 'AgentCore access control' : 'AgentCore policy engine';

  return (
    <Card variant="elevated" className="border-destructive/40 bg-destructive/10 p-5">
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-destructive/15 text-destructive">
          <ShieldAlert size={26} strokeWidth={2} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-destructive">
            <Lock size={15} />
            {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
            <span className="text-base font-bold tracking-tight">{title}</span>
          </div>
          {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
          <div className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            {heading}
          </div>
          {data.error && (
            <p className="mt-1.5 break-words text-xs text-muted-foreground">{String(data.error)}</p>
          )}
        </div>
      </div>
    </Card>
  );
}

function ToolResultInner({ tool, args, result }: ToolResultProps): JSX.Element {
  const detected = detectTool(tool, args);
  // Access-control denials / Cedar blocks render the SAME clear card for every tool (previously
  // only the vault did). Take this before the per-tool switch so a denied result never falls
  // through to a raw-JSON error card.
  const denied = DeniedCard({ result });
  if (denied) {
    return (
      <div className="flex flex-col gap-2">
        <ArgsSummary args={args} />
        {denied}
      </div>
    );
  }
  let view: JSX.Element;
  switch (detected) {
    case 'positions':
      view = <PositionsView result={result} />;
      break;
    case 'trade':
      view = <TradeView result={result} />;
      break;
    case 'vault':
      view = <VaultView result={result} />;
      break;
    case 'userdata':
      view = <UserDataView result={result} />;
      break;
    case 'browser':
      view = <BrowserView result={result} />;
      break;
    case 'code':
      view = <CodeView result={result} />;
      break;
    case 'evolve': {
      const d = safeJson(result);
      view = d && typeof d === 'object' && !d.error ? <EvolveView data={d} /> : <RawFallback result={result} />;
      break;
    }
    case 'portfolio_risk': {
      const d = safeJson(result);
      view = d && typeof d === 'object' && !d.error ? <PortfolioRiskView data={d} /> : <RawFallback result={result} />;
      break;
    }
    case 'curve': {
      const d = safeJson(result);
      view = d && typeof d === 'object' && !d.error ? <CurveView data={d} /> : <RawFallback result={result} />;
      break;
    }
    case 'spread': {
      const d = safeJson(result);
      view = d && typeof d === 'object' && !d.error ? <SpreadView data={d} /> : <RawFallback result={result} />;
      break;
    }
    case 'screen': {
      const d = safeJson(result);
      view = d && typeof d === 'object' && !d.error ? <ScreenView data={d} /> : <RawFallback result={result} />;
      break;
    }
    case 'price_bond': {
      const d = safeJson(result);
      view = d && typeof d === 'object' && !d.error ? <PriceBondView data={d} /> : <RawFallback result={result} />;
      break;
    }
    // ── Capital markets — identity-governed DB (positions-db) ──
    case 'holdings': {
      const d = safeJson(result);
      view = d && typeof d === 'object' && !d.error ? <HoldingsView data={d} /> : <RawFallback result={result} />;
      break;
    }
    // ── Capital markets — internal EKS service via a Gateway OpenAPI target ──
    case 'market_quote': {
      const d = safeJson(result);
      view = d && typeof d === 'object' && !d.error ? <MarketQuoteView data={d} /> : <RawFallback result={result} />;
      break;
    }
    default:
      view = <RawFallback result={result} />;
  }

  return (
    <div className="flex flex-col gap-2">
      <ArgsSummary args={args} />
      {view}
    </div>
  );
}

// ── Error boundary ────────────────────────────────────────────────────────--
class ToolCardBoundary extends React.Component<
  { result?: string; children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { result?: string; children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }

  componentDidCatch(error: unknown): void {
    // Swallow — a malformed tool result must never crash the demo UI.
    if (typeof console !== 'undefined' && console.warn) {
      console.warn('[toolViews] render failed, using fallback:', error);
    }
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      return <RawFallback result={this.props.result} />;
    }
    return this.props.children;
  }
}

// ── Public component ──────────────────────────────────────────────────────--
export function ToolResultView(props: ToolResultProps): JSX.Element {
  return (
    <ToolCardBoundary result={props.result}>
      <ToolResultInner
        {...props} // nosemgrep  (react-props-spreading: typed wrapper passthrough)
      />
    </ToolCardBoundary>
  );
}
