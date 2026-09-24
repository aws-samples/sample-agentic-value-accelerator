import React, { useState } from 'react';
import { sampleEvidencePack, type EvidenceSection } from '../../data/evidencePackData';

function SectionRow({ section }: { section: EvidenceSection }) {
  const [open, setOpen] = useState(false);
  const icon = section.status === 'complete' ? '\u2705' : section.status === 'partial' ? '\u26A0\uFE0F' : '\u274C';
  return (
    <div style={{ borderBottom: '1px solid var(--border)' }}>
      <button onClick={() => setOpen(!open)} style={{ width: '100%', padding: '10px 12px', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)', textAlign: 'left' }}>
        <span>{icon}</span>
        <span style={{ flex: 1, fontSize: '0.8rem', fontWeight: 600 }}>{section.title}</span>
        <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{section.regulatoryRef}</span>
        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{open ? '\u25BE' : '\u25B8'}</span>
      </button>
      {open && (
        <div style={{ padding: '0 12px 12px 36px' }}>
          {section.items.map((item, i) => (
            <div key={i} style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', padding: '2px 0', lineHeight: 1.5 }}>{item}</div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function EvidencePackViewer() {
  const pack = sampleEvidencePack;
  const pct = pack.completenessScore;
  const color = pct >= 95 ? '#10b981' : pct >= 85 ? '#f59e0b' : '#ef4444';

  const handleDownloadJSON = () => {
    const blob = new Blob([JSON.stringify(pack, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${pack.id}.json`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ background: 'var(--bg-card)', borderRadius: '12px', padding: '20px', marginTop: '1rem' }}>
      {/* Header */}
      <div style={{ marginBottom: '12px' }}>
        <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)' }}>{'\uD83D\uDCE6'} Evidence Pack: {pack.id}</div>
        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '4px' }}>{pack.scope}</div>
        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Senior Manager: {pack.seniorManager}</div>
      </div>

      {/* Completeness bar */}
      <div style={{ marginBottom: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Completeness</span>
          <span style={{ fontSize: '0.7rem', fontWeight: 600, color }}>{pct}%</span>
        </div>
        <div style={{ height: '6px', borderRadius: '3px', background: 'var(--bg-secondary)', overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', borderRadius: '3px', background: color }} />
        </div>
        {pack.missingItems.length > 0 && (
          <div style={{ fontSize: '0.65rem', color: '#f59e0b', marginTop: '4px' }}>
            {'\u26A0\uFE0F'} {pack.missingItems.length} items missing
          </div>
        )}
      </div>

      {/* Sections */}
      <div style={{ borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border)' }}>
        {pack.sections.map(s => <SectionRow key={s.id} section={s} />)}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
        <button onClick={handleDownloadJSON} style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '0.7rem', fontWeight: 600, cursor: 'pointer' }}>
          {'\uD83D\uDCE5'} Download JSON
        </button>
        <button style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-muted)', fontSize: '0.7rem', fontWeight: 600, cursor: 'pointer' }}>
          {'\uD83D\uDCC4'} Download PDF (stub)
        </button>
      </div>
    </div>
  );
}
