import React from 'react';
import { interventionLevels, currentInterventionLevel, interventionHistory } from '../../data/interventionLadderData';

export default function InterventionStatus() {
  return (
    <div style={{ background: 'var(--bg-card)', borderRadius: '12px', padding: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Graduated Intervention Ladder</h3>
        <button style={{ fontSize: '0.6rem', fontWeight: 700, padding: '4px 10px', borderRadius: '4px', border: 'none', background: 'rgba(220,38,38,0.15)', color: '#dc2626', cursor: 'pointer' }}>
          {'\u26A0\uFE0F'} Emergency Stop
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '12px' }}>
        {interventionLevels.map(l => {
          const isCurrent = l.level === currentInterventionLevel;
          return (
            <div key={l.level} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px', borderRadius: '6px', background: isCurrent ? `${l.color}15` : 'transparent', border: isCurrent ? `1px solid ${l.color}40` : '1px solid transparent' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: l.color, animation: isCurrent ? 'pulse-live 1.5s ease-in-out infinite' : 'none' }} />
              <span style={{ fontSize: '0.7rem', fontWeight: 600, color: l.color, minWidth: '80px' }}>L{l.level}: {l.name}</span>
              <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', flex: 1 }}>{l.description}</span>
              {isCurrent && <span style={{ fontSize: '0.55rem', fontWeight: 700, color: l.color }}>ACTIVE</span>}
            </div>
          );
        })}
      </div>

      {/* History */}
      <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
        <div style={{ fontWeight: 600, marginBottom: '4px' }}>Recent Interventions:</div>
        {interventionHistory.slice(0, 2).map((h, i) => (
          <div key={i} style={{ padding: '3px 0' }}>
            L{h.level} triggered {new Date(h.timestamp).toLocaleDateString()} — {h.trigger} ({h.duration})
          </div>
        ))}
      </div>
      <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginTop: '8px', fontStyle: 'italic' }}>
        72% of banks cannot shut down a malfunctioning AI. This system has 5 graduated levels.
      </div>
    </div>
  );
}
