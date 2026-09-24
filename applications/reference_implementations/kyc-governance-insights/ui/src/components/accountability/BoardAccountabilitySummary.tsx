import React from 'react';
import {
  getAttestationSummary,
  getDaysOverdue,
  getDaysUntilDue,
  getNextDueDate,
} from '../../data/accountabilityData';

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function StatBox({ value, label }: { value: string | number; label: string }) {
  return (
    <div style={{ background: 'var(--bg-card)', borderRadius: '10px', padding: '16px', textAlign: 'center', border: '1px solid var(--border)' }}>
      <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)' }}>{value}</div>
      <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '4px' }}>{label}</div>
    </div>
  );
}

export default function BoardAccountabilitySummary() {
  const summary = getAttestationSummary();

  return (
    <div style={{ background: 'var(--bg-secondary)', borderRadius: '12px', padding: '24px' }}>
      {/* Header */}
      <div style={{ marginBottom: '20px' }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
          SM&CR AI Accountability — Board Summary
        </h3>
        <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', margin: '4px 0 0' }}>
          Senior Manager accountability status for AI systems
        </p>
      </div>

      {/* Stat boxes */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '20px' }}>
        <StatBox value={summary.totalSystems} label="AI Systems in Scope" />
        <StatBox value={summary.totalHolders} label="SMF Holders Accountable" />
        <StatBox value={`${summary.compliancePct}%`} label="Attestation Compliance" />
      </div>

      {/* RAG Breakdown */}
      <div style={{ background: 'var(--bg-card)', borderRadius: '10px', padding: '16px', border: '1px solid var(--border)', marginBottom: '16px' }}>
        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '12px' }}>
          ATTESTATION STATUS
        </div>

        {/* Current */}
        {summary.current.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.7rem', fontWeight: 600, color: '#10b981', minWidth: '110px' }}>
              🟢 Current ({summary.current.length})
            </span>
            <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>
              {summary.current.map(s => s.holder.name).join(', ')}
            </span>
          </div>
        )}

        {/* Expiring */}
        {summary.expiring.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.7rem', fontWeight: 600, color: '#f59e0b', minWidth: '110px' }}>
              🟡 Expiring ({summary.expiring.length})
            </span>
            <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>
              {summary.expiring.map(s => {
                const days = getDaysUntilDue(s.holder);
                return `${s.holder.name} — due ${formatDate(getNextDueDate(s.holder))} (${days} days)`;
              }).join('; ')}
            </span>
            <span style={{ fontSize: '0.6rem', fontWeight: 600, color: '#f59e0b', marginLeft: 'auto' }}>ACTION NEEDED</span>
          </div>
        )}

        {/* Overdue */}
        {summary.overdue.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.7rem', fontWeight: 600, color: '#ef4444', minWidth: '110px' }}>
              🔴 Overdue ({summary.overdue.length})
            </span>
            <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>
              {summary.overdue.map(s => {
                const days = getDaysOverdue(s.holder);
                return `${s.holder.name} — ${days} days overdue`;
              }).join('; ')}
            </span>
            <span style={{ fontSize: '0.6rem', fontWeight: 600, color: '#ef4444', marginLeft: 'auto' }}>ESCALATED</span>
          </div>
        )}
      </div>

      {/* Alert if overdue exists */}
      {summary.overdue.length > 0 && (
        <div style={{ background: 'rgba(239,68,68,0.08)', borderRadius: '8px', padding: '12px 16px', border: '1px solid rgba(239,68,68,0.2)', marginBottom: '16px' }}>
          <div style={{ fontSize: '0.72rem', color: '#ef4444', fontWeight: 600 }}>
            ⚠️ ALERT: {summary.overdue.length} overdue attestation{summary.overdue.length > 1 ? 's' : ''}.{' '}
            {summary.overdue.map(s => `${s.holder.role} has not re-attested`).join('. ')}.
          </div>
          <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '4px' }}>
            Escalation sent to CRO. Remediation in progress.
          </div>
        </div>
      )}

      {/* s166 Readiness */}
      <div style={{ background: 'var(--bg-card)', borderRadius: '10px', padding: '14px 16px', border: '1px solid var(--border)' }}>
        <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>
          s166 READINESS
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', fontSize: '0.65rem', color: '#10b981' }}>
          <span>✓ Named individuals</span>
          <span>✓ Signed attestations</span>
          <span>✓ Clear accountability chain</span>
          <span>✓ Evidence exportable</span>
        </div>
        <div style={{ marginTop: '8px', fontSize: '0.68rem', color: 'var(--text-secondary)' }}>
          Status: <strong style={{ color: summary.overdue.length > 0 ? '#f59e0b' : '#10b981' }}>
            {summary.overdue.length > 0 ? `READY (with ${summary.overdue.length} remediation item${summary.overdue.length > 1 ? 's' : ''})` : 'FULLY COMPLIANT'}
          </strong>
        </div>
      </div>
    </div>
  );
}
