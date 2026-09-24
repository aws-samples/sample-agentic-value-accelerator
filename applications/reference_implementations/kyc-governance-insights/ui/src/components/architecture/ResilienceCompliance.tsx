import React from 'react';
import { resilienceFrameworks } from '../../data/resilienceComplianceData';

const statusColors: Record<string, string> = { compliant: '#10b981', in_progress: '#f59e0b', gap: '#ef4444' };

export default function ResilienceCompliance() {
  return (
    <div style={{ background: 'var(--bg-card)', borderRadius: '12px', padding: '16px' }}>
      <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 12px' }}>Operational Resilience Compliance</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {resilienceFrameworks.map(fw => (
          <div key={fw.id} style={{ padding: '10px 12px', borderRadius: '8px', background: 'var(--bg-secondary)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <div>
                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)' }}>{fw.name}</span>
                <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginLeft: '8px' }}>({fw.jurisdiction})</span>
              </div>
              <span style={{ fontSize: '0.6rem', fontWeight: 700, color: statusColors[fw.status], padding: '2px 6px', borderRadius: '4px', background: `${statusColors[fw.status]}15` }}>
                {fw.status === 'compliant' ? '\u2713 Compliant' : fw.status === 'in_progress' ? 'In Progress' : 'Gap'}
              </span>
            </div>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
              Last assessed: {fw.lastAssessed} | Evidence: {fw.evidence}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '6px' }}>
              {fw.keyRequirements.map((r, i) => (
                <span key={i} style={{ fontSize: '0.55rem', padding: '2px 6px', borderRadius: '4px', background: 'var(--bg-card)', color: 'var(--text-secondary)' }}>{'\u2713'} {r}</span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
