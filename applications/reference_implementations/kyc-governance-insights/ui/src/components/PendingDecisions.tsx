import { useState, useEffect, useCallback } from 'react';
import { fetchPendingDecisions, submitDecision, type PendingDecision } from '../api/hitl';

export default function PendingDecisions() {
  const [decisions, setDecisions] = useState<PendingDecision[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ id: string; type: 'success' | 'error'; msg: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const items = await fetchPendingDecisions();
    setDecisions(items.filter(d => d.status === 'PENDING'));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDecision = async (d: PendingDecision, decision: 'APPROVED' | 'REJECTED') => {
    setSubmitting(d.taskTokenHash);
    const startTime = Date.now();
    const result = await submitDecision({
      taskToken: d.taskTokenHash,
      decision,
      reviewerId: 'governance-console-user',
      reason: `${decision} via Governance Console`,
      deliberationSeconds: Math.round((Date.now() - startTime) / 1000),
    });

    if (result.success) {
      setDecisions(prev => prev.filter(p => p.taskTokenHash !== d.taskTokenHash));
      setFlash({ id: d.taskTokenHash, type: 'success', msg: `${d.customerName}: ${decision}` });
    } else {
      setFlash({ id: d.taskTokenHash, type: 'error', msg: result.error || 'Failed' });
    }
    setSubmitting(null);
    setTimeout(() => setFlash(null), 3000);
  };

  const pendingCount = decisions.length;

  function timeAgo(iso: string): string {
    const diff = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
    return `${Math.round(diff / 3600)}h ago`;
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '0.75rem' }}>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
          Pending Decisions
        </h2>
        {pendingCount > 0 && (
          <span style={{
            background: '#ef4444', color: '#fff', fontSize: '10px', fontWeight: 700,
            borderRadius: '10px', padding: '2px 7px', minWidth: '18px', textAlign: 'center',
            animation: 'pulse 2s infinite',
          }}>
            {pendingCount}
          </span>
        )}
        <span style={{
          fontSize: '8px', fontWeight: 700, padding: '2px 6px', borderRadius: '4px',
          background: pendingCount > 0 ? 'rgba(239, 68, 68, 0.15)' : 'rgba(76, 175, 80, 0.15)',
          color: pendingCount > 0 ? '#ef4444' : '#4caf50',
          textTransform: 'uppercase',
        }}>
          {pendingCount > 0 ? 'ACTION REQUIRED' : 'CLEAR'}
        </span>
        <button
          onClick={load}
          disabled={loading}
          style={{
            marginLeft: 'auto', padding: '3px 8px', fontSize: '9px', fontWeight: 600,
            borderRadius: '4px', border: '1px solid var(--border)', background: 'transparent',
            color: 'var(--text-muted)', cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? '...' : 'Refresh'}
        </button>
      </div>

      {flash && (
        <div style={{
          padding: '6px 10px', marginBottom: '8px', borderRadius: '6px', fontSize: '11px',
          background: flash.type === 'success' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
          color: flash.type === 'success' ? '#10b981' : '#ef4444',
          border: `1px solid ${flash.type === 'success' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
        }}>
          {flash.msg}
        </div>
      )}

      {pendingCount === 0 && !loading && (
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px',
          padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.75rem',
        }}>
          No pending ESCALATE decisions. All agent actions are either auto-approved or resolved.
        </div>
      )}

      {decisions.map((d) => (
        <div
          key={d.taskTokenHash}
          style={{
            background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '10px',
            padding: '1rem', marginBottom: '0.75rem',
            borderLeft: `3px solid ${d.riskScore >= 0.95 ? '#ef4444' : d.riskScore >= 0.85 ? '#f59e0b' : '#0052CC'}`,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
            <div>
              <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                {d.customerName}
              </div>
              <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                Agent: {d.agentId} | Action: {d.actionType.replace(/_/g, ' ')}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{
                fontSize: '0.6rem', padding: '2px 6px', borderRadius: '4px', fontWeight: 600,
                background: d.riskScore >= 0.95 ? 'rgba(239, 68, 68, 0.15)' : 'rgba(245, 158, 15, 0.15)',
                color: d.riskScore >= 0.95 ? '#ef4444' : '#f59e0b',
              }}>
                Risk: {(d.riskScore * 100).toFixed(0)}% | Tier: {d.riskTier}
              </div>
              <div style={{ fontSize: '0.55rem', color: 'var(--text-muted)', marginTop: '3px' }}>
                {timeAgo(d.requestedAt)}
              </div>
            </div>
          </div>

          <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', marginBottom: '0.5rem', background: 'var(--bg-secondary)', borderRadius: '4px', padding: '6px 8px' }}>
            {Boolean(d.actionPayload.amount) && (
              <span>Amount: {String(d.actionPayload.currency ?? '')} {Number(d.actionPayload.amount).toLocaleString()}</span>
            )}
            {Boolean(d.actionPayload.pep_level) && (
              <span style={{ marginLeft: '12px' }}>PEP Level: {String(d.actionPayload.pep_level)}</span>
            )}
          </div>

          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <button
              onClick={() => handleDecision(d, 'APPROVED')}
              disabled={submitting === d.taskTokenHash}
              style={{
                padding: '5px 12px', fontSize: '11px', fontWeight: 600, borderRadius: '6px',
                border: 'none', background: '#2e7d32', color: '#fff',
                cursor: submitting === d.taskTokenHash ? 'not-allowed' : 'pointer',
                opacity: submitting === d.taskTokenHash ? 0.6 : 1,
              }}
            >
              Approve
            </button>
            <button
              onClick={() => handleDecision(d, 'REJECTED')}
              disabled={submitting === d.taskTokenHash}
              style={{
                padding: '5px 12px', fontSize: '11px', fontWeight: 600, borderRadius: '6px',
                border: 'none', background: '#c62828', color: '#fff',
                cursor: submitting === d.taskTokenHash ? 'not-allowed' : 'pointer',
                opacity: submitting === d.taskTokenHash ? 0.6 : 1,
              }}
            >
              Reject
            </button>
          </div>
        </div>
      ))}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.6; }
        }
      `}</style>
    </div>
  );
}
