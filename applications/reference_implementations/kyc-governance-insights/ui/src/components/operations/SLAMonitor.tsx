import React from 'react';
import {
  slaTiers,
  breachHistory,
  getSlaSummary,
} from '../../data/slaMonitoringData';
import { backlogBreakdown as kpiBacklog } from '../../data/operationalKpiData';

function getTierStatusIcon(compliance: number): string {
  if (compliance >= 95) return '✓';
  if (compliance >= 90) return '⚠️';
  return '🔴';
}

function getTierStatusColor(compliance: number): string {
  if (compliance >= 95) return '#10b981';
  if (compliance >= 90) return '#f59e0b';
  return '#ef4444';
}

export default function SLAMonitor() {
  const summary = getSlaSummary();

  return (
    <div style={{ background: 'var(--bg-secondary)', borderRadius: '12px', padding: '24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
            SLA Monitoring
          </h3>
          <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', margin: '4px 0 0' }}>
            Real-time compliance tracking with breach prediction
          </p>
        </div>
      </div>

      {/* Overall SLA Bar */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '8px' }}>
          <span style={{ fontSize: '1.8rem', fontWeight: 800, color: summary.overallCompliance >= 95 ? '#10b981' : summary.overallCompliance >= 90 ? '#f59e0b' : '#ef4444' }}>
            {summary.overallCompliance}%
          </span>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>SLA Compliance</span>
        </div>
        <div style={{ height: '8px', borderRadius: '4px', background: 'var(--border)', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${summary.overallCompliance}%`, borderRadius: '4px', background: summary.overallCompliance >= 95 ? '#10b981' : summary.overallCompliance >= 90 ? '#f59e0b' : '#ef4444', transition: 'width 0.5s ease' }} />
        </div>
        <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginTop: '4px' }}>
          {summary.overallCompliance}% within SLA
        </div>
      </div>

      {/* Tier Table */}
      <div style={{ background: 'var(--bg-card)', borderRadius: '8px', overflow: 'hidden', marginBottom: '16px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '100px 80px 100px 1fr', padding: '8px 12px', borderBottom: '2px solid var(--border)' }}>
          {['Tier', 'Target', 'Compliance', 'At Risk'].map(h => (
            <span key={h} style={{ fontSize: '0.6rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{h}</span>
          ))}
        </div>
        {slaTiers.map(tier => (
          <div key={tier.id} style={{ display: 'grid', gridTemplateColumns: '100px 80px 100px 1fr', padding: '10px 12px', borderBottom: '1px solid var(--border)', alignItems: 'center' }}>
            <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-primary)' }}>{tier.name}</span>
            <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>{tier.targetHours} hour{tier.targetHours > 1 ? 's' : ''}</span>
            <span style={{ fontSize: '0.72rem', fontWeight: 600, color: getTierStatusColor(tier.compliance) }}>
              {tier.compliance}% {getTierStatusIcon(tier.compliance)}
            </span>
            <span style={{ fontSize: '0.65rem', color: tier.atRiskCount > 0 ? '#ef4444' : 'var(--text-muted)' }}>
              {tier.atRiskCount > 0
                ? `${tier.atRiskCount} case${tier.atRiskCount > 1 ? 's' : ''} breach in ${tier.atRiskBreachMinutes}min`
                : '0 at risk'}
            </span>
          </div>
        ))}
      </div>

      {/* Breach Prediction Alert */}
      {summary.atRiskCount > 0 && (
        <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '8px', padding: '10px 14px', marginBottom: '16px' }}>
          <div style={{ fontSize: '0.72rem', color: '#ef4444', fontWeight: 600 }}>
            ⚠️ BREACH PREDICTION: {summary.atRiskCount} case{summary.atRiskCount > 1 ? 's' : ''} will breach SLA in next 30 minutes
          </div>
        </div>
      )}

      {/* Bottom row: Aging + Breach History */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        {/* Aging Distribution */}
        <div>
          <div style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>Aging Distribution</div>
          {kpiBacklog.map(b => (
            <div key={b.bucket} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', minWidth: '35px' }}>{b.bucket}:</span>
              <div style={{ flex: 1, height: '6px', borderRadius: '3px', background: 'var(--border)' }}>
                <div style={{ height: '100%', width: `${(b.count / 47) * 100}%`, borderRadius: '3px', background: b.severity === 'critical' ? '#ef4444' : b.severity === 'warning' ? '#f59e0b' : 'var(--accent)' }} />
              </div>
              <span style={{ fontSize: '0.6rem', fontWeight: 600, color: b.severity === 'critical' ? '#ef4444' : b.severity === 'warning' ? '#f59e0b' : 'var(--text-secondary)', minWidth: '20px' }}>
                {b.count} {b.severity === 'critical' && '🔴'}
              </span>
            </div>
          ))}
        </div>

        {/* Breach History */}
        <div>
          <div style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>Breach History (7d)</div>
          <div style={{ display: 'flex', gap: '4px', alignItems: 'flex-end', marginBottom: '8px' }}>
            {breachHistory.map(d => (
              <div key={d.day} style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 600, color: d.breachCount > 0 ? '#ef4444' : 'var(--text-muted)' }}>
                  {d.breachCount}
                </div>
                <div style={{ fontSize: '0.5rem', color: 'var(--text-muted)' }}>{d.day}</div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: '0.58rem', color: 'var(--text-muted)' }}>
            Avg: {summary.avgBreachesPerDay}/day (target: &lt;{summary.breachTarget}/day)
          </div>
        </div>
      </div>
    </div>
  );
}
