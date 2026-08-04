/**
 * BudgetVariance — Budget vs Actual variance analysis for FinOps
 *
 * Integrates:
 * - Budgeted costs from businessCasesApi (Plan module cost models)
 * - Actual spend from governCostApi (AWS Cost Explorer)
 * - Variance calculation with trend comparison
 *
 * Follows cascading fallback: live API data -> computed -> mock placeholder.
 */
import { useState, useEffect, useMemo } from 'react';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, ReferenceLine,
} from 'recharts';
import {
  businessCasesApi, governCostApi,
  type BusinessCase, type AwsCostSummary,
} from '../../../api/client';
import { LiveDataBadge, MockDataBadge } from '../DataSourceIndicator';
import StatCard from '../StatCard';
import { Icon } from '../icons';

// Tooltip styling to match FinOps house style
const tooltipStyle = {
  background: '#1e293b',
  border: 'none',
  borderRadius: '8px',
  color: '#f8fafc',
  fontSize: '11px',
  padding: '8px 12px',
};

const usd = (n: number, dp = 0) =>
  `$${n.toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;

const pct = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;

interface BudgetVsActualRow {
  name: string;
  budgeted: number;
  actual: number;
  variance: number;
  variancePct: number;
  source: 'business-case' | 'aws-budget';
}

interface MonthlyComparison {
  month: string;
  budgeted: number;
  actual: number;
  variance: number;
}

/**
 * Aggregates annual costs from a business case's cost model (Year 1-3)
 * Returns monthly average for the current fiscal year estimate.
 */
function extractAnnualBudget(bc: BusinessCase): number {
  const costs = bc.costs;
  if (!costs) return 0;

  // Sum Year 1 costs (operating year) across all line items
  let year1Total = 0;

  // Initial costs (usually Year 0 capital)
  for (const item of costs.initial || []) {
    year1Total += item.year_1 || 0;
  }

  // Operating costs
  for (const item of costs.operating || []) {
    year1Total += item.year_1 || 0;
  }

  // Staffing costs
  for (const item of costs.staffing || []) {
    year1Total += item.year_1 || 0;
  }

  return year1Total;
}

export default function BudgetVariance() {
  const [loading, setLoading] = useState(true);
  const [businessCases, setBusinessCases] = useState<BusinessCase[]>([]);
  const [costSummary, setCostSummary] = useState<AwsCostSummary | null>(null);

  // Fetch data from both sources
  useEffect(() => {
    let cancelled = false;

    const fetchData = async () => {
      const [bcRes, costRes] = await Promise.allSettled([
        businessCasesApi.list(),
        governCostApi.summary(6, false),
      ]);

      if (cancelled) return;

      if (bcRes.status === 'fulfilled') {
        // Filter to approved/active business cases
        setBusinessCases(bcRes.value.filter(bc =>
          bc.status === 'Approved' || bc.status === 'Review'
        ));
      }

      if (costRes.status === 'fulfilled') {
        setCostSummary(costRes.value);
      }

      setLoading(false);
    };

    fetchData();
    return () => { cancelled = true; };
  }, []);

  // Compute budget vs actual comparisons
  const { summaryRows, monthlyData, totals, hasLiveSpend, hasBudgets } = useMemo(() => {
    const rows: BudgetVsActualRow[] = [];
    let totalBudgeted = 0;
    let totalActual = 0;

    // Extract budgeted amounts from business cases
    for (const bc of businessCases) {
      const annualBudget = extractAnnualBudget(bc);
      if (annualBudget > 0) {
        // For 6-month view, divide annual by 2
        const budgetedHalf = annualBudget / 2;
        totalBudgeted += budgetedHalf;

        rows.push({
          name: bc.name,
          budgeted: budgetedHalf,
          actual: 0, // Will be allocated proportionally
          variance: 0,
          variancePct: 0,
          source: 'business-case',
        });
      }
    }

    // Get actual spend from Cost Explorer
    const actualSpend = costSummary?.total || 0;
    totalActual = actualSpend;

    // Allocate actual spend proportionally across budget items
    if (rows.length > 0 && totalBudgeted > 0) {
      for (const row of rows) {
        const proportion = row.budgeted / totalBudgeted;
        row.actual = actualSpend * proportion;
        row.variance = row.actual - row.budgeted;
        row.variancePct = row.budgeted > 0 ? (row.variance / row.budgeted) * 100 : 0;
      }
    }

    // Build monthly comparison data
    const monthly: MonthlyComparison[] = [];
    const byMonth = costSummary?.by_month || [];

    // Assume linear budget distribution across months
    const monthlyBudget = totalBudgeted / Math.max(byMonth.length, 6);

    for (const m of byMonth) {
      const monthLabel = new Date(m.month + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
      monthly.push({
        month: monthLabel,
        budgeted: monthlyBudget,
        actual: m.amount,
        variance: m.amount - monthlyBudget,
      });
    }

    const totalVariance = totalActual - totalBudgeted;
    const totalVariancePct = totalBudgeted > 0 ? (totalVariance / totalBudgeted) * 100 : 0;

    return {
      summaryRows: rows,
      monthlyData: monthly,
      totals: {
        budgeted: totalBudgeted,
        actual: totalActual,
        variance: totalVariance,
        variancePct: totalVariancePct,
      },
      hasLiveSpend: !!costSummary?.live,
      hasBudgets: businessCases.length > 0,
    };
  }, [businessCases, costSummary]);

  // Determine variance status for styling
  const varianceStatus = useMemo(() => {
    if (totals.variancePct > 15) return 'danger';
    if (totals.variancePct > 5) return 'warning';
    if (totals.variancePct < -10) return 'success'; // Under budget
    return 'info';
  }, [totals.variancePct]);

  if (loading) {
    return (
      <div className="h-64 flex items-center justify-center text-sm text-slate-400">
        Loading budget vs actual data...
      </div>
    );
  }

  // No data state
  if (!hasBudgets && !hasLiveSpend) {
    return (
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <h2 className="text-sm font-semibold text-slate-900">Budget vs Actual</h2>
          <MockDataBadge integration="Requires approved business cases + Cost Explorer" />
        </div>
        <div className="flex items-start gap-3 text-[12px] text-slate-500 bg-slate-50 rounded-lg px-4 py-3">
          <Icon name="exclamation-triangle" className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <div className="font-medium text-slate-600">No budget comparison available</div>
            <div className="text-[11px] mt-1 space-y-1">
              <p>To enable budget vs actual tracking:</p>
              <ul className="list-disc ml-4 space-y-0.5">
                <li>Create and approve business cases in Plan with cost models</li>
                <li>Connect AWS Cost Explorer for actual spend data</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-slate-900">Budget vs Actual</h2>
          {hasLiveSpend ? (
            <LiveDataBadge />
          ) : (
            <MockDataBadge integration="Connect Cost Explorer for live spend" />
          )}
          <span className="text-[11px] text-slate-400">
            Plan business cases vs AWS spend
          </span>
        </div>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="Total Budgeted"
          value={usd(totals.budgeted)}
          sub="6-month period"
          variant="info"
        />
        <StatCard
          label="Actual Spend"
          value={usd(totals.actual)}
          sub={hasLiveSpend ? 'Cost Explorer' : 'No live data'}
          variant="default"
        />
        <StatCard
          label="Variance"
          value={usd(Math.abs(totals.variance))}
          sub={totals.variance >= 0 ? 'Over budget' : 'Under budget'}
          variant={varianceStatus}
          icon={totals.variance >= 0 ? (
            <Icon name="arrow-trending-up" className="w-4 h-4 text-rose-500" />
          ) : (
            <Icon name="arrow-down" className="w-4 h-4 text-emerald-500" />
          )}
        />
        <StatCard
          label="Variance %"
          value={pct(totals.variancePct)}
          sub={totals.variancePct > 10 ? 'Review required' : 'Within tolerance'}
          variant={varianceStatus}
        />
      </div>

      {/* Main visualization */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Monthly trend comparison */}
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 shadow-sm">
          <div className="text-xs font-semibold text-slate-700 mb-3">Monthly Budget vs Actual</div>
          {monthlyData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={monthlyData} margin={{ left: 0, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="month" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(v: number, name: string) => [usd(v), name === 'budgeted' ? 'Budget' : 'Actual']}
                />
                <Legend wrapperStyle={{ fontSize: '10px' }} />
                <Bar dataKey="budgeted" name="Budget" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                <Bar dataKey="actual" name="Actual" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[220px] flex items-center justify-center text-[11px] text-slate-400">
              No monthly data available
            </div>
          )}
        </div>

        {/* Variance trend */}
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 shadow-sm">
          <div className="text-xs font-semibold text-slate-700 mb-3">Variance Trend</div>
          {monthlyData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={monthlyData} margin={{ left: 0, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="month" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(v: number) => [usd(v), 'Variance']}
                />
                <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="3 3" />
                <Line
                  type="monotone"
                  dataKey="variance"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  dot={{ fill: '#f59e0b', r: 4 }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[220px] flex items-center justify-center text-[11px] text-slate-400">
              No variance data available
            </div>
          )}
        </div>
      </div>

      {/* Business case breakdown */}
      {summaryRows.length > 0 && (
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs font-semibold text-slate-700">Budget by Business Case</div>
            <span className="text-[10px] text-slate-400">{summaryRows.length} approved case{summaryRows.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-slate-400 text-[10px] uppercase tracking-wide text-left border-b border-slate-100">
                  <th scope="col" className="pb-2 font-medium">Business Case</th>
                  <th scope="col" className="pb-2 font-medium text-right">Budgeted</th>
                  <th scope="col" className="pb-2 font-medium text-right">Actual (est.)</th>
                  <th scope="col" className="pb-2 font-medium text-right">Variance</th>
                  <th scope="col" className="pb-2 font-medium text-right">Var %</th>
                </tr>
              </thead>
              <tbody>
                {summaryRows.map((row, i) => (
                  <tr key={row.name} className={i > 0 ? 'border-t border-slate-50' : ''}>
                    <td className="py-2 pr-4">
                      <span className="font-medium text-slate-800">{row.name}</span>
                    </td>
                    <td className="py-2 text-right tabular-nums text-slate-600">{usd(row.budgeted)}</td>
                    <td className="py-2 text-right tabular-nums text-slate-600">{usd(row.actual)}</td>
                    <td className={`py-2 text-right tabular-nums font-medium ${
                      row.variance > 0 ? 'text-rose-600' : row.variance < 0 ? 'text-emerald-600' : 'text-slate-400'
                    }`}>
                      {row.variance >= 0 ? '+' : ''}{usd(row.variance)}
                    </td>
                    <td className={`py-2 text-right tabular-nums font-medium ${
                      row.variancePct > 10 ? 'text-rose-600' : row.variancePct < -5 ? 'text-emerald-600' : 'text-slate-400'
                    }`}>
                      {pct(row.variancePct)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-200 font-semibold">
                  <td className="py-2 text-slate-700">Total</td>
                  <td className="py-2 text-right tabular-nums text-slate-700">{usd(totals.budgeted)}</td>
                  <td className="py-2 text-right tabular-nums text-slate-700">{usd(totals.actual)}</td>
                  <td className={`py-2 text-right tabular-nums ${
                    totals.variance > 0 ? 'text-rose-600' : totals.variance < 0 ? 'text-emerald-600' : 'text-slate-700'
                  }`}>
                    {totals.variance >= 0 ? '+' : ''}{usd(totals.variance)}
                  </td>
                  <td className={`py-2 text-right tabular-nums ${
                    totals.variancePct > 10 ? 'text-rose-600' : totals.variancePct < -5 ? 'text-emerald-600' : 'text-slate-700'
                  }`}>
                    {pct(totals.variancePct)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="text-[10px] text-slate-400 mt-3">
            Actual spend is allocated proportionally across business cases. For precise attribution, use cost-allocation tags.
          </p>
        </div>
      )}

      {/* Insights */}
      <div className="bg-gradient-to-r from-slate-50 to-white rounded-xl border border-slate-200/60 p-4 shadow-sm">
        <div className="text-xs font-semibold text-slate-700 mb-2">Insights</div>
        <ul className="text-[11px] text-slate-600 space-y-1.5">
          {totals.variancePct > 15 && (
            <li className="flex items-start gap-2">
              <span className="text-rose-500 mt-0.5">*</span>
              <span>Spend is {totals.variancePct.toFixed(0)}% over budget. Review high-cost services in the Dashboard tab.</span>
            </li>
          )}
          {totals.variancePct < -10 && (
            <li className="flex items-start gap-2">
              <span className="text-emerald-500 mt-0.5">*</span>
              <span>Spend is {Math.abs(totals.variancePct).toFixed(0)}% under budget. Consider reallocating unused capacity.</span>
            </li>
          )}
          {!hasLiveSpend && (
            <li className="flex items-start gap-2">
              <span className="text-amber-500 mt-0.5">*</span>
              <span>Connect AWS Cost Explorer for real-time spend tracking and accurate variance analysis.</span>
            </li>
          )}
          {businessCases.length === 0 && (
            <li className="flex items-start gap-2">
              <span className="text-amber-500 mt-0.5">*</span>
              <span>Create approved business cases in Plan to establish budgets for tracking.</span>
            </li>
          )}
          {hasLiveSpend && hasBudgets && Math.abs(totals.variancePct) <= 10 && (
            <li className="flex items-start gap-2">
              <span className="text-emerald-500 mt-0.5">*</span>
              <span>Spend is within 10% of budget. Good financial governance posture.</span>
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
