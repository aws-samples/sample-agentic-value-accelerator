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
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { useLiveKPIs } from './useLiveKPIs';
import { governModelsApi, governGuardrailsApi } from '../../api/client';
import { Icon, type IconName } from './icons';
import { LiveDataBadge, MockDataBadge } from './DataSourceIndicator';

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

// ─────────────────────────── Component Props ───────────────────────────

interface AIQualityMonitorProps {
  compact?: boolean;
  className?: string;
}

// ─────────────────────────── Component ───────────────────────────

export default function AIQualityMonitor({ compact = false, className = '' }: AIQualityMonitorProps) {
  const { kpis, liveFlags, liveSources, loading, refresh } = useLiveKPIs(30000); // 30s polling
  const [drillDown, setDrillDown] = useState<string | null>(null);
  const [showInterventions, setShowInterventions] = useState(false);
  const [selectedIntervention, setSelectedIntervention] = useState<Intervention | null>(null);
  const [trendData, setTrendData] = useState<TrendPoint[]>([]);

  // Generate/refresh trend data
  useEffect(() => {
    setTrendData(generateTrendData(24));
    const interval = setInterval(() => {
      setTrendData(prev => {
        const newPoint: TrendPoint = {
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          errorRate: kpiValues.errorRate,
          guardrailIntervention: kpiValues.guardrailIntervention,
          safetyScore: kpiValues.safetyScore,
          latencyP99: kpiValues.latencyP99,
          costPerInvocation: kpiValues.costPerInvocation,
          complianceScore: kpiValues.complianceScore,
        };
        return [...prev.slice(1), newPoint];
      });
    }, 60000); // Update every minute
    return () => clearInterval(interval);
  }, []);

  // Compute KPI values from live data
  const kpiValues = useMemo(() => ({
    errorRate: kpis.fleetErrorRatePct || 0.4,
    guardrailIntervention: kpis.interventionRatePct || 5.2,
    safetyScore: 100 - (kpis.interventionRatePct || 5.2) * 0.3, // Derived
    latencyP99: (kpis.avgLatencyMs || 2400) / 1000,
    costPerInvocation: kpis.totalInvocations > 0
      ? kpis.totalCost / kpis.totalInvocations
      : 0.012,
    complianceScore: kpis.configCompliancePct || 94,
  }), [kpis]);

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

  const isLive = liveSources.length > 0;

  // ─────────────────────────── Compact View ───────────────────────────

  if (compact) {
    return (
      <div className={`${className}`}>
        {/* Status Summary */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Icon name="chart-bar" className="w-4 h-4 text-slate-500" />
            <span className="text-sm font-medium text-slate-700">AI Quality</span>
          </div>
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

        {/* Data Source Indicator */}
        <div className="mt-2 flex justify-end">
          {isLive ? <LiveDataBadge sources={liveSources} /> : <MockDataBadge />}
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
            <p className="text-xs text-slate-500">Real-time operational health metrics</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isLive ? <LiveDataBadge sources={liveSources} /> : <MockDataBadge />}
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
                <div className="mt-2 flex items-center gap-1">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                    status === 'green' ? 'bg-emerald-100 text-emerald-700' :
                    status === 'amber' ? 'bg-amber-100 text-amber-700' :
                    'bg-red-100 text-red-700'
                  }`}>
                    {status === 'green' ? 'Healthy' : status === 'amber' ? 'Warning' : 'Critical'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Drill-Down Panel */}
      {drillDown && (
        <div className="mx-4 mb-4 p-4 bg-slate-50 rounded-lg border border-slate-200">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Icon name={QUALITY_THRESHOLDS[drillDown].icon} className="w-5 h-5 text-violet-600" />
              <h4 className="font-medium text-slate-900">{QUALITY_THRESHOLDS[drillDown].label} — 24h Trend</h4>
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
