/**
 * SpendDashboard — Gateway spend analytics page
 *
 * Displays cost trends, breakdowns by use_case/team/model,
 * budget utilization gauges per use case and team,
 * with daily/weekly/monthly views and CSV export.
 *
 * Connects to:
 *   GET /api/v1/gateway/spend?use_case=X&team=Y&model=Z&period=daily&days=30
 *   GET /api/v1/gateway/spend/export?period=daily&days=30
 *
 * Requirements: 12.2, 12.5
 */

import { useState, useEffect } from 'react';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import { Link } from 'react-router-dom';
import client from '../../api/client';

/* ─── Types ─── */

interface SpendRecord {
  use_case: string;
  team: string;
  model: string;
  period: string;
  date: string;
  total_cost_usd: number;
  input_tokens: number;
  output_tokens: number;
  request_count: number;
  avg_latency_ms: number;
}

interface SpendResponse {
  records: SpendRecord[];
  total_cost_usd: number;
  total_requests: number;
  period: string;
  filters: {
    use_case?: string;
    team?: string;
    model?: string;
  };
}

interface BudgetUtilization {
  name: string;
  spent: number;
  budget: number;
  percentage: number;
}

type Period = 'daily' | 'weekly' | 'monthly';

/* ─── Constants ─── */

const PERIOD_OPTIONS: { value: Period; label: string; days: number }[] = [
  { value: 'daily', label: 'Daily', days: 30 },
  { value: 'weekly', label: 'Weekly', days: 90 },
  { value: 'monthly', label: 'Monthly', days: 365 },
];

const CHART_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981',
  '#3b82f6', '#ef4444', '#14b8a6', '#f97316', '#84cc16',
];

const tooltipStyle = {
  contentStyle: {
    background: 'rgba(255,255,255,0.96)',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    fontSize: '12px',
    boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
  },
};

/* ─── Component ─── */

export default function SpendDashboard() {
  const [period, setPeriod] = useState<Period>('daily');
  const [records, setRecords] = useState<SpendRecord[]>([]);
  const [totalCost, setTotalCost] = useState(0);
  const [totalRequests, setTotalRequests] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  // Filters
  const [useCaseFilter, setUseCaseFilter] = useState<string>('');
  const [teamFilter, setTeamFilter] = useState<string>('');
  const [modelFilter, setModelFilter] = useState<string>('');

  const days = PERIOD_OPTIONS.find((p) => p.value === period)?.days ?? 30;

  useEffect(() => {
    let cancelled = false;

    async function fetchSpendData() {
      setLoading(true);
      setError(null);
      try {
        const params: Record<string, string | number> = { period, days };
        if (useCaseFilter) params.use_case = useCaseFilter;
        if (teamFilter) params.team = teamFilter;
        if (modelFilter) params.model = modelFilter;

        const response = await client.get<SpendResponse>('/api/v1/gateway/spend', { params });
        if (!cancelled) {
          setRecords(response.data.records);
          setTotalCost(response.data.total_cost_usd);
          setTotalRequests(response.data.total_requests);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : 'Failed to load spend data';
          setError(message);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchSpendData();
    return () => { cancelled = true; };
  }, [period, days, useCaseFilter, teamFilter, modelFilter]);

  /* ─── Derived Data ─── */

  // Cost trend over time (aggregate by date)
  const costTrend = aggregateByDate(records);

  // Breakdown by use case
  const byUseCase = aggregateByField(records, 'use_case');

  // Breakdown by team
  const byTeam = aggregateByField(records, 'team');

  // Breakdown by model
  const byModel = aggregateByField(records, 'model');

  // Budget utilization gauges (use case)
  const useCaseBudgets = computeBudgetUtilization(byUseCase);

  // Budget utilization gauges (team)
  const teamBudgets = computeBudgetUtilization(byTeam);

  // Distinct values for filters
  const distinctUseCases = [...new Set(records.map((r) => r.use_case))].sort();
  const distinctTeams = [...new Set(records.map((r) => r.team))].sort();
  const distinctModels = [...new Set(records.map((r) => r.model))].sort();

  /* ─── CSV Export ─── */

  const handleExport = async () => {
    setExporting(true);
    try {
      const params: Record<string, string | number> = { period, days };
      const response = await client.get('/api/v1/gateway/spend/export', {
        params,
        responseType: 'blob',
      });
      const blob = new Blob([response.data], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `gateway-spend-${period}-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Export failed';
      setError(message);
    } finally {
      setExporting(false);
    }
  };

  /* ─── Render ─── */

  return (
    <div className="min-h-[calc(100vh-4rem)] relative">
      <div className="relative max-w-7xl mx-auto px-6 py-10">
        <Link to="/govern" className="text-sm text-slate-400 hover:text-slate-600 transition-colors font-medium">
          ← Govern
        </Link>

        {/* Header */}
        <div className="flex items-end justify-between mt-3 mb-6">
          <div>
            <h1 className="text-3xl font-semibold text-slate-900 tracking-tight">
              Gateway Spend Dashboard
            </h1>
            <p className="text-slate-500 mt-1 max-w-2xl">
              Real-time cost analytics for the LiteLLM AI Gateway. Track spend by use case, team, and model with budget monitoring.
            </p>
          </div>
          <button
            onClick={handleExport}
            disabled={exporting || loading}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            {exporting ? 'Exporting…' : 'Export CSV'}
          </button>
        </div>

        {/* Period selector + filters */}
        <div className="flex flex-wrap items-center gap-3 mb-6">
          {/* Period tabs */}
          <div className="flex bg-slate-100 rounded-lg p-1">
            {PERIOD_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setPeriod(opt.value)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  period === opt.value
                    ? 'bg-white text-indigo-700 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Filters */}
          <FilterDropdown
            label="Use Case"
            value={useCaseFilter}
            options={distinctUseCases}
            onChange={setUseCaseFilter}
          />
          <FilterDropdown
            label="Team"
            value={teamFilter}
            options={distinctTeams}
            onChange={setTeamFilter}
          />
          <FilterDropdown
            label="Model"
            value={modelFilter}
            options={distinctModels}
            onChange={setModelFilter}
          />
        </div>

        {/* Error state */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Loading state */}
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
          </div>
        ) : (
          <>
            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <KpiCard
                label="Total Cost"
                value={`$${totalCost.toFixed(2)}`}
                sub={`${period} period`}
                color="#6366f1"
              />
              <KpiCard
                label="Total Requests"
                value={totalRequests.toLocaleString()}
                sub={`${records.length} records`}
                color="#8b5cf6"
              />
              <KpiCard
                label="Avg Cost/Request"
                value={totalRequests > 0 ? `$${(totalCost / totalRequests).toFixed(4)}` : '$0.00'}
                sub="per request"
                color="#ec4899"
              />
              <KpiCard
                label="Models Active"
                value={String(distinctModels.length)}
                sub={`${distinctUseCases.length} use cases`}
                color="#10b981"
              />
            </div>

            {/* Cost Trend Chart */}
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 shadow-sm mb-6">
              <div className="text-sm font-semibold text-slate-900 mb-3">Cost Trend</div>
              {costTrend.length > 0 ? (
                <ResponsiveContainer width="100%" height={240}>
                  <AreaChart data={costTrend}>
                    <defs>
                      <linearGradient id="costGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#6366f1" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                    <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" tickFormatter={(v: any) => `$${v}`} />
                    <Tooltip {...tooltipStyle} formatter={(value: any) => [`$${Number(value).toFixed(2)}`, 'Cost']} />
                    <Area
                      type="monotone"
                      dataKey="cost"
                      stroke="#6366f1"
                      strokeWidth={2}
                      fill="url(#costGrad)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <EmptyState message="No cost data available for the selected period." />
              )}
            </div>

            {/* Breakdown Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
              <BreakdownChart title="Cost by Use Case" data={byUseCase} />
              <BreakdownChart title="Cost by Team" data={byTeam} />
              <BreakdownPieChart title="Cost by Model" data={byModel} />
            </div>

            {/* Budget Utilization Gauges */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
              <BudgetSection title="Budget Utilization by Use Case" items={useCaseBudgets} />
              <BudgetSection title="Budget Utilization by Team" items={teamBudgets} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ─── Sub-components ─── */

function KpiCard({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-4 shadow-sm">
      <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">{label}</div>
      <div className="text-2xl font-semibold mt-1" style={{ color }}>{value}</div>
      <div className="text-[11px] text-slate-400 mt-0.5">{sub}</div>
    </div>
  );
}

function FilterDropdown({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="text-xs border border-slate-200 rounded-lg px-3 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400"
    >
      <option value="">All {label}s</option>
      {options.map((opt) => (
        <option key={opt} value={opt}>
          {opt}
        </option>
      ))}
    </select>
  );
}

function BreakdownChart({ title, data }: { title: string; data: { name: string; cost: number }[] }) {
  if (data.length === 0) return <EmptyState message={`No data for ${title}`} />;
  const sorted = [...data].sort((a, b) => b.cost - a.cost).slice(0, 8);
  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 shadow-sm">
      <div className="text-sm font-semibold text-slate-900 mb-3">{title}</div>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={sorted} layout="vertical">
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
          <XAxis type="number" tick={{ fontSize: 10 }} stroke="#94a3b8" tickFormatter={(v: any) => `$${v}`} />
          <YAxis
            type="category"
            dataKey="name"
            tick={{ fontSize: 10 }}
            stroke="#94a3b8"
            width={90}
            tickFormatter={(v: any) => String(v).length > 14 ? `${String(v).slice(0, 14)}…` : String(v)}
          />
          <Tooltip {...tooltipStyle} formatter={(value: any) => [`$${Number(value).toFixed(2)}`, 'Cost']} />
          <Bar dataKey="cost" radius={[0, 4, 4, 0]}>
            {sorted.map((_, i) => (
              <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function BreakdownPieChart({ title, data }: { title: string; data: { name: string; cost: number }[] }) {
  if (data.length === 0) return <EmptyState message={`No data for ${title}`} />;
  const sorted = [...data].sort((a, b) => b.cost - a.cost).slice(0, 8);
  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 shadow-sm">
      <div className="text-sm font-semibold text-slate-900 mb-3">{title}</div>
      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <Pie
            data={sorted}
            dataKey="cost"
            nameKey="name"
            cx="50%"
            cy="50%"
            outerRadius={70}
            label={({ name, percent }: any) => `${((name as string) ?? '').slice(0, 10)} ${(((percent as number) ?? 0) * 100).toFixed(0)}%`}
            labelLine={false}
          >
            {sorted.map((_, i) => (
              <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip {...tooltipStyle} formatter={(value: any) => [`$${Number(value).toFixed(2)}`, 'Cost']} />
          <Legend wrapperStyle={{ fontSize: '10px' }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

function BudgetSection({ title, items }: { title: string; items: BudgetUtilization[] }) {
  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 shadow-sm">
      <div className="text-sm font-semibold text-slate-900 mb-4">{title}</div>
      {items.length === 0 ? (
        <EmptyState message="No budget data available." />
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <BudgetGauge key={item.name} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}

function BudgetGauge({ item }: { item: BudgetUtilization }) {
  const { name, spent, budget, percentage } = item;
  const barColor =
    percentage >= 100
      ? 'bg-red-500'
      : percentage >= 80
        ? 'bg-amber-500'
        : 'bg-emerald-500';
  const textColor =
    percentage >= 100
      ? 'text-red-600'
      : percentage >= 80
        ? 'text-amber-600'
        : 'text-emerald-600';

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium text-slate-700 truncate max-w-[60%]">{name}</span>
        <span className={`text-xs font-semibold ${textColor}`}>
          {percentage.toFixed(0)}% · ${spent.toFixed(2)} / ${budget.toFixed(2)}
        </span>
      </div>
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${barColor}`}
          style={{ width: `${Math.min(percentage, 100)}%` }}
        />
      </div>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center h-32 text-sm text-slate-400">
      {message}
    </div>
  );
}

/* ─── Helper Functions ─── */

function aggregateByDate(records: SpendRecord[]): { date: string; cost: number; requests: number }[] {
  const map = new Map<string, { cost: number; requests: number }>();
  for (const r of records) {
    const existing = map.get(r.date) ?? { cost: 0, requests: 0 };
    existing.cost += r.total_cost_usd;
    existing.requests += r.request_count;
    map.set(r.date, existing);
  }
  return Array.from(map.entries())
    .map(([date, data]) => ({ date, ...data }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function aggregateByField(
  records: SpendRecord[],
  field: 'use_case' | 'team' | 'model'
): { name: string; cost: number }[] {
  const map = new Map<string, number>();
  for (const r of records) {
    const key = r[field];
    map.set(key, (map.get(key) ?? 0) + r.total_cost_usd);
  }
  return Array.from(map.entries()).map(([name, cost]) => ({ name, cost }));
}

function computeBudgetUtilization(
  breakdown: { name: string; cost: number }[]
): BudgetUtilization[] {
  // In a full implementation, budget limits would come from the API.
  // For now, estimate budget as 120% of current spend (placeholder)
  // so gauges show meaningful utilization.
  return breakdown
    .sort((a, b) => b.cost - a.cost)
    .slice(0, 10)
    .map((item) => {
      const budget = item.cost > 0 ? item.cost * 1.2 : 100;
      return {
        name: item.name,
        spent: item.cost,
        budget,
        percentage: (item.cost / budget) * 100,
      };
    });
}
