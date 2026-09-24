import React from 'react';
import type { SimStep } from '../../types/simulation';

interface StepNavigationProps {
  steps: SimStep[];
  currentStep: number;
  maxStep: number;
  onStepClick: (index: number) => void;
}

const StepNavigation: React.FC<StepNavigationProps> = ({
  steps,
  currentStep,
  maxStep,
  onStepClick,
}) => {
  const getDotColor = (index: number): string => {
    if (index === currentStep) return '#3b82f6';
    if (index < currentStep) return '#10b981';
    return '#64748b';
  };

  const isLocked = (index: number): boolean => index > maxStep;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      {steps.map((step, index) => {
        const locked = isLocked(index);
        const dotColor = getDotColor(index);

        return (
          <div
            key={index}
            onClick={() => {
              if (!locked) onStepClick(index);
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              cursor: locked ? 'not-allowed' : 'pointer',
              opacity: locked ? 0.35 : 1,
              padding: '3px 0',
              transition: 'opacity 0.2s ease',
            }}
          >
            <div
              style={{
                width: '22px',
                height: '22px',
                borderRadius: '50%',
                background: dotColor,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '11px',
                flexShrink: 0,
              }}
            >
              {step.icon}
            </div>
            <span
              style={{
                fontSize: '11px',
                fontFamily: 'var(--font-sans)',
                color: index === currentStep ? 'var(--text-primary)' : 'var(--text-secondary)',
                fontWeight: index === currentStep ? 600 : 400,
              }}
            >
              {step.title}
            </span>
          </div>
        );
      })}
    </div>
  );
};

export default StepNavigation;
