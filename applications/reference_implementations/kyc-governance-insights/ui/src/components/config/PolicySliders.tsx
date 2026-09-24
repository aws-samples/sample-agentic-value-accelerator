import React from 'react';
import { usePolicyConfig } from '../../contexts/PolicyConfigContext';
import InfoTooltip from '../shared/InfoTooltip';

function Slider({ label, value, min, max, step, unit, onChange }: {
  label: string; value: number; min: number; max: number; step: number; unit: string;
  onChange: (v: number) => void;
}) {
  return (
    <div style={{ marginBottom: '12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{label}</span>
        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-primary)' }}>{unit}{value.toLocaleString()}{unit === '%' ? '' : ''}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: '100%', accentColor: 'var(--accent)' }}
      />
    </div>
  );
}

export default function PolicySliders() {
  const { params, updateParam } = usePolicyConfig();

  // Impact calculation (simplified)
  const autoApproveRate = Math.round(100 - (params.riskScoreThreshold * 0.6 + params.hitlReviewRate * 0.3));

  return (
    <div style={{ background: 'var(--bg-card)', borderRadius: '10px', padding: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '12px' }}>
        Policy Parameters
        <InfoTooltip text="Business-owned thresholds that bound autonomous behaviour: the transaction value ceiling and risk-score above which a decision must escalate, the share of cases routed to a human reviewer, and the maximum autonomy level permitted. Changes take effect on the next decision — the Impact Preview below estimates the resulting auto-approve vs escalation split." />
      </div>

      <Slider label="Value Threshold" value={params.valueThreshold} min={500} max={100000} step={500}
        unit="\u00A3" onChange={(v) => updateParam('valueThreshold', v)} />
      <Slider label="Risk Score Threshold" value={params.riskScoreThreshold} min={0} max={100} step={5}
        unit="" onChange={(v) => updateParam('riskScoreThreshold', v)} />
      <Slider label="HITL Review Rate" value={params.hitlReviewRate} min={0} max={100} step={5}
        unit="%" onChange={(v) => updateParam('hitlReviewRate', v)} />
      <Slider label="Autonomy Scope" value={params.maxAutonomyScope} min={1} max={4} step={1}
        unit="L" onChange={(v) => updateParam('maxAutonomyScope', v)} />

      {/* Toggles */}
      <div style={{ display: 'flex', gap: '16px', marginTop: '8px' }}>
        <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
          <input type="checkbox" checked={params.allowExternalActions} onChange={(e) => updateParam('allowExternalActions', e.target.checked)} style={{ accentColor: 'var(--accent)' }} />
          Allow External Actions
        </label>
        <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
          <input type="checkbox" checked={params.pepAutoApprove} onChange={(e) => updateParam('pepAutoApprove', e.target.checked)} style={{ accentColor: 'var(--accent)' }} />
          Auto-approve Non-PEP
        </label>
      </div>

      {/* Impact Preview */}
      <div style={{ marginTop: '16px', padding: '10px 12px', borderRadius: '8px', background: 'var(--bg-secondary)', fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
        <div style={{ fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>Impact Preview</div>
        <div>~{Math.max(0, Math.min(100, autoApproveRate))}% of decisions auto-approved</div>
        <div>~{Math.max(0, 100 - autoApproveRate)}% escalated to human reviewer</div>
        <div>Avg processing: ~40s (auto) / ~4h (human)</div>
      </div>
    </div>
  );
}
