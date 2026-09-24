import React, { useState, useEffect } from 'react';

export interface AgentMessage {
  agent: 'credit-analyst' | 'compliance-officer' | 'supervisor';
  text: string;
}

const AGENT_CONFIG = {
  'credit-analyst': { name: 'Credit Analyst', color: '#60a5fa', icon: '📊' },
  'compliance-officer': { name: 'Compliance Officer', color: '#f59e0b', icon: '⚖️' },
  'supervisor': { name: 'Supervisor', color: '#a78bfa', icon: '👁️' },
};

interface Props {
  messages: AgentMessage[];
  step: number;
}

export default function AgentConversation({ messages, step }: Props) {
  const [visibleCount, setVisibleCount] = useState(0);

  useEffect(() => {
    setVisibleCount(0);
    const timers: ReturnType<typeof setTimeout>[] = [];
    messages.forEach((_, i) => {
      timers.push(setTimeout(() => setVisibleCount(i + 1), (i + 1) * 300));
    });
    return () => timers.forEach(clearTimeout);
  }, [step, messages]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {messages.slice(0, visibleCount).map((msg, i) => {
        const cfg = AGENT_CONFIG[msg.agent];
        return (
          <div key={`${step}-${i}`} style={{ borderLeft: `4px solid ${cfg.color}`, paddingLeft: '12px', opacity: 1, transform: 'translateY(0)', transition: 'opacity 0.2s ease-out, transform 0.2s ease-out' }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: cfg.color, marginBottom: '3px' }}>
              {cfg.icon} {cfg.name}
            </div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)', lineHeight: 1.5 }}>
              "{msg.text}"
            </div>
          </div>
        );
      })}
    </div>
  );
}
