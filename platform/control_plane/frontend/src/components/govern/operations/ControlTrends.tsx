/**
 * ControlTrends - Historical Trend Visualization for Control Effectiveness
 *
 * Visualizes control effectiveness over time with:
 * - Compliance score line chart over quarters
 * - Tests passed vs failed area chart
 * - Findings by quarter stacked bar chart
 * - Design vs Operating effectiveness comparison
 * - Heatmap grid: Controls x Quarters effectiveness
 * - Period selector and filtering
 * - Improvement/degradation indicators
 * - YoY comparison statistics
 * - Drill-down to specific period details
 */

import { useState, useMemo } from 'react';
import {
  LineChart, Line, BarChart, Bar, AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend, ComposedChart,
} from 'recharts';
import { Icon } from '../icons';
import { MockDataBadge } from '../DataSourceIndicator';
import Drawer from '../Drawer';

// ============================================================================
// Types
// ============================================================================

type EffectivenessRating = 'effective' | 'partially-effective' | 'ineffective' | 'not-tested';
type ControlCategory = 'platform' | 'policy' | 'guardrail' | 'custom';
type PeriodFilter = 'last-4q' | 'last-year' | 'all-time';

interface TrendDataPoint {
  period: string;
  controlId: string;
  designEffectiveness: EffectivenessRating;
  operatingEffectiveness: EffectivenessRating;
  testsPassed: number;
  testsFailed: number;
  incidentsBlocked: number;
  incidentsMissed: number;
  findingsOpen: number;
  findingsClosed: number;
  remediationDays: number;
  complianceScore: number;
}

interface Control {
  id: string;
  name: string;
  category: ControlCategory;
  owner: string;
}

interface Agent {
  id: string;
  name: string;
}

// ============================================================================
// Styling Constants
// ============================================================================

const EFFECTIVENESS_CONFIG: Record<EffectivenessRating, { bg: string; text: string; label: string; score: number; color: string }> = {
  'effective': { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'Effective', score: 3, color: '#10b981' },
  'partially-effective': { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Partial', score: 2, color: '#f59e0b' },
  'ineffective': { bg: 'bg-rose-100', text: 'text-rose-700', label: 'Ineffective', score: 1, color: '#ef4444' },
  'not-tested': { bg: 'bg-slate-100', text: 'text-slate-500', label: 'Not Tested', score: 0, color: '#94a3b8' },
};

const CATEGORY_CONFIG: Record<ControlCategory, { bg: string; text: string; label: string }> = {
  platform: { bg: 'bg-indigo-100', text: 'text-indigo-700', label: 'Platform' },
  policy: { bg: 'bg-violet-100', text: 'text-violet-700', label: 'Policy' },
  guardrail: { bg: 'bg-cyan-100', text: 'text-cyan-700', label: 'Guardrail' },
  custom: { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'Custom' },
};

const tooltipStyle = {
  contentStyle: { backgroundColor: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '12px' },
  labelStyle: { color: '#64748b', marginBottom: '4px' },
};

// ============================================================================
// Mock Data
// ============================================================================

// Trailing four quarters ending with the current quarter. Labels are derived
// from today's date so the demo data is never anchored to a stale year.
function buildQuarterLabels(): string[] {
  const now = new Date();
  const currentQuarter = Math.floor(now.getMonth() / 3); // 0-3
  const currentYear = now.getFullYear();
  const labels: string[] = [];
  for (let offset = 3; offset >= 0; offset--) {
    let q = currentQuarter - offset;
    let year = currentYear;
    while (q < 0) {
      q += 4;
      year -= 1;
    }
    labels.push(`Q${q + 1} ${year}`);
  }
  return labels;
}

const PERIODS = buildQuarterLabels();

const MOCK_CONTROLS: Control[] = [
  { id: 'ctrl-plat-001', name: 'Model Invocation Logging', category: 'platform', owner: 'Platform Team' },
  { id: 'ctrl-plat-002', name: 'IAM Role Boundary', category: 'platform', owner: 'Security Team' },
  { id: 'ctrl-plat-003', name: 'Network Isolation', category: 'platform', owner: 'Infrastructure Team' },
  { id: 'ctrl-plat-004', name: 'Secrets Management', category: 'platform', owner: 'Security Team' },
  { id: 'ctrl-pol-001', name: 'Human-in-the-Loop Decisions', category: 'policy', owner: 'Risk Management' },
  { id: 'ctrl-pol-002', name: 'Model Drift Detection', category: 'policy', owner: 'ML Ops Team' },
  { id: 'ctrl-pol-003', name: 'Data Retention Policy', category: 'policy', owner: 'Privacy Team' },
  { id: 'ctrl-gr-001', name: 'PII Detection and Masking', category: 'guardrail', owner: 'Privacy Team' },
  { id: 'ctrl-gr-002', name: 'Prompt Injection Defense', category: 'guardrail', owner: 'Security Team' },
  { id: 'ctrl-gr-003', name: 'Topic Restriction', category: 'guardrail', owner: 'Compliance Team' },
  { id: 'ctrl-gr-005', name: 'Output Grounding Validation', category: 'guardrail', owner: 'ML Ops Team' },
  { id: 'ctrl-cust-001', name: 'Claims Amount Threshold', category: 'custom', owner: 'Claims Operations' },
];

const MOCK_AGENTS: Agent[] = [
  { id: 'agent-001', name: 'Claims Processing Agent' },
  { id: 'agent-002', name: 'Customer Service Bot' },
  { id: 'agent-003', name: 'Fraud Detection Agent' },
  { id: 'agent-004', name: 'Document Summarizer' },
  { id: 'agent-005', name: 'Underwriting Assistant' },
];

// Deterministic pseudo-random value in [0, 1) from an integer seed. Using a
// stable hash (not Math.random) keeps the demo trend data identical across
// reloads, so derived figures like YoY deltas don't shift on every refresh.
function seededUnit(seed: number): number {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

// Generate realistic trend data with improvement/degradation patterns
function generateTrendData(): TrendDataPoint[] {
  const data: TrendDataPoint[] = [];

  // Define improvement/degradation patterns for each control
  const patterns: Record<string, { improving: boolean; baseScore: number }> = {
    'ctrl-plat-001': { improving: true, baseScore: 85 },
    'ctrl-plat-002': { improving: true, baseScore: 88 },
    'ctrl-plat-003': { improving: true, baseScore: 90 },
    'ctrl-plat-004': { improving: true, baseScore: 92 },
    'ctrl-pol-001': { improving: true, baseScore: 75 },
    'ctrl-pol-002': { improving: false, baseScore: 78 }, // Degrading
    'ctrl-pol-003': { improving: true, baseScore: 82 },
    'ctrl-gr-001': { improving: true, baseScore: 95 },
    'ctrl-gr-002': { improving: true, baseScore: 88 },
    'ctrl-gr-003': { improving: false, baseScore: 72 }, // Degrading
    'ctrl-gr-005': { improving: true, baseScore: 55 }, // Improving from low
    'ctrl-cust-001': { improving: true, baseScore: 80 },
  };

  MOCK_CONTROLS.forEach((control, controlIdx) => {
    const pattern = patterns[control.id] || { improving: true, baseScore: 80 };

    PERIODS.forEach((period, quarterIdx) => {
      // Stable per-(control, quarter) seed; distinct salts give independent
      // deterministic values in place of the original Math.random() calls.
      const seedBase = controlIdx * 37 + quarterIdx * 101;
      const rand = (salt: number) => seededUnit(seedBase + salt);

      // Calculate score with trend
      const trendFactor = pattern.improving ? quarterIdx * 4 : -quarterIdx * 3;
      const baseScore = Math.min(100, Math.max(40, pattern.baseScore + trendFactor + (rand(1) - 0.5) * 10));
      const complianceScore = Math.round(baseScore);

      // Map score to effectiveness
      let designEff: EffectivenessRating;
      let operatingEff: EffectivenessRating;

      if (complianceScore >= 85) {
        designEff = 'effective';
        operatingEff = complianceScore >= 90 ? 'effective' : 'partially-effective';
      } else if (complianceScore >= 65) {
        designEff = 'partially-effective';
        operatingEff = complianceScore >= 75 ? 'partially-effective' : 'ineffective';
      } else {
        designEff = 'ineffective';
        operatingEff = 'ineffective';
      }

      // Generate test results based on score
      const totalTests = 10 + Math.floor(rand(2) * 10);
      const passRate = complianceScore / 100;
      const testsPassed = Math.round(totalTests * passRate);
      const testsFailed = totalTests - testsPassed;

      // Generate findings (inverse correlation with score)
      const findingsOpen = Math.max(0, Math.round((100 - complianceScore) / 10 + (rand(3) - 0.5) * 3));
      const findingsClosed = Math.max(0, Math.round(findingsOpen * (0.5 + rand(4) * 0.5)));

      // Incidents blocked/missed
      const incidentsBlocked = Math.round(5 + rand(5) * 10);
      const incidentsMissed = Math.max(0, Math.round((100 - complianceScore) / 20 * rand(6)));

      // Remediation days (lower is better, correlates with score)
      const remediationDays = Math.max(1, Math.round(30 - complianceScore / 4 + (rand(7) - 0.5) * 10));

      data.push({
        period,
        controlId: control.id,
        designEffectiveness: designEff,
        operatingEffectiveness: operatingEff,
        testsPassed,
        testsFailed,
        incidentsBlocked,
        incidentsMissed,
        findingsOpen,
        findingsClosed,
        remediationDays,
        complianceScore,
      });
    });
  });

  return data;
}

const MOCK_TREND_DATA = generateTrendData();

// ============================================================================
// Helper Components
// ============================================================================

function TrendIndicator({ currentValue, previousValue, inverse = false }: {
  currentValue: number;
  previousValue: number;
  inverse?: boolean;
}) {
  if (previousValue === 0) return null;

  const change = ((currentValue - previousValue) / previousValue) * 100;
  const isPositive = inverse ? change < 0 : change > 0;
  const absChange = Math.abs(change);

  if (absChange < 0.5) {
    return <span className="text-xs text-slate-400">--</span>;
  }

  return (
    <span className={`flex items-center gap-0.5 text-xs font-medium ${isPositive ? 'text-emerald-600' : 'text-rose-600'}`}>
      <Icon
        name={isPositive ? 'arrow-trending-up' : 'arrow-trending-down'}
        className="w-3.5 h-3.5"
      />
      {absChange.toFixed(1)}%
    </span>
  );
}

function EffectivenessCell({ rating }: { rating: EffectivenessRating }) {
  const config = EFFECTIVENESS_CONFIG[rating];
  return (
    <span className={`inline-flex items-center justify-center w-8 h-8 rounded-lg ${config.bg}`}>
      <Icon
        name={rating === 'effective' ? 'check' : rating === 'partially-effective' ? 'minus' : rating === 'ineffective' ? 'x-mark' : 'circle'}
        className={`w-4 h-4 ${config.text}`}
      />
    </span>
  );
}

// ============================================================================
// Chart Components
// ============================================================================

function ComplianceScoreChart({ data }: { data: TrendDataPoint[] }) {
  const chartData = useMemo(() => {
    const periods = PERIODS;

    return periods.map(period => {
      const periodData = data.filter(d => d.period === period);
      const avgScore = periodData.reduce((sum, d) => sum + d.complianceScore, 0) / periodData.length;

      return {
        period,
        avgScore: Math.round(avgScore * 10) / 10,
        minScore: Math.min(...periodData.map(d => d.complianceScore)),
        maxScore: Math.max(...periodData.map(d => d.complianceScore)),
      };
    });
  }, [data]);

  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-4">
      <h3 className="text-sm font-semibold text-slate-900 mb-4">Compliance Score Trend</h3>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="period" tick={{ fontSize: 11 }} stroke="#94a3b8" />
            <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} stroke="#94a3b8" />
            <Tooltip {...tooltipStyle} formatter={(value) => `${value}%`} />
            <Legend wrapperStyle={{ fontSize: '11px' }} />
            <Area
              type="monotone"
              dataKey="maxScore"
              name="Max"
              fill="#10b98120"
              stroke="transparent"
              fillOpacity={0.3}
            />
            <Area
              type="monotone"
              dataKey="minScore"
              name="Min"
              fill="#ffffff"
              stroke="transparent"
            />
            <Line
              type="monotone"
              dataKey="avgScore"
              name="Average Score"
              stroke="#3b82f6"
              strokeWidth={3}
              dot={{ fill: '#3b82f6', strokeWidth: 2 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function TestResultsChart({ data }: { data: TrendDataPoint[] }) {
  const chartData = useMemo(() => {
    const periods = PERIODS;

    return periods.map(period => {
      const periodData = data.filter(d => d.period === period);
      return {
        period,
        passed: periodData.reduce((sum, d) => sum + d.testsPassed, 0),
        failed: periodData.reduce((sum, d) => sum + d.testsFailed, 0),
      };
    });
  }, [data]);

  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-4">
      <h3 className="text-sm font-semibold text-slate-900 mb-4">Tests Passed vs Failed</h3>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="period" tick={{ fontSize: 11 }} stroke="#94a3b8" />
            <YAxis tick={{ fontSize: 10 }} stroke="#94a3b8" />
            <Tooltip {...tooltipStyle} />
            <Legend wrapperStyle={{ fontSize: '11px' }} />
            <Area
              type="monotone"
              dataKey="passed"
              name="Tests Passed"
              stackId="1"
              fill="#10b981"
              stroke="#10b981"
              fillOpacity={0.8}
            />
            <Area
              type="monotone"
              dataKey="failed"
              name="Tests Failed"
              stackId="1"
              fill="#ef4444"
              stroke="#ef4444"
              fillOpacity={0.8}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function FindingsChart({ data }: { data: TrendDataPoint[] }) {
  const chartData = useMemo(() => {
    const periods = PERIODS;

    return periods.map(period => {
      const periodData = data.filter(d => d.period === period);
      return {
        period,
        open: periodData.reduce((sum, d) => sum + d.findingsOpen, 0),
        closed: periodData.reduce((sum, d) => sum + d.findingsClosed, 0),
      };
    });
  }, [data]);

  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-4">
      <h3 className="text-sm font-semibold text-slate-900 mb-4">Findings by Quarter</h3>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="period" tick={{ fontSize: 11 }} stroke="#94a3b8" />
            <YAxis tick={{ fontSize: 10 }} stroke="#94a3b8" />
            <Tooltip {...tooltipStyle} />
            <Legend wrapperStyle={{ fontSize: '11px' }} />
            <Bar dataKey="open" name="Open Findings" stackId="a" fill="#f97316" radius={[0, 0, 0, 0]} />
            <Bar dataKey="closed" name="Closed Findings" stackId="a" fill="#10b981" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function EffectivenessComparisonChart({ data }: { data: TrendDataPoint[] }) {
  const chartData = useMemo(() => {
    const periods = PERIODS;

    return periods.map(period => {
      const periodData = data.filter(d => d.period === period);

      const designScore = periodData.reduce((sum, d) =>
        sum + EFFECTIVENESS_CONFIG[d.designEffectiveness].score, 0) / periodData.length;
      const operatingScore = periodData.reduce((sum, d) =>
        sum + EFFECTIVENESS_CONFIG[d.operatingEffectiveness].score, 0) / periodData.length;

      return {
        period,
        design: Math.round((designScore / 3) * 100),
        operating: Math.round((operatingScore / 3) * 100),
      };
    });
  }, [data]);

  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-4">
      <h3 className="text-sm font-semibold text-slate-900 mb-4">Design vs Operating Effectiveness</h3>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="period" tick={{ fontSize: 11 }} stroke="#94a3b8" />
            <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} stroke="#94a3b8" />
            <Tooltip {...tooltipStyle} formatter={(value) => `${value}%`} />
            <Legend wrapperStyle={{ fontSize: '11px' }} />
            <Line
              type="monotone"
              dataKey="design"
              name="Design Effectiveness"
              stroke="#8b5cf6"
              strokeWidth={2}
              dot={{ fill: '#8b5cf6' }}
            />
            <Line
              type="monotone"
              dataKey="operating"
              name="Operating Effectiveness"
              stroke="#06b6d4"
              strokeWidth={2}
              dot={{ fill: '#06b6d4' }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function EffectivenessHeatmap({
  data,
  controls,
  onCellClick,
}: {
  data: TrendDataPoint[];
  controls: Control[];
  onCellClick: (controlId: string, period: string) => void;
}) {
  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100">
        <h3 className="text-sm font-semibold text-slate-900">Control Effectiveness Heatmap</h3>
        <p className="text-xs text-slate-500 mt-0.5">Click any cell to view period details</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-slate-50/50">
              <th className="text-left py-2.5 px-3 font-medium text-slate-600 sticky left-0 bg-slate-50/50 min-w-[200px]">
                Control
              </th>
              <th className="text-center py-2.5 px-2 font-medium text-slate-600 min-w-[60px]">Cat</th>
              {PERIODS.map(period => (
                <th key={period} className="text-center py-2.5 px-3 font-medium text-slate-600 min-w-[80px]">
                  {period}
                </th>
              ))}
              <th className="text-center py-2.5 px-3 font-medium text-slate-600 min-w-[80px]">Trend</th>
            </tr>
          </thead>
          <tbody>
            {controls.map(control => {
              const controlData = data.filter(d => d.controlId === control.id);
              const catConfig = CATEGORY_CONFIG[control.category];

              const firstPeriod = controlData.find(d => d.period === PERIODS[0]);
              const lastPeriod = controlData.find(d => d.period === PERIODS[PERIODS.length - 1]);
              const scoreDiff = lastPeriod && firstPeriod
                ? lastPeriod.complianceScore - firstPeriod.complianceScore
                : 0;

              return (
                <tr key={control.id} className="border-t border-slate-100 hover:bg-slate-50/50">
                  <td className="py-2 px-3 sticky left-0 bg-white">
                    <div className="font-medium text-slate-800 truncate max-w-[200px]" title={control.name}>
                      {control.name}
                    </div>
                  </td>
                  <td className="py-2 px-2 text-center">
                    <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${catConfig.bg} ${catConfig.text}`}>
                      {catConfig.label.slice(0, 4)}
                    </span>
                  </td>
                  {PERIODS.map(period => {
                    const periodData = controlData.find(d => d.period === period);
                    if (!periodData) return <td key={period} className="py-2 px-3 text-center">-</td>;

                    return (
                      <td key={period} className="py-2 px-3 text-center">
                        <button
                          onClick={() => onCellClick(control.id, period)}
                          className="group relative"
                        >
                          <EffectivenessCell rating={periodData.operatingEffectiveness} />
                          <span className="absolute -top-8 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
                            Score: {periodData.complianceScore}%
                          </span>
                        </button>
                      </td>
                    );
                  })}
                  <td className="py-2 px-3 text-center">
                    <span className={`flex items-center justify-center gap-1 text-xs font-semibold ${
                      scoreDiff > 5 ? 'text-emerald-600' :
                      scoreDiff < -5 ? 'text-rose-600' :
                      'text-slate-400'
                    }`}>
                      {scoreDiff > 5 && <Icon name="arrow-trending-up" className="w-4 h-4" />}
                      {scoreDiff < -5 && <Icon name="arrow-trending-down" className="w-4 h-4" />}
                      {scoreDiff > 0 ? '+' : ''}{scoreDiff.toFixed(0)}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="px-4 py-3 bg-slate-50 border-t border-slate-100 flex items-center gap-4 text-xs">
        <span className="text-slate-500">Legend:</span>
        <span className="flex items-center gap-1">
          <span className="w-4 h-4 rounded bg-emerald-100 inline-flex items-center justify-center">
            <Icon name="check" className="w-2.5 h-2.5 text-emerald-700" />
          </span>
          Effective
        </span>
        <span className="flex items-center gap-1">
          <span className="w-4 h-4 rounded bg-amber-100 inline-flex items-center justify-center">
            <Icon name="minus" className="w-2.5 h-2.5 text-amber-700" />
          </span>
          Partial
        </span>
        <span className="flex items-center gap-1">
          <span className="w-4 h-4 rounded bg-rose-100 inline-flex items-center justify-center">
            <Icon name="x-mark" className="w-2.5 h-2.5 text-rose-700" />
          </span>
          Ineffective
        </span>
      </div>
    </div>
  );
}

// ============================================================================
// YoY Comparison Component
// ============================================================================

function YoYComparison({ data }: { data: TrendDataPoint[] }) {
  const stats = useMemo(() => {
    // Compare the earliest vs the latest quarter in the trailing window.
    const q1Data = data.filter(d => d.period === PERIODS[0]);
    const q4Data = data.filter(d => d.period === PERIODS[PERIODS.length - 1]);

    const avgScoreQ1 = q1Data.reduce((sum, d) => sum + d.complianceScore, 0) / q1Data.length;
    const avgScoreQ4 = q4Data.reduce((sum, d) => sum + d.complianceScore, 0) / q4Data.length;

    const testsPassedQ1 = q1Data.reduce((sum, d) => sum + d.testsPassed, 0);
    const testsPassedQ4 = q4Data.reduce((sum, d) => sum + d.testsPassed, 0);

    const testsFailedQ1 = q1Data.reduce((sum, d) => sum + d.testsFailed, 0);
    const testsFailedQ4 = q4Data.reduce((sum, d) => sum + d.testsFailed, 0);

    const findingsOpenQ1 = q1Data.reduce((sum, d) => sum + d.findingsOpen, 0);
    const findingsOpenQ4 = q4Data.reduce((sum, d) => sum + d.findingsOpen, 0);

    const avgRemediationQ1 = q1Data.reduce((sum, d) => sum + d.remediationDays, 0) / q1Data.length;
    const avgRemediationQ4 = q4Data.reduce((sum, d) => sum + d.remediationDays, 0) / q4Data.length;

    const effectiveCountQ1 = q1Data.filter(d => d.operatingEffectiveness === 'effective').length;
    const effectiveCountQ4 = q4Data.filter(d => d.operatingEffectiveness === 'effective').length;

    return {
      avgScore: { q1: avgScoreQ1, q4: avgScoreQ4 },
      testsPassed: { q1: testsPassedQ1, q4: testsPassedQ4 },
      testsFailed: { q1: testsFailedQ1, q4: testsFailedQ4 },
      findingsOpen: { q1: findingsOpenQ1, q4: findingsOpenQ4 },
      avgRemediation: { q1: avgRemediationQ1, q4: avgRemediationQ4 },
      effectiveCount: { q1: effectiveCountQ1, q4: effectiveCountQ4 },
    };
  }, [data]);

  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-4">
      <h3 className="text-sm font-semibold text-slate-900 mb-4">Period-over-Period Comparison ({PERIODS[0]} vs {PERIODS[PERIODS.length - 1]})</h3>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <div className="text-center p-3 bg-slate-50 rounded-lg">
          <div className="text-[10px] text-slate-500 uppercase mb-1">Avg Score</div>
          <div className="text-2xl font-semibold text-slate-900">{stats.avgScore.q4.toFixed(1)}%</div>
          <TrendIndicator currentValue={stats.avgScore.q4} previousValue={stats.avgScore.q1} />
        </div>
        <div className="text-center p-3 bg-slate-50 rounded-lg">
          <div className="text-[10px] text-slate-500 uppercase mb-1">Tests Passed</div>
          <div className="text-2xl font-semibold text-emerald-600">{stats.testsPassed.q4}</div>
          <TrendIndicator currentValue={stats.testsPassed.q4} previousValue={stats.testsPassed.q1} />
        </div>
        <div className="text-center p-3 bg-slate-50 rounded-lg">
          <div className="text-[10px] text-slate-500 uppercase mb-1">Tests Failed</div>
          <div className="text-2xl font-semibold text-rose-600">{stats.testsFailed.q4}</div>
          <TrendIndicator currentValue={stats.testsFailed.q4} previousValue={stats.testsFailed.q1} inverse />
        </div>
        <div className="text-center p-3 bg-slate-50 rounded-lg">
          <div className="text-[10px] text-slate-500 uppercase mb-1">Open Findings</div>
          <div className="text-2xl font-semibold text-amber-600">{stats.findingsOpen.q4}</div>
          <TrendIndicator currentValue={stats.findingsOpen.q4} previousValue={stats.findingsOpen.q1} inverse />
        </div>
        <div className="text-center p-3 bg-slate-50 rounded-lg">
          <div className="text-[10px] text-slate-500 uppercase mb-1">Remediation Days</div>
          <div className="text-2xl font-semibold text-blue-600">{stats.avgRemediation.q4.toFixed(0)}</div>
          <TrendIndicator currentValue={stats.avgRemediation.q4} previousValue={stats.avgRemediation.q1} inverse />
        </div>
        <div className="text-center p-3 bg-slate-50 rounded-lg">
          <div className="text-[10px] text-slate-500 uppercase mb-1">Effective Controls</div>
          <div className="text-2xl font-semibold text-emerald-600">{stats.effectiveCount.q4}</div>
          <TrendIndicator currentValue={stats.effectiveCount.q4} previousValue={stats.effectiveCount.q1} />
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Period Detail Drawer
// ============================================================================

function PeriodDetailDrawer({
  open,
  onClose,
  controlId,
  period,
  data,
  controls,
}: {
  open: boolean;
  onClose: () => void;
  controlId: string | null;
  period: string | null;
  data: TrendDataPoint[];
  controls: Control[];
}) {
  const control = controls.find(c => c.id === controlId);
  const periodData = data.find(d => d.controlId === controlId && d.period === period);

  if (!control || !periodData) return null;

  const catConfig = CATEGORY_CONFIG[control.category];
  const designConfig = EFFECTIVENESS_CONFIG[periodData.designEffectiveness];
  const operatingConfig = EFFECTIVENESS_CONFIG[periodData.operatingEffectiveness];

  return (
    <Drawer open={open} onClose={onClose} title={`${control.name} - ${period}`}>
      <div className="space-y-6">
        <div className="bg-slate-50 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${catConfig.bg} ${catConfig.text}`}>
              {catConfig.label}
            </span>
          </div>
          <div className="text-xs text-slate-500">Owner: {control.owner}</div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white border border-slate-200 rounded-lg p-4">
            <div className="text-[10px] text-slate-500 uppercase mb-2">Design Effectiveness</div>
            <span className={`px-3 py-1 rounded-lg text-sm font-medium ${designConfig.bg} ${designConfig.text}`}>
              {designConfig.label}
            </span>
          </div>
          <div className="bg-white border border-slate-200 rounded-lg p-4">
            <div className="text-[10px] text-slate-500 uppercase mb-2">Operating Effectiveness</div>
            <span className={`px-3 py-1 rounded-lg text-sm font-medium ${operatingConfig.bg} ${operatingConfig.text}`}>
              {operatingConfig.label}
            </span>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-[10px] text-slate-500 uppercase mb-2">Compliance Score</div>
          <div className="flex items-center gap-4">
            <span className="text-3xl font-bold text-slate-900">{periodData.complianceScore}%</span>
            <div className="flex-1 h-3 bg-slate-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${
                  periodData.complianceScore >= 85 ? 'bg-emerald-500' :
                  periodData.complianceScore >= 65 ? 'bg-amber-500' : 'bg-rose-500'
                }`}
                style={{ width: `${periodData.complianceScore}%` }}
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
            <div className="text-[10px] text-emerald-600 uppercase">Tests Passed</div>
            <div className="text-2xl font-bold text-emerald-700">{periodData.testsPassed}</div>
          </div>
          <div className="bg-rose-50 border border-rose-200 rounded-lg p-3">
            <div className="text-[10px] text-rose-600 uppercase">Tests Failed</div>
            <div className="text-2xl font-bold text-rose-700">{periodData.testsFailed}</div>
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <div className="text-[10px] text-blue-600 uppercase">Incidents Blocked</div>
            <div className="text-2xl font-bold text-blue-700">{periodData.incidentsBlocked}</div>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
            <div className="text-[10px] text-amber-600 uppercase">Incidents Missed</div>
            <div className="text-2xl font-bold text-amber-700">{periodData.incidentsMissed}</div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-[10px] text-slate-500 uppercase mb-3">Findings Status</div>
          <div className="flex justify-between text-xs mb-1">
            <span className="text-orange-600">Open: {periodData.findingsOpen}</span>
            <span className="text-emerald-600">Closed: {periodData.findingsClosed}</span>
          </div>
          <div className="flex h-2 rounded-full overflow-hidden bg-slate-100">
            <div
              className="bg-orange-500"
              style={{ width: `${(periodData.findingsOpen / (periodData.findingsOpen + periodData.findingsClosed || 1)) * 100}%` }}
            />
            <div
              className="bg-emerald-500"
              style={{ width: `${(periodData.findingsClosed / (periodData.findingsOpen + periodData.findingsClosed || 1)) * 100}%` }}
            />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-[10px] text-slate-500 uppercase mb-2">Average Remediation Time</div>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold text-slate-900">{periodData.remediationDays}</span>
            <span className="text-sm text-slate-500">days</span>
          </div>
        </div>
      </div>
    </Drawer>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export default function ControlTrends() {
  // Period and agent filtering are not wired to the demo dataset, so both are
  // pinned and their controls are rendered disabled (see below) rather than
  // implying a filter that does nothing.
  const periodFilter: PeriodFilter = 'last-4q';
  const agentFilter = 'all';
  const [categoryFilter, setCategoryFilter] = useState<ControlCategory | 'all'>('all');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedCell, setSelectedCell] = useState<{ controlId: string; period: string } | null>(null);

  const filteredData = useMemo(() => {
    let filtered = [...MOCK_TREND_DATA];

    if (categoryFilter !== 'all') {
      const controlIds = MOCK_CONTROLS
        .filter(c => c.category === categoryFilter)
        .map(c => c.id);
      filtered = filtered.filter(d => controlIds.includes(d.controlId));
    }

    return filtered;
  }, [categoryFilter]);

  const filteredControls = useMemo(() => {
    if (categoryFilter === 'all') return MOCK_CONTROLS;
    return MOCK_CONTROLS.filter(c => c.category === categoryFilter);
  }, [categoryFilter]);

  const handleCellClick = (controlId: string, period: string) => {
    setSelectedCell({ controlId, period });
    setDrawerOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <MockDataBadge integration="Control effectiveness from GRC system" />

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5">
            <div
              className="flex rounded-lg overflow-hidden border border-slate-200 opacity-60"
              title="Period filtering is not available in this demo view"
            >
              {[
                { value: 'last-4q', label: 'Last 4Q' },
                { value: 'last-year', label: 'Last Year' },
                { value: 'all-time', label: 'All Time' },
              ].map(option => (
                <button
                  key={option.value}
                  type="button"
                  disabled
                  className={`px-3 py-1.5 text-xs font-medium cursor-not-allowed ${
                    periodFilter === option.value
                      ? 'bg-slate-400 text-white'
                      : 'bg-white text-slate-400'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <span className="text-[10px] font-medium uppercase tracking-wide text-slate-400">Demo</span>
          </div>

          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value as ControlCategory | 'all')}
            className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-white"
          >
            <option value="all">All Categories</option>
            <option value="platform">Platform</option>
            <option value="policy">Policy</option>
            <option value="guardrail">Guardrail</option>
            <option value="custom">Custom</option>
          </select>

          <div className="flex items-center gap-1.5">
            <select
              value={agentFilter}
              disabled
              title="Agent filtering is not available in this demo view"
              className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-slate-50 text-slate-400 cursor-not-allowed"
            >
              <option value="all">All Agents</option>
              {MOCK_AGENTS.map(agent => (
                <option key={agent.id} value={agent.id}>{agent.name}</option>
              ))}
            </select>
            <span className="text-[10px] font-medium uppercase tracking-wide text-slate-400">Demo</span>
          </div>
        </div>
      </div>

      <YoYComparison data={filteredData} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ComplianceScoreChart data={filteredData} />
        <TestResultsChart data={filteredData} />
        <FindingsChart data={filteredData} />
        <EffectivenessComparisonChart data={filteredData} />
      </div>

      <EffectivenessHeatmap
        data={filteredData}
        controls={filteredControls}
        onCellClick={handleCellClick}
      />

      <PeriodDetailDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        controlId={selectedCell?.controlId || null}
        period={selectedCell?.period || null}
        data={MOCK_TREND_DATA}
        controls={MOCK_CONTROLS}
      />
    </div>
  );
}
