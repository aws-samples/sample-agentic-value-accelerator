import { useState, useEffect, useRef } from 'react';
import { AGENT_PROGRESS_MESSAGES, type ProgressMessage } from '../../data/agentProgressMessages';

interface LiveActivityFeedProps {
  isActive: boolean; // true while polling/loading AND after success (persists)
}

const AGENT_COLORS: Record<string, string> = {
  'Orchestrator': '#64b5f6',
  'AgentCore': '#64b5f6',
  'Credit Analyst': '#81c784',
  'Compliance Officer': '#ce93d8',
  'Lambda Validator': '#ffb74d',
  'LLM-as-Judge': '#4fc3f7',
  'Synthesizer': '#fff176',
  'Policy Engine': '#ef5350',
  'System': '#90a4ae',
};

export default function LiveActivityFeed({ isActive }: LiveActivityFeedProps) {
  const [visibleMessages, setVisibleMessages] = useState<ProgressMessage[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const startTime = useRef(Date.now());
  const scrollRef = useRef<HTMLDivElement>(null);

  // Timer to track elapsed seconds
  useEffect(() => {
    if (!isActive) return;

    // Only reset if we're starting fresh (no messages visible yet)
    if (visibleMessages.length === 0) {
      startTime.current = Date.now();
      setElapsed(0);
    }

    const interval = setInterval(() => {
      const secs = Math.floor((Date.now() - startTime.current) / 1000);
      setElapsed(secs);
    }, 1000);

    return () => clearInterval(interval);
  }, [isActive, visibleMessages.length]);

  // Reveal messages based on elapsed time
  useEffect(() => {
    if (!isActive) return;
    const newMessages = AGENT_PROGRESS_MESSAGES.filter(m => m.delay <= elapsed);
    if (newMessages.length !== visibleMessages.length) {
      setVisibleMessages(newMessages);
    }
  }, [elapsed, isActive, visibleMessages.length]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [visibleMessages.length]);

  if (!isActive) return null;

  const formatTime = (secs: number): string => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  return (
    <div
      style={{
        background: '#1a1a2e',
        borderRadius: '10px',
        padding: '14px',
        marginBottom: '16px',
        fontFamily: 'var(--font-mono)',
        fontSize: '11px',
        maxHeight: '220px',
        overflowY: 'auto',
      }}
      ref={scrollRef}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '10px',
          paddingBottom: '8px',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: visibleMessages.length >= AGENT_PROGRESS_MESSAGES.length ? '#4caf50' : '#4caf50',
              animation: visibleMessages.length >= AGENT_PROGRESS_MESSAGES.length ? 'none' : 'pulse-dot 1.5s ease-in-out infinite',
            }}
          />
          <span style={{ color: '#90a4ae', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            {visibleMessages.length >= AGENT_PROGRESS_MESSAGES.length ? 'Agent Activity — Complete' : 'Live Agent Activity'}
          </span>
        </div>
        <span style={{ color: '#64748b', fontSize: '10px', fontVariantNumeric: 'tabular-nums' }}>
          {formatTime(elapsed)}
        </span>
      </div>

      {/* Messages */}
      {visibleMessages.map((msg, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            gap: '8px',
            padding: '3px 0',
            animation: 'fadeIn 0.3s ease-out',
            opacity: i === visibleMessages.length - 1 ? 1 : 0.7,
          }}
        >
          <span style={{ color: '#546e7a', minWidth: '38px', flexShrink: 0 }}>
            [{formatTime(msg.delay)}]
          </span>
          <span
            style={{
              color: AGENT_COLORS[msg.agent] || '#90a4ae',
              minWidth: '130px',
              flexShrink: 0,
              fontWeight: 600,
            }}
          >
            {msg.agent}
          </span>
          <span style={{ color: '#e0e0e0' }}>
            {msg.message}
          </span>
        </div>
      ))}

      {/* Blinking cursor or completion indicator */}
      {visibleMessages.length < AGENT_PROGRESS_MESSAGES.length ? (
        <div style={{ padding: '3px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ color: '#546e7a', minWidth: '38px' }}>[{formatTime(elapsed)}]</span>
          <span
            style={{
              display: 'inline-block',
              width: '6px',
              height: '14px',
              background: 'var(--accent)',
              animation: 'blink 1s step-end infinite',
            }}
          />
        </div>
      ) : (
        <div style={{ padding: '6px 0', marginTop: '6px', borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ color: '#4caf50', fontSize: '12px' }}>✓</span>
          <span style={{ color: '#4caf50', fontSize: '10px', fontWeight: 600 }}>
            Assessment complete — {formatTime(elapsed)} total processing
          </span>
        </div>
      )}

      <style>{`
        @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
        @keyframes pulse-dot { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}
