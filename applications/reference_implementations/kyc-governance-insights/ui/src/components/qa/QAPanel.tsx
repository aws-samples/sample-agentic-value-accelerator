import React, { useState } from 'react';
import { qaReviews, rubricDimensions, type QAReview } from '../../data/qaRubricData';

const labelColors: Record<string, string> = {
  Excellent: '#10b981', Good: '#3b82f6', Adequate: '#f59e0b', 'Below Standard': '#ef4444', Insufficient: '#dc2626',
};

function ReviewRow({ review, expanded, onToggle }: { review: QAReview; expanded: boolean; onToggle: () => void }) {
  const color = labelColors[review.overallLabel] || '#64748b';
  return (
    <div style={{ borderBottom: '1px solid var(--border)' }}>
      <button onClick={onToggle} style={{ width: '100%', padding: '10px 12px', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', textAlign: 'left' }}>
        <span>{review.flagged ? '\u26A0\uFE0F' : '\u2705'}</span>
        <span style={{ flex: 1, fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)' }}>{review.customerName}</span>
        <span style={{ fontSize: '0.75rem', fontWeight: 600, color }}>{review.overallScore.toFixed(1)}/5 {review.overallLabel}</span>
        <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>{review.trigger === 'auto_sample' ? 'auto' : 'manual'}</span>
      </button>
      {expanded && (
        <div style={{ padding: '0 12px 16px 36px' }}>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: '0 0 10px', lineHeight: 1.6, fontStyle: 'italic' }}>{review.justification}</p>
          {review.dimensions.map(d => {
            const dim = rubricDimensions.find(r => r.id === d.dimensionId);
            const dColor = d.score >= 4 ? '#10b981' : d.score >= 3 ? '#f59e0b' : '#ef4444';
            return (
              <div key={d.dimensionId} style={{ padding: '6px 10px', marginBottom: '4px', borderRadius: '6px', background: 'var(--bg-secondary)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                  <span style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-primary)' }}>{dim?.name || d.dimensionId}</span>
                  <span style={{ fontSize: '0.7rem', fontWeight: 600, color: dColor }}>{d.score}/5 {d.label}</span>
                </div>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{d.justification}</div>
              </div>
            );
          })}
          {review.flagged && (
            <div style={{ marginTop: '10px', padding: '10px', borderRadius: '8px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}>
              <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#f59e0b', marginBottom: '4px' }}>Why metrics alone aren't enough</div>
              <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                This decision scored 92%+ on ALL 10 automated evaluators. But qualitative review found sector-specific reasoning gaps that metrics cannot detect. This is why the QA Research Agent exists.
              </div>
            </div>
          )}
          <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '8px' }}>Impact: {review.impactOnAutonomy}</div>
        </div>
      )}
    </div>
  );
}

export default function QAPanel() {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const passing = qaReviews.filter(r => !r.flagged).length;
  const flagged = qaReviews.filter(r => r.flagged).length;
  const avg = (qaReviews.reduce((s, r) => s + r.overallScore, 0) / qaReviews.length).toFixed(1);

  return (
    <div style={{ background: 'var(--bg-card)', borderRadius: '12px', padding: '16px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <div>
          <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>{'\uD83D\uDD2C'} QA Research Agent</h3>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{passing} passing | {flagged} flagged | Avg: {avg}/5</span>
        </div>
        <span style={{ fontSize: '0.65rem', padding: '3px 8px', borderRadius: '4px', background: 'rgba(16,185,129,0.1)', color: '#10b981', fontWeight: 600 }}>Auto: 10%</span>
      </div>

      {/* Reviews */}
      <div style={{ borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border)' }}>
        {qaReviews.map(r => (
          <ReviewRow key={r.id} review={r} expanded={expandedId === r.id} onToggle={() => setExpandedId(expandedId === r.id ? null : r.id)} />
        ))}
      </div>
    </div>
  );
}
