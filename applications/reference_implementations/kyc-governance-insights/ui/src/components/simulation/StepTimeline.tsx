import React from 'react';
import type { SimStep } from '../../types/simulation';

interface StepTimelineProps {
  steps: SimStep[];
  currentStep: number;
  maxStep: number;
  onStepClick: (index: number) => void;
}

const StepTimeline: React.FC<StepTimelineProps> = ({
  steps,
  currentStep,
  maxStep,
  onStepClick,
}) => {
  const isLocked = (index: number): boolean => index > maxStep;

  const getPillBackground = (index: number): string => {
    if (index === currentStep) return '#3b82f6';
    if (index < currentStep) return 'rgba(16, 185, 129, 0.15)';
    return 'var(--bg-secondary)';
  };

  const getPillBorder = (index: number): string => {
    if (index === currentStep) return '1px solid #3b82f6';
    if (index < currentStep) return '1px solid rgba(16, 185, 129, 0.4)';
    return '1px solid var(--border)';
  };

  const getPillColor = (index: number): string => {
    if (index === currentStep) return '#ffffff';
    if (index < currentStep) return '#10b981';
    return 'var(--text-muted)';
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        flexWrap: 'wrap',
      }}
    >
      {steps.map((step, index) => {
        const locked = isLocked(index);
        const completed = index < currentStep;

        return (
          <div
            key={index}
            onClick={() => {
              if (!locked) onStepClick(index);
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '4px 10px',
              borderRadius: '16px',
              background: getPillBackground(index),
              border: getPillBorder(index),
              cursor: locked ? 'not-allowed' : 'pointer',
              opacity: locked ? 0.35 : 1,
              transition: 'all 0.2s ease',
              whiteSpace: 'nowrap',
            }}
            title={step.title}
          >
            <span style={{ fontSize: '12px' }}>
              {completed ? '✓' : step.icon}
            </span>
            <span
              style={{
                fontSize: '10px',
                fontFamily: 'var(--font-sans)',
                fontWeight: index === currentStep ? 600 : 400,
                color: getPillColor(index),
              }}
            >
              {step.title.length > 14 ? step.title.slice(0, 14) + '…' : step.title}
            </span>
          </div>
        );
      })}
    </div>
  );
};

export default StepTimeline;
