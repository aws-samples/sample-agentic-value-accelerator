import React, { useState, useMemo, useEffect } from 'react';
import { initialReviewQueue, type ReviewItem } from '../../data/reviewQueueData';
import { usePolicyConfig } from '../../contexts/PolicyConfigContext';
import { useLiveData } from '../../hooks/useLiveData';
import { fetchPendingReviews } from '../../api/hitl';
import SectionDescription from '../shared/SectionDescription';
import DataSourceBadge from '../shared/DataSourceBadge';

// Map a live HITL API review record onto the rich ReviewItem shape the demo UI
// expects. Live fields (name, score, tier, agent, action) come from the real
// backend; the evidence-panel detail (evaluators, policies, docs) is filled from
// a matching template so the panels stay populated for the walkthrough.
function mapApiReview(r: any, idx: number): ReviewItem {
  const template = initialReviewQueue[idx % initialReviewQueue.length];
  let payload: Record<string, any> = {};
  try {
    payload = typeof r.actionPayload === 'string' ? JSON.parse(r.actionPayload) : (r.actionPayload || {});
  } catch { /* leave payload empty */ }

  const rawScore = typeof r.riskScore === 'number' ? r.riskScore : 0;
  const riskScore = rawScore <= 1 ? Math.round(rawScore * 100) : Math.round(rawScore);

  const reason = String(payload.reason || '');
  const triggerType: ReviewItem['triggerType'] =
    r.actionType === 'onboard_pep_client' ? 'pep_match'
    : reason.includes('sanctions') ? 'hard_gate'
    : 'risk_threshold';

  return {
    id: r.review_id || `REV-${idx}`,
    customerId: r.review_id || template.customerId,
    customerName: r.customerName || template.customerName,
    riskScore,
    triggerType,
    triggerReason: r.actionType
      ? `${String(r.actionType).replace(/_/g, ' ')} — tier ${r.riskTier || 'n/a'}`
      : template.triggerReason,
    agentRecommendation: template.agentRecommendation,
    reasoningSummary: `${r.agentId || 'Agent'} escalated this ${r.riskTier || ''} decision for human review${payload.amount ? ` (${payload.currency || ''} ${Number(payload.amount).toLocaleString()})` : ''}.`,
    status: String(r.status || 'PENDING').toLowerCase() === 'pending' ? 'pending' : 'in_review',
    createdAt: r.requestedAt || template.createdAt,
    slaDeadline: new Date(Date.now() + 90 * 60000).toISOString(),
    assignedTo: null,
    evaluatorResults: template.evaluatorResults,
    cedarPoliciesTriggered: template.cedarPoliciesTriggered,
    sourceDocuments: template.sourceDocuments,
    waitForTaskToken: r.review_id || template.waitForTaskToken,
  };
}

// Returns live-mapped queue items, or null so useLiveData falls back to the
// scripted queue (keeps the badge honest: Live only when the API responds).
async function fetchLiveReviewQueue(): Promise<ReviewItem[] | null> {
  const reviews = await fetchPendingReviews();
  if (!reviews || reviews.length === 0) return null;
  return reviews.map(mapApiReview);
}

function SLABadge({ deadline }: { deadline: string }) {
  const remaining = Math.max(0, new Date(deadline).getTime() - Date.now());
  const mins = Math.floor(remaining / 60000);
  const color = mins < 30 ? '#ef4444' : mins < 60 ? '#f59e0b' : 'var(--text-muted)';
  return <span style={{ fontSize: '0.6rem', color, fontWeight: 600 }}>{mins > 0 ? `${mins}min` : 'OVERDUE'}</span>;
}

function TriggerBadge({ type }: { type: ReviewItem['triggerType'] }) {
  const config: Record<string, { label: string; color: string }> = {
    risk_threshold: { label: 'RISK', color: '#f59e0b' },
    hard_gate: { label: 'HARD GATE', color: '#ef4444' },
    pep_match: { label: 'PEP', color: '#8b5cf6' },
    manual_escalation: { label: 'MANUAL', color: '#3b82f6' },
  };
  const c = config[type] || config.risk_threshold;
  return <span style={{ fontSize: '0.55rem', fontWeight: 700, padding: '2px 5px', borderRadius: '3px', background: `${c.color}20`, color: c.color }}>{c.label}</span>;
}

export const ReviewQueueTab: React.FC = () => {
  const { params } = usePolicyConfig();
  // Live HITL queue with graceful fallback to the scripted queue (30s refresh).
  const { data: liveQueue, isLive } = useLiveData<ReviewItem[]>(fetchLiveReviewQueue, initialReviewQueue, 30000);
  const [queue, setQueue] = useState<ReviewItem[]>(initialReviewQueue);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [actionTimer, setActionTimer] = useState(0);

  // Sync local queue from live data; local action handling layers on top.
  useEffect(() => { setQueue(liveQueue); }, [liveQueue]);

  // Filter queue based on active profile threshold
  const visibleQueue = useMemo(() =>
    queue.filter(item => {
      if (item.status !== 'pending') return false;
      if (item.triggerType === 'hard_gate' || item.triggerType === 'pep_match') return true;
      return item.riskScore >= params.riskScoreThreshold;
    }),
  [queue, params.riskScoreThreshold]);

  const selected = visibleQueue.find(i => i.id === selectedId) || visibleQueue[0] || null;

  // Anti-fatigue: start 3s timer when selecting an item
  const handleSelect = (id: string) => {
    setSelectedId(id);
    setActionTimer(3);
    const interval = setInterval(() => {
      setActionTimer(prev => { if (prev <= 1) { clearInterval(interval); return 0; } return prev - 1; });
    }, 1000);
  };

  const handleAction = (action: 'approve' | 'reject' | 'escalate') => {
    if (!selected) return;
    setQueue(prev => prev.map(item =>
      item.id === selected.id ? { ...item, status: action === 'escalate' ? 'escalated' as const : action === 'approve' ? 'approved' as const : 'rejected' as const } : item
    ));
    setSelectedId(null);
  };

  return (
    <div data-testid="hitl.container" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
          Review Queue ({visibleQueue.length} pending)
          <DataSourceBadge isLive={isLive} />
        </h2>
        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Profile threshold: {params.riskScoreThreshold}</span>
      </div>
      <SectionDescription text="Human-in-the-loop decisions awaiting analyst review — SLA-tracked with anti-fatigue guardrails." />

      {/* Three-column layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr 280px', gap: '12px', minHeight: '400px' }}>
        {/* Queue List */}
        <div style={{ background: 'var(--bg-card)', borderRadius: '10px', padding: '12px', overflowY: 'auto' }}>
          {visibleQueue.length === 0 && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center', padding: '2rem 0' }}>Queue empty</div>}
          {visibleQueue.map(item => (
            <div key={item.id} onClick={() => handleSelect(item.id)}
              style={{ padding: '10px', borderRadius: '8px', marginBottom: '6px', cursor: 'pointer', background: selected?.id === item.id ? 'var(--bg-secondary)' : 'transparent', border: selected?.id === item.id ? '1px solid var(--accent)' : '1px solid transparent' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-primary)' }}>{item.customerName}</span>
                <TriggerBadge type={item.triggerType} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                <span>Score: {item.riskScore}</span>
                <SLABadge deadline={item.slaDeadline} />
              </div>
            </div>
          ))}
        </div>

        {/* Decision Detail */}
        <div style={{ background: 'var(--bg-card)', borderRadius: '10px', padding: '16px' }}>
          {selected ? (
            <>
              <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>{selected.customerName}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '12px' }}>{selected.customerId} | Risk: {selected.riskScore}/100</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Trigger:</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '12px' }}>{selected.triggerReason}</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Agent Recommendation:</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-primary)', marginBottom: '12px', fontWeight: 600 }}>{selected.agentRecommendation.replace(/_/g, ' ').toUpperCase()}</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Reasoning:</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '16px', lineHeight: 1.6 }}>{selected.reasoningSummary}</div>
              {/* Actions */}
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button onClick={() => handleAction('approve')} disabled={actionTimer > 0}
                  style={{ padding: '6px 14px', borderRadius: '6px', border: 'none', background: actionTimer > 0 ? 'var(--bg-secondary)' : '#10b981', color: actionTimer > 0 ? 'var(--text-muted)' : '#fff', fontWeight: 600, fontSize: '0.75rem', cursor: actionTimer > 0 ? 'not-allowed' : 'pointer' }}>
                  {actionTimer > 0 ? `\u2705 Approve (${actionTimer}s)` : '\u2705 Approve'}
                </button>
                <button onClick={() => handleAction('reject')} disabled={actionTimer > 0}
                  style={{ padding: '6px 14px', borderRadius: '6px', border: 'none', background: actionTimer > 0 ? 'var(--bg-secondary)' : '#ef4444', color: actionTimer > 0 ? 'var(--text-muted)' : '#fff', fontWeight: 600, fontSize: '0.75rem', cursor: actionTimer > 0 ? 'not-allowed' : 'pointer' }}>
                  {actionTimer > 0 ? `\u274C Reject (${actionTimer}s)` : '\u274C Reject'}
                </button>
                <button onClick={() => handleAction('escalate')}
                  style={{ padding: '6px 14px', borderRadius: '6px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-primary)', fontWeight: 600, fontSize: '0.75rem', cursor: 'pointer' }}>
                  \u2B06\uFE0F Escalate
                </button>
              </div>
              {actionTimer > 0 && <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginTop: '6px', fontStyle: 'italic' }}>Review evidence for {actionTimer}s before acting (anti-fatigue)</div>}
            </>
          ) : (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Select an item from the queue</div>
          )}
        </div>

        {/* Evidence Panel */}
        <div style={{ background: 'var(--bg-card)', borderRadius: '10px', padding: '12px', overflowY: 'auto' }}>
          {selected ? (
            <>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '10px' }}>Evidence & Context</div>
              <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: '6px' }}>Source Documents:</div>
              {selected.sourceDocuments.map((d, i) => (
                <div key={i} style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', padding: '3px 0' }}>{'\uD83D\uDCC4'} {d}</div>
              ))}
              <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '10px', marginBottom: '6px' }}>Evaluator Results:</div>
              {selected.evaluatorResults.map((ev, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', padding: '2px 0' }}>
                  <span style={{ color: ev.passed ? 'var(--text-secondary)' : '#ef4444' }}>{ev.passed ? '\u2705' : '\u274C'} {ev.name}</span>
                  <span style={{ color: 'var(--text-muted)' }}>{Math.round(ev.score * 100)}%</span>
                </div>
              ))}
              {selected.cedarPoliciesTriggered.length > 0 && (
                <>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '10px', marginBottom: '6px' }}>Cedar Policies Triggered:</div>
                  {selected.cedarPoliciesTriggered.map((p, i) => (
                    <div key={i} style={{ fontSize: '0.65rem', color: '#f59e0b', padding: '2px 0' }}>{'\uD83D\uDEE1\uFE0F'} {p}</div>
                  ))}
                </>
              )}
              <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginTop: '12px', fontStyle: 'italic' }}>Token: {selected.waitForTaskToken}</div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default ReviewQueueTab;
