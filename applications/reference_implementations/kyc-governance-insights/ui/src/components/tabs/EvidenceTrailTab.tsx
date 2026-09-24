import React, { useState, useMemo } from 'react';
import { evidenceTrailData, type EvidenceEntry } from '../../data/evidenceTrailData';
import EvidencePackViewer from '../audit/EvidencePackViewer';
import AccountabilityChain from '../accountability/AccountabilityChain';
import AttestationTracker from '../accountability/AttestationTracker';
import DecisionAttribution from '../accountability/DecisionAttribution';
import SectionDescription from '../shared/SectionDescription';

type FilterType = 'all' | EvidenceEntry['type'];

const typeColors: Record<EvidenceEntry['type'], { bg: string; color: string; label: string }> = {
  decision: { bg: 'rgba(59,130,246,0.12)', color: '#3b82f6', label: 'Decision' },
  policy_change: { bg: 'rgba(139,92,246,0.12)', color: '#8b5cf6', label: 'Policy' },
  intervention: { bg: 'rgba(245,158,11,0.12)', color: '#f59e0b', label: 'Intervention' },
  audit: { bg: 'rgba(16,185,129,0.12)', color: '#10b981', label: 'Audit' },
  qa_review: { bg: 'rgba(236,72,153,0.12)', color: '#ec4899', label: 'QA' },
  alert: { bg: 'rgba(239,68,68,0.12)', color: '#ef4444', label: 'Alert' },
};

function EntryRow({ entry }: { entry: EvidenceEntry }) {
  const tc = typeColors[entry.type];
  const time = new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  return (
    <div style={{ display: 'flex', gap: '12px', padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '60px' }}>
        <span style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)' }}>{time}</span>
        <span style={{ fontSize: '0.6rem', padding: '2px 6px', borderRadius: '4px', background: tc.bg, color: tc.color, fontWeight: 600, marginTop: '4px' }}>{tc.label}</span>
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>{entry.title}</div>
        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Agent: {entry.agent}</div>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', fontSize: '0.65rem', color: 'var(--text-secondary)' }}>
          {Object.entries(entry.details).map(([k, v]) => (
            <span key={k}>{k}: <strong>{String(v)}</strong></span>
          ))}
        </div>
        {entry.actions.length > 0 && (
          <div style={{ marginTop: '6px', display: 'flex', gap: '8px' }}>
            {entry.actions.map(a => (
              <button key={a} style={{ fontSize: '0.6rem', padding: '2px 8px', borderRadius: '4px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--accent)', cursor: 'pointer' }}>
                {a.replace(/_/g, ' ')}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export const EvidenceTrailTab: React.FC = () => {
  const [filter, setFilter] = useState<FilterType>('all');
  const [showPack, setShowPack] = useState(false);

  const filtered = useMemo(() =>
    filter === 'all' ? evidenceTrailData : evidenceTrailData.filter(e => e.type === filter),
  [filter]);

  return (
    <div data-testid="overview.evidence-trail" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Evidence Trail</h2>
        <div style={{ display: 'flex', gap: '8px' }}>
          <select value={filter} onChange={(e) => setFilter(e.target.value as FilterType)}
            style={{ fontSize: '0.75rem', padding: '4px 8px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}>
            <option value="all">All Events ({evidenceTrailData.length})</option>
            <option value="decision">Decisions</option>
            <option value="policy_change">Policy Changes</option>
            <option value="intervention">Interventions</option>
            <option value="audit">Audits</option>
            <option value="qa_review">QA Reviews</option>
            <option value="alert">Alerts</option>
          </select>
          <button onClick={() => setShowPack(!showPack)} style={{ fontSize: '0.7rem', padding: '4px 12px', borderRadius: '6px', border: '1px solid var(--border)', background: showPack ? 'rgba(59,130,246,0.15)' : 'var(--bg-secondary)', color: showPack ? 'var(--accent)' : 'var(--text-primary)', cursor: 'pointer', fontWeight: 600 }}>
            {'\uD83D\uDCE6'} Evidence Pack
          </button>
          <button style={{ fontSize: '0.7rem', padding: '4px 12px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-muted)', cursor: 'pointer' }}>
            Export PDF
          </button>
        </div>
      </div>
      <SectionDescription text="Immutable evidence packs generated per decision — completeness scored, regulator-ready." />

      {/* Evidence Pack Viewer */}
      {showPack && <EvidencePackViewer />}

      {/* Timeline */}
      <div style={{ background: 'var(--bg-card)', borderRadius: '12px', overflow: 'hidden' }}>
        {filtered.map(entry => <EntryRow key={entry.id} entry={entry} />)}
        {filtered.length === 0 && (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>No events match this filter</div>
        )}
      </div>

      {/* SM&CR Accountability — Compliance persona sections */}
      <div data-testid="compliance.smcr-map">
        <AccountabilityChain />
      </div>
      <div data-testid="compliance.smcr-attestations">
        <AttestationTracker />
      </div>
      <DecisionAttribution />
    </div>
  );
};

export default EvidenceTrailTab;
