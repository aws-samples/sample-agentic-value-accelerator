import React from 'react';
import {
  accountabilityHolders,
  computeAttestationStatus,
  getNextDueDate,
  getDaysOverdue,
  getDaysUntilDue,
  type AttestationStatus,
} from '../../data/accountabilityData';

const statusConfig: Record<AttestationStatus, { icon: string; color: string; bg: string; label: string }> = {
  current: { icon: '🟢', color: '#10b981', bg: 'rgba(16,185,129,0.1)', label: 'Current' },
  expiring: { icon: '🟡', color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', label: 'Expiring' },
  overdue: { icon: '🔴', color: '#ef4444', bg: 'rgba(239,68,68,0.1)', label: 'Overdue' },
};

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function AttestationTracker() {
  return (
    <div style={{ background: 'var(--bg-secondary)', borderRadius: '12px', padding: '24px' }}>
      <div style={{ marginBottom: '16px' }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
          Attestation Tracker
        </h3>
        <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', margin: '4px 0 0' }}>
          SM&CR attestation status for all SMF holders with AI accountability
        </p>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.72rem' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--border)' }}>
              {['SMF Holder', 'Role', 'SMF Function', 'AI Systems Owned', 'Last Attestation', 'Next Due', 'Status', 'Statement Ref', 'Actions'].map(h => (
                <th key={h} style={{ padding: '10px 8px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {accountabilityHolders.map(holder => {
              const status = computeAttestationStatus(holder);
              const cfg = statusConfig[status];
              const nextDue = getNextDueDate(holder);
              const daysInfo = status === 'overdue'
                ? `${getDaysOverdue(holder)} days overdue`
                : status === 'expiring'
                ? `${getDaysUntilDue(holder)} days remaining`
                : '';

              return (
                <tr key={holder.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '12px 8px', fontWeight: 600, color: 'var(--text-primary)' }}>
                    {holder.name}
                  </td>
                  <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>
                    {holder.role}
                  </td>
                  <td style={{ padding: '12px 8px' }}>
                    <span style={{ padding: '2px 8px', borderRadius: '4px', background: 'rgba(59,130,246,0.1)', color: '#3b82f6', fontWeight: 600, fontSize: '0.65rem' }}>
                      {holder.smfFunction}
                    </span>
                  </td>
                  <td style={{ padding: '12px 8px', color: 'var(--text-secondary)', maxWidth: '180px' }}>
                    {holder.aiSystems.join(', ')}
                  </td>
                  <td style={{ padding: '12px 8px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                    {formatDate(holder.lastAttestation)}
                  </td>
                  <td style={{ padding: '12px 8px', color: cfg.color, fontWeight: 600, whiteSpace: 'nowrap' }}>
                    {formatDate(nextDue)}
                    {daysInfo && (
                      <div style={{ fontSize: '0.6rem', fontWeight: 400, marginTop: '2px' }}>{daysInfo}</div>
                    )}
                  </td>
                  <td style={{ padding: '12px 8px' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '3px 8px', borderRadius: '6px', background: cfg.bg, color: cfg.color, fontWeight: 600, fontSize: '0.65rem' }}>
                      {cfg.icon} {cfg.label}
                    </span>
                  </td>
                  <td style={{ padding: '12px 8px' }}>
                    <span style={{ color: 'var(--accent)', cursor: 'pointer', textDecoration: 'underline', fontSize: '0.68rem' }}>
                      {holder.statementRef}
                    </span>
                  </td>
                  <td style={{ padding: '12px 8px' }}>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button style={{ fontSize: '0.6rem', padding: '3px 8px', borderRadius: '4px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--accent)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                        View Statement
                      </button>
                      {status !== 'current' && (
                        <button style={{ fontSize: '0.6rem', padding: '3px 8px', borderRadius: '4px', border: '1px solid var(--border)', background: status === 'overdue' ? 'rgba(239,68,68,0.1)' : 'transparent', color: status === 'overdue' ? '#ef4444' : 'var(--accent)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                          {status === 'overdue' ? 'Send Reminder' : 'Start Re-attestation'}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Evidence count footer */}
      <div style={{ marginTop: '12px', display: 'flex', gap: '16px', fontSize: '0.65rem', color: 'var(--text-muted)' }}>
        <span>Total evidence items: {accountabilityHolders.reduce((sum, h) => sum + h.reasonableStepsEvidence.trainingCompleted.length + h.reasonableStepsEvidence.signOffsGiven + h.reasonableStepsEvidence.oversightMeetings, 0)}</span>
        <span>|</span>
        <span>Attestation cadence: 6 months</span>
      </div>
    </div>
  );
}
