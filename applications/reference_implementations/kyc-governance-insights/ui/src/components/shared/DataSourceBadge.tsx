import React from 'react';

interface DataSourceBadgeProps {
  isLive: boolean;
}

export default function DataSourceBadge({ isLive }: DataSourceBadgeProps) {
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '4px',
      fontSize: '0.6rem',
      fontWeight: 600,
      padding: '2px 8px',
      borderRadius: '10px',
      background: isLive ? 'rgba(16,185,129,0.12)' : 'rgba(245,158,11,0.12)',
      color: isLive ? '#10b981' : '#f59e0b',
    }}>
      <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: isLive ? '#10b981' : '#f59e0b' }} />
      {isLive ? 'Live' : 'Offline'}
    </span>
  );
}
