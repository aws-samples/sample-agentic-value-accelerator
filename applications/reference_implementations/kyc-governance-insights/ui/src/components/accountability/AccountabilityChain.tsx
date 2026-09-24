import React, { useState } from 'react';
import {
  accountabilityHolders,
  computeAttestationStatus,
  type AccountabilityHolder,
  type AttestationStatus,
} from '../../data/accountabilityData';

const statusConfig: Record<AttestationStatus, { icon: string; color: string; label: string }> = {
  current: { icon: '🟢', color: '#10b981', label: 'Current' },
  expiring: { icon: '🟡', color: '#f59e0b', label: 'Expiring' },
  overdue: { icon: '🔴', color: '#ef4444', label: 'Overdue' },
};

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function HolderNode({ holder, depth = 0, expanded, onToggle }: {
  holder: AccountabilityHolder;
  depth?: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  const status = computeAttestationStatus(holder);
  const cfg = statusConfig[status];
  const children = accountabilityHolders.filter(h => h.reportsTo === holder.id);

  return (
    <div style={{ marginLeft: depth * 40, marginTop: depth === 0 ? 0 : 16 }}>
      <div
        onClick={onToggle}
        style={{
          background: 'var(--bg-card)',
          border: `1px solid ${expanded ? cfg.color : 'var(--border)'}`,
          borderRadius: '10px',
          padding: '16px 20px',
          cursor: 'pointer',
          transition: 'all 0.2s ease',
          boxShadow: expanded ? `0 0 12px ${cfg.color}33` : 'none',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              {holder.name} — {holder.role} ({holder.smfFunction})
            </div>
            {holder.quote && (
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontStyle: 'italic', marginTop: '4px' }}>
                "{holder.quote}"
              </div>
            )}
            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '6px' }}>
              Systems: {holder.aiSystems.join(', ')}
            </div>
            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '2px' }}>
              Attested: {formatDate(holder.lastAttestation)}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>{cfg.icon}</span>
            <span style={{ fontSize: '0.65rem', fontWeight: 600, color: cfg.color }}>{cfg.label}</span>
          </div>
        </div>

        {/* Expanded: show reasonable steps evidence */}
        {expanded && (
          <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--border)' }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>
              Reasonable Steps Evidence
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', fontSize: '0.65rem' }}>
              <div>
                <div style={{ color: 'var(--text-muted)', marginBottom: '4px' }}>Training Completed</div>
                {holder.reasonableStepsEvidence.trainingCompleted.map((t, i) => (
                  <div key={i} style={{ color: 'var(--text-secondary)', marginBottom: '2px' }}>• {t}</div>
                ))}
              </div>
              <div>
                <div style={{ color: 'var(--text-muted)', marginBottom: '4px' }}>Oversight Meetings (6mo)</div>
                <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  {holder.reasonableStepsEvidence.oversightMeetings}
                </div>
                <div style={{ color: 'var(--text-muted)', marginTop: '8px' }}>Last Oversight</div>
                <div style={{ color: 'var(--text-secondary)' }}>{formatDate(holder.reasonableStepsEvidence.lastOversightDate)}</div>
              </div>
              <div>
                <div style={{ color: 'var(--text-muted)', marginBottom: '4px' }}>Sign-offs Given</div>
                <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  {holder.reasonableStepsEvidence.signOffsGiven}
                </div>
                <div style={{ color: 'var(--text-muted)', marginTop: '8px' }}>Statement Ref</div>
                <div style={{ color: 'var(--accent)' }}>{holder.statementRef}</div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Connector line */}
      {children.length > 0 && (
        <div style={{ marginLeft: '30px', borderLeft: '2px solid var(--border)', height: '16px' }} />
      )}

      {/* Children */}
      {children.map(child => (
        <HolderNode
          key={child.id}
          holder={child}
          depth={depth + 1}
          expanded={expanded}
          onToggle={onToggle}
        />
      ))}
    </div>
  );
}

export default function AccountabilityChain() {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const rootHolders = accountabilityHolders.filter(h => h.reportsTo === null);

  return (
    <div style={{ background: 'var(--bg-secondary)', borderRadius: '12px', padding: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
            SM&CR Accountability Chain — KYC AI Agent
          </h3>
          <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', margin: '4px 0 0' }}>
            Named individuals accountable under FCA Senior Managers & Certification Regime
          </p>
        </div>
      </div>

      {rootHolders.map(holder => (
        <HolderNode
          key={holder.id}
          holder={holder}
          expanded={expandedId === holder.id}
          onToggle={() => setExpandedId(expandedId === holder.id ? null : holder.id)}
        />
      ))}
    </div>
  );
}
