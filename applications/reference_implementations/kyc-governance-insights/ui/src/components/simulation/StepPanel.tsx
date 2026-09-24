import type { SimStep } from '../../types/simulation';
import type { ReactNode } from 'react';
import type { SourceDocument } from '../../data/sourceDocumentsData';
import BlastRadiusMeter from './BlastRadiusMeter';
import SourceDocumentsPanel from './SourceDocumentsPanel';
import GovernanceGrid from './GovernanceGrid';
import { usePersona } from '../../contexts/PersonaContext';

interface StepPanelProps {
  step: SimStep;
  stepIndex: number;
  totalSteps: number;
  activityLog?: ReactNode;
  sourceDocuments?: SourceDocument[];
}

export default function StepPanel({
  step,
  stepIndex,
  totalSteps,
  activityLog,
  sourceDocuments,
}: StepPanelProps) {
  const { persona } = usePersona();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* Step type subtitle (compact — hero is replaced by sticky pill bar) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
          {step.type}
        </span>
        <span style={{ fontSize: '9px', color: 'var(--text-muted)', background: 'var(--bg-secondary)', padding: '2px 6px', borderRadius: '4px' }}>
          Step {stepIndex + 1}/{totalSteps}
        </span>
      </div>

      {/* Persona-specific step annotations */}
      {persona === 'cro-fleet' && (
        <div style={{ fontSize: '12px', color: '#90caf9', marginTop: '-4px' }}>
          ✅ {step.ctrls.length} controls passed | ⚠️ {step.risks.length} risks monitored | 🛡️ Contained
        </div>
      )}
      {persona === 'compliance' && (
        <div style={{ fontSize: '12px', color: '#81c784', marginTop: '-4px' }}>
          📋 Evidence items generated: {step.ctrls.length + 1} | Regulations satisfied: {step.risks.length > 0 ? 'PRA SS1/23 P2, P3' : 'PRA SS1/23 P3'}
        </div>
      )}

      {/* Source Documents (only on Step 1 — Data Ingestion) */}
      {stepIndex === 0 && sourceDocuments && sourceDocuments.length > 0 && (
        <SourceDocumentsPanel documents={sourceDocuments} />
      )}

      {/* Blast Radius Meter */}
      <BlastRadiusMeter level={step.blast} stepIndex={stepIndex} totalSteps={totalSteps} />

      {/* Activity Log (injected from parent) */}
      {activityLog}

      {/* Permanent Governance Panel — step-aware highlighting, always visible */}
      <GovernanceGrid currentStep={stepIndex} />

      {/* Insight Box */}
      <div
        style={{
          background: 'var(--bg-secondary)',
          borderRadius: '10px',
          padding: '14px 18px',
          display: 'flex',
          alignItems: 'flex-start',
          gap: '10px',
        }}
      >
        <span style={{ fontSize: '18px', flexShrink: 0 }}>💡</span>
        <span
          style={{
            fontSize: '12px',
            fontFamily: 'var(--font-sans)',
            color: 'var(--text-secondary)',
            lineHeight: '1.6',
          }}
        >
          {step.insight}
        </span>
      </div>
    </div>
  );
}
