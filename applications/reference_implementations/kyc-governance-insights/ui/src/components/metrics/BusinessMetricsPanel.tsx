import React, { useMemo } from 'react';
import type { RAGStatus, TrendDirection } from '../../data/governanceMetricsData';
import { useLiveData } from '../../hooks/useLiveData';
import { fetchMetricsHistory, type MetricsHistoryRow } from '../../api/metrics-history';
import CollapsibleSection from '../shared/CollapsibleSection';

/**
 * BusinessMetricsPanel — rolling 30-day operational KPIs (FPR, STP, time-to-decision,
 * SAR conversion, escalation) with per-KPI sparklines, RAG-coloured values, and a
 * LIVE / NOT SEEDED badge. Reads from /svc/metrics/metrics-history (kyc-metrics-history,
 * seeded by seed_phase3.py). Graceful degradation: if the backend returns empty/unreachable
 * it shows a "run the seed script" state instead of fabricated numbers.
 *
 * Extracted from GovernanceTab so it can be reused (e.g. a CRO/fleet view) and rendered
 * expanded or collapsed.
 */

type KpiKey = 'falsePositiveRate' | 'stpRate' | 'timeToDecision' | 'sarConversionRate' | 'escalationRate';

interface KPIConfig {
  key: KpiKey;
  label: string;
  field: keyof MetricsHistoryRow;
  invertedBetter: boolean;
  target: string;
  format: (v: number) => string;
  rag: (v: number) => RAGStatus;
}

const headlineKPIs: KPIConfig[] = [
  { key: 'falsePositiveRate', label: 'FPR', field: 'false_positive_rate', invertedBetter: true, target: '< 85%', format: (v) => `${(v * 100).toFixed(1)}%`, rag: (v) => (v < 0.85 ? 'green' : v > 0.92 ? 'red' : 'amber') },
  { key: 'stpRate', label: 'STP Rate', field: 'stp_rate', invertedBetter: false, target: '55–75%', format: (v) => `${(v * 100).toFixed(1)}%`, rag: (v) => (v >= 0.55 && v <= 0.75 ? 'green' : v < 0.40 || v > 0.85 ? 'red' : 'amber') },
  { key: 'timeToDecision', label: 'Time-to-Decision', field: 'time_to_decision_median_s', invertedBetter: true, target: '< 3 min (low-risk)', format: (v) => `${Math.round(v)}s`, rag: (v) => (v < 180 ? 'green' : v > 900 ? 'red' : 'amber') },
  { key: 'sarConversionRate', label: 'SAR Conversion', field: 'sar_conversion_rate', invertedBetter: false, target: '8–15%', format: (v) => `${(v * 100).toFixed(1)}%`, rag: (v) => (v >= 0.08 && v <= 0.15 ? 'green' : v < 0.03 || v > 0.25 ? 'red' : 'amber') },
  { key: 'escalationRate', label: 'Escalation Rate', field: 'escalation_rate', invertedBetter: false, target: '15–25%', format: (v) => `${(v * 100).toFixed(1)}%`, rag: (v) => (v >= 0.15 && v <= 0.25 ? 'green' : v < 0.10 || v > 0.40 ? 'red' : 'amber') },
];

interface DerivedMetric {
  current: number;
  sparkline: number[];
  trend: TrendDirection;
  status: RAGStatus;
  target: string;
}

function computeTrend(spark: number[], invertedBetter: boolean): TrendDirection {
  if (spark.length < 3) return 'stable';
  const third = Math.max(1, Math.floor(spark.length / 3));
  const avg = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;
  const delta = avg(spark.slice(-third)) - avg(spark.slice(0, third));
  if (Math.abs(delta) < Math.abs(avg(spark.slice(0, third))) * 0.03) return 'stable';
  if (invertedBetter) return delta < 0 ? 'up' : 'down';
  return delta > 0 ? 'up' : 'down';
}

// Derive the headline KPI view from live seeded history. Returns null if any required
// KPI field is entirely absent (unseeded) so the UI shows a "run the seed script" prompt.
function buildLiveKpis(history: MetricsHistoryRow[]): Record<KpiKey, DerivedMetric> | null {
  const result = {} as Record<KpiKey, DerivedMetric>;
  for (const kpi of headlineKPIs) {
    const series = history
      .map((r) => r[kpi.field])
      .filter((v): v is number => typeof v === 'number' && !Number.isNaN(v));
    if (series.length === 0) return null;
    const current = series[series.length - 1];
    result[kpi.key] = { current, sparkline: series, trend: computeTrend(series, kpi.invertedBetter), status: kpi.rag(current), target: kpi.target };
  }
  return result;
}

const ragColors: Record<RAGStatus, string> = { green: '#10b981', amber: '#f59e0b', red: '#ef4444' };
const trendSymbols: Record<TrendDirection, { arrow: string; color: string }> = {
  up: { arrow: '↑', color: '#10b981' },
  down: { arrow: '↓', color: '#ef4444' },
  stable: { arrow: '→', color: '#64748b' },
};

function Sparkline({ data, color }: { data: number[]; color: string }) {
  const width = 120;
  const height = 28;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return `${x},${y}`;
  }).join(' ');
  return (
    <svg width={width} height={height} style={{ display: 'block', marginTop: '4px' }}>
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

interface BusinessMetricsPanelProps {
  /** Tier-2 depth in the Governance view collapses by default; a CRO view can pass false. */
  defaultCollapsed?: boolean;
}

export default function BusinessMetricsPanel({ defaultCollapsed = true }: BusinessMetricsPanelProps) {
  const { data: metricsHistory } = useLiveData<MetricsHistoryRow[] | null>(fetchMetricsHistory, null);
  const liveKpis = useMemo(() => (metricsHistory ? buildLiveKpis(metricsHistory) : null), [metricsHistory]);

  return (
    <CollapsibleSection
      title="Business Metrics (30-day)"
      defaultCollapsed={defaultCollapsed}
      collapsedHint={liveKpis ? 'LIVE' : 'NOT SEEDED'}
      info="Rolling 30-day operational KPIs — false-positive rate, straight-through rate, time-to-decision, SAR conversion, and escalation rate — read from the seeded metrics history. LIVE = served from DynamoDB; NOT SEEDED = run seed_phase3.py to populate it."
    >
      {!liveKpis ? (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px', padding: '1rem', fontSize: '0.7rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
          No metric history found. Run <code style={{ fontFamily: 'var(--font-mono, monospace)' }}>seed_phase3.py</code> to
          populate the 30-day governance trend into DynamoDB, then reload.
        </div>
      ) : (
        <>
          {/* KPI Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${headlineKPIs.length}, 1fr)`, gap: '0.75rem', marginBottom: '0.75rem' }}>
            {headlineKPIs.map((kpi) => {
              const metric = liveKpis[kpi.key];
              const trend = trendSymbols[metric.trend];
              return (
                <div key={kpi.key} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px', padding: '0.75rem 1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '2px' }}>
                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#4caf50', display: 'inline-block', flexShrink: 0 }}></span>
                    <span style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>{kpi.label}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                    <span style={{ fontSize: '1.4rem', fontWeight: 700, color: ragColors[metric.status] }}>{kpi.format(metric.current)}</span>
                    <span style={{ fontSize: '0.9rem', fontWeight: 600, color: trend.color }}>{trend.arrow}</span>
                  </div>
                  <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginTop: '2px' }}>Target: {metric.target}</div>
                </div>
              );
            })}
          </div>
          {/* Sparkline Row */}
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${headlineKPIs.length}, 1fr)`, gap: '0.75rem' }}>
            {headlineKPIs.map((kpi) => {
              const metric = liveKpis[kpi.key];
              return (
                <div key={`spark-${kpi.key}`} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '6px', padding: '0.4rem 0.75rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#4caf50', display: 'inline-block', flexShrink: 0 }}></span>
                  <span style={{ fontSize: '0.55rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{kpi.label}</span>
                  <Sparkline data={metric.sparkline} color={ragColors[metric.status]} />
                </div>
              );
            })}
          </div>
        </>
      )}
    </CollapsibleSection>
  );
}
