import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import {
  COST_HEALTH, COST_KPIS,
  AGENT_COSTS,
  tooltipStyle,
  ALL_AGENTS, AGENT_PROVIDER_CONFIG,
  type AgentProvider,
} from './mockData';
import LiveHeader from './LiveHeader';
import { Icon } from './icons';
import { MockDataBadge, LiveDataBadge } from './DataSourceIndicator';
import UnifiedGuide, { FINOPS_GUIDE } from './UnifiedGuide';
import StatCard, { type StatCardVariant } from './StatCard';
import { useGovernanceAggregator } from './useGovernanceAggregator';
import { useAwsCost, useAwsCostDetail, useAwsUseCaseSpend, useAwsCostEnhanced, useAwsForecast, useAgentCoreCosts, useAgentForecast, useDashboardSummary, useCostComparison, useServiceQuotasLite, useRightsizing, useTokenCosts, type UseDashboardSummaryResult } from './useAwsCost';
import { governCostApi, multicloudApi, type AwsCostTagBreakdown, type AwsTagKeyOption, type AwsBudgetsResponse, type AwsProviderConnectorsResponse, type MultiCloudAllCosts, type MultiCloudAllAgents, type AwsResourceCost, type AwsResourceCostResponse } from '../../api/client';
import {
  SPEND_WINDOWS, DEFAULT_SPEND_WINDOW, spendWindowById, cappedDays, cappedLabel, SOURCE_DAY_CAPS,
  type SpendWindow, type SpendWindowId,
} from './finops/spendWindow';
import UseCaseCostEditor from './finops/UseCaseCostEditor';
import AgentROI from './finops/AgentROI';
import TaskAssessment from './finops/TaskAssessment';
import BusinessMetrics from './finops/BusinessMetrics';
import UnitEconomics from './finops/UnitEconomics';
import TokenEconomics from './finops/TokenEconomics';
import Chargeback from './finops/Chargeback';
import Optimization from './finops/Optimization';
import BudgetVariance from './finops/BudgetVariance';
import CostAnomalies from './finops/CostAnomalies';
import CapacityManagement from './finops/CapacityManagement';
import FinopsMetricsPanel from './metrics/FinopsMetricsPanel';
import CoreBadge from './CoreBadge';
import { DataSourceInfo, getPageDataSources } from './DataSourceInfo';

// Map KPI color to StatCard variant
const colorToVariant: Record<string, StatCardVariant> = {
  '#f59e0b': 'warning',  // amber
  '#3b82f6': 'info',     // blue
  '#10b981': 'success',  // emerald
  '#22c55e': 'success',  // green
  '#6366f1': 'info',     // indigo
  '#ef4444': 'danger',   // red
};

type Tab = 'dashboard' | 'planning' | 'agent-costs' | 'roi' | 'task-assessment' | 'business-metrics' | 'unit-economics' | 'token-economics' | 'chargeback' | 'optimization' | 'anomalies' | 'capacity' | 'multi-cloud';

const TABS: { id: Tab; label: string }[] = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'planning', label: 'Planning' },
  { id: 'agent-costs', label: 'Agent Costs' },
  { id: 'anomalies', label: 'Cost Anomalies' },
  { id: 'capacity', label: 'Capacity' },
  { id: 'roi', label: 'ROI' },
  { id: 'task-assessment', label: 'Task Fit' },
  { id: 'business-metrics', label: 'Business Value' },
  { id: 'unit-economics', label: 'Unit Economics' },
  { id: 'token-economics', label: 'Token Economics' },
  { id: 'chargeback', label: 'Chargeback' },
  { id: 'optimization', label: 'Optimization' },
  { id: 'multi-cloud', label: 'Multi-Cloud' },
];

// Compute provider cost data from ALL_AGENTS
const computeProviderCosts = () => {
  const providerData: Record<AgentProvider, { monthlyCost: number; agentCount: number; agents: { name: string; cost: number }[] }> = {
    aws: { monthlyCost: 0, agentCount: 0, agents: [] },
    azure: { monthlyCost: 0, agentCount: 0, agents: [] },
    gcp: { monthlyCost: 0, agentCount: 0, agents: [] },
    servicenow: { monthlyCost: 0, agentCount: 0, agents: [] },
    salesforce: { monthlyCost: 0, agentCount: 0, agents: [] },
    copilot_studio: { monthlyCost: 0, agentCount: 0, agents: [] },
    custom: { monthlyCost: 0, agentCount: 0, agents: [] },
  };

  ALL_AGENTS.forEach(agent => {
    const provider = agent.provider || 'aws';
    const dailyCost = agent.metrics.avgCostPerDay;
    const monthlyCost = dailyCost * 30;
    providerData[provider].monthlyCost += monthlyCost;
    providerData[provider].agentCount += 1;
    providerData[provider].agents.push({ name: agent.name, cost: monthlyCost });
  });

  return providerData;
};

const providerCostData = computeProviderCosts();

// Prepare chart data for provider costs
const providerCostChartData = (Object.entries(providerCostData) as [AgentProvider, typeof providerCostData['aws']][])
  .filter(([, data]) => data.monthlyCost > 0)
  .map(([provider, data]) => ({
    provider: AGENT_PROVIDER_CONFIG[provider].label,
    monthlyCost: Math.round(data.monthlyCost * 100) / 100,
    agentCount: data.agentCount,
    color: AGENT_PROVIDER_CONFIG[provider].color,
    category: AGENT_PROVIDER_CONFIG[provider].category,
  }))
  .sort((a, b) => b.monthlyCost - a.monthlyCost);

// Aggregate by category (cloud vs SaaS)
const categoryCostData = providerCostChartData.reduce((acc, item) => {
  const category = item.category === 'cloud' ? 'Cloud Providers' : item.category === 'saas' ? 'SaaS Platforms' : 'Custom';
  const existing = acc.find(c => c.category === category);
  if (existing) {
    existing.monthlyCost += item.monthlyCost;
    existing.agentCount += item.agentCount;
  } else {
    acc.push({
      category,
      monthlyCost: item.monthlyCost,
      agentCount: item.agentCount,
      color: item.category === 'cloud' ? '#3b82f6' : item.category === 'saas' ? '#10b981' : '#6366f1',
    });
  }
  return acc;
}, [] as { category: string; monthlyCost: number; agentCount: number; color: string }[]);

// Simulated 6-month trend data by provider (for demonstration)
const providerTrendData = Array.from({ length: 6 }, (_, i) => {
  const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'][i];
  return {
    month,
    AWS: Math.round(providerCostData.aws.monthlyCost * (0.7 + i * 0.06)),
    Azure: Math.round(providerCostData.azure.monthlyCost * (0.5 + i * 0.1)),
    GCP: Math.round(providerCostData.gcp.monthlyCost * (0.4 + i * 0.12)),
    SaaS: Math.round(
      (providerCostData.servicenow.monthlyCost + providerCostData.salesforce.monthlyCost + providerCostData.copilot_studio.monthlyCost) *
      (0.6 + i * 0.08)
    ),
  };
});

// Get top agents by cost per provider
const topAgentsByProvider = (Object.entries(providerCostData) as [AgentProvider, typeof providerCostData['aws']][])
  .filter(([, data]) => data.agents.length > 0)
  .flatMap(([provider, data]) =>
    data.agents.map(agent => ({
      ...agent,
      provider,
      providerLabel: AGENT_PROVIDER_CONFIG[provider].label,
      color: AGENT_PROVIDER_CONFIG[provider].color,
    }))
  )
  .sort((a, b) => b.cost - a.cost)
  .slice(0, 8);

const totalProviderCost = providerCostChartData.reduce((sum, p) => sum + p.monthlyCost, 0);

// ─── AWS Spend — real Cost Explorer data via the govern_cost backend slice ───
const SPEND_COLORS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#14b8a6', '#f43f5e'];

// Trim the noisy "Amazon "/"AWS " prefixes and "Service" suffix so service names fit.
const shortSvc = (s: string) =>
  s.replace(/^Amazon\s+/, '').replace(/^AWS\s+/, '').replace(/\s+Service$/, '');

// Compact a model id for tight table cells: drop provider prefix + trailing
// suffixes so 'anthropic.claude-opus-4-8' → 'claude-opus-4-8'.
const shortModel = (m: string) =>
  m.replace(/^[a-z]+\./, '').replace(/-(mantle|standard).*$/, '');

// ─── Dashboard Summary Card — fast-loading hero card ───
function DashboardSummaryCard({ loading, data, live }: UseDashboardSummaryResult) {
  const usd = (n: number) => `$${Math.round(n).toLocaleString()}`;
  const pct = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;

  // Determine MoM trend styling
  const momIsUp = (data?.mtd_change_pct ?? 0) > 0;
  const momColor = momIsUp ? 'text-rose-600' : 'text-emerald-600';
  const momBg = momIsUp ? 'bg-rose-50' : 'bg-emerald-50';

  return (
    <div className="mb-6 rounded-xl border border-slate-200/60 shadow-sm bg-white/80 backdrop-blur-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <h2 className="text-sm font-semibold text-slate-900">FinOps Dashboard Summary</h2>
          {live ? <LiveDataBadge /> : <MockDataBadge integration="Connect AWS Cost Explorer" />}
          {data?.cached_at && <span className="text-[10px] text-slate-400">cached {new Date(data.cached_at).toLocaleTimeString()}</span>}
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 animate-pulse">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-20 bg-slate-100 rounded-lg" />
          ))}
        </div>
      ) : !live ? (
        <div className="flex items-start gap-2 text-[12px] text-slate-500 bg-slate-50 rounded-lg px-4 py-3">
          <span className="text-amber-500">*</span>
          <span>{data?.note ?? 'Cost Explorer unavailable - connect an AWS account with ce:GetCostAndUsage to see dashboard summary.'}</span>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {/* MTD Spend */}
          <div className="bg-gradient-to-br from-indigo-50 to-white rounded-lg border border-indigo-100 p-4">
            <div className="text-[10px] text-indigo-600 uppercase tracking-wide font-medium">MTD Spend</div>
            <div className="text-2xl font-bold text-indigo-700 tabular-nums mt-1">{usd(data?.total_mtd ?? 0)}</div>
            <div className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold mt-1 ${momBg} ${momColor}`}>
              {pct(data?.mtd_change_pct ?? 0)} MoM
            </div>
          </div>

          {/* Last Month */}
          <div className="bg-white rounded-lg border border-slate-200/60 p-4">
            <div className="text-[10px] text-slate-500 uppercase tracking-wide font-medium">Last Month</div>
            <div className="text-2xl font-bold text-slate-800 tabular-nums mt-1">{usd(data?.total_last_month ?? 0)}</div>
            <div className="text-[10px] text-slate-400 mt-1">total spend</div>
          </div>

          {/* AI Spend */}
          <div className="bg-gradient-to-br from-violet-50 to-white rounded-lg border border-violet-100 p-4">
            <div className="text-[10px] text-violet-600 uppercase tracking-wide font-medium">AI/ML MTD</div>
            <div className="text-2xl font-bold text-violet-700 tabular-nums mt-1">{usd(data?.ai_mtd ?? 0)}</div>
            <div className="text-[10px] text-violet-500 mt-1">Bedrock + SageMaker</div>
          </div>

          {/* Budget Health */}
          <div className={`rounded-lg border p-4 ${(data?.budgets_over_100_pct ?? 0) > 0 ? 'bg-rose-50 border-rose-200' : (data?.budgets_over_80_pct ?? 0) > 0 ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-100'}`}>
            <div className="text-[10px] text-slate-600 uppercase tracking-wide font-medium">Budgets</div>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-bold text-slate-800 tabular-nums">{data?.budget_count ?? 0}</span>
              {(data?.budgets_over_100_pct ?? 0) > 0 && (
                <span className="text-[10px] font-semibold text-rose-600 bg-rose-100 px-1.5 py-0.5 rounded">
                  {data?.budgets_over_100_pct} over
                </span>
              )}
              {(data?.budgets_over_80_pct ?? 0) > 0 && (data?.budgets_over_100_pct ?? 0) === 0 && (
                <span className="text-[10px] font-semibold text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded">
                  {data?.budgets_over_80_pct} at risk
                </span>
              )}
            </div>
            <div className="text-[10px] text-slate-400 mt-1">active budgets</div>
          </div>

          {/* Anomalies */}
          <div className={`rounded-lg border p-4 ${(data?.anomaly_count_30d ?? 0) > 0 ? 'bg-amber-50 border-amber-200' : 'bg-white border-slate-200/60'}`}>
            <div className="text-[10px] text-slate-600 uppercase tracking-wide font-medium">Anomalies</div>
            <div className="flex items-baseline gap-2 mt-1">
              <span className={`text-2xl font-bold tabular-nums ${(data?.anomaly_count_30d ?? 0) > 0 ? 'text-amber-700' : 'text-slate-800'}`}>
                {data?.anomaly_count_30d ?? 0}
              </span>
              {(data?.anomaly_count_30d ?? 0) > 0 && (
                <span className="text-[10px] font-semibold text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded animate-pulse">
                  review
                </span>
              )}
            </div>
            <div className="text-[10px] text-slate-400 mt-1">last 30 days</div>
          </div>

          {/* Agent Costs */}
          <div className="bg-white rounded-lg border border-slate-200/60 p-4">
            <div className="text-[10px] text-slate-500 uppercase tracking-wide font-medium">Agents</div>
            <div className="text-2xl font-bold text-slate-800 tabular-nums mt-1">{data?.agent_count ?? 0}</div>
            <div className="text-[10px] text-slate-400 mt-1">{usd(data?.agent_total_cost_30d ?? 0)} / 30d</div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Cost Comparison Section — top cost drivers with MoM changes ───
function CostComparisonSection() {
  const { loading, data, live } = useCostComparison(1);
  const usd = (n: number) => `$${Math.abs(n) >= 1 ? Math.round(Math.abs(n)).toLocaleString() : Math.abs(n).toFixed(2)}`;
  const signed = (n: number) => `${n >= 0 ? '+' : '-'}${usd(n)}`;
  const pct = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;

  const all = data?.drivers ?? [];
  const hasData = all.length > 0;

  // Filter by kind FIRST, then cap each list. The previous version took the top 10
  // drivers and then split them by driver_type, so once the backend began sorting
  // new/stopped rows first the Service and Region columns went empty — the cap was
  // deciding what the categories contained.
  const ofKind = (k: string, n = 6) =>
    all
      .filter(d => d.change_kind === k)
      .sort((a, b) => Math.abs(b.absolute_difference) - Math.abs(a.absolute_difference))
      .slice(0, n);
  const started = ofKind('new');
  const stopped = ofKind('stopped');
  const increases = ofKind('increase');
  const decreases = ofKind('decrease');

  const grossMoved = (data?.gross_increase ?? 0) + Math.abs(data?.gross_decrease ?? 0);
  const net = data?.total_difference ?? 0;
  // Offsetting is the headline when movement dwarfs the net result: "flat" and "a lot
  // moved and cancelled out" are very different findings, and only the second is
  // actionable.
  const offsetting = grossMoved > 0 && Math.abs(net) < grossMoved * 0.5;
  // A stop and a start in the same period MAY be one workload moving. Flagged as a
  // pattern, deliberately not asserted as a cause — two unrelated changes in the same
  // month look identical from cost data alone.
  const possibleMove = started.length > 0 && stopped.length > 0;

  /**
   * Caption for a category heading.
   *
   * `shown` is how many rows are listed (any granularity); `serviceCount` is the
   * full-set count at SERVICE level. When a whole service started or stopped that is the
   * headline; when only usage types changed, saying "0 at service level" above six
   * listed rows reads as a contradiction, so the granularity is stated instead.
   */
  const captionFor = (shown: number, serviceCount: number) =>
    serviceCount > 0
      ? `${shown} shown · ${serviceCount} whole service${serviceCount === 1 ? '' : 's'}`
      : `${shown} shown · usage-type level, no whole service`;

  const KindList = ({
    title, rows, tone, amountOf, caption,
  }: {
    title: string;
    rows: typeof all;
    tone: 'rose' | 'emerald' | 'blue' | 'slate';
    amountOf: (d: typeof all[0]) => number;
    caption: string;
  }) => {
    const toneText =
      tone === 'rose' ? 'text-rose-600'
      : tone === 'emerald' ? 'text-emerald-600'
      : tone === 'blue' ? 'text-blue-600'
      : 'text-slate-600';
    return (
      <div>
        <div className="flex items-baseline gap-2 mb-1">
          <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">{title}</div>
          <div className="text-[10px] text-slate-400">{rows.length === 0 ? 'none' : caption}</div>
          {/* When nothing changed at SERVICE level but usage types did, say so. The bare
              count read "0 at service level" directly above six listed rows. */}
        </div>
        {rows.length === 0 ? (
          <div className="text-[11px] text-slate-400 py-1.5">No line items in this category.</div>
        ) : (
          <div className="space-y-0.5">
            {rows.map((d, i) => (
              <div key={i} className="flex items-center justify-between text-[11px] py-1.5 border-b border-slate-50 last:border-0">
                <span className="text-slate-700 truncate max-w-[190px]" title={`${d.driver_type}: ${d.driver_value}`}>
                  {shortSvc(d.driver_value)}
                </span>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className="text-[9px] text-slate-400 uppercase">
                    {d.driver_type === 'USAGE_TYPE' ? 'usage' : d.driver_type.toLowerCase()}
                  </span>
                  <span className={`font-semibold tabular-nums min-w-[62px] text-right ${toneText}`}>{usd(amountOf(d))}</span>
                  <span
                    className="text-[9px] text-slate-400 tabular-nums min-w-[38px] text-right"
                    title="Share of gross movement within this grouping"
                  >
                    {d.contribution_pct.toFixed(0)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="mb-6 rounded-xl border border-slate-200/60 shadow-sm bg-white/80 backdrop-blur-sm p-5">
      <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
        <div className="flex items-center gap-2.5">
          <h2 className="text-sm font-semibold text-slate-900">Cost Change Drivers</h2>
          {live ? <LiveDataBadge /> : <MockDataBadge integration="Connect AWS Cost Explorer" />}
        </div>
        {hasData && (
          <div className="flex items-center gap-2 flex-wrap">
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${net > 0 ? 'bg-rose-50' : 'bg-emerald-50'}`}>
              <span className="text-[11px] text-slate-500">Net</span>
              <span className={`text-sm font-bold tabular-nums ${net > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                {signed(net)} ({pct(data?.total_difference_pct ?? 0)})
              </span>
            </div>
            {/* Gross movement beside the net, because the net alone can read as "nothing
                happened" while a large amount of spend has in fact relocated. */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-50">
              <span className="text-[11px] text-slate-500">Gross moved</span>
              <span className="text-sm font-bold tabular-nums text-slate-700">{usd(grossMoved)}</span>
            </div>
          </div>
        )}
      </div>

      {/* The window is fixed and stated: this panel answers "what changed since last
          month", which is not the question the AWS spend period selector asks, so it is
          deliberately not driven by it. */}
      {data?.comparison_period_start ? (
        <div className="text-[11px] text-slate-500 mb-4">
          {data.comparison_period_start} to {data.comparison_period_end} vs the same day range a month earlier
          <span className="text-slate-400"> &mdash; equal day counts, so the two are comparable</span>
        </div>
      ) : (
        /* Rendered before the response lands. Without the guard this read
           "to vs the same day range a month earlier" with both dates blank. */
        <div className="text-[11px] text-slate-400 mb-4">Month-over-month comparison, equal day counts</div>
      )}

      {loading ? (
        <div className="h-40 flex items-center justify-center text-sm text-slate-400">Loading comparison…</div>
      ) : !hasData ? (
        <div className="flex items-start gap-2 text-[12px] text-slate-500 bg-slate-50 rounded-lg px-4 py-3">
          <Icon name="information-circle" className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
          <span>{data?.note ?? 'Cost comparison requires at least 2 months of Cost Explorer data.'}</span>
        </div>
      ) : (
        <>
          {offsetting && (
            <div className="mb-4 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              <span className="font-semibold">The net change understates the activity.</span>{' '}
              {usd(data?.gross_increase ?? 0)} of increases and {usd(data?.gross_decrease ?? 0)} of decreases
              largely cancel, leaving a net of {signed(net)}. Spend moved rather than grew.
            </div>
          )}

          {possibleMove && (
            <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50/60 px-3 py-2.5">
              <div className="text-[11px] font-semibold text-blue-900 mb-1">Possible workload move</div>
              <div className="text-[11px] text-blue-800">
                {stopped.length} line item{stopped.length === 1 ? '' : 's'} stopped and {started.length} started in
                this period. That pattern often means a workload moved model, region or account rather than costs
                changing &mdash; but cost data alone cannot confirm it, so the two lists are shown side by side for
                you to judge.
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-5">
            <KindList
              title="Newly started"
              rows={started}
              tone="blue"
              caption={captionFor(started.length, data?.new_count ?? 0)}
              amountOf={d => d.comparison_cost}
            />
            <KindList
              title="Stopped"
              rows={stopped}
              tone="slate"
              caption={captionFor(stopped.length, data?.stopped_count ?? 0)}
              amountOf={d => d.base_cost}
            />
            <KindList
              title="Biggest increases"
              rows={increases}
              tone="rose"
              caption={captionFor(increases.length, data?.increase_count ?? 0)}
              amountOf={d => d.absolute_difference}
            />
            <KindList
              title="Biggest decreases"
              rows={decreases}
              tone="emerald"
              caption={captionFor(decreases.length, data?.decrease_count ?? 0)}
              amountOf={d => d.absolute_difference}
            />
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 text-[10px] text-slate-400">
            Percentages are each line item&apos;s share of gross movement within its own grouping (service, region
            or usage type) &mdash; the three groupings describe the same dollars at different granularity, so they
            are not additive. Counts beside each heading cover every service-level change, including rows beyond
            the 50 listed here.
          </div>
        </>
      )}
    </div>
  );
}

// ─── Enhanced Token Economics Card — with estimated token counts ───
function EnhancedTokenEconomicsCard({ w }: { w: SpendWindow }) {
  const { loading, refreshing, data, live } = useTokenCosts(w.months, w.monthsOffset);
  const usd = (n: number) => `$${n < 100 ? n.toFixed(2) : Math.round(n).toLocaleString()}`;

  const tokensByType = data?.by_token_type ?? [];
  const inputTotal = data?.input_total ?? 0;
  const outputTotal = data?.output_total ?? 0;
  const totalCost = inputTotal + outputTotal;

  // The $/1K figures this card used to show were ARITHMETICALLY GUARANTEED to be the
  // list rate, not a measurement of this account.
  //
  // They divided real Cost Explorer dollars by a token count that the backend had
  // itself derived as `dollars / rate * 1000`. Substituting, the division cancels:
  //
  //     $/1K = dollars / ((dollars / rate * 1000) / 1000) = rate
  //
  // So "Cost / 1K output" displayed exactly $0.0150 on every account regardless of
  // spend, and the note claiming this replaced an earlier self-referential
  // computation described a fix that never landed - the circularity moved, it did
  // not go away. The backend no longer reports derived token counts at all
  // (`tokens` is null), so there is nothing here to divide by.
  //
  // A real $/1K needs measured CloudWatch token counts as the denominator, which is
  // what the Token Economics TAB does (it reads the runtime metrics directly). This
  // dashboard card shows measured dollars only and points at that tab for rates.
  // (No $/1K variables at all - see above. Deliberately not computed here.)

  return (
    <div className={`mb-6 rounded-xl border border-slate-200/60 shadow-sm bg-white/80 backdrop-blur-sm p-5 transition-opacity duration-300 ${refreshing ? 'opacity-50' : 'opacity-100'}`}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <h2 className="text-sm font-semibold text-slate-900">Token Economics</h2>
          {live ? <LiveDataBadge /> : <MockDataBadge integration="Connect AWS Cost Explorer" />}
          <span className="text-[11px] text-slate-400">input vs output token costs</span>
          <RefreshingPill show={refreshing} />
        </div>
        {live && totalCost > 0 && (
          <span className="text-sm font-semibold text-slate-700 tabular-nums">{usd(totalCost)} total</span>
        )}
      </div>

      {loading ? (
        <div className="h-32 flex items-center justify-center text-sm text-slate-400">Loading token costs...</div>
      ) : !live || totalCost === 0 ? (
        <div className="flex items-start gap-2 text-[12px] text-slate-500 bg-slate-50 rounded-lg px-4 py-3">
          <span className="text-amber-500">*</span>
          <span>{data?.note ?? 'Token cost breakdown requires Bedrock usage in Cost Explorer.'}</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-blue-50 rounded-lg border border-blue-100 p-4">
              <div className="text-[10px] text-blue-600 uppercase tracking-wide font-medium">Input Tokens</div>
              <div className="text-xl font-bold text-blue-700 tabular-nums mt-1">{usd(inputTotal)}</div>
              {/* No token count and no $/1K here. Both were derived from spend divided
                  by a list rate, which made the $/1K arithmetically equal to that rate on
                  every account. Measured token counts and a real $/1K live on the Token
                  Economics tab, which reads CloudWatch directly. */}
              <div className="text-[11px] text-blue-500 mt-1">measured spend</div>
              <div className="text-[10px] text-blue-400 mt-0.5">
                token counts &amp; $/1K on the Token Economics tab
              </div>
            </div>
            <div className="bg-emerald-50 rounded-lg border border-emerald-100 p-4">
              <div className="text-[10px] text-emerald-600 uppercase tracking-wide font-medium">Output Tokens</div>
              <div className="text-xl font-bold text-emerald-700 tabular-nums mt-1">{usd(outputTotal)}</div>
              <div className="text-[11px] text-emerald-500 mt-1">measured spend</div>
              <div className="text-[10px] text-emerald-400 mt-0.5">
                token counts &amp; $/1K on the Token Economics tab
              </div>
            </div>
          </div>

          {/* Input/Output ratio visualization */}
          <div>
            <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-2">Cost Distribution</div>
            <div className="h-6 rounded-lg overflow-hidden flex">
              {inputTotal > 0 && (
                <div
                  className="bg-blue-500 h-full flex items-center justify-center text-[10px] text-white font-medium"
                  style={{ width: `${(inputTotal / totalCost) * 100}%` }}
                >
                  {((inputTotal / totalCost) * 100).toFixed(0)}% input
                </div>
              )}
              {outputTotal > 0 && (
                <div
                  className="bg-emerald-500 h-full flex items-center justify-center text-[10px] text-white font-medium"
                  style={{ width: `${(outputTotal / totalCost) * 100}%` }}
                >
                  {((outputTotal / totalCost) * 100).toFixed(0)}% output
                </div>
              )}
            </div>

            {/* Per-model breakdown if available */}
            {tokensByType.length > 0 && (
              <div className="mt-3 space-y-1.5">
                <div className="text-[10px] text-slate-500 font-medium">By Model</div>
                {tokensByType.slice(0, 5).map((t, i) => (
                  <div key={i} className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-600 truncate max-w-[150px]">{shortModel(t.model)}</span>
                    <div className="flex items-center gap-2">
                      {/* t.tokens is always null now - the backend no longer derives
                          counts from spend. Show the billing dimension and the dollars. */}
                      <span className={`tabular-nums ${t.token_type === 'input' ? 'text-blue-600' : t.token_type === 'output' ? 'text-emerald-600' : 'text-slate-500'}`}>
                        {t.token_type.replace('_', ' ')}
                      </span>
                      <span className="text-slate-700 font-medium tabular-nums">{usd(t.amount)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="mt-3 pt-3 border-t border-slate-100 text-[10px] text-slate-400">
        Token estimates are approximations based on typical Bedrock pricing. Actual token counts depend on model and pricing tier.
      </div>
    </div>
  );
}

// ─── Service Quotas Card — key Bedrock limits ───
function ServiceQuotasCard() {
  const { loading, data, live } = useServiceQuotasLite("bedrock");

  const quotas = data?.quotas ?? [];
  const keyQuotas = quotas.filter(q =>
    q.quota_name.toLowerCase().includes('invocation') ||
    q.quota_name.toLowerCase().includes('token') ||
    q.quota_name.toLowerCase().includes('agent') ||
    q.quota_name.toLowerCase().includes('model')
  ).slice(0, 6);

  const formatValue = (q: typeof quotas[0]) => {
    if (q.value >= 1e6) return `${(q.value / 1e6).toFixed(1)}M`;
    if (q.value >= 1e3) return `${(q.value / 1e3).toFixed(0)}K`;
    return q.value.toLocaleString();
  };

  return (
    <div className="mb-6 rounded-xl border border-slate-200/60 shadow-sm bg-white/80 backdrop-blur-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <h2 className="text-sm font-semibold text-slate-900">Service Quotas</h2>
          {live ? <LiveDataBadge /> : <MockDataBadge integration="Connect AWS Service Quotas" />}
          <span className="text-[11px] text-slate-400">key Bedrock limits</span>
        </div>
        {data && (
          <span className="text-[11px] text-slate-500">
            {data.adjustable_quotas}/{data.total_quotas} adjustable
          </span>
        )}
      </div>

      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 animate-pulse">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-16 bg-slate-100 rounded-lg" />
          ))}
        </div>
      ) : keyQuotas.length === 0 ? (
        <div className="flex items-start gap-2 text-[12px] text-slate-500 bg-slate-50 rounded-lg px-4 py-3">
          <span className="text-amber-500">*</span>
          <span>{data?.note ?? 'Service Quotas API unavailable or no Bedrock quotas found.'}</span>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {keyQuotas.map((q, i) => (
            <div key={i} className="bg-slate-50 rounded-lg p-3">
              <div className="text-lg font-bold text-slate-800 tabular-nums">{formatValue(q)}</div>
              <div className="text-[10px] text-slate-500 truncate" title={q.quota_name}>
                {q.quota_name.replace(/^Amazon Bedrock /, '').replace(/ quota$/i, '')}
              </div>
              {q.adjustable && (
                <span className="inline-block mt-1 text-[9px] px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded font-medium">
                  adjustable
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Rightsizing Recommendations Card ───
function RightsizingCard() {
  const { loading, data, live } = useRightsizing("AmazonEC2", "FOURTEEN_DAYS");
  const usd = (n: number) => `$${Math.round(n).toLocaleString()}`;

  const recommendations = data?.recommendations ?? [];
  const totalSavings = data?.total_estimated_savings ?? 0;

  return (
    <div className="mb-6 rounded-xl border border-slate-200/60 shadow-sm bg-white/80 backdrop-blur-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <h2 className="text-sm font-semibold text-slate-900">Rightsizing Recommendations</h2>
          {live ? <LiveDataBadge /> : <MockDataBadge integration="Connect AWS Cost Explorer" />}
          <span className="text-[11px] text-slate-400">potential savings from EC2 optimization</span>
        </div>
        {totalSavings > 0 && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-50">
            <span className="text-[11px] text-slate-500">Potential savings:</span>
            <span className="text-sm font-bold text-emerald-600 tabular-nums">{usd(totalSavings)}/mo</span>
          </div>
        )}
      </div>

      {loading ? (
        <div className="h-32 flex items-center justify-center text-sm text-slate-400">Loading recommendations...</div>
      ) : recommendations.length === 0 ? (
        <div className="flex items-start gap-2 text-[12px] text-slate-500 bg-emerald-50 rounded-lg px-4 py-3">
          <span className="text-emerald-500">*</span>
          <span>{data?.note ?? 'No rightsizing recommendations - your instances are well-sized or Cost Explorer Rightsizing needs to be enabled.'}</span>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-slate-400 text-[10px] uppercase tracking-wide text-left border-b border-slate-100">
                <th className="font-medium pb-2 pr-4">Instance</th>
                <th className="font-medium pb-2">Current Type</th>
                <th className="font-medium pb-2">Recommendation</th>
                <th className="font-medium pb-2 text-right">Current Cost</th>
                <th className="font-medium pb-2 text-right">Savings</th>
              </tr>
            </thead>
            <tbody>
              {recommendations.slice(0, 5).map((r, i) => (
                <tr key={i} className={i > 0 ? 'border-t border-slate-50' : ''}>
                  <td className="py-2 pr-4">
                    <div className="font-medium text-slate-900">{r.instance_name || r.instance_id}</div>
                    {r.instance_name && <div className="text-[10px] text-slate-400">{r.instance_id}</div>}
                  </td>
                  <td className="py-2 text-slate-600">{r.instance_type}</td>
                  <td className="py-2">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                      r.recommendation_type === 'Terminate' ? 'bg-rose-50 text-rose-700' :
                      r.recommendation_type === 'Downsize' ? 'bg-amber-50 text-amber-700' :
                      'bg-blue-50 text-blue-700'
                    }`}>
                      {r.recommendation_type}
                    </span>
                    {r.target && (
                      <span className="ml-2 text-slate-500">{'->'} {r.target.instance_type}</span>
                    )}
                  </td>
                  <td className="py-2 text-right tabular-nums text-slate-500">{usd(r.current_monthly_cost)}</td>
                  <td className="py-2 text-right tabular-nums font-semibold text-emerald-600">
                    {usd(r.target?.estimated_monthly_savings ?? r.current_monthly_cost)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {recommendations.length > 5 && (
            <div className="mt-2 text-[11px] text-slate-400">
              Showing 5 of {recommendations.length} recommendations
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Ranked horizontal-bar list — the house style used by the live AWS Spend
// by-service / by-model cards. Shared so the illustrative cards match it.
function RankedBars({ rows, nameWidth = 130 }: { rows: { label: string; value: number; color: string; sub?: string }[]; nameWidth?: number }) {
  const max = rows[0]?.value || 1;
  const usd = (n: number) => `$${Math.round(n).toLocaleString()}`;
  return (
    <div className="space-y-1.5">
      {rows.map((r, i) => (
        <div key={i} className="flex items-center gap-2 text-[11px]" title={`${r.label}${r.sub ? ` · ${r.sub}` : ''} · ${usd(r.value)}`}>
          <span className="shrink-0 truncate text-slate-600" style={{ width: nameWidth }}>{r.label}</span>
          <div className="flex-1 h-3 rounded-sm bg-slate-100 overflow-hidden">
            <div className="h-full rounded-sm" style={{ width: `${Math.max(4, (r.value / max) * 100)}%`, background: r.color }} />
          </div>
          <span className="w-16 shrink-0 text-right tabular-nums font-medium text-slate-700">{usd(r.value)}</span>
        </div>
      ))}
    </div>
  );
}

// Cross-provider model mix — ILLUSTRATIVE. A true multi-cloud view spans every
// provider's cost API; only the Bedrock/AWS slice is live today (see the live
// "Bedrock Cost by Model" card). This placeholder shows the shape the Multi-Cloud
// module will own once Azure/Vertex cost connectors are wired.
const CROSS_PROVIDER_MODELS = [
  { model: 'Claude (Bedrock)',        provider: 'AWS Bedrock',   cost: 4068, color: '#6366f1' },
  { model: 'GPT-4o (Azure OpenAI)',   provider: 'Azure',         cost: 2140, color: '#0ea5e9' },
  { model: 'Gemini 1.5 (Vertex)',     provider: 'Google Vertex', cost: 1220, color: '#10b981' },
  { model: 'Claude (Anthropic API)',  provider: 'Anthropic',     cost:  760, color: '#f59e0b' },
  { model: 'Nova (Bedrock)',          provider: 'AWS Bedrock',   cost:  234, color: '#ec4899' },
];

// Multi-cloud provider keys that have live cost connectors (Azure, GCP + SaaS).
// AWS Bedrock spend is live on the Dashboard tab; this card covers the others.
const MULTICLOUD_PROVIDER_KEYS = ['azure', 'gcp', 'servicenow', 'salesforce', 'copilot_studio'] as const;

// Provider Cost Comparison — LIVE from multi-cloud connectors (multicloudApi) when
// configured, falling back to the illustrative ALL_AGENTS-derived provider mix when
// no connector is connected. Per-provider spend gates on each summary's `.live`.
function MultiCloudProviderCostsCard() {
  const [costs, setCosts] = useState<MultiCloudAllCosts | null>(null);
  const [agents, setAgents] = useState<MultiCloudAllAgents | null>(null);

  useEffect(() => {
    let cancelled = false;
    multicloudApi.allCosts(30)
      .then(d => { if (!cancelled) setCosts(d); })
      .catch(() => { if (!cancelled) setCosts(null); });
    multicloudApi.allAgents()
      .then(d => { if (!cancelled) setAgents(d); })
      .catch(() => { if (!cancelled) setAgents(null); });
    return () => { cancelled = true; };
  }, []);

  // Per-provider rows from live connector data (Azure/GCP/SaaS).
  const liveRows = MULTICLOUD_PROVIDER_KEYS.map(key => {
    const summary = costs?.[key];
    const cfg = AGENT_PROVIDER_CONFIG[key];
    return {
      provider: cfg.label,
      color: cfg.color,
      monthlyCost: Math.round((summary?.total ?? 0) * 100) / 100,
      agentCount: agents?.[key]?.total ?? 0,
      live: !!summary?.live,
    };
  });
  const anyLive = liveRows.some(r => r.live);

  // When at least one connector is live, drive the pie/list from real spend;
  // otherwise show the illustrative ALL_AGENTS-derived provider mix.
  const listRows = anyLive
    ? liveRows
    : providerCostChartData.map(p => ({ provider: p.provider, color: p.color, monthlyCost: p.monthlyCost, agentCount: p.agentCount, live: false }));
  const pieData = listRows.filter(r => r.monthlyCost > 0);
  const total = anyLive ? listRows.reduce((s, r) => s + r.monthlyCost, 0) : totalProviderCost;

  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 shadow-sm mb-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="flex items-center gap-2">
            <div className="text-sm font-semibold text-slate-900">Provider Cost Comparison</div>
            {anyLive
              ? <LiveDataBadge source="Multi-Cloud connectors" detail="Live cost from configured Azure / GCP / SaaS connectors" />
              : <MockDataBadge integration="Configure Azure, GCP or SaaS cost connectors in the Multi-Cloud module" />}
          </div>
          <div className="text-[11px] text-slate-400">Monthly spend across all agent providers (AWS, Azure, GCP, SaaS)</div>
        </div>
        <Link
          to="/govern/agents?tab=providers"
          className="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"
        >
          View Provider Details
          <span className="text-[10px]">→</span>
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Monthly Cost by Provider - Pie Chart */}
        <div>
          <div className="text-xs font-medium text-slate-600 mb-2">Monthly Cost by Provider</div>
          {pieData.length === 0 ? (
            <div className="h-[180px] flex items-center justify-center text-center px-4 text-[12px] text-slate-400">
              Connectors are live but reported no spend for the last 30 days.
            </div>
          ) : (
            <div className="flex items-center gap-4">
              <ResponsiveContainer width="60%" height={180}>
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="monthlyCost"
                    nameKey="provider"
                    cx="50%"
                    cy="50%"
                    outerRadius={70}
                    innerRadius={42}
                    paddingAngle={2}
                  >
                    {pieData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(v, name) => [`$${Number(v).toLocaleString()}`, name]}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-1.5">
                {listRows.map(p => (
                  <div key={p.provider} className="flex items-center gap-2 text-[11px]">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: p.color }} />
                    <span className="text-slate-700 truncate flex-1">{p.provider}</span>
                    {anyLive && !p.live && <MockDataBadge integration={`${p.provider} connector not configured`} />}
                    <span className="text-slate-500">{p.agentCount} agents</span>
                    <span className="text-slate-900 font-medium tabular-nums">${p.monthlyCost.toLocaleString()}</span>
                  </div>
                ))}
                <div className="border-t border-slate-100 pt-1.5 mt-1.5 flex items-center justify-between text-[11px]">
                  <span className="text-slate-600 font-medium">Total</span>
                  <span className="text-slate-900 font-semibold tabular-nums">${total.toLocaleString()}/mo</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Cost Trend by Provider - Line Chart (illustrative) */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <div className="text-xs font-medium text-slate-600">6-Month Provider Trend</div>
            <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 uppercase tracking-wide">Illustrative</span>
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={providerTrendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="month" tick={{ fill: '#94a3b8', fontSize: 10 }} />
              <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} unit="$" />
              <Tooltip contentStyle={tooltipStyle} formatter={(v) => `$${Number(v).toLocaleString()}`} />
              <Line type="monotone" dataKey="AWS" stroke={AGENT_PROVIDER_CONFIG.aws.color} strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="Azure" stroke={AGENT_PROVIDER_CONFIG.azure.color} strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="GCP" stroke={AGENT_PROVIDER_CONFIG.gcp.color} strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="SaaS" stroke="#10b981" strokeWidth={2} strokeDasharray="5 5" dot={false} />
              <Legend wrapperStyle={{ fontSize: '10px', paddingTop: '4px' }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

/**
 * "Updating…" marker for a panel that is showing the PREVIOUS period while the newly
 * selected one is still in flight.
 *
 * This is not decoration. Stale-while-revalidate keeps last period's figures on screen
 * to stop the area flashing, which means for a moment real numbers sit under a heading
 * that already says the new period. Saying so is what keeps that honest.
 */
function RefreshingPill({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 text-[10px] font-medium"
      title="Showing the previous period while the new one loads"
    >
      <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
      Updating…
    </span>
  );
}

/**
 * Period control for the Cost Explorer panels.
 *
 * Renders as the FOOTER of the AWS Spend card, not as its own card. It was a separate
 * card above the graphic, and before that the page header; in both spots it read as a
 * page-wide filter and was easy to miss. Attached to the bottom of the panel whose
 * numbers it changes, the relationship is unambiguous.
 *
 * The hint spells out the period and flags the partial-month caveat: four of the five
 * presets include the current still-accruing month, so they are not comparable
 * like-for-like with "last month".
 */
function SpendWindowPicker({
  value, onChange, w,
}: { value: SpendWindowId; onChange: (id: SpendWindowId) => void; w: SpendWindow }) {
  return (
    <div className="mt-5 pt-3.5 border-t border-slate-200/60">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">Period</span>
        <div className="flex gap-1 p-1 bg-slate-100/80 rounded-lg" role="group" aria-label="AWS spend period">
          {SPEND_WINDOWS.map(opt => (
            <button
              key={opt.id}
              onClick={() => onChange(opt.id)}
              aria-pressed={value === opt.id}
              title={opt.hint}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                value === opt.id
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <span className="text-[10px] text-slate-400">unblended cost, Cost Explorer</span>
      </div>
      <div className="text-[11px] text-slate-500 mt-2">
        {w.hint}
        {w.partial && (
          <span className="text-amber-700">
            {' '}&mdash; includes the current, still-accruing month, so not comparable like-for-like with a closed period
          </span>
        )}
      </div>
    </div>
  );
}

function AwsSpendSection({
  w, windowId, onWindowChange,
}: { w: SpendWindow; windowId: SpendWindowId; onWindowChange: (id: SpendWindowId) => void }) {
  const [aiOnly, setAiOnly] = useState(false);
  const { loading, refreshing, data, live } = useAwsCost(w.months, aiOnly, w.monthsOffset);

  const byService = (data?.by_service ?? []).slice(0, 8).map((s, i) => ({ ...s, color: SPEND_COLORS[i % SPEND_COLORS.length] }));
  const byMonth = (data?.by_month ?? []).map(m => ({
    month: new Date(m.month + 'T00:00:00').toLocaleDateString('en-US', { month: 'short' }),
    amount: Math.round(m.amount),
  }));
  const usd = (n: number) => `$${Math.round(n).toLocaleString()}`;

  return (
    <div className="mb-6 rounded-xl border border-slate-200/60 shadow-sm bg-white/80 backdrop-blur-sm p-5">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-2.5">
          <h2 className="text-sm font-semibold text-slate-900">AWS Spend</h2>
          {live ? <LiveDataBadge /> : <MockDataBadge integration="Connect an AWS account with Cost Explorer" />}
          {/* Period comes from the selector below, never a literal. This read
              "last 6 months" no matter which window was selected. */}
          <span className="text-[11px] text-slate-400">{w.label.toLowerCase()} · unblended</span>
          <RefreshingPill show={refreshing} />
        </div>
        <div className="flex items-center gap-1 p-0.5 bg-slate-100/80 rounded-lg text-[11px]">
          <button onClick={() => setAiOnly(false)} className={`px-2.5 py-1 rounded-md font-medium transition-all ${!aiOnly ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>All AWS</button>
          <button onClick={() => setAiOnly(true)} className={`px-2.5 py-1 rounded-md font-medium transition-all ${aiOnly ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>AI/ML only</button>
        </div>
      </div>

      {/* Dimmed, not replaced, while a new period loads: the skeleton swap is what made
          the whole area flash on every selection. RefreshingPill above says why. */}
      <div className={`transition-opacity duration-300 ${refreshing ? 'opacity-50' : 'opacity-100'}`}>
      {loading ? (
        <div className="h-40 flex items-center justify-center text-sm text-slate-400">Loading spend…</div>
      ) : !live ? (
        <div className="flex items-start gap-2 text-[12px] text-slate-500 bg-slate-50 rounded-lg px-4 py-3">
          <span className="text-amber-500">●</span>
          <span>{data?.note ?? 'Cost Explorer unavailable — showing no live spend. Connect an AWS account with ce:GetCostAndUsage to populate real dollars here.'}</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr_1fr] gap-5">
          {/* Total */}
          <div className="flex flex-col justify-center">
            <div className="text-[11px] text-slate-500 uppercase tracking-wide">Total {aiOnly ? '(AI/ML)' : ''}</div>
            <div className="text-3xl font-bold text-slate-900 tabular-nums mt-1">{usd(data!.total)}</div>
            <div className="text-[11px] text-slate-400 mt-1">{data!.period_start} → {data!.period_end}</div>
          </div>
          {/* By service — ranked list with proportional bars (handles long AWS names) */}
          <div>
            <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-2">By service</div>
            <div className="space-y-1.5">
              {byService.map((s, i) => {
                const maxAmt = byService[0]?.amount || 1;
                return (
                  <div key={i} className="flex items-center gap-2 text-[11px]" title={`${s.service} · ${usd(s.amount)}`}>
                    <span className="w-[120px] shrink-0 truncate text-slate-600">{shortSvc(s.service)}</span>
                    <div className="flex-1 h-3 rounded-sm bg-slate-100 overflow-hidden">
                      <div className="h-full rounded-sm" style={{ width: `${Math.max(4, (s.amount / maxAmt) * 100)}%`, background: s.color }} />
                    </div>
                    <span className="w-14 shrink-0 text-right tabular-nums font-medium text-slate-700">{usd(s.amount)}</span>
                  </div>
                );
              })}
            </div>
          </div>
          {/* By month */}
          <div>
            <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Monthly trend</div>
            <ResponsiveContainer width="100%" height={150}>
              <BarChart data={byMonth} margin={{ left: 4, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="month" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} width={48} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v) => usd(Number(v))} />
                {/* maxBarSize: a one-month window has a single datum, which Recharts would
                    otherwise stretch across the whole plot as a slab. */}
                <Bar dataKey="amount" fill="#6366f1" radius={[4, 4, 0, 0]} maxBarSize={64} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
      </div>

      {/* Period selector lives at the bottom of this card, attached to the numbers it
          drives. Rendered in every state — including not-connected — so the period is
          still changeable when Cost Explorer returns nothing. */}
      <SpendWindowPicker value={windowId} onChange={onWindowChange} w={w} />
    </div>
  );
}

// ─── AWS Spend detail — live daily trend, forecast, anomalies, by-model from Cost Explorer ───
function AwsSpendDetail({ w }: { w: SpendWindow }) {
  // trend and anomalies are capped at 90 days by their routes; byModel follows the
  // selected window. Each panel below states the period it is really showing.
  const trendW = cappedDays(w, SOURCE_DAY_CAPS.trend);
  const anomW = cappedDays(w, SOURCE_DAY_CAPS.anomalies);
  // Rendered beside the two capped panels. Never inherit the page heading: a 90-day
  // series under a "1 year" label is the mislabelling this module keeps removing.
  const trendWindowLabel = cappedLabel(trendW.days, trendW.capped);
  const anomWindowLabel = cappedLabel(anomW.days, anomW.capped);
  const { loading, refreshing, trend, forecast, anomalies, byModel } =
    useAwsCostDetail(trendW.days, 3, anomW.days, w.months, w.monthsOffset);
  const usd = (n: number) => `$${Math.round(n).toLocaleString()}`;
  const anyLive = !!(trend?.live || forecast?.live || anomalies?.live || byModel?.live);
  const models = (byModel?.by_model ?? []).slice(0, 8);
  const modelMax = models[0]?.amount || 1;

  // Nothing live and not loading → don't clutter the page; the AWS Spend section already explains connectivity.
  if (!loading && !anyLive) return null;

  const trendData = (trend?.days ?? []).map(d => ({
    day: new Date(d.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    amount: Math.round(d.amount),
  }));
  const forecastData = (forecast?.months ?? []).map(m => ({
    month: new Date(m.month + 'T00:00:00').toLocaleDateString('en-US', { month: 'short' }),
    amount: Math.round(m.amount),
  }));

  return (
    <div className={`mb-6 grid grid-cols-1 lg:grid-cols-3 gap-4 transition-opacity duration-300 ${refreshing ? 'opacity-50' : 'opacity-100'}`}>
      {/* Daily trend */}
      <div className="rounded-xl border border-slate-200/60 shadow-sm bg-white/80 backdrop-blur-sm p-5">
        <div className="flex items-center gap-2 mb-2">
          {/* Window comes from the data, not a literal. This said "(30d)" while the
              request window is now selector-driven and capped at 90 days. */}
          <h3 className="text-sm font-semibold text-slate-900">Daily Spend ({trendWindowLabel})</h3>
          {trend?.live && <LiveDataBadge />}
        </div>
        {loading ? <div className="h-32 flex items-center justify-center text-xs text-slate-400">Loading…</div> : (
          <>
            <div className="text-2xl font-bold text-slate-900 tabular-nums">{usd(trend?.total ?? 0)}</div>
            <div className="text-[11px] text-slate-400 mb-2">{usd(trend?.avg_per_day ?? 0)}/day avg</div>
            <ResponsiveContainer width="100%" height={90}>
              <AreaChart data={trendData} margin={{ left: 0, right: 4, top: 4, bottom: 0 }}>
                <defs><linearGradient id="spendGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#6366f1" stopOpacity={0.3} /><stop offset="100%" stopColor="#6366f1" stopOpacity={0} /></linearGradient></defs>
                <XAxis dataKey="day" tick={{ fill: '#94a3b8', fontSize: 8 }} interval={6} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v) => usd(Number(v))} />
                <Area type="monotone" dataKey="amount" stroke="#6366f1" strokeWidth={2} fill="url(#spendGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </>
        )}
      </div>

      {/* Forecast */}
      <div className="rounded-xl border border-slate-200/60 shadow-sm bg-white/80 backdrop-blur-sm p-5">
        <div className="flex items-center gap-2 mb-2">
          <h3 className="text-sm font-semibold text-slate-900">Forecast (3mo)</h3>
          {forecast?.live && <LiveDataBadge />}
        </div>
        {loading ? <div className="h-32 flex items-center justify-center text-xs text-slate-400">Loading…</div> : (
          <>
            <div className="text-2xl font-bold text-slate-900 tabular-nums">{usd(forecast?.forecast_total ?? 0)}</div>
            <div className="text-[11px] text-slate-400 mb-2">CE forecast · next 3 months</div>
            <ResponsiveContainer width="100%" height={90}>
              <BarChart data={forecastData} margin={{ left: 0, right: 4, top: 4, bottom: 0 }}>
                <XAxis dataKey="month" tick={{ fill: '#94a3b8', fontSize: 9 }} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v) => usd(Number(v))} />
                <Bar dataKey="amount" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </>
        )}
      </div>

      {/* Anomalies - enhanced for shadow AI detection */}
      {(() => {
        const aiServices = ['Bedrock', 'SageMaker', 'Amazon Q', 'Comprehend'];
        const aiAnomalies = (anomalies?.anomalies ?? []).filter(a =>
          !a.service || aiServices.some(svc => a.service?.toLowerCase().includes(svc.toLowerCase()))
        );
        const highImpact = aiAnomalies.filter(a => a.impact >= 500 || a.score >= 0.75);
        const totalImpact = aiAnomalies.reduce((sum, a) => sum + a.impact, 0);
        const hasAlert = highImpact.length > 0;

        return (
          <div className={`rounded-xl border shadow-sm backdrop-blur-sm p-5 ${hasAlert ? 'border-rose-200 bg-gradient-to-br from-rose-50/80 to-white' : 'border-slate-200/60 bg-white/80'}`}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-slate-900">AI Cost Anomalies</h3>
                {/* States its own window: the anomalies route caps at 90 days, so a
                    longer page selection cannot be honoured here. */}
                <span className="text-[10px] text-slate-400">{anomWindowLabel}</span>
                {anomalies?.live && <LiveDataBadge />}
                {hasAlert && (
                  <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-700 animate-pulse">
                    {highImpact.length} alert{highImpact.length !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
              <Link to="/govern/finops?tab=anomalies" className="text-[10px] text-blue-600 hover:text-blue-700 font-medium">
                Details →
              </Link>
            </div>
            {loading ? <div className="h-32 flex items-center justify-center text-xs text-slate-400">Loading…</div> : (
              <>
                <div className="flex items-baseline gap-3">
                  <span className={`text-2xl font-bold tabular-nums ${hasAlert ? 'text-rose-600' : 'text-slate-900'}`}>{aiAnomalies.length}</span>
                  {totalImpact > 0 && (
                    <span className="text-sm font-semibold text-rose-600">{usd(totalImpact)} impact</span>
                  )}
                </div>
                <div className="text-[11px] text-slate-400 mb-2">in AI services · last 60 days</div>
                <div className="space-y-1.5 max-h-[76px] overflow-y-auto">
                  {aiAnomalies.slice(0, 3).map((a, i) => {
                    const isHigh = a.impact >= 500 || a.score >= 0.75;
                    return (
                      <div key={i} className="flex items-center justify-between text-[11px]">
                        <span className={`truncate mr-2 ${isHigh ? 'text-rose-700 font-medium' : 'text-slate-600'}`}>{a.service ?? 'Unknown'}</span>
                        <span className="flex items-center gap-1.5 flex-shrink-0">
                          <span className="text-slate-400">{a.start.slice(5, 10)}</span>
                          <span className={`font-semibold tabular-nums ${isHigh ? 'text-rose-600' : 'text-amber-600'}`}>{usd(a.impact)}</span>
                        </span>
                      </div>
                    );
                  })}
                  {aiAnomalies.length === 0 && <div className="text-[11px] text-emerald-600">No AI cost anomalies detected.</div>}
                </div>
                {hasAlert && (
                  <Link
                    to="/govern/shadow-ai"
                    className="mt-2 flex items-center gap-1 text-[10px] font-medium text-rose-600 hover:text-rose-700"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                    Investigate in Shadow AI Detection →
                  </Link>
                )}
              </>
            )}
          </div>
        );
      })()}

      {/* Bedrock cost by model — real, parsed from CE USAGE_TYPE (spans full width) */}
      {(loading || (byModel?.live && models.length > 0)) && (
        <div className="lg:col-span-3 rounded-xl border border-slate-200/60 shadow-sm bg-white/80 backdrop-blur-sm p-5">
          <div className="flex items-center gap-2 mb-3">
            <h3 className="text-sm font-semibold text-slate-900">Bedrock Cost by Model</h3>
            {byModel?.live && <LiveDataBadge />}
            <span className="text-[11px] text-slate-400">{w.label.toLowerCase()} · from Cost Explorer usage types</span>
            <RefreshingPill show={refreshing} />
            {byModel?.live && <span className="ml-auto text-[11px] font-semibold text-slate-700 tabular-nums">{usd(byModel.total)} total</span>}
          </div>
          {loading ? <div className="h-24 flex items-center justify-center text-xs text-slate-400">Loading…</div> : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-1.5">
              {models.map((m, i) => (
                <div key={i} className="flex items-center gap-2 text-[11px]" title={`${m.model} · ${usd(m.amount)}`}>
                  <span className="w-[150px] shrink-0 truncate text-slate-600">{m.model}</span>
                  <div className="flex-1 h-3 rounded-sm bg-slate-100 overflow-hidden">
                    <div className="h-full rounded-sm" style={{ width: `${Math.max(4, (m.amount / modelMax) * 100)}%`, background: SPEND_COLORS[i % SPEND_COLORS.length] }} />
                  </div>
                  <span className="w-16 shrink-0 text-right tabular-nums font-medium text-slate-700">{usd(m.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Enhanced Cost Breakdown — by region, operation, and input/output tokens ───
function EnhancedCostBreakdown({ w }: { w: SpendWindow }) {
  const { loading, refreshing, byRegion, byOperation, tokenCosts, commitmentCoverage } = useAwsCostEnhanced(w.months, w.monthsOffset);
  const usd = (n: number) => `$${Math.round(n).toLocaleString()}`;
  const anyLive = !!(byRegion?.live || byOperation?.live || tokenCosts?.live || commitmentCoverage?.live);

  if (!loading && !anyLive) return null;

  const allRegions = byRegion?.by_region ?? [];
  const regions = allRegions.slice(0, 6);
  const operations = (byOperation?.by_operation ?? []).slice(0, 5);
  const regionMax = regions[0]?.amount || 1;
  const opMax = operations[0]?.amount || 1;

  // Spend outside the governed set. Cost Explorer is account-wide, so this response
  // covers every region the account spent in — which means it can see AI spend that
  // none of the Govern dashboards are watching. That gap only exists because CE is
  // NOT fanned out, so it carries no RegionProvenance and RegionCoverageBadge does
  // not apply here; this is the opposite problem (too much coverage, not too little).
  const ungoverned = byRegion?.ungoverned_total ?? 0;
  const ungovernedPct = byRegion?.total ? (ungoverned / byRegion.total) * 100 : 0;
  const ungovernedRegions = allRegions.filter(r => !r.governed);
  const hiddenRegions = Math.max(allRegions.length - regions.length, 0);

  return (
    <div className={`mb-6 grid grid-cols-1 lg:grid-cols-3 gap-4 transition-opacity duration-300 ${refreshing ? 'opacity-50' : 'opacity-100'}`}>
      {/* Cost by Region */}
      <div className="rounded-xl border border-slate-200/60 shadow-sm bg-white/80 backdrop-blur-sm p-5">
        <div className="flex items-center gap-2 mb-3">
          <h3 className="text-sm font-semibold text-slate-900">Cost by Region</h3>
          {byRegion?.live && <LiveDataBadge />}
          <RefreshingPill show={refreshing} />
        </div>
        {loading ? <div className="h-32 flex items-center justify-center text-xs text-slate-400">Loading...</div> : (
          <div className="space-y-1.5">
            {regions.map((r, i) => (
              <div
                key={r.region}
                className="flex items-center gap-2 text-[11px]"
                title={r.governed
                  ? `${r.region}: ${usd(r.amount)} — in the governed region set`
                  : `${r.region}: ${usd(r.amount)} — OUTSIDE the governed region set. This is real AI spend that no Govern dashboard is watching.`}
              >
                <span className="w-[80px] shrink-0 truncate text-slate-600 flex items-center gap-1">
                  {/* An ungoverned region is not a smaller number, it is an unwatched one. */}
                  {!r.governed && <span className="w-1 h-1 rounded-full bg-amber-500 shrink-0" aria-hidden="true" />}
                  <span className="truncate">{r.region}</span>
                </span>
                <div className="flex-1 h-3 rounded-sm bg-slate-100 overflow-hidden">
                  <div className="h-full rounded-sm" style={{ width: `${Math.max(4, (r.amount / regionMax) * 100)}%`, background: SPEND_COLORS[i % SPEND_COLORS.length] }} />
                </div>
                <span className="w-16 shrink-0 text-right tabular-nums font-medium text-slate-700">{usd(r.amount)}</span>
              </div>
            ))}
            {ungoverned > 0 && (
              <div
                className="flex items-center gap-1.5 pt-2 mt-1 border-t border-slate-100 text-[10px] text-amber-700"
                title={`${usd(ungoverned)} of ${usd(byRegion!.total)} was spent outside the governed set (${ungovernedRegions.map(r => r.region).join(', ')}). Governed: ${byRegion!.governed_regions.join(', ') || 'none'}. Every Govern dashboard aggregates over the governed set, so this spend is not reflected in them. Bring the region under governance to close the gap.`}
              >
                <Icon name="exclamation-triangle" className="w-3 h-3 shrink-0" />
                <span>
                  <strong className="tabular-nums">{usd(ungoverned)}</strong> ({ungovernedPct.toFixed(0)}%) outside the governed set
                  {ungovernedRegions.length > 0 && <> · {ungovernedRegions.length} region{ungovernedRegions.length === 1 ? '' : 's'}</>}
                </span>
              </div>
            )}
            {hiddenRegions > 0 && (
              <div className="text-[10px] text-slate-400" title={`Showing the 6 highest-spend regions of ${allRegions.length}. The bars are a top-6 view, not the full account.`}>
                top 6 of {allRegions.length} regions
              </div>
            )}
          </div>
        )}
      </div>

      {/* Cost by Operation (Bedrock) */}
      <div className="rounded-xl border border-slate-200/60 shadow-sm bg-white/80 backdrop-blur-sm p-5">
        <div className="flex items-center gap-2 mb-3">
          <h3 className="text-sm font-semibold text-slate-900">Bedrock Operations</h3>
          {byOperation?.live && <LiveDataBadge />}
        </div>
        {loading ? <div className="h-32 flex items-center justify-center text-xs text-slate-400">Loading...</div> : (
          <div className="space-y-1.5">
            {operations.map((o, i) => {
              const shortOp = o.operation.replace('InvokeModel', '').replace('Inference', '') || o.operation;
              return (
                <div key={o.operation} className="flex items-center gap-2 text-[11px]" title={`${o.operation}: ${usd(o.amount)}`}>
                  <span className="w-[100px] shrink-0 truncate text-slate-600">{shortOp}</span>
                  <div className="flex-1 h-3 rounded-sm bg-slate-100 overflow-hidden">
                    <div className="h-full rounded-sm" style={{ width: `${Math.max(4, (o.amount / opMax) * 100)}%`, background: SPEND_COLORS[(i + 2) % SPEND_COLORS.length] }} />
                  </div>
                  <span className="w-16 shrink-0 text-right tabular-nums font-medium text-slate-700">{usd(o.amount)}</span>
                </div>
              );
            })}
            {operations.length === 0 && <div className="text-xs text-slate-400">No Bedrock operations</div>}
          </div>
        )}
      </div>

      {/* Token Costs (Input vs Output) */}
      <div className="rounded-xl border border-slate-200/60 shadow-sm bg-white/80 backdrop-blur-sm p-5">
        <div className="flex items-center gap-2 mb-3">
          <h3 className="text-sm font-semibold text-slate-900">Token Cost Split</h3>
          {tokenCosts?.live && <LiveDataBadge />}
        </div>
        {loading ? <div className="h-32 flex items-center justify-center text-xs text-slate-400">Loading...</div> : (
          <>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div className="bg-blue-50 rounded-lg p-3 text-center">
                <div className="text-[10px] text-blue-600 uppercase tracking-wide font-medium">Input Tokens</div>
                <div className="text-lg font-bold text-blue-700 tabular-nums">{usd(tokenCosts?.input_total ?? 0)}</div>
              </div>
              <div className="bg-emerald-50 rounded-lg p-3 text-center">
                <div className="text-[10px] text-emerald-600 uppercase tracking-wide font-medium">Output Tokens</div>
                <div className="text-lg font-bold text-emerald-700 tabular-nums">{usd(tokenCosts?.output_total ?? 0)}</div>
              </div>
            </div>
            {commitmentCoverage?.savings_plans && (
              <div className="mt-2 pt-2 border-t border-slate-100">
                <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">Savings Plans Coverage</div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full rounded-full bg-violet-500" style={{ width: `${commitmentCoverage.savings_plans.coverage_pct}%` }} />
                  </div>
                  <span className="text-xs font-semibold text-slate-700">{commitmentCoverage.savings_plans.coverage_pct}%</span>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Cost by Tag — live CE GroupBy=TAG, reads back Plan's taxonomy ───
// Governance taxonomy keys always offered (what Plan owns); a nice label if present.
const TAG_KEY_LABELS: Record<string, string> = {
  'business-unit': 'Business Unit', 'business-domain': 'Business Domain', 'agent': 'Agent', 'owner': 'Owner',
};
const labelFor = (k: string) => TAG_KEY_LABELS[k] ?? k;

function CostByTagCard() {
  const [keyOpts, setKeyOpts] = useState<AwsTagKeyOption[]>([]);
  const [tagKey, setTagKey] = useState('business-unit');
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<AwsCostTagBreakdown | null>(null);

  // Discover the account's tag keys once; prefer active keys, else the governance defaults.
  useEffect(() => {
    let cancelled = false;
    governCostApi.tagKeys()
      .then(r => {
        if (cancelled) return;
        const active = r.keys.filter(k => k.active);
        // Show active account keys first; always include the governance taxonomy keys.
        const gov = ['business-unit', 'business-domain', 'agent', 'owner'];
        const merged: AwsTagKeyOption[] = [
          ...active,
          ...gov.filter(g => !active.some(a => a.key === g)).map(g => ({ key: g, active: false })),
        ];
        setKeyOpts(merged.slice(0, 8));
        if (active.length > 0) setTagKey(active[0].key);
      })
      .catch(() => { if (!cancelled) setKeyOpts(['business-unit', 'business-domain', 'agent', 'owner'].map(k => ({ key: k, active: false }))); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    governCostApi.byTag(tagKey, 6)
      .then(d => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setData(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [tagKey]);

  const usd = (n: number) => `$${Math.round(n).toLocaleString()}`;
  const rows = (data?.by_value ?? []).slice(0, 8).map((v, i) => ({
    label: v.value, value: v.amount, color: SPEND_COLORS[i % SPEND_COLORS.length],
  }));
  const hasTagged = (data?.tagged_total ?? 0) > 0;

  return (
    <div className="mb-6 rounded-xl border border-slate-200/60 shadow-sm bg-white/80 backdrop-blur-sm p-5">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-2.5">
          <h3 className="text-sm font-semibold text-slate-900">Cost by Tag</h3>
          {data?.live && <LiveDataBadge />}
          <span className="text-[11px] text-slate-400">chargeback view · reads Plan taxonomy from cost-allocation tags</span>
        </div>
        <div className="flex items-center gap-1 p-0.5 bg-slate-100/80 rounded-lg text-[11px] flex-wrap">
          {keyOpts.map(t => (
            <button key={t.key} onClick={() => setTagKey(t.key)}
              title={t.active ? 'Activated for cost allocation' : 'Not yet activated'}
              className={`px-2.5 py-1 rounded-md font-medium transition-all flex items-center gap-1 ${tagKey === t.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>
              {t.active && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />}
              {labelFor(t.key)}
            </button>
          ))}
        </div>
      </div>
      {loading ? (
        <div className="h-24 flex items-center justify-center text-xs text-slate-400">Loading…</div>
      ) : hasTagged ? (
        <RankedBars rows={rows} nameWidth={150} />
      ) : (
        <div className="flex items-start gap-2 text-[12px] text-slate-500 bg-slate-50 rounded-lg px-4 py-3">
          <span className="text-amber-500 mt-0.5">●</span>
          <div>
            <div className="font-medium text-slate-600">Awaiting tagged usage</div>
            <div className="text-[11px] mt-0.5">{data?.note ?? `No spend carries the '${tagKey}' tag yet.`} Untagged spend this window: {usd(data?.untagged_total ?? 0)}.</div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Budgets — live AWS Budgets (budget vs actual), honest empty when none defined ───
function BudgetsCard() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<AwsBudgetsResponse | null>(null);
  useEffect(() => {
    let cancelled = false;
    governCostApi.budgets()
      .then(d => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setData(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);
  const usd = (n: number) => `$${Math.round(n).toLocaleString()}`;
  const budgets = data?.budgets ?? [];

  return (
    <div className="mb-6 rounded-xl border border-slate-200/60 shadow-sm bg-white/80 backdrop-blur-sm p-5">
      <div className="flex items-center gap-2.5 mb-3">
        <h3 className="text-sm font-semibold text-slate-900">Budgets vs Actual</h3>
        {data?.live && <LiveDataBadge />}
        <span className="text-[11px] text-slate-400">AWS Budgets</span>
        {budgets.length > 0 && <span className="ml-auto text-[11px] font-semibold text-slate-700 tabular-nums">{usd(data!.total_actual)} / {usd(data!.total_limit)}</span>}
      </div>
      {loading ? (
        <div className="h-20 flex items-center justify-center text-xs text-slate-400">Loading…</div>
      ) : budgets.length > 0 ? (
        <div className="space-y-2.5">
          {budgets.map(b => {
            const pct = Math.min(b.pct_used, 100);
            const color = b.pct_used > 90 ? 'bg-rose-500' : b.pct_used > 75 ? 'bg-amber-500' : 'bg-emerald-500';
            return (
              <div key={b.name}>
                <div className="flex items-center justify-between text-[11px] mb-1">
                  <span className="text-slate-700 font-medium">{b.name} <span className="text-slate-400 font-normal">· {b.time_unit.toLowerCase()}</span></span>
                  <span className="text-slate-500 tabular-nums">{usd(b.actual)}/{usd(b.limit)} ({b.pct_used}%)</span>
                </div>
                <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                  <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex items-start gap-2 text-[12px] text-slate-500 bg-slate-50 rounded-lg px-4 py-3">
          <span className="text-amber-500 mt-0.5">●</span>
          <div>
            <div className="font-medium text-slate-600">No budgets defined</div>
            <div className="text-[11px] mt-0.5">{data?.note ?? 'Create AWS Budgets in the Billing console to track budget-vs-actual here.'}</div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Cost per deployed use case — the Build→FinOps loop (real LLM token spend) ───
function UseCaseSpendCard() {
  const { loading, data } = useAwsUseCaseSpend(30);
  const usd = (n: number) => `$${n < 100 ? n.toFixed(2) : Math.round(n).toLocaleString()}`;
  const compact = (n: number) => n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : `${n}`;
  const rows = (data?.by_use_case ?? []).slice(0, 8);
  const hasSpend = rows.length > 0;

  return (
    <div className="mb-6 rounded-xl border border-slate-200/60 shadow-sm bg-white/80 backdrop-blur-sm p-5">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-2.5">
          <h3 className="text-sm font-semibold text-slate-900">Cost per Deployed Use Case</h3>
          {data?.live && <LiveDataBadge />}
          <span className="text-[11px] text-slate-400">Build→FinOps · real LLM token spend, trailing {data?.window_days ?? 30}d</span>
        </div>
        {hasSpend && <span className="text-[11px] font-semibold text-slate-700 tabular-nums">{usd(data!.total_cost_usd)} total</span>}
      </div>
      {loading ? (
        <div className="h-24 flex items-center justify-center text-xs text-slate-400">Loading…</div>
      ) : hasSpend ? (
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-slate-400 text-[10px] uppercase tracking-wide text-left">
                <th scope="col" className="font-medium pb-2">Use case</th>
                <th scope="col" className="font-medium pb-2 text-right">Spend</th>
                <th scope="col" className="font-medium pb-2 text-right">Requests</th>
                <th scope="col" className="font-medium pb-2 text-right">Tokens (in/out)</th>
                <th scope="col" className="font-medium pb-2 text-right">Top model</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.use_case_id} className={i > 0 ? 'border-t border-slate-100' : ''}>
                  <td className="py-2 pr-2 font-medium">
                    <Link
                      to={`/govern/agents?agent=${encodeURIComponent(r.use_case_id)}`}
                      className="text-blue-600 hover:text-blue-700 hover:underline"
                      title="Open this deployed agent in the Agent Registry"
                    >
                      {r.use_case_id}
                    </Link>
                  </td>
                  <td className="py-2 text-right tabular-nums font-semibold text-slate-900">{usd(r.total_cost_usd)}</td>
                  <td className="py-2 text-right tabular-nums text-slate-500">{r.request_count.toLocaleString()}</td>
                  <td className="py-2 text-right tabular-nums text-slate-500">{compact(r.input_tokens)}/{compact(r.output_tokens)}</td>
                  <td className="py-2 text-right text-slate-500">{r.top_model ? shortModel(r.top_model) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="flex items-start gap-2 text-[12px] text-slate-500 bg-slate-50 rounded-lg px-4 py-3">
          <span className="text-amber-500 mt-0.5">●</span>
          <div>
            <div className="font-medium text-slate-600">No per-use-case spend yet</div>
            <div className="text-[11px] mt-0.5">{data?.note ?? 'Deployed agents route LLM calls through the platform gateway; their metered token spend lands here, attributed to the use case that spent it.'}</div>
            <Link to="/govern/agents" className="inline-block mt-1.5 text-[11px] text-blue-600 hover:text-blue-700 font-medium">
              View deployed agents in the Agent Registry →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── 12-Month Forecast — live from Cost Explorer ───
function LiveForecastCard() {
  const { loading, data, live } = useAwsForecast(12);
  const usd = (n: number) => `$${Math.round(n).toLocaleString()}`;

  const forecastData = (data?.months ?? []).map(m => ({
    month: new Date(m.month + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
    amount: Math.round(m.amount),
  }));

  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 shadow-sm mb-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-900">12-Month Forecast</span>
          {live && <LiveDataBadge />}
          <span className="text-[10px] text-slate-400">from Cost Explorer GetCostForecast</span>
        </div>
        {live && data && (
          <div className="text-right">
            <div className="text-lg font-bold text-slate-900 tabular-nums">{usd(data.forecast_total)}</div>
            <div className="text-[10px] text-slate-400">projected 12-month total</div>
          </div>
        )}
      </div>
      {loading ? (
        <div className="h-[220px] flex items-center justify-center text-xs text-slate-400">Loading forecast...</div>
      ) : !live ? (
        <div className="flex items-start gap-2 text-[12px] text-slate-500 bg-slate-50 rounded-lg px-4 py-3">
          <span className="text-amber-500 mt-0.5">●</span>
          <div>
            <div className="font-medium text-slate-600">Forecast unavailable</div>
            <div className="text-[11px] mt-0.5">{data?.note ?? 'Cost Explorer forecast needs sufficient historical data and ce:GetCostForecast permission.'}</div>
          </div>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={forecastData} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
            <defs>
              <linearGradient id="forecastGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#6366f1" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="month" tick={{ fill: '#94a3b8', fontSize: 10 }} />
            <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} width={60} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
            <Tooltip contentStyle={tooltipStyle} formatter={(v) => usd(Number(v))} />
            <Area type="monotone" dataKey="amount" stroke="#6366f1" strokeWidth={2} fill="url(#forecastGrad)" name="Forecast" />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

// ─── Cross-provider cost connectors — honest connected-vs-not scaffold ───
// Grounds the "illustrative" cross-provider zone: AWS is live via Cost Explorer;
// Azure/Vertex report what connector each would need, rather than faking spend.
function ProviderConnectorsCard() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<AwsProviderConnectorsResponse | null>(null);
  useEffect(() => {
    let cancelled = false;
    governCostApi.providerConnectors()
      .then(d => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setData(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);
  const connectors = data?.connectors ?? [];

  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 shadow-sm mb-4">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-2.5">
          <h3 className="text-sm font-semibold text-slate-900">Provider Cost Connectors</h3>
          {data && <span className="text-[11px] font-medium text-slate-600 tabular-nums">{data.connected_count}/{data.total_count} connected</span>}
          <span className="text-[11px] text-slate-400">what feeds real spend into this zone</span>
        </div>
        <Link to="/govern/multi-cloud" className="text-[11px] font-medium text-blue-600 hover:text-blue-700 flex items-center gap-1">
          Multi-Cloud <span className="text-[10px]">→</span>
        </Link>
      </div>
      {loading ? (
        <div className="h-20 flex items-center justify-center text-xs text-slate-400">Loading…</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {connectors.map(c => (
            <div
              key={c.provider}
              className={`rounded-lg border p-3 ${c.connected ? 'border-emerald-200 bg-emerald-50/40' : 'border-slate-200 bg-slate-50/60'}`}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className={`relative flex h-2 w-2`}>
                  {c.connected && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />}
                  <span className={`relative inline-flex rounded-full h-2 w-2 ${c.connected ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                </span>
                <span className="text-xs font-semibold text-slate-800">{c.label}</span>
                <span className={`ml-auto text-[9px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wide ${c.connected ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'}`}>
                  {c.connected ? 'Live' : 'Not connected'}
                </span>
              </div>
              <div className="text-[11px] text-slate-500 leading-relaxed">{c.detail}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Cost by Resource — per-RESOURCE Bedrock spend (Cost Explorer resource-level granularity) ───
// Consumes GET /govern/cost/by-resource (governCostApi.byResource). This is the
// finest-grain FinOps attribution: which specific Bedrock resource (inference
// profile, guardrail, etc.) is actually driving spend, feeding per-agent chargeback.
// Honesty gate: the Live badge is bound to the payload's real .live, and when
// resource-level cost is not enabled in Cost Explorer we honest-degrade to the
// payload's own note instead of rendering a green Live pill over empty data.
function ResourceCostCard() {
  const [data, setData] = useState<AwsResourceCostResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    governCostApi.byResource(14)
      .then(d => { if (!cancelled) { setData(d); setLoading(false); } })
      .catch(() => { if (!cancelled) { setData(null); setLoading(false); } });
    return () => { cancelled = true; };
  }, []);

  const usd = (n: number) => `$${n < 100 ? n.toFixed(2) : Math.round(n).toLocaleString()}`;
  const live = data?.live ?? false;
  const total = data?.total ?? 0;
  const rows = [...(data?.by_resource ?? [])].sort((a, b) => b.amount - a.amount);

  // Derive a friendly name + resource type + region from the resource ARN, e.g.
  // arn:aws:bedrock:us-east-1:<acct>:inference-profile/us.anthropic.claude-opus-4-8
  // → { resourceType: 'inference-profile', region: 'us-east-1', name: 'us.anthropic.claude-opus-4-8' }.
  const meta = (r: AwsResourceCost) => {
    const arn = r.resource_arn && r.resource_arn !== 'NoResourceId' ? r.resource_arn : '';
    const m = /^arn:aws:([^:]+):([^:]*):[^:]*:([^/]+)\/(.+)$/.exec(arn);
    const resourceType = m?.[3] ?? null;
    const region = m?.[2] || null;
    const name = m?.[4]
      || (r.resource_id && r.resource_id !== 'NoResourceId' ? r.resource_id : 'Unattributed');
    return { resourceType, region, name };
  };

  return (
    <div className="rounded-xl border border-slate-200/60 shadow-sm bg-white/80 backdrop-blur-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Icon name="server-stack" className="w-4 h-4 text-slate-400" />
          <h3 className="text-sm font-semibold text-slate-900">Cost by Resource</h3>
          <LiveDataBadge live={live} source="Cost Explorer (resource-level)" detail="Per-resource Bedrock spend from Cost Explorer resource-level granularity" />
          {data?.source && <span className="text-[10px] px-2 py-0.5 rounded bg-slate-100 text-slate-500">{data.source}</span>}
        </div>
        {data?.window_days != null && (
          <span className="text-[10px] text-slate-400">trailing {data.window_days} days</span>
        )}
      </div>

      {loading ? (
        <div className="h-40 flex items-center justify-center text-sm text-slate-400">Loading resource costs...</div>
      ) : !live ? (
        <div className="flex items-start gap-2 text-[12px] text-slate-500 bg-slate-50 rounded-lg px-4 py-3">
          <span className="text-amber-500 mt-0.5">●</span>
          <div>
            <div className="font-medium text-slate-600">Resource-level cost not available</div>
            <div className="text-[11px] mt-0.5">{data?.note ?? 'Enable resource-level granularity in AWS Cost Explorer to attribute Bedrock spend per resource.'}</div>
          </div>
        </div>
      ) : rows.length === 0 ? (
        <div className="flex items-start gap-2 text-[12px] text-slate-500 bg-slate-50 rounded-lg px-4 py-3">
          <span className="text-amber-500 mt-0.5">●</span>
          <div>
            <div className="font-medium text-slate-600">No resource-level cost in this window</div>
            <div className="text-[11px] mt-0.5">{data?.note ?? 'No Bedrock resource incurred cost in the trailing window.'}</div>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-4 mb-3 text-[11px] text-slate-500">
            <span>Total <span className="font-semibold text-slate-900 tabular-nums">{usd(total)}</span></span>
            <span className="text-slate-300">|</span>
            <span><span className="font-semibold text-slate-700 tabular-nums">{data?.resource_count ?? rows.length}</span> resources</span>
            {data?.period_start && data?.period_end && (
              <>
                <span className="text-slate-300">|</span>
                <span>{data.period_start} to {data.period_end}</span>
              </>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-slate-400 text-[10px] uppercase tracking-wide text-left border-b border-slate-100">
                  <th className="font-medium pb-2 pr-4">Resource</th>
                  <th className="font-medium pb-2">Type</th>
                  <th className="font-medium pb-2 text-right">Cost</th>
                  <th className="font-medium pb-2 text-right pl-4">Share</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const { resourceType, region, name } = meta(r);
                  const pct = total > 0 ? (r.amount / total) * 100 : 0;
                  return (
                    <tr key={`${r.resource_arn ?? r.resource_id}-${i}`} className={i > 0 ? 'border-t border-slate-50' : ''}>
                      <td className="py-2 pr-4">
                        <div className="font-medium text-slate-900 truncate max-w-xs" title={r.resource_arn ?? r.resource_id}>{name}</div>
                        {region && <div className="text-[10px] text-slate-400">{region}</div>}
                      </td>
                      <td className="py-2">
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">{resourceType ?? r.service ?? 'unknown'}</span>
                      </td>
                      <td className="py-2 text-right tabular-nums font-semibold text-slate-900">{usd(r.amount)}</td>
                      <td className="py-2 pl-4">
                        <div className="flex items-center gap-2 justify-end">
                          <div className="w-24 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                            <div className="h-full rounded-full bg-indigo-400" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-[10px] text-slate-500 tabular-nums w-10 text-right">{pct.toFixed(1)}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-200 bg-slate-50/50">
                  <td className="py-2 pr-4 font-semibold text-slate-700">Total ({rows.length} resources)</td>
                  <td />
                  <td className="py-2 text-right tabular-nums font-bold text-slate-900">{usd(total)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
          {data?.note && (
            <div className="text-[10px] text-slate-400 mt-3 truncate" title={data.note}>{data.note}</div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Agent Costs Tab — per-agent cost attribution from CloudWatch + Cost Explorer ───
function AgentCostsTab() {
  const { loading, data, live } = useAgentCoreCosts(30);
  const { loading: forecastLoading, data: forecastData, live: forecastLive } = useAgentForecast(30, 3);
  const usd = (n: number) => `$${n < 1 ? n.toFixed(4) : n < 100 ? n.toFixed(2) : Math.round(n).toLocaleString()}`;
  const agents = data?.by_agent ?? [];
  const totalAgents = agents.length;
  const totalInvocations = agents.reduce((sum, a) => sum + (a.invocations ?? 0), 0);
  const forecasts = forecastData?.by_agent ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 mb-4">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
        <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Per-Agent Cost Attribution & Forecast</span>
        {live && <LiveDataBadge />}
        <span className="text-[10px] text-slate-400">from CloudWatch AgentCore metrics + Cost Explorer + cost allocation tags</span>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <StatCard label="Total Bedrock Spend" value={usd(data?.total_bedrock ?? 0)} variant="info" sub={`${data?.period_start} to ${data?.period_end}`} />
        <StatCard label="Total Agents" value={totalAgents.toString()} variant="default" sub="with invocations" />
        <StatCard label="Total Invocations" value={totalInvocations.toLocaleString()} variant="default" sub="trailing 30 days" />
        <StatCard label="Avg Cost/Invocation" value={totalInvocations > 0 ? usd((data?.total ?? 0) / totalInvocations) : '$0'} variant="default" sub="across all agents" />
        <StatCard label="3-Month Forecast" value={usd(forecastData?.total_forecast_cost ?? 0)} variant="warning" sub="predicted spend" />
      </div>

      {/* Agent costs table */}
      <div className="rounded-xl border border-slate-200/60 shadow-sm bg-white/80 backdrop-blur-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-900">Cost by Agent</h3>
            {data?.source && <span className="text-[10px] px-2 py-0.5 rounded bg-slate-100 text-slate-500">{data.source}</span>}
          </div>
          {data?.note && <span className="text-[10px] text-slate-400 max-w-md truncate" title={data.note}>{data.note}</span>}
        </div>

        {loading ? (
          <div className="h-40 flex items-center justify-center text-sm text-slate-400">Loading agent costs...</div>
        ) : agents.length === 0 ? (
          <div className="flex items-start gap-2 text-[12px] text-slate-500 bg-slate-50 rounded-lg px-4 py-3">
            <span className="text-amber-500 mt-0.5">●</span>
            <div>
              <div className="font-medium text-slate-600">No agent cost data available</div>
              <div className="text-[11px] mt-0.5">{data?.note ?? 'Deploy agents through AgentCore to see per-agent cost attribution here.'}</div>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-slate-400 text-[10px] uppercase tracking-wide text-left border-b border-slate-100">
                  <th className="font-medium pb-2 pr-4">Agent</th>
                  <th className="font-medium pb-2 text-right">Invocations</th>
                  <th className="font-medium pb-2 text-right">Bedrock Cost</th>
                  <th className="font-medium pb-2 text-right">Compute Cost</th>
                  <th className="font-medium pb-2 text-right">Total Cost</th>
                  <th className="font-medium pb-2 text-right">$/Invocation</th>
                  <th className="font-medium pb-2 text-center">Attribution</th>
                </tr>
              </thead>
              <tbody>
                {agents.map((agent, i) => (
                  <tr key={agent.agent_id} className={i > 0 ? 'border-t border-slate-50' : ''}>
                    <td className="py-2 pr-4">
                      <div className="font-medium text-slate-900">{agent.agent_name || agent.agent_id}</div>
                      {agent.agent_name && agent.agent_id !== agent.agent_name && (
                        <div className="text-[10px] text-slate-400">{agent.agent_id}</div>
                      )}
                    </td>
                    <td className="py-2 text-right tabular-nums text-slate-600">{(agent.invocations ?? 0).toLocaleString()}</td>
                    <td className="py-2 text-right tabular-nums font-medium text-blue-600">{usd(agent.bedrock_cost ?? 0)}</td>
                    <td className="py-2 text-right tabular-nums text-slate-500">{usd(agent.compute_cost ?? 0)}</td>
                    <td className="py-2 text-right tabular-nums font-semibold text-slate-900">{usd(agent.total_cost ?? 0)}</td>
                    <td className="py-2 text-right tabular-nums text-slate-500">{usd(agent.cost_per_invocation ?? 0)}</td>
                    <td className="py-2 text-center">
                      {agent.cost_allocation_tag ? (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 font-medium">
                          {agent.cost_allocation_tag}
                        </span>
                      ) : (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">
                          proportional
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-200 bg-slate-50/50">
                  <td className="py-2 pr-4 font-semibold text-slate-700">Total ({agents.length} agents)</td>
                  <td className="py-2 text-right tabular-nums font-medium text-slate-700">{totalInvocations.toLocaleString()}</td>
                  <td className="py-2 text-right tabular-nums font-semibold text-blue-700">{usd(data?.total_bedrock ?? 0)}</td>
                  <td className="py-2 text-right tabular-nums text-slate-600">{usd(data?.total_compute ?? 0)}</td>
                  <td className="py-2 text-right tabular-nums font-bold text-slate-900">{usd(data?.total ?? 0)}</td>
                  <td className="py-2 text-right tabular-nums text-slate-500">{totalInvocations > 0 ? usd((data?.total ?? 0) / totalInvocations) : '-'}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Cost by Resource — per-RESOURCE Bedrock spend for the finest-grain attribution */}
      <ResourceCostCard />

      {/* Agent Cost Forecast */}
      <div className="rounded-xl border border-slate-200/60 shadow-sm bg-white/80 backdrop-blur-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-900">Per-Agent Cost Forecast (3 months)</h3>
            {forecastLive && <LiveDataBadge />}
            {forecastData?.source && <span className="text-[10px] px-2 py-0.5 rounded bg-slate-100 text-slate-500">{forecastData.source}</span>}
          </div>
          {forecastData?.note && <span className="text-[10px] text-slate-400 max-w-md truncate" title={forecastData.note}>{forecastData.note}</span>}
        </div>

        {forecastLoading ? (
          <div className="h-40 flex items-center justify-center text-sm text-slate-400">Loading forecast...</div>
        ) : forecasts.length === 0 ? (
          <div className="flex items-start gap-2 text-[12px] text-slate-500 bg-slate-50 rounded-lg px-4 py-3">
            <span className="text-amber-500 mt-0.5">●</span>
            <div>
              <div className="font-medium text-slate-600">No forecast data available</div>
              <div className="text-[11px] mt-0.5">Need at least 7 days of historical invocation data to generate forecasts.</div>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-slate-400 text-[10px] uppercase tracking-wide text-left border-b border-slate-100">
                  <th className="font-medium pb-2 pr-4">Agent</th>
                  <th className="font-medium pb-2 text-right">Historical (30d)</th>
                  <th className="font-medium pb-2 text-center">Trend</th>
                  {forecasts[0]?.forecast?.map((f, i) => (
                    <th key={i} className="font-medium pb-2 text-right">{new Date(f.month + 'T00:00:00').toLocaleDateString('en-US', { month: 'short' })}</th>
                  ))}
                  <th className="font-medium pb-2 text-right">3-Mo Total</th>
                </tr>
              </thead>
              <tbody>
                {forecasts.slice(0, 10).map((agent, i) => (
                  <tr key={agent.agent_id} className={i > 0 ? 'border-t border-slate-50' : ''}>
                    <td className="py-2 pr-4">
                      <div className="font-medium text-slate-900">{agent.agent_name || agent.agent_id}</div>
                    </td>
                    <td className="py-2 text-right tabular-nums text-slate-600">{usd(agent.historical_cost)}</td>
                    <td className="py-2 text-center">
                      <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${
                        agent.trend === 'growing' ? 'bg-rose-50 text-rose-700' :
                        agent.trend === 'declining' ? 'bg-emerald-50 text-emerald-700' :
                        'bg-slate-100 text-slate-500'
                      }`}>
                        {agent.trend === 'growing' ? `+${agent.trend_pct.toFixed(0)}%` :
                         agent.trend === 'declining' ? `${agent.trend_pct.toFixed(0)}%` :
                         'stable'}
                      </span>
                    </td>
                    {agent.forecast.map((f, fi) => (
                      <td key={fi} className="py-2 text-right tabular-nums text-slate-600">
                        <div>{usd(f.predicted_cost)}</div>
                        <div className="text-[9px] text-slate-400">{f.predicted_invocations.toLocaleString()} inv</div>
                      </td>
                    ))}
                    <td className="py-2 text-right tabular-nums font-semibold text-slate-900">{usd(agent.forecast_total_cost)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-200 bg-slate-50/50">
                  <td className="py-2 pr-4 font-semibold text-slate-700">Total ({forecasts.length} agents)</td>
                  <td className="py-2 text-right tabular-nums font-medium text-slate-700">{usd(forecastData?.total_historical_cost ?? 0)}</td>
                  <td />
                  {forecasts[0]?.forecast?.map((_, fi) => {
                    const monthTotal = forecasts.reduce((sum, a) => sum + (a.forecast[fi]?.predicted_cost ?? 0), 0);
                    return <td key={fi} className="py-2 text-right tabular-nums font-medium text-slate-700">{usd(monthTotal)}</td>;
                  })}
                  <td className="py-2 text-right tabular-nums font-bold text-slate-900">{usd(forecastData?.total_forecast_cost ?? 0)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Cost allocation tag info */}
      <div className="rounded-lg border border-blue-100 bg-blue-50/50 p-4">
        <div className="flex items-start gap-3">
          <div className="w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 mt-0.5">
            <span className="text-blue-600 text-[10px] font-bold">i</span>
          </div>
          <div className="text-[11px] text-blue-700 space-y-1">
            <p className="font-medium">Cost Allocation Tags Active</p>
            <p className="text-blue-600">
              <code className="bg-blue-100 px-1 rounded">agentcore:project-name</code>, <code className="bg-blue-100 px-1 rounded">agentcore:created-by</code>, and <code className="bg-blue-100 px-1 rounded">agentcore:target-name</code> are now activated for cost allocation.
              The <code className="bg-blue-100 px-1 rounded">finopsmanaged=true</code> tag has been applied to all AgentCore runtimes.
            </p>
            <p className="text-blue-500">
              Tagged costs appear in Cost Explorer within 24 hours. Until then, costs are attributed proportionally by invocation count.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function FinOps() {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  // The AWS-spend window, page-level. Defaults to 6 months, which is what every panel
  // was previously hardcoded to, so nothing shifts on first load.
  const [windowId, setWindowId] = useState<SpendWindowId>(DEFAULT_SPEND_WINDOW);
  const spendWindow = spendWindowById(windowId);
  const { expectedCost, useCases, refresh } = useGovernanceAggregator();
  const [showCostEditor, setShowCostEditor] = useState(false);
  // Single source of truth for AWS Cost Explorer liveness. Drives both the
  // dashboard summary card and the honesty of the "Live · from your AWS account"
  // hero header below — so the hero never claims live when Cost Explorer is not.
  const dashboardSummary = useDashboardSummary();
  const awsCostLive = dashboardSummary.live;

  return (
    <div className="min-h-[calc(100vh-4rem)] relative">
      <div className="relative max-w-7xl mx-auto px-6 py-10">
        <Link to="/govern" className="text-sm text-slate-400 hover:text-slate-600 transition-colors font-medium">
          ← Govern
        </Link>

        <div className="flex items-end justify-between mt-3 mb-6">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-semibold text-slate-900 tracking-tight">Cost & FinOps</h1>
              <CoreBadge pillar="see" />
              <MockDataBadge integration="AWS Spend is live (Cost Explorer); budgets, chargeback & forecast still illustrative" />
            </div>
            <p className="text-slate-500 mt-1 max-w-2xl">
              AI cost, governed — spend posture, forecast, unit economics, chargeback, and budgets for the CFO and platform FinOps lead.
            </p>
          </div>
        </div>

        <UnifiedGuide {...FINOPS_GUIDE} />

        {/* Tab navigation */}
        <div className="flex gap-1 p-1 bg-slate-100/80 rounded-xl mb-6 w-fit" role="tablist" aria-label="FinOps sections">
          {TABS.map(tab => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === tab.id
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Dashboard Tab Content */}
        {activeTab === 'dashboard' && (
        <>
        {/* Dashboard Summary Card — loads first, fast overview */}
        <DashboardSummaryCard {...dashboardSummary} />


        {/* ── Live · sourced from your AWS account (Cost Explorer) — grouped as the hero.
             Only styled/labelled as live when Cost Explorer actually returned live data;
             otherwise neutral, since the child cards fall back to demo data. ── */}
        <div className={`mb-8 rounded-2xl border p-4 shadow-sm ${awsCostLive ? 'border-emerald-200/70 bg-gradient-to-br from-emerald-50/50 via-white to-white' : 'border-slate-200/60 bg-white/80 backdrop-blur-sm'}`}>
          <LiveHeader
            live={awsCostLive}
            label={awsCostLive ? 'Live · from your AWS account' : 'AWS account not connected'}
            caption={awsCostLive
              ? 'Cost Explorer — spend, trend, forecast & anomalies'
              : 'Connect an AWS account with Cost Explorer to see live spend, trend, forecast & anomalies — sections below fall back to demo data'}
          />
          {/* The period control is rendered by AwsSpendSection as its footer, not here.
              As its own card above the graphic it still read as a page-wide filter. */}
          <AwsSpendSection w={spendWindow} windowId={windowId} onWindowChange={setWindowId} />
          <AwsSpendDetail w={spendWindow} />
          <EnhancedCostBreakdown w={spendWindow} />

          {/* Enhanced Token Economics */}
          <EnhancedTokenEconomicsCard w={spendWindow} />

          <UseCaseSpendCard />
          <CostByTagCard />
          <BudgetsCard />

          {/* Service Quotas */}
          <ServiceQuotasCard />

          {/* Rightsizing Recommendations */}
          <RightsizingCard />
        </div>

        {/* Cost Change Drivers — a month-over-month drill-down, so it reads AFTER the
            current spend it explains. It previously sat second on the page, above the
            live Cost Explorer hero, which put an explanation before the thing being
            explained. Its own window is fixed (month vs previous month) and independent
            of the selector above, which is why it is not inside that group. */}
        <CostComparisonSection />

        {/* Shared metric contract: FinOps operational-cost contribution to the scorecard */}
        <FinopsMetricsPanel />
        </>
        )}

        {/* Planning Tab — forward-looking estimates, posture, ROI & business modeling */}
        {activeTab === 'planning' && (
        <>
        <div className="flex items-center gap-2 mb-4">
          <span className="w-1.5 h-1.5 rounded-full bg-violet-400" />
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Planning &amp; modeling</span>
          <span className="text-[10px] text-slate-400">forward-looking estimates &amp; posture — expected cost is computed from real Plan use cases; the rest are planning models</span>
        </div>

        {/* Expected use-case cost — COMPUTED from real Plan use cases (forward estimate) */}
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-4 shadow-sm mb-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-slate-900">Expected Use-Case Cost</h3>
              <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 uppercase tracking-wide">Computed</span>
            </div>
            <button
              onClick={() => setShowCostEditor(v => !v)}
              className="text-[11px] font-medium text-blue-600 hover:text-blue-700"
            >
              {showCostEditor ? 'Done' : 'Configure cost models'}
            </button>
          </div>
          <p className="text-[11px] text-slate-500 mb-3">
            {expectedCost.useCasesWithEstimate > 0
              ? `Forward-looking Bedrock token spend from ${expectedCost.useCasesWithEstimate} priced use case${expectedCost.useCasesWithEstimate === 1 ? '' : 's'} (real Plan use cases × cost model).`
              : 'Attach a model and expected volume to your use cases to estimate token spend.'}
          </p>
          {expectedCost.useCasesWithEstimate > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-1">
              <StatCard label="Expected / month" value={`$${Math.round(expectedCost.totalMonthly).toLocaleString()}`} variant="success" />
              <StatCard label="Expected / year" value={`$${Math.round(expectedCost.totalAnnual).toLocaleString()}`} />
              {expectedCost.byModel.slice(0, 2).map(m => (
                <StatCard key={m.modelId} label={m.modelName} value={`$${Math.round(m.monthly).toLocaleString()}/mo`} sub={`${m.useCases} use case${m.useCases === 1 ? '' : 's'}`} />
              ))}
            </div>
          )}
          {showCostEditor && (
            <div className="mt-3 pt-3 border-t border-slate-100">
              <UseCaseCostEditor useCases={useCases} onChange={refresh} />
            </div>
          )}
        </div>

        {/* Posture snapshot + KPIs (illustrative) */}
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Posture snapshot &amp; KPIs</span>
          <MockDataBadge integration="Planning projections" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-4 mb-4">
          <StatCard
            label="FinOps Health"
            value={COST_HEALTH.score}
            variant={COST_HEALTH.score >= 70 ? 'success' : COST_HEALTH.score >= 50 ? 'warning' : 'danger'}
            trend={{
              value: COST_HEALTH.trend === 'improving' ? 'Improving' : 'Declining',
              direction: COST_HEALTH.trend === 'improving' ? 'up' : 'down',
              isPositive: COST_HEALTH.trend === 'improving',
            }}
            sub={`$${COST_HEALTH.savingsRealized.toLocaleString()} / $${COST_HEALTH.savingsTarget.toLocaleString()} savings`}
            size="lg"
            className="text-center"
          />
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {COST_KPIS.map(k => (
              <StatCard key={k.label} label={k.label} value={k.value} sub={k.sub} variant={colorToVariant[k.color] || 'default'} />
            ))}
          </div>
        </div>

        {/* 12-Month Forecast — live from Cost Explorer */}
        <LiveForecastCard />

        {/* Budget vs Actual — Plan business cases vs AWS Cost Explorer spend */}
        <div className="mt-4">
          <BudgetVariance />
        </div>

        {/* Deeper planning views (ROI, Task Fit, Business Value) have their own tabs. */}
        </>
        )}

        {/* ROI tab */}
        {activeTab === 'roi' && <AgentROI />}

        {/* Task Fit tab */}
        {activeTab === 'task-assessment' && <TaskAssessment />}

        {/* Business Value tab */}
        {activeTab === 'business-metrics' && <BusinessMetrics />}

        {/* Unit Economics Tab */}
        {activeTab === 'unit-economics' && <UnitEconomics />}

        {/* Token Economics Tab */}
        {activeTab === 'token-economics' && <TokenEconomics />}

        {/* Chargeback Tab */}
        {activeTab === 'chargeback' && <Chargeback />}

        {/* Optimization Tab */}
        {activeTab === 'optimization' && <Optimization />}

        {/* Cost Anomalies Tab */}
        {activeTab === 'anomalies' && <CostAnomalies />}

        {/* Capacity Management Tab */}
        {activeTab === 'capacity' && <CapacityManagement />}

        {/* Agent Costs Tab — per-agent cost attribution from CloudWatch + Cost Explorer */}
        {activeTab === 'agent-costs' && <AgentCostsTab />}

        {/* Multi-Cloud Tab — cross-provider spend (Azure, GCP, SaaS) - illustrative until connectors added */}
        {activeTab === 'multi-cloud' && (
        <>
        <div className="flex items-center gap-2 mb-4">
          <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Multi-Cloud &amp; SaaS Spend</span>
          <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 uppercase tracking-wide">Illustrative</span>
        </div>

        <div className="bg-gradient-to-r from-amber-50/50 to-orange-50/30 border border-amber-200/60 rounded-xl p-4 mb-6">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0">
              <Icon name="cloud-arrow-up" className="w-4 h-4 text-amber-600" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-slate-900 mb-1">Multi-Cloud Cost Connectors Required</h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                This tab shows illustrative multi-provider spend. To see real costs from Azure OpenAI, Google Vertex AI,
                or SaaS providers (OpenAI, Anthropic, Cohere), configure cost connectors in the Multi-Cloud module.
                AWS Bedrock costs are live on the Dashboard tab.
              </p>
            </div>
          </div>
        </div>

        {/* Connector status */}
        <ProviderConnectorsCard />

        {/* Provider Cost Comparison — live multi-cloud connectors when configured */}
        <MultiCloudProviderCostsCard />

        {/* SaaS Provider Breakdown */}
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 shadow-sm mb-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="text-sm font-semibold text-slate-900">SaaS Provider Spend</div>
              <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 uppercase tracking-wide">Illustrative</span>
            </div>
          </div>
          <p className="text-[11px] text-slate-400 mb-3">
            Direct API spend with SaaS LLM providers. Connect billing accounts to see real costs.
          </p>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { name: 'OpenAI', cost: 2840, color: '#10a37f', models: 'GPT-4o, GPT-4 Turbo' },
              { name: 'Anthropic', cost: 1560, color: '#d97706', models: 'Claude 3.5 Sonnet' },
              { name: 'Cohere', cost: 420, color: '#6366f1', models: 'Command R+' },
              { name: 'Mistral', cost: 280, color: '#ec4899', models: 'Mistral Large' },
            ].map(p => (
              <div key={p.name} className="bg-slate-50/50 rounded-lg p-3 border border-slate-100">
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
                  <span className="text-xs font-semibold text-slate-900">{p.name}</span>
                </div>
                <div className="text-lg font-bold text-slate-900 tabular-nums">${p.cost.toLocaleString()}</div>
                <div className="text-[10px] text-slate-400 mt-1">{p.models}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Cross-provider model mix */}
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 shadow-sm mb-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="text-sm font-semibold text-slate-900">Cross-Provider Model Mix</div>
              <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 uppercase tracking-wide">Illustrative</span>
            </div>
          </div>
          <p className="text-[11px] text-slate-400 mb-3 leading-relaxed">
            Spend across every model provider. Only the AWS/Bedrock slice is live today (see Dashboard tab) — Azure OpenAI, Vertex AI &amp; SaaS costs need connectors.
          </p>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Cost by Model — pie + legend */}
            <div>
              <div className="text-xs font-medium text-slate-600 mb-2">Cost by Model</div>
              <div className="flex items-center gap-4">
                <ResponsiveContainer width="55%" height={180}>
                  <PieChart>
                    <Pie data={CROSS_PROVIDER_MODELS} dataKey="cost" nameKey="model" cx="50%" cy="50%" outerRadius={70} innerRadius={42} paddingAngle={2}>
                      {CROSS_PROVIDER_MODELS.map((m, i) => <Cell key={i} fill={m.color} />)}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} formatter={(v, _n, o) => [`$${Number(v).toLocaleString()}`, o.payload.provider]} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex-1 space-y-1.5">
                  {CROSS_PROVIDER_MODELS.map(m => (
                    <div key={m.model} className="flex items-center gap-1.5 text-[11px]">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: m.color }} />
                      <span className="text-slate-700 truncate flex-1">{m.model}</span>
                      <span className="text-slate-900 font-medium tabular-nums">${m.cost.toLocaleString()}</span>
                    </div>
                  ))}
                  <div className="border-t border-slate-100 pt-1.5 mt-1.5 flex items-center justify-between text-[11px]">
                    <span className="text-slate-600 font-medium">Total</span>
                    <span className="text-slate-900 font-semibold tabular-nums">${CROSS_PROVIDER_MODELS.reduce((s, m) => s + m.cost, 0).toLocaleString()}/mo</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Rolled up by provider — ranked bars */}
            <div>
              <div className="text-xs font-medium text-slate-600 mb-2">By Provider</div>
              <RankedBars
                nameWidth={110}
                rows={Object.values(
                  CROSS_PROVIDER_MODELS.reduce((acc, m) => {
                    (acc[m.provider] ??= { label: m.provider, value: 0, color: m.color }).value += m.cost;
                    return acc;
                  }, {} as Record<string, { label: string; value: number; color: string }>)
                ).sort((a, b) => b.value - a.value)}
              />
            </div>
          </div>
        </div>

        {/* Cost per Agent by Provider */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
          <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 shadow-sm">
            <div className="text-sm font-semibold text-slate-900 mb-3">Top Agents by Cost (All Providers)</div>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={topAgentsByProvider} layout="vertical" margin={{ left: 10 }}>
                <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 10 }} unit="$" />
                <YAxis type="category" dataKey="name" tick={{ fill: '#475569', fontSize: 9 }} width={140} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(v, _name, props) => [`$${Number(v).toFixed(2)}/mo`, props.payload.providerLabel]}
                />
                <Bar dataKey="cost" radius={[0, 6, 6, 0]}>
                  {topAgentsByProvider.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 shadow-sm">
            <div className="text-sm font-semibold text-slate-900 mb-3">Cost by Category</div>
            <RankedBars
              nameWidth={120}
              rows={categoryCostData.map(cat => ({
                label: cat.category,
                value: cat.monthlyCost,
                color: cat.color,
                sub: `${cat.agentCount} agents`,
              }))}
            />
            <div className="mt-4 pt-3 border-t border-slate-100">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-600 font-medium">Multi-provider governance coverage</span>
                <span className="flex items-center gap-1.5 text-slate-500 font-semibold">
                  {ALL_AGENTS.length} demo agents
                  <MockDataBadge integration="Illustrative fleet from the demo agent registry, not live connector data" />
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Top cost drivers */}
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 shadow-sm">
          <div className="text-sm font-semibold text-slate-900 mb-3">Top Cost Drivers — Agents <span className="text-[10px] font-normal text-slate-400">· all providers</span></div>
          <RankedBars
            nameWidth={150}
            rows={AGENT_COSTS.slice().sort((a, b) => b.monthlyCost - a.monthlyCost).slice(0, 8).map((a, i) => ({
              label: a.agent,
              value: a.monthlyCost,
              color: SPEND_COLORS[i % SPEND_COLORS.length],
            }))}
          />
        </div>
        </>
        )}

        {/* Data Source Info Panel */}
        <DataSourceInfo
          pageId={activeTab === 'capacity' ? 'capacity' : 'finops'}
          pageTitle={activeTab === 'capacity' ? 'Capacity Management' : 'Cost & FinOps'}
          sources={getPageDataSources(activeTab === 'capacity' ? 'capacity' : 'finops')}
        />

      </div>
    </div>
  );
}
