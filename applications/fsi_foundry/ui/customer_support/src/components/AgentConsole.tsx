// @ts-nocheck
import { useState, useEffect } from 'react';
import type { RuntimeConfig } from '../config';
import type { SupportResponse, ExecutionStatus } from '../types';
import { invokeAgent } from '../api/client';
import ResultsPanel from './ResultsPanel';

const ticketTypeIcons: Record<string, React.ReactNode> = {
  full: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" />
    </svg>
  ),
  general: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
    </svg>
  ),
  billing: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
    </svg>
  ),
  technical: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17l-5.1-5.1m0 0L3.4 12.99a1.5 1.5 0 000 2.12l5.1 5.1a1.5 1.5 0 002.12 0l2.92-2.92m-7.04-7.04l2.92-2.92a1.5 1.5 0 012.12 0l5.1 5.1a1.5 1.5 0 010 2.12l-2.92 2.92m-7.04-7.04l7.04 7.04" />
    </svg>
  ),
  account: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
    </svg>
  ),
};

const ticketTypeDescriptions: Record<string, string> = {
  full: 'Complete end-to-end analysis with all agents',
  general: 'General questions and inquiries',
  billing: 'Billing disputes, charges, and payment issues',
  technical: 'Technical problems and system errors',
  account: 'Account changes, access, and management',
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
            animation: `typing 1.4s ${i * 0.2}s ease-in-out infinite`,
          }}
        />
      ))}
    </div>
  );
}

/* ---- Pipeline Stage ---- */

function PipelineStageCard({
  name,
  agentId,
  index,
  elapsed,
}: {
  name: string;
  agentId: string;
  index: number;
  elapsed: number;
}) {
  const stageMap: Record<string, string[]> = {
    ticket_classifier: ['Receiving ticket', 'Analyzing content', 'Classifying category', 'Assessing urgency'],
    resolution_agent: ['Queued', 'Searching historical cases', 'Building resolution steps', 'Computing confidence'],
    escalation_agent: ['Queued', 'Evaluating complexity', 'Determining team routing', 'Finalizing decision'],
  };
  const colorMap: Record<string, string> = {
    ticket_classifier: 'var(--sky-500)',
    resolution_agent: 'var(--emerald-500)',
    escalation_agent: 'var(--amber-500)',
  };
  const bgMap: Record<string, string> = {
    ticket_classifier: 'var(--sky-50)',
    resolution_agent: 'rgba(16, 185, 129, 0.04)',
    escalation_agent: 'rgba(245, 158, 11, 0.04)',
  };

  const stages = stageMap[agentId] || stageMap.ticket_classifier;
  const color = colorMap[agentId] || 'var(--sky-500)';
  const bg = bgMap[agentId] || 'var(--sky-50)';
  const agentElapsed = elapsed - index * 3;
  const stageIndex = Math.min(Math.floor(Math.max(agentElapsed, 0) / 8), stages.length - 1);
  const currentStage = agentElapsed > 0 ? stages[stageIndex] : 'Waiting...';
  const isActive = agentElapsed > 0;

  return (
    <div
      className="flex items-center gap-4 p-4 rounded-xl animate-ticket-slide"
      style={{
        background: isActive ? bg : 'var(--bg-card)',
        border: `1px solid ${isActive ? color : 'var(--border)'}`,
        boxShadow: isActive ? `0 0 0 3px ${color}10` : 'var(--shadow-sm)',
        animationDelay: `${index * 0.15}s`,
      }}
    >
      {/* Icon */}
      <div className="relative">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{
            background: isActive ? `${color}15` : 'var(--slate-100)',
            color: isActive ? color : 'var(--text-muted)',
          }}
        >
          {isActive ? (
            <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" strokeDasharray="31.4 31.4" strokeLinecap="round" />
            </svg>
          ) : (
            <div className="w-2 h-2 rounded-full" style={{ background: 'var(--text-muted)' }} />
          )}
        </div>
      </div>
      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{name}</div>
        <div className="flex items-center gap-2">
          <span
            className="text-xs font-medium"
            style={{ color: isActive ? color : 'var(--text-muted)' }}
          >
            {currentStage}
          </span>
          {isActive && <TypingDots color={color} />}
        </div>
      </div>
      {/* Timer */}
      <div className="text-xs font-mono tabular-nums" style={{ color: 'var(--text-muted)' }}>
        {agentElapsed > 0 ? `${agentElapsed}s` : '--'}
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
  const [response, setResponse] = useState<SupportResponse | null>(null);
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
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{
              background: 'linear-gradient(135deg, var(--sky-500), var(--sky-600))',
              boxShadow: '0 2px 8px rgba(14, 165, 233, 0.25)',
            }}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="#FFFFFF" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 6v.75m0 3v.75m0 3v.75m0 3V18m-9-5.25h5.25M7.5 15h3M3.375 5.25c-.621 0-1.125.504-1.125 1.125v3.026a2.999 2.999 0 010 5.198v3.026c0 .621.504 1.125 1.125 1.125h17.25c.621 0 1.125-.504 1.125-1.125v-3.026a2.999 2.999 0 010-5.198V6.375c0-.621-.504-1.125-1.125-1.125H3.375z" />
            </svg>
          </div>
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Submit Ticket</h1>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Submit customer support tickets for AI-powered analysis and resolution
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ---- INPUT PANEL ---- */}
        <div className="lg:col-span-1 animate-fade-slide-up stagger-1">
          <div className="card sticky top-24 p-6" style={{ boxShadow: 'var(--shadow-md)' }}>
            <div className="flex items-center gap-2 mb-6">
              <div
                className="w-2 h-2 rounded-full"
                style={{
                  background: status === 'running' ? 'var(--emerald-500)' : 'var(--text-muted)',
                  animation: status === 'running' ? 'urgencyPulse 1.5s infinite' : 'none',
                }}
              />
              <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>New Ticket</h2>
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
                  className="input-field font-mono"
                  disabled={status === 'running'}
                />
              </div>

              {/* Ticket type as selectable cards */}
              <div>
                <label className="label">Ticket Type</label>
                <div className="space-y-2">
                  {input_schema.type_options.map((opt) => {
                    const icon = ticketTypeIcons[opt.value];
                    return (
                      <div
                        key={opt.value}
                        className={`ticket-type-card ${selectedType === opt.value ? 'selected' : ''}`}
                        onClick={() => status !== 'running' && setSelectedType(opt.value)}
                      >
                        <div
                          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                          style={{
                            background: selectedType === opt.value ? 'rgba(14, 165, 233, 0.1)' : 'var(--slate-100)',
                            color: selectedType === opt.value ? 'var(--sky-500)' : 'var(--text-muted)',
                          }}
                        >
                          {icon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{opt.label}</div>
                          <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{ticketTypeDescriptions[opt.value] || ''}</div>
                        </div>
                        {selectedType === opt.value && (
                          <div
                            className="w-5 h-5 rounded-full flex items-center justify-center shrink-0"
                            style={{ background: 'var(--sky-500)' }}
                          >
                            <svg className="w-3 h-3" style={{ color: '#FFFFFF' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                            </svg>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="label">Description <span style={{ color: 'var(--text-muted)' }}>(optional)</span></label>
                <textarea
                  value={additionalContext}
                  onChange={(e) => setAdditionalContext(e.target.value)}
                  placeholder="Describe the ticket issue..."
                  rows={3}
                  className="input-field resize-none"
                  disabled={status === 'running'}
                />
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={!entityId.trim() || status === 'running'}
                className="btn-primary w-full"
              >
                {status === 'running' ? 'Analyzing...' : 'Analyze Ticket'}
              </button>

              {/* Quick fill */}
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--text-muted)' }}>Quick Fill</div>
                <div className="flex gap-2">
                  {input_schema.test_entities.map((id) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => fillTestData(id)}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer"
                      style={{
                        background: 'var(--sky-50)',
                        border: '1px solid rgba(14, 165, 233, 0.2)',
                        color: 'var(--sky-600)',
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
            <div className="card text-center py-20 p-6" style={{ boxShadow: 'var(--shadow-sm)' }}>
              <div
                className="w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-6"
                style={{
                  background: 'var(--sky-50)',
                  border: '1px solid rgba(14, 165, 233, 0.15)',
                }}
              >
                <svg className="w-10 h-10" style={{ color: 'var(--sky-400)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 6v.75m0 3v.75m0 3v.75m0 3V18m-9-5.25h5.25M7.5 15h3M3.375 5.25c-.621 0-1.125.504-1.125 1.125v3.026a2.999 2.999 0 010 5.198v3.026c0 .621.504 1.125 1.125 1.125h17.25c.621 0 1.125-.504 1.125-1.125v-3.026a2.999 2.999 0 010-5.198V6.375c0-.621-.504-1.125-1.125-1.125H3.375z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>Ready to Analyze</h3>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Submit a ticket to activate the AI support agents</p>
            </div>
          )}

          {/* RUNNING — Pipeline stages */}
          {status === 'running' && (
            <div className="card processing-overlay p-6" style={{ boxShadow: 'var(--shadow-md)' }}>
              <div className="text-center mb-8">
                {/* Timer */}
                <div
                  className="text-4xl font-extrabold font-mono mb-2"
                  style={{ color: 'var(--sky-500)' }}
                >
                  {elapsed}s
                </div>

                <h3 className="text-base font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
                  Processing Support Ticket
                </h3>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  Customer:{' '}
                  <span className="font-semibold" style={{ color: 'var(--sky-600)' }}>{entityId}</span>
                  {' '}&bull;{' '}
                  Type:{' '}
                  <span className="font-semibold" style={{ color: 'var(--amber-500)' }}>{selectedType}</span>
                </p>
              </div>

              {/* Progress bar */}
              <div className="mb-6">
                <div className="relative w-full h-2 rounded-full overflow-hidden" style={{ background: 'var(--slate-200)' }}>
                  <div
                    className="absolute inset-y-0 rounded-full"
                    style={{
                      width: '100%',
                      background: 'linear-gradient(90deg, var(--sky-400), var(--emerald-400), var(--amber-400), var(--sky-400))',
                      backgroundSize: '200% 100%',
                      animation: 'progressFlow 2s linear infinite',
                    }}
                  />
                </div>
              </div>

              {/* Pipeline stage labels */}
              <div className="flex justify-between mb-6 px-2">
                {['Classify', 'Resolve', 'Escalate'].map((stage, i) => {
                  const agentElapsed = elapsed - i * 3;
                  const isActive = agentElapsed > 0;
                  const colors = ['var(--sky-500)', 'var(--emerald-500)', 'var(--amber-500)'];
                  return (
                    <div key={stage} className="text-center">
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center mx-auto mb-1"
                        style={{
                          background: isActive ? `${colors[i]}15` : 'var(--slate-100)',
                          border: `2px solid ${isActive ? colors[i] : 'var(--slate-300)'}`,
                          transition: 'all 0.5s ease',
                        }}
                      >
                        <span
                          className="text-xs font-bold"
                          style={{ color: isActive ? colors[i] : 'var(--text-muted)' }}
                        >
                          {i + 1}
                        </span>
                      </div>
                      <span
                        className="text-[10px] font-semibold uppercase"
                        style={{ color: isActive ? colors[i] : 'var(--text-muted)' }}
                      >
                        {stage}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Agent status cards */}
              <div className="space-y-3">
                {config.agents.map((agent, i) => (
                  <PipelineStageCard
                    key={agent.id}
                    name={agent.name}
                    agentId={agent.id}
                    index={i}
                    elapsed={elapsed}
                  />
                ))}
              </div>
            </div>
          )}

          {/* ERROR */}
          {status === 'error' && (
            <div
              className="card animate-fade-in-scale p-6"
              style={{ borderColor: 'rgba(225, 29, 72, 0.3)', boxShadow: '0 0 0 3px rgba(225, 29, 72, 0.06)' }}
            >
              <div className="flex items-start gap-4">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: 'var(--rose-100)', color: 'var(--rose-600)' }}
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-base font-bold mb-1" style={{ color: 'var(--rose-600)' }}>Analysis Failed</h3>
                  <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>{error}</p>
                  <button onClick={() => setStatus('idle')} className="btn-secondary text-xs">
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
