import React from 'react';
import {
  riskAppetiteConfig,
  computeRag,
  computeGap,
  getAppetiteSummary,
  type RagStatus,
} from '../../data/riskAppetiteData';

const ragConfig: Record<RagStatus, { icon: string; color: string; bg: string; label: string }> = {
  green: { icon: '🟢', color: '#10b981', bg: 'rgba(16,185,129,0.1)', label: 'GREEN' },
  amber: { icon: '🟡', color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', label: 'AMBER' },
  red: { icon: '🔴', color: '#ef4444', bg: 'rgba(239,68,68,0.1)', label: 'RED' },
};

export default function RiskAppetiteGauge() {
  const summary = getAppetiteSummary();

  return (
    <div data-testid="fleet.risk-appetite" style={{ background: 'var(--bg-card)', borderRadius: '12px', padding: '20px', border: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div>
          <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Risk Appetite Alignment</h3>
          <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>Board-approved: {riskAppetiteConfig.lastReviewed}</span>
        </div>
      </div>

      {/* Gauges */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '12px' }}>
        {riskAppetiteConfig.thresholds.map(t => {
          const rag = computeRag(t);
          const gap = computeGap(t);
          const cfg = ragConfig[rag];
          const fillPct = Math.min(100, (t.actual / 100) * 100);

          return (
            <div key={t.useCaseId} style={{ display: 'grid', gridTemplateColumns: '130px 1fr 60px 50px 90px', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-primary)' }}>{t.label}</span>
              <div style={{ height: '8px', borderRadius: '4px', background: 'var(--border)', position: 'relative', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${fillPct}%`, borderRadius: '4px', background: cfg.color, transition: 'width 0.5s ease' }} />
                {/* Floor marker */}
                <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${t.floor}%`, width: '2px', background: 'var(--text-muted)', opacity: 0.6 }} />
              </div>
              <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-primary)' }}>{t.actual}/100</span>
              <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>Floor: {t.floor}</span>
              <span style={{ fontSize: '0.63rem', fontWeight: 600, padding: '2px 8px', borderRadius: '4px', background: cfg.bg, color: cfg.color, textAlign: 'center' }}>
                {cfg.icon} {cfg.label} ({gap >= 0 ? '+' : ''}{gap})
              </span>
            </div>
          );
        })}
      </div>

      {/* Alert if any breaching */}
      {summary.red > 0 && (
        <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '6px', padding: '8px 12px', fontSize: '0.68rem', color: '#ef4444', fontWeight: 600 }}>
          ⚠ {summary.red} use case{summary.red > 1 ? 's' : ''} breaching appetite — escalation triggered
        </div>
      )}
    </div>
  );
}
