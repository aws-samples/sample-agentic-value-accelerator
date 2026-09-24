import { useRef, useEffect } from 'react';
import {
  riskControlMapping,
  controls,
  services,
  serviceDetails,
  controlDetails,
  riskDetails,
} from '../../data/riskControlMapping';
import { governanceMetricsSummary } from '../../data/governanceMetricsData';
import type { MetricSummary } from '../../data/governanceMetricsData';

export type PanelItem = { id: string; type: 'risk' | 'control' | 'service' };

interface DetailPanelProps {
  selectedItem: PanelItem | null;
  onClose: () => void;
  excludeRef?: React.RefObject<HTMLElement | null>;
}

function PanelSparkline({ data, color }: { data: number[]; color: string }) {
  const width = 120;
  const height = 28;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const points = data
    .map((v, i) => `${(i / (data.length - 1)) * width},${height - ((v - min) / range) * height}`)
    .join(' ');
  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ragColor(status: string): string {
  if (status === 'green') return '#10b981';
  if (status === 'amber') return '#f59e0b';
  return '#ef4444';
}

function getMetricForKey(key: string): MetricSummary | null {
  const map: Record<string, MetricSummary> = {
    falsePositiveRate: governanceMetricsSummary.falsePositiveRate,
    falseNegativeRate: governanceMetricsSummary.falseNegativeRate,
    escalationRate: governanceMetricsSummary.escalationRate,
    timeToDecision: governanceMetricsSummary.timeToDecision,
    sarConversionRate: governanceMetricsSummary.sarConversionRate,
    overrideRate: governanceMetricsSummary.overrideRate,
    stpRate: governanceMetricsSummary.stpRate,
    agentAgreementRate: governanceMetricsSummary.agentAgreementRate,
    policyTriggerRate: governanceMetricsSummary.policyTriggerRate,
    evalScoreTrend: governanceMetricsSummary.evalScoreTrend,
    breachCount: governanceMetricsSummary.breachCount,
    meanTimeToEscalation: governanceMetricsSummary.meanTimeToEscalation,
  };
  return map[key] || null;
}

function formatMetricValue(key: string, value: number): string {
  if (key === 'timeToDecision') return `${value.toFixed(0)}s`;
  if (key === 'meanTimeToEscalation') return `${value.toFixed(1)}s`;
  if (key === 'breachCount') return `${value} near-misses`;
  if (value < 0.01) return `${(value * 100).toFixed(4)}%`;
  return `${(value * 100).toFixed(1)}%`;
}

function metricLabel(key: string): string {
  const labels: Record<string, string> = {
    falsePositiveRate: 'False Positive Rate',
    falseNegativeRate: 'False Negative Rate',
    escalationRate: 'Escalation Rate',
    timeToDecision: 'Time to Decision',
    sarConversionRate: 'SAR Conversion Rate',
    overrideRate: 'Override Rate',
    stpRate: 'STP Rate',
    agentAgreementRate: 'Agent Agreement',
    policyTriggerRate: 'Policy Trigger Rate',
    evalScoreTrend: 'Eval Accuracy',
    breachCount: 'Breach Count',
    meanTimeToEscalation: 'Mean Time to Escalation',
  };
  return labels[key] || key;
}

function ExpLabel({ text }: { text: string }) {
  if (!text.includes('Automated Reasoning')) return <>{text}</>;
  const idx = text.indexOf('Automated Reasoning');
  const before = text.slice(0, idx);
  const after = text.slice(idx + 'Automated Reasoning'.length);
  return (
    <>
      {before}Automated Reasoning<span style={{ fontSize: '8px', color: '#ff9800', fontWeight: 700, verticalAlign: 'super', marginLeft: '2px' }}>EXP</span>{after}
    </>
  );
}

export default function DetailPanel({ selectedItem, onClose, excludeRef }: DetailPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!selectedItem) return;
    function handleClickOutside(e: MouseEvent) {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        (!excludeRef?.current || !excludeRef.current.contains(e.target as Node))
      ) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [selectedItem, onClose, excludeRef]);

  if (!selectedItem) return null;

  const panelStyle: React.CSSProperties = {
    position: 'fixed',
    bottom: 0,
    right: 0,
    width: '400px',
    maxHeight: '50vh',
    overflowY: 'auto',
    background: 'var(--bg-secondary)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '8px 0 0 0',
    padding: '16px',
    zIndex: 9998,
    fontSize: '12px',
    color: 'var(--text-primary)',
    animation: 'slideInFromRight 200ms ease-out',
  };

  const titleStyle: React.CSSProperties = { fontSize: '14px', fontWeight: 600, marginBottom: '4px' };
  const sectionTitle: React.CSSProperties = { fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginTop: '12px', marginBottom: '4px' };
  const bodyStyle: React.CSSProperties = { fontSize: '12px', lineHeight: '1.5', color: 'var(--text-secondary)' };
  const closeBtn: React.CSSProperties = { position: 'absolute', top: '8px', right: '8px', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '16px', lineHeight: 1 };

  if (selectedItem.type === 'service') {
    const svc = services.find(s => s.id === selectedItem.id);
    const detail = serviceDetails[selectedItem.id];
    if (!svc || !detail) return null;
    return (
      <div ref={panelRef} style={panelStyle}>
        <button onClick={onClose} style={closeBtn}>&times;</button>
        <div style={titleStyle}>{svc.icon} <ExpLabel text={svc.label} /></div>
        <div style={bodyStyle}>{detail.description}</div>
        <div style={sectionTitle}>What it does</div>
        <div style={bodyStyle}>{detail.whatItDoes}</div>
        <div style={sectionTitle}>Thresholds</div>
        <div style={bodyStyle}>{detail.thresholds}</div>
        <div style={sectionTitle}>Status</div>
        <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: 700, background: detail.status === 'LIVE' ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.15)', color: detail.status === 'LIVE' ? '#10b981' : '#f59e0b' }}>{detail.status}</span>
        <div style={sectionTitle}>Configuration</div>
        <div style={bodyStyle}>{detail.configuration}</div>
      </div>
    );
  }

  if (selectedItem.type === 'control') {
    const ctrl = controls.find(c => c.id === selectedItem.id);
    const detail = controlDetails[selectedItem.id];
    if (!ctrl || !detail) return null;
    const metric = getMetricForKey(detail.kpiMetric);
    return (
      <div ref={panelRef} style={panelStyle}>
        <button onClick={onClose} style={closeBtn}>&times;</button>
        <div style={titleStyle}>{ctrl.nature === 'deterministic' ? '✓' : ctrl.nature === 'probabilistic' ? '⚠' : '📊'} <ExpLabel text={ctrl.label} /></div>
        <div style={bodyStyle}>
          <span style={{ display: 'inline-block', padding: '1px 6px', borderRadius: '3px', fontSize: '9px', fontWeight: 600, background: 'rgba(59,130,246,0.12)', color: '#60a5fa' }}>{ctrl.nature}</span>
        </div>
        <div style={sectionTitle}>What it catches</div>
        <div style={bodyStyle}>{detail.whatItCatches}</div>
        {metric && (
          <>
            <div style={sectionTitle}>KPI — {metricLabel(detail.kpiMetric)}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '14px', fontWeight: 700, color: ragColor(metric.status) }}>{formatMetricValue(detail.kpiMetric, metric.current)}</span>
              <span style={{ fontSize: '10px', color: ragColor(metric.status), fontWeight: 600 }}>({metric.status.toUpperCase()})</span>
              <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>target: {metric.target}</span>
            </div>
            <div style={sectionTitle}>30-day trend</div>
            <PanelSparkline data={metric.sparkline} color={ragColor(metric.status)} />
          </>
        )}
        <div style={sectionTitle}>Last triggered</div>
        <div style={bodyStyle}>{detail.lastTriggered}</div>
      </div>
    );
  }

  if (selectedItem.type === 'risk') {
    const link = riskControlMapping.find(l => l.risk.id === selectedItem.id);
    const detail = riskDetails[selectedItem.id];
    if (!link || !detail) return null;
    const metric = getMetricForKey(detail.kpiMetric);
    const mitigatingControls = link.controls.map(cid => controls.find(c => c.id === cid)).filter(Boolean);
    return (
      <div ref={panelRef} style={panelStyle}>
        <button onClick={onClose} style={closeBtn}>&times;</button>
        <div style={titleStyle}>{link.risk.icon} {link.risk.label}</div>
        <span style={{ display: 'inline-block', padding: '1px 6px', borderRadius: '3px', fontSize: '9px', fontWeight: 600, background: link.risk.severity === 'critical' ? 'rgba(239,68,68,0.15)' : link.risk.severity === 'high' ? 'rgba(245,158,11,0.15)' : 'rgba(59,130,246,0.12)', color: link.risk.severity === 'critical' ? '#ef4444' : link.risk.severity === 'high' ? '#f59e0b' : '#60a5fa' }}>{link.risk.severity}</span>
        <div style={sectionTitle}>Description</div>
        <div style={bodyStyle}>{detail.businessDescription}</div>
        <div style={sectionTitle}>Mitigating controls</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
          {mitigatingControls.map(c => c && (
            <span key={c.id} style={{ padding: '2px 6px', borderRadius: '4px', fontSize: '10px', background: 'rgba(59,130,246,0.1)', color: '#93c5fd' }}><ExpLabel text={c.label} /></span>
          ))}
        </div>
        {metric && (
          <>
            <div style={sectionTitle}>KPI — {metricLabel(detail.kpiMetric)}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '14px', fontWeight: 700, color: ragColor(metric.status) }}>{formatMetricValue(detail.kpiMetric, metric.current)}</span>
              <span style={{ fontSize: '10px', color: ragColor(metric.status), fontWeight: 600 }}>({metric.status.toUpperCase()})</span>
              <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>target: {metric.target}</span>
            </div>
            <div style={sectionTitle}>30-day trend</div>
            <PanelSparkline data={metric.sparkline} color={ragColor(metric.status)} />
          </>
        )}
        <div style={sectionTitle}>Regulatory reference</div>
        <div style={bodyStyle}>{detail.regulatoryRef}</div>
      </div>
    );
  }

  return null;
}
