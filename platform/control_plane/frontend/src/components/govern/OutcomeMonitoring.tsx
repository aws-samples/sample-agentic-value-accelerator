/**
 * OutcomeMonitoring — Post-deployment AI Impact Dashboard
 *
 * Tracks AI decision outcomes over time for regulatory compliance with:
 * - CRI FS AI RMF (Consumer financial harm indicators)
 * - OSFI E-23 (Model outcomes monitoring)
 * - NAIC AI Principles (Fair outcomes in insurance)
 *
 * Key metrics tracked:
 * - Decision distribution (approve/deny/refer)
 * - Demographic parity across protected groups
 * - Appeal/override rate
 * - Customer complaint rate (AI-related)
 * - False positive/negative rates (where ground truth available)
 * - Drift detection (model performance over time)
 */

import { useState, useMemo } from 'react';
import {
  LineChart, Line, BarChart, Bar, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  ReferenceLine,
} from 'recharts';
import { Link } from 'react-router-dom';
import { Icon, type IconName } from './icons';
import { MockDataBadge } from './DataSourceIndicator';
import StatCard from './StatCard';

/* ───────── Types ───────── */

type OutcomeType = 'approve' | 'deny' | 'refer';
type TimeRange = '30d' | '60d' | '90d';
type AlertSeverity = 'critical' | 'high' | 'medium' | 'low';

interface UseCase {
  id: string;
  name: string;
  domain: string;
  riskTier: 'High' | 'Medium' | 'Low';
  icon: IconName;
}

interface OutcomeMetrics {
  useCaseId: string;
  totalDecisions: number;
  approvalRate: number;
  denialRate: number;
  referralRate: number;
  appealRate: number;
  overrideRate: number;
  complaintRate: number;
  falsePositiveRate: number;
  falseNegativeRate: number;
  driftScore: number;
  demographicParityGap: number;
  lastUpdated: string;
}

interface TrendPoint {
  date: string;
  approve: number;
  deny: number;
  refer: number;
  appealRate: number;
  driftScore: number;
  demographicParity: number;
}

interface OutcomeAlert {
  id: string;
  useCaseId: string;
  metric: string;
  severity: AlertSeverity;
  message: string;
  threshold: number;
  current: number;
  timestamp: string;
  regulatoryRef?: string;
}

interface DemographicGroup {
  group: string;
  approvalRate: number;
  count: number;
  parityRatio: number;
}

interface AlertThreshold {
  metric: string;
  label: string;
  operator: 'gt' | 'lt';
  warning: number;
  critical: number;
  unit: string;
  regulatoryRef: string;
}

/* ───────── Mock Data ───────── */

const USE_CASES: UseCase[] = [
  { id: 'credit-decisioning', name: 'Credit Decisioning', domain: 'Credit', riskTier: 'High', icon: 'credit-card' },
  { id: 'fraud-detection', name: 'Fraud Detection', domain: 'Fraud', riskTier: 'High', icon: 'shield-exclamation' },
  { id: 'claims-processing', name: 'Claims Processing', domain: 'Claims', riskTier: 'High', icon: 'clipboard-document-check' },
  { id: 'underwriting', name: 'Underwriting', domain: 'Underwriting', riskTier: 'High', icon: 'document-check' },
  { id: 'kyc-aml', name: 'KYC/AML Screening', domain: 'Compliance', riskTier: 'High', icon: 'magnifying-glass' },
  { id: 'collections', name: 'Collections Prioritization', domain: 'Collections', riskTier: 'Medium', icon: 'banknotes' },
];

// Seeded pseudo-random for stable mock data
const noise = (seed: number) => {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
};

const generateMetrics = (useCaseId: string, idx: number): OutcomeMetrics => {
  const baseApproval = 0.65 + noise(idx * 17 + 1) * 0.2;
  const referral = 0.05 + noise(idx * 17 + 2) * 0.1;
  return {
    useCaseId,
    totalDecisions: Math.round(15000 + noise(idx * 17 + 3) * 25000),
    approvalRate: baseApproval,
    denialRate: 1 - baseApproval - referral,
    referralRate: referral,
    appealRate: 0.02 + noise(idx * 17 + 4) * 0.03,
    overrideRate: 0.01 + noise(idx * 17 + 5) * 0.02,
    complaintRate: 0.001 + noise(idx * 17 + 6) * 0.004,
    falsePositiveRate: 0.03 + noise(idx * 17 + 7) * 0.04,
    falseNegativeRate: 0.02 + noise(idx * 17 + 8) * 0.03,
    driftScore: noise(idx * 17 + 9) * 0.08,
    demographicParityGap: 0.02 + noise(idx * 17 + 10) * 0.1,
    lastUpdated: new Date().toISOString(),
  };
};

const generateTrend = (useCaseId: string, days: number, idx: number): TrendPoint[] => {
  const today = new Date();
  return Array.from({ length: days }, (_, i) => {
    const date = new Date(today);
    date.setDate(date.getDate() - (days - 1 - i));
    const dayNoise = noise(idx * 100 + i);
    const drift = (i / days) * 0.02; // gradual drift over time
    return {
      date: date.toISOString().split('T')[0],
      approve: 65 + dayNoise * 8 - drift * 100,
      deny: 25 + dayNoise * 5,
      refer: 8 + dayNoise * 3,
      appealRate: 2 + dayNoise * 1.5 + drift * 50,
      driftScore: drift + dayNoise * 0.02,
      demographicParity: 0.85 + dayNoise * 0.1 - drift * 2,
    };
  });
};

const METRICS_BY_USE_CASE = Object.fromEntries(
  USE_CASES.map((uc, idx) => [uc.id, generateMetrics(uc.id, idx)])
);

const TRENDS_BY_USE_CASE = Object.fromEntries(
  USE_CASES.map((uc, idx) => [uc.id, generateTrend(uc.id, 90, idx)])
);

const DEMOGRAPHIC_GROUPS: Record<string, DemographicGroup[]> = {
  'credit-decisioning': [
    { group: 'White', approvalRate: 0.72, count: 12500, parityRatio: 1.0 },
    { group: 'Black', approvalRate: 0.58, count: 4200, parityRatio: 0.81 },
    { group: 'Hispanic', approvalRate: 0.63, count: 5100, parityRatio: 0.88 },
    { group: 'Asian', approvalRate: 0.75, count: 3800, parityRatio: 1.04 },
    { group: 'Other', approvalRate: 0.68, count: 1400, parityRatio: 0.94 },
  ],
  'fraud-detection': [
    { group: 'Age 18-30', approvalRate: 0.88, count: 8200, parityRatio: 0.94 },
    { group: 'Age 31-50', approvalRate: 0.94, count: 15400, parityRatio: 1.0 },
    { group: 'Age 51-65', approvalRate: 0.92, count: 9100, parityRatio: 0.98 },
    { group: 'Age 65+', approvalRate: 0.86, count: 4300, parityRatio: 0.91 },
  ],
  'claims-processing': [
    { group: 'Urban', approvalRate: 0.71, count: 18200, parityRatio: 1.0 },
    { group: 'Suburban', approvalRate: 0.74, count: 12400, parityRatio: 1.04 },
    { group: 'Rural', approvalRate: 0.65, count: 5800, parityRatio: 0.92 },
  ],
};

const ALERTS: OutcomeAlert[] = [
  {
    id: 'alert-1',
    useCaseId: 'credit-decisioning',
    metric: 'Demographic Parity Gap',
    severity: 'high',
    message: 'Approval rate disparity exceeds 15% for Black applicants vs reference group',
    threshold: 0.80,
    current: 0.81,
    timestamp: new Date(Date.now() - 3600000).toISOString(),
    regulatoryRef: 'ECOA / Reg B',
  },
  {
    id: 'alert-2',
    useCaseId: 'fraud-detection',
    metric: 'False Positive Rate',
    severity: 'medium',
    message: 'False positive rate increasing — blocking legitimate transactions',
    threshold: 0.05,
    current: 0.062,
    timestamp: new Date(Date.now() - 7200000).toISOString(),
    regulatoryRef: 'CRI FS AI RMF 4.2',
  },
  {
    id: 'alert-3',
    useCaseId: 'claims-processing',
    metric: 'Appeal Rate',
    severity: 'low',
    message: 'Appeal rate elevated but within acceptable range',
    threshold: 0.04,
    current: 0.038,
    timestamp: new Date(Date.now() - 86400000).toISOString(),
    regulatoryRef: 'NAIC AI-003',
  },
  {
    id: 'alert-4',
    useCaseId: 'underwriting',
    metric: 'Model Drift',
    severity: 'critical',
    message: 'Model performance drift detected — exceeds 5% threshold',
    threshold: 0.05,
    current: 0.072,
    timestamp: new Date(Date.now() - 1800000).toISOString(),
    regulatoryRef: 'OSFI E-23 Section 4.3',
  },
];

const DEFAULT_THRESHOLDS: AlertThreshold[] = [
  { metric: 'demographicParityGap', label: 'Demographic Parity Gap', operator: 'gt', warning: 0.10, critical: 0.20, unit: '', regulatoryRef: 'ECOA four-fifths rule' },
  { metric: 'appealRate', label: 'Appeal Rate', operator: 'gt', warning: 0.03, critical: 0.05, unit: '%', regulatoryRef: 'CRI FS AI RMF' },
  { metric: 'overrideRate', label: 'Override Rate', operator: 'gt', warning: 0.02, critical: 0.04, unit: '%', regulatoryRef: 'OSFI E-23' },
  { metric: 'complaintRate', label: 'Complaint Rate', operator: 'gt', warning: 0.003, critical: 0.005, unit: '%', regulatoryRef: 'CFPB guidance' },
  { metric: 'falsePositiveRate', label: 'False Positive Rate', operator: 'gt', warning: 0.05, critical: 0.08, unit: '%', regulatoryRef: 'CRI FS AI RMF' },
  { metric: 'falseNegativeRate', label: 'False Negative Rate', operator: 'gt', warning: 0.04, critical: 0.07, unit: '%', regulatoryRef: 'SR 11-7' },
  { metric: 'driftScore', label: 'Model Drift', operator: 'gt', warning: 0.03, critical: 0.05, unit: '', regulatoryRef: 'OSFI E-23 Section 4.3' },
];

/* ───────── Utility Functions ───────── */

const card = 'bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm';
const heading = 'text-sm font-semibold text-slate-900';

const tooltipStyle: React.CSSProperties = {
  backgroundColor: 'rgba(255,255,255,0.96)',
  border: '1px solid #e2e8f0',
  borderRadius: '8px',
  padding: '8px 12px',
  boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
};

const severityColors: Record<AlertSeverity, { bg: string; text: string; border: string }> = {
  critical: { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200' },
  high: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  medium: { bg: 'bg-yellow-50', text: 'text-yellow-700', border: 'border-yellow-200' },
  low: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
};

const formatPct = (val: number) => `${(val * 100).toFixed(1)}%`;
const formatPctShort = (val: number) => `${(val * 100).toFixed(0)}%`;

/* ───────── Component ───────── */

export default function OutcomeMonitoring() {
  const [selectedUseCase, setSelectedUseCase] = useState<string>('credit-decisioning');
  const [timeRange, setTimeRange] = useState<TimeRange>('30d');
  const [showThresholdConfig, setShowThresholdConfig] = useState(false);
  const [thresholds, setThresholds] = useState<AlertThreshold[]>(DEFAULT_THRESHOLDS);

  const metrics = METRICS_BY_USE_CASE[selectedUseCase];
  const useCase = USE_CASES.find(uc => uc.id === selectedUseCase)!;
  const demographics = DEMOGRAPHIC_GROUPS[selectedUseCase] || DEMOGRAPHIC_GROUPS['claims-processing'];

  // Slice trend data based on selected time range
  const trendData = useMemo(() => {
    const days = timeRange === '30d' ? 30 : timeRange === '60d' ? 60 : 90;
    const fullTrend = TRENDS_BY_USE_CASE[selectedUseCase];
    return fullTrend.slice(-days);
  }, [selectedUseCase, timeRange]);

  // Alerts for selected use case
  const useCaseAlerts = useMemo(() =>
    ALERTS.filter(a => a.useCaseId === selectedUseCase || selectedUseCase === 'all'),
    [selectedUseCase]
  );

  // Baseline comparison (average of first 7 days vs last 7 days)
  const baseline = useMemo(() => {
    if (trendData.length < 14) return null;
    const first7 = trendData.slice(0, 7);
    const last7 = trendData.slice(-7);
    const avg = (arr: TrendPoint[], key: keyof TrendPoint) =>
      arr.reduce((sum, p) => sum + (p[key] as number), 0) / arr.length;
    return {
      approvalChange: avg(last7, 'approve') - avg(first7, 'approve'),
      appealChange: avg(last7, 'appealRate') - avg(first7, 'appealRate'),
      driftChange: avg(last7, 'driftScore') - avg(first7, 'driftScore'),
    };
  }, [trendData]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className={heading}>Outcome Monitoring</h2>
            <MockDataBadge integration="Outcome data warehouse + ground truth labels" />
          </div>
          <p className="text-xs text-slate-500 mt-1 max-w-xl">
            Post-deployment AI impact tracking for regulatory compliance. Monitor decision outcomes,
            demographic fairness, appeals, complaints, and model drift aligned to CRI FS AI RMF, OSFI E-23, and NAIC.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Use case selector */}
          <select
            value={selectedUseCase}
            onChange={e => setSelectedUseCase(e.target.value)}
            className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-500 bg-white"
          >
            {USE_CASES.map(uc => (
              <option key={uc.id} value={uc.id}>{uc.name}</option>
            ))}
          </select>

          {/* Time range selector */}
          <div className="flex gap-1 p-0.5 bg-slate-100 rounded-lg">
            {(['30d', '60d', '90d'] as TimeRange[]).map(tr => (
              <button
                key={tr}
                onClick={() => setTimeRange(tr)}
                className={`px-2 py-1 rounded text-xs font-medium transition-all ${
                  timeRange === tr ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {tr}
              </button>
            ))}
          </div>

          {/* Export button */}
          <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
            <Icon name="document-arrow-down" className="w-4 h-4" />
            Export Report
          </button>
        </div>
      </div>

      {/* Active Alerts */}
      {ALERTS.filter(a => a.severity === 'critical' || a.severity === 'high').length > 0 && (
        <div className={`${card} p-4`}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Icon name="bell-alert" className="w-5 h-5 text-rose-500" />
              <h3 className={heading}>Active Alerts</h3>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 font-semibold">
                {ALERTS.filter(a => a.severity === 'critical' || a.severity === 'high').length} requiring attention
              </span>
            </div>
            <button
              onClick={() => setShowThresholdConfig(!showThresholdConfig)}
              className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1"
            >
              <Icon name="cog" className="w-3.5 h-3.5" />
              Configure Thresholds
            </button>
          </div>
          <div className="space-y-2">
            {ALERTS.filter(a => a.severity === 'critical' || a.severity === 'high').map(alert => (
              <div
                key={alert.id}
                className={`flex items-center justify-between p-3 rounded-lg border ${severityColors[alert.severity].bg} ${severityColors[alert.severity].border}`}
              >
                <div className="flex items-center gap-3">
                  <Icon
                    name={alert.severity === 'critical' ? 'exclamation-circle' : 'exclamation-triangle'}
                    className={`w-5 h-5 ${severityColors[alert.severity].text}`}
                  />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-medium ${severityColors[alert.severity].text}`}>
                        {alert.metric}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/60 text-slate-600">
                        {USE_CASES.find(uc => uc.id === alert.useCaseId)?.name}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 mt-0.5">{alert.message}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className="text-xs text-slate-500">Threshold: {alert.threshold}</div>
                    <div className={`text-sm font-semibold ${severityColors[alert.severity].text}`}>
                      Current: {alert.current}
                    </div>
                  </div>
                  {alert.regulatoryRef && (
                    <span className="text-[9px] px-2 py-0.5 rounded bg-white/60 text-slate-500 whitespace-nowrap">
                      {alert.regulatoryRef}
                    </span>
                  )}
                  <Link
                    to="/govern/audit"
                    className="text-xs font-medium text-blue-600 hover:text-blue-700"
                  >
                    View Details
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Threshold Configuration Panel */}
      {showThresholdConfig && (
        <div className={`${card} p-4`}>
          <div className="flex items-center justify-between mb-4">
            <h3 className={heading}>Alert Threshold Configuration</h3>
            <button
              onClick={() => setShowThresholdConfig(false)}
              className="text-slate-400 hover:text-slate-600"
            >
              <Icon name="x-mark" className="w-4 h-4" />
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] text-slate-400 uppercase tracking-wide bg-slate-50/50">
                  <th scope="col" className="py-2 px-3 text-left font-medium">Metric</th>
                  <th scope="col" className="py-2 px-3 text-center font-medium">Warning</th>
                  <th scope="col" className="py-2 px-3 text-center font-medium">Critical</th>
                  <th scope="col" className="py-2 px-3 text-left font-medium">Regulatory Reference</th>
                </tr>
              </thead>
              <tbody>
                {thresholds.map((t, i) => (
                  <tr key={t.metric} className="border-t border-slate-100">
                    <td className="py-2 px-3 font-medium text-slate-800">{t.label}</td>
                    <td className="py-2 px-3 text-center">
                      <input
                        type="number"
                        step="0.01"
                        value={t.warning}
                        onChange={e => {
                          const newThresholds = [...thresholds];
                          newThresholds[i] = { ...t, warning: parseFloat(e.target.value) };
                          setThresholds(newThresholds);
                        }}
                        className="w-20 px-2 py-1 text-center text-xs border border-amber-200 rounded bg-amber-50"
                      />
                    </td>
                    <td className="py-2 px-3 text-center">
                      <input
                        type="number"
                        step="0.01"
                        value={t.critical}
                        onChange={e => {
                          const newThresholds = [...thresholds];
                          newThresholds[i] = { ...t, critical: parseFloat(e.target.value) };
                          setThresholds(newThresholds);
                        }}
                        className="w-20 px-2 py-1 text-center text-xs border border-rose-200 rounded bg-rose-50"
                      />
                    </td>
                    <td className="py-2 px-3 text-xs text-slate-500">{t.regulatoryRef}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 text-[10px] text-slate-400">
            Thresholds aligned to regulatory expectations. Critical alerts trigger immediate escalation; warnings enter monitoring queue.
          </div>
        </div>
      )}

      {/* KPI Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <StatCard
          label="Total Decisions"
          value={metrics.totalDecisions.toLocaleString()}
          sub={`${timeRange} window`}
          variant="info"
        />
        <StatCard
          label="Approval Rate"
          value={formatPct(metrics.approvalRate)}
          trend={baseline ? {
            value: `${baseline.approvalChange > 0 ? '+' : ''}${baseline.approvalChange.toFixed(1)}%`,
            direction: baseline.approvalChange > 0 ? 'up' : 'down',
            isPositive: baseline.approvalChange >= 0,
          } : undefined}
          variant="success"
        />
        <StatCard
          label="Appeal Rate"
          value={formatPct(metrics.appealRate)}
          variant={metrics.appealRate > 0.04 ? 'warning' : 'default'}
          sub={metrics.appealRate > 0.04 ? 'above threshold' : 'within target'}
        />
        <StatCard
          label="Override Rate"
          value={formatPct(metrics.overrideRate)}
          variant={metrics.overrideRate > 0.03 ? 'warning' : 'default'}
          sub="human corrections"
        />
        <StatCard
          label="Complaint Rate"
          value={formatPct(metrics.complaintRate)}
          variant={metrics.complaintRate > 0.003 ? 'danger' : 'success'}
          sub="AI-related"
        />
        <StatCard
          label="Model Drift"
          value={formatPct(metrics.driftScore)}
          variant={metrics.driftScore > 0.05 ? 'danger' : metrics.driftScore > 0.03 ? 'warning' : 'success'}
          sub={metrics.driftScore > 0.05 ? 'retrain needed' : 'stable'}
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Decision Distribution Trend */}
        <div className={`${card} p-4`}>
          <div className="flex items-center justify-between mb-3">
            <h3 className={heading}>Decision Distribution Trend</h3>
            <span className="text-[10px] text-slate-400">stacked area by outcome</span>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={trendData}>
              <defs>
                <linearGradient id="approveGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.6} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0.1} />
                </linearGradient>
                <linearGradient id="denyGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ef4444" stopOpacity={0.6} />
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0.1} />
                </linearGradient>
                <linearGradient id="referGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.6} />
                  <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.1} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 10 }} tickFormatter={d => d.slice(5)} />
              <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} domain={[0, 100]} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: '10px' }} />
              <Area type="monotone" dataKey="approve" name="Approve %" stackId="1" stroke="#10b981" fill="url(#approveGrad)" />
              <Area type="monotone" dataKey="deny" name="Deny %" stackId="1" stroke="#ef4444" fill="url(#denyGrad)" />
              <Area type="monotone" dataKey="refer" name="Refer %" stackId="1" stroke="#f59e0b" fill="url(#referGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Model Drift & Appeal Rate */}
        <div className={`${card} p-4`}>
          <div className="flex items-center justify-between mb-3">
            <h3 className={heading}>Drift & Appeal Trend</h3>
            <span className="text-[10px] text-slate-400">performance over time</span>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 10 }} tickFormatter={d => d.slice(5)} />
              <YAxis yAxisId="left" tick={{ fill: '#94a3b8', fontSize: 10 }} domain={[0, 'auto']} />
              <YAxis yAxisId="right" orientation="right" tick={{ fill: '#94a3b8', fontSize: 10 }} domain={[0, 0.1]} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: '10px' }} />
              <ReferenceLine yAxisId="right" y={0.05} stroke="#ef4444" strokeDasharray="5 5" label={{ value: 'Drift threshold', fontSize: 9, fill: '#ef4444' }} />
              <Line yAxisId="left" type="monotone" dataKey="appealRate" name="Appeal Rate %" stroke="#f59e0b" strokeWidth={2} dot={false} />
              <Line yAxisId="right" type="monotone" dataKey="driftScore" name="Drift Score" stroke="#8b5cf6" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Demographic Parity & Consumer Harm */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Demographic Parity */}
        <div className={`${card} p-4`}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <h3 className={heading}>Demographic Parity Analysis</h3>
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-violet-50 text-violet-600">CRI FS AI RMF</span>
            </div>
            <span className="text-[10px] text-slate-400">approval rates by group</span>
          </div>
          <div className="space-y-2">
            {demographics.map((d, i) => {
              const maxRate = Math.max(...demographics.map(g => g.approvalRate));
              const parityStatus = d.parityRatio >= 0.80 ? 'pass' : d.parityRatio >= 0.70 ? 'warning' : 'fail';
              return (
                <div key={d.group} className="flex items-center gap-3">
                  <span className="w-24 text-xs font-medium text-slate-700 truncate">{d.group}</span>
                  <div className="flex-1 h-5 bg-slate-100 rounded-full overflow-hidden relative">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${(d.approvalRate / maxRate) * 100}%`,
                        backgroundColor: parityStatus === 'pass' ? '#10b981' : parityStatus === 'warning' ? '#f59e0b' : '#ef4444',
                      }}
                    />
                    {/* Four-fifths line */}
                    <div
                      className="absolute top-0 bottom-0 w-0.5 bg-slate-400"
                      style={{ left: `${80}%` }}
                      title="Four-fifths threshold"
                    />
                  </div>
                  <span className="w-14 text-xs text-right tabular-nums text-slate-600">{formatPct(d.approvalRate)}</span>
                  <span className={`w-14 text-xs text-right tabular-nums font-medium ${
                    parityStatus === 'pass' ? 'text-emerald-600' : parityStatus === 'warning' ? 'text-amber-600' : 'text-rose-600'
                  }`}>
                    {d.parityRatio.toFixed(2)}
                  </span>
                  <span className="w-16 text-[10px] text-right text-slate-400">{d.count.toLocaleString()}</span>
                </div>
              );
            })}
          </div>
          <div className="mt-3 flex items-center gap-4 text-[10px] text-slate-400">
            <span className="flex items-center gap-1">
              <span className="w-2 h-0.5 bg-slate-400" /> Four-fifths threshold (0.80)
            </span>
            <span>Parity ratio = group rate / max rate</span>
          </div>
          <div className="mt-2 p-2 bg-violet-50 rounded-lg border border-violet-100">
            <div className="text-[10px] text-violet-700">
              <strong>Consumer Harm Indicator:</strong> Groups below 0.80 parity ratio may indicate disparate impact under ECOA/Reg B.
              {demographics.some(d => d.parityRatio < 0.80) && (
                <span className="ml-1 text-rose-600 font-semibold">Review required.</span>
              )}
            </div>
          </div>
        </div>

        {/* Accuracy Metrics */}
        <div className={`${card} p-4`}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <h3 className={heading}>Ground Truth Accuracy</h3>
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600">where available</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {/* False Positive */}
            <div className="p-3 bg-slate-50 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-slate-500">False Positive Rate</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                  metrics.falsePositiveRate > 0.08 ? 'bg-rose-100 text-rose-700' :
                  metrics.falsePositiveRate > 0.05 ? 'bg-amber-100 text-amber-700' :
                  'bg-emerald-100 text-emerald-700'
                }`}>
                  {metrics.falsePositiveRate > 0.08 ? 'High' : metrics.falsePositiveRate > 0.05 ? 'Elevated' : 'Normal'}
                </span>
              </div>
              <div className="text-2xl font-bold text-slate-900 tabular-nums">{formatPct(metrics.falsePositiveRate)}</div>
              <div className="text-[10px] text-slate-400 mt-1">Legitimate cases incorrectly flagged</div>
              <div className="mt-2 h-2 bg-slate-200 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.min(metrics.falsePositiveRate * 1000, 100)}%`,
                    backgroundColor: metrics.falsePositiveRate > 0.08 ? '#ef4444' : metrics.falsePositiveRate > 0.05 ? '#f59e0b' : '#10b981',
                  }}
                />
              </div>
            </div>

            {/* False Negative */}
            <div className="p-3 bg-slate-50 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-slate-500">False Negative Rate</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                  metrics.falseNegativeRate > 0.07 ? 'bg-rose-100 text-rose-700' :
                  metrics.falseNegativeRate > 0.04 ? 'bg-amber-100 text-amber-700' :
                  'bg-emerald-100 text-emerald-700'
                }`}>
                  {metrics.falseNegativeRate > 0.07 ? 'High' : metrics.falseNegativeRate > 0.04 ? 'Elevated' : 'Normal'}
                </span>
              </div>
              <div className="text-2xl font-bold text-slate-900 tabular-nums">{formatPct(metrics.falseNegativeRate)}</div>
              <div className="text-[10px] text-slate-400 mt-1">Problematic cases missed by model</div>
              <div className="mt-2 h-2 bg-slate-200 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.min(metrics.falseNegativeRate * 1000, 100)}%`,
                    backgroundColor: metrics.falseNegativeRate > 0.07 ? '#ef4444' : metrics.falseNegativeRate > 0.04 ? '#f59e0b' : '#10b981',
                  }}
                />
              </div>
            </div>
          </div>

          {/* Confusion matrix summary */}
          <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-100">
            <div className="flex items-center gap-2 mb-2">
              <Icon name="information-circle" className="w-4 h-4 text-blue-500" />
              <span className="text-xs font-medium text-blue-800">Consumer Harm Assessment</span>
            </div>
            <div className="text-[10px] text-blue-700 space-y-1">
              <div>
                <strong>FP Impact:</strong> Customer friction, lost revenue, reputational damage. Target: &lt;5%
              </div>
              <div>
                <strong>FN Impact:</strong> Regulatory exposure, financial loss, safety risk. Target: &lt;4%
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Use Case Comparison Table */}
      <div className={`${card} overflow-hidden`}>
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className={heading}>All Use Cases — Outcome Summary</h3>
          <Link
            to="/govern/audit"
            className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
          >
            <Icon name="arrow-right" className="w-3 h-3" />
            Drill down to decisions
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] text-slate-400 uppercase tracking-wide bg-slate-50/50">
                <th scope="col" className="py-2.5 px-5 text-left font-medium">Use Case</th>
                <th scope="col" className="py-2.5 px-3 text-center font-medium">Decisions</th>
                <th scope="col" className="py-2.5 px-3 text-center font-medium">Approval</th>
                <th scope="col" className="py-2.5 px-3 text-center font-medium">Appeal</th>
                <th scope="col" className="py-2.5 px-3 text-center font-medium">Override</th>
                <th scope="col" className="py-2.5 px-3 text-center font-medium">Complaint</th>
                <th scope="col" className="py-2.5 px-3 text-center font-medium">Parity Gap</th>
                <th scope="col" className="py-2.5 px-3 text-center font-medium">Drift</th>
                <th scope="col" className="py-2.5 px-3 text-center font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {USE_CASES.map((uc, i) => {
                const m = METRICS_BY_USE_CASE[uc.id];
                const alerts = ALERTS.filter(a => a.useCaseId === uc.id);
                const hasCritical = alerts.some(a => a.severity === 'critical');
                const hasHigh = alerts.some(a => a.severity === 'high');
                const status = hasCritical ? 'critical' : hasHigh ? 'warning' : 'healthy';
                return (
                  <tr
                    key={uc.id}
                    className={`border-t border-slate-100 hover:bg-slate-50/60 cursor-pointer transition-colors ${
                      selectedUseCase === uc.id ? 'bg-blue-50/50' : ''
                    }`}
                    onClick={() => setSelectedUseCase(uc.id)}
                  >
                    <td className="py-2.5 px-5">
                      <div className="flex items-center gap-2">
                        <Icon name={uc.icon} className="w-4 h-4 text-slate-400" />
                        <span className="font-medium text-slate-800">{uc.name}</span>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded ${
                          uc.riskTier === 'High' ? 'bg-rose-50 text-rose-600' :
                          uc.riskTier === 'Medium' ? 'bg-amber-50 text-amber-600' :
                          'bg-slate-100 text-slate-500'
                        }`}>{uc.riskTier}</span>
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-center text-slate-600 tabular-nums">{m.totalDecisions.toLocaleString()}</td>
                    <td className="py-2.5 px-3 text-center font-medium text-emerald-600 tabular-nums">{formatPctShort(m.approvalRate)}</td>
                    <td className={`py-2.5 px-3 text-center tabular-nums ${m.appealRate > 0.04 ? 'text-amber-600 font-medium' : 'text-slate-600'}`}>
                      {formatPct(m.appealRate)}
                    </td>
                    <td className={`py-2.5 px-3 text-center tabular-nums ${m.overrideRate > 0.03 ? 'text-amber-600 font-medium' : 'text-slate-600'}`}>
                      {formatPct(m.overrideRate)}
                    </td>
                    <td className={`py-2.5 px-3 text-center tabular-nums ${m.complaintRate > 0.003 ? 'text-rose-600 font-medium' : 'text-slate-600'}`}>
                      {formatPct(m.complaintRate)}
                    </td>
                    <td className={`py-2.5 px-3 text-center tabular-nums ${m.demographicParityGap > 0.15 ? 'text-rose-600 font-medium' : m.demographicParityGap > 0.10 ? 'text-amber-600' : 'text-slate-600'}`}>
                      {formatPct(m.demographicParityGap)}
                    </td>
                    <td className={`py-2.5 px-3 text-center tabular-nums ${m.driftScore > 0.05 ? 'text-rose-600 font-medium' : m.driftScore > 0.03 ? 'text-amber-600' : 'text-slate-600'}`}>
                      {formatPct(m.driftScore)}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                        status === 'critical' ? 'bg-rose-100 text-rose-700' :
                        status === 'warning' ? 'bg-amber-100 text-amber-700' :
                        'bg-emerald-100 text-emerald-700'
                      }`}>
                        {status === 'critical' ? 'Critical' : status === 'warning' ? 'Warning' : 'Healthy'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Regulatory Mapping Footer */}
      <div className={`${card} p-4`}>
        <div className="flex items-center gap-2 mb-3">
          <Icon name="clipboard-document-check" className="w-5 h-5 text-violet-500" />
          <h3 className={heading}>Regulatory Alignment</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-3 bg-violet-50 rounded-lg border border-violet-100">
            <div className="text-xs font-semibold text-violet-800 mb-1">CRI FS AI RMF</div>
            <div className="text-[10px] text-violet-700">
              Section 4.2 — Consumer harm indicators monitored via complaint rate, false positives, and demographic parity.
              Section 5.1 — Ongoing monitoring with drift detection.
            </div>
          </div>
          <div className="p-3 bg-sky-50 rounded-lg border border-sky-100">
            <div className="text-xs font-semibold text-sky-800 mb-1">OSFI E-23</div>
            <div className="text-[10px] text-sky-700">
              Section 4.3 — Model outcomes monitoring aligned via appeal/override tracking.
              Section 4.4 — Performance drift detection with automated alerting.
            </div>
          </div>
          <div className="p-3 bg-amber-50 rounded-lg border border-amber-100">
            <div className="text-xs font-semibold text-amber-800 mb-1">NAIC AI Principles</div>
            <div className="text-[10px] text-amber-700">
              Principle 3 — Fair and ethical outcomes tracked via demographic parity analysis.
              Principle 5 — Transparency through decision audit trail integration.
            </div>
          </div>
        </div>
        <div className="mt-3 text-[10px] text-slate-400">
          This dashboard supports regulatory examination readiness. Export reports for regulatory submissions via the Export button above.
        </div>
      </div>
    </div>
  );
}
