/**
 * AIQualityMonitor — Real-time AI quality KPIs for operational health.
 *
 * Monitors error rates, guardrail interventions, safety scores, latency,
 * and drift — enabling intervention when output quality degrades.
 *
 * Integrates with existing live data hooks:
 * - useLiveKPIs for runtime metrics, guardrail telemetry, cost
 * - governModelsApi for model-level metrics
 * - governGuardrailsApi for guardrail interventions
 *
 * Features:
 * - 6 quality KPIs with configurable thresholds (green/amber/red)
 * - Trend visualization over time
 * - Intervention recommendations (non-LLM based)
 * - Drill-down per metric
 * - Compact mode for embedding in Command Center
 *
 * Migrated from AI Trust Tool with adaptations for AVA's live data architecture.
 */
import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts';
import { useLiveKPIs } from './useLiveKPIs';
import { Icon, type IconName } from './icons';
import { LiveDataBadge, MockDataBadge } from './DataSourceIndicator';
import {
  governLlmQualityApi,
  type LlmQualitySnapshot, type LlmQualityTrend, type LlmQualityDimension,
} from '../../api/client';

// ─────────────────────────── Quality Thresholds ───────────────────────────

interface QualityThreshold {
  green: number;
  amber: number;
  label: string;
  unit: string;
  icon: IconName;
  invert?: boolean; // True if higher is better (e.g., safety score)
  description: string;
}

const QUALITY_THRESHOLDS: Record<string, QualityThreshold> = {
  errorRate: {
    green: 0.5,
    amber: 2,
    label: 'Error Rate',
    unit: '%',
    icon: 'exclamation-circle',
    description: 'Percentage of Bedrock invocations returning errors',
  },
  guardrailIntervention: {
    green: 5,
    amber: 15,
    label: 'Guardrail Interventions',
    unit: '%',
    icon: 'shield-check',
    description: 'Percentage of requests blocked or modified by guardrails',
  },
  safetyScore: {
    green: 98,
    amber: 95,
    label: 'Safety Score',
    unit: '%',
    icon: 'check-circle',
    invert: true,
    description: 'Percentage of invocations passing all safety checks',
  },
  latencyP99: {
    green: 3,
    amber: 5,
    label: 'Latency P99',
    unit: 's',
    icon: 'clock',
    description: '99th percentile response latency in seconds',
  },
  costPerInvocation: {
    green: 0.01,
    amber: 0.05,
    label: 'Cost per Invocation',
    unit: '$',
    icon: 'currency-dollar',
    description: 'Average cost per model invocation',
  },
  complianceScore: {
    green: 95,
    amber: 85,
    label: 'Compliance Score',
    unit: '%',
    icon: 'clipboard-document-check',
    invert: true,
    description: 'Percentage of AWS Config rules in compliance',
  },
};

// Navigation links for each metric
const METRIC_LINKS: Record<string, { to: string; label: string }> = {
  errorRate: { to: '/govern/audit?tab=metrics', label: 'Audit Metrics' },
  guardrailIntervention: { to: '/govern/guardrails', label: 'Guardrails' },
  safetyScore: { to: '/govern/safety', label: 'AI Safety' },
  latencyP99: { to: '/govern/fleet', label: 'Fleet Health' },
  costPerInvocation: { to: '/govern/finops', label: 'FinOps' },
  complianceScore: { to: '/govern/compliance', label: 'Compliance' },
};

// Illustrative fallbacks shown only when the KPI's underlying AWS source is not
// live. Kept at module scope so they're stable across renders.
const ILLUSTRATIVE_KPIS = {
  errorRate: 0.4,
  guardrailIntervention: 5.2,
  latencyP99: 2.4,
  costPerInvocation: 0.012,
  complianceScore: 94,
};

type QualityStatus = 'green' | 'amber' | 'red';

const getStatus = (value: number, threshold: QualityThreshold): QualityStatus => {
  if (threshold.invert) {
    if (value >= threshold.green) return 'green';
    if (value >= threshold.amber) return 'amber';
    return 'red';
  }
  if (value <= threshold.green) return 'green';
  if (value <= threshold.amber) return 'amber';
  return 'red';
};

const STATUS_COLORS: Record<QualityStatus, string> = {
  green: '#10b981', // emerald-500
  amber: '#f59e0b', // amber-500
  red: '#ef4444',   // red-500
};

const STATUS_BG: Record<QualityStatus, string> = {
  green: 'bg-emerald-50 border-emerald-200',
  amber: 'bg-amber-50 border-amber-200',
  red: 'bg-red-50 border-red-200',
};

const STATUS_TEXT: Record<QualityStatus, string> = {
  green: 'text-emerald-700',
  amber: 'text-amber-700',
  red: 'text-red-700',
};

// ─────────────────────────── Intervention Definitions ───────────────────────────

interface Intervention {
  id: string;
  label: string;
  icon: IconName;
  severity: 'Low' | 'Medium' | 'High' | 'Critical';
  description: string;
  impact: { item: string; change: string; scope: string }[];
  triggerConditions: string[];
  affectedScope: string;
  rollback: string;
  requiresApproval: boolean;
}

const INTERVENTIONS: Intervention[] = [
  {
    id: 'tighten',
    label: 'Tighten Guardrails',
    icon: 'shield-check',
    severity: 'Medium',
    description: 'Escalate Bedrock Guardrail content filters to HIGH. Enable additional PII detection. Add denied topics.',
    impact: [
      { item: 'Content filters', change: 'All categories → HIGH', scope: 'All guardrails' },
      { item: 'PII detection', change: 'Enable all 14+ PII types with BLOCK', scope: 'All guardrails' },
      { item: 'Denied topics', change: 'Add harmful content to deny list', scope: 'All guardrails' },
    ],
    triggerConditions: ['Guardrail intervention rate > 15%', 'Safety score < 95%'],
    affectedScope: 'All models with active guardrails',
    rollback: 'Revert guardrail configuration to previous version',
    requiresApproval: false,
  },
  {
    id: 'throttle',
    label: 'Throttle Invocations',
    icon: 'pause-circle',
    severity: 'High',
    description: 'Reduce invocation rate by 50%. Queue excess requests. Prioritize critical use cases.',
    impact: [
      { item: 'Throughput', change: 'Reduced by 50%', scope: 'All models' },
      { item: 'Latency', change: 'Increased due to queuing', scope: 'Non-critical UCs' },
      { item: 'Cost', change: 'Reduced proportionally', scope: 'All models' },
    ],
    triggerConditions: ['Error rate > 2%', 'Latency P99 > 5s', 'Cost anomaly detected'],
    affectedScope: 'All deployed models',
    rollback: 'Restore normal invocation rate',
    requiresApproval: true,
  },
  {
    id: 'pause',
    label: 'Pause Model',
    icon: 'stop-circle',
    severity: 'Critical',
    description: 'Activate circuit breaker. Stop all model invocations. Route to fallback responses.',
    impact: [
      { item: 'Model invocations', change: 'BLOCKED — all calls rejected', scope: 'All models' },
      { item: 'User experience', change: 'Fallback responses served', scope: 'Consumer-facing UCs' },
      { item: 'Agent operations', change: 'Cedar forbid-all policy', scope: 'All agents' },
    ],
    triggerConditions: ['Error rate > 5%', 'Safety score < 90%', 'Critical security finding'],
    affectedScope: 'All active Bedrock models',
    rollback: 'Remove circuit breaker, restore normal operation',
    requiresApproval: true,
  },
  {
    id: 'human',
    label: 'Route to Human',
    icon: 'users',
    severity: 'High',
    description: 'Enable human-in-the-loop for all AI decisions. Queue outputs for human review.',
    impact: [
      { item: 'Response latency', change: 'Increased by 5-15 min per decision', scope: 'All UCs' },
      { item: 'Throughput', change: 'Reduced to human review capacity', scope: 'All UCs' },
      { item: 'Accuracy', change: 'Improved — human verification', scope: 'All UCs' },
    ],
    triggerConditions: ['Compliance score < 85%', 'Multiple amber KPIs'],
    affectedScope: 'All consumer-facing decisions',
    rollback: 'Disable HITL flag, restore automated delivery',
    requiresApproval: true,
  },
];

// ─────────────────────────── Mock Trend Data Generator ───────────────────────────

interface TrendPoint {
  time: string;
  errorRate: number;
  guardrailIntervention: number;
  safetyScore: number;
  latencyP99: number;
  costPerInvocation: number;
  complianceScore: number;
}

const generateTrendData = (hours = 24): TrendPoint[] => {
  const data: TrendPoint[] = [];
  const now = new Date();

  for (let i = hours; i >= 0; i--) {
    const time = new Date(now.getTime() - i * 60 * 60 * 1000);
    // Add some realistic variation
    const baseError = 0.3 + Math.random() * 0.4;
    const baseGuardrail = 4 + Math.random() * 3;

    data.push({
      time: time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      errorRate: Math.round(baseError * 100) / 100,
      guardrailIntervention: Math.round(baseGuardrail * 10) / 10,
      safetyScore: Math.round((97 + Math.random() * 2.5) * 10) / 10,
      latencyP99: Math.round((2 + Math.random() * 1.5) * 100) / 100,
      costPerInvocation: Math.round((0.008 + Math.random() * 0.004) * 1000) / 1000,
      complianceScore: Math.round((92 + Math.random() * 6) * 10) / 10,
    });
  }

  return data;
};

// LLM output-quality dimensions surfaced from the live snapshot that have no
// dedicated KPI tile (latency/error already have tiles). Rendered live-only.
const LLM_QUALITY_DIMS: LlmQualityDimension[] = [
  'groundedness', 'relevance', 'coherence', 'citation_accuracy',
  'harmful_rate', 'refusal_rate', 'tokens_per_response',
];

// ─────────────────────────── Component Props ───────────────────────────

interface AIQualityMonitorProps {
  compact?: boolean;
  className?: string;
}

// ─────────────────────────── Component ───────────────────────────

export default function AIQualityMonitor({ compact = false, className = '' }: AIQualityMonitorProps) {
  const { kpis, liveFlags, liveSources, refresh } = useLiveKPIs(30000); // 30s polling
  const [drillDown, setDrillDown] = useState<string | null>(null);
  const [showInterventions, setShowInterventions] = useState(false);
  const [selectedIntervention, setSelectedIntervention] = useState<Intervention | null>(null);
  // Live LLM output-quality snapshot + latency-P99 trend (CloudWatch custom
  // metrics / Bedrock Guardrails). Graceful: a failed fetch leaves these null so
  // the KPIs and trend fall back to clearly-badged illustrative values.
  const [llmSnap, setLlmSnap] = useState<LlmQualitySnapshot | null>(null);
  const [latencyTrend, setLatencyTrend] = useState<LlmQualityTrend | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([
      governLlmQualityApi.metrics(),
      governLlmQualityApi.trend('latency_p99', 24),
    ]).then(([snap, trend]) => {
      if (cancelled) return;
      setLlmSnap(snap.status === 'fulfilled' ? snap.value : null);
      setLatencyTrend(trend.status === 'fulfilled' ? trend.value : null);
    });
    return () => { cancelled = true; };
  }, []);

  const llmLive = !!llmSnap?.live;

  // Real safety score = 100 − harmful-output rate (Bedrock Guardrails custom
  // metric). Null when the LLM-quality feed is not live or lacks the dimension.
  const safetyLive = useMemo<number | null>(() => {
    if (!llmSnap?.live) return null;
    const m = llmSnap.metrics.find(x => x.dimension === 'harmful_rate');
    if (!m) return null;
    const pct = m.unit?.includes('%') ? m.value : (m.value <= 1 ? m.value * 100 : m.value);
    return Math.max(0, Math.min(100, +(100 - pct).toFixed(1)));
  }, [llmSnap]);

  // Trend series for the drill-down chart. The latency-P99 series is overlaid
  // with the real CloudWatch trend when live; the other series stay illustrative.
  const trendData = useMemo<TrendPoint[]>(() => {
    const base = generateTrendData(24);
    const dps = latencyTrend?.live ? latencyTrend.datapoints : [];
    if (dps.length === 0) return base;
    return dps.map((dp, i) => {
      const b = base[Math.min(i, base.length - 1)];
      const seconds = dp.value > 100 ? dp.value / 1000 : dp.value; // ms→s heuristic
      return {
        ...b,
        time: new Date(dp.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        latencyP99: +seconds.toFixed(2),
      };
    });
  }, [latencyTrend]);

  // Per-KPI liveness. A KPI is only "live" when its underlying AWS source is
  // live — gating on the flag (not on truthiness) means a genuine live 0 (e.g. a
  // 0% error rate) is preserved instead of being overwritten by the constant.
  // safetyScore is a derived heuristic (fabricated coefficient, no direct AWS
  // metric), so it is never presented as live.
  const kpiLive = useMemo<Record<string, boolean>>(() => ({
    errorRate: liveFlags.runtime,
    guardrailIntervention: liveFlags.guardrails,
    safetyScore: safetyLive !== null,
    latencyP99: liveFlags.runtime,
    costPerInvocation: liveFlags.cost && liveFlags.runtime && kpis.totalInvocations > 0,
    complianceScore: liveFlags.config,
  }), [liveFlags, kpis.totalInvocations, safetyLive]);

/**
 * Cost per invocation, with both operands reduced to a per-DAY rate first.
 *
 * Returns 0 when a window or the invocation count is missing, which the caller renders
 * against the same thresholds as any other value. 0 is used rather than null only
 * because this KPI grid has no unmeasured state today; the liveness gate
 * (`kpiLive.costPerInvocation`) is what decides whether a real value or the
 * illustrative constant is shown, so an unmeasured source never reaches this function.
 */
function costPerInvocationDaily(
  totalCost: number,
  costWindowDays: number,
  totalInvocations: number,
  runtimeWindowDays: number,
): number {
  if (costWindowDays <= 0 || runtimeWindowDays <= 0 || totalInvocations <= 0) return 0;
  const costPerDay = totalCost / costWindowDays;
  const invocationsPerDay = totalInvocations / runtimeWindowDays;
  if (invocationsPerDay <= 0) return 0;
  return costPerDay / invocationsPerDay;
}

  // Compute KPI values. Live sources feed real numbers (including real zeros);
  // otherwise fall back to a clearly-badged illustrative constant.
  const kpiValues = useMemo(() => ({
    errorRate: kpiLive.errorRate ? kpis.fleetErrorRatePct : ILLUSTRATIVE_KPIS.errorRate,
    guardrailIntervention: kpiLive.guardrailIntervention ? kpis.interventionRatePct : ILLUSTRATIVE_KPIS.guardrailIntervention,
    safetyScore: safetyLive !== null
      ? safetyLive
      : 100 - (liveFlags.guardrails ? kpis.interventionRatePct : ILLUSTRATIVE_KPIS.guardrailIntervention) * 0.3, // Live 100−harmful%, else derived heuristic
    latencyP99: kpiLive.latencyP99 ? kpis.avgLatencyMs / 1000 : ILLUSTRATIVE_KPIS.latencyP99,
    // Both operands normalised to a DAILY rate before dividing.
    //
    // `totalCost` is a 12-MONTH Cost Explorer total (governCostApi.byModel(12)) and
    // `totalInvocations` is a 7-DAY CloudWatch count (runtimeMetrics(7)), so the
    // previous `totalCost / totalInvocations` divided a year of spend by a week of
    // traffic and overstated cost per invocation by roughly the window ratio - about
    // 52x. useLiveMetrics.ts already normalises this way; this surface did not.
    costPerInvocation: kpiLive.costPerInvocation
      ? costPerInvocationDaily(kpis.totalCost, kpis.costWindowDays, kpis.totalInvocations, kpis.runtimeWindowDays)
      : ILLUSTRATIVE_KPIS.costPerInvocation,
    complianceScore: kpiLive.complianceScore ? kpis.configCompliancePct : ILLUSTRATIVE_KPIS.complianceScore,
  }), [kpis, kpiLive, liveFlags, safetyLive]);

  const allKpisLive = useMemo(() => Object.values(kpiLive).every(Boolean), [kpiLive]);

  // Count status by severity
  const statusCounts = useMemo(() => {
    const counts = { green: 0, amber: 0, red: 0 };
    Object.entries(kpiValues).forEach(([key, value]) => {
      const threshold = QUALITY_THRESHOLDS[key];
      if (threshold) {
        counts[getStatus(value, threshold)]++;
      }
    });
    return counts;
  }, [kpiValues]);

  // Determine if any interventions are recommended
  const recommendedInterventions = useMemo(() => {
    const recommended: Intervention[] = [];

    if (statusCounts.red > 0) {
      recommended.push(INTERVENTIONS.find(i => i.id === 'pause')!);
    }
    if (statusCounts.amber >= 2 || kpiValues.guardrailIntervention > 15) {
      recommended.push(INTERVENTIONS.find(i => i.id === 'tighten')!);
    }
    if (kpiValues.errorRate > 2 || kpiValues.latencyP99 > 5) {
      recommended.push(INTERVENTIONS.find(i => i.id === 'throttle')!);
    }

    return recommended;
  }, [statusCounts, kpiValues]);

  // ─────────────────────────── Compact View ───────────────────────────

  if (compact) {
    return (
      <div className={`${className}`}>
        {/* Status summary — severity counts (the section's ZoneHeader supplies the "AI Quality" title) */}
        <div className="flex items-center justify-end mb-3">
          <div className="flex items-center gap-1.5">
            {statusCounts.red > 0 && (
              <span className="px-1.5 py-0.5 text-xs font-medium bg-red-100 text-red-700 rounded">
                {statusCounts.red} Critical
              </span>
            )}
            {statusCounts.amber > 0 && (
              <span className="px-1.5 py-0.5 text-xs font-medium bg-amber-100 text-amber-700 rounded">
                {statusCounts.amber} Warning
              </span>
            )}
            {statusCounts.green > 0 && statusCounts.red === 0 && statusCounts.amber === 0 && (
              <span className="px-1.5 py-0.5 text-xs font-medium bg-emerald-100 text-emerald-700 rounded">
                All Healthy
              </span>
            )}
          </div>
        </div>

        {/* Compact KPI Grid */}
        <div className="grid grid-cols-3 gap-2">
          {Object.entries(kpiValues).slice(0, 6).map(([key, value]) => {
            const threshold = QUALITY_THRESHOLDS[key];
            const link = METRIC_LINKS[key];
            if (!threshold) return null;
            const status = getStatus(value, threshold);
            return (
              <Link
                key={key}
                to={link?.to ?? '/govern'}
                className={`p-2 rounded border ${STATUS_BG[status]} hover:opacity-80 hover:shadow-sm transition-all block`}
              >
                <div className={`text-lg font-bold font-mono ${STATUS_TEXT[status]}`}>
                  {typeof value === 'number' ? value.toFixed(value < 1 ? 3 : 1) : value}
                  <span className="text-xs font-normal">{threshold.unit}</span>
                </div>
                <div className="text-[10px] text-slate-500 uppercase tracking-wide truncate">
                  {threshold.label}
                </div>
                <div className="text-[9px] text-blue-600 mt-0.5">
                  {link?.label ?? 'View'} →
                </div>
              </Link>
            );
          })}
        </div>

        {/* Data Source Indicator — only claim "Live" when every KPI is genuinely
            live; otherwise the panel mixes live and illustrative values. */}
        <div className="mt-2 flex justify-end">
          {allKpisLive
            ? <LiveDataBadge detail={liveSources.length ? `Live sources: ${liveSources.join(', ')}` : undefined} />
            : <MockDataBadge integration="Some KPIs illustrative until their AWS source is live" />}
        </div>
      </div>
    );
  }

  // ─────────────────────────── Full View ───────────────────────────

  return (
    <div className={`bg-white rounded-lg border border-slate-200 ${className}`}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-violet-50 rounded-lg">
            <Icon name="chart-bar" className="w-5 h-5 text-violet-600" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-slate-900">AI Quality Monitor</h3>
            <p className="text-xs text-slate-500">Operational health metrics — live where connected</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {allKpisLive
            ? <LiveDataBadge detail={liveSources.length ? `Live sources: ${liveSources.join(', ')}` : undefined} />
            : <MockDataBadge integration="Some KPIs illustrative until their AWS source is live" />}
          <button
            onClick={refresh}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded transition-colors"
            title="Refresh"
          >
            <Icon name="arrow-path" className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Status Summary Bar */}
      <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
            <span className="text-xs text-slate-600">{statusCounts.green} Healthy</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-amber-500" />
            <span className="text-xs text-slate-600">{statusCounts.amber} Warning</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
            <span className="text-xs text-slate-600">{statusCounts.red} Critical</span>
          </div>
        </div>
        {recommendedInterventions.length > 0 && (
          <button
            onClick={() => setShowInterventions(!showInterventions)}
            className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-amber-700 bg-amber-100 rounded hover:bg-amber-200 transition-colors"
          >
            <Icon name="exclamation-triangle" className="w-3.5 h-3.5" />
            {recommendedInterventions.length} Intervention{recommendedInterventions.length > 1 ? 's' : ''} Recommended
          </button>
        )}
      </div>

      {/* KPI Cards */}
      <div className="p-4">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {Object.entries(QUALITY_THRESHOLDS).map(([key, threshold]) => {
            const value = kpiValues[key as keyof typeof kpiValues] ?? 0;
            const status = getStatus(value, threshold);
            const isExpanded = drillDown === key;

            return (
              <div
                key={key}
                className={`p-3 rounded-lg border-2 cursor-pointer transition-all ${
                  isExpanded ? 'ring-2 ring-violet-300 border-violet-300' : STATUS_BG[status]
                }`}
                onClick={() => setDrillDown(isExpanded ? null : key)}
              >
                <div className="flex items-center justify-between mb-1">
                  <Icon name={threshold.icon} className={`w-4 h-4 ${STATUS_TEXT[status]}`} />
                  <div
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: STATUS_COLORS[status] }}
                  />
                </div>
                <div className={`text-2xl font-bold font-mono ${STATUS_TEXT[status]}`}>
                  {typeof value === 'number' ? value.toFixed(value < 1 ? 3 : 1) : value}
                  <span className="text-sm font-normal ml-0.5">{threshold.unit}</span>
                </div>
                <div className="text-xs text-slate-500 mt-0.5">{threshold.label}</div>
                <div className="mt-2 flex flex-wrap items-center gap-1">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                    status === 'green' ? 'bg-emerald-100 text-emerald-700' :
                    status === 'amber' ? 'bg-amber-100 text-amber-700' :
                    'bg-red-100 text-red-700'
                  }`}>
                    {status === 'green' ? 'Healthy' : status === 'amber' ? 'Warning' : 'Critical'}
                  </span>
                  {kpiLive[key]
                    ? <LiveDataBadge />
                    : <MockDataBadge integration={key === 'safetyScore'
                        ? 'Derived heuristic — no direct AWS safety metric'
                        : 'Live source not connected — illustrative value'} />}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* LLM Output Quality — real per-dimension signals (CloudWatch custom
          metrics / Bedrock Guardrails) for dimensions without a dedicated KPI
          tile. Renders live values when the feed is emitting, else an honest note. */}
      <div className="px-4 pb-4">
        <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
          <div className="flex items-center gap-2 mb-2">
            <Icon name="chart-bar" className="w-4 h-4 text-violet-500" />
            <h4 className="text-xs font-semibold text-slate-700">LLM Output Quality</h4>
            {llmLive
              ? <LiveDataBadge source="CloudWatch" detail={`LLM quality custom metrics · ${llmSnap?.metrics.length ?? 0} dimensions`} />
              : <MockDataBadge integration="LLM quality: CloudWatch custom metrics / Bedrock Guardrails" />}
          </div>
          {/* Provenance: these dimensions are DERIVED from governance telemetry (a
              governance-grade proxy), not measured on every model response. */}
          <p className="text-[10px] text-slate-400 mb-2 leading-snug">
            Derived from Bedrock guardrail + invocation telemetry and Bedrock evaluation jobs — a governance-grade proxy, not a direct per-response measurement.
          </p>
          {llmLive && llmSnap && llmSnap.metrics.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {LLM_QUALITY_DIMS.map(dim => {
                const m = llmSnap.metrics.find(x => x.dimension === dim);
                const unit = m?.unit && m.unit !== 'None' ? (m.unit.includes('%') ? '%' : ` ${m.unit}`) : '';
                return (
                  <div key={dim} className="bg-white rounded border border-slate-100 p-2">
                    <div className="text-[10px] text-slate-400 uppercase tracking-wide truncate">{dim.replace(/_/g, ' ')}</div>
                    <div className="text-sm font-bold font-mono text-slate-800">
                      {m ? `${m.value}${unit}` : <span className="text-slate-300">—</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* The server's own `note` first, and the static sentence only as a fallback.
               LlmQualitySnapshot carries `note` and this panel discarded it, so the one thing
               shown here was a hardcoded sentence asserting a single cause — "once custom metrics
               are emitting" — for a state with several. That is a confidently-wrong diagnosis
               whenever the real reason is something else (wrong namespace, an access denial, or
               live=true with zero dimensions returned, which this same branch also catches). The
               note is where the backend says which it actually was. */
            <div className="text-[11px] text-slate-500">
              {llmSnap?.note
                ? llmSnap.note
                : 'Groundedness, relevance, coherence, harmful/refusal rate & citation accuracy populate once LLM output-quality custom metrics are emitting to CloudWatch.'}
            </div>
          )}
          {/* Also shown when the feed IS live: a live read can still carry a caveat (a partial
              window, a dimension that returned no datapoints), and that caveat is exactly what a
              reader needs before quoting a number from the grid above. */}
          {llmLive && llmSnap?.note && (
            <div className="text-[10px] text-slate-500 mt-2">{llmSnap.note}</div>
          )}
        </div>
      </div>

      {/* Drill-Down Panel */}
      {drillDown && (
        <div className="mx-4 mb-4 p-4 bg-slate-50 rounded-lg border border-slate-200">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Icon name={QUALITY_THRESHOLDS[drillDown].icon} className="w-5 h-5 text-violet-600" />
              <h4 className="font-medium text-slate-900">{QUALITY_THRESHOLDS[drillDown].label} — 24h Trend</h4>
              {drillDown === 'latencyP99' && latencyTrend?.live
                ? <LiveDataBadge source="CloudWatch" detail="Latency P99 — live LLM-quality trend" />
                : <MockDataBadge integration="Illustrative trend — historical KPI series not wired" />}
            </div>
            <button
              onClick={() => setDrillDown(null)}
              className="p-1 text-slate-400 hover:text-slate-600"
            >
              <Icon name="x-mark" className="w-4 h-4" />
            </button>
          </div>
          <p className="text-xs text-slate-500 mb-3">{QUALITY_THRESHOLDS[drillDown].description}</p>

          {/* Threshold Legend */}
          <div className="flex items-center gap-4 mb-3 text-xs">
            <div className="flex items-center gap-1">
              <div className="w-3 h-0.5 bg-emerald-500" />
              <span className="text-slate-500">Green: ≤{QUALITY_THRESHOLDS[drillDown].green}{QUALITY_THRESHOLDS[drillDown].unit}</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-0.5 bg-amber-500" />
              <span className="text-slate-500">Amber: ≤{QUALITY_THRESHOLDS[drillDown].amber}{QUALITY_THRESHOLDS[drillDown].unit}</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-0.5 bg-red-500" />
              <span className="text-slate-500">Red: &gt;{QUALITY_THRESHOLDS[drillDown].amber}{QUALITY_THRESHOLDS[drillDown].unit}</span>
            </div>
          </div>

          {/* Trend Chart */}
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendData} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="time" tick={{ fontSize: 10 }} stroke="#94a3b8" />
                <YAxis tick={{ fontSize: 10 }} stroke="#94a3b8" />
                <Tooltip
                  contentStyle={{ fontSize: 11, background: '#fff', border: '1px solid #e2e8f0' }}
                />
                <defs>
                  <linearGradient id="colorMetric" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area
                  type="monotone"
                  dataKey={drillDown}
                  stroke="#8b5cf6"
                  strokeWidth={2}
                  fill="url(#colorMetric)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Interventions Panel */}
      {showInterventions && (
        <div className="mx-4 mb-4 p-4 bg-amber-50 rounded-lg border border-amber-200">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Icon name="exclamation-triangle" className="w-5 h-5 text-amber-600" />
              <h4 className="font-medium text-slate-900">Recommended Interventions</h4>
            </div>
            <button
              onClick={() => setShowInterventions(false)}
              className="p-1 text-slate-400 hover:text-slate-600"
            >
              <Icon name="x-mark" className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-2">
            {INTERVENTIONS.map(intervention => {
              const isRecommended = recommendedInterventions.some(r => r.id === intervention.id);
              const isSelected = selectedIntervention?.id === intervention.id;

              return (
                <div key={intervention.id}>
                  <button
                    onClick={() => setSelectedIntervention(isSelected ? null : intervention)}
                    className={`w-full text-left p-3 rounded-lg border transition-all ${
                      isRecommended
                        ? 'bg-white border-amber-300 hover:border-amber-400'
                        : 'bg-slate-50 border-slate-200 hover:border-slate-300 opacity-60'
                    } ${isSelected ? 'ring-2 ring-violet-300' : ''}`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Icon name={intervention.icon} className={`w-4 h-4 ${
                          intervention.severity === 'Critical' ? 'text-red-600' :
                          intervention.severity === 'High' ? 'text-amber-600' :
                          'text-slate-600'
                        }`} />
                        <span className="font-medium text-slate-900">{intervention.label}</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded ${
                          intervention.severity === 'Critical' ? 'bg-red-100 text-red-700' :
                          intervention.severity === 'High' ? 'bg-amber-100 text-amber-700' :
                          intervention.severity === 'Medium' ? 'bg-blue-100 text-blue-700' :
                          'bg-slate-100 text-slate-700'
                        }`}>
                          {intervention.severity}
                        </span>
                        {intervention.requiresApproval && (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-violet-100 text-violet-700">
                            Approval Required
                          </span>
                        )}
                      </div>
                      {isRecommended && (
                        <span className="text-xs font-medium text-amber-600">Recommended</span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-1">{intervention.description}</p>
                  </button>

                  {/* Expanded Details */}
                  {isSelected && (
                    <div className="mt-2 ml-6 p-3 bg-white rounded border border-slate-200">
                      <h5 className="text-xs font-medium text-slate-700 mb-2">Impact Analysis</h5>
                      <div className="space-y-1">
                        {intervention.impact.map((impact, i) => (
                          <div key={i} className="flex text-xs">
                            <span className="w-24 text-slate-500">{impact.item}:</span>
                            <span className="text-slate-700">{impact.change}</span>
                            <span className="ml-auto text-slate-400">{impact.scope}</span>
                          </div>
                        ))}
                      </div>

                      <h5 className="text-xs font-medium text-slate-700 mt-3 mb-1">Trigger Conditions</h5>
                      <ul className="text-xs text-slate-500 list-disc list-inside">
                        {intervention.triggerConditions.map((cond, i) => (
                          <li key={i}>{cond}</li>
                        ))}
                      </ul>

                      <div className="mt-3 flex items-center justify-between text-xs">
                        <span className="text-slate-500">Rollback: {intervention.rollback}</span>
                        <button className="px-3 py-1.5 bg-violet-600 text-white rounded hover:bg-violet-700 transition-colors">
                          View Runbook
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="px-4 py-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
        <span>Last updated: {new Date().toLocaleTimeString()}</span>
        <span>Polling every 30s</span>
      </div>
    </div>
  );
}
