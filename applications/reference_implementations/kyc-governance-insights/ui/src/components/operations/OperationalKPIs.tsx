import React from 'react';
import {
  kpiMetrics,
  backlogBreakdown,
  hourlyDecisions,
  onboardingPercentiles,
  type KpiMetric,
} from '../../data/operationalKpiData';

function Sparkline({ data, target, color, height = 32, width = 120 }: {
  data: number[];
  target: number;
  color: string;
  height?: number;
  width?: number;
}) {
  const min = Math.min(...data, target) * 0.95;
  const max = Math.max(...data, target) * 1.05;
  const range = max - min || 1;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * height;
    return `${x},${y}`;
  }).join(' ');

  const targetY = height - ((target - min) / range) * height;

  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      <line x1={0} y1={targetY} x2={width} y2={targetY} stroke="var(--text-muted)" strokeWidth="0.5" strokeDasharray="3,3" opacity={0.5} />
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function getStatusColor(metric: KpiMetric): string {
  const { currentValue, target, id } = metric;
  // For metrics where lower is better (FP rate, handling time, backlog, onboarding)
  const lowerIsBetter = ['false-positive-rate', 'avg-handling-time', 'backlog-size', 'onboarding-time'].includes(id);
  
  if (lowerIsBetter) {
    if (currentValue <= target) return '#10b981';
    if (currentValue <= target * 1.1) return '#f59e0b';
    return '#ef4444';
  } else {
    if (currentValue >= target) return '#10b981';
    if (currentValue >= target * 0.9) return '#f59e0b';
    return '#ef4444';
  }
}

function getTrendArrow(metric: KpiMetric): string {
  if (metric.trend === 'up') return '↑';
  if (metric.trend === 'down') return '↓';
  return '→';
}

function getDelta(metric: KpiMetric): string {
  const diff = metric.currentValue - metric.lastPeriodValue;
  const sign = diff >= 0 ? '+' : '';
  if (metric.format === 'percent') return `${sign}${diff}%`;
  if (metric.format === 'minutes') return `${sign}${diff.toFixed(1)} min`;
  if (metric.format === 'hours') return `${sign}${diff.toFixed(1)} hrs`;
  return `${sign}${Math.round(diff)}`;
}

function formatValue(metric: KpiMetric): string {
  if (metric.format === 'percent') return `${metric.currentValue}%`;
  if (metric.format === 'minutes') return `${metric.currentValue} min`;
  if (metric.format === 'hours') return `${metric.currentValue} hrs`;
  if (metric.format === 'number') return metric.currentValue.toLocaleString();
  return `${metric.currentValue}`;
}

function formatTarget(metric: KpiMetric): string {
  const lowerIsBetter = ['false-positive-rate', 'avg-handling-time', 'backlog-size', 'onboarding-time'].includes(metric.id);
  const prefix = lowerIsBetter ? '<' : '';
  if (metric.format === 'percent') return `Target: ${prefix}${metric.target}%`;
  if (metric.format === 'minutes') return `Target: ${prefix}${metric.target} min`;
  if (metric.format === 'hours') return `Target: ${prefix}${metric.target} hrs`;
  return `Target: ${prefix}${metric.target}`;
}

function KpiCard({ metric }: { metric: KpiMetric }) {
  const color = getStatusColor(metric);
  const arrow = getTrendArrow(metric);
  const delta = getDelta(metric);

  return (
    <div style={{ background: 'var(--bg-card)', borderRadius: '10px', padding: '16px', border: '1px solid var(--border)' }}>
      <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: '8px' }}>{metric.label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginBottom: '8px' }}>
        <span style={{ fontSize: '1.5rem', fontWeight: 800, color }}>{formatValue(metric)}</span>
        <span style={{ fontSize: '0.8rem', fontWeight: 600, color: metric.trendIsPositive ? '#10b981' : '#ef4444' }}>
          {arrow}
        </span>
      </div>
      <Sparkline data={metric.sparklineData} target={metric.target} color={color} />
      <div style={{ marginTop: '8px', fontSize: '0.6rem', color: 'var(--text-muted)' }}>
        {formatTarget(metric)}
      </div>
      <div style={{ fontSize: '0.6rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
        vs last period: <span style={{ fontWeight: 600, color: metric.trendIsPositive ? '#10b981' : '#ef4444' }}>{delta}</span>
      </div>

      {/* Special details for Backlog */}
      {metric.id === 'backlog-size' && (
        <div style={{ marginTop: '8px', borderTop: '1px solid var(--border)', paddingTop: '8px' }}>
          {backlogBreakdown.map(b => (
            <div key={b.bucket} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.6rem', color: b.severity === 'critical' ? '#ef4444' : b.severity === 'warning' ? '#f59e0b' : 'var(--text-muted)', marginBottom: '2px' }}>
              <span>{b.bucket}:</span>
              <span style={{ fontWeight: 600 }}>{b.count} {b.severity === 'critical' && '⚠️'}</span>
            </div>
          ))}
        </div>
      )}

      {/* Special details for Onboarding */}
      {metric.id === 'onboarding-time' && (
        <div style={{ marginTop: '8px', borderTop: '1px solid var(--border)', paddingTop: '8px', fontSize: '0.6rem', color: 'var(--text-muted)' }}>
          <div>P50: {onboardingPercentiles.p50}hr</div>
          <div>P75: {onboardingPercentiles.p75}hr</div>
          <div>P95: {onboardingPercentiles.p95}hr</div>
        </div>
      )}

      {/* Special details for Decisions Today */}
      {metric.id === 'decisions-today' && (
        <div style={{ marginTop: '8px', borderTop: '1px solid var(--border)', paddingTop: '8px' }}>
          <div style={{ display: 'flex', gap: '1px', alignItems: 'flex-end', height: '24px' }}>
            {hourlyDecisions.map(h => {
              const maxCount = Math.max(...hourlyDecisions.map(x => x.count));
              const pct = (h.count / maxCount) * 100;
              return (
                <div key={h.hour} style={{ flex: 1, background: 'var(--accent)', borderRadius: '1px', height: `${pct}%`, opacity: 0.7 }} title={`${h.hour}:00 — ${h.count}`} />
              );
            })}
          </div>
          <div style={{ fontSize: '0.55rem', color: 'var(--text-muted)', marginTop: '4px' }}>
            Avg: {Math.round(hourlyDecisions.reduce((s, h) => s + h.count, 0) / hourlyDecisions.length)}/hr • Peak: {Math.max(...hourlyDecisions.map(h => h.count))}/hr
          </div>
        </div>
      )}
    </div>
  );
}

export default function OperationalKPIs() {
  return (
    <div>
      <div style={{ marginBottom: '16px' }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
          Operational KPIs
        </h3>
        <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', margin: '4px 0 0' }}>
          Real-time performance metrics — 30-day trend with targets
        </p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
        {kpiMetrics.map(m => <KpiCard key={m.id} metric={m} />)}
      </div>
    </div>
  );
}
