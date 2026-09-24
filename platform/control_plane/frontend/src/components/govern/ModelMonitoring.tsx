/**
 * ModelMonitoring — Model quality monitoring
 *
 * Live CloudWatch runtime signals (invocations/latency/errors) are real; the
 * quality KPIs (drift, hallucination, safety) are illustrative until a
 * CloudWatch/SageMaker Model Monitor source is wired.
 *
 * Features:
 * - Quality KPIs with thresholds (error rate, safety, hallucination, drift)
 * - Traffic light status (green/amber/red)
 * - Drill-down details with trend charts
 * - Intervention actions (tighten guardrails, pause model, route to human)
 */

import { useState, useMemo, useEffect } from 'react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { MODELS, tooltipStyle } from './mockData';
import { useGovernModels } from './useGovernModels';
import { LiveDataBadge, MockDataBadge } from './DataSourceIndicator';
import LiveHeader from './LiveHeader';
import { Icon, type IconName } from './icons';
import { rowButtonProps } from './a11y';
import { governSageMakerApi, type AwsModelMonitorResponse } from '../../api/client';

// Quality thresholds - green/amber boundaries
const QUALITY_THRESHOLDS = {
  errorRate: { green: 0.5, amber: 2, label: 'Error Rate', unit: '%', icon: 'exclamation-triangle' as IconName, invert: false },
  guardrailIntervention: { green: 5, amber: 15, label: 'Guardrail Interventions', unit: '%', icon: 'shield-check' as IconName, invert: false },
  safetyScore: { green: 98, amber: 95, label: 'Safety Score', unit: '%', icon: 'check-circle' as IconName, invert: true },
  hallucinationRate: { green: 2, amber: 5, label: 'Hallucination Rate', unit: '%', icon: 'chat-bubble' as IconName, invert: false },
  latencyP99: { green: 3, amber: 5, label: 'Avg Latency', unit: 's', icon: 'arrow-path' as IconName, invert: false },
  driftScore: { green: 2, amber: 5, label: 'Model Drift', unit: '%', icon: 'chart-line' as IconName, invert: false },
};

type MetricKey = keyof typeof QUALITY_THRESHOLDS;
type Status = 'green' | 'amber' | 'red';

interface ModelMetrics {
  modelId: string;
  modelName: string;
  metrics: Record<MetricKey, number>;
  trend: { day: number; errorRate: number; safety: number; hallucination: number }[];
  /** True when error/latency are backed by a live CloudWatch by_model row. */
  isLive?: boolean;
  /** Which MetricKeys came from live CloudWatch (error rate, latency). */
  liveKeys?: MetricKey[];
  /** Live trailing-window invocation count (CloudWatch), when live. */
  invocations?: number;
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

// MetricKeys that CloudWatch AWS/Bedrock can source live (per-model). The rest
// (guardrail, safety, hallucination, drift) have no live source and stay
// illustrative until SageMaker Model Monitor / eval feeds are wired.
const LIVE_METRIC_KEYS: MetricKey[] = ['errorRate', 'latencyP99'];

// Model-family tokens used to borrow illustrative quality (safety/hallucination/
// drift) for a live model_id from the closest mock model.
const FAMILY_RE = /haiku|sonnet|opus|nova|pro|lite|titan|llama|mistral|command|jamba/g;

function matchMockModel(liveModelId: string): ModelMetrics | undefined {
  const lid = liveModelId.toLowerCase();
  return MODEL_METRICS.find(mm => {
    const toks = mm.modelName.toLowerCase().match(FAMILY_RE) ?? [];
    return toks.length > 0 && toks.every(t => lid.includes(t));
  });
}

// Strip region + provider prefixes and the trailing version for a readable label.
function prettyModelName(modelId: string): string {
  return modelId
    .replace(/^(us|eu|apac|us-gov)\./, '')
    .replace(/^[a-z0-9-]+\./, '')
    .replace(/[-:]v?\d+(:\d+)?$/i, '');
}

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

// Run-status pill styling for the SageMaker analyzer processing job.
const RUN_STATUS_STYLE: Record<string, string> = {
  Completed: 'bg-emerald-100 text-emerald-700',
  InProgress: 'bg-blue-100 text-blue-700',
  Failed: 'bg-rose-100 text-rose-700',
  Stopping: 'bg-amber-100 text-amber-700',
  Stopped: 'bg-slate-200 text-slate-600',
};

// Colour a per-feature drift % by magnitude (data-quality convention).
function driftColor(pct?: number | null): string {
  if (pct == null) return '#94a3b8';
  const a = Math.abs(pct);
  if (a < 2) return '#10b981';
  if (a < 5) return '#f59e0b';
  return '#ef4444';
}

const fmtMean = (n?: number | null) =>
  n == null ? '—' : (Math.abs(n) >= 1000 || Number.isInteger(n) ? n.toLocaleString() : n.toFixed(3));

/**
 * DataQualityDriftPanel — live SageMaker Model Monitor data-quality drift.
 *
 * Reads the analyzer run's baseline vs captured constraints/statistics from S3
 * via governSageMakerApi.modelMonitor(). LiveDataBadge is gated on `.live`;
 * pending / unreachable states surface the backend's honest `.note` and never
 * show fabricated numbers. Model Monitor *scheduling* is in AWS maintenance mode
 * for this account, so drift is produced by an on-demand analyzer processing job.
 */
function DataQualityDriftPanel() {
  const [data, setData] = useState<AwsModelMonitorResponse | null>(null);
  const [loading, setLoading] = useState(true);

  // Single graceful fetch — a failure leaves data null so the panel badges the
  // source honestly rather than crashing the monitoring surface.
  useEffect(() => {
    let cancelled = false;
    governSageMakerApi.modelMonitor()
      .then(res => { if (!cancelled) setData(res); })
      .catch(() => { if (!cancelled) setData(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const live = !!data?.live;
  const violations = data?.violations ?? [];
  const stats = data?.feature_stats ?? [];
  const configuredPending = !live && !!data?.monitor_configured;

  return (
    <div className="rounded-2xl border border-orange-200/70 bg-gradient-to-br from-orange-50/40 via-white to-white p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Icon name="beaker" className="w-4 h-4 text-orange-500" />
          <h3 className="text-sm font-semibold text-slate-900">Data Quality Drift (SageMaker Model Monitor)</h3>
          {live
            ? <LiveDataBadge source="SageMaker" detail="Model Monitor baseline vs analyzed capture (constraint_violations.json + statistics.json, S3)" />
            : <MockDataBadge integration="SageMaker Model Monitor: baseline vs monitor-results (S3)" />}
        </div>
        {data?.monitored_endpoint && (
          <span className="text-[10px] text-slate-500 font-mono truncate max-w-[220px]" title={data.monitored_endpoint}>
            {data.monitored_endpoint}
          </span>
        )}
      </div>

      {loading ? (
        <div className="text-[11px] text-slate-400">Loading Model Monitor drift…</div>
      ) : (
        <>
          {/* Summary chips: endpoint, baseline features, violations, last run */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-3">
              <div className="text-2xl font-bold text-slate-900 tabular-nums">{data ? data.baseline_features : '—'}</div>
              <div className="text-[11px] text-slate-500">Baseline features</div>
            </div>
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-3">
              <div className={`text-2xl font-bold tabular-nums ${(data?.violations_count ?? 0) > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                {data ? data.violations_count : '—'}
              </div>
              <div className="text-[11px] text-slate-500">Drift violations</div>
            </div>
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-3">
              <div className="flex items-center gap-1.5">
                {data?.last_run_status
                  ? <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${RUN_STATUS_STYLE[data.last_run_status] ?? 'bg-slate-200 text-slate-600'}`}>{data.last_run_status}</span>
                  : <span className="text-slate-300 text-sm">—</span>}
              </div>
              <div className="text-[11px] text-slate-500 mt-1">Analyzer run</div>
            </div>
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-3">
              <div className="text-sm font-semibold text-slate-700 tabular-nums flex items-center gap-1">
                <Icon name="clock" className="w-3.5 h-3.5 text-slate-400" />
                {data?.last_run ? new Date(data.last_run).toLocaleString() : '—'}
              </div>
              <div className="text-[11px] text-slate-500 mt-1">Last run</div>
            </div>
          </div>

          {/* Not-live: surface the backend's honest note (pending or unreachable). */}
          {!live && data?.note && (
            <div className={`flex items-start gap-2 text-[11px] rounded-lg p-3 border mb-4 ${
              configuredPending ? 'text-purple-700 bg-purple-50/60 border-purple-200' : 'text-slate-600 bg-slate-50 border-slate-200'
            }`}>
              <Icon name={configuredPending ? 'clock' : 'information-circle'} className="w-4 h-4 mt-px shrink-0" />
              <span>{data.note}</span>
            </div>
          )}

          {/* Live + no findings: honest positive (baseline met, no drift). */}
          {live && violations.length === 0 && stats.length === 0 && (
            <div className="flex items-start gap-2 text-[11px] text-emerald-700 bg-emerald-50/60 rounded-lg p-3 border border-emerald-200 mb-4">
              <Icon name="check-circle" className="w-4 h-4 mt-px shrink-0" />
              <span>Monitor configured, drift results pending — no constraint violations or feature statistics returned for this run yet.</span>
            </div>
          )}

          {/* Violations table */}
          {violations.length > 0 && (
            <div className="mb-4">
              <div className="flex items-center gap-1.5 mb-2">
                <Icon name="exclamation-triangle" className="w-3.5 h-3.5 text-rose-500" />
                <span className="text-xs font-semibold text-slate-700">Constraint violations</span>
                <span className="text-[10px] text-slate-400">baseline constraints vs analyzed capture</span>
              </div>
              <div className="max-h-64 overflow-auto rounded-lg border border-slate-100">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-[10px] text-slate-400 uppercase tracking-wide bg-slate-50/70">
                      <th scope="col" className="text-left py-2 px-3 font-medium">Feature</th>
                      <th scope="col" className="text-left py-2 px-3 font-medium">Check type</th>
                      <th scope="col" className="text-left py-2 px-3 font-medium">Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {violations.map((v, i) => (
                      <tr key={`${v.feature}-${v.check_type}-${i}`} className="border-t border-slate-100 align-top">
                        <td className="py-2 px-3 font-medium text-slate-800">{v.feature || '—'}</td>
                        <td className="py-2 px-3">
                          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-100">
                            {v.check_type || '—'}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-slate-600">{v.description || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Feature-drift table (baseline mean vs current mean vs drift %) */}
          {stats.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <Icon name="chart-line" className="w-3.5 h-3.5 text-orange-500" />
                <span className="text-xs font-semibold text-slate-700">Feature drift</span>
                <span className="text-[10px] text-slate-400">baseline mean vs current mean (numerical_statistics)</span>
              </div>
              <div className="max-h-64 overflow-auto rounded-lg border border-slate-100">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-[10px] text-slate-400 uppercase tracking-wide bg-slate-50/70">
                      <th scope="col" className="text-left py-2 px-3 font-medium">Feature</th>
                      <th scope="col" className="text-right py-2 px-3 font-medium">Baseline mean</th>
                      <th scope="col" className="text-right py-2 px-3 font-medium">Current mean</th>
                      <th scope="col" className="text-right py-2 px-3 font-medium">Drift %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.map((s, i) => (
                      <tr key={`${s.feature}-${i}`} className="border-t border-slate-100">
                        <td className="py-2 px-3 font-medium text-slate-800">{s.feature}</td>
                        <td className="py-2 px-3 text-right tabular-nums text-slate-600">{fmtMean(s.baseline)}</td>
                        <td className="py-2 px-3 text-right tabular-nums text-slate-600">{fmtMean(s.current)}</td>
                        <td className="py-2 px-3 text-right tabular-nums font-semibold" style={{ color: driftColor(s.drift_pct) }}>
                          {s.drift_pct == null ? '—' : `${s.drift_pct > 0 ? '+' : ''}${s.drift_pct.toFixed(2)}%`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <p className="text-[10px] text-slate-400 mt-3 italic">
            Model Monitor scheduling is in AWS maintenance mode for this account; drift is computed by an on-demand
            analyzer processing job and read from S3. Baseline feature count, violations, and per-feature means are live.
          </p>
        </>
      )}
    </div>
  );
}

export default function ModelMonitoring() {
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [expandedMetric, setExpandedMetric] = useState<MetricKey | null>(null);
  const [showIntervention, setShowIntervention] = useState(false);
  const [trendWindow, setTrendWindow] = useState<7 | 30 | 90>(30);
  const [toast, setToast] = useState<string | null>(null);

  // Live CloudWatch AWS/Bedrock runtime signals (real invocations/latency/errors).
  const { metrics: liveMetrics, metricsLive } = useGovernModels(7, 3);

  // Per-model quality rows. When CloudWatch AWS/Bedrock returns live per-model
  // signals, error rate + latency (and invocation counts) come straight from
  // metrics.by_model; the remaining quality dimensions borrow illustrative
  // values from the closest mock model. Falls back to the full mock set when no
  // live rows are present, so the surface never crashes or shows fake "Live".
  const perModel = useMemo<ModelMetrics[]>(() => {
    const liveRows = liveMetrics?.live ? liveMetrics.by_model : [];
    if (liveRows.length === 0) {
      return MODEL_METRICS.map(m => ({ ...m, isLive: false }));
    }
    return liveRows.map((row, ri) => {
      const mock = matchMockModel(row.model_id) ?? MODEL_METRICS[ri % MODEL_METRICS.length];
      return {
        modelId: row.model_id,
        modelName: prettyModelName(row.model_id) || mock.modelName,
        metrics: {
          errorRate: +row.error_rate_pct.toFixed(2),
          latencyP99: +(row.avg_latency_ms / 1000).toFixed(2),
          guardrailIntervention: mock.metrics.guardrailIntervention,
          safetyScore: mock.metrics.safetyScore,
          hallucinationRate: mock.metrics.hallucinationRate,
          driftScore: mock.metrics.driftScore,
        },
        trend: mock.trend,
        isLive: true,
        liveKeys: LIVE_METRIC_KEYS,
        invocations: row.invocations,
      };
    });
  }, [liveMetrics]);

  // Live only when at least one row is CloudWatch-backed.
  const anyLive = perModel.some(m => m.isLive);
  const liveKeySet = anyLive ? new Set<MetricKey>(LIVE_METRIC_KEYS) : new Set<MetricKey>();

  // Aggregate fleet metrics across the (possibly live) per-model rows.
  const { fleetMetrics, latencyCoverage } = useMemo(() => {
    const totals: Record<MetricKey, number[]> = {
      errorRate: [],
      guardrailIntervention: [],
      safetyScore: [],
      hallucinationRate: [],
      latencyP99: [],
      driftScore: [],
    };

    perModel.forEach(m => {
      (Object.keys(totals) as MetricKey[]).forEach(key => {
        totals[key].push(m.metrics[key]);
      });
    });

    const avg = (arr: number[]) => (arr.length ? +(arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(2) : 0);
    const result = Object.fromEntries(
      (Object.keys(totals) as MetricKey[]).map(key => [key, avg(totals[key])])
    ) as Record<MetricKey, number>;

    // Error Rate is a pooled rate, so recompute it invocation-weighted as
    // Σ(rate_i × invocations_i) / Σ(invocations_i) = Σerrors / Σinvocations — never an
    // unweighted mean of per-model rates, which ignores each model's differing traffic.
    // Invocation counts are present on live CloudWatch rows; when absent (pure mock, no
    // denominator to pool by) fall back to the arithmetic mean above.
    // Every row with invocations > 0 carries a genuinely measured error_rate_pct (the
    // backend only emits 0.0 there when invocations are 0), so this numerator and
    // denominator already range over the same set of models.
    const totalInvocations = perModel.reduce((a, m) => a + (m.invocations ?? 0), 0);
    if (totalInvocations > 0) {
      const weightedErrors = perModel.reduce((a, m) => a + m.metrics.errorRate * (m.invocations ?? 0), 0);
      result.errorRate = +(weightedErrors / totalInvocations).toFixed(2);
    }

    // Latency is invocation-weighted too, but it must NOT share the error-rate
    // denominator. The backend emits avg_latency_ms = 0.0 for a model that has traffic
    // yet published no latency datapoint (govern_models.py `_merge_runtime_metrics`:
    // `lat = round(lat_weighted / lat_inv, 1) if lat_inv > 0 else 0.0`). Weighting those
    // rows over `totalInvocations` contributed 0 to the numerator while still counting
    // their invocations in the denominator, so a high-traffic model with no latency
    // telemetry dragged the fleet mean toward zero. It failed silently: the result was
    // still a plausible number of seconds, no per-model row looked wrong, and the only
    // visible symptom was disagreeing with the "Avg latency (fleet)" tile above — which
    // renders the backend's own correctly-weighted figure. Restricting both sums to the
    // latency-reporting rows reproduces the backend's fleet_lat_weighted / fleet_lat_inv.
    const latencyRows = perModel.filter(m => (m.invocations ?? 0) > 0 && m.metrics.latencyP99 > 0);
    const latencyInvocations = latencyRows.reduce((a, m) => a + (m.invocations ?? 0), 0);
    if (latencyInvocations > 0) {
      const weightedLatency = latencyRows.reduce((a, m) => a + m.metrics.latencyP99 * (m.invocations ?? 0), 0);
      result.latencyP99 = +(weightedLatency / latencyInvocations).toFixed(2);
    }

    // Coverage travels with the pooled latency so the KPI can disclose "N of M
    // reported" rather than imply the whole fleet was measured. null on the mock path,
    // where there is no invocation denominator and nothing was measured at all.
    const coverage = totalInvocations > 0
      ? {
          reported: latencyRows.length,
          total: perModel.filter(m => (m.invocations ?? 0) > 0).length,
        }
      : null;

    return { fleetMetrics: result, latencyCoverage: coverage };
  }, [perModel]);

  // Count statuses across the per-model rows.
  const statusCounts = useMemo(() => {
    const counts: Record<Status, number> = { green: 0, amber: 0, red: 0 };
    perModel.forEach(m => {
      (Object.keys(QUALITY_THRESHOLDS) as MetricKey[]).forEach(key => {
        const status = getStatus(m.metrics[key], QUALITY_THRESHOLDS[key]);
        counts[status]++;
      });
    });
    return counts;
  }, [perModel]);

  // Best / Worst model for the expanded metric. The direction comes from that metric's
  // own `invert` flag rather than being hardcoded: safetyScore is invert:true (HIGHER is
  // better — green at >= 98%), every other metric in QUALITY_THRESHOLDS is invert:false
  // (lower is better). The panel used to take Math.min for "Best" and Math.max for
  // "Worst" unconditionally, so on safetyScore it published the fleet's LOWEST safety
  // score as the best model and the highest as the worst. It failed silently because
  // both figures were real per-model values in the right units — only the labels were
  // backwards, and the same getStatus() colour logic elsewhere on the page (which does
  // consult `invert`) disagreed with it. Reading the flag keeps every metric the panel
  // can display correct, including any inverted one added later.
  const expandedExtremes = useMemo(() => {
    if (!expandedMetric || perModel.length === 0) return null;
    const ranked = [...perModel].sort((a, b) => a.metrics[expandedMetric] - b.metrics[expandedMetric]);
    const lowest = ranked[0];
    const highest = ranked[ranked.length - 1];
    return QUALITY_THRESHOLDS[expandedMetric].invert
      ? { best: highest, worst: lowest }
      : { best: lowest, worst: highest };
  }, [expandedMetric, perModel]);

  const selectedModelData = selectedModel
    ? perModel.find(m => m.modelId === selectedModel)
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

      {/* Live SageMaker Model Monitor data-quality drift — baseline vs analyzed
          capture (real S3 output). Sits alongside the live CloudWatch strip; the
          quality KPIs below stay illustrative. */}
      <DataQualityDriftPanel />

      {/* Fleet Health Summary */}
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-slate-900">Fleet Quality Monitor</h3>
              {anyLive && <LiveDataBadge source="CloudWatch" detail="Error rate & latency from AWS/Bedrock metrics" />}
              <MockDataBadge integration="Safety, hallucination & drift: SageMaker Model Monitor / eval feeds" />
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              {anyLive
                ? `Error rate & latency live from CloudWatch across ${perModel.length} models · safety/hallucination/drift illustrative`
                : `Illustrative quality metrics across ${perModel.length} models`}
            </p>
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
                <div className={`text-[8px] mt-0.5 font-medium uppercase tracking-wide ${liveKeySet.has(key) ? 'text-emerald-600' : 'text-amber-600'}`}>
                  {liveKeySet.has(key) ? 'CloudWatch' : 'Illustrative'}
                </div>
                {/* Partial-coverage disclosure, in the module's "N of M reported" idiom:
                    a latency pooled over a subset of the fleet must say so instead of
                    reading as a fleet-wide measurement. */}
                {key === 'latencyP99' && latencyCoverage && latencyCoverage.reported < latencyCoverage.total && (
                  <div
                    className="text-[8px] mt-0.5 text-slate-500 tabular-nums"
                    title="Invocation-weighted across the models that published a CloudWatch latency datapoint. Models with traffic but no latency telemetry are excluded from both the numerator and the denominator."
                  >
                    {latencyCoverage.reported} of {latencyCoverage.total} reported
                  </div>
                )}
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
              {/* "Best" is the metric's favourable extreme, which is the MAXIMUM for an
                  inverted metric (safety) and the minimum otherwise. The labels stay
                  fixed; only which model each one reads is direction-aware. */}
              <div className="p-3 bg-white rounded-lg border border-slate-200">
                <div className="text-[10px] text-slate-500 uppercase">Best Model</div>
                <div className="text-xl font-bold text-emerald-600" title={expandedExtremes?.best.modelName}>
                  {expandedExtremes
                    ? `${expandedExtremes.best.metrics[expandedMetric]}${QUALITY_THRESHOLDS[expandedMetric].unit}`
                    : '—'}
                </div>
              </div>
              <div className="p-3 bg-white rounded-lg border border-slate-200">
                <div className="text-[10px] text-slate-500 uppercase">Worst Model</div>
                <div className="text-xl font-bold text-rose-600" title={expandedExtremes?.worst.modelName}>
                  {expandedExtremes
                    ? `${expandedExtremes.worst.metrics[expandedMetric]}${QUALITY_THRESHOLDS[expandedMetric].unit}`
                    : '—'}
                </div>
              </div>
            </div>

            <div className="text-[10px] text-slate-500">
              Source: {liveKeySet.has(expandedMetric) ? 'Live CloudWatch AWS/Bedrock' : 'Illustrative — wire CloudWatch/SageMaker Model Monitor for live drift/quality'} ·
              Threshold: {QUALITY_THRESHOLDS[expandedMetric].invert ? '>' : '<'}{QUALITY_THRESHOLDS[expandedMetric].green}{QUALITY_THRESHOLDS[expandedMetric].unit} (green),
              {QUALITY_THRESHOLDS[expandedMetric].invert ? '>' : '<'}{QUALITY_THRESHOLDS[expandedMetric].amber}{QUALITY_THRESHOLDS[expandedMetric].unit} (amber)
              {expandedMetric === 'latencyP99' && latencyCoverage && (
                <> · Invocation-weighted, {latencyCoverage.reported} of {latencyCoverage.total} models reported latency telemetry</>
              )}
              {expandedMetric === 'errorRate' && <> · Invocation-weighted pooled rate</>}
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
                      setToast(`Executing intervention: ${intervention.label}`);
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
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-900">Per-Model Quality</h3>
            {anyLive && <LiveDataBadge source="CloudWatch" detail="Invocations, error rate & latency from AWS/Bedrock metrics" />}
            <MockDataBadge integration="Guardrail, safety, hallucination & drift: SageMaker Model Monitor / eval feeds" />
          </div>
          <span className="text-xs text-slate-400">Click row for trend details</span>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] text-slate-400 uppercase tracking-wide bg-slate-50/50">
              <th scope="col" className="text-left py-2.5 px-5 font-medium">Model</th>
              <th scope="col" className="text-center py-2.5 px-3 font-medium">Invocations</th>
              <th scope="col" className="text-center py-2.5 px-3 font-medium">Error %</th>
              <th scope="col" className="text-center py-2.5 px-3 font-medium">Guardrail %</th>
              <th scope="col" className="text-center py-2.5 px-3 font-medium">Safety</th>
              <th scope="col" className="text-center py-2.5 px-3 font-medium">Hallucination %</th>
              <th scope="col" className="text-center py-2.5 px-3 font-medium">Avg Latency</th>
              <th scope="col" className="text-center py-2.5 px-3 font-medium">Drift %</th>
              <th scope="col" className="text-center py-2.5 px-5 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {perModel.map(m => {
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
                  <td className="py-2.5 px-5 font-medium text-slate-900">
                    <span className="flex items-center gap-1.5">
                      {m.isLive && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" title="Live CloudWatch signals" />}
                      {m.modelName}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-center tabular-nums text-slate-700">
                    {m.invocations != null ? m.invocations.toLocaleString() : <span className="text-slate-300">—</span>}
                  </td>
                  {(Object.keys(QUALITY_THRESHOLDS) as MetricKey[]).map(key => {
                    const status = getStatus(m.metrics[key], QUALITY_THRESHOLDS[key]);
                    const cellLive = m.liveKeys?.includes(key) ?? false;
                    return (
                      <td key={key} className="py-2.5 px-3 text-center">
                        <span
                          className="font-semibold tabular-nums"
                          style={{ color: STATUS_COLORS[status] }}
                          title={cellLive ? 'Live CloudWatch AWS/Bedrock' : 'Illustrative'}
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
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-slate-900">
                {selectedModelData.modelName} — {trendWindow}-Day Trend
              </h3>
              <MockDataBadge integration="Model monitoring: CloudWatch/SageMaker Model Monitor" />
            </div>
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
