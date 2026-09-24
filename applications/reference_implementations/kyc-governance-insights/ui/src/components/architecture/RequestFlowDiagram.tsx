import React from 'react';
import { usePersona } from '../../contexts/PersonaContext';
import { executiveFlow, businessOpsFlow, complianceFlow, engineeringFlow, type FlowStep } from '../../data/requestFlowData';

function FlowStepBox({ step, index }: { step: FlowStep; index: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', opacity: 0, animation: `fadeIn 0.4s ease forwards ${index * 0.4}s` }}>
      <div style={{ padding: '8px 12px', borderRadius: '8px', background: `${step.color}15`, border: `1px solid ${step.color}40`, textAlign: 'center', minWidth: '90px' }}>
        <div style={{ fontSize: '1rem' }}>{step.icon}</div>
        <div style={{ fontSize: '0.7rem', fontWeight: 600, color: step.color }}>{step.label}</div>
        <div style={{ fontSize: '0.55rem', color: 'var(--text-muted)' }}>{step.description}</div>
        {step.latencyMs > 0 && <div style={{ fontSize: '0.5rem', color: 'var(--text-muted)', marginTop: '2px' }}>{step.latencyMs}ms</div>}
      </div>
      {/* Arrow (except last) */}
      <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{'\u2192'}</span>
    </div>
  );
}

export default function RequestFlowDiagram() {
  const { persona } = usePersona();

  let steps: FlowStep[];
  let title: string;
  switch (persona) {
    case 'cro-fleet': steps = executiveFlow; title = 'Request Flow (Executive)'; break;
    case 'business-ops': steps = businessOpsFlow; title = 'Request Flow (Operational)'; break;
    case 'compliance': steps = complianceFlow; title = 'Request Flow (Control Points)'; break;
    default: steps = engineeringFlow; title = 'Request Flow (Full Technical)';
  }

  return (
    <div data-testid="architecture.request-flow" style={{ background: 'var(--bg-card)', borderRadius: '12px', padding: '16px' }}>
      <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 12px' }}>{title}</h3>
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', overflowX: 'auto', padding: '8px 0' }}>
        {steps.map((step, i) => <FlowStepBox key={step.id} step={step} index={i} />)}
      </div>
      <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginTop: '8px' }}>
        Total: {steps.reduce((s, st) => s + st.latencyMs, 0)}ms | {steps.length} steps | All encrypted in transit
      </div>
    </div>
  );
}
