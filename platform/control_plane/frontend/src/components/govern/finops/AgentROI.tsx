/**
 * AgentROI — ROI Measurement for Agentic AI
 *
 * Based on AWS Prescriptive Guidance: Measuring Success for Agentic AI
 * https://docs.aws.amazon.com/prescriptive-guidance/latest/agentic-ai-economics/measuring-success.html
 *
 * Key concepts:
 * - Baseline establishment before deployment
 * - Autonomy-level adjusted error thresholds
 * - Break-even analysis with termination triggers
 * - Learning/adaptation metrics over time
 * - Outcome-based value modeling
 */

import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  LineChart, Line, AreaChart, Area, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, ComposedChart,
} from 'recharts';
import { scopeColor, scopeName, type AgentScopeLevel } from '../autonomyLadder';
import { useGovernanceAggregator } from '../useGovernanceAggregator';
import type { BusinessCase } from '../../../api/client';
import { LiveDataBadge, MockDataBadge } from '../DataSourceIndicator';

const tooltipStyle = {
  background: 'rgba(255,255,255,0.98)',
  border: '1px solid #e2e8f0',
  borderRadius: 8,
  fontSize: 12,
  color: '#0f172a',
  boxShadow: '0 4px 12px rgba(15,23,42,0.08)',
};

interface AgentROIData {
  id: string;
  name: string;
  status: 'healthy' | 'at-risk' | 'underperforming';
  autonomyLevel: 'supervised' | 'human-in-loop' | 'co-pilot' | 'autonomous';
  baseline: {
    manualCostPerTask: number;
    tasksPerMonth: number;
    errorRate: number;
    avgProcessingTime: number;
  };
  current: {
    agentCostPerTask: number;
    tasksPerMonth: number;
    errorRate: number;
    avgProcessingTime: number;
  };
  roi: {
    monthlySavings: number;
    breakEvenMonths: number;
    currentMonth: number;
    cumulativeSavings: number;
    projectedAnnualROI: number;
  };
  learningTrend: { month: string; errorRate: number; efficiency: number }[];
  terminationThreshold: number;
}

const AUTONOMY_ERROR_THRESHOLDS = {
  'supervised': { acceptable: 5, warning: 8, critical: 12 },
  'human-in-loop': { acceptable: 3, warning: 5, critical: 8 },
  'co-pilot': { acceptable: 2, warning: 4, critical: 6 },
  'autonomous': { acceptable: 1, warning: 2, critical: 4 },
};

// Keyed to the canonical autonomy ladder (autonomyLadder.ts). Each label carries a
// `scopeLevel` and derives its color from canonical (no local hex). supervised +
// co-pilot both map to L2 (Prescribed Agency) as distinct sub-modes; human-in-loop
// ("approves high-risk") maps to L3 (Supervised), matching AgentRiskProfile's
// semi-autonomous band; autonomous maps to L4.
const AUTONOMY_LABELS: Record<AgentROIData['autonomyLevel'], { label: string; scopeLevel: AgentScopeLevel; description: string; color: string }> = {
  'supervised': { label: 'Supervised', scopeLevel: 2, description: 'Human approves every action', color: scopeColor(2) },
  'human-in-loop': { label: 'Human-in-Loop', scopeLevel: 3, description: 'Human approves high-risk actions', color: scopeColor(3) },
  'co-pilot': { label: 'Co-Pilot', scopeLevel: 2, description: 'Agent suggests, human decides', color: scopeColor(2) },
  'autonomous': { label: 'Autonomous', scopeLevel: 4, description: 'Agent acts independently', color: scopeColor(4) },
};

const MOCK_AGENT_ROI: AgentROIData[] = [
  {
    id: 'agent-001',
    name: 'Customer Service Agent',
    status: 'healthy',
    autonomyLevel: 'co-pilot',
    baseline: { manualCostPerTask: 4.50, tasksPerMonth: 45200, errorRate: 8.2, avgProcessingTime: 12 },
    current: { agentCostPerTask: 0.28, tasksPerMonth: 48500, errorRate: 2.1, avgProcessingTime: 0.8 },
    roi: { monthlySavings: 204670, breakEvenMonths: 2, currentMonth: 6, cumulativeSavings: 892400, projectedAnnualROI: 2285 },
    learningTrend: [
      { month: 'M1', errorRate: 4.8, efficiency: 72 },
      { month: 'M2', errorRate: 3.9, efficiency: 78 },
      { month: 'M3', errorRate: 3.2, efficiency: 84 },
      { month: 'M4', errorRate: 2.6, efficiency: 88 },
      { month: 'M5', errorRate: 2.3, efficiency: 91 },
      { month: 'M6', errorRate: 2.1, efficiency: 94 },
    ],
    terminationThreshold: 6,
  },
  {
    id: 'agent-002',
    name: 'Fraud Detection Agent',
    status: 'healthy',
    autonomyLevel: 'human-in-loop',
    baseline: { manualCostPerTask: 8.20, tasksPerMonth: 38900, errorRate: 3.1, avgProcessingTime: 45 },
    current: { agentCostPerTask: 0.85, tasksPerMonth: 42100, errorRate: 1.2, avgProcessingTime: 2.5 },
    roi: { monthlySavings: 309435, breakEvenMonths: 3, currentMonth: 8, cumulativeSavings: 1842000, projectedAnnualROI: 3420 },
    learningTrend: [
      { month: 'M1', errorRate: 2.8, efficiency: 68 },
      { month: 'M2', errorRate: 2.4, efficiency: 74 },
      { month: 'M3', errorRate: 2.0, efficiency: 79 },
      { month: 'M4', errorRate: 1.7, efficiency: 83 },
      { month: 'M5', errorRate: 1.5, efficiency: 86 },
      { month: 'M6', errorRate: 1.4, efficiency: 88 },
      { month: 'M7', errorRate: 1.3, efficiency: 90 },
      { month: 'M8', errorRate: 1.2, efficiency: 92 },
    ],
    terminationThreshold: 8,
  },
  {
    id: 'agent-003',
    name: 'Credit Risk Agent',
    status: 'at-risk',
    autonomyLevel: 'supervised',
    baseline: { manualCostPerTask: 12.40, tasksPerMonth: 9400, errorRate: 2.8, avgProcessingTime: 120 },
    current: { agentCostPerTask: 2.10, tasksPerMonth: 9800, errorRate: 4.2, avgProcessingTime: 8 },
    roi: { monthlySavings: 100940, breakEvenMonths: 4, currentMonth: 3, cumulativeSavings: 186500, projectedAnnualROI: 892 },
    learningTrend: [
      { month: 'M1', errorRate: 5.1, efficiency: 62 },
      { month: 'M2', errorRate: 4.8, efficiency: 65 },
      { month: 'M3', errorRate: 4.2, efficiency: 68 },
    ],
    terminationThreshold: 12,
  },
  {
    id: 'agent-004',
    name: 'Trading Compliance Agent',
    status: 'underperforming',
    autonomyLevel: 'autonomous',
    baseline: { manualCostPerTask: 15.80, tasksPerMonth: 12800, errorRate: 1.2, avgProcessingTime: 180 },
    current: { agentCostPerTask: 3.20, tasksPerMonth: 11200, errorRate: 3.8, avgProcessingTime: 12 },
    roi: { monthlySavings: 141120, breakEvenMonths: 5, currentMonth: 4, cumulativeSavings: 324000, projectedAnnualROI: 425 },
    learningTrend: [
      { month: 'M1', errorRate: 2.1, efficiency: 78 },
      { month: 'M2', errorRate: 2.8, efficiency: 72 },
      { month: 'M3', errorRate: 3.4, efficiency: 68 },
      { month: 'M4', errorRate: 3.8, efficiency: 64 },
    ],
    terminationThreshold: 4,
  },
];

// Build ROI rows from REAL Plan business cases (computed.financials). Financials
// are real (roi/npv/payback/benefits/costs); operational fields (error rate,
// learning trend) aren't captured in a business case, so they're left neutral —
// this surface is the FINANCIAL ROI view, badged live when real cases exist.
function businessCaseToROI(bc: BusinessCase): AgentROIData | null {
  const f = bc.computed?.financials;
  if (!f) return null;
  const months = bc.updated_at ? Math.max(1, Math.round((Date.now() - new Date(bc.created_at).getTime()) / (1000 * 60 * 60 * 24 * 30))) : 1;
  const monthlySavings = Math.round((f.total_benefits - f.total_costs) / 12); // annualized net → per month
  const status: AgentROIData['status'] =
    f.npv_decision === 'POSITIVE NPV - Proceed' ? 'healthy'
    : f.npv_decision === 'BREAKEVEN - Review' ? 'at-risk'
    : 'underperforming';
  return {
    id: bc.business_case_id,
    name: bc.name,
    status,
    autonomyLevel: 'co-pilot',
    baseline: { manualCostPerTask: 0, tasksPerMonth: 0, errorRate: 0, avgProcessingTime: 0 },
    current: { agentCostPerTask: 0, tasksPerMonth: 0, errorRate: 0, avgProcessingTime: 0 },
    roi: {
      monthlySavings,
      breakEvenMonths: f.payback_years != null ? Math.round(f.payback_years * 12) : 0,
      currentMonth: months,
      cumulativeSavings: Math.round(f.total_benefits - f.total_costs),
      projectedAnnualROI: Math.round(f.roi * 100),
    },
    learningTrend: [],
    terminationThreshold: 0,
  };
}

// Current-month (Jun) savings is the live portfolio total so the trend's latest
// point matches the "Monthly Savings" KPI; prior months are historical ramp.
const CURRENT_MONTH_SAVINGS = MOCK_AGENT_ROI.reduce((s, a) => s + a.roi.monthlySavings, 0);
const PORTFOLIO_TREND = [
  { month: 'Jan', savings: 180000, cost: 42000, roi: 328 },
  { month: 'Feb', savings: 245000, cost: 48000, roi: 410 },
  { month: 'Mar', savings: 312000, cost: 52000, roi: 500 },
  { month: 'Apr', savings: 428000, cost: 58000, roi: 638 },
  { month: 'May', savings: 542000, cost: 62000, roi: 774 },
  { month: 'Jun', savings: CURRENT_MONTH_SAVINGS, cost: 68000, roi: 952 },
];

export default function AgentROI() {
  const [selectedAgent, setSelectedAgent] = useState<AgentROIData | null>(null);
  const [viewMode, setViewMode] = useState<'portfolio' | 'agent'>('portfolio');
  const { businessCases } = useGovernanceAggregator();

  // Prefer REAL Plan business cases; fall back to illustrative mock when none exist.
  const { data: roiData, live } = useMemo(() => {
    const real = businessCases.map(businessCaseToROI).filter((r): r is AgentROIData => r !== null);
    return real.length > 0 ? { data: real, live: true } : { data: MOCK_AGENT_ROI, live: false };
  }, [businessCases]);

  const portfolioStats = useMemo(() => {
    const totalMonthlySavings = roiData.reduce((s, a) => s + a.roi.monthlySavings, 0);
    const totalCumulativeSavings = roiData.reduce((s, a) => s + a.roi.cumulativeSavings, 0);
    const avgROI = roiData.length ? Math.round(roiData.reduce((s, a) => s + a.roi.projectedAnnualROI, 0) / roiData.length) : 0;
    const healthy = roiData.filter(a => a.status === 'healthy').length;
    const atRisk = roiData.filter(a => a.status === 'at-risk').length;
    const underperforming = roiData.filter(a => a.status === 'underperforming').length;

    return { totalMonthlySavings, totalCumulativeSavings, avgROI, healthy, atRisk, underperforming };
  }, [roiData]);

  // Value-creation ramp — a projection. When live, anchor the final point to the
  // real portfolio monthly savings so the trend and KPI agree.
  const portfolioTrend = useMemo(() => {
    if (!live) return PORTFOLIO_TREND;
    const target = portfolioStats.totalMonthlySavings;
    const shape = [0.35, 0.5, 0.62, 0.78, 0.9, 1];
    return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'].map((month, i) => ({
      month,
      savings: Math.round(target * shape[i]),
      cost: Math.round(target * shape[i] * 0.12),
      roi: Math.round(portfolioStats.avgROI * shape[i]),
    }));
  }, [live, portfolioStats]);

  const calculateValueCreated = (agent: AgentROIData) => {
    const costSavings = (agent.baseline.manualCostPerTask - agent.current.agentCostPerTask) * agent.current.tasksPerMonth;
    const errorReduction = ((agent.baseline.errorRate - agent.current.errorRate) / agent.baseline.errorRate) * 100;
    const timeReduction = ((agent.baseline.avgProcessingTime - agent.current.avgProcessingTime) / agent.baseline.avgProcessingTime) * 100;
    const volumeIncrease = ((agent.current.tasksPerMonth - agent.baseline.tasksPerMonth) / agent.baseline.tasksPerMonth) * 100;

    return { costSavings, errorReduction, timeReduction, volumeIncrease };
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy': return { bg: '#dcfce7', text: '#166534', border: '#86efac' };
      case 'at-risk': return { bg: '#fef3c7', text: '#92400e', border: '#fcd34d' };
      case 'underperforming': return { bg: '#fee2e2', text: '#991b1b', border: '#fca5a5' };
      default: return { bg: '#f1f5f9', text: '#475569', border: '#cbd5e1' };
    }
  };

  const getErrorStatus = (agent: AgentROIData) => {
    const thresholds = AUTONOMY_ERROR_THRESHOLDS[agent.autonomyLevel];
    if (agent.current.errorRate <= thresholds.acceptable) return 'acceptable';
    if (agent.current.errorRate <= thresholds.warning) return 'warning';
    return 'critical';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-slate-900">ROI Measurement</h2>
            {live ? <LiveDataBadge /> : <MockDataBadge integration="Create business cases in Plan to populate real ROI" />}
          </div>
          <p className="text-sm text-slate-500">
            {live
              ? 'Financial ROI from your Plan business cases — NPV, payback & benefit-cost from the approved financial model.'
              : 'Illustrative example — value realization based on AWS Agentic AI Economics guidance.'}
          </p>
          <Link to="/business-cases" className="text-[11px] text-blue-600 hover:text-blue-700 font-medium">
            {live ? 'Manage business cases in Plan →' : 'Create business cases in Plan →'}
          </Link>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setViewMode('portfolio')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
              viewMode === 'portfolio' ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            Portfolio View
          </button>
          {!live && (
            <button
              onClick={() => setViewMode('agent')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                viewMode === 'agent' ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              Agent Deep-Dive
            </button>
          )}
        </div>
      </div>

      {/* Portfolio Stats */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-4">
          <div className="text-2xl font-bold text-emerald-600">${(portfolioStats.totalMonthlySavings / 1000).toFixed(0)}k</div>
          <div className="text-xs text-slate-500">Monthly Savings</div>
        </div>
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-4">
          <div className="text-2xl font-bold text-indigo-600">${(portfolioStats.totalCumulativeSavings / 1000000).toFixed(2)}M</div>
          <div className="text-xs text-slate-500">Cumulative Savings</div>
        </div>
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-4">
          <div className="text-2xl font-bold text-slate-900">{portfolioStats.avgROI}%</div>
          <div className="text-xs text-slate-500">Avg Annual ROI</div>
        </div>
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-emerald-200 p-4">
          <div className="text-2xl font-bold text-emerald-600">{portfolioStats.healthy}</div>
          <div className="text-xs text-slate-500">Healthy Agents</div>
        </div>
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-amber-200 p-4">
          <div className="text-2xl font-bold text-amber-600">{portfolioStats.atRisk}</div>
          <div className="text-xs text-slate-500">At Risk</div>
        </div>
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-red-200 p-4">
          <div className="text-2xl font-bold text-red-600">{portfolioStats.underperforming}</div>
          <div className="text-xs text-slate-500">Underperforming</div>
        </div>
      </div>

      {viewMode === 'portfolio' ? (
        <>
          {/* Portfolio Savings Trend */}
          <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="text-sm font-semibold text-slate-900">Portfolio Value Creation Trend <span className="text-[10px] font-normal text-slate-400">· projection</span></div>
              <div className="flex items-center gap-4 text-[11px]">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Savings</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-rose-500" /> Cost</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-indigo-500" /> ROI %</span>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={240}>
              <ComposedChart data={portfolioTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="month" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                <YAxis yAxisId="left" tick={{ fill: '#94a3b8', fontSize: 10 }} tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} />
                <YAxis yAxisId="right" orientation="right" tick={{ fill: '#94a3b8', fontSize: 10 }} unit="%" />
                <Tooltip contentStyle={tooltipStyle} formatter={(value, name) => {
                  if (name === 'roi') return [`${value}%`, 'ROI'];
                  return [`$${Number(value).toLocaleString()}`, name === 'savings' ? 'Savings' : 'Cost'];
                }} />
                <Bar yAxisId="left" dataKey="savings" fill="#10b981" radius={[4, 4, 0, 0]} name="savings" />
                <Bar yAxisId="left" dataKey="cost" fill="#f43f5e" radius={[4, 4, 0, 0]} name="cost" />
                <Line yAxisId="right" type="monotone" dataKey="roi" stroke="#6366f1" strokeWidth={2} dot={{ fill: '#6366f1', r: 4 }} name="roi" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* ROI Cards — one per business case (live) or illustrative agent (mock) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {roiData.map(agent => {
              const statusColor = getStatusColor(agent.status);
              const errorStatus = getErrorStatus(agent);
              const value = calculateValueCreated(agent);
              const autonomy = AUTONOMY_LABELS[agent.autonomyLevel];

              return (
                <div
                  key={agent.id}
                  onClick={live ? undefined : () => { setSelectedAgent(agent); setViewMode('agent'); }}
                  className={`bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 transition-all ${live ? '' : 'cursor-pointer hover:shadow-lg hover:border-slate-300'}`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="font-semibold text-slate-900">{agent.name}</div>
                      <div className="flex items-center gap-2 mt-1">
                        <span
                          className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                          style={{ backgroundColor: statusColor.bg, color: statusColor.text, border: `1px solid ${statusColor.border}` }}
                        >
                          {agent.status}
                        </span>
                        <span
                          className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                          style={{ backgroundColor: `${autonomy.color}15`, color: autonomy.color }}
                        >
                          {autonomy.label}
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xl font-bold text-emerald-600">{agent.roi.projectedAnnualROI}%</div>
                      <div className="text-[10px] text-slate-500">Annual ROI</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-4 gap-2 mb-3">
                    <div className="text-center p-2 bg-slate-50 rounded-lg">
                      <div className="text-sm font-semibold text-emerald-600">${(agent.roi.monthlySavings / 1000).toFixed(0)}k</div>
                      <div className="text-[9px] text-slate-500">Mo. Net</div>
                    </div>
                    <div className="text-center p-2 bg-slate-50 rounded-lg">
                      <div className="text-sm font-semibold text-slate-900">{agent.roi.breakEvenMonths}mo</div>
                      <div className="text-[9px] text-slate-500">Payback</div>
                    </div>
                    {live ? (
                      <>
                        <div className="text-center p-2 bg-slate-50 rounded-lg">
                          <div className="text-sm font-semibold text-indigo-600">${(agent.roi.cumulativeSavings / 1000).toFixed(0)}k</div>
                          <div className="text-[9px] text-slate-500">Net value</div>
                        </div>
                        <div className="text-center p-2 bg-slate-50 rounded-lg">
                          <div className="text-sm font-semibold text-slate-900">{agent.roi.currentMonth}mo</div>
                          <div className="text-[9px] text-slate-500">Age</div>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="text-center p-2 bg-slate-50 rounded-lg">
                          <div className={`text-sm font-semibold ${
                            errorStatus === 'acceptable' ? 'text-emerald-600' :
                            errorStatus === 'warning' ? 'text-amber-600' : 'text-red-600'
                          }`}>
                            {agent.current.errorRate}%
                          </div>
                          <div className="text-[9px] text-slate-500">Error Rate</div>
                        </div>
                        <div className="text-center p-2 bg-slate-50 rounded-lg">
                          <div className="text-sm font-semibold text-indigo-600">{value.timeReduction.toFixed(0)}%</div>
                          <div className="text-[9px] text-slate-500">Time Saved</div>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Mini Learning Trend — only for illustrative agents (business cases have no telemetry) */}
                  {agent.learningTrend.length > 0 && (
                  <div className="h-12">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={agent.learningTrend}>
                        <defs>
                          <linearGradient id={`grad-${agent.id}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={agent.status === 'underperforming' ? '#f43f5e' : '#10b981'} stopOpacity={0.3} />
                            <stop offset="100%" stopColor={agent.status === 'underperforming' ? '#f43f5e' : '#10b981'} stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <Area
                          type="monotone"
                          dataKey="efficiency"
                          stroke={agent.status === 'underperforming' ? '#f43f5e' : '#10b981'}
                          fill={`url(#grad-${agent.id})`}
                          strokeWidth={1.5}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                  )}

                  {/* Termination Warning */}
                  {agent.status === 'underperforming' && (
                    <div className="mt-3 p-2 bg-red-50 rounded-lg border border-red-200">
                      <div className="flex items-center gap-2 text-xs text-red-700">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        <span className="font-medium">Termination review at month {agent.terminationThreshold}</span>
                        <span className="ml-auto text-red-500">Month {agent.roi.currentMonth}/{agent.terminationThreshold}</span>
                      </div>
                    </div>
                  )}

                  {/* Round-trip to Plan — the business case this ROI is computed from */}
                  {live && (
                    <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-end">
                      <Link to="/business-cases" className="text-[11px] text-blue-600 hover:text-blue-700 font-medium">
                        View business case in Plan →
                      </Link>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      ) : selectedAgent ? (
        <AgentDeepDive agent={selectedAgent} onBack={() => setViewMode('portfolio')} />
      ) : (
        <div className="text-center py-12 text-slate-500">Select an agent to view detailed ROI analysis</div>
      )}
    </div>
  );
}

function AgentDeepDive({ agent, onBack }: { agent: AgentROIData; onBack: () => void }) {
  const value = useMemo(() => {
    const costSavings = (agent.baseline.manualCostPerTask - agent.current.agentCostPerTask) * agent.current.tasksPerMonth;
    const errorReduction = ((agent.baseline.errorRate - agent.current.errorRate) / agent.baseline.errorRate) * 100;
    const timeReduction = ((agent.baseline.avgProcessingTime - agent.current.avgProcessingTime) / agent.baseline.avgProcessingTime) * 100;
    const volumeIncrease = ((agent.current.tasksPerMonth - agent.baseline.tasksPerMonth) / agent.baseline.tasksPerMonth) * 100;
    return { costSavings, errorReduction, timeReduction, volumeIncrease };
  }, [agent]);

  const autonomy = AUTONOMY_LABELS[agent.autonomyLevel];
  const thresholds = AUTONOMY_ERROR_THRESHOLDS[agent.autonomyLevel];

  const breakEvenData = useMemo(() => {
    const data = [];
    let cumulative = -50000; // Initial investment
    const monthlySavings = agent.roi.monthlySavings;
    for (let i = 0; i <= 12; i++) {
      data.push({
        month: `M${i}`,
        cumulative: Math.round(cumulative),
        projected: i <= agent.roi.currentMonth ? null : Math.round(cumulative),
        actual: i <= agent.roi.currentMonth ? Math.round(cumulative) : null,
      });
      cumulative += monthlySavings;
    }
    return data;
  }, [agent]);

  return (
    <div className="space-y-6">
      {/* Back Button & Header */}
      <div className="flex items-center gap-4">
        <button onClick={onBack} className="p-2 rounded-lg hover:bg-slate-100 transition-colors" aria-label="Go back">
          <svg className="w-5 h-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-slate-900">{agent.name}</h3>
          <div className="flex items-center gap-2 mt-1">
            <span
              className="text-[10px] px-2 py-0.5 rounded-full font-medium"
              style={{ backgroundColor: `${autonomy.color}15`, color: autonomy.color }}
            >
              {autonomy.label}
            </span>
            <span className="text-xs text-slate-500">{autonomy.description}</span>
          </div>
        </div>
        <div className="text-right">
          <div className="text-3xl font-bold text-emerald-600">{agent.roi.projectedAnnualROI}%</div>
          <div className="text-xs text-slate-500">Projected Annual ROI</div>
        </div>
      </div>

      {/* Baseline vs Current Comparison */}
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5">
        <h4 className="text-sm font-semibold text-slate-900 mb-4">Baseline vs Current Performance</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-4 bg-slate-50 rounded-lg">
            <div className="text-xs text-slate-500 mb-2">Cost per Task</div>
            <div className="flex items-end gap-2">
              <div className="text-lg font-bold text-slate-400 line-through">${agent.baseline.manualCostPerTask.toFixed(2)}</div>
              <div className="text-2xl font-bold text-emerald-600">${agent.current.agentCostPerTask.toFixed(2)}</div>
            </div>
            <div className="text-xs text-emerald-600 mt-1">↓ {((1 - agent.current.agentCostPerTask / agent.baseline.manualCostPerTask) * 100).toFixed(0)}% reduction</div>
          </div>
          <div className="p-4 bg-slate-50 rounded-lg">
            <div className="text-xs text-slate-500 mb-2">Error Rate</div>
            <div className="flex items-end gap-2">
              <div className="text-lg font-bold text-slate-400 line-through">{agent.baseline.errorRate}%</div>
              <div className={`text-2xl font-bold ${value.errorReduction > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {agent.current.errorRate}%
              </div>
            </div>
            <div className={`text-xs mt-1 ${value.errorReduction > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {value.errorReduction > 0 ? '↓' : '↑'} {Math.abs(value.errorReduction).toFixed(0)}% {value.errorReduction > 0 ? 'reduction' : 'increase'}
            </div>
          </div>
          <div className="p-4 bg-slate-50 rounded-lg">
            <div className="text-xs text-slate-500 mb-2">Processing Time</div>
            <div className="flex items-end gap-2">
              <div className="text-lg font-bold text-slate-400 line-through">{agent.baseline.avgProcessingTime}m</div>
              <div className="text-2xl font-bold text-emerald-600">{agent.current.avgProcessingTime}m</div>
            </div>
            <div className="text-xs text-emerald-600 mt-1">↓ {value.timeReduction.toFixed(0)}% faster</div>
          </div>
          <div className="p-4 bg-slate-50 rounded-lg">
            <div className="text-xs text-slate-500 mb-2">Monthly Volume</div>
            <div className="flex items-end gap-2">
              <div className="text-lg font-bold text-slate-400 line-through">{agent.baseline.tasksPerMonth.toLocaleString()}</div>
              <div className="text-2xl font-bold text-indigo-600">{agent.current.tasksPerMonth.toLocaleString()}</div>
            </div>
            <div className="text-xs text-indigo-600 mt-1">↑ {value.volumeIncrease.toFixed(0)}% capacity</div>
          </div>
        </div>
      </div>

      {/* Break-Even Analysis */}
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5">
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-sm font-semibold text-slate-900">Break-Even Analysis</h4>
          <div className="flex items-center gap-2 text-xs">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Actual</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-slate-300" /> Projected</span>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={200}>
          <ComposedChart data={breakEvenData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="month" tick={{ fill: '#94a3b8', fontSize: 10 }} />
            <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} />
            <Tooltip contentStyle={tooltipStyle} formatter={(v) => `$${Number(v).toLocaleString()}`} />
            <ReferenceLine y={0} stroke="#ef4444" strokeDasharray="5 5" />
            <Area type="monotone" dataKey="actual" stroke="#10b981" fill="#dcfce7" strokeWidth={2} />
            <Area type="monotone" dataKey="projected" stroke="#cbd5e1" fill="#f1f5f9" strokeWidth={2} strokeDasharray="5 5" />
          </ComposedChart>
        </ResponsiveContainer>
        <div className="flex items-center justify-center gap-6 mt-3 text-xs">
          <div className="text-center">
            <div className="text-lg font-bold text-slate-900">{agent.roi.breakEvenMonths} months</div>
            <div className="text-slate-500">Time to break-even</div>
          </div>
          <div className="w-px h-8 bg-slate-200" />
          <div className="text-center">
            <div className="text-lg font-bold text-emerald-600">${(agent.roi.cumulativeSavings / 1000).toFixed(0)}k</div>
            <div className="text-slate-500">Cumulative savings</div>
          </div>
          <div className="w-px h-8 bg-slate-200" />
          <div className="text-center">
            <div className="text-lg font-bold text-indigo-600">Month {agent.roi.currentMonth}</div>
            <div className="text-slate-500">Current period</div>
          </div>
        </div>
      </div>

      {/* Learning & Adaptation Trend */}
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h4 className="text-sm font-semibold text-slate-900">Learning & Adaptation</h4>
            <p className="text-xs text-slate-500">Agent improvement over time — key differentiator from static automation</p>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Efficiency %</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-rose-500" /> Error Rate %</span>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={agent.learningTrend}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="month" tick={{ fill: '#94a3b8', fontSize: 10 }} />
            <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} domain={[0, 100]} />
            <Tooltip contentStyle={tooltipStyle} />
            <Line type="monotone" dataKey="efficiency" stroke="#10b981" strokeWidth={2} dot={{ fill: '#10b981', r: 4 }} />
            <Line type="monotone" dataKey="errorRate" stroke="#f43f5e" strokeWidth={2} dot={{ fill: '#f43f5e', r: 4 }} />
            <ReferenceLine y={thresholds.acceptable} stroke="#10b981" strokeDasharray="3 3" label={{ value: 'Acceptable', fill: '#10b981', fontSize: 10 }} />
            <ReferenceLine y={thresholds.critical} stroke="#ef4444" strokeDasharray="3 3" label={{ value: 'Critical', fill: '#ef4444', fontSize: 10 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Autonomy-Adjusted Error Thresholds */}
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5">
        <h4 className="text-sm font-semibold text-slate-900 mb-3">Autonomy-Adjusted Error Thresholds</h4>
        <p className="text-xs text-slate-500 mb-4">
          Higher autonomy levels require tighter error tolerances. Current level: <strong style={{ color: autonomy.color }}>{autonomy.label}</strong>
        </p>
        <div className="grid grid-cols-4 gap-3">
          {(Object.entries(AUTONOMY_LABELS) as [keyof typeof AUTONOMY_LABELS, typeof AUTONOMY_LABELS[keyof typeof AUTONOMY_LABELS]][]).map(([key, level]) => {
            const t = AUTONOMY_ERROR_THRESHOLDS[key];
            const isActive = key === agent.autonomyLevel;
            return (
              <div
                key={key}
                className={`p-3 rounded-lg border ${isActive ? 'ring-2' : 'opacity-60'}`}
                style={{ borderColor: level.color, backgroundColor: isActive ? `${level.color}10` : '#f8fafc', boxShadow: isActive ? `0 0 0 2px ${level.color}` : 'none' }}
              >
                <div className="text-xs font-semibold" style={{ color: level.color }}>{level.label}</div>
                <div className="text-[9px] text-slate-400 mb-2">L{level.scopeLevel} · {scopeName(level.scopeLevel)}</div>
                <div className="space-y-1 text-[10px]">
                  <div className="flex justify-between">
                    <span className="text-emerald-600">Acceptable:</span>
                    <span>≤{t.acceptable}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-amber-600">Warning:</span>
                    <span>≤{t.warning}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-red-600">Critical:</span>
                    <span>&gt;{t.warning}%</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
