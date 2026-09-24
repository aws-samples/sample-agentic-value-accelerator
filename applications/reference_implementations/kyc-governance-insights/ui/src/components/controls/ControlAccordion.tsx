import React, { useState } from 'react';
import type { Control, ControlStatus } from '../../data/controlMappingData';

const statusColors: Record<ControlStatus, string> = { pass: '#10b981', warning: '#f59e0b', fail: '#ef4444', not_assessed: '#64748b' };

interface ControlAccordionProps {
  controls: Control[];
}

export default function ControlAccordion({ controls }: ControlAccordionProps) {
  const categories = [...new Set(controls.map(c => c.category))];
  const [expanded, setExpanded] = useState<string | null>(categories[0] || null);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      {categories.map(cat => {
        const catControls = controls.filter(c => c.category === cat);
        const isOpen = expanded === cat;
        const passCount = catControls.filter(c => c.status === 'pass').length;
        const warnCount = catControls.filter(c => c.status === 'warning').length;
        const failCount = catControls.filter(c => c.status === 'fail').length;
        const total = catControls.length;

        return (
          <div key={cat} style={{ background: 'var(--bg-card)', borderRadius: '8px', overflow: 'hidden' }}>
            <button onClick={() => setExpanded(isOpen ? null : cat)} style={{ width: '100%', padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)' }}>
              <span style={{ fontSize: '0.7rem' }}>{isOpen ? '\u25BC' : '\u25B6'}</span>
              <span style={{ fontSize: '0.8rem', fontWeight: 600, flex: 1, textAlign: 'left' }}>{cat}</span>
              {/* Mini status bar */}
              <div style={{ width: '50px', height: '4px', borderRadius: '2px', background: 'var(--bg-secondary)', overflow: 'hidden', display: 'flex' }}>
                {passCount > 0 && <div style={{ width: `${(passCount / total) * 100}%`, background: '#10b981' }} />}
                {warnCount > 0 && <div style={{ width: `${(warnCount / total) * 100}%`, background: '#f59e0b' }} />}
                {failCount > 0 && <div style={{ width: `${(failCount / total) * 100}%`, background: '#ef4444' }} />}
              </div>
              <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>({total})</span>
            </button>
            {isOpen && (
              <div style={{ padding: '0 14px 10px' }}>
                {catControls.map(ctrl => (
                  <div key={ctrl.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: statusColors[ctrl.status], flexShrink: 0 }} />
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--accent)', minWidth: '70px' }}>{ctrl.id}</span>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-primary)', flex: 1 }}>{ctrl.name}</span>
                    <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>{Math.round(ctrl.score)}%</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
      {controls.length === 0 && (
        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>No controls match current filters</div>
      )}
    </div>
  );
}
