/**
 * BusinessMetrics — Translate technical costs to business outcomes
 *
 * Grounded in the AWS Well-Architected Agentic AI Lens — Cost Optimization pillar:
 *  - AGENTCOST05  Agent cost visibility & attribution
 *      BP01 reasoning-cost tracking · BP02 distributed cost tracing ·
 *      BP03 tenant-aware allocation (AaaS) · BP04 chargeback & ROI reporting
 *      https://docs.aws.amazon.com/wellarchitected/latest/agentic-ai-lens/agentcost05.html
 *  - AGENTCOST07  Agent cost governance & continuous optimization
 *      https://docs.aws.amazon.com/wellarchitected/latest/agentic-ai-lens/agentcost07.html
 *
 * AWS's stated position (paraphrased from the Lens): technical telemetry must be
 * translated into BUSINESS metrics — cost-per-decision, cost-per-task-completion,
 * and ROI against manual processes — so "investment decisions are grounded in
 * outcomes rather than raw spend." Maturity progresses Initial → Optimized.
 *
 * Key concepts:
 * - Convert technical metrics to business metrics
 * - ROI baseline modeling with pre-automation (human/manual) costs
 * - Tag-based cost allocation by business dimension
 * - Dual dashboard strategy (engineering + executive)
 */

import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, ComposedChart, Line,
} from 'recharts';
import { useGovernanceAggregator } from '../useGovernanceAggregator';
import { LiveDataBadge, MockDataBadge } from '../DataSourceIndicator';

const tooltipStyle = {
  background: 'rgba(255,255,255,0.98)',
  border: '1px solid #e2e8f0',
  borderRadius: 8,
  fontSize: 12,
  color: '#0f172a',
  boxShadow: '0 4px 12px rgba(15,23,42,0.08)',
};

interface BusinessMetric {
  id: string;
  name: string;
  technicalMetric: string;
  businessMetric: string;
  unit: string;
  currentValue: number;
  baselineValue: number;
  trend: 'improving' | 'stable' | 'declining';
  businessUnit: string;
}

interface TCOComparison {
  category: string;
  humanCost: number;
  agentCost: number;
  savings: number;
}

// ── Human ↔ Agent COLLABORATION-SPECTRUM TCO ─────────────────────────────────
// TCO is NOT a binary human-vs-agent switch. There is a spectrum of operating
// models — human-led → agent-assisted → human-assisted → autonomous — mapped to
// the autonomy scoping matrix (L1→L4). Each carries a FULL cost stack (human
// labor + oversight + agent build/infra/model + maintenance) and delivers value.
// The middle (hybrid) states can be the COSTLIEST per unit before autonomy is
// earned, and value — not just cost — is what's gained/lost. "Agent = $0" is a
// false zero; "human = $0 once automated" is equally false.

interface OperatingModel {
  level: string;              // L0..L4 (autonomy scoping matrix)
  model: string;              // operating-model name
  who: string;                // who leads / who assists
  laborCost: number;          // remaining direct human labor ($/yr)
  oversightCost: number;      // human effort to supervise/HITL the agent ($/yr)
  agentRunCost: number;       // infra + model + maintenance run-rate ($/yr)
  valueIndex: number;         // relative delivered value/throughput (human-led = 100)
  note: string;
}

// A representative process: human-led fully-loaded at $450k/yr, value baseline 100.
// As the operating model moves along the spectrum, labor falls, oversight rises
// then falls (heaviest when the agent is new/low-autonomy), agent run-cost grows,
// and value climbs (agents add throughput/quality beyond pure substitution).
const SPECTRUM: OperatingModel[] = [
  { level: 'L0', model: 'Human-Led',            who: 'Human does the work',              laborCost: 450000, oversightCost: 0,      agentRunCost: 0,      valueIndex: 100, note: 'Baseline. Full labor cost, no agent cost — but capped by human throughput.' },
  { level: 'L1', model: 'Agent-Assisted Human', who: 'Human leads · agent accelerates',  laborCost: 340000, oversightCost: 0,      agentRunCost: 120000, valueIndex: 135, note: 'Copilot pattern. Most labor remains AND agent cost is added — TCO can rise; value comes from throughput/quality.' },
  { level: 'L2', model: 'Human-Assisted Agent', who: 'Agent leads · human supervises',   laborCost: 150000, oversightCost: 110000, agentRunCost: 150000, valueIndex: 190, note: 'The expensive middle: labor drops but HITL oversight is real and heavy while trust is earned.' },
  { level: 'L3', model: 'Conditional Autonomy',  who: 'Agent operates · human on exceptions', laborCost: 60000,  oversightCost: 55000,  agentRunCost: 165000, valueIndex: 240, note: 'Exception-based oversight. Net cost now clearly below human-led; value well above.' },
  { level: 'L4', model: 'Autonomous (Monitored)', who: 'Agent operates · human out-of-loop', laborCost: 20000,  oversightCost: 25000,  agentRunCost: 175000, valueIndex: 300, note: 'Monitoring + failsafe only. Agent/infra/model cost dominates; lowest total, highest value.' },
];

// One-time transition investment to STAND UP the agent path (not annual).
interface TransitionCostItem {
  phase: 'Discover' | 'Develop' | 'Integrate' | 'Validate';
  oneTime: number;
  detail: string;
}
const TRANSITION_COSTS: TransitionCostItem[] = [
  { phase: 'Discover', oneTime: 45000,  detail: 'Use-case discovery, feasibility, autonomy-matrix scoping, success criteria' },
  { phase: 'Develop',  oneTime: 180000, detail: 'Agent build, tools/integration, guardrails, prompt/model selection' },
  { phase: 'Integrate', oneTime: 60000, detail: 'System integration, change management, SME time, user training' },
  { phase: 'Validate', oneTime: 35000,  detail: 'Evals, red-teaming, HITL calibration, go-live readiness review' },
];

// AWS Well-Architected Agentic AI Lens — cost visibility & attribution maturity
// (AGENTCOST05). Verbatim level names; used to show where an org sits on AWS's
// own model for translating agent cost into business value / ROI.
const AWS_COST_MATURITY: { level: number; name: string; hallmark: string }[] = [
  { level: 1, name: 'Initial',   hallmark: 'Cost visible only at AWS account level; billing surprises after the fact.' },
  { level: 2, name: 'Emerging',  hallmark: 'Tag taxonomy on Bedrock/AgentCore; per-agent & per-workflow reports emerging.' },
  { level: 3, name: 'Defined',   hallmark: 'Cost-per-task-completion tracked; budgets & alarms drive intervention.' },
  { level: 4, name: 'Proactive', hallmark: 'ROI-vs-manual on business dashboards; experimentation on collaboration patterns.' },
  { level: 5, name: 'Optimized', hallmark: 'Cost a core input to quarterly investment decisions, not an after-the-fact report.' },
];
// Where this org currently sits (illustrative; a live integration would derive it).
const CURRENT_COST_MATURITY = 3;

// AWS-named business value metrics (from the Lens capability intent).
const AWS_VALUE_METRICS = [
  { metric: 'Cost per decision', source: 'AGENTCOST05 capability intent' },
  { metric: 'Cost per task-completion', source: 'AGENTCOST05 / 07' },
  { metric: 'ROI against manual processes', source: 'AGENTCOST05-BP04 (chargeback & ROI)' },
];

// Multi-year path: a use case migrating ALONG the spectrum as the agent earns
// autonomy. Year 0 carries the one-time transition build; the operating model
// climbs L1→L4 over time, so the annual total bends down and value ramps up —
// the honest crossover vs the flat human-led baseline, not an instant zero.
const MIGRATION_PATH_LEVELS = ['L1', 'L1', 'L2', 'L3', 'L4']; // years 0..4

const BUSINESS_METRICS: BusinessMetric[] = [
  {
    id: 'metric-001',
    name: 'Customer Interaction Cost',
    technicalMetric: 'Tokens consumed per session',
    businessMetric: 'Cost per customer interaction',
    unit: '$/interaction',
    currentValue: 0.28,
    baselineValue: 4.50,
    trend: 'improving',
    businessUnit: 'Retail Banking',
  },
  {
    id: 'metric-002',
    name: 'Fraud Decision Cost',
    technicalMetric: 'Lambda execution + Bedrock invocations',
    businessMetric: 'Cost per fraud decision',
    unit: '$/decision',
    currentValue: 0.85,
    baselineValue: 12.40,
    trend: 'improving',
    businessUnit: 'Risk & Fraud',
  },
  {
    id: 'metric-003',
    name: 'Document Processing Cost',
    technicalMetric: 'S3 + Textract + Claude tokens',
    businessMetric: 'Cost per document processed',
    unit: '$/document',
    currentValue: 0.12,
    baselineValue: 2.80,
    trend: 'stable',
    businessUnit: 'Operations',
  },
  {
    id: 'metric-004',
    name: 'Trade Recommendation Cost',
    technicalMetric: 'Model inference + orchestration',
    businessMetric: 'Cost per trade recommendation',
    unit: '$/recommendation',
    currentValue: 2.20,
    baselineValue: 18.50,
    trend: 'improving',
    businessUnit: 'Capital Markets',
  },
  {
    id: 'metric-005',
    name: 'Claims Adjudication Cost',
    technicalMetric: 'Agent runtime + knowledge base queries',
    businessMetric: 'Cost per claim processed',
    unit: '$/claim',
    currentValue: 1.45,
    baselineValue: 8.20,
    trend: 'improving',
    businessUnit: 'Insurance',
  },
];

const TCO_DATA: TCOComparison[] = [
  { category: 'Labor (FTE)', humanCost: 450000, agentCost: 0, savings: 450000 },
  { category: 'Benefits & Overhead', humanCost: 135000, agentCost: 0, savings: 135000 },
  { category: 'Training & Onboarding', humanCost: 42000, agentCost: 8000, savings: 34000 },
  { category: 'Infrastructure', humanCost: 24000, agentCost: 68000, savings: -44000 },
  { category: 'AI/ML Compute', humanCost: 0, agentCost: 156000, savings: -156000 },
  { category: 'Maintenance & Support', humanCost: 18000, agentCost: 24000, savings: -6000 },
  { category: 'Error Correction', humanCost: 86000, agentCost: 12000, savings: 74000 },
];

const COST_BY_BU = [
  { bu: 'Retail Banking', cost: 28400, color: '#3b82f6' },
  { bu: 'Risk & Fraud', cost: 42800, color: '#ef4444' },
  { bu: 'Capital Markets', cost: 35200, color: '#8b5cf6' },
  { bu: 'Insurance', cost: 18600, color: '#10b981' },
  { bu: 'Operations', cost: 12400, color: '#f59e0b' },
];

const MONTHLY_TREND = [
  { month: 'Jan', techCost: 38, bizValue: 142 },
  { month: 'Feb', techCost: 42, bizValue: 168 },
  { month: 'Mar', techCost: 48, bizValue: 195 },
  { month: 'Apr', techCost: 52, bizValue: 224 },
  { month: 'May', techCost: 58, bizValue: 258 },
  { month: 'Jun', techCost: 62, bizValue: 298 },
];

export default function BusinessMetrics() {
  const [viewMode, setViewMode] = useState<'metrics' | 'tco' | 'spectrum' | 'allocation'>('metrics');
  const { businessCases } = useGovernanceAggregator();

  // REAL portfolio business value from Plan business cases (computed.financials).
  const portfolio = useMemo(() => {
    const withFin = businessCases.filter(bc => bc.computed?.financials);
    if (!withFin.length) return null;
    const npv = withFin.reduce((s, bc) => s + (bc.computed!.financials.npv || 0), 0);
    const benefits = withFin.reduce((s, bc) => s + (bc.computed!.financials.total_benefits || 0), 0);
    const costs = withFin.reduce((s, bc) => s + (bc.computed!.financials.total_costs || 0), 0);
    const approved = businessCases.filter(bc => bc.status === 'Approved').length;
    const bcr = costs > 0 ? benefits / costs : 0;
    return { count: withFin.length, approved, npv, benefits, costs, bcr };
  }, [businessCases]);

  const totalHumanCost = TCO_DATA.reduce((s, t) => s + t.humanCost, 0);
  const totalAgentCost = TCO_DATA.reduce((s, t) => s + t.agentCost, 0);
  const totalSavings = totalHumanCost - totalAgentCost;
  const savingsPercent = Math.round((totalSavings / totalHumanCost) * 100);

  const avgCostReduction = Math.round(
    BUSINESS_METRICS.reduce((s, m) => s + ((m.baselineValue - m.currentValue) / m.baselineValue) * 100, 0) / BUSINESS_METRICS.length
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Business Metrics</h2>
          <p className="text-sm text-slate-500">Technical costs translated to business outcomes per AWS Well-Architected guidance</p>
        </div>
        <div className="flex items-center gap-2">
          {(['metrics', 'tco', 'spectrum', 'allocation'] as const).map(mode => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all capitalize ${
                viewMode === mode ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {mode === 'tco' ? 'TCO Analysis' : mode === 'spectrum' ? 'Collaboration TCO' : mode === 'allocation' ? 'Cost Allocation' : 'Business Metrics'}
            </button>
          ))}
        </div>
      </div>

      {/* Portfolio Business Value — LIVE from Plan business cases (real financials) */}
      <div className="rounded-xl border border-slate-200/60 shadow-sm bg-white/80 backdrop-blur-sm p-4">
        <div className="flex items-center gap-2 mb-3">
          <h3 className="text-sm font-semibold text-slate-900">Portfolio Business Value</h3>
          {portfolio ? <LiveDataBadge /> : <MockDataBadge integration="Create business cases in Plan to populate portfolio value" />}
          <span className="text-[11px] text-slate-400">from approved &amp; drafted Plan business cases</span>
          <Link to="/business-cases" className="ml-auto text-[11px] text-blue-600 hover:text-blue-700 font-medium">
            {portfolio ? 'Manage in Plan →' : 'Create in Plan →'}
          </Link>
        </div>
        {portfolio ? (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div><div className="text-2xl font-bold text-indigo-600">${(portfolio.npv / 1000).toFixed(0)}k</div><div className="text-[11px] text-slate-500">Portfolio NPV</div></div>
            <div><div className="text-2xl font-bold text-emerald-600">${(portfolio.benefits / 1000).toFixed(0)}k</div><div className="text-[11px] text-slate-500">Total benefits</div></div>
            <div><div className="text-2xl font-bold text-slate-900">${(portfolio.costs / 1000).toFixed(0)}k</div><div className="text-[11px] text-slate-500">Total costs</div></div>
            <div><div className="text-2xl font-bold text-slate-900">{portfolio.bcr.toFixed(2)}×</div><div className="text-[11px] text-slate-500">Benefit-cost ratio</div></div>
            <div><div className="text-2xl font-bold text-emerald-600">{portfolio.approved}<span className="text-sm text-slate-400">/{portfolio.count}</span></div><div className="text-[11px] text-slate-500">Approved cases</div></div>
          </div>
        ) : (
          <div className="text-[12px] text-slate-500 bg-slate-50 rounded-lg px-4 py-3">
            No business cases yet — the illustrative TCO &amp; business-metric models below show the shape. Create business cases in Plan to populate real portfolio NPV, benefits, and benefit-cost ratio here.
          </div>
        )}
      </div>

      {/* Stats Row — illustrative cost-translation models */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-4">
          <div className="text-2xl font-bold text-emerald-600">{avgCostReduction}%</div>
          <div className="text-xs text-slate-500">Avg Cost Reduction</div>
        </div>
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-4">
          <div className="text-2xl font-bold text-indigo-600">${(totalSavings / 1000).toFixed(0)}k</div>
          <div className="text-xs text-slate-500">Annual TCO Savings</div>
        </div>
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-4">
          <div className="text-2xl font-bold text-slate-900">{savingsPercent}%</div>
          <div className="text-xs text-slate-500">TCO Reduction</div>
        </div>
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-4">
          <div className="text-2xl font-bold text-violet-600">{BUSINESS_METRICS.length}</div>
          <div className="text-xs text-slate-500">Tracked Metrics</div>
        </div>
      </div>

      {/* AWS official FinOps point of view — frames every view */}
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-orange-100 text-orange-700">AWS</span>
          <h3 className="text-sm font-semibold text-slate-900">AWS point of view on agentic ROI &amp; value</h3>
          <a
            href="https://docs.aws.amazon.com/wellarchitected/latest/agentic-ai-lens/cost-optimization.html"
            target="_blank" rel="noopener noreferrer"
            className="text-[11px] text-blue-600 hover:text-blue-700 font-medium"
          >Well-Architected Agentic AI Lens →</a>
        </div>
        <p className="text-[11px] text-slate-500 max-w-4xl mb-4">
          AWS's Cost Optimization pillar (AGENTCOST05 &amp; 07) states that agent telemetry must be translated into <span className="font-medium text-slate-600">business</span> metrics so investment decisions are grounded in outcomes, not raw spend. The metrics below implement AWS's named measures and its chargeback/ROI best practice (AGENTCOST05-BP04).
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.4fr] gap-5">
          {/* AWS-named value metrics */}
          <div>
            <div className="text-[11px] font-semibold text-slate-700 uppercase tracking-wide mb-2">AWS-named value metrics</div>
            <div className="space-y-1.5">
              {AWS_VALUE_METRICS.map(v => (
                <div key={v.metric} className="flex items-center justify-between p-2 bg-slate-50 rounded-lg">
                  <span className="text-xs font-medium text-slate-800">{v.metric}</span>
                  <span className="text-[10px] text-slate-400">{v.source}</span>
                </div>
              ))}
            </div>
          </div>

          {/* AWS cost-maturity ladder */}
          <div>
            <div className="text-[11px] font-semibold text-slate-700 uppercase tracking-wide mb-2">
              AWS cost-visibility maturity (AGENTCOST05) · currently L{CURRENT_COST_MATURITY} {AWS_COST_MATURITY[CURRENT_COST_MATURITY - 1].name}
            </div>
            <div className="flex gap-1">
              {AWS_COST_MATURITY.map(m => (
                <div
                  key={m.level}
                  title={`${m.name}: ${m.hallmark}`}
                  className={`flex-1 rounded-lg px-2 py-2 text-center border ${
                    m.level === CURRENT_COST_MATURITY
                      ? 'bg-orange-50 border-orange-300'
                      : m.level < CURRENT_COST_MATURITY
                        ? 'bg-emerald-50 border-emerald-200'
                        : 'bg-white border-slate-200'
                  }`}
                >
                  <div className={`text-xs font-bold ${m.level <= CURRENT_COST_MATURITY ? 'text-slate-800' : 'text-slate-400'}`}>L{m.level}</div>
                  <div className={`text-[9px] ${m.level <= CURRENT_COST_MATURITY ? 'text-slate-600' : 'text-slate-400'}`}>{m.name}</div>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-slate-500 mt-1.5">{AWS_COST_MATURITY[CURRENT_COST_MATURITY - 1].hallmark}</p>
          </div>
        </div>
      </div>

      {viewMode === 'metrics' && (
        <>
          {/* Business Value vs Technical Cost Trend */}
          <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="text-sm font-semibold text-slate-900">Business Value vs Technical Cost ($k/month)</div>
              <div className="flex items-center gap-4 text-[11px]">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Business Value</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-rose-500" /> Technical Cost</span>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <ComposedChart data={MONTHLY_TREND}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="month" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v) => `$${v}k`} />
                <Bar dataKey="bizValue" fill="#10b981" radius={[4, 4, 0, 0]} name="Business Value" />
                <Line type="monotone" dataKey="techCost" stroke="#f43f5e" strokeWidth={2} dot={{ fill: '#f43f5e', r: 4 }} name="Technical Cost" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* Metric Translation Table */}
          <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <h3 className="text-sm font-semibold text-slate-900">Technical → Business Metric Translation</h3>
              <p className="text-xs text-slate-500 mt-1">Converting raw technical data into stakeholder-friendly metrics</p>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50/80 text-[11px] text-slate-500 uppercase tracking-wide">
                  <th scope="col" className="px-4 py-3 text-left font-medium">Business Metric</th>
                  <th scope="col" className="px-4 py-3 text-left font-medium">Technical Source</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Baseline</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Current</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Reduction</th>
                  <th scope="col" className="px-4 py-3 text-center font-medium">Trend</th>
                  <th scope="col" className="px-4 py-3 text-left font-medium">Business Unit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {BUSINESS_METRICS.map(metric => {
                  const reduction = ((metric.baselineValue - metric.currentValue) / metric.baselineValue) * 100;
                  return (
                    <tr key={metric.id} className="hover:bg-slate-50/40">
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900">{metric.name}</div>
                        <div className="text-[10px] text-slate-500">{metric.businessMetric}</div>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">{metric.technicalMetric}</td>
                      <td className="px-4 py-3 text-right font-medium text-slate-400 line-through">
                        ${metric.baselineValue.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-emerald-600">
                        ${metric.currentValue.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-2 py-1 rounded">
                          -{reduction.toFixed(0)}%
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-lg ${
                          metric.trend === 'improving' ? 'text-emerald-500' :
                          metric.trend === 'declining' ? 'text-red-500' : 'text-slate-400'
                        }`}>
                          {metric.trend === 'improving' ? '↗' : metric.trend === 'declining' ? '↘' : '→'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs px-2 py-1 bg-slate-100 rounded text-slate-600">
                          {metric.businessUnit}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {viewMode === 'tco' && (
        <>
          {/* TCO Summary */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-gradient-to-br from-slate-600 to-slate-800 rounded-xl p-5 text-white">
              <div className="text-xs text-slate-300 mb-1">Human-Led TCO (Annual)</div>
              <div className="text-3xl font-bold">${(totalHumanCost / 1000).toFixed(0)}k</div>
              <div className="text-xs text-slate-400 mt-2">Baseline operational cost</div>
            </div>
            <div className="bg-gradient-to-br from-indigo-600 to-violet-700 rounded-xl p-5 text-white">
              <div className="text-xs text-indigo-200 mb-1">Agent-Led TCO (Annual)</div>
              <div className="text-3xl font-bold">${(totalAgentCost / 1000).toFixed(0)}k</div>
              <div className="text-xs text-indigo-300 mt-2">All-in AI operational cost</div>
            </div>
            <div className="bg-gradient-to-br from-emerald-600 to-teal-700 rounded-xl p-5 text-white">
              <div className="text-xs text-emerald-200 mb-1">Net Annual Savings</div>
              <div className="text-3xl font-bold">${(totalSavings / 1000).toFixed(0)}k</div>
              <div className="text-xs text-emerald-300 mt-2">{savingsPercent}% cost reduction</div>
            </div>
          </div>

          {/* TCO Breakdown Chart */}
          <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5">
            <div className="text-sm font-semibold text-slate-900 mb-4">TCO Component Comparison</div>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={TCO_DATA} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 10 }} tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} />
                <YAxis type="category" dataKey="category" tick={{ fill: '#475569', fontSize: 11 }} width={140} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v) => `$${Number(v).toLocaleString()}`} />
                <Bar dataKey="humanCost" fill="#64748b" name="Human-Led Cost" radius={[0, 4, 4, 0]} />
                <Bar dataKey="agentCost" fill="#6366f1" name="Agent-Led Cost" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* TCO Detail Table */}
          <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50/80 text-[11px] text-slate-500 uppercase tracking-wide">
                  <th scope="col" className="px-4 py-3 text-left font-medium">Cost Category</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Human-Led</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Agent-Led</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Savings / (Cost)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {TCO_DATA.map(row => (
                  <tr key={row.category} className="hover:bg-slate-50/40">
                    <td className="px-4 py-3 font-medium text-slate-900">{row.category}</td>
                    <td className="px-4 py-3 text-right text-slate-600 tabular-nums">${row.humanCost.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right text-slate-600 tabular-nums">${row.agentCost.toLocaleString()}</td>
                    <td className={`px-4 py-3 text-right font-semibold tabular-nums ${row.savings >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      {row.savings >= 0 ? '+' : ''}{row.savings < 0 ? `(${Math.abs(row.savings).toLocaleString()})` : `$${row.savings.toLocaleString()}`}
                    </td>
                  </tr>
                ))}
                <tr className="bg-slate-50/80 font-semibold">
                  <td className="px-4 py-3 text-slate-900">Total</td>
                  <td className="px-4 py-3 text-right text-slate-900 tabular-nums">${totalHumanCost.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right text-slate-900 tabular-nums">${totalAgentCost.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right text-emerald-600 tabular-nums">+${totalSavings.toLocaleString()}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}

      {viewMode === 'spectrum' && (() => {
        const totalTransition = TRANSITION_COSTS.reduce((s, t) => s + t.oneTime, 0);
        const withStack = SPECTRUM.map(s => ({
          ...s,
          total: s.laborCost + s.oversightCost + s.agentRunCost,
        }));
        const human = withStack[0];
        // Cheapest operating model by total annual cost (excludes one-time transition).
        const cheapest = withStack.reduce((a, b) => (b.total < a.total ? b : a));
        // Best value-per-dollar (valueIndex / total).
        const bestValue = withStack.reduce((a, b) =>
          (b.valueIndex / b.total > a.valueIndex / a.total ? b : a));

        // Multi-year migration: year 0 adds the one-time transition build on top of
        // that year's operating-model annual cost; the model climbs the ladder.
        const byLevel: Record<string, typeof withStack[number]> = Object.fromEntries(withStack.map(s => [s.level, s]));
        const migration = MIGRATION_PATH_LEVELS.map((lvl, yr) => {
          const om = byLevel[lvl];
          const annual = om.total;
          const agentTotal = annual + (yr === 0 ? totalTransition : 0);
          return {
            year: `Y${yr}`,
            level: lvl,
            'Human-Led (baseline)': human.total,
            'Agent path (all-in)': agentTotal,
            value: om.valueIndex,
          };
        });
        // Cumulative crossover: where cumulative agent spend drops below cumulative human spend.
        let cumHuman = 0, cumAgent = 0, paybackYear: string | null = null;
        migration.forEach(m => {
          cumHuman += m['Human-Led (baseline)'];
          cumAgent += m['Agent path (all-in)'];
          if (paybackYear === null && cumAgent <= cumHuman) paybackYear = m.year;
        });

        return (
        <>
          {/* Reframe callout */}
          <div className="bg-indigo-50/70 border border-indigo-200 rounded-xl p-4">
            <div className="text-sm font-semibold text-indigo-900 mb-1">TCO is a collaboration spectrum, not a switch</div>
            <p className="text-[12px] text-indigo-800/90">
              Moving from human-led to agent-led isn't binary. Along the autonomy scoping matrix (L1→L4) the operating model shifts — agent-assisted human → human-assisted agent → autonomous — and each carries a full cost stack (labor + oversight + agent run-cost) plus one-time transition investment. The hybrid middle is often the costliest per unit before autonomy is earned; "agent = $0" and "human = $0 once automated" are both false.
            </p>
          </div>

          {/* Summary tiles */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-4">
              <div className="text-2xl font-bold text-slate-700">${(human.total / 1000).toFixed(0)}k</div>
              <div className="text-xs text-slate-500">Human-Led (annual, L0)</div>
            </div>
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-4">
              <div className="text-2xl font-bold text-indigo-600">${(totalTransition / 1000).toFixed(0)}k</div>
              <div className="text-xs text-slate-500">One-time transition build</div>
            </div>
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-4">
              <div className="text-2xl font-bold text-emerald-600">${(cheapest.total / 1000).toFixed(0)}k</div>
              <div className="text-xs text-slate-500">Lowest annual ({cheapest.level} {cheapest.model})</div>
            </div>
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-4">
              <div className="text-2xl font-bold text-violet-600">{paybackYear ?? '>Y4'}</div>
              <div className="text-xs text-slate-500">Cumulative payback</div>
            </div>
          </div>

          {/* Cost stack + value across the spectrum */}
          <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="text-sm font-semibold text-slate-900">Annual Cost Stack &amp; Value Across the Collaboration Spectrum</div>
              <div className="flex items-center gap-3 text-[11px]">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-slate-500" /> Human Labor</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-amber-500" /> Oversight (HITL)</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-indigo-500" /> Agent Run-Cost</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Value Index</span>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart data={withStack} margin={{ left: 8, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="model" tick={{ fill: '#475569', fontSize: 10 }} interval={0} />
                <YAxis yAxisId="cost" tick={{ fill: '#94a3b8', fontSize: 10 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                <YAxis yAxisId="value" orientation="right" tick={{ fill: '#10b981', fontSize: 10 }} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v, n) => n === 'Value Index' ? `${v}` : `$${Number(v).toLocaleString()}`} />
                <Bar yAxisId="cost" dataKey="laborCost" stackId="c" fill="#64748b" name="Human Labor" />
                <Bar yAxisId="cost" dataKey="oversightCost" stackId="c" fill="#f59e0b" name="Oversight (HITL)" />
                <Bar yAxisId="cost" dataKey="agentRunCost" stackId="c" fill="#6366f1" radius={[4, 4, 0, 0]} name="Agent Run-Cost" />
                <Line yAxisId="value" type="monotone" dataKey="valueIndex" stroke="#10b981" strokeWidth={2} dot={{ fill: '#10b981', r: 4 }} name="Value Index" />
              </ComposedChart>
            </ResponsiveContainer>
            <p className="text-[11px] text-slate-500 mt-2">
              Note the amber Oversight band: it peaks in the hybrid states (agent-assisted / human-assisted) and shrinks as the agent earns autonomy — the same earned-autonomy curve Govern tracks. Best value-per-dollar: <span className="font-semibold text-slate-700">{bestValue.level} {bestValue.model}</span>.
            </p>
          </div>

          {/* Multi-year migration path with crossover */}
          <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="text-sm font-semibold text-slate-900">Migration Path: All-In Agent Cost vs Human-Led Baseline</div>
              <div className="flex items-center gap-3 text-[11px]">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-slate-500" /> Human-Led</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-indigo-500" /> Agent path (all-in)</span>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={240}>
              <ComposedChart data={migration} margin={{ left: 8, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="year" tick={{ fill: '#475569', fontSize: 11 }} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v) => `$${Number(v).toLocaleString()}`} />
                <Line type="monotone" dataKey="Human-Led (baseline)" stroke="#64748b" strokeWidth={2} strokeDasharray="5 4" dot={{ fill: '#64748b', r: 3 }} />
                <Line type="monotone" dataKey="Agent path (all-in)" stroke="#6366f1" strokeWidth={2} dot={{ fill: '#6366f1', r: 4 }} />
              </ComposedChart>
            </ResponsiveContainer>
            <p className="text-[11px] text-slate-500 mt-2">
              Year 0 carries the ${(totalTransition / 1000).toFixed(0)}k one-time transition build (agent path spikes above baseline), then bends down as the use case climbs {MIGRATION_PATH_LEVELS.join(' → ')}. Cumulative payback at <span className="font-semibold text-slate-700">{paybackYear ?? 'beyond Y4'}</span> — not an instant drop to zero.
            </p>
          </div>

          {/* Spectrum detail table */}
          <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <h3 className="text-sm font-semibold text-slate-900">Operating Models Along the Autonomy Scoping Matrix</h3>
              <p className="text-xs text-slate-500 mt-1">Each stage carries labor + oversight + agent run-cost. Value indexed to human-led = 100.</p>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50/80 text-[11px] text-slate-500 uppercase tracking-wide">
                  <th scope="col" className="px-4 py-3 text-left font-medium">Level · Model</th>
                  <th scope="col" className="px-4 py-3 text-left font-medium">Who leads</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Labor</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Oversight</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Agent Run</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Annual Total</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {withStack.map(s => (
                  <tr key={s.level} className="hover:bg-slate-50/40">
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900"><span className="text-[10px] font-bold text-indigo-600 mr-1">{s.level}</span>{s.model}</div>
                      <div className="text-[10px] text-slate-500 max-w-md">{s.note}</div>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">{s.who}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-600">${(s.laborCost / 1000).toFixed(0)}k</td>
                    <td className="px-4 py-3 text-right tabular-nums text-amber-600">${(s.oversightCost / 1000).toFixed(0)}k</td>
                    <td className="px-4 py-3 text-right tabular-nums text-indigo-600">${(s.agentRunCost / 1000).toFixed(0)}k</td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold text-slate-900">${(s.total / 1000).toFixed(0)}k</td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold text-emerald-600">{s.valueIndex}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* One-time transition cost breakdown */}
          <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5">
            <div className="text-sm font-semibold text-slate-900 mb-1">One-Time Transition Investment</div>
            <p className="text-[11px] text-slate-500 mb-4">The cost to discover, build, integrate, and validate the agent path — incurred before any run-rate savings. Total ${(totalTransition / 1000).toFixed(0)}k.</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {TRANSITION_COSTS.map(t => (
                <div key={t.phase} className="border border-slate-100 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold text-slate-700">{t.phase}</span>
                    <span className="text-xs font-bold text-indigo-600">${(t.oneTime / 1000).toFixed(0)}k</span>
                  </div>
                  <div className="text-[10px] text-slate-500">{t.detail}</div>
                </div>
              ))}
            </div>
          </div>
        </>
        );
      })()}

      {viewMode === 'allocation' && (
        <>
          {/* Cost Allocation by Business Unit */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5">
              <div className="text-sm font-semibold text-slate-900 mb-4">Cost Allocation by Business Unit</div>
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie
                    data={COST_BY_BU}
                    dataKey="cost"
                    nameKey="bu"
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={90}
                    paddingAngle={2}
                  >
                    {COST_BY_BU.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} formatter={(v) => `$${Number(v).toLocaleString()}`} />
                </PieChart>
              </ResponsiveContainer>
              <div className="grid grid-cols-2 gap-2 mt-4">
                {COST_BY_BU.map(bu => (
                  <div key={bu.bu} className="flex items-center gap-2 text-xs">
                    <div className="w-3 h-3 rounded" style={{ backgroundColor: bu.color }} />
                    <span className="text-slate-600 flex-1">{bu.bu}</span>
                    <span className="font-semibold text-slate-900">${bu.cost.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5">
              <div className="text-sm font-semibold text-slate-900 mb-2">Tag-Based Cost Allocation</div>
              <p className="text-xs text-slate-500 mb-4">
                Use business dimension tags across all agent resources for granular AWS Cost Explorer reporting.
              </p>

              <div className="space-y-3">
                <div className="p-3 bg-slate-50 rounded-lg">
                  <div className="text-xs font-semibold text-slate-700 mb-2">Recommended Tags</div>
                  <div className="flex flex-wrap gap-2">
                    {['business-unit', 'product-line', 'customer-segment', 'agent-name', 'use-case', 'cost-center'].map(tag => (
                      <span key={tag} className="text-[10px] px-2 py-1 bg-indigo-100 text-indigo-700 rounded font-mono">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="p-3 bg-slate-50 rounded-lg">
                  <div className="text-xs font-semibold text-slate-700 mb-2">Dual Dashboard Strategy</div>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="p-2 bg-white rounded border border-slate-200">
                      <div className="font-medium text-slate-900">Engineering</div>
                      <div className="text-slate-500">CloudWatch metrics, token usage, latency</div>
                    </div>
                    <div className="p-2 bg-white rounded border border-slate-200">
                      <div className="font-medium text-slate-900">Executive</div>
                      <div className="text-slate-500">QuickSight ROI dashboards, chargeback</div>
                    </div>
                  </div>
                </div>

                <div className="p-3 bg-amber-50 rounded-lg border border-amber-200">
                  <div className="text-xs font-semibold text-amber-800 mb-1">Anti-Pattern Warning</div>
                  <ul className="text-[10px] text-amber-700 space-y-1">
                    <li>• Reporting only raw technical metrics without business context</li>
                    <li>• Presenting agent costs without manual process comparison</li>
                    <li>• Restricting cost data to engineering teams only</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
