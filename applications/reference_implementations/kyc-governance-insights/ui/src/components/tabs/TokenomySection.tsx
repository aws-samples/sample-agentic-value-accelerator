import React from 'react';
import type { LiveMetrics } from '../../types/metrics';

interface TokenomySectionProps {
  metrics?: LiveMetrics | null;
}

const cardStyle: React.CSSProperties = {
  background: 'var(--bg-card)',
  borderRadius: '12px',
  padding: '1.25rem',
};

/* Sparkline SVG for 7-day cost trend */
function CostSparkline() {
  const data = [0.38, 0.41, 0.45, 0.39, 0.44, 0.40, 0.42];
  const w = 80, h = 24;
  const max = Math.max(...data), min = Math.min(...data);
  const range = max - min || 0.1;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * (h - 4) - 2}`).join(' ');
  return (
    <svg width={w} height={h} style={{ display: 'inline-block', verticalAlign: 'middle', marginLeft: '8px' }}>
      <polyline points={pts} fill="none" stroke="#3b82f6" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

/* Donut chart for model routing */
function ModelDonut() {
  const segments = [
    { label: 'Claude Sonnet', pct: 55, color: '#3b82f6' },
    { label: 'Nova Pro', pct: 30, color: '#8b5cf6' },
    { label: 'GPT-4o', pct: 10, color: '#10b981' },
    { label: 'Llama 3.1', pct: 5, color: '#f59e0b' },
  ];
  const r = 40, cx = 50, cy = 50, circ = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
      <svg width="100" height="100">
        {segments.map((seg) => {
          const dash = (seg.pct / 100) * circ;
          const el = (
            <circle key={seg.label} cx={cx} cy={cy} r={r} fill="none" stroke={seg.color} strokeWidth="12"
              strokeDasharray={`${dash} ${circ - dash}`} strokeDashoffset={-offset}
              style={{ transform: 'rotate(-90deg)', transformOrigin: '50% 50%' }} />
          );
          offset += dash;
          return el;
        })}
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {segments.map(s => (
          <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.7rem' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: s.color, flexShrink: 0 }} />
            <span style={{ color: 'var(--text-secondary)' }}>{s.label} ({s.pct}%)</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function TokenomySection({ metrics }: TokenomySectionProps) {
  const used = metrics?.tokens_used_today ?? 847000;
  const budget = metrics?.tokens_budget_daily ?? 1200000;
  const pct = (used / budget) * 100;
  const barColor = pct > 95 ? '#ef4444' : pct > 80 ? '#f59e0b' : '#3b82f6';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <h2 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
        Tokenomy & Cost Governance
      </h2>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        {/* Token Budget */}
        <div style={cardStyle}>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '8px' }}>Daily Token Budget</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '6px' }}>
            <span style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-primary)' }}>847K / 1.2M</span>
            <span style={{ fontSize: '0.75rem', color: barColor, fontWeight: 600 }}>{pct.toFixed(1)}%</span>
          </div>
          <div style={{ height: '6px', borderRadius: '3px', background: 'var(--bg-secondary)', overflow: 'hidden' }}>
            <div style={{ width: `${pct}%`, height: '100%', borderRadius: '3px', background: barColor, transition: 'width 0.5s ease' }} />
          </div>
        </div>

        {/* Cost per Decision */}
        <div style={cardStyle}>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '8px' }}>Cost per Decision</div>
          <div style={{ display: 'flex', alignItems: 'baseline' }}>
            <span style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-primary)' }}>$0.42</span>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginLeft: '6px' }}>avg</span>
            <CostSparkline />
          </div>
          <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '6px' }}>7-day trend</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        {/* Model Routing */}
        <div style={cardStyle}>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '8px' }}>Model Routing Breakdown</div>
          <ModelDonut />
        </div>

        {/* Monthly Projection */}
        <div style={cardStyle}>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '8px' }}>Monthly Projection</div>
          <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-primary)' }}>$12,847</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>projected vs $15,000 budget (85.6% utilisation)</div>
          {pct > 80 && (
            <div style={{ marginTop: '8px', padding: '6px 10px', borderRadius: '6px', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', fontSize: '0.7rem', color: '#f59e0b' }}>
              ⚠️ Token usage above 80% — consider model routing optimisation
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
