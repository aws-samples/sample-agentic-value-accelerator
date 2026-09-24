import React from 'react';
import { dataNodes, dataEdges, complianceNotes } from '../../data/dataFlowData';

export default function DataFlowMap() {
  return (
    <div style={{ background: 'var(--bg-card)', borderRadius: '12px', padding: '16px' }}>
      <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 12px' }}>Data Flow & PII Map</h3>

      {/* Nodes */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '8px', marginBottom: '12px' }}>
        {dataNodes.map(node => (
          <div key={node.id} style={{ padding: '8px 10px', borderRadius: '6px', background: 'var(--bg-secondary)', fontSize: '0.7rem' }}>
            <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '2px' }}>{node.name}</div>
            <div style={{ fontSize: '0.6rem', color: '#10b981' }}>{'\uD83D\uDD12'} {node.encryption}</div>
            {node.piiFields.length > 0 && (
              <div style={{ fontSize: '0.55rem', color: '#f59e0b', marginTop: '2px' }}>PII: {node.piiFields.join(', ')}</div>
            )}
            <div style={{ fontSize: '0.5rem', color: 'var(--text-muted)', marginTop: '2px' }}>{node.residency}</div>
          </div>
        ))}
      </div>

      {/* Edges summary */}
      <div style={{ marginBottom: '12px' }}>
        <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>Data Edges</div>
        {dataEdges.map((e, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.6rem', padding: '3px 0', color: 'var(--text-secondary)' }}>
            <span>{dataNodes.find(n => n.id === e.from)?.name}</span>
            <span style={{ color: 'var(--text-muted)' }}>{'\u2192'}</span>
            <span>{dataNodes.find(n => n.id === e.to)?.name}</span>
            <span style={{ color: '#10b981', marginLeft: 'auto' }}>{e.encryption}</span>
            {e.crossesBoundary && <span style={{ fontSize: '0.5rem', padding: '1px 4px', borderRadius: '3px', background: 'rgba(245,158,11,0.1)', color: '#f59e0b' }}>boundary</span>}
          </div>
        ))}
      </div>

      {/* Compliance notes */}
      <div style={{ padding: '10px', borderRadius: '6px', background: 'var(--bg-secondary)', fontSize: '0.6rem', color: 'var(--text-muted)' }}>
        <div style={{ fontWeight: 600, marginBottom: '4px', color: 'var(--text-secondary)' }}>Compliance Mapping</div>
        {complianceNotes.gdpr.map((n, i) => <div key={i}>{'\u2022'} GDPR {n}</div>)}
        {complianceNotes.dpa2018.map((n, i) => <div key={i}>{'\u2022'} UK DPA {n}</div>)}
        <div>{'\u2022'} Data Residency: {complianceNotes.residency}</div>
      </div>
    </div>
  );
}
