import React, { useState } from 'react';
import { agents, edges, type AgentNode } from '../../data/agentConstellationData';
import { TEST_IDS } from '../../test-ids';

const positions: Record<string, { x: number; y: number }> = {
  orchestrator: { x: 250, y: 60 },
  'credit-analyst': { x: 120, y: 180 },
  'compliance-officer': { x: 380, y: 180 },
  governance: { x: 250, y: 180 },
  audit: { x: 120, y: 300 },
  'qa-research': { x: 380, y: 300 },
};

function AgentCircle({ agent, selected, onClick }: { agent: AgentNode; selected: boolean; onClick: () => void }) {
  const pos = positions[agent.id];
  if (!pos) return null;
  const statusColor = agent.status === 'active' ? '#10b981' : agent.status === 'idle' ? '#f59e0b' : '#ef4444';
  return (
    <g onClick={onClick} style={{ cursor: 'pointer' }} data-testid={TEST_IDS.constellation.node(agent.id)}>
      {/* Pulse ring */}
      <circle cx={pos.x} cy={pos.y} r="32" fill="none" stroke={statusColor} strokeWidth="2" opacity="0.3"
        style={{ animation: agent.status === 'active' ? 'pulse-live 2s ease-in-out infinite' : 'none' }} />
      {/* Main circle */}
      <circle cx={pos.x} cy={pos.y} r="26" fill="var(--bg-card)" stroke={agent.color} strokeWidth={selected ? 3 : 2} />
      {/* Health score */}
      <text x={pos.x} y={pos.y - 4} textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--text-primary)">{agent.healthScore}</text>
      {/* Name */}
      <text x={pos.x} y={pos.y + 10} textAnchor="middle" fontSize="7" fill="var(--text-muted)">{agent.name}</text>
      {/* Status dot */}
      <circle cx={pos.x + 20} cy={pos.y - 20} r="4" fill={statusColor} />
    </g>
  );
}

function DetailPanel({ agent, onClose }: { agent: AgentNode; onClose: () => void }) {
  return (
    <div data-testid={TEST_IDS.constellation.detail} style={{ background: 'var(--bg-card)', borderRadius: '10px', padding: '16px', border: `2px solid ${agent.color}`, marginTop: '12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <span style={{ fontSize: '0.9rem', fontWeight: 700, color: agent.color }}>{agent.name}</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '14px' }}>✕</button>
      </div>
      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '8px', fontStyle: 'italic' }}>{agent.role}</div>
      <div style={{ fontSize: '0.8rem', color: 'var(--text-primary)', marginBottom: '12px', lineHeight: 1.5 }}>{agent.description}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', fontSize: '0.7rem' }}>
        <div><div style={{ color: 'var(--text-muted)' }}>Health</div><div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{agent.healthScore}%</div></div>
        <div><div style={{ color: 'var(--text-muted)' }}>Decisions</div><div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{agent.decisionsHandled.toLocaleString()}</div></div>
        <div><div style={{ color: 'var(--text-muted)' }}>Cedar Policies</div><div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{agent.cedarPolicies}</div></div>
        <div><div style={{ color: 'var(--text-muted)' }}>Autonomy</div><div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>L{agent.autonomyLevel}</div></div>
      </div>
    </div>
  );
}

export default function AgentConstellation() {
  const [selected, setSelected] = useState<string | null>(null);
  const selectedAgent = agents.find(a => a.id === selected);

  return (
    <div>
      <svg viewBox="0 0 500 360" style={{ width: '100%', maxWidth: '500px', margin: '0 auto', display: 'block' }}>
        {/* Edges */}
        {edges.map((e, i) => {
          const from = positions[e.from];
          const to = positions[e.to];
          if (!from || !to) return null;
          return (
            <line key={i} x1={from.x} y1={from.y} x2={to.x} y2={to.y}
              stroke={e.active ? 'var(--accent)' : 'var(--border)'}
              strokeWidth={e.active ? 1.5 : 1}
              strokeDasharray={e.active ? '6 3' : '4 4'}
              opacity={e.active ? 0.7 : 0.3}
            />
          );
        })}
        {/* Agent nodes */}
        {agents.map(a => (
          <AgentCircle key={a.id} agent={a} selected={selected === a.id} onClick={() => setSelected(selected === a.id ? null : a.id)} />
        ))}
      </svg>

      {/* Detail panel — shown when a node is clicked */}
      {selectedAgent && <DetailPanel agent={selectedAgent} onClose={() => setSelected(null)} />}
    </div>
  );
}
