import React from 'react';
import { useLiveData } from '../../hooks/useLiveData';
import { fetchEvaluators, type EvaluatorDef } from '../../api/evaluations';

// Reads evaluator definitions from the live registry proxy (/svc/registry/evaluators),
// which serves the values written by the Phase 3 seed. There is intentionally NO
// hardcoded fallback here: on an unseeded deployment (customer just cloned + deployed)
// the card shows a "run the seed script" state rather than silently rendering demo
// numbers that don't reflect the account's actual data.

function EmptyState() {
  return (
    <div style={{ background: 'var(--bg-card)', borderRadius: '10px', padding: '16px', borderLeft: '3px solid var(--text-muted)' }}>
      <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>Evaluation Pipeline</div>
      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
        No evaluator data found. Run <code style={{ fontFamily: 'var(--font-mono, monospace)' }}>seed_phase3.py</code> to
        populate the demo evaluators, then reload.
      </div>
    </div>
  );
}

export default function EvalSummaryCard() {
  const { data: evaluators, isLoading } = useLiveData<EvaluatorDef[] | null>(fetchEvaluators, null);

  if (isLoading) {
    return (
      <div style={{ background: 'var(--bg-card)', borderRadius: '10px', padding: '16px', borderLeft: '3px solid var(--text-muted)' }}>
        <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>Evaluation Pipeline</div>
        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Loading evaluators…</div>
      </div>
    );
  }

  if (!evaluators || evaluators.length === 0) {
    return <EmptyState />;
  }

  // Defensive field mapping — tolerate rows missing gateType / currentScore / status.
  const isPassing = (e: EvaluatorDef) => e.status === 'passing';
  const total = evaluators.length;
  const passing = evaluators.filter(isPassing).length;
  const warnings = total - passing;
  const hardGates = evaluators.filter((e) => e.gateType === 'hard');
  const softGates = evaluators.filter((e) => e.gateType === 'soft');
  const hardPassing = hardGates.filter(isPassing).length;
  const softPassing = softGates.filter(isPassing).length;

  const scored = evaluators.filter((e) => typeof e.currentScore === 'number' && !Number.isNaN(e.currentScore));
  const overall = scored.length
    ? Math.round((scored.reduce((s, e) => s + e.currentScore, 0) / scored.length) * 10) / 10
    : null;

  return (
    <div style={{ background: 'var(--bg-card)', borderRadius: '10px', padding: '16px', borderLeft: '3px solid #10b981' }}>
      <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>Evaluation Pipeline</div>
      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <span>{passing}/{total} passing {warnings > 0 && <span style={{ color: '#f59e0b' }}>{'\u26A0\uFE0F'} {warnings} attention</span>}</span>
        <span>Hard gates: {hardPassing}/{hardGates.length} {'\u2705'} | Soft gates: {softPassing}/{softGates.length}</span>
        {overall !== null && <span style={{ fontWeight: 600 }}>Overall quality: {overall}%</span>}
      </div>
    </div>
  );
}
