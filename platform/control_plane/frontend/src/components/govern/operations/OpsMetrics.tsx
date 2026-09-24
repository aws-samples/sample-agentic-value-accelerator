/**
 * OpsMetrics - Comprehensive DORA-style metrics dashboard for AI platform operations
 *
 * Tracks the full spectrum of operational health:
 * - DORA Metrics: MTTR, MTTD, Change Failure Rate, Deployment Frequency
 * - Availability: Fleet & per-agent uptime, SLA achievement, downtime analysis
 * - Incidents: Volume, severity distribution, resolution times, repeat rate
 * - Alerts: Volume, noise ratio, acknowledgement times, false positives
 * - Changes: Volume, success rate, rollbacks, lead time
 * - On-Call: Pages per shift, response times, escalations, coverage
 * - SLA: Compliance rate, breaches, error budget burn
 * - Trends: Configurable time ranges with period-over-period comparison
 */

import { useState } from 'react';
import {
  LineChart, Line, BarChart, Bar, AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend, ComposedChart, Cell, PieChart, Pie,
} from 'recharts';
import type { Formatter, ValueType, NameType } from 'recharts/types/component/DefaultTooltipContent';
import { Icon } from '../icons';
import { MockDataBadge, LiveDataBadge } from '../DataSourceIndicator';
import { useOpsMetrics, useOpsTrends } from './useOperationsApi';
import type { OperationsMetricsSummary, MetricsTrend } from '../../../api/client';

// ─── Types ───────────────────────────────────────────────────────────────────

type TimeRange = '7d' | '30d' | '90d' | '1y';
// 'unmeasured' is not a performance grade: it means nothing in this system
// produces the metric, so it must never be styled or labelled like a good result.
type MetricStatus = 'excellent' | 'good' | 'warning' | 'critical' | 'unmeasured';
type TabId = 'dora' | 'availability' | 'incidents' | 'alerts' | 'changes' | 'oncall' | 'sla' | 'trends';

interface DORAMetric {
  name: string;
  shortName: string;
  current: number;
  target: number;
  unit: string;
  trend: number; // % change from previous period
  status: MetricStatus;
  sparkline: number[];
}

interface AgentAvailability {
  agentName: string;
  availabilityPct: number;
  uptimeMinutes: number;
  downtimeMinutes: number;
  incidentCount: number;
  slaTarget: number;
  slaAchieved: boolean;
}

interface IncidentSeverity {
  severity: 'critical' | 'high' | 'medium' | 'low';
  count: number;
  avgResolutionMinutes: number;
  color: string;
}

interface AlertMetric {
  ruleName: string;
  alertCount: number;
  incidentCount: number;
  falsePositiveRate: number;
  avgAckMinutes: number;
}

interface ChangeMetric {
  date: string;
  total: number;
  successful: number;
  failed: number;
  rolledBack: number;
}

interface OnCallShift {
  person: string;
  shiftDate: string;
  pagesReceived: number;
  avgResponseMinutes: number;
  escalations: number;
  afterHoursPages: number;
}

interface SLAMetric {
  agentName: string;
  target: number;
  actual: number;
  breaches: number;
  errorBudgetRemaining: number;
  errorBudgetBurnRate: number;
}

// ─── Mock Data Generators ────────────────────────────────────────────────────

const generateSparkline = (base: number, variance: number, length: number, improving: boolean): number[] => {
  return Array.from({ length }, (_, i) => {
    const noise = (Math.random() - 0.5) * variance;
    const trend = improving ? -(i * variance / length / 3) : (i * variance / length / 3);
    return Math.max(0, base + noise + trend);
  });
};

const generateDailyTrend = (days: number, baseValue: number, variance: number, improving: boolean = true) => {
  const today = new Date('2026-08-11');
  return Array.from({ length: days }, (_, i) => {
    const date = new Date(today);
    date.setDate(date.getDate() - (days - 1 - i));
    const noise = (Math.random() - 0.5) * variance;
    const trend = improving ? -(i * variance / days / 2) : (i * variance / days / 2);
    return {
      date: date.toISOString().split('T')[0],
      value: Math.max(0, Math.round((baseValue + noise + trend) * 100) / 100),
    };
  });
};

const generateWeeklyTrend = (weeks: number, metrics: Record<string, { base: number; variance: number; improving: boolean }>) => {
  const today = new Date('2026-08-11');
  const currentWeek = Math.floor((today.getTime() - new Date(today.getFullYear(), 0, 1).getTime()) / (7 * 24 * 60 * 60 * 1000));

  return Array.from({ length: weeks }, (_, i) => {
    const weekNum = currentWeek - weeks + 1 + i;
    const result: Record<string, string | number> = { week: `W${weekNum}` };

    Object.entries(metrics).forEach(([key, config]) => {
      const noise = (Math.random() - 0.5) * config.variance;
      const trend = config.improving ? -(i * config.variance / weeks / 2) : (i * config.variance / weeks / 2);
      result[key] = Math.max(0, Math.round((config.base + noise + trend) * 100) / 100);
    });

    return result;
  });
};

// ─── Mock Data ───────────────────────────────────────────────────────────────

const DORA_METRICS: DORAMetric[] = [
  {
    name: 'Mean Time To Recovery',
    shortName: 'MTTR',
    current: 38,
    target: 30,
    unit: 'min',
    trend: -12,
    status: 'warning',
    sparkline: generateSparkline(45, 15, 14, true),
  },
  // Positional placeholder only. DORATab replaces the MTTD entry with an
  // explicitly-unmeasured card in both the live and the illustrative branch, so
  // these numbers are never rendered; they are kept so the DF card stays at
  // DORA_METRICS[3]. Do not "restore" a fabricated MTTD value here: detection
  // latency has no source in this platform.
  {
    name: 'Mean Time To Detection',
    shortName: 'MTTD',
    current: 0,
    target: 15,
    unit: 'min',
    trend: 0,
    status: 'unmeasured',
    sparkline: [],
  },
  {
    name: 'Change Failure Rate',
    shortName: 'CFR',
    current: 8.2,
    target: 5,
    unit: '%',
    trend: -5,
    status: 'warning',
    sparkline: generateSparkline(10, 4, 14, true),
  },
  {
    name: 'Deployment Frequency',
    shortName: 'DF',
    current: 4.2,
    target: 3,
    unit: '/day',
    trend: 15,
    status: 'excellent',
    sparkline: generateSparkline(3.5, 1.5, 14, false),
  },
];

const AGENT_AVAILABILITY: AgentAvailability[] = [
  { agentName: 'KYC Verification Agent', availabilityPct: 99.95, uptimeMinutes: 43177, downtimeMinutes: 23, incidentCount: 1, slaTarget: 99.9, slaAchieved: true },
  { agentName: 'Fraud Detection Agent', availabilityPct: 99.87, uptimeMinutes: 43142, downtimeMinutes: 58, incidentCount: 3, slaTarget: 99.9, slaAchieved: false },
  { agentName: 'Customer Service Bot', availabilityPct: 99.98, uptimeMinutes: 43191, downtimeMinutes: 9, incidentCount: 1, slaTarget: 99.5, slaAchieved: true },
  { agentName: 'Trading Assistant', availabilityPct: 99.72, uptimeMinutes: 43079, downtimeMinutes: 121, incidentCount: 4, slaTarget: 99.9, slaAchieved: false },
  { agentName: 'Document Processor', availabilityPct: 99.91, uptimeMinutes: 43161, downtimeMinutes: 39, incidentCount: 2, slaTarget: 99.5, slaAchieved: true },
  { agentName: 'Claims Management', availabilityPct: 99.89, uptimeMinutes: 43152, downtimeMinutes: 48, incidentCount: 2, slaTarget: 99.9, slaAchieved: false },
];

const INCIDENT_SEVERITY: IncidentSeverity[] = [
  { severity: 'critical', count: 3, avgResolutionMinutes: 28, color: '#ef4444' },
  { severity: 'high', count: 8, avgResolutionMinutes: 45, color: '#f97316' },
  { severity: 'medium', count: 15, avgResolutionMinutes: 72, color: '#eab308' },
  { severity: 'low', count: 12, avgResolutionMinutes: 180, color: '#22c55e' },
];

const INCIDENT_TREND = generateWeeklyTrend(8, {
  incidents: { base: 10, variance: 4, improving: true },
  mttr: { base: 50, variance: 15, improving: true },
  repeatRate: { base: 12, variance: 5, improving: true },
});

const ALERT_METRICS: AlertMetric[] = [
  { ruleName: 'High Error Rate', alertCount: 45, incidentCount: 8, falsePositiveRate: 82.2, avgAckMinutes: 3.2 },
  { ruleName: 'Latency Threshold', alertCount: 38, incidentCount: 5, falsePositiveRate: 86.8, avgAckMinutes: 4.1 },
  { ruleName: 'Token Budget Exceeded', alertCount: 22, incidentCount: 12, falsePositiveRate: 45.5, avgAckMinutes: 2.8 },
  { ruleName: 'Memory Pressure', alertCount: 18, incidentCount: 2, falsePositiveRate: 88.9, avgAckMinutes: 5.5 },
  { ruleName: 'Guardrail Violation', alertCount: 15, incidentCount: 6, falsePositiveRate: 60.0, avgAckMinutes: 1.8 },
  { ruleName: 'Model Response Timeout', alertCount: 12, incidentCount: 4, falsePositiveRate: 66.7, avgAckMinutes: 2.2 },
];

const ALERT_TREND = generateWeeklyTrend(8, {
  totalAlerts: { base: 180, variance: 40, improving: true },
  incidents: { base: 12, variance: 4, improving: true },
  avgAckMinutes: { base: 4, variance: 2, improving: true },
});

const CHANGE_METRICS: ChangeMetric[] = Array.from({ length: 14 }, (_, i) => {
  const date = new Date('2026-08-11');
  date.setDate(date.getDate() - (13 - i));
  const total = Math.floor(4 + Math.random() * 6);
  const failed = Math.random() < 0.15 ? Math.floor(1 + Math.random() * 2) : 0;
  const rolledBack = failed > 0 && Math.random() < 0.7 ? Math.min(failed, Math.floor(1 + Math.random())) : 0;
  return {
    date: date.toISOString().split('T')[0],
    total,
    successful: total - failed,
    failed,
    rolledBack,
  };
});

const ONCALL_SHIFTS: OnCallShift[] = [
  { person: 'Alice Chen', shiftDate: '2026-08-10', pagesReceived: 8, avgResponseMinutes: 2.4, escalations: 1, afterHoursPages: 3 },
  { person: 'Bob Martinez', shiftDate: '2026-08-09', pagesReceived: 5, avgResponseMinutes: 3.1, escalations: 0, afterHoursPages: 2 },
  { person: 'Carol Singh', shiftDate: '2026-08-08', pagesReceived: 12, avgResponseMinutes: 1.8, escalations: 2, afterHoursPages: 6 },
  { person: 'David Kim', shiftDate: '2026-08-07', pagesReceived: 6, avgResponseMinutes: 2.9, escalations: 0, afterHoursPages: 1 },
  { person: 'Eva Johnson', shiftDate: '2026-08-06', pagesReceived: 9, avgResponseMinutes: 2.2, escalations: 1, afterHoursPages: 4 },
  { person: 'Frank Liu', shiftDate: '2026-08-05', pagesReceived: 4, avgResponseMinutes: 3.5, escalations: 0, afterHoursPages: 0 },
];

const ONCALL_TREND = generateWeeklyTrend(8, {
  pagesPerShift: { base: 8, variance: 4, improving: true },
  avgResponseMin: { base: 3, variance: 1.5, improving: true },
  escalationRate: { base: 15, variance: 8, improving: true },
  afterHoursRate: { base: 35, variance: 12, improving: true },
});

const SLA_METRICS: SLAMetric[] = [
  { agentName: 'KYC Verification Agent', target: 99.9, actual: 99.95, breaches: 0, errorBudgetRemaining: 85, errorBudgetBurnRate: 0.5 },
  { agentName: 'Fraud Detection Agent', target: 99.9, actual: 99.87, breaches: 2, errorBudgetRemaining: 42, errorBudgetBurnRate: 1.9 },
  { agentName: 'Customer Service Bot', target: 99.5, actual: 99.98, breaches: 0, errorBudgetRemaining: 96, errorBudgetBurnRate: 0.1 },
  { agentName: 'Trading Assistant', target: 99.9, actual: 99.72, breaches: 4, errorBudgetRemaining: 0, errorBudgetBurnRate: 3.8 },
  { agentName: 'Document Processor', target: 99.5, actual: 99.91, breaches: 0, errorBudgetRemaining: 82, errorBudgetBurnRate: 0.6 },
  { agentName: 'Claims Management', target: 99.9, actual: 99.89, breaches: 1, errorBudgetRemaining: 68, errorBudgetBurnRate: 1.1 },
];

const SLA_TREND = generateWeeklyTrend(8, {
  complianceRate: { base: 88, variance: 8, improving: true },
  breaches: { base: 3, variance: 2, improving: true },
  avgBurnRate: { base: 1.5, variance: 0.8, improving: true },
});

const AVAILABILITY_TREND = generateDailyTrend(30, 99.88, 0.15, true);

const DOWNTIME_BREAKDOWN = [
  { category: 'Planned Maintenance', minutes: 45, pct: 32, color: '#3b82f6' },
  { category: 'Unplanned Outages', minutes: 68, pct: 48, color: '#ef4444' },
  { category: 'Degraded Performance', minutes: 28, pct: 20, color: '#f59e0b' },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Format a percentage the backend may report as null. `sla_compliance_pct` is
 * null when no SLAs are defined: there is nothing to measure, so callers render
 * an em dash instead of 0% (reads as total non-compliance) or 100% (reads as
 * perfect compliance) under a Live badge. Returns null when there is no value,
 * so the caller can also drop the "healthy" green styling.
 */
function formatOptionalPct(value: number | null | undefined, digits = 0): string | null {
  return typeof value === 'number' ? `${value.toFixed(digits)}%` : null;
}

// ─── Helper Components ───────────────────────────────────────────────────────

const tooltipStyle = {
  contentStyle: { backgroundColor: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '12px' },
  labelStyle: { color: '#64748b', marginBottom: '4px' },
};

const statusColors: Record<MetricStatus, { bg: string; text: string; border: string }> = {
  excellent: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  good: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
  warning: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  critical: { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200' },
  // Neutral slate, never emerald: an unmeasured metric is an absence of data, not
  // a pass. Matches the "-" / text-slate-400 treatment used for SLA compliance.
  unmeasured: { bg: 'bg-slate-100', text: 'text-slate-500', border: 'border-slate-200' },
};

const statusLabels: Record<MetricStatus, string> = {
  excellent: 'Excellent',
  good: 'On Track',
  warning: 'Needs Work',
  critical: 'Critical',
  unmeasured: 'Not Measured',
};

function MiniSparkline({ data, color }: { data: number[]; color: string }) {
  const chartData = data.map((value, index) => ({ index, value }));
  return (
    <div className="h-8 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData}>
          <Area type="monotone" dataKey="value" stroke={color} fill={`${color}20`} strokeWidth={1.5} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function TrendIndicator({ value, inverse = false }: { value: number; inverse?: boolean }) {
  const isPositive = inverse ? value < 0 : value > 0;
  const absValue = Math.abs(value);
  return (
    <span className={`flex items-center gap-1 text-xs font-medium ${isPositive ? 'text-emerald-600' : 'text-rose-600'}`}>
      <Icon name={isPositive ? 'arrow-trending-up' : 'arrow-trending-up'} className={`w-3.5 h-3.5 ${!isPositive ? 'rotate-180' : ''}`} />
      {absValue}%
    </span>
  );
}

// ─── Tab Content Components ──────────────────────────────────────────────────

// DORA status thresholds (lower is better for MTTR/MTTD/CFR). Used to classify
// the live summary values into the shared MetricStatus buckets.
const mttrStatus = (m: number): MetricStatus => (m <= 30 ? 'excellent' : m <= 60 ? 'good' : m <= 120 ? 'warning' : 'critical');
/**
 * MTTD status. Accepts null and returns 'unmeasured' for it, so an absent value can
 * never be graded: the previous `(m: number) => m <= 15 ? 'excellent' : ...` turned
 * the backend's unmeasured MTTD (which arrived as 0) into a green "Excellent".
 */
const mttdStatus = (m: number | null): MetricStatus =>
  m === null ? 'unmeasured' : m <= 15 ? 'excellent' : m <= 30 ? 'good' : m <= 60 ? 'warning' : 'critical';
const cfrStatus = (p: number): MetricStatus => (p <= 5 ? 'excellent' : p <= 10 ? 'good' : p <= 15 ? 'warning' : 'critical');

/**
 * Detection latency has no source in this platform. Nothing writes an incident's
 * `ttd_minutes` (incidents are created by a manual POST, and `detected_at` is
 * stamped at creation time), so the backend reports `mttd_minutes` as null and there
 * is no illustrative value worth showing either. Same treatment as the MTTA note in
 * useIncidents.ts: render "-" rather than a number that measures nothing.
 */
const MTTD_UNMEASURED_NOTE = 'Not measured - no detection-latency source';

function DORATab({ summary }: { summary: OperationsMetricsSummary | null }) {
  type Card = Omit<DORAMetric, 'current'> & {
    /** null when nothing measures the metric: renders "-", never 0. */
    current: number | null;
    live: boolean;
    /** Replaces the "Target: N" line; used to explain an unmeasured metric. */
    footnote?: string;
  };

  // The backend sends mttd_minutes as null when detection latency is not measured.
  // client.ts still declares it `number`, so normalise defensively instead of
  // trusting the declared type (the shared type needs widening to `number | null`).
  const measuredMttd: number | null =
    summary && typeof summary.mttd_minutes === 'number' ? summary.mttd_minutes : null;

  // MTTD is unmeasured in both branches, so it is built once. It is only badged
  // "live" when a real value actually arrives.
  const mttdCard: Card = {
    name: 'Mean Time To Detection',
    shortName: 'MTTD',
    current: measuredMttd === null ? null : Math.round(measuredMttd),
    target: 15,
    unit: 'min',
    trend: 0,
    status: mttdStatus(measuredMttd),
    sparkline: [],
    live: measuredMttd !== null,
    footnote: measuredMttd === null ? MTTD_UNMEASURED_NOTE : undefined,
  };

  // When the live summary is present, MTTR/CFR come straight from it (no fabricated
  // sparkline/trend). Deployment Frequency has no live source, so it stays
  // illustrative and is badged. Without a summary the rest of the tab is mock.
  const cards: Card[] = summary
    ? [
        { name: 'Mean Time To Recovery', shortName: 'MTTR', current: Math.round(summary.mttr_minutes), target: 30, unit: 'min', trend: 0, status: mttrStatus(summary.mttr_minutes), sparkline: [], live: true },
        mttdCard,
        { name: 'Change Failure Rate', shortName: 'CFR', current: Math.round(summary.cfr_pct * 10) / 10, target: 5, unit: '%', trend: 0, status: cfrStatus(summary.cfr_pct), sparkline: [], live: true },
        { ...DORA_METRICS[3], live: false },
      ]
    : DORA_METRICS.map(m => (m.shortName === 'MTTD' ? mttdCard : { ...m, live: false }));

  return (
    <div className="space-y-6">
      {/* Hero DORA Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map(metric => (
          <div
            key={metric.shortName}
            className={`bg-white/80 backdrop-blur-sm rounded-xl border shadow-sm p-4 ${statusColors[metric.status].border}`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">{metric.name}</div>
              <div className="flex items-center gap-1">
                {/* An unmeasured metric is not demo data - it carries the
                    "Not Measured" pill and its own footnote instead. */}
                {summary && !metric.live && metric.current !== null && <MockDataBadge integration="No live deployment-frequency source" />}
                <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${statusColors[metric.status].bg} ${statusColors[metric.status].text}`}>
                  {statusLabels[metric.status]}
                </span>
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <span className={`text-3xl font-semibold ${
                metric.status === 'unmeasured' ? 'text-slate-400' :
                metric.status === 'excellent' ? 'text-emerald-600' :
                metric.status === 'good' ? 'text-blue-600' :
                metric.status === 'warning' ? 'text-amber-600' : 'text-rose-600'
              }`}>
                {metric.current ?? '—'}
              </span>
              {metric.current !== null && <span className="text-sm text-slate-400">{metric.unit}</span>}
            </div>
            <div className="flex items-center justify-between mt-1">
              <span className="text-xs text-slate-500">{metric.footnote ?? `Target: ${metric.target}${metric.unit}`}</span>
              {metric.sparkline.length > 0 && <TrendIndicator value={metric.trend} inverse={metric.shortName !== 'DF'} />}
            </div>
            {metric.sparkline.length > 0 && (
              <div className="mt-3">
                <MiniSparkline
                  data={metric.sparkline}
                  color={metric.status === 'excellent' ? '#10b981' : metric.status === 'good' ? '#3b82f6' : metric.status === 'warning' ? '#f59e0b' : '#ef4444'}
                />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* DORA Performance Summary */}
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
        <h3 className="text-sm font-semibold text-slate-900 mb-4">DORA Performance Classification</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[
            { level: 'Elite', df: '>1/day', ltc: '<1 hour', cfr: '0-15%', mttr: '<1 hour' },
            { level: 'High', df: '1/day-1/week', ltc: '1 day-1 week', cfr: '16-30%', mttr: '<1 day' },
            { level: 'Medium', df: '1/week-1/month', ltc: '1 week-1 month', cfr: '16-30%', mttr: '<1 week' },
            { level: 'Low', df: '<1/month', ltc: '>6 months', cfr: '16-30%', mttr: '>6 months' },
          ].map((tier, idx) => (
            <div
              key={tier.level}
              className={`p-3 rounded-lg border ${idx === 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'}`}
            >
              <div className={`text-sm font-semibold mb-2 ${idx === 0 ? 'text-emerald-700' : 'text-slate-700'}`}>
                {tier.level} Performer
              </div>
              <div className="space-y-1 text-[10px]">
                <div className="flex justify-between">
                  <span className="text-slate-500">Deploy Freq</span>
                  <span className="text-slate-700 font-medium">{tier.df}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Lead Time</span>
                  <span className="text-slate-700 font-medium">{tier.ltc}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">CFR</span>
                  <span className="text-slate-700 font-medium">{tier.cfr}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">MTTR</span>
                  <span className="text-slate-700 font-medium">{tier.mttr}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-100">
          <div className="text-xs text-blue-800">
            <span className="font-semibold">Current Classification: </span>
            {/* Only cite figures that are actually measured. MTTD was previously
                narrated as a live number while the backend was sending an
                unmeasured 0. */}
            {summary ? (
              measuredMttd !== null
                ? `Based on live MTTR (${Math.round(summary.mttr_minutes)}m), MTTD (${Math.round(measuredMttd)}m), and CFR (${Math.round(summary.cfr_pct * 10) / 10}%) measured over the last ${summary.measurement_period_days} days.`
                : `Based on live MTTR (${Math.round(summary.mttr_minutes)}m) and CFR (${Math.round(summary.cfr_pct * 10) / 10}%) measured over the last ${summary.measurement_period_days} days. MTTD is excluded: nothing in this platform measures detection latency.`
            ) : (
              <>Based on MTTR (38m), CFR (8.2%), and DF (4.2/day), this fleet is performing at the <span className="font-semibold">High to Elite</span> level across most metrics. Focus area: reduce Change Failure Rate to below 5%. MTTD is excluded: nothing in this platform measures detection latency.</>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function AvailabilityTab({ summary }: { summary: OperationsMetricsSummary | null }) {
  const totalUptime = AGENT_AVAILABILITY.reduce((s, a) => s + a.uptimeMinutes, 0);
  const totalDowntime = AGENT_AVAILABILITY.reduce((s, a) => s + a.downtimeMinutes, 0);
  const mockFleetAvailability = (totalUptime / (totalUptime + totalDowntime) * 100).toFixed(2);
  const mockSlaAchievement = (AGENT_AVAILABILITY.filter(a => a.slaAchieved).length / AGENT_AVAILABILITY.length * 100).toFixed(0);
  // Headline cards come from the live summary when present; per-agent detail,
  // downtime breakdown and availability history stay illustrative (badged).
  // Live path: the backend's `availability_pct` is a snapshot share of agents reporting
  // healthy, and it is null when nothing was measured (no agents discovered, or every
  // agent's health is UNKNOWN). It is NOT uptime over a window, so it gets a different
  // label and caption from the illustrative fallback below, which genuinely is computed
  // from uptime/downtime minutes.
  const fleetHealth = summary ? formatOptionalPct(summary.availability_pct, 2) : null;
  // null when the backend has no SLAs to measure -> render "-", never 0%.
  const slaAchievementRate = summary
    ? formatOptionalPct(summary.sla_compliance_pct)
    : `${mockSlaAchievement}%`;

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Three separate claims used to be wrong on this one tile: it called a
            point-in-time healthy-agent ratio "Fleet Availability", captioned it with a
            measurement window the number does not cover, and painted it emerald
            unconditionally - so an all-UNKNOWN fleet rendered a green 0.00%. */}
        <div className={`bg-white/80 backdrop-blur-sm rounded-xl border shadow-sm p-4 ${
          summary && !fleetHealth ? 'border-slate-200/60' : 'border-emerald-200'
        }`}>
          <div className="text-[11px] font-medium text-slate-500 uppercase">
            {summary ? 'Fleet Health' : 'Fleet Availability'}
          </div>
          <div
            className={`text-3xl font-semibold mt-1 ${fleetHealth || !summary ? 'text-emerald-600' : 'text-slate-400'}`}
            title={
              summary
                ? fleetHealth
                  ? 'Share of discovered agents reporting healthy right now. A snapshot, not uptime: nothing in this platform samples agent health over time, so it carries no measurement window.'
                  : 'Fleet health was not measured - either no agents were discovered, or every agent health check resolved to UNKNOWN. Shown as no data rather than 0%.'
                : undefined
            }
          >
            {summary ? (fleetHealth ?? '—') : `${mockFleetAvailability}%`}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            {summary
              ? (fleetHealth ? 'healthy agents, right now' : 'health not measured for any agent')
              : '30-day rolling average'}
          </div>
        </div>
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-4">
          <div className="flex items-center justify-between">
            <div className="text-[11px] font-medium text-slate-500 uppercase">Total Downtime</div>
            {summary && <MockDataBadge integration="Per-agent downtime source" />}
          </div>
          <div className="text-3xl font-semibold text-rose-600 mt-1">{totalDowntime}m</div>
          <div className="text-xs text-slate-500 mt-1">Across all agents</div>
        </div>
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-4">
          <div className="text-[11px] font-medium text-slate-500 uppercase">SLA Compliance</div>
          <div className={`text-3xl font-semibold mt-1 ${slaAchievementRate ? 'text-blue-600' : 'text-slate-400'}`}>
            {slaAchievementRate ?? '—'}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            {summary
              ? (slaAchievementRate ? 'fleet SLA compliance' : 'no SLAs defined - nothing to measure')
              : `${AGENT_AVAILABILITY.filter(a => a.slaAchieved).length}/${AGENT_AVAILABILITY.length} agents`}
          </div>
        </div>
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-4">
          <div className="text-[11px] font-medium text-slate-500 uppercase">Total Incidents</div>
          <div className="text-3xl font-semibold text-slate-900 mt-1">{summary ? summary.incident_count_30d : AGENT_AVAILABILITY.reduce((s, a) => s + a.incidentCount, 0)}</div>
          <div className="text-xs text-slate-500 mt-1">{summary ? `Last ${summary.measurement_period_days} days` : 'Impacting availability'}</div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Availability Trend */}
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-slate-900">Availability Trend (30 days)</h3>
            {summary && <MockDataBadge integration="Per-interval availability history" />}
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={AVAILABILITY_TREND}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="#94a3b8" tickFormatter={d => d.slice(5)} />
                <YAxis domain={[99.5, 100]} tick={{ fontSize: 10 }} stroke="#94a3b8" />
                <Tooltip {...tooltipStyle} formatter={((v: number) => `${v.toFixed(2)}%`) as Formatter<ValueType, NameType>} />
                <Line type="monotone" dataKey="value" name="Availability" stroke="#10b981" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Downtime Breakdown */}
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-slate-900">Downtime Analysis</h3>
            {summary && <MockDataBadge integration="Downtime categorization source" />}
          </div>
          <div className="flex items-center gap-6">
            <div className="w-40 h-40">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={DOWNTIME_BREAKDOWN}
                    dataKey="minutes"
                    nameKey="category"
                    cx="50%"
                    cy="50%"
                    innerRadius={35}
                    outerRadius={60}
                  >
                    {DOWNTIME_BREAKDOWN.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip {...tooltipStyle} formatter={((v: number) => `${v} minutes`) as Formatter<ValueType, NameType>} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex-1 space-y-3">
              {DOWNTIME_BREAKDOWN.map(d => (
                <div key={d.category}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded" style={{ backgroundColor: d.color }} />
                      <span className="text-slate-600">{d.category}</span>
                    </span>
                    <span className="text-slate-500">{d.minutes}m ({d.pct}%)</span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${d.pct}%`, backgroundColor: d.color }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Per-Agent Availability Table */}
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">Per-Agent Availability</h3>
          {summary && <MockDataBadge integration="Per-agent availability breakdown" />}
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] text-slate-400 uppercase tracking-wide bg-slate-50/50">
              <th className="text-left py-2.5 px-4 font-medium">Agent</th>
              <th className="text-center py-2.5 px-3 font-medium">Availability</th>
              <th className="text-center py-2.5 px-3 font-medium">Downtime</th>
              <th className="text-center py-2.5 px-3 font-medium">Incidents</th>
              <th className="text-center py-2.5 px-3 font-medium">SLA Target</th>
              <th className="text-center py-2.5 px-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {AGENT_AVAILABILITY.map(agent => (
              <tr key={agent.agentName} className="border-t border-slate-100 hover:bg-slate-50/60">
                <td className="py-2.5 px-4 font-medium text-slate-900">{agent.agentName}</td>
                <td className="py-2.5 px-3 text-center">
                  <span className={`font-semibold ${agent.availabilityPct >= 99.9 ? 'text-emerald-600' : agent.availabilityPct >= 99.5 ? 'text-amber-600' : 'text-rose-600'}`}>
                    {agent.availabilityPct}%
                  </span>
                </td>
                <td className="py-2.5 px-3 text-center text-slate-600">{agent.downtimeMinutes}m</td>
                <td className="py-2.5 px-3 text-center text-slate-600">{agent.incidentCount}</td>
                <td className="py-2.5 px-3 text-center text-slate-500">{agent.slaTarget}%</td>
                <td className="py-2.5 px-3 text-center">
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                    agent.slaAchieved ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                  }`}>
                    {agent.slaAchieved ? 'SLA Met' : 'SLA Breach'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function IncidentsTab() {
  const totalIncidents = INCIDENT_SEVERITY.reduce((s, i) => s + i.count, 0);
  const avgResolution = Math.round(INCIDENT_SEVERITY.reduce((s, i) => s + i.avgResolutionMinutes * i.count, 0) / totalIncidents);
  const postmortemRate = 85; // Mock
  const repeatRate = 8; // Mock %

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-4">
          <div className="text-[11px] font-medium text-slate-500 uppercase">Total Incidents</div>
          <div className="text-3xl font-semibold text-slate-900 mt-1">{totalIncidents}</div>
          <div className="text-xs text-slate-500 mt-1">Last 30 days</div>
        </div>
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-rose-200 shadow-sm p-4">
          <div className="text-[11px] font-medium text-slate-500 uppercase">Critical/High</div>
          <div className="text-3xl font-semibold text-rose-600 mt-1">{INCIDENT_SEVERITY[0].count + INCIDENT_SEVERITY[1].count}</div>
          <div className="text-xs text-slate-500 mt-1">Requiring immediate action</div>
        </div>
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-4">
          <div className="text-[11px] font-medium text-slate-500 uppercase">Avg Resolution</div>
          <div className="text-3xl font-semibold text-blue-600 mt-1">{avgResolution}m</div>
          <div className="text-xs text-slate-500 mt-1">Across all severities</div>
        </div>
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-4">
          <div className="text-[11px] font-medium text-slate-500 uppercase">Repeat Rate</div>
          <div className="text-3xl font-semibold text-amber-600 mt-1">{repeatRate}%</div>
          <div className="text-xs text-slate-500 mt-1">Same root cause</div>
        </div>
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-emerald-200 shadow-sm p-4">
          <div className="text-[11px] font-medium text-slate-500 uppercase">Postmortem Rate</div>
          <div className="text-3xl font-semibold text-emerald-600 mt-1">{postmortemRate}%</div>
          <div className="text-xs text-slate-500 mt-1">Completed reviews</div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Severity Distribution */}
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-4">
          <h3 className="text-sm font-semibold text-slate-900 mb-4">Incidents by Severity</h3>
          <div className="grid grid-cols-4 gap-3 mb-4">
            {INCIDENT_SEVERITY.map(s => (
              <div key={s.severity} className="text-center">
                <div className="text-2xl font-semibold" style={{ color: s.color }}>{s.count}</div>
                <div className="text-[10px] text-slate-500 uppercase capitalize">{s.severity}</div>
                <div className="text-[10px] text-slate-400 mt-0.5">Avg: {s.avgResolutionMinutes}m</div>
              </div>
            ))}
          </div>
          <div className="flex gap-1 h-3 rounded-full overflow-hidden">
            {INCIDENT_SEVERITY.map(s => (
              <div
                key={s.severity}
                className="h-full"
                style={{ backgroundColor: s.color, flex: s.count }}
              />
            ))}
          </div>
        </div>

        {/* Weekly Trend */}
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-4">
          <h3 className="text-sm font-semibold text-slate-900 mb-4">Weekly Incident Trend</h3>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={INCIDENT_TREND}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="week" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                <YAxis yAxisId="left" tick={{ fontSize: 10 }} stroke="#94a3b8" />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} stroke="#94a3b8" />
                <Tooltip {...tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: '11px' }} />
                <Bar yAxisId="left" dataKey="incidents" name="Incidents" fill="#f97316" radius={[4, 4, 0, 0]} />
                <Line yAxisId="right" type="monotone" dataKey="mttr" name="MTTR (min)" stroke="#3b82f6" strokeWidth={2} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Resolution Time Distribution */}
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-4">
        <h3 className="text-sm font-semibold text-slate-900 mb-4">Resolution Time by Severity</h3>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={INCIDENT_SEVERITY} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10 }} stroke="#94a3b8" unit=" min" />
              <YAxis type="category" dataKey="severity" tick={{ fontSize: 11 }} stroke="#94a3b8" width={80} />
              <Tooltip {...tooltipStyle} formatter={((v: number) => `${v} minutes`) as Formatter<ValueType, NameType>} />
              <Bar dataKey="avgResolutionMinutes" name="Avg Resolution Time" radius={[0, 4, 4, 0]}>
                {INCIDENT_SEVERITY.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

function AlertsTab() {
  const totalAlerts = ALERT_METRICS.reduce((s, a) => s + a.alertCount, 0);
  const totalIncidents = ALERT_METRICS.reduce((s, a) => s + a.incidentCount, 0);
  const overallNoiseRatio = ((1 - totalIncidents / totalAlerts) * 100).toFixed(1);
  const avgAck = (ALERT_METRICS.reduce((s, a) => s + a.avgAckMinutes * a.alertCount, 0) / totalAlerts).toFixed(1);

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-4">
          <div className="text-[11px] font-medium text-slate-500 uppercase">Total Alerts</div>
          <div className="text-3xl font-semibold text-slate-900 mt-1">{totalAlerts}</div>
          <div className="text-xs text-slate-500 mt-1">Last 30 days</div>
        </div>
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-rose-200 shadow-sm p-4">
          <div className="text-[11px] font-medium text-slate-500 uppercase">Alert-to-Incident Ratio</div>
          <div className="text-3xl font-semibold text-rose-600 mt-1">{(totalAlerts / totalIncidents).toFixed(1)}:1</div>
          <div className="text-xs text-slate-500 mt-1">{overallNoiseRatio}% noise</div>
        </div>
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-4">
          <div className="text-[11px] font-medium text-slate-500 uppercase">Avg Time to Ack</div>
          <div className="text-3xl font-semibold text-blue-600 mt-1">{avgAck}m</div>
          <div className="text-xs text-slate-500 mt-1">Target: &lt;5 minutes</div>
        </div>
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-emerald-200 shadow-sm p-4">
          <div className="text-[11px] font-medium text-slate-500 uppercase">True Positive Rate</div>
          <div className="text-3xl font-semibold text-emerald-600 mt-1">{(100 - parseFloat(overallNoiseRatio)).toFixed(1)}%</div>
          <div className="text-xs text-slate-500 mt-1">{totalIncidents} actionable alerts</div>
        </div>
      </div>

      {/* Alert Trend */}
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-4">
        <h3 className="text-sm font-semibold text-slate-900 mb-4">Alert Volume Trend</h3>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={ALERT_TREND}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="week" tick={{ fontSize: 11 }} stroke="#94a3b8" />
              <YAxis yAxisId="left" tick={{ fontSize: 10 }} stroke="#94a3b8" />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} stroke="#94a3b8" />
              <Tooltip {...tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: '11px' }} />
              <Bar yAxisId="left" dataKey="totalAlerts" name="Total Alerts" fill="#94a3b8" radius={[4, 4, 0, 0]} />
              <Bar yAxisId="left" dataKey="incidents" name="Incidents" fill="#f97316" radius={[4, 4, 0, 0]} />
              <Line yAxisId="right" type="monotone" dataKey="avgAckMinutes" name="Avg Ack (min)" stroke="#3b82f6" strokeWidth={2} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Noisiest Rules Table */}
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-900">Alert Rules Analysis</h3>
          <p className="text-xs text-slate-500 mt-0.5">Sorted by false positive rate - highest noise first</p>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] text-slate-400 uppercase tracking-wide bg-slate-50/50">
              <th className="text-left py-2.5 px-4 font-medium">Rule</th>
              <th className="text-center py-2.5 px-3 font-medium">Alerts</th>
              <th className="text-center py-2.5 px-3 font-medium">Incidents</th>
              <th className="text-center py-2.5 px-3 font-medium">False Positive %</th>
              <th className="text-center py-2.5 px-3 font-medium">Avg Ack Time</th>
              <th className="text-center py-2.5 px-3 font-medium">Noise Level</th>
            </tr>
          </thead>
          <tbody>
            {[...ALERT_METRICS].sort((a, b) => b.falsePositiveRate - a.falsePositiveRate).map(alert => (
              <tr key={alert.ruleName} className="border-t border-slate-100 hover:bg-slate-50/60">
                <td className="py-2.5 px-4 font-medium text-slate-900">{alert.ruleName}</td>
                <td className="py-2.5 px-3 text-center text-slate-600">{alert.alertCount}</td>
                <td className="py-2.5 px-3 text-center text-slate-600">{alert.incidentCount}</td>
                <td className="py-2.5 px-3 text-center">
                  <span className={`font-semibold ${alert.falsePositiveRate > 80 ? 'text-rose-600' : alert.falsePositiveRate > 60 ? 'text-amber-600' : 'text-emerald-600'}`}>
                    {alert.falsePositiveRate.toFixed(1)}%
                  </span>
                </td>
                <td className="py-2.5 px-3 text-center text-slate-600">{alert.avgAckMinutes}m</td>
                <td className="py-2.5 px-3 text-center">
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                    alert.falsePositiveRate > 80 ? 'bg-rose-100 text-rose-700' :
                    alert.falsePositiveRate > 60 ? 'bg-amber-100 text-amber-700' :
                    'bg-emerald-100 text-emerald-700'
                  }`}>
                    {alert.falsePositiveRate > 80 ? 'Very Noisy' : alert.falsePositiveRate > 60 ? 'Noisy' : 'Healthy'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ChangesTab() {
  const totals = CHANGE_METRICS.reduce((acc, c) => ({
    total: acc.total + c.total,
    successful: acc.successful + c.successful,
    failed: acc.failed + c.failed,
    rolledBack: acc.rolledBack + c.rolledBack,
  }), { total: 0, successful: 0, failed: 0, rolledBack: 0 });

  const successRate = ((totals.successful / totals.total) * 100).toFixed(1);
  const rollbackRate = ((totals.rolledBack / totals.total) * 100).toFixed(1);
  const avgLeadTime = 4.2; // Mock hours

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-4">
          <div className="text-[11px] font-medium text-slate-500 uppercase">Total Changes</div>
          <div className="text-3xl font-semibold text-slate-900 mt-1">{totals.total}</div>
          <div className="text-xs text-slate-500 mt-1">Last 14 days</div>
        </div>
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-emerald-200 shadow-sm p-4">
          <div className="text-[11px] font-medium text-slate-500 uppercase">Success Rate</div>
          <div className="text-3xl font-semibold text-emerald-600 mt-1">{successRate}%</div>
          <div className="text-xs text-slate-500 mt-1">{totals.successful} successful</div>
        </div>
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-rose-200 shadow-sm p-4">
          <div className="text-[11px] font-medium text-slate-500 uppercase">Failed Changes</div>
          <div className="text-3xl font-semibold text-rose-600 mt-1">{totals.failed}</div>
          <div className="text-xs text-slate-500 mt-1">{(totals.failed / totals.total * 100).toFixed(1)}% failure rate</div>
        </div>
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-amber-200 shadow-sm p-4">
          <div className="text-[11px] font-medium text-slate-500 uppercase">Rollbacks</div>
          <div className="text-3xl font-semibold text-amber-600 mt-1">{totals.rolledBack}</div>
          <div className="text-xs text-slate-500 mt-1">{rollbackRate}% rollback rate</div>
        </div>
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-4">
          <div className="text-[11px] font-medium text-slate-500 uppercase">Lead Time</div>
          <div className="text-3xl font-semibold text-blue-600 mt-1">{avgLeadTime}h</div>
          <div className="text-xs text-slate-500 mt-1">Avg commit to deploy</div>
        </div>
      </div>

      {/* Change Volume Chart */}
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-4">
        <h3 className="text-sm font-semibold text-slate-900 mb-4">Daily Change Volume</h3>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={CHANGE_METRICS}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="#94a3b8" tickFormatter={d => d.slice(5)} />
              <YAxis tick={{ fontSize: 10 }} stroke="#94a3b8" />
              <Tooltip {...tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: '11px' }} />
              <Bar dataKey="successful" name="Successful" stackId="a" fill="#10b981" />
              <Bar dataKey="failed" name="Failed" stackId="a" fill="#ef4444" />
              <Bar dataKey="rolledBack" name="Rolled Back" stackId="a" fill="#f59e0b" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Change-Related Incidents */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-4">
          <h3 className="text-sm font-semibold text-slate-900 mb-4">Change-Related Incidents</h3>
          <div className="space-y-3">
            {[
              { change: 'Model version upgrade v2.3.1', incident: 'Latency spike on Fraud Agent', time: '2h ago', severity: 'high' },
              { change: 'Guardrail policy update', incident: 'False positive rate increase', time: '1d ago', severity: 'medium' },
              { change: 'Infrastructure scaling', incident: 'Cold start timeouts', time: '3d ago', severity: 'low' },
            ].map((item, i) => (
              <div key={i} className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg">
                <Icon name="exclamation-triangle" className={`w-4 h-4 mt-0.5 ${item.severity === 'high' ? 'text-rose-500' : item.severity === 'medium' ? 'text-amber-500' : 'text-slate-400'}`} />
                <div className="flex-1">
                  <div className="text-xs font-medium text-slate-900">{item.incident}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">Caused by: {item.change}</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">{item.time}</div>
                </div>
                <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full capitalize ${
                  item.severity === 'high' ? 'bg-rose-100 text-rose-700' :
                  item.severity === 'medium' ? 'bg-amber-100 text-amber-700' :
                  'bg-slate-100 text-slate-700'
                }`}>
                  {item.severity}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-4">
          <h3 className="text-sm font-semibold text-slate-900 mb-4">Change Type Distribution</h3>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={[
                    { name: 'Model Updates', value: 35, color: '#3b82f6' },
                    { name: 'Config Changes', value: 28, color: '#8b5cf6' },
                    { name: 'Infrastructure', value: 22, color: '#10b981' },
                    { name: 'Guardrail Updates', value: 15, color: '#f59e0b' },
                  ]}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={40}
                  outerRadius={70}
                >
                  {[
                    { name: 'Model Updates', value: 35, color: '#3b82f6' },
                    { name: 'Config Changes', value: 28, color: '#8b5cf6' },
                    { name: 'Infrastructure', value: 22, color: '#10b981' },
                    { name: 'Guardrail Updates', value: 15, color: '#f59e0b' },
                  ].map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip {...tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: '11px' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}

function OnCallTab() {
  const totals = ONCALL_SHIFTS.reduce((acc, s) => ({
    pages: acc.pages + s.pagesReceived,
    escalations: acc.escalations + s.escalations,
    afterHours: acc.afterHours + s.afterHoursPages,
    responseSum: acc.responseSum + s.avgResponseMinutes * s.pagesReceived,
  }), { pages: 0, escalations: 0, afterHours: 0, responseSum: 0 });

  const avgPagesPerShift = (totals.pages / ONCALL_SHIFTS.length).toFixed(1);
  const avgResponseTime = (totals.responseSum / totals.pages).toFixed(1);
  const afterHoursRate = ((totals.afterHours / totals.pages) * 100).toFixed(0);
  const escalationRate = ((totals.escalations / totals.pages) * 100).toFixed(0);

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-4">
          <div className="text-[11px] font-medium text-slate-500 uppercase">Avg Pages/Shift</div>
          <div className="text-3xl font-semibold text-slate-900 mt-1">{avgPagesPerShift}</div>
          <div className="text-xs text-slate-500 mt-1">Target: &lt;10</div>
        </div>
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-emerald-200 shadow-sm p-4">
          <div className="text-[11px] font-medium text-slate-500 uppercase">Avg Response Time</div>
          <div className="text-3xl font-semibold text-emerald-600 mt-1">{avgResponseTime}m</div>
          <div className="text-xs text-slate-500 mt-1">Target: &lt;5 minutes</div>
        </div>
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-amber-200 shadow-sm p-4">
          <div className="text-[11px] font-medium text-slate-500 uppercase">After-Hours Rate</div>
          <div className="text-3xl font-semibold text-amber-600 mt-1">{afterHoursRate}%</div>
          <div className="text-xs text-slate-500 mt-1">{totals.afterHours} of {totals.pages} pages</div>
        </div>
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-4">
          <div className="text-[11px] font-medium text-slate-500 uppercase">Escalation Rate</div>
          <div className="text-3xl font-semibold text-blue-600 mt-1">{escalationRate}%</div>
          <div className="text-xs text-slate-500 mt-1">{totals.escalations} escalations</div>
        </div>
      </div>

      {/* On-Call Trend */}
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-4">
        <h3 className="text-sm font-semibold text-slate-900 mb-4">On-Call Metrics Trend</h3>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={ONCALL_TREND}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="week" tick={{ fontSize: 11 }} stroke="#94a3b8" />
              <YAxis yAxisId="left" tick={{ fontSize: 10 }} stroke="#94a3b8" />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} stroke="#94a3b8" domain={[0, 50]} />
              <Tooltip {...tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: '11px' }} />
              <Bar yAxisId="left" dataKey="pagesPerShift" name="Pages/Shift" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              <Line yAxisId="right" type="monotone" dataKey="afterHoursRate" name="After-Hours %" stroke="#f59e0b" strokeWidth={2} />
              <Line yAxisId="right" type="monotone" dataKey="escalationRate" name="Escalation %" stroke="#ef4444" strokeWidth={2} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Recent Shifts Table */}
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-900">Recent On-Call Shifts</h3>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] text-slate-400 uppercase tracking-wide bg-slate-50/50">
              <th className="text-left py-2.5 px-4 font-medium">Engineer</th>
              <th className="text-center py-2.5 px-3 font-medium">Date</th>
              <th className="text-center py-2.5 px-3 font-medium">Pages</th>
              <th className="text-center py-2.5 px-3 font-medium">Avg Response</th>
              <th className="text-center py-2.5 px-3 font-medium">Escalations</th>
              <th className="text-center py-2.5 px-3 font-medium">After-Hours</th>
              <th className="text-center py-2.5 px-3 font-medium">Load</th>
            </tr>
          </thead>
          <tbody>
            {ONCALL_SHIFTS.map(shift => (
              <tr key={`${shift.person}-${shift.shiftDate}`} className="border-t border-slate-100 hover:bg-slate-50/60">
                <td className="py-2.5 px-4 font-medium text-slate-900">{shift.person}</td>
                <td className="py-2.5 px-3 text-center text-slate-600">{shift.shiftDate}</td>
                <td className="py-2.5 px-3 text-center text-slate-600">{shift.pagesReceived}</td>
                <td className="py-2.5 px-3 text-center">
                  <span className={`${shift.avgResponseMinutes < 3 ? 'text-emerald-600' : shift.avgResponseMinutes < 5 ? 'text-amber-600' : 'text-rose-600'}`}>
                    {shift.avgResponseMinutes}m
                  </span>
                </td>
                <td className="py-2.5 px-3 text-center text-slate-600">{shift.escalations}</td>
                <td className="py-2.5 px-3 text-center text-slate-600">{shift.afterHoursPages}</td>
                <td className="py-2.5 px-3 text-center">
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                    shift.pagesReceived > 10 ? 'bg-rose-100 text-rose-700' :
                    shift.pagesReceived > 6 ? 'bg-amber-100 text-amber-700' :
                    'bg-emerald-100 text-emerald-700'
                  }`}>
                    {shift.pagesReceived > 10 ? 'Heavy' : shift.pagesReceived > 6 ? 'Moderate' : 'Light'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Coverage Gaps Alert */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <Icon name="exclamation-triangle" className="w-5 h-5 text-amber-500 mt-0.5" />
          <div>
            <div className="text-sm font-semibold text-amber-800">Coverage Gap Detected</div>
            <div className="text-xs text-amber-700 mt-1">
              Weekend coverage (Aug 16-17) has only 1 engineer assigned. Consider adding backup coverage or adjusting rotation.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SLATab({ summary }: { summary: OperationsMetricsSummary | null }) {
  const mockCompliance = (SLA_METRICS.filter(s => s.actual >= s.target).length / SLA_METRICS.length * 100).toFixed(0);
  // SLA compliance headline comes from the live summary; breaches / burn rate /
  // per-agent detail have no live source and stay illustrative (badged).
  // null when the backend has no SLAs to measure -> render "-" in neutral slate,
  // never 0% under an emerald "healthy" card.
  const overallCompliance = summary ? formatOptionalPct(summary.sla_compliance_pct) : `${mockCompliance}%`;
  const totalBreaches = SLA_METRICS.reduce((s, m) => s + m.breaches, 0);
  const avgBurnRate = (SLA_METRICS.reduce((s, m) => s + m.errorBudgetBurnRate, 0) / SLA_METRICS.length).toFixed(1);
  const budgetExhausted = SLA_METRICS.filter(s => s.errorBudgetRemaining === 0).length;

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className={`bg-white/80 backdrop-blur-sm rounded-xl border shadow-sm p-4 ${overallCompliance ? 'border-emerald-200' : 'border-slate-200/60'}`}>
          <div className="text-[11px] font-medium text-slate-500 uppercase">SLA Compliance</div>
          <div className={`text-3xl font-semibold mt-1 ${overallCompliance ? 'text-emerald-600' : 'text-slate-400'}`}>
            {overallCompliance ?? '—'}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            {summary
              ? (overallCompliance ? 'fleet SLA compliance' : 'no SLAs defined - nothing to measure')
              : `${SLA_METRICS.filter(s => s.actual >= s.target).length}/${SLA_METRICS.length} agents`}
          </div>
        </div>
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-rose-200 shadow-sm p-4">
          <div className="flex items-center justify-between">
            <div className="text-[11px] font-medium text-slate-500 uppercase">Total Breaches</div>
            {summary && <MockDataBadge integration="Per-agent breach source" />}
          </div>
          <div className="text-3xl font-semibold text-rose-600 mt-1">{totalBreaches}</div>
          <div className="text-xs text-slate-500 mt-1">Last 30 days</div>
        </div>
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-amber-200 shadow-sm p-4">
          <div className="flex items-center justify-between">
            <div className="text-[11px] font-medium text-slate-500 uppercase">Avg Burn Rate</div>
            {summary && <MockDataBadge integration="Error budget source" />}
          </div>
          <div className="text-3xl font-semibold text-amber-600 mt-1">{avgBurnRate}x</div>
          <div className="text-xs text-slate-500 mt-1">Error budget consumption</div>
        </div>
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-4">
          <div className="flex items-center justify-between">
            <div className="text-[11px] font-medium text-slate-500 uppercase">Budget Exhausted</div>
            {summary && <MockDataBadge integration="Error budget source" />}
          </div>
          <div className="text-3xl font-semibold text-slate-900 mt-1">{budgetExhausted}</div>
          <div className="text-xs text-slate-500 mt-1">Agents at risk</div>
        </div>
      </div>

      {/* SLA Trend */}
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-slate-900">SLA Compliance Trend</h3>
          {summary && <MockDataBadge integration="SLA compliance history" />}
        </div>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={SLA_TREND}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="week" tick={{ fontSize: 11 }} stroke="#94a3b8" />
              <YAxis yAxisId="left" domain={[70, 100]} tick={{ fontSize: 10 }} stroke="#94a3b8" />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} stroke="#94a3b8" />
              <Tooltip {...tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: '11px' }} />
              <Area yAxisId="left" type="monotone" dataKey="complianceRate" name="Compliance %" fill="#10b98120" stroke="#10b981" strokeWidth={2} />
              <Bar yAxisId="right" dataKey="breaches" name="Breaches" fill="#ef4444" radius={[4, 4, 0, 0]} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Per-Agent SLA Table */}
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">Per-Agent SLA Performance</h3>
          {summary && <MockDataBadge integration="Per-agent SLA breakdown" />}
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] text-slate-400 uppercase tracking-wide bg-slate-50/50">
              <th className="text-left py-2.5 px-4 font-medium">Agent</th>
              <th className="text-center py-2.5 px-3 font-medium">Target</th>
              <th className="text-center py-2.5 px-3 font-medium">Actual</th>
              <th className="text-center py-2.5 px-3 font-medium">Breaches</th>
              <th className="text-center py-2.5 px-3 font-medium">Error Budget</th>
              <th className="text-center py-2.5 px-3 font-medium">Burn Rate</th>
              <th className="text-center py-2.5 px-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {SLA_METRICS.map(sla => (
              <tr key={sla.agentName} className="border-t border-slate-100 hover:bg-slate-50/60">
                <td className="py-2.5 px-4 font-medium text-slate-900">{sla.agentName}</td>
                <td className="py-2.5 px-3 text-center text-slate-500">{sla.target}%</td>
                <td className="py-2.5 px-3 text-center">
                  <span className={`font-semibold ${sla.actual >= sla.target ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {sla.actual}%
                  </span>
                </td>
                <td className="py-2.5 px-3 text-center">
                  <span className={sla.breaches > 0 ? 'text-rose-600 font-medium' : 'text-slate-400'}>
                    {sla.breaches}
                  </span>
                </td>
                <td className="py-2.5 px-3 text-center">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          sla.errorBudgetRemaining > 50 ? 'bg-emerald-500' :
                          sla.errorBudgetRemaining > 20 ? 'bg-amber-500' : 'bg-rose-500'
                        }`}
                        style={{ width: `${sla.errorBudgetRemaining}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-slate-500 w-8">{sla.errorBudgetRemaining}%</span>
                  </div>
                </td>
                <td className="py-2.5 px-3 text-center">
                  <span className={`${sla.errorBudgetBurnRate > 2 ? 'text-rose-600' : sla.errorBudgetBurnRate > 1 ? 'text-amber-600' : 'text-slate-600'}`}>
                    {sla.errorBudgetBurnRate}x
                  </span>
                </td>
                <td className="py-2.5 px-3 text-center">
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                    sla.errorBudgetRemaining === 0 ? 'bg-rose-100 text-rose-700' :
                    sla.actual >= sla.target ? 'bg-emerald-100 text-emerald-700' :
                    'bg-amber-100 text-amber-700'
                  }`}>
                    {sla.errorBudgetRemaining === 0 ? 'At Risk' : sla.actual >= sla.target ? 'Healthy' : 'Warning'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TrendsTab({ timeRange, trends, isTrendsLive }: { timeRange: TimeRange; trends: MetricsTrend[] | null; isTrendsLive: boolean }) {
  // Live metric-trend series when the trends API reports live data — one chart per
  // returned series, driven entirely by the backend points (no fabricated data).
  if (isTrendsLive && trends && trends.length > 0) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {trends.map(series => {
            const data = series.points.map(p => ({
              t: p.label || new Date(p.timestamp).toISOString().slice(5, 10),
              value: p.value,
            }));
            return (
              <div key={series.metric_name} className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-slate-900 capitalize">{series.metric_name.replace(/_/g, ' ')}</h3>
                  <span className="text-[10px] text-slate-400">{series.unit}</span>
                </div>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="t" tick={{ fontSize: 10 }} stroke="#94a3b8" />
                      <YAxis tick={{ fontSize: 10 }} stroke="#94a3b8" />
                      <Tooltip {...tooltipStyle} />
                      <Area type="monotone" dataKey="value" name={series.metric_name} stroke="#3b82f6" fill="#3b82f620" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // Fallback: illustrative period comparison + combined trend, badged as demo.
  const periods = timeRange === '7d' ? 'week' : timeRange === '30d' ? 'month' : timeRange === '90d' ? 'quarter' : 'year';

  const comparisonData = {
    mttr: { current: 38, previous: 45, change: -15.6 },
    mttd: { current: 6, previous: 8, change: -25.0 },
    cfr: { current: 8.2, previous: 9.8, change: -16.3 },
    availability: { current: 99.88, previous: 99.82, change: 0.06 },
    incidents: { current: 38, previous: 48, change: -20.8 },
    alertNoise: { current: 75.2, previous: 82.4, change: -8.7 },
  };

  return (
    <div className="space-y-6">
      <div><MockDataBadge integration="Historical metric trend series" /></div>
      {/* Period Comparison Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {Object.entries(comparisonData).map(([key, data]) => {
          const labels: Record<string, string> = {
            mttr: 'MTTR',
            mttd: 'MTTD',
            cfr: 'Change Failure Rate',
            availability: 'Availability',
            incidents: 'Incidents',
            alertNoise: 'Alert Noise',
          };
          const units: Record<string, string> = {
            mttr: 'm',
            mttd: 'm',
            cfr: '%',
            availability: '%',
            incidents: '',
            alertNoise: '%',
          };
          const improving = key === 'availability' ? data.change > 0 : data.change < 0;

          return (
            <div key={key} className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-3">
              <div className="text-[10px] font-medium text-slate-500 uppercase">{labels[key]}</div>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-xl font-semibold text-slate-900">{data.current}{units[key]}</span>
              </div>
              <div className="flex items-center gap-1 mt-1">
                <span className={`text-[10px] ${improving ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {data.change > 0 ? '+' : ''}{data.change.toFixed(1)}%
                </span>
                <span className="text-[10px] text-slate-400">vs last {periods}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Combined Trend Chart */}
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-4">
        <h3 className="text-sm font-semibold text-slate-900 mb-4">Key Metrics Trend ({timeRange})</h3>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={INCIDENT_TREND}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="week" tick={{ fontSize: 11 }} stroke="#94a3b8" />
              <YAxis yAxisId="left" tick={{ fontSize: 10 }} stroke="#94a3b8" />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} stroke="#94a3b8" />
              <Tooltip {...tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: '11px' }} />
              <Bar yAxisId="left" dataKey="incidents" name="Incidents" fill="#f97316" radius={[4, 4, 0, 0]} />
              <Line yAxisId="right" type="monotone" dataKey="mttr" name="MTTR (min)" stroke="#3b82f6" strokeWidth={2} />
              <Line yAxisId="right" type="monotone" dataKey="repeatRate" name="Repeat Rate %" stroke="#8b5cf6" strokeWidth={2} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Export Section */}
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Export Report</h3>
            <p className="text-xs text-slate-500 mt-0.5">Generate a comprehensive operations report for the selected time range</p>
          </div>
          <div className="flex gap-2">
            <button className="px-3 py-1.5 text-xs font-medium rounded-lg bg-white text-slate-600 border border-slate-200 hover:border-slate-300 transition-colors">
              Export CSV
            </button>
            <button className="px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-900 text-white hover:bg-slate-800 transition-colors">
              Generate PDF
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function OpsMetrics() {
  const [timeRange, setTimeRange] = useState<TimeRange>('30d');
  const [activeTab, setActiveTab] = useState<TabId>('dora');

  // Live data hooks — real operations metrics summary + historical trends APIs.
  const trendsPeriod = timeRange === '1y' ? '90d' : timeRange;
  const { data: metricsData, loading: metricsLoading, live: isMetricsLive } = useOpsMetrics();
  const { data: trendsData, loading: trendsLoading, live: isTrendsLive } = useOpsTrends(trendsPeriod);

  // The metrics summary is the primary live source that drives the headline
  // DORA / availability / SLA cards. Sub-metrics the backend does not provide stay
  // mock and are badged per-block so nothing fabricated sits under a Live pill.
  const summary = isMetricsLive ? (metricsData?.summary ?? null) : null;
  const isLive = isMetricsLive;
  const isLoading = metricsLoading || trendsLoading;

  // Tabs whose detailed breakdowns have no live source stay illustrative; when the
  // summary is live we badge them so mock detail never sits under a green Live pill.
  const mockTabNote = (label: string) =>
    isLive ? <MockDataBadge integration={`${label} not provided by the live metrics API`} /> : null;

  const tabs: { id: TabId; label: string }[] = [
    { id: 'dora', label: 'DORA Metrics' },
    { id: 'availability', label: 'Availability' },
    { id: 'incidents', label: 'Incidents' },
    { id: 'alerts', label: 'Alerts' },
    { id: 'changes', label: 'Changes' },
    { id: 'oncall', label: 'On-Call' },
    { id: 'sla', label: 'SLA' },
    { id: 'trends', label: 'Trends' },
  ];

  const renderTabContent = () => {
    switch (activeTab) {
      case 'dora': return <DORATab summary={summary} />;
      case 'availability': return <AvailabilityTab summary={summary} />;
      case 'incidents': return <div className="space-y-4">{mockTabNote('Incident breakdown')}<IncidentsTab /></div>;
      case 'alerts': return <div className="space-y-4">{mockTabNote('Alert analytics')}<AlertsTab /></div>;
      case 'changes': return <div className="space-y-4">{mockTabNote('Change analytics')}<ChangesTab /></div>;
      case 'oncall': return <div className="space-y-4">{mockTabNote('On-call analytics')}<OnCallTab /></div>;
      case 'sla': return <SLATab summary={summary} />;
      case 'trends': return <TrendsTab timeRange={timeRange} trends={trendsData?.trends ?? null} isTrendsLive={isTrendsLive} />;
      default: return <DORATab summary={summary} />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Data Source Badge and Time Range Controls */}
      <div className="flex items-center justify-between">
        <div>
          {isLive ? <LiveDataBadge source="Operations metrics API" /> : <MockDataBadge integration="CloudWatch, PagerDuty, ServiceNow integration" />}
        </div>
        <div className="flex gap-2">
          {(['7d', '30d', '90d', '1y'] as const).map(range => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                timeRange === range
                  ? 'bg-slate-900 text-white'
                  : 'bg-white text-slate-600 border border-slate-200 hover:border-slate-300'
              }`}
            >
              {range}
            </button>
          ))}
        </div>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="flex items-center justify-center py-8">
          <Icon name="spinner" className="w-6 h-6 text-indigo-600 animate-spin" />
          <span className="ml-2 text-sm text-slate-600">Loading metrics data...</span>
        </div>
      )}

      {!isLoading && (
      <>
      {/* Tab Navigation */}
      <div className="flex flex-wrap gap-2 mb-6">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'bg-slate-900 text-white'
                : 'bg-white text-slate-600 border border-slate-200 hover:border-slate-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {renderTabContent()}
      </>
      )}
    </div>
  );
}
