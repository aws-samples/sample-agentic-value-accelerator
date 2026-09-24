import React, { useState } from 'react';
import { attackSurfaces, type AttackSurface } from '../../data/attackSurfaceData';

const severityColors: Record<string, string> = { critical: '#dc2626', high: '#ea580c', medium: '#f59e0b', low: '#10b981' };

export default function AttackSurfacePanel() {
  const [expanded, setExpanded] = useState<string | null>(null);
  const active = attackSurfaces.filter(s => s.status === 'active').length;

  return (
    <div style={{ background: 'var(--bg-card)', borderRadius: '12px', padding: '16px' }}>
      <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px' }}>Attack Surface ({active}/{attackSurfaces.length} mitigated)</h3>
      <p style={{ fontSize: '0.65rem', color: 'var(--text-muted)', margin: '0 0 12px' }}>10 agentic AI attack vectors mapped to specific controls</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {attackSurfaces.map(s => (
          <div key={s.id}>
            <button onClick={() => setExpanded(expanded === s.id ? null : s.id)}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px', borderRadius: '6px', border: 'none', background: expanded === s.id ? 'var(--bg-secondary)' : 'transparent', cursor: 'pointer', textAlign: 'left' }}>
              <span style={{ fontSize: '0.55rem', fontWeight: 700, padding: '2px 5px', borderRadius: '3px', background: `${severityColors[s.severity]}15`, color: severityColors[s.severity], minWidth: '50px', textAlign: 'center' }}>{s.severity.toUpperCase()}</span>
              <span style={{ fontSize: '0.7rem', fontWeight: 500, color: 'var(--text-primary)', flex: 1 }}>{s.name}</span>
              <span style={{ fontSize: '0.55rem', color: s.status === 'active' ? '#10b981' : '#f59e0b' }}>{s.status === 'active' ? '\u2713 Active' : '\u26A0 Partial'}</span>
            </button>
            {expanded === s.id && (
              <div style={{ padding: '6px 8px 6px 62px', fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                <div>Mitigated by: {s.mitigatedBy}</div>
                <div>MITRE: {s.mitreRef} | Cedar: {s.cedarPolicy}</div>
                <div>Last tested: {s.lastTested}</div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
