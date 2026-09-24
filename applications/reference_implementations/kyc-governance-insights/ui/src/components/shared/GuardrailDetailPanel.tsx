import React from 'react';
import { usePersona } from '../../contexts/PersonaContext';

interface PolicyType {
  icon: string;
  name: string;
  ruleCount: number;
  status: 'active' | 'configured' | 'pending';
}

const GUARDRAIL_POLICIES: PolicyType[] = [
  { icon: '🛡️', name: 'Content Filters', ruleCount: 6, status: 'active' },
  { icon: '🚫', name: 'Denied Topics', ruleCount: 6, status: 'active' },
  { icon: '🔤', name: 'Word Filters', ruleCount: 15, status: 'active' },
  { icon: '🔒', name: 'PII Protection', ruleCount: 23, status: 'active' },
  { icon: '🎯', name: 'Contextual Grounding', ruleCount: 2, status: 'active' },
  { icon: '🧮', name: 'Automated Reasoning', ruleCount: 1, status: 'active' },
  { icon: '⚔️', name: 'Prompt Attack Detection', ruleCount: 1, status: 'active' },
];

const statusConfig = {
  active: { color: '#10b981', label: '● Active' },
  configured: { color: '#3b82f6', label: '● Configured' },
  pending: { color: '#f59e0b', label: '○ Pending' },
};

export default function GuardrailDetailPanel() {
  const { persona } = usePersona();

  // CRO sees simplified summary
  if (persona === 'cro-fleet') {
    return (
      <div style={{ background: 'var(--bg-card)', borderRadius: '10px', padding: '14px', border: '1px solid var(--border)' }}>
        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
          🛡️ Guardrail Protection
        </div>
        <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
          Protected by 7-layer guardrail with 50+ active rules. Content safety, PII masking, topic governance, and factual grounding — all firing in parallel.
        </div>
      </div>
    );
  }

  // Compliance sees summary counts
  if (persona === 'compliance') {
    const totalRules = GUARDRAIL_POLICIES.reduce((sum, p) => sum + p.ruleCount, 0);
    return (
      <div style={{ background: 'var(--bg-card)', borderRadius: '10px', padding: '14px', border: '1px solid var(--border)' }}>
        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>
          🛡️ Bedrock Guardrail — 7 policy types, {totalRules} rules
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '4px' }}>
          {GUARDRAIL_POLICIES.map(p => (
            <div key={p.name} style={{ fontSize: '0.63rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ color: statusConfig[p.status].color, fontSize: '0.5rem' }}>●</span>
              {p.name} ({p.ruleCount})
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Engineering / Business Ops sees full detail
  return (
    <div style={{ background: 'var(--bg-card)', borderRadius: '10px', padding: '14px', border: '1px solid var(--border)' }}>
      <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '10px' }}>
        🛡️ Bedrock Guardrail Configuration
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {GUARDRAIL_POLICIES.map(p => {
          const cfg = statusConfig[p.status];
          return (
            <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.68rem' }}>
              <span>{p.icon}</span>
              <span style={{ flex: 1, color: 'var(--text-primary)' }}>{p.name}</span>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.6rem' }}>{p.ruleCount} rules</span>
              <span style={{ color: cfg.color, fontSize: '0.55rem', fontWeight: 600 }}>{cfg.label}</span>
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: '8px', fontSize: '0.6rem', color: 'var(--text-muted)', borderTop: '1px solid var(--border)', paddingTop: '6px' }}>
        Total: {GUARDRAIL_POLICIES.reduce((s, p) => s + p.ruleCount, 0)} rules across {GUARDRAIL_POLICIES.length} policy types. Zero additional latency (parallel evaluation).
      </div>
    </div>
  );
}
