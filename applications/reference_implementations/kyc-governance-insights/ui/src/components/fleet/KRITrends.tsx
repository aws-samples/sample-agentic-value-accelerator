import React, { useState } from 'react';
import {
  fleetKriTrends,
  getDataForWindow,
  type TimeWindow,
  type TrendDirection,
} from '../../data/kriTrendData';

const directionConfig: Record<TrendDirection, { arrow: string; color: string }> = {
  improving: { arrow: '↑', color: '#10b981' },
  degrading: { arrow: '↓', color: '#ef4444' },
  stable: { arrow: '→', color: '#64748b' },
};

function Sparkline({ data, color, height = 24, width = 100 }: {
  data: number[];
  color: string;
  height?: number;
  width?: number;
}) {
  if (data.length < 2) return null;
  const min = Math.min(...data) * 0.95;
  const max = Math.max(...data) * 1.05;
  const range = max - min || 1;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * height;
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function KRITrends() {
  const [window, setWindow] = useState<TimeWindow>(30);

  return (
    <div data-testid="fleet.trend-chart" style={{ background: 'var(--bg-card)', borderRadius: '12px', padding: '20px', border: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
          KRI Trends (Fleet-Level)
        </h3>
        <div style={{ display: 'flex', gap: '4px' }}>
          {([30, 60, 90] as TimeWindow[]).map(w => (
            <button
              key={w}
              onClick={() => setWindow(w)}
              style={{
                fontSize: '0.6rem', padding: '3px 8px', borderRadius: '4px', border: '1px solid var(--border)',
                background: window === w ? 'var(--accent)' : 'transparent',
                color: window === w ? '#fff' : 'var(--text-muted)',
                cursor: 'pointer', fontWeight: 600,
              }}
            >
              {w}d
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {fleetKriTrends.map(kri => {
          const dir = directionConfig[kri.direction];
          const data = getDataForWindow(kri, window);
          // For lowerIsBetter metrics, improving means the arrow should show as green even with ↓
          const displayArrow = kri.lowerIsBetter && kri.direction === 'improving' ? '↑' : dir.arrow;

          return (
            <div key={kri.label} style={{ display: 'grid', gridTemplateColumns: '130px 110px 80px 1fr', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{kri.label}</span>
              <Sparkline data={data} color={dir.color} />
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                {kri.currentValue}{kri.unit}
              </span>
              <span style={{ fontSize: '0.65rem', fontWeight: 600, color: dir.color }}>
                {displayArrow} {kri.direction.charAt(0).toUpperCase() + kri.direction.slice(1)} ({kri.changeDescription})
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
