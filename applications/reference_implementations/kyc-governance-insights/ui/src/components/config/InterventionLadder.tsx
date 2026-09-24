import React from 'react';
import { earnedAutonomyState } from '../../data/earnedAutonomyData';
import { usePolicyConfig } from '../../contexts/PolicyConfigContext';
import InfoTooltip from '../shared/InfoTooltip';

const levels = [
  { level: 0, label: 'KILL SWITCH', desc: 'Emergency Stop — all processing halted', color: '#ef4444' },
  { level: 1, label: 'Restricted', desc: 'Human Decides — agent recommends only', color: '#f59e0b' },
  { level: 2, label: 'Supervised', desc: 'Balanced — auto low-risk, escalate high-risk', color: '#10b981' },
  { level: 3, label: 'Autonomous', desc: 'Human Monitors — post-hoc review', color: '#3b82f6' },
  { level: 4, label: 'Full Agency', desc: 'Self-initiating — minimal oversight', color: '#8b5cf6' },
];

export default function InterventionLadder() {
  const { params, triggerKillSwitch } = usePolicyConfig();
  const currentLevel = params.maxAutonomyScope;
  const progress = earnedAutonomyState.decisionsAtCurrentLevel / earnedAutonomyState.decisionsRequiredForNext;

  return (
    <div style={{ background: 'var(--bg-card)', borderRadius: '10px', padding: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '12px' }}>
        Intervention Ladder
        <InfoTooltip text="The five autonomy levels an agent can operate at, from L0 (kill switch — all processing halted) up to L4 (full agency, minimal oversight). The highlighted row is the agent's current level. The bar below tracks clean decisions accumulated toward the next level; a threshold breach in evaluations moves the agent back down a level automatically." />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {levels.map(l => {
          const isCurrent = l.level === currentLevel;
          const isAbove = l.level > currentLevel;
          return (
            <div key={l.level} style={{
              display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px', borderRadius: '6px',
              background: isCurrent ? `${l.color}15` : 'transparent',
              border: isCurrent ? `1px solid ${l.color}40` : '1px solid transparent',
              opacity: isAbove ? 0.4 : 1,
            }}>
              {/* Level bar */}
              <div style={{ width: '40px', height: '6px', borderRadius: '3px', background: 'var(--bg-secondary)', overflow: 'hidden' }}>
                <div style={{ width: `${((5 - l.level) / 5) * 100}%`, height: '100%', background: l.color, borderRadius: '3px' }} />
              </div>
              <span style={{ fontSize: '0.7rem', fontWeight: 600, color: l.color, minWidth: '24px' }}>L{l.level}</span>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', flex: 1 }}>{l.label}</span>
              {isCurrent && <span style={{ fontSize: '0.6rem', fontWeight: 600, color: l.color }}>\u25C4 Current</span>}
              {l.level === 0 && (
                <button onClick={triggerKillSwitch} style={{ fontSize: '0.6rem', fontWeight: 600, padding: '3px 8px', borderRadius: '4px', border: 'none', background: 'rgba(239,68,68,0.2)', color: '#ef4444', cursor: 'pointer' }}>
                  STOP
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Progress */}
      <div style={{ marginTop: '12px', padding: '8px 12px', borderRadius: '6px', background: 'var(--bg-secondary)', fontSize: '0.65rem', color: 'var(--text-muted)' }}>
        Earned Autonomy: {earnedAutonomyState.decisionsAtCurrentLevel}/{earnedAutonomyState.decisionsRequiredForNext} clean decisions
        <div style={{ height: '4px', borderRadius: '2px', background: 'var(--border)', marginTop: '4px', overflow: 'hidden' }}>
          <div style={{ width: `${progress * 100}%`, height: '100%', background: '#10b981', borderRadius: '2px' }} />
        </div>
        <div style={{ marginTop: '4px' }}>{earnedAutonomyState.decisionsRequiredForNext - earnedAutonomyState.decisionsAtCurrentLevel} more for L{currentLevel + 1}</div>
      </div>
    </div>
  );
}
