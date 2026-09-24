import React, { useState } from 'react';
import {
  decisionAttributions,
  accountabilityHolders,
  type DecisionAttribution as DecisionAttributionType,
} from '../../data/accountabilityData';

function getHolderName(id: string): string {
  const holder = accountabilityHolders.find(h => h.id === id);
  return holder ? `${holder.name}, ${holder.role} (${holder.smfFunction})` : id;
}

function ChainStep({ label, value, isLast = false }: { label: string; value: string; isLast?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '20px' }}>
        <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: 'var(--accent)', border: '2px solid var(--accent)' }} />
        {!isLast && <div style={{ width: '2px', height: '24px', background: 'var(--border)' }} />}
      </div>
      <div style={{ paddingBottom: isLast ? 0 : '8px' }}>
        <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 600 }}>{label}</div>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-primary)' }}>{value}</div>
      </div>
    </div>
  );
}

function AttributionCard({ attribution }: { attribution: DecisionAttributionType }) {
  const [expanded, setExpanded] = useState(false);
  const decisionColor = attribution.decision === 'APPROVE' ? '#10b981' : attribution.decision === 'REJECT' ? '#ef4444' : '#f59e0b';

  return (
    <div style={{ background: 'var(--bg-card)', borderRadius: '10px', border: '1px solid var(--border)', overflow: 'hidden' }}>
      {/* Header */}
      <div
        onClick={() => setExpanded(!expanded)}
        style={{ padding: '16px 20px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            DECISION ATTRIBUTION — {attribution.decisionId}
          </span>
          <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
            ({attribution.customerName})
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '0.65rem', fontWeight: 600, padding: '3px 8px', borderRadius: '4px', background: `${decisionColor}15`, color: decisionColor }}>
            {attribution.decision}
          </span>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
            ▼
          </span>
        </div>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div style={{ padding: '0 20px 20px', borderTop: '1px solid var(--border)' }}>
          {/* Accountability Chain */}
          <div style={{ marginTop: '16px' }}>
            <ChainStep label="Agent Decision" value={attribution.agent} />
            <ChainStep label="Evaluator" value={attribution.evaluator} />
            <ChainStep label="Policy Gate" value={attribution.policyGate} />
            <ChainStep
              label="Human Override"
              value={attribution.humanOverride || 'Not triggered (auto-approve threshold met)'}
            />
            <ChainStep label="Technical Owner" value={getHolderName(attribution.technicalOwner)} />
            <ChainStep label="Accountable SMF" value={getHolderName(attribution.accountableSMF)} />
            <ChainStep label="Ultimate Owner" value={getHolderName(attribution.ultimateOwner)} isLast />
          </div>

          {/* Governance Framework */}
          <div style={{ marginTop: '16px', padding: '12px 16px', background: 'var(--bg-secondary)', borderRadius: '8px', fontSize: '0.7rem' }}>
            <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>Governance Framework</div>
            <div style={{ color: 'var(--text-secondary)' }}>
              {attribution.governanceFramework.policyName} {attribution.governanceFramework.version} (Board-approved {attribution.governanceFramework.approvalDate})
              → {attribution.governanceFramework.section}: {attribution.governanceFramework.description}
            </div>
          </div>

          {/* Regulatory Basis */}
          <div style={{ marginTop: '12px', padding: '12px 16px', background: 'var(--bg-secondary)', borderRadius: '8px', fontSize: '0.7rem' }}>
            <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>Regulatory Basis</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {attribution.regulatoryBasis.map((r, i) => (
                <span key={i} style={{ padding: '3px 8px', borderRadius: '4px', background: 'rgba(139,92,246,0.1)', color: '#8b5cf6', fontSize: '0.63rem' }}>
                  {r}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function DecisionAttribution() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={{ marginBottom: '8px' }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
          Decision Attribution
        </h3>
        <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', margin: '4px 0 0' }}>
          Full accountability chain from AI agent to named SMF holder for each traced decision
        </p>
      </div>

      {decisionAttributions.map(attr => (
        <AttributionCard key={attr.decisionId} attribution={attr} />
      ))}
    </div>
  );
}
