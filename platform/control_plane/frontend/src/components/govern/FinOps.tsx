import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import {
  COST_HEALTH, COST_KPIS,
  AGENT_COSTS,
  FORECAST_12M,
  tooltipStyle,
  ALL_AGENTS, AGENT_PROVIDER_CONFIG,
  type AgentProvider,
} from './mockData';
import LiveHeader from './LiveHeader';
import { MockDataBadge, LiveDataBadge } from './DataSourceIndicator';
import UnifiedGuide, { FINOPS_GUIDE } from './UnifiedGuide';
import StatCard, { type StatCardVariant } from './StatCard';
import { useGovernanceAggregator } from './useGovernanceAggregator';
import { useAwsCost, useAwsCostDetail, useAwsUseCaseSpend } from './useAwsCost';
import { governCostApi, type AwsCostTagBreakdown, type AwsTagKeyOption, type AwsBudgetsResponse, type AwsProviderConnectorsResponse } from '../../api/client';
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
import FinopsMetricsPanel from './metrics/FinopsMetricsPanel';
import CoreBadge from './CoreBadge';

// Map KPI color to StatCard variant
const colorToVariant: Record<string, StatCardVariant> = {
  '#f59e0b': 'warning',  // amber
  '#3b82f6': 'info',     // blue
  '#10b981': 'success',  // emerald
  '#22c55e': 'success',  // green
  '#6366f1': 'info',     // indigo
  '#ef4444': 'danger',   // red
};

type Tab = 'dashboard' | 'planning' | 'roi' | 'task-assessment' | 'business-metrics' | 'unit-economics' | 'token-economics' | 'chargeback' | 'optimization' | 'anomalies';

const TABS: { id: Tab; label: string }[] = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'planning', label: 'Planning' },
  { id: 'anomalies', label: 'Cost Anomalies' },
  { id: 'roi', label: 'ROI' },
  { id: 'task-assessment', label: 'Task Fit' },
  { id: 'business-metrics', label: 'Business Value' },
  { id: 'unit-economics', label: 'Unit Economics' },
  { id: 'token-economics', label: 'Token Economics' },
  { id: 'chargeback', label: 'Chargeback' },
  { id: 'optimization', label: 'Optimization' },
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

function AwsSpendSection() {
  const [aiOnly, setAiOnly] = useState(false);
  const { loading, data, live } = useAwsCost(6, aiOnly);

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
          <span className="text-[11px] text-slate-400">last 6 months · unblended</span>
        </div>
        <div className="flex items-center gap-1 p-0.5 bg-slate-100/80 rounded-lg text-[11px]">
          <button onClick={() => setAiOnly(false)} className={`px-2.5 py-1 rounded-md font-medium transition-all ${!aiOnly ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>All AWS</button>
          <button onClick={() => setAiOnly(true)} className={`px-2.5 py-1 rounded-md font-medium transition-all ${aiOnly ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>AI/ML only</button>
        </div>
      </div>

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
                <Bar dataKey="amount" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── AWS Spend detail — live daily trend, forecast, anomalies, by-model from Cost Explorer ───
function AwsSpendDetail() {
  const { loading, trend, forecast, anomalies, byModel } = useAwsCostDetail(30, 3, 60, 6);
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
    <div className="mb-6 grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Daily trend */}
      <div className="rounded-xl border border-slate-200/60 shadow-sm bg-white/80 backdrop-blur-sm p-5">
        <div className="flex items-center gap-2 mb-2">
          <h3 className="text-sm font-semibold text-slate-900">Daily Spend (30d)</h3>
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
            <span className="text-[11px] text-slate-400">last 6 months · from Cost Explorer usage types</span>
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

export default function FinOps() {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const { expectedCost, useCases, refresh } = useGovernanceAggregator();
  const [showCostEditor, setShowCostEditor] = useState(false);

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
              Spend posture, forecast, unit economics, chargeback, and commitment planning — everything the CFO and platform FinOps lead need in one place.
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
        {/* ── Live · sourced from your AWS account (Cost Explorer) — grouped as the hero ── */}
        <div className="mb-8 rounded-2xl border border-emerald-200/70 bg-gradient-to-br from-emerald-50/50 via-white to-white p-4 shadow-sm">
          <LiveHeader
            live
            label="Live · from your AWS account"
            caption="Cost Explorer — spend, trend, forecast & anomalies"
          />
          <AwsSpendSection />
          <AwsSpendDetail />
          <UseCaseSpendCard />
          <CostByTagCard />
          <BudgetsCard />
        </div>

        {/* ══ Sub-zone A · Cross-provider — grouped container, mirrors the live AWS zone ══ */}
        <div className="mb-8 rounded-2xl border border-sky-200/60 bg-gradient-to-br from-sky-50/40 via-white to-white p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-3 px-1">
            <span className="w-2 h-2 rounded-full bg-sky-400" />
            <span className="text-[11px] font-semibold text-sky-700 uppercase tracking-wide">Cross-provider spend · illustrative</span>
            <span className="text-[10px] text-slate-400">AWS is live above — Azure/Vertex &amp; multi-provider agent cost need connectors (Multi-Cloud module)</span>
          </div>

        {/* Connector status — grounds the illustrative zone with honest connected-vs-not */}
        <ProviderConnectorsCard />

        {/* Provider Cost Comparison — lead card of the cross-provider sub-zone */}
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 shadow-sm mb-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-sm font-semibold text-slate-900">Provider Cost Comparison</div>
              <div className="text-[11px] text-slate-400">Monthly spend across all agent providers</div>
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
              <div className="flex items-center gap-4">
                <ResponsiveContainer width="60%" height={180}>
                  <PieChart>
                    <Pie
                      data={providerCostChartData}
                      dataKey="monthlyCost"
                      nameKey="provider"
                      cx="50%"
                      cy="50%"
                      outerRadius={70}
                      innerRadius={42}
                      paddingAngle={2}
                    >
                      {providerCostChartData.map((entry, i) => (
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
                  {providerCostChartData.map(p => (
                    <div key={p.provider} className="flex items-center gap-2 text-[11px]">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: p.color }} />
                      <span className="text-slate-700 truncate flex-1">{p.provider}</span>
                      <span className="text-slate-500">{p.agentCount} agents</span>
                      <span className="text-slate-900 font-medium tabular-nums">${p.monthlyCost.toLocaleString()}</span>
                    </div>
                  ))}
                  <div className="border-t border-slate-100 pt-1.5 mt-1.5 flex items-center justify-between text-[11px]">
                    <span className="text-slate-600 font-medium">Total</span>
                    <span className="text-slate-900 font-semibold tabular-nums">${totalProviderCost.toLocaleString()}/mo</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Cost Trend by Provider - Line Chart */}
            <div>
              <div className="text-xs font-medium text-slate-600 mb-2">6-Month Provider Trend</div>
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

        {/* Cross-provider model mix — full-width, mirrors the Provider Cost Comparison layout.
            The live AWS/Bedrock slice is the "Bedrock Cost by Model" card above. */}
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 shadow-sm mb-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="text-sm font-semibold text-slate-900">Cross-Provider Model Mix</div>
              <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 uppercase tracking-wide">Illustrative</span>
            </div>
            <Link to="/govern/multi-cloud" className="text-[11px] font-medium text-blue-600 hover:text-blue-700 flex items-center gap-1">
              Multi-Cloud <span className="text-[10px]">→</span>
            </Link>
          </div>
          <p className="text-[11px] text-slate-400 mb-3 leading-relaxed">
            Spend across every model provider. Only the AWS/Bedrock slice is live today (see “Bedrock Cost by Model” above) — Azure OpenAI &amp; Vertex costs need each cloud’s cost connector, owned by the Multi-Cloud module.
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
              <div className="mt-3 text-[10px] text-slate-400">
                AWS Bedrock is live above; other providers are illustrative until connectors are added.
              </div>
            </div>
          </div>
        </div>

        {/* Row 4b: Cost per Agent by Provider */}
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
                <span className="text-emerald-600 font-semibold">{ALL_AGENTS.length} agents tracked</span>
              </div>
            </div>
          </div>
        </div>

        {/* Top cost drivers — closes the cross-provider sub-zone (agent spend, all providers) */}
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
        </div>{/* ── end cross-provider container ── */}

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

        {/* 12-Month Forecast (scenario models) */}
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 shadow-sm mb-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-semibold text-slate-900">12-Month Forecast <span className="text-[10px] font-normal text-slate-400">· scenario model</span></div>
            <div className="flex items-center gap-3 text-[11px]">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Conservative (+8%/mo)</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" /> Moderate (+15%/mo)</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-rose-500" /> Aggressive (+28%/mo)</span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={FORECAST_12M}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="month" tick={{ fill: '#94a3b8', fontSize: 10 }} />
              <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} unit="$" />
              <Tooltip contentStyle={tooltipStyle} formatter={(v) => `$${Number(v).toLocaleString()}`} />
              <Line type="monotone" dataKey="conservative" stroke="#10b981" strokeWidth={2} />
              <Line type="monotone" dataKey="moderate"      stroke="#f59e0b" strokeWidth={2} />
              <Line type="monotone" dataKey="aggressive"    stroke="#ef4444" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>

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

      </div>
    </div>
  );
}
