import React, { useState } from 'react';
import { evaluators } from '../../data/evaluatorsData';

/**
 * Evaluation pipeline chips — shown in Simulation tab after decision completes.
 * Each chip is colour-coded: green=pass, amber=warning, red=fail.
 */
export default function PipelineGate() {
  const [expanded, setExpanded] = useState(false);
  const passing = evaluators.filter(e => e.status === 'passing').length;

  return (
    <div style={{ marginTop: '12px' }}>
      <button
        onClick={() => setExpanded(!expanded)}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-primary)', fontSize: '0.8rem', fontWeight: 600, padding: 0 }}
      >
        {expanded ? '\u25BE' : '\u25B8'} {'\uD83D\uDCCA'} Evaluation Pipeline ({passing}/{evaluators.length} passed)
      </button>
      {expanded && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
          {evaluators.map(ev => {
            const color = ev.status === 'passing' ? '#10b981' : ev.status === 'warning' ? '#f59e0b' : '#ef4444';
            return (
              <span key={ev.id} style={{
                display: 'inline-flex', alignItems: 'center', gap: '4px',
                padding: '3px 8px', borderRadius: '6px', fontSize: '0.65rem', fontWeight: 500,
                background: `${color}15`, color, border: `1px solid ${color}30`,
              }}>
                {ev.status === 'passing' ? '\u2705' : '\u26A0\uFE0F'} {ev.name} {Math.round(ev.currentScore * 100)}%
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
