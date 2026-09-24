import React from 'react';
import type { ControlStatus, FrameworkId } from '../../data/controlMappingData';
import { frameworks } from '../../data/controlMappingData';

interface ControlFilterBarProps {
  search: string;
  onSearchChange: (s: string) => void;
  statusFilters: ControlStatus[];
  onToggleStatus: (s: ControlStatus) => void;
  activeFramework: FrameworkId | 'all';
  onFrameworkChange: (f: FrameworkId | 'all') => void;
  counts: Record<ControlStatus, number>;
  total: number;
  matchCount: number;
}

const statusConfig: Record<ControlStatus, { label: string; color: string }> = {
  pass: { label: 'Implemented', color: '#10b981' },
  warning: { label: 'Planned', color: '#f59e0b' },
  fail: { label: 'Gap', color: '#ef4444' },
  not_assessed: { label: 'Not Assessed', color: '#64748b' },
};

export default function ControlFilterBar({ search, onSearchChange, statusFilters, onToggleStatus, activeFramework, onFrameworkChange, counts, total, matchCount }: ControlFilterBarProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '12px' }}>
      {/* Framework Toggle */}
      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
        <button onClick={() => onFrameworkChange('all')} style={{ padding: '4px 10px', borderRadius: '6px', fontSize: '0.7rem', fontWeight: 600, border: 'none', cursor: 'pointer', background: activeFramework === 'all' ? 'rgba(59,130,246,0.2)' : 'var(--bg-secondary)', color: activeFramework === 'all' ? 'var(--accent)' : 'var(--text-muted)' }}>All</button>
        {frameworks.map(f => (
          <button key={f.id} onClick={() => onFrameworkChange(f.id)} style={{ padding: '4px 10px', borderRadius: '6px', fontSize: '0.7rem', fontWeight: 600, border: 'none', cursor: 'pointer', background: activeFramework === f.id ? 'rgba(59,130,246,0.2)' : 'var(--bg-secondary)', color: activeFramework === f.id ? 'var(--accent)' : 'var(--text-muted)' }}>{f.label}</button>
        ))}
      </div>

      {/* Search + Status filters */}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
        <input value={search} onChange={e => onSearchChange(e.target.value)} placeholder="\uD83D\uDD0D Search controls..." style={{ flex: 1, minWidth: '160px', padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '0.75rem' }} />
        {(['pass', 'warning', 'fail'] as ControlStatus[]).map(s => {
          const cfg = statusConfig[s];
          const active = statusFilters.includes(s);
          return (
            <button key={s} onClick={() => onToggleStatus(s)} style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 10px', borderRadius: '6px', fontSize: '0.65rem', fontWeight: 600, border: 'none', cursor: 'pointer', background: active ? `${cfg.color}20` : 'var(--bg-secondary)', color: active ? cfg.color : 'var(--text-muted)', opacity: active ? 1 : 0.5 }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: cfg.color }} />
              {cfg.label} ({counts[s] || 0})
            </button>
          );
        })}
        <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>{matchCount}/{total}</span>
      </div>
    </div>
  );
}
