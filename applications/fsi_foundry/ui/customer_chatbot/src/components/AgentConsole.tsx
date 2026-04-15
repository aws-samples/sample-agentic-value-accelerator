// @ts-nocheck
import { useState, useEffect } from 'react';
import type { RuntimeConfig } from '../config';
import type { ChatResponse, ExecutionStatus } from '../types';
import { invokeAgent } from '../api/client';
import ResultsPanel from './ResultsPanel';

const intentIcons: Record<string, string> = {
  full: '\uD83D\uDD04',
  general: '\uD83D\uDCAC',
  account_inquiry: '\uD83C\uDFE6',
  transfer: '\uD83D\uDCB8',
  bill_payment: '\uD83D\uDCCB',
  transaction_history: '\uD83D\uDCCA',
};

const intentDescriptions: Record<string, string> = {
  full: 'Complete end-to-end conversation',
  general: 'General banking questions',
  account_inquiry: 'Balances, statements, profile',
  transfer: 'Send money between accounts',
  bill_payment: 'Pay bills and invoices',
  transaction_history: 'View recent activity',
};

/* ---- Typing Dots ---- */

function TypingDots({ color }: { color: string }) {
  return (
    <div className="flex items-center gap-1">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="w-1.5 h-1.5 rounded-full"
          style={{
            background: color,
            animation: `typingDots 1.4s ${i * 0.2}s ease-in-out infinite`,
          }}
        />
      ))}
    </div>
  );
}

/* ---- Agent Processing Card ---- */

function AgentProcessCard({ name, index, elapsed, agentId }: { name: string; index: number; elapsed: number; agentId: string }) {
  const stageMap: Record<string, string[]> = {
    conversation_manager: ['Receiving message', 'Analyzing intent', 'Classifying request', 'Routing to specialists'],
    account_agent: ['Queued', 'Pulling account data', 'Checking balances', 'Preparing response'],
    transaction_agent: ['Queued', 'Loading transaction history', 'Processing request', 'Confirming action'],
  };
  const colorMap: Record<string, string> = {
    conversation_manager: 'var(--sage)',
    account_agent: 'var(--coral)',
    transaction_agent: 'var(--warm-gray)',
  };

  const stages = stageMap[agentId] || stageMap.conversation_manager;
  const color = colorMap[agentId] || 'var(--sage)';
  const agentElapsed = elapsed - index * 3;
  const stageIndex = Math.min(Math.floor(Math.max(agentElapsed, 0) / 8), stages.length - 1);
  const currentStage = agentElapsed > 0 ? stages[stageIndex] : 'Waiting...';
  const isActive = agentElapsed > 0;

  return (
    <div
      className="flex items-center gap-4 animate-slide-left"
      style={{ animationDelay: `${index * 0.15}s` }}
    >
      {/* Agent avatar */}
      <div
        className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
        style={{
          background: isActive ? `${color}15` : 'rgba(120,113,108,0.06)',
          border: `1.5px solid ${isActive ? `${color}30` : '#E7E5E4'}`,
          transition: 'all 0.5s ease',
        }}
      >
        {isActive ? (
          <svg className="w-4 h-4 animate-spin" style={{ color }} fill="none" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" strokeDasharray="31.4 31.4" strokeLinecap="round" />
          </svg>
        ) : (
          <div className="w-2 h-2 rounded-full" style={{ background: 'var(--text-muted)' }} />
        )}
      </div>

      {/* Chat bubble for agent status */}
      <div
        className="chat-bubble chat-bubble--bot flex-1"
        style={{
          padding: '0.625rem 0.875rem',
          maxWidth: 'none',
          animation: 'none',
          opacity: 1,
          background: isActive
            ? `linear-gradient(135deg, ${color}08, ${color}04)`
            : 'rgba(120,113,108,0.03)',
          borderColor: isActive ? `${color}20` : '#E7E5E4',
        }}
      >
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold" style={{ color: isActive ? color : 'var(--text-muted)' }}>{name}</div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs" style={{ color: isActive ? 'var(--text-secondary)' : 'var(--text-muted)' }}>
                {currentStage}
              </span>
              {isActive && <TypingDots color={color} />}
            </div>
          </div>
          <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
            {agentElapsed > 0 ? `${agentElapsed}s` : '--'}
          </span>
        </div>
      </div>
    </div>
  );
}

/* ============================================
   MAIN COMPONENT
   ============================================ */

export default function AgentConsole({ config }: { config: RuntimeConfig }) {
  const { input_schema } = config;

  const [entityId, setEntityId] = useState('');
  const [selectedType, setSelectedType] = useState(input_schema.type_options[0].value);
  const [additionalContext, setAdditionalContext] = useState('');
  const [status, setStatus] = useState<ExecutionStatus>('idle');
  const [response, setResponse] = useState<ChatResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (status !== 'running') return;
    const interval = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(interval);
  }, [status]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!entityId.trim()) return;

    setStatus('running');
    setResponse(null);
    setError(null);
    setElapsed(0);

    try {
      const payload: Record<string, string> = {
        [input_schema.id_field]: entityId.trim(),
        [input_schema.type_field]: selectedType,
      };
      if (additionalContext.trim()) {
        payload.additional_context = additionalContext.trim();
      }

      const result = await invokeAgent(config, payload);
      setResponse(result);
      setStatus('complete');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
      setStatus('error');
    }
  };

  const fillTestData = (id: string) => {
    setEntityId(id);
    setSelectedType('full');
  };

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="mb-8 animate-fade-slide-up">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-2xl flex items-center justify-center"
            style={{
              background: 'linear-gradient(135deg, rgba(101,163,13,0.1), rgba(132,204,22,0.06))',
              border: '1px solid rgba(101,163,13,0.15)',
            }}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="var(--sage)" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" />
            </svg>
          </div>
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Chat Console</h1>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Start a conversation with our AI banking agents
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ---- INPUT PANEL ---- */}
        <div className="lg:col-span-1 animate-fade-slide-up stagger-1">
          <div className="card sticky top-24">
            <div className="flex items-center gap-2 mb-6">
              <div
                className="w-2 h-2 rounded-full"
                style={{
                  background: status === 'running' ? 'var(--sage)' : 'var(--text-muted)',
                  boxShadow: status === 'running' ? '0 0 6px rgba(101,163,13,0.4)' : 'none',
                  animation: status === 'running' ? 'gentleBounce 1s infinite' : 'none',
                }}
              />
              <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>New Conversation</h2>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Customer ID */}
              <div>
                <label className="label">{input_schema.id_label}</label>
                <input
                  type="text"
                  value={entityId}
                  onChange={(e) => setEntityId(e.target.value)}
                  placeholder={input_schema.id_placeholder}
                  className="input-field"
                  disabled={status === 'running'}
                />
              </div>

              {/* Intent type as selectable pill cards */}
              <div>
                <label className="label">Intent Type</label>
                <div className="space-y-2">
                  {input_schema.type_options.map((opt) => (
                    <div
                      key={opt.value}
                      className={`intent-card ${selectedType === opt.value ? 'selected' : ''}`}
                      onClick={() => status !== 'running' && setSelectedType(opt.value)}
                    >
                      <span className="text-lg">{intentIcons[opt.value] || '\uD83D\uDCCB'}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{opt.label}</div>
                        <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{intentDescriptions[opt.value] || ''}</div>
                      </div>
                      {selectedType === opt.value && (
                        <div
                          className="w-5 h-5 rounded-full flex items-center justify-center shrink-0"
                          style={{ background: 'rgba(101,163,13,0.1)', border: '1.5px solid var(--sage)' }}
                        >
                          <svg className="w-3 h-3" style={{ color: 'var(--sage)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                          </svg>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Message */}
              <div>
                <label className="label">Message <span style={{ color: 'var(--text-muted)' }}>(optional)</span></label>
                <textarea
                  value={additionalContext}
                  onChange={(e) => setAdditionalContext(e.target.value)}
                  placeholder="Type your message here..."
                  rows={3}
                  className="input-field resize-none"
                  disabled={status === 'running'}
                />
              </div>

              <button
                type="submit"
                disabled={!entityId.trim() || status === 'running'}
                className="btn-primary w-full"
              >
                {status === 'running' ? 'Processing...' : 'Start Conversation'}
              </button>

              {/* Quick fill */}
              <div>
                <div className="text-xs font-medium uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>Quick Fill</div>
                <div className="flex gap-2">
                  {input_schema.test_entities.map((id) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => fillTestData(id)}
                      className="px-3 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer"
                      style={{
                        background: 'rgba(101,163,13,0.06)',
                        border: '1px solid rgba(101,163,13,0.15)',
                        color: 'var(--sage)',
                      }}
                      disabled={status === 'running'}
                    >
                      {id}
                    </button>
                  ))}
                </div>
              </div>
            </form>
          </div>
        </div>

        {/* ---- RESULTS PANEL ---- */}
        <div className="lg:col-span-2 animate-fade-slide-up stagger-2">
          {/* IDLE */}
          {status === 'idle' && (
            <div className="card text-center py-20">
              <div className="relative inline-block mb-6">
                <div
                  className="w-20 h-20 rounded-3xl flex items-center justify-center animate-hero-float"
                  style={{
                    background: 'linear-gradient(135deg, rgba(101,163,13,0.08), rgba(132,204,22,0.04))',
                    border: '1px solid rgba(101,163,13,0.12)',
                  }}
                >
                  <svg className="w-10 h-10" style={{ color: 'var(--sage)', opacity: 0.5 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" />
                  </svg>
                </div>
              </div>
              <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>Ready to Chat</h3>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Enter a Customer ID and select an intent to start the conversation</p>
            </div>
          )}

          {/* RUNNING — Chat-themed processing */}
          {status === 'running' && (
            <div className="card" style={{ padding: '1.5rem' }}>
              {/* Header */}
              <div className="text-center mb-6">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full mb-4"
                  style={{
                    background: 'rgba(101,163,13,0.06)',
                    border: '1px solid rgba(101,163,13,0.12)',
                  }}
                >
                  <div className="w-2 h-2 rounded-full" style={{ background: 'var(--sage)', animation: 'gentleBounce 1s infinite' }} />
                  <span className="text-xs font-semibold" style={{ color: 'var(--sage)' }}>Processing</span>
                </div>

                <div className="mb-2">
                  <span className="text-3xl font-bold" style={{ color: 'var(--sage)' }}>{elapsed}s</span>
                </div>

                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                  Customer: <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{entityId}</span>
                  {' '}&bull;{' '}
                  Type: <span className="font-semibold" style={{ color: 'var(--sage)' }}>{selectedType}</span>
                </p>
              </div>

              {/* Sage progress bar */}
              <div className="mb-6">
                <div className="relative w-full h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(101,163,13,0.08)' }}>
                  <div
                    className="absolute inset-y-0 rounded-full"
                    style={{
                      width: '100%',
                      background: 'linear-gradient(90deg, var(--sage), var(--sage-light), var(--sage-pale), var(--sage))',
                      backgroundSize: '200% 100%',
                      animation: 'progressPulse 2s linear infinite',
                    }}
                  />
                </div>
              </div>

              {/* User message bubble */}
              <div className="flex flex-col gap-3 mb-4">
                <div className="flex justify-end">
                  <div className="chat-bubble chat-bubble--user" style={{ animation: 'none', opacity: 1 }}>
                    <p className="text-sm">Processing your {selectedType.replace('_', ' ')} request...</p>
                  </div>
                </div>
              </div>

              {/* Agent status cards as chat bubbles */}
              <div className="flex flex-col gap-3">
                {config.agents.map((agent, i) => (
                  <AgentProcessCard key={agent.id} name={agent.name} index={i} elapsed={elapsed} agentId={agent.id} />
                ))}
              </div>
            </div>
          )}

          {/* ERROR */}
          {status === 'error' && (
            <div
              className="card animate-fade-slide-up"
              style={{ borderColor: 'rgba(249,115,22,0.3)' }}
            >
              <div className="flex items-start gap-4">
                <div
                  className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0"
                  style={{ background: 'rgba(249,115,22,0.08)', border: '1px solid rgba(249,115,22,0.2)' }}
                >
                  <svg className="w-5 h-5" style={{ color: 'var(--coral)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-base font-bold mb-1" style={{ color: 'var(--coral)' }}>Something went wrong</h3>
                  <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>{error}</p>
                  <button onClick={() => setStatus('idle')} className="btn-secondary text-xs px-4 py-2">
                    Try Again
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* COMPLETE */}
          {status === 'complete' && response && (
            <ResultsPanel response={response} config={config} elapsed={elapsed} />
          )}
        </div>
      </div>
    </div>
  );
}
