/**
 * ModelMonitoring — Real-time model quality monitoring
 *
 * Features:
 * - Quality KPIs with thresholds (error rate, safety, hallucination, drift)
 * - Traffic light status (green/amber/red)
 * - Drill-down details with trend charts
 * - Intervention actions (tighten guardrails, pause model, route to human)
 */

import { useState, useMemo } from 'react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { MODELS, tooltipStyle } from './mockData';
import { useGovernModels } from './useGovernModels';
import { LiveDataBadge } from './DataSourceIndicator';
import LiveHeader from './LiveHeader';
import { Icon, type IconName } from './icons';
import { rowButtonProps } from './a11y';

// Quality thresholds - green/amber boundaries
const QUALITY_THRESHOLDS = {
  errorRate: { green: 0.5, amber: 2, label: 'Error Rate', unit: '%', icon: 'exclamation-triangle' as IconName, invert: false },
  guardrailIntervention: { green: 5, amber: 15, label: 'Guardrail Interventions', unit: '%', icon: 'shield-check' as IconName, invert: false },
  safetyScore: { green: 98, amber: 95, label: 'Safety Score', unit: '%', icon: 'check-circle' as IconName, invert: true },
  hallucinationRate: { green: 2, amber: 5, label: 'Hallucination Rate', unit: '%', icon: 'chat-bubble' as IconName, invert: false },
  latencyP99: { green: 3, amber: 5, label: 'Latency P99', unit: 's', icon: 'arrow-path' as IconName, invert: false },
  driftScore: { green: 2, amber: 5, label: 'Model Drift', unit: '%', icon: 'chart-line' as IconName, invert: false },
};

type MetricKey = keyof typeof QUALITY_THRESHOLDS;
type Status = 'green' | 'amber' | 'red';

interface ModelMetrics {
  modelId: string;
  modelName: string;
  metrics: Record<MetricKey, number>;
  trend: { day: number; errorRate: number; safety: number; hallucination: number }[];
}

// Deterministic [0,1) pseudo-noise from an integer seed — keeps mock metrics
// stable across renders (no Math.random, which would re-randomize every render).
const noise = (i: number) => {
  const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
};

// Mock metrics data - would come from CloudWatch in production
const MODEL_METRICS: ModelMetrics[] = MODELS.map((m, mi) => ({
  modelId: m.id,
  modelName: m.name,
  metrics: {
    errorRate: +(noise(mi * 17 + 1) * 1.5).toFixed(2),
    guardrailIntervention: +(noise(mi * 17 + 2) * 10 + 2).toFixed(1),
    safetyScore: +(95 + noise(mi * 17 + 3) * 4).toFixed(1),
    hallucinationRate: +(noise(mi * 17 + 4) * 4 + 1).toFixed(1),
    latencyP99: +(noise(mi * 17 + 5) * 3 + 1.5).toFixed(2),
    driftScore: +(noise(mi * 17 + 6) * 4).toFixed(1),
  },
  // 90 days of history so accuracy/drift trend is visible over time (not just a
  // week). The view slices this to the selected 7/30/90-day window. Day 0 is the
  // oldest; index N-1 is "today". A slow drift term makes the 90-day view show a
  // gentle trend rather than pure noise.
  trend: Array.from({ length: 90 }, (_, i) => {
    const drift = (i / 90) * 0.6; // mild worsening over the quarter
    return {
      day: i,
      errorRate: +(noise(mi * 17 + i * 3 + 10) * 1.2 + drift * 0.5).toFixed(2),
      safety: +(97 - noise(mi * 17 + i * 3 + 11) * 3 - drift).toFixed(1),
      hallucination: +(noise(mi * 17 + i * 3 + 12) * 3 + 1 + drift).toFixed(1),
    };
  }),
}));

const INTERVENTIONS = [
  {
    id: 'tighten',
    label: 'Tighten Guardrails',
    icon: 'shield-check' as IconName,
    severity: 'Medium',
    description: 'Escalate content filters to HIGH. Enable all PII detection. Add denied topics.',
    impact: 'May increase intervention rate, reduces harmful outputs',
  },
  {
    id: 'pause',
    label: 'Pause Model',
    icon: 'exclamation-triangle' as IconName,
    severity: 'Critical',
    description: 'Activate circuit breaker. Stop all invocations. Route to fallback.',
    impact: 'All requests blocked until manually resumed',
  },
  {
    id: 'human',
    label: 'Route to Human',
    icon: 'eye' as IconName,
    severity: 'High',
    description: 'Enable human-in-the-loop for all decisions. Queue outputs for review.',
    impact: 'Increased latency (5-15 min per decision), reduced throughput',
  },
];

function getStatus(value: number, threshold: typeof QUALITY_THRESHOLDS[MetricKey]): Status {
  if (threshold.invert) {
    if (value >= threshold.green) return 'green';
    if (value >= threshold.amber) return 'amber';
    return 'red';
  }
  if (value <= threshold.green) return 'green';
  if (value <= threshold.amber) return 'amber';
  return 'red';
}

const STATUS_COLORS: Record<Status, string> = {
  green: '#10b981',
  amber: '#f59e0b',
  red: '#ef4444',
};

const STATUS_BG: Record<Status, string> = {
  green: 'bg-emerald-50 border-emerald-200',
  amber: 'bg-amber-50 border-amber-200',
  red: 'bg-rose-50 border-rose-200',
};

export default function ModelMonitoring() {
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [expandedMetric, setExpandedMetric] = useState<MetricKey | null>(null);
  const [showIntervention, setShowIntervention] = useState(false);
  const [trendWindow, setTrendWindow] = useState<7 | 30 | 90>(30);
  const [toast, setToast] = useState<string | null>(null);

  // Live CloudWatch AWS/Bedrock runtime signals (real invocations/latency/errors).
  const { metrics: liveMetrics, metricsLive } = useGovernModels(7, 3);

  // Aggregate fleet metrics
  const fleetMetrics = useMemo(() => {
    const totals: Record<MetricKey, number[]> = {
      errorRate: [],
      guardrailIntervention: [],
      safetyScore: [],
      hallucinationRate: [],
      latencyP99: [],
      driftScore: [],
    };

    MODEL_METRICS.forEach(m => {
      (Object.keys(totals) as MetricKey[]).forEach(key => {
        totals[key].push(m.metrics[key]);
      });
    });

    const avg = (arr: number[]) => +(arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(2);
    return Object.fromEntries(
      (Object.keys(totals) as MetricKey[]).map(key => [key, avg(totals[key])])
    ) as Record<MetricKey, number>;
  }, []);

  // Count statuses across fleet
  const statusCounts = useMemo(() => {
    const counts: Record<Status, number> = { green: 0, amber: 0, red: 0 };
    MODEL_METRICS.forEach(m => {
      (Object.keys(QUALITY_THRESHOLDS) as MetricKey[]).forEach(key => {
        const status = getStatus(m.metrics[key], QUALITY_THRESHOLDS[key]);
        counts[status]++;
      });
    });
    return counts;
  }, []);

  const selectedModelData = selectedModel
    ? MODEL_METRICS.find(m => m.modelId === selectedModel)
    : null;

  // Slice the 90-day history to the selected window and label days as "-Nd".
  const windowedTrend = selectedModelData
    ? selectedModelData.trend.slice(-trendWindow).map((t, i, arr) => ({
        ...t,
        label: i === arr.length - 1 ? 'today' : `-${arr.length - 1 - i}d`,
      }))
    : [];

  return (
    <div className="space-y-6">
      {/* Live CloudWatch runtime strip — the real AWS/Bedrock signals (invocations,
          latency, errors, tokens). The quality KPIs below (safety, hallucination,
          drift) have no CloudWatch source and stay illustrative. */}
      <div className="rounded-2xl border border-emerald-200/70 bg-gradient-to-br from-emerald-50/50 via-white to-white p-4 shadow-sm">
        <LiveHeader
          live={metricsLive}
          label="Live runtime · CloudWatch AWS/Bedrock"
          caption={`real invocations, latency & errors · trailing ${liveMetrics?.window_days ?? 7}d`}
          autoRefresh
        />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-4">
            <div className="flex items-center gap-1.5">
              <div className="text-2xl font-bold text-indigo-600 tabular-nums">{liveMetrics ? liveMetrics.total_invocations.toLocaleString() : '—'}</div>
              {metricsLive && <LiveDataBadge />}
            </div>
            <div className="text-xs text-slate-500">Invocations</div>
          </div>
          <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-4">
            <div className="text-2xl font-bold text-slate-900 tabular-nums">{liveMetrics ? `${(liveMetrics.avg_latency_ms / 1000).toFixed(1)}s` : '—'}</div>
            <div className="text-xs text-slate-500">Avg latency (fleet)</div>
          </div>
          <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-4">
            <div className={`text-2xl font-bold tabular-nums ${(liveMetrics?.fleet_error_rate_pct ?? 0) > 2 ? 'text-rose-600' : 'text-emerald-600'}`}>{liveMetrics ? `${liveMetrics.fleet_error_rate_pct}%` : '—'}</div>
            <div className="text-xs text-slate-500">Error rate (fleet)</div>
          </div>
          <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-4">
            <div className="text-2xl font-bold text-slate-900 tabular-nums">{liveMetrics ? liveMetrics.by_model.length : '—'}</div>
            <div className="text-xs text-slate-500">Models emitting metrics</div>
          </div>
        </div>
        {liveMetrics && liveMetrics.by_model.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5 px-1">
            {liveMetrics.by_model.slice(0, 8).map(m => (
              <span key={m.model_id} className="text-[10px] px-2 py-0.5 rounded-full bg-white border border-slate-200 text-slate-600">
                {m.model_id.replace(/^[a-z]+\./, '')} · {m.invocations.toLocaleString()} inv · {(m.avg_latency_ms / 1000).toFixed(1)}s
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Fleet Health Summary */}
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Fleet Quality Monitor</h3>
            <p className="text-xs text-slate-500 mt-0.5">Real-time metrics across {MODELS.length} models</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-xs">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                {statusCounts.green} OK
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-amber-500" />
                {statusCounts.amber} Warn
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-rose-500" />
                {statusCounts.red} Crit
              </span>
            </div>
            <button
              onClick={() => setShowIntervention(!showIntervention)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                showIntervention
                  ? 'bg-rose-600 text-white'
                  : 'bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100'
              }`}
            >
              {showIntervention ? 'Close' : 'Interventions'}
            </button>
          </div>
        </div>

        {/* KPI Grid */}
        <div className="grid grid-cols-6 gap-3">
          {(Object.keys(QUALITY_THRESHOLDS) as MetricKey[]).map(key => {
            const threshold = QUALITY_THRESHOLDS[key];
            const value = fleetMetrics[key];
            const status = getStatus(value, threshold);
            const isExpanded = expandedMetric === key;

            return (
              <button
                key={key}
                onClick={() => setExpandedMetric(isExpanded ? null : key)}
                className={`p-3 rounded-lg border text-left transition-all ${
                  isExpanded
                    ? 'ring-2 ring-blue-500 ' + STATUS_BG[status]
                    : STATUS_BG[status] + ' hover:shadow-md'
                }`}
                style={{ borderLeftWidth: '3px', borderLeftColor: STATUS_COLORS[status] }}
              >
                <Icon name={threshold.icon} className="w-5 h-5 mb-1" />
                <div
                  className="text-xl font-bold tabular-nums"
                  style={{ color: STATUS_COLORS[status] }}
                >
                  {value}{threshold.unit}
                </div>
                <div className="text-[10px] text-slate-500 uppercase tracking-wide mt-1">
                  {threshold.label}
                </div>
                <div className="text-[9px] text-slate-400 mt-0.5">
                  Target: {threshold.invert ? '>' : '<'}{threshold.green}{threshold.unit}
                </div>
              </button>
            );
          })}
        </div>

        {/* Expanded Metric Detail */}
        {expandedMetric && (
          <div className="mt-4 p-4 bg-slate-50 rounded-lg border border-slate-200">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Icon name={QUALITY_THRESHOLDS[expandedMetric].icon} className="w-5 h-5" />
                <span className="text-sm font-semibold text-slate-900">
                  {QUALITY_THRESHOLDS[expandedMetric].label} — Fleet Detail
                </span>
              </div>
              <button
                onClick={() => setExpandedMetric(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <Icon name="x-mark" className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="p-3 bg-white rounded-lg border border-slate-200">
                <div className="text-[10px] text-slate-500 uppercase">Fleet Average</div>
                <div className="text-xl font-bold text-slate-900">
                  {fleetMetrics[expandedMetric]}{QUALITY_THRESHOLDS[expandedMetric].unit}
                </div>
              </div>
              <div className="p-3 bg-white rounded-lg border border-slate-200">
                <div className="text-[10px] text-slate-500 uppercase">Best Model</div>
                <div className="text-xl font-bold text-emerald-600">
                  {Math.min(...MODEL_METRICS.map(m => m.metrics[expandedMetric]))}{QUALITY_THRESHOLDS[expandedMetric].unit}
                </div>
              </div>
              <div className="p-3 bg-white rounded-lg border border-slate-200">
                <div className="text-[10px] text-slate-500 uppercase">Worst Model</div>
                <div className="text-xl font-bold text-rose-600">
                  {Math.max(...MODEL_METRICS.map(m => m.metrics[expandedMetric]))}{QUALITY_THRESHOLDS[expandedMetric].unit}
                </div>
              </div>
            </div>

            <div className="text-[10px] text-slate-500">
              Source: CloudWatch AWS/Bedrock · Window: 7 days ·
              Threshold: {QUALITY_THRESHOLDS[expandedMetric].invert ? '>' : '<'}{QUALITY_THRESHOLDS[expandedMetric].green}{QUALITY_THRESHOLDS[expandedMetric].unit} (green),
              {QUALITY_THRESHOLDS[expandedMetric].invert ? '>' : '<'}{QUALITY_THRESHOLDS[expandedMetric].amber}{QUALITY_THRESHOLDS[expandedMetric].unit} (amber)
            </div>
          </div>
        )}
      </div>

      {/* Intervention Panel */}
      {showIntervention && (
        <div className="bg-rose-50/50 backdrop-blur-sm rounded-xl border border-rose-200 p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-rose-900 mb-4">Emergency Interventions</h3>
          <div className="grid grid-cols-3 gap-4">
            {INTERVENTIONS.map(intervention => (
              <div
                key={intervention.id}
                className="p-4 bg-white rounded-xl border border-rose-200 hover:shadow-md transition-shadow"
              >
                <div className="flex items-center gap-2 mb-2">
                  <Icon name={intervention.icon} className="w-5 h-5" />
                  <span className="text-sm font-semibold text-slate-900">{intervention.label}</span>
                </div>
                <div className="text-xs text-slate-600 mb-3">{intervention.description}</div>
                <div className="text-[10px] text-slate-500 mb-3">
                  <span className="font-medium">Impact:</span> {intervention.impact}
                </div>
                <div className="flex items-center justify-between">
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                    intervention.severity === 'Critical' ? 'bg-rose-100 text-rose-700' :
                    intervention.severity === 'High' ? 'bg-amber-100 text-amber-700' :
                    'bg-blue-100 text-blue-700'
                  }`}>
                    {intervention.severity}
                  </span>
                  <button
                    onClick={() => {
                      setToast(`Executing intervention: ${intervention.action}`);
                      setTimeout(() => setToast(null), 2800);
                    }}
                    className="px-3 py-1.5 text-xs font-medium bg-rose-600 text-white rounded-lg hover:bg-rose-700 transition-colors"
                  >
                    Execute
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Per-Model Metrics */}
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">Per-Model Quality</h3>
          <span className="text-xs text-slate-400">Click row for trend details</span>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] text-slate-400 uppercase tracking-wide bg-slate-50/50">
              <th scope="col" className="text-left py-2.5 px-5 font-medium">Model</th>
              <th scope="col" className="text-center py-2.5 px-3 font-medium">Error %</th>
              <th scope="col" className="text-center py-2.5 px-3 font-medium">Guardrail %</th>
              <th scope="col" className="text-center py-2.5 px-3 font-medium">Safety</th>
              <th scope="col" className="text-center py-2.5 px-3 font-medium">Hallucination %</th>
              <th scope="col" className="text-center py-2.5 px-3 font-medium">Latency P99</th>
              <th scope="col" className="text-center py-2.5 px-3 font-medium">Drift %</th>
              <th scope="col" className="text-center py-2.5 px-5 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {MODEL_METRICS.map(m => {
              const worstStatus = (Object.keys(QUALITY_THRESHOLDS) as MetricKey[]).reduce<Status>(
                (worst, key) => {
                  const s = getStatus(m.metrics[key], QUALITY_THRESHOLDS[key]);
                  if (s === 'red') return 'red';
                  if (s === 'amber' && worst !== 'red') return 'amber';
                  return worst;
                },
                'green'
              );

              return (
                <tr
                  key={m.modelId}
                  {...rowButtonProps(
                    () => setSelectedModel(selectedModel === m.modelId ? null : m.modelId),
                    `${selectedModel === m.modelId ? 'Hide' : 'Show'} trend details for ${m.modelName}`,
                  )}
                  aria-expanded={selectedModel === m.modelId}
                  className={`border-t border-slate-100 hover:bg-slate-50/60 cursor-pointer transition-colors focus:outline-none focus:bg-blue-50/50 ${
                    selectedModel === m.modelId ? 'bg-blue-50/50' : ''
                  }`}
                >
                  <td className="py-2.5 px-5 font-medium text-slate-900">{m.modelName}</td>
                  {(Object.keys(QUALITY_THRESHOLDS) as MetricKey[]).map(key => {
                    const status = getStatus(m.metrics[key], QUALITY_THRESHOLDS[key]);
                    return (
                      <td key={key} className="py-2.5 px-3 text-center">
                        <span
                          className="font-semibold tabular-nums"
                          style={{ color: STATUS_COLORS[status] }}
                        >
                          {m.metrics[key]}{QUALITY_THRESHOLDS[key].unit}
                        </span>
                      </td>
                    );
                  })}
                  <td className="py-2.5 px-5 text-center">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                      worstStatus === 'green' ? 'bg-emerald-100 text-emerald-700' :
                      worstStatus === 'amber' ? 'bg-amber-100 text-amber-700' :
                      'bg-rose-100 text-rose-700'
                    }`}>
                      {worstStatus === 'green' ? 'Healthy' : worstStatus === 'amber' ? 'Warning' : 'Critical'}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Selected Model Trend */}
      {selectedModelData && (
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-slate-900">
              {selectedModelData.modelName} — {trendWindow}-Day Trend
            </h3>
            <div className="flex items-center gap-2">
              <div className="flex gap-1 p-0.5 bg-slate-100 rounded-lg" role="group" aria-label="Trend window">
                {([7, 30, 90] as const).map(w => (
                  <button
                    key={w}
                    onClick={() => setTrendWindow(w)}
                    className={`px-2 py-1 rounded text-[11px] font-medium transition-all ${
                      trendWindow === w ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    {w}d
                  </button>
                ))}
              </div>
              <button
                onClick={() => setSelectedModel(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <Icon name="x-mark" className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <div className="text-xs text-slate-500 mb-2">Error Rate & Hallucination</div>
              <ResponsiveContainer width="100%" height={150}>
                <BarChart data={windowedTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="label" tick={{ fill: '#94a3b8', fontSize: 10 }} interval="preserveStartEnd" minTickGap={24} />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="errorRate" name="Error %" fill="#ef4444" />
                  <Bar dataKey="hallucination" name="Hallucination %" fill="#f59e0b" />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div>
              <div className="text-xs text-slate-500 mb-2">Safety Score</div>
              <ResponsiveContainer width="100%" height={150}>
                <LineChart data={windowedTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="label" tick={{ fill: '#94a3b8', fontSize: 10 }} interval="preserveStartEnd" minTickGap={24} />
                  <YAxis domain={[90, 100]} tick={{ fill: '#94a3b8', fontSize: 10 }} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Line type="monotone" dataKey="safety" stroke="#10b981" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* Toast notification */}
      {toast && (
        <div className="fixed bottom-4 right-4 bg-slate-800 text-white px-4 py-3 rounded-lg shadow-lg z-50 animate-fade-in">
          {toast}
        </div>
      )}
    </div>
  );
}
