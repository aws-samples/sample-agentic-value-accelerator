import React from 'react';
import { evaluators, categories, categoryLabels, categoryColors } from '../../data/evaluatorsData';
import { Sparkline } from '../shared/Sparkline';
import { StatusBadge } from '../shared/StatusBadge';
import { useBackendStatus } from '../../hooks/useBackendStatus';

export default function EvaluationsDashboard() {
  const backendStatus = useBackendStatus();
  const passing = evaluators.filter(e => e.status === 'passing').length;
  const hardGates = evaluators.filter(e => e.gateType === 'hard');
  const hardPassing = hardGates.filter(e => e.status === 'passing').length;
  const overall = Math.round(evaluators.reduce((s, e) => s + e.currentScore, 0) / evaluators.length * 1000) / 10;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>AgentCore Evaluations Pipeline</h3>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{passing}/{evaluators.length} passing | Hard gates: {hardPassing}/{hardGates.length} | Overall: {overall}%</span>
        </div>
        <StatusBadge variant={backendStatus === 'live' ? 'live' : backendStatus === 'stale' ? 'cached' : 'simulated'} />
      </div>

      {/* By category */}
      {categories.map(cat => {
        const catEvals = evaluators.filter(e => e.category === cat);
        return (
          <div key={cat} style={{ background: 'var(--bg-card)', borderRadius: '10px', padding: '12px 16px', borderLeft: `3px solid ${categoryColors[cat]}` }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: categoryColors[cat], marginBottom: '8px' }}>{categoryLabels[cat]}</div>
            {catEvals.map(ev => (
              <div key={ev.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                <span style={{ fontSize: '0.7rem', width: '14px' }}>{ev.status === 'passing' ? '\u2705' : '\u26A0\uFE0F'}</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-primary)', flex: 1, minWidth: '140px' }}>{ev.name}</span>
                {/* Score bar */}
                <div style={{ width: '80px', height: '6px', borderRadius: '3px', background: 'var(--bg-secondary)', position: 'relative' }}>
                  <div style={{ width: `${ev.currentScore * 100}%`, height: '100%', borderRadius: '3px', background: ev.status === 'passing' ? '#10b981' : '#f59e0b' }} />
                  {/* Threshold marker */}
                  <div style={{ position: 'absolute', left: `${ev.threshold * 100}%`, top: '-2px', width: '1px', height: '10px', background: 'var(--text-muted)' }} />
                </div>
                <span style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-primary)', minWidth: '30px' }}>{Math.round(ev.currentScore * 100)}%</span>
                <Sparkline values={ev.trend} color={ev.status === 'passing' ? '#10b981' : '#f59e0b'} width={40} height={14} showDot={false} />
                {ev.gateType === 'hard' && <span style={{ fontSize: '0.55rem', fontWeight: 600, color: '#ef4444', background: 'rgba(239,68,68,0.1)', padding: '1px 4px', borderRadius: '3px' }}>HARD</span>}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
