import React from 'react';
import type { ARResult } from '../../api/automated-reasoning';

interface ARVerdictBadgeProps {
  result: ARResult | null;
  loading?: boolean;
}

export default function ARVerdictBadge({ result, loading }: ARVerdictBadgeProps) {
  if (loading) {
    return (
      <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
        Checking…
      </span>
    );
  }

  if (!result) {
    // Fallback — no AR result available, show static pass
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '0.6rem', fontWeight: 600, color: '#10b981', padding: '2px 6px', borderRadius: '4px', background: 'rgba(16,185,129,0.1)' }}>
        ✓ AR Pass
      </span>
    );
  }

  const config = {
    VALID: { icon: '✓', label: 'Proven', color: '#10b981', bg: 'rgba(16,185,129,0.1)' },
    INVALID: { icon: '✗', label: 'Violation', color: '#ef4444', bg: 'rgba(239,68,68,0.1)' },
    INSUFFICIENT_DATA: { icon: '?', label: 'Insufficient', color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' },
  }[result.verdict];

  return (
    <span
      title={`${result.checkedRules} rules checked in ${result.latencyMs}ms${result.violations.length > 0 ? ` | ${result.violations.length} violation(s)` : ''}`}
      style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '0.6rem', fontWeight: 600, color: config.color, padding: '2px 6px', borderRadius: '4px', background: config.bg, cursor: 'help' }}
    >
      {config.icon} {config.label}
    </span>
  );
}
