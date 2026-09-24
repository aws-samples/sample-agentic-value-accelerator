import React from 'react';
import type { LogEntry, LogSeverity } from '../../types/simulation';

interface LogPanelProps {
  entries: LogEntry[];
}

const SEVERITY_COLORS: Record<LogSeverity, string> = {
  '': '#e0e0e0',
  's-ok': '#81c784',
  's-warn': '#ffd54f',
  's-err': '#e57373',
};

const LogPanel: React.FC<LogPanelProps> = ({ entries }) => {
  return (
    <div
      style={{
        background: '#1a1a2e',
        borderRadius: '8px',
        padding: '14px',
        maxHeight: '180px',
        overflowY: 'auto',
        fontFamily: 'var(--font-mono)',
        fontSize: '10px',
      }}
    >
      {entries.map((entry, index) => (
        <div
          key={index}
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '6px',
            padding: '2px 0',
            lineHeight: '1.5',
          }}
        >
          <span
            style={{
              color: '#6c7a89',
              minWidth: '55px',
              flexShrink: 0,
            }}
          >
            {entry.t}
          </span>
          <span
            style={{
              color: '#64b5f6',
              minWidth: '110px',
              flexShrink: 0,
            }}
          >
            {entry.a}
          </span>
          <span
            style={{
              color: SEVERITY_COLORS[entry.c] || '#e0e0e0',
            }}
          >
            {entry.m}
          </span>
        </div>
      ))}
    </div>
  );
};

export default LogPanel;
