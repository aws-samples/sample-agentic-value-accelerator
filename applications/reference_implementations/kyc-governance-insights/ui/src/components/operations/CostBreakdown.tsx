import React from 'react';
import {
  costBreakdown,
  totalCostPerDecision,
  costChangePercent,
  costTrend,
  costComparison,
  fiveMonthReductionPercent,
} from '../../data/costPerDecisionData';

function DonutChart({ size = 120 }: { size?: number }) {
  const cx = size / 2;
  const cy = size / 2;
  const r = (size - 24) / 2;
  const circ = 2 * Math.PI * r;
  let cumulativeOffset = 0;

  return (
    <svg width={size} height={size} style={{ display: 'block' }}>
      {costBreakdown.map(cat => {
        const segmentLength = (cat.percentage / 100) * circ;
        const offset = circ - cumulativeOffset;
        cumulativeOffset += segmentLength;
        return (
          <circle
            key={cat.id}
            cx={cx} cy={cy} r={r}
            fill="none"
            stroke={cat.color}
            strokeWidth="14"
            strokeDasharray={`${segmentLength} ${circ - segmentLength}`}
            strokeDashoffset={offset}
            style={{ transform: 'rotate(-90deg)', transformOrigin: '50% 50%' }}
          />
        );
      })}
      <text x={cx} y={cy - 4} textAnchor="middle" fontSize="14" fontWeight="800" fill="var(--text-primary)">
        £{totalCostPerDecision.toFixed(2)}
      </text>
      <text x={cx} y={cy + 12} textAnchor="middle" fontSize="8" fill="var(--text-muted)">all-in</text>
    </svg>
  );
}

export default function CostBreakdown() {
  const changeColor = costChangePercent <= 0 ? '#10b981' : '#ef4444';

  return (
    <div style={{ background: 'var(--bg-secondary)', borderRadius: '12px', padding: '24px' }}>
      <div style={{ marginBottom: '16px' }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
          Cost Per Decision
        </h3>
        <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', margin: '4px 0 0' }}>
          All-in unit economics with cost comparison
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px', gap: '20px', alignItems: 'start' }}>
        {/* Left: Breakdown + Comparison */}
        <div>
          {/* Headline */}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '12px' }}>
            <span style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--text-primary)' }}>£{totalCostPerDecision.toFixed(2)}</span>
            <span style={{ fontSize: '0.72rem', fontWeight: 600, color: changeColor }}>
              ↓ {Math.abs(costChangePercent)}% from last month
            </span>
          </div>

          {/* Breakdown list */}
          <div style={{ marginBottom: '16px' }}>
            {costBreakdown.map(cat => (
              <div key={cat.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: cat.color }} />
                <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', flex: 1 }}>{cat.category}</span>
                <span style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-primary)' }}>£{cat.amount.toFixed(2)}</span>
                <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', minWidth: '32px' }}>({cat.percentage}%)</span>
              </div>
            ))}
          </div>

          {/* Comparison Bar */}
          <div style={{ background: 'var(--bg-card)', borderRadius: '8px', padding: '12px', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: '8px' }}>vs Manual Process: £{costComparison.manual.toFixed(2)}/decision</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ flex: 1, height: '8px', borderRadius: '4px', background: 'var(--border)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${100 - costComparison.reductionPercentage}%`, borderRadius: '4px', background: '#10b981' }} />
              </div>
              <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#10b981' }}>{costComparison.reductionPercentage}% reduction</span>
            </div>
          </div>

          {/* Monthly Trend */}
          <div style={{ marginTop: '16px' }}>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: '6px' }}>Monthly trend:</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              {costTrend.map((t, i) => (
                <React.Fragment key={t.month}>
                  <span style={{ fontSize: '0.6rem', color: 'var(--text-secondary)' }}>
                    {t.month}: <strong>£{t.costPerDecision.toFixed(2)}</strong>
                  </span>
                  {i < costTrend.length - 1 && <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>→</span>}
                </React.Fragment>
              ))}
            </div>
            <div style={{ fontSize: '0.58rem', color: '#10b981', marginTop: '4px' }}>
              ↓ {fiveMonthReductionPercent}% over 5 months
            </div>
          </div>
        </div>

        {/* Right: Donut Chart */}
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <DonutChart />
        </div>
      </div>
    </div>
  );
}
