import React, { useState } from 'react';
import { defenceLayers, type DefenceLayer } from '../../data/defenceInDepthData';

function LayerCard({ layer, expanded, onToggle }: { layer: DefenceLayer; expanded: boolean; onToggle: () => void }) {
  return (
    <div style={{ background: `${layer.color}20`, borderRadius: '8px', padding: expanded ? '12px' : '10px 12px', border: `1px solid ${layer.color}40`, transition: 'all 0.2s', cursor: 'pointer' }} onClick={onToggle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)' }}>{expanded ? '\u25BC' : '\u25B6'} {layer.name}</span>
        <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>{layer.controlCount} controls</span>
      </div>
      <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '2px' }}>{layer.description}</div>
      {expanded && (
        <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {layer.components.map((c, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 8px', borderRadius: '4px', background: 'var(--bg-card)', fontSize: '0.65rem' }}>
              <span style={{ color: '#10b981', fontWeight: 600 }}>{'\u2713'}</span>
              <span style={{ color: 'var(--text-primary)', fontWeight: 500, minWidth: '100px' }}>{c.name}</span>
              <span style={{ color: 'var(--text-muted)', flex: 1 }}>{c.role}</span>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.55rem' }}>{c.config}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function DefenceInDepthLayers() {
  const [expanded, setExpanded] = useState<string | null>('runtime');

  return (
    <div style={{ background: 'var(--bg-card)', borderRadius: '12px', padding: '16px' }}>
      <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px' }}>Defence in Depth (5 Layers)</h3>
      <p style={{ fontSize: '0.65rem', color: 'var(--text-muted)', margin: '0 0 12px' }}>Each layer must be independently breached — compromise of one does not grant access to inner layers</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {defenceLayers.map(l => (
          <LayerCard key={l.id} layer={l} expanded={expanded === l.id} onToggle={() => setExpanded(expanded === l.id ? null : l.id)} />
        ))}
      </div>
    </div>
  );
}
