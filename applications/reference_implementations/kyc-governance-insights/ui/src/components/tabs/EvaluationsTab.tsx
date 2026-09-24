import React, { useState } from 'react';
import EvaluationsDashboard from '../evaluations/EvaluationsDashboard';
import PipelineGate from '../evaluations/PipelineGate';
import InfoTooltip from '../shared/InfoTooltip';
import InfoPanel from '../shared/InfoPanel';
import { getInfoItem } from '../../data/infoContent';

// Tier 1: the evidence that justifies autonomy promotion — continuous measurement
// (EvaluationsDashboard) plus the promotion gate (PipelineGate). Both components were
// built but previously unrouted; this tab surfaces them front-and-centre.

function InfoButton({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const item = getInfoItem(id);
  if (!item) return null;
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label={`About ${item.panelTitle}`}
        style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--text-muted)', fontSize: '0.65rem', fontWeight: 600, padding: '2px 8px', cursor: 'pointer' }}
      >
        ⓘ What is this?
      </button>
      {open && <InfoPanel item={item} onClose={() => setOpen(false)} />}
    </>
  );
}

export default function EvaluationsTab() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center' }}>
            Continuous Evaluations
            <InfoTooltip text="The rolling results of automated evaluators run against every agent decision. These scores are the evidence base for earned autonomy: sustained passing scores justify promoting an agent to a higher autonomy tier; a breach tightens it back." />
          </h2>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '4px 0 0', maxWidth: '640px', lineHeight: 1.5 }}>
            Measurement is what turns trust into something earned rather than assumed. Each evaluator
            scores a dimension of decision quality; hard gates must pass for an agent to act
            autonomously, soft gates inform the promotion decision.
          </p>
        </div>
        <InfoButton id="evaluations-pipeline" />
      </div>

      {/* Per-category evaluator scores, thresholds, and trends (was unrouted) */}
      <EvaluationsDashboard />

      {/* Promotion-gate chips: which evaluators passed for the latest decision (was unrouted) */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '10px', padding: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '4px' }}>
          <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>Promotion Gate</span>
          <InfoTooltip text="A decision only clears the gate when every hard evaluator passes. Green = passed, amber = warning, red = failed. This is the check that runs before an agent is allowed to act (or be promoted a tier) without human review." />
        </div>
        <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', margin: '0 0 4px', lineHeight: 1.5 }}>
          Expand to see the per-evaluator result for the most recent decision.
        </p>
        <PipelineGate />
      </div>
    </div>
  );
}
