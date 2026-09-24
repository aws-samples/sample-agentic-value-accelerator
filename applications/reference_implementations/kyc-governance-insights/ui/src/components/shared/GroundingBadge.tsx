import React from 'react';

interface GroundingBadgeProps {
  groundingScore: number | null;
  relevanceScore: number | null;
  showRelevance?: boolean;
}

export default function GroundingBadge({ groundingScore, relevanceScore, showRelevance = false }: GroundingBadgeProps) {
  if (groundingScore === null) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '0.6rem', fontWeight: 600, color: '#64748b', padding: '2px 6px', borderRadius: '4px', background: 'rgba(100,116,139,0.1)' }}>
        Grounding: N/A
      </span>
    );
  }

  const pct = Math.round(groundingScore * 100);
  const relPct = relevanceScore !== null ? Math.round(relevanceScore * 100) : null;
  
  let icon: string, label: string, color: string, bg: string;
  if (groundingScore >= 0.85) {
    icon = '✓'; label = 'Grounded'; color = '#10b981'; bg = 'rgba(16,185,129,0.1)';
  } else if (groundingScore >= 0.60) {
    icon = '⚠'; label = 'Partially Grounded'; color = '#f59e0b'; bg = 'rgba(245,158,11,0.1)';
  } else {
    icon = '✗'; label = 'Ungrounded'; color = '#ef4444'; bg = 'rgba(239,68,68,0.1)';
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '0.6rem', fontWeight: 600, color, padding: '2px 6px', borderRadius: '4px', background: bg }}>
      {icon} {label}: {pct}%
      {showRelevance && relPct !== null && (
        <span style={{ color: '#64748b', fontWeight: 400 }}> | Relevance: {relPct}%</span>
      )}
    </span>
  );
}
