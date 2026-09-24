import type { SimStep } from '../../types/simulation';
import { controls as controlsData } from '../../data/riskControlMapping';

interface HorizontalStepTimelineProps {
  steps: SimStep[];
  currentStep: number;
  maxStep: number;
  onStepClick: (index: number) => void;
}

/** Determine confidence tint based on control types at this step */
function getConfidenceTint(step: SimStep): string {
  const stepCtrlNames = step.ctrls.map(c => c.toLowerCase());
  let hasDeterministic = false;
  let hasProbabilistic = false;

  for (const ctrl of controlsData) {
    const match = stepCtrlNames.some(name =>
      ctrl.label.toLowerCase().includes(name.toLowerCase()) ||
      name.includes(ctrl.label.toLowerCase())
    );
    if (match) {
      if (ctrl.nature === 'deterministic') hasDeterministic = true;
      if (ctrl.nature === 'probabilistic') hasProbabilistic = true;
    }
  }

  // Check by common keywords
  for (const name of stepCtrlNames) {
    if (name.includes('lambda') || name.includes('iam') || name.includes('policy') || name.includes('gateway') || name.includes('validator') || name.includes('kms')) {
      hasDeterministic = true;
    }
    if (name.includes('llm') || name.includes('judge') || name.includes('guardrail') || name.includes('grounding')) {
      hasProbabilistic = true;
    }
  }

  if (hasDeterministic) return 'rgba(16, 185, 129, 0.1)'; // green tint
  if (hasProbabilistic) return 'rgba(245, 158, 11, 0.1)'; // amber tint
  return 'transparent';
}

export default function HorizontalStepTimeline({
  steps,
  currentStep,
  maxStep,
  onStepClick,
}: HorizontalStepTimelineProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '2px',
        padding: '10px 12px',
        background: 'var(--bg-card)',
        borderRadius: '12px',
        overflowX: 'auto',
      }}
    >
      {steps.map((step, i) => {
        const isActive = i === currentStep;
        const isDone = i < currentStep;
        const isLocked = i > maxStep;
        const confidenceTint = getConfidenceTint(step);

        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
            {/* Step pill */}
            <button
              onClick={() => !isLocked && onStepClick(i)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                minWidth: '100px',
                padding: '8px 14px',
                borderRadius: '8px',
                border: isActive ? 'none' : isDone ? '1px solid transparent' : '1px solid var(--border)',
                background: isActive
                  ? 'var(--accent)'
                  : isDone
                    ? confidenceTint || 'rgba(16, 185, 129, 0.1)'
                    : confidenceTint || 'transparent',
                cursor: isLocked ? 'default' : 'pointer',
                opacity: isLocked ? 0.3 : 1,
                transition: 'all 0.2s ease',
              }}
            >
              {/* Status indicator */}
              <span style={{ fontSize: '14px' }}>
                {isDone ? '✓' : step.icon}
              </span>
              {/* Label */}
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: isActive ? 700 : 500,
                  color: isActive
                    ? '#ffffff'
                    : isDone
                      ? 'var(--risk-low)'
                      : 'var(--text-muted)',
                  whiteSpace: 'nowrap',
                }}
              >
                {step.title}
              </span>
            </button>

            {/* Arrow separator (except after last) */}
            {i < steps.length - 1 && (
              <span
                style={{
                  fontSize: '10px',
                  color: 'var(--text-muted)',
                  margin: '0 2px',
                  opacity: 0.4,
                }}
              >
                →
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
