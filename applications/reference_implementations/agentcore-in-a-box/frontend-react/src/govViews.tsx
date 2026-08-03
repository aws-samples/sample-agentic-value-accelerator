// govViews.tsx — result visuals for the identity-GOVERNED database tools. Today: HoldingsView for
// `query_holdings` (the Aurora positions-db OpenAPI Gateway target). The whole point of this tool is
// that a caller sees only the rows/columns their VERIFIED identity permits, so this view makes the
// governance VISIBLE: masked client names and withheld notionals render as explicit lock/redaction
// chips, not blanks — you can see the boundary working. Defensive throughout: bad/partial/error
// payloads degrade to the shared RawFallback via the toolViews router; nothing throws.

import * as React from 'react';
import { Database, Lock, ShieldAlert, ShieldCheck, Server, Activity, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { cn } from './lib/cn';
import { Panel } from './components/ui/Panel';
import { num, money, Kpi } from './fiViews';

// The sentinel the governed view substitutes for a masked client name (scripts/seed_holdings.py).
const REDACTED = '••• REDACTED (PII) •••';

function isMaskedName(v: unknown): boolean {
  return typeof v === 'string' && v.trim().startsWith('•••');
}

/** A lock/redaction chip shown in place of a withheld cell — the governance made visible. */
function MaskedChip({ kind }: { kind: 'pii' | 'value' }): JSX.Element {
  return (
    <span className="inline-flex items-center gap-1 rounded bg-warn/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-warn">
      {kind === 'pii' ? <ShieldAlert size={11} /> : <Lock size={11} />}
      {kind === 'pii' ? 'Redacted' : 'Masked'}
    </span>
  );
}

export function HoldingsView({ data }: { data: any }): JSX.Element {
  const rows: any[] = Array.isArray(data?.rows) ? data.rows : [];
  const count = num(data?.row_count ?? rows.length);

  // Whether ANY visible row is masked → drives the tier banner. A masked name OR a null notional on
  // a returned row means the caller's tier didn't clear column governance.
  const anyMasked = rows.some((r) => isMaskedName(r?.client_name) || r?.notional == null);
  const totalMV = rows.reduce((s, r) => s + num(r?.market_value), 0);

  if (!rows.length) {
    return (
      <Panel
        title={<span className="flex items-center gap-1.5"><Database size={12} /> Client Holdings</span>}
        className="h-auto"
      >
        {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
        <span className="text-xs text-muted-foreground">No holdings are visible to your desk. Row-level access is governed by your verified identity.</span>
      </Panel>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <KpiRow>
        <Kpi label="Holdings visible" value={String(count)} caption="scoped to your desk (RLS)" />
        <Kpi label="Total market value" value={money(totalMV)} caption={`${rows.length} rows shown`} />
        <Kpi
          label="Column access"
          value={anyMasked ? 'Restricted' : 'Full'}
          caption={anyMasked ? 'PII / notional masked' : 'name + notional visible'}
        />
      </KpiRow>

      {/* Governance banner — states, in plain terms, that visibility is identity-scoped. */}
      <div
        className={cn(
          'flex items-start gap-2 rounded-md border px-3 py-2 text-[11px]',
          anyMasked ? 'border-warn/40 bg-warn/10 text-warn' : 'border-ok/40 bg-ok/10 text-ok',
        )}
      >
        {anyMasked ? <ShieldAlert size={14} className="mt-0.5 shrink-0" /> : <ShieldCheck size={14} className="mt-0.5 shrink-0" />}
        <span className="text-foreground/90">
          {anyMasked
            ? 'Row-level security scopes these rows to your desk; your tier does not clear the client name and notional columns, so they are masked below.'
            : 'Row-level security scopes these rows to your desk; your tier clears the full client name and notional columns.'}
        </span>
      </div>

      <Panel title="holdings ledger" action={`${rows.length} rows`} className="h-auto">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="field-key">
                {['Book', 'Sector', 'Client', 'Notional', 'Market value', 'Ccy'].map((h) => (
                  <th key={h} className="whitespace-nowrap border-b border-border px-2 py-1.5">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 40).map((r, i) => {
                const nameMasked = isMaskedName(r?.client_name);
                const notionalMasked = r?.notional == null;
                return (
                  <tr key={i} className="border-b border-border/50 last:border-0">
                    <td className="whitespace-nowrap px-2 py-1.5 text-foreground">{r?.book ?? '—'}</td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-muted-foreground">{r?.sector ?? '—'}</td>
                    <td className="whitespace-nowrap px-2 py-1.5 max-w-[190px] truncate">
                      {nameMasked ? <MaskedChip kind="pii" /> : <span className="text-foreground" title={String(r?.client_name ?? '')}>{r?.client_name ?? '—'}</span>}
                    </td>
                    <td className="tabular whitespace-nowrap px-2 py-1.5">
                      {notionalMasked ? <MaskedChip kind="value" /> : <span className="text-foreground">{money(r?.notional)}</span>}
                    </td>
                    <td className="tabular whitespace-nowrap px-2 py-1.5 text-foreground">{money(r?.market_value)}</td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-muted-foreground">{r?.currency ?? 'USD'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      {typeof data?.disclaimer === 'string' && data.disclaimer ? (
        <p className="px-1 text-[10.5px] italic text-muted-foreground">
          {data.disclaimer}
          {typeof data?.source === 'string' && data.source ? ` · ${data.source}` : ''}
        </p>
      ) : null}
    </div>
  );
}

/** Local KPI grid (mirrors verticalViews.KpiRow; kept private to avoid a cross-file dependency). */
function KpiRow({ children }: { children: React.ReactNode }): JSX.Element {
  return <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{children}</div>;
}

// ── Market Quotes — the EKS internal API surfaced as a governed Gateway tool. ───────────────────
// This is Michelle's "your internally-built API on your own compute (EKS), reached only through the
// governed Gateway" beat made concrete: the result carries the SERVING POD name and a source line
// proving the call went external-client → Gateway (OpenAPI target, API-key injected) → the EKS
// service. The view leads with that provenance banner, then shows the live bid/ask/last book.
// Degrades to RawFallback via the toolViews router on a bad/error payload; never throws.
export function MarketQuoteView({ data }: { data: any }): JSX.Element {
  const quotes: any[] = Array.isArray(data?.quotes) ? data.quotes : [];
  const servedBy: string = typeof data?.served_by === 'string' ? data.served_by : '';
  const source: string = typeof data?.source === 'string' ? data.source : '';
  const count = num(data?.count ?? quotes.length);

  if (!quotes.length) {
    return (
      <Panel
        title={<span className="flex items-center gap-1.5"><Activity size={12} /> Market Quotes</span>}
        className="h-auto"
      >
        {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
        <span className="text-xs text-muted-foreground">No quotes returned. This tool is served by an internal EKS service, reachable only through the governed Gateway.</span>
      </Panel>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Provenance banner — the whole point: this data came from YOUR compute, through the Gateway. */}
      <div className="flex items-start gap-2 rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-[11px]">
        <Server size={14} className="mt-0.5 shrink-0 text-primary" />
        <span className="min-w-0 text-foreground/90">
          Served by an <span className="font-semibold text-foreground">internal EKS service</span> through the AgentCore Gateway (OpenAPI target; the Gateway injects the API key — the model never sees it).
          {servedBy && (
            <>
              {' '}Responding pod:{' '}
              <span className="rounded bg-primary/15 px-1 py-0.5 font-mono text-[10px] text-primary" title="The Kubernetes pod that served this call">{servedBy}</span>
            </>
          )}
        </span>
      </div>

      <KpiRow>
        <Kpi label="Quotes" value={String(count)} caption="live from EKS" />
        <Kpi label="Path" value="Governed" caption="Gateway OpenAPI target" />
        <Kpi label="Auth" value="API key" caption="injected by Gateway" />
      </KpiRow>

      <Panel title="quote book" action={`${quotes.length} symbols`} className="h-auto">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="field-key">
                {['Symbol', 'Bid', 'Ask', 'Last', 'Spread', 'Ccy'].map((h) => (
                  <th key={h} className="whitespace-nowrap border-b border-border px-2 py-1.5">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {quotes.slice(0, 40).map((q, i) => {
                const bid = num(q?.bid);
                const ask = num(q?.ask);
                const last = num(q?.last);
                const spread = ask > 0 && bid > 0 ? ask - bid : null;
                // A tiny up/down glyph vs the mid so the book reads as "live" at a glance.
                const mid = bid > 0 && ask > 0 ? (bid + ask) / 2 : last;
                const up = last >= mid;
                return (
                  <tr key={i} className="border-b border-border/50 last:border-0">
                    <td className="whitespace-nowrap px-2 py-1.5 font-mono font-semibold text-foreground">{q?.symbol ?? '—'}</td>
                    <td className="tabular whitespace-nowrap px-2 py-1.5 text-muted-foreground">{bid ? fmtPrice(bid) : '—'}</td>
                    <td className="tabular whitespace-nowrap px-2 py-1.5 text-muted-foreground">{ask ? fmtPrice(ask) : '—'}</td>
                    <td className="tabular whitespace-nowrap px-2 py-1.5 text-foreground">
                      <span className="inline-flex items-center gap-1">
                        {up ? <ArrowUpRight size={11} className="text-ok" /> : <ArrowDownRight size={11} className="text-destructive" />}
                        {last ? fmtPrice(last) : '—'}
                      </span>
                    </td>
                    <td className="tabular whitespace-nowrap px-2 py-1.5 text-muted-foreground">{spread != null ? fmtPrice(spread) : '—'}</td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-muted-foreground">{q?.currency ?? 'USD'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      {(source || typeof data?.disclaimer === 'string') && (
        <p className="px-1 text-[10.5px] italic text-muted-foreground">
          {typeof data?.disclaimer === 'string' && data.disclaimer ? data.disclaimer : ''}
          {source ? `${data?.disclaimer ? ' · ' : ''}${source}` : ''}
        </p>
      )}
    </div>
  );
}

/** Price formatter for the quote book — 2dp, comma-grouped (e.g. 1,234.56). */
function fmtPrice(n: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
