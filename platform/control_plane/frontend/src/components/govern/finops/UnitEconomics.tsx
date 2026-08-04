/**
 * UnitEconomics — cost per unit of business work, for the FinOps tab.
 *
 * Grounded, in priority order:
 *  1. REAL   — per-use-case token spend from the FinOps spend store (Build→FinOps
 *              loop, /govern/cost/by-use-case). cost/unit = spend ÷ requests.
 *  2. COMPUTED — the expected-cost engine over real Plan use cases (token pricing ×
 *              modeled volume) when no metered spend exists yet.
 *  3. MOCK   — illustrative UNIT_ECONOMICS when neither is available.
 *
 * Unit economics is the bridge from raw spend to "what does one decision cost" —
 * the AWS Well-Architected Agentic Lens cost-per-task-completion measure.
 */
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useGovernanceAggregator } from '../useGovernanceAggregator';
import { useAwsUseCaseSpend } from '../useAwsCost';
import {
  costInputStore, computeExpectedCost, isPricedModelId, PRICED_MODEL_LABELS,
} from './expectedCost';
import { UNIT_ECONOMICS } from '../mockData';
import { LiveDataBadge, MockDataBadge } from '../DataSourceIndicator';

type Source = 'live' | 'computed' | 'mock';

interface UnitRow {
  key: string;
  useCase: string;
  costPerUnit: number;
  unit: string;
  volume: number;
  monthlyCost: number;
  model?: string;
  trend?: 'up' | 'down' | 'flat';
}

const trendArrow: Record<string, string> = { up: '▲', down: '▼', flat: '→' };
const trendColor: Record<string, string> = { up: 'text-rose-500', down: 'text-emerald-500', flat: 'text-slate-400' };

const usd = (n: number) => `$${n < 1 ? n.toFixed(4) : n.toFixed(2)}`;
const usd0 = (n: number) => `$${Math.round(n).toLocaleString()}`;

export default function UnitEconomics() {
  const { useCases } = useGovernanceAggregator();
  const { data: spend } = useAwsUseCaseSpend(30);

  const { rows, source } = useMemo<{ rows: UnitRow[]; source: Source }>(() => {
    // 1) REAL — metered per-use-case spend.
    if (spend?.live && spend.by_use_case.length > 0) {
      const real = spend.by_use_case.map((u): UnitRow => ({
        key: u.use_case_id,
        useCase: u.use_case_id,
        costPerUnit: u.request_count > 0 ? u.total_cost_usd / u.request_count : 0,
        unit: 'per request',
        volume: u.request_count,
        monthlyCost: u.total_cost_usd,
        model: u.top_model ?? undefined,
      }));
      return { rows: real.sort((a, b) => b.monthlyCost - a.monthlyCost), source: 'live' };
    }

    // 2) COMPUTED — expected-cost engine over real Plan use cases with cost inputs.
    const inputs = costInputStore.getAll();
    const computed: UnitRow[] = useCases
      .map((uc): UnitRow | null => {
        const ci = inputs[uc.use_case_id];
        if (!ci || !isPricedModelId(ci.model_id)) return null;
        const r = computeExpectedCost(ci);
        return {
          key: uc.use_case_id,
          useCase: uc.name,
          costPerUnit: r.costPerTask,
          unit: 'per task',
          volume: ci.expected_tasks_per_month,
          monthlyCost: r.monthlyCost,
          model: PRICED_MODEL_LABELS[ci.model_id],
        };
      })
      .filter((r): r is UnitRow => r !== null);
    if (computed.length > 0) {
      return { rows: computed.sort((a, b) => b.monthlyCost - a.monthlyCost), source: 'computed' };
    }

    // 3) MOCK — illustrative.
    const mock: UnitRow[] = UNIT_ECONOMICS.map(u => ({
      key: u.useCase,
      useCase: u.useCase,
      costPerUnit: u.cost,
      unit: u.unit,
      volume: u.volume,
      monthlyCost: u.cost * u.volume,
      trend: u.trend,
    }));
    return { rows: mock, source: 'mock' };
  }, [spend, useCases]);

  const totals = useMemo(() => {
    const monthly = rows.reduce((s, r) => s + r.monthlyCost, 0);
    const units = rows.reduce((s, r) => s + r.volume, 0);
    const blended = units > 0 ? monthly / units : 0;
    const sorted = [...rows].filter(r => r.costPerUnit > 0).sort((a, b) => a.costPerUnit - b.costPerUnit);
    return { monthly, units, blended, cheapest: sorted[0], priciest: sorted[sorted.length - 1] };
  }, [rows]);

  const maxCost = Math.max(...rows.map(r => r.monthlyCost), 1);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between flex-wrap gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-slate-900">Unit Economics</h2>
            {source === 'live' && <LiveDataBadge />}
            {source === 'computed' && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 uppercase tracking-wide">Computed</span>}
            {source === 'mock' && <MockDataBadge integration="Deploy agents (metered spend) or set use-case cost models in Planning to populate real unit costs" />}
          </div>
          <p className="text-sm text-slate-500">
            {source === 'live'
              ? 'Cost per unit of work from real metered token spend — spend ÷ requests, trailing 30 days.'
              : source === 'computed'
              ? 'Cost per task from your Plan use-case cost models (token pricing × modeled volume).'
              : 'Illustrative — cost per unit of business work. Deploy agents or set cost models to ground this.'}
          </p>
        </div>
        {source === 'computed' && (
          <Link to="/govern/finops" className="text-[11px] text-blue-600 hover:text-blue-700 font-medium">Edit cost models in Planning →</Link>
        )}
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-4">
          <div className="text-2xl font-bold text-slate-900 tabular-nums">{usd0(totals.monthly)}</div>
          <div className="text-xs text-slate-500">Total monthly</div>
        </div>
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-4">
          <div className="text-2xl font-bold text-indigo-600 tabular-nums">{usd(totals.blended)}</div>
          <div className="text-xs text-slate-500">Blended cost / unit</div>
        </div>
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-emerald-200 p-4">
          <div className="text-sm font-bold text-emerald-600 truncate">{totals.cheapest?.useCase ?? '—'}</div>
          <div className="text-xs text-slate-500">Most efficient {totals.cheapest ? `· ${usd(totals.cheapest.costPerUnit)}` : ''}</div>
        </div>
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-amber-200 p-4">
          <div className="text-sm font-bold text-amber-600 truncate">{totals.priciest?.useCase ?? '—'}</div>
          <div className="text-xs text-slate-500">Priciest {totals.priciest ? `· ${usd(totals.priciest.costPerUnit)}` : ''}</div>
        </div>
      </div>

      {/* Detail table */}
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] text-slate-400 uppercase tracking-wide border-b border-slate-100">
              <th scope="col" className="text-left py-2 font-medium">Use Case</th>
              <th scope="col" className="text-right py-2 font-medium">Cost / unit</th>
              <th scope="col" className="text-left py-2 font-medium pl-4">Unit</th>
              <th scope="col" className="text-right py-2 font-medium">Volume / mo</th>
              <th scope="col" className="text-right py-2 font-medium">Monthly cost</th>
              <th scope="col" className="text-left py-2 font-medium pl-4">Share</th>
              {source === 'mock' ? <th scope="col" className="text-center py-2 font-medium">Trend</th> : <th scope="col" className="text-left py-2 font-medium">Model</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.key} className="border-b border-slate-50 hover:bg-slate-50/40">
                <td className="py-2.5 text-slate-700">
                  {source === 'live'
                    ? <Link to={`/govern/agents?agent=${encodeURIComponent(r.useCase)}`} className="text-blue-600 hover:text-blue-700 hover:underline">{r.useCase}</Link>
                    : r.useCase}
                </td>
                <td className="py-2.5 text-right font-semibold text-slate-900 tabular-nums">{usd(r.costPerUnit)}</td>
                <td className="py-2.5 text-slate-500 text-[11px] pl-4">{r.unit}</td>
                <td className="py-2.5 text-right text-slate-500 tabular-nums">{r.volume.toLocaleString()}</td>
                <td className="py-2.5 text-right font-semibold text-slate-900 tabular-nums">{usd0(r.monthlyCost)}</td>
                <td className="py-2.5 pl-4 w-32">
                  <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full rounded-full bg-indigo-400" style={{ width: `${(r.monthlyCost / maxCost) * 100}%` }} />
                  </div>
                </td>
                {source === 'mock'
                  ? <td className={`py-2.5 text-center font-semibold ${trendColor[r.trend ?? 'flat']}`}>{trendArrow[r.trend ?? 'flat']}</td>
                  : <td className="py-2.5 text-[11px] text-slate-500">{r.model ?? '—'}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
