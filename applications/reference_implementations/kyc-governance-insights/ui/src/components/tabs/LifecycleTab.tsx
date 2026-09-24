import React, { useState, useRef, useCallback } from 'react';
import { lifecycleData } from '../../data/lifecycleData';

const badgeStyles: Record<string, { bg: string; color: string }> = {
  'b-genai': { bg: '#f3e5f5', color: '#7b1fa2' },
  'b-det': { bg: '#e8f5e9', color: '#2e7d32' },
  'b-hitl': { bg: '#fff3e0', color: '#e65100' },
  'b-policy': { bg: '#e8eaf6', color: '#283593' },
  'b-audit': { bg: '#e0f2f1', color: '#00695c' },
};

/* Governance type badge for each step */
function getGovernanceType(step: typeof lifecycleData[number]): { label: string; color: string } {
  if (step.badge === 'HITL') return { label: 'HITL', color: '#2196f3' };
  const hasDeterministic = step.controls.some(c =>
    c.toLowerCase().includes('lambda') || c.toLowerCase().includes('iam') ||
    c.toLowerCase().includes('policy') || c.toLowerCase().includes('gateway') ||
    c.toLowerCase().includes('validator') || c.toLowerCase().includes('kms')
  );
  if (hasDeterministic) return { label: 'Deterministic', color: '#10b981' };
  return { label: 'Probabilistic', color: '#f59e0b' };
}

const metrics = [
  { value: '94.7%', label: 'Task Completion (test data)' },
  { value: '12', label: 'HITL Escalations' },
  { value: '2', label: 'Policy Blocks' },
  { value: '0', label: 'Safety Violations' },
];

export const LifecycleTab: React.FC = () => {
  const [selectedStep, setSelectedStep] = useState(0);
  const [detailVisible, setDetailVisible] = useState(true);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const step = lifecycleData[selectedStep];

  const handleStepHoverEnter = useCallback((idx: number) => {
    hoverTimerRef.current = setTimeout(() => {
      setDetailVisible(false);
      // Brief hide then reveal for slide animation
      setTimeout(() => {
        setSelectedStep(idx);
        setDetailVisible(true);
      }, 50);
    }, 1000);
  }, []);

  const handleStepHoverLeave = useCallback(() => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
  }, []);

  const handleStepClick = useCallback((idx: number) => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    setDetailVisible(false);
    setTimeout(() => {
      setSelectedStep(idx);
      setDetailVisible(true);
    }, 50);
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* Metrics Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
        {metrics.map((m) => (
          <div
            key={m.label}
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: '12px',
              padding: '1.5rem',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              {m.value}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
              {m.label}
            </div>
          </div>
        ))}
      </div>

      {/* Horizontal Pipeline */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.25rem',
          overflowX: 'auto',
          padding: '0.5rem 0',
        }}
      >
        {lifecycleData.map((s, idx) => {
          const isActive = idx === selectedStep;
          const badge = badgeStyles[s.badgeClass] || { bg: '#e0e0e0', color: '#333' };
          const govType = getGovernanceType(s);
          return (
            <React.Fragment key={idx}>
              {idx > 0 && (
                <span style={{ color: 'var(--text-muted)', fontSize: '1.2rem', flexShrink: 0 }}>→</span>
              )}
              <button
                onClick={() => handleStepClick(idx)}
                onMouseEnter={() => handleStepHoverEnter(idx)}
                onMouseLeave={handleStepHoverLeave}
                style={{
                  background: isActive ? 'var(--bg-card-hover)' : 'var(--bg-card)',
                  border: isActive ? '1px solid var(--accent)' : '1px solid var(--border)',
                  borderRadius: '12px',
                  padding: '1rem',
                  cursor: 'pointer',
                  minWidth: '120px',
                  textAlign: 'center',
                  boxShadow: isActive ? '0 0 12px var(--accent-glow)' : 'none',
                  transition: 'all 0.2s ease',
                  flexShrink: 0,
                  position: 'relative',
                }}
              >
                <div style={{ fontSize: '1.25rem' }}>{s.icon}</div>
                <div
                  style={{
                    fontSize: '0.6rem',
                    color: 'var(--text-muted)',
                    marginTop: '0.25rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                  }}
                >
                  Step {idx + 1}
                </div>
                <div
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                    marginTop: '0.25rem',
                  }}
                >
                  {s.title}
                </div>
                <span
                  style={{
                    display: 'inline-block',
                    marginTop: '0.4rem',
                    fontSize: '0.6rem',
                    fontWeight: 600,
                    padding: '2px 6px',
                    borderRadius: '4px',
                    background: badge.bg,
                    color: badge.color,
                  }}
                >
                  {s.badge}
                </span>
                {/* Governance type badge */}
                <div
                  style={{
                    marginTop: '4px',
                    fontSize: '0.55rem',
                    fontWeight: 600,
                    color: govType.color,
                    opacity: 0.8,
                  }}
                >
                  {govType.label}
                </div>
              </button>
            </React.Fragment>
          );
        })}
      </div>

      {/* Detail Panel — slides in on hover/click */}
      <div
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: '12px',
          padding: '1.5rem',
          opacity: detailVisible ? 1 : 0,
          transform: detailVisible ? 'translateY(0)' : 'translateY(8px)',
          transition: 'opacity 0.2s ease, transform 0.2s ease',
        }}
      >
        <h3
          style={{
            fontSize: '1rem',
            fontWeight: 600,
            color: 'var(--text-primary)',
            margin: '0 0 0.5rem 0',
          }}
        >
          {step.icon} {step.title}
        </h3>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '0 0 1.25rem 0', lineHeight: 1.5 }}>
          {step.description}
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.5rem' }}>
          {/* Risks */}
          <div>
            <h4
              style={{
                fontSize: '0.7rem',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                color: '#de350b',
                margin: '0 0 0.5rem 0',
              }}
            >
              ⚠️ Risks
            </h4>
            <ul style={{ margin: 0, padding: '0 0 0 1rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              {step.risks.map((r, i) => (
                <li key={i} style={{ marginBottom: '0.25rem' }}>{r}</li>
              ))}
            </ul>
          </div>

          {/* Controls */}
          <div>
            <h4
              style={{
                fontSize: '0.7rem',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                color: '#36b37e',
                margin: '0 0 0.5rem 0',
              }}
            >
              ✓ Controls
            </h4>
            <ul style={{ margin: 0, padding: '0 0 0 1rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              {step.controls.map((c, i) => (
                <li key={i} style={{ marginBottom: '0.25rem' }}>{c}</li>
              ))}
            </ul>
          </div>

          {/* HITL */}
          <div>
            <h4
              style={{
                fontSize: '0.7rem',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                color: '#ff991f',
                margin: '0 0 0.5rem 0',
              }}
            >
              👤 Human-in-the-Loop
            </h4>
            <ul style={{ margin: 0, padding: '0 0 0 1rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              {step.hitl.map((h, i) => (
                <li key={i} style={{ marginBottom: '0.25rem' }}>{h}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LifecycleTab;
