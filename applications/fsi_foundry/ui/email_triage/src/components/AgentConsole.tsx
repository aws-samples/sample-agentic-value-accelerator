// @ts-nocheck
import { useState, useEffect } from 'react';
import type { RuntimeConfig } from '../config';
import type { TriageResponse, ExecutionStatus } from '../types';
import { invokeAgent } from '../api/client';
import ResultsPanel from './ResultsPanel';

const triageIcons: Record<string, string> = {
  FULL: 'M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75',
  CLASSIFICATION: 'M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z',
  ACTION_EXTRACTION: 'M11.35 3.836c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15a2.25 2.25 0 012.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m8.9-4.414c.376.023.75.05 1.124.08 1.131.094 1.976 1.057 1.976 2.192V16.5A2.25 2.25 0 0118 18.75h-2.25m-7.5-10.5H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V18.75m-7.5-10.5h6.375c.621 0 1.125.504 1.125 1.125v9.375m-8.25-3l1.5 1.5 3-3.75',
};

const triageDescriptions: Record<string, string> = {
  FULL: 'Full classification + action extraction',
  CLASSIFICATION: 'Category, urgency, sender importance only',
  ACTION_EXTRACTION: 'Action items + deadlines only',
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

/* ---- Agent Status Card ---- */

function AgentWorkCard({ name, index, elapsed, agentId }: { name: string; index: number; elapsed: number; agentId: string }) {
  const stageMap: Record<string, string[]> = {
    email_classifier: ['Receiving email content', 'Analyzing sender & subject', 'Classifying category & urgency', 'Scoring sender importance'],
    action_extractor: ['Queued', 'Scanning email body', 'Extracting action items', 'Identifying deadlines'],
  };
  const colorMap: Record<string, string> = {
    email_classifier: 'var(--blue-500)',
    action_extractor: 'var(--blue-700)',
  };

  const stages = stageMap[agentId] || stageMap.email_classifier;
  const color = colorMap[agentId] || 'var(--blue-500)';
  const agentElapsed = elapsed - index * 3;
  const stageIndex = Math.min(Math.floor(Math.max(agentElapsed, 0) / 6), stages.length - 1);
  const currentStage = agentElapsed > 0 ? stages[stageIndex] : 'Waiting...';
  const isActive = agentElapsed > 0;

  return (
    <div
      className="flex items-center gap-4 p-4 rounded-xl animate-slide-left"
      style={{
        background: isActive ? 'var(--blue-50)' : 'var(--gray-50)',
        border: `1px solid ${isActive ? 'var(--blue-200)' : 'var(--border)'}`,
        animationDelay: `${index * 0.15}s`,
      }}
    >
      <div className="relative">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{
            background: isActive ? 'var(--blue-100)' : 'var(--gray-100)',
            border: `1px solid ${isActive ? 'var(--blue-300)' : 'var(--gray-200)'}`,
          }}
        >
          {isActive ? (
            <svg className="w-5 h-5 animate-spin" style={{ color }} fill="none" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" strokeDasharray="31.4 31.4" strokeLinecap="round" />
            </svg>
          ) : (
            <div className="w-2 h-2 rounded-full" style={{ background: 'var(--text-muted)' }} />
          )}
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold" style={{ color: 'var(--charcoal)' }}>{name}</div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono" style={{ color: isActive ? color : 'var(--text-muted)' }}>
            {currentStage}
          </span>
          {isActive && <TypingDots color={color} />}
        </div>
      </div>
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
  const [status, setStatus] = useState<ExecutionStatus>('idle');
  const [response, setResponse] = useState<TriageResponse | null>(null);
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
    setSelectedType(input_schema.type_options[0].value);
  };

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="mb-8 animate-fade-in">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{
              background: 'var(--blue-50)',
              border: '1px solid var(--blue-200)',
            }}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="var(--blue-500)" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 13.5h3.86a2.25 2.25 0 012.012 1.244l.256.512a2.25 2.25 0 002.013 1.244h3.218a2.25 2.25 0 002.013-1.244l.256-.512a2.25 2.25 0 012.013-1.244h3.859M12 3v8.25m0 0l-3-3m3 3l3-3" />
            </svg>
          </div>
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--charcoal)' }}>Inbox Manager</h1>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Submit emails for AI-powered triage and action extraction
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ---- INPUT PANEL ---- */}
        <div className="lg:col-span-1 animate-fade-in stagger-1">
          <div className="glass sticky top-24 p-6">
            <div className="flex items-center gap-2 mb-6">
              <div
                className="w-2 h-2 rounded-full"
                style={{
                  background: status === 'running' ? 'var(--green-500)' : 'var(--text-muted)',
                  animation: status === 'running' ? 'pulse-dot 1s infinite' : 'none',
                }}
              />
              <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>New Triage</h2>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
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

              {/* Triage type cards */}
              <div>
                <label className="label">Triage Type</label>
                <div className="space-y-2">
                  {input_schema.type_options.map((opt) => (
                    <div
                      key={opt.value}
                      className={`triage-card ${selectedType === opt.value ? 'selected' : ''}`}
                      onClick={() => status !== 'running' && setSelectedType(opt.value)}
                    >
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                        style={{
                          background: selectedType === opt.value ? 'var(--blue-100)' : 'var(--gray-100)',
                        }}
                      >
                        <svg className="w-4 h-4" style={{ color: selectedType === opt.value ? 'var(--blue-500)' : 'var(--gray-400)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d={triageIcons[opt.value] || triageIcons.FULL} />
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold" style={{ color: 'var(--charcoal)' }}>{opt.label}</div>
                        <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{triageDescriptions[opt.value] || ''}</div>
                      </div>
                      {selectedType === opt.value && (
                        <div
                          className="w-5 h-5 rounded-full flex items-center justify-center shrink-0"
                          style={{ background: 'var(--blue-500)' }}
                        >
                          <svg className="w-3 h-3" style={{ color: 'white' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                          </svg>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <button
                type="submit"
                disabled={!entityId.trim() || status === 'running'}
                className="btn-primary w-full"
              >
                {status === 'running' ? (
                  <span className="flex items-center gap-2">
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" strokeDasharray="31.4 31.4" strokeLinecap="round" />
                    </svg>
                    Processing...
                  </span>
                ) : 'Triage Email'}
              </button>

              <div>
                <div className="text-[10px] font-mono uppercase tracking-widest mb-2" style={{ color: 'var(--text-muted)' }}>Quick Fill</div>
                <div className="flex gap-2">
                  {input_schema.test_entities.map((id) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => fillTestData(id)}
                      className="px-3 py-1.5 rounded-lg text-xs font-mono transition-all cursor-pointer"
                      style={{
                        background: 'var(--blue-50)',
                        border: '1px solid var(--blue-200)',
                        color: 'var(--blue-600)',
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
        <div className="lg:col-span-2 animate-fade-in stagger-2">
          {/* IDLE */}
          {status === 'idle' && (
            <div className="glass text-center py-20 p-6">
              <div className="relative inline-block mb-6">
                <div
                  className="w-24 h-24 rounded-2xl flex items-center justify-center"
                  style={{
                    background: 'var(--blue-50)',
                    border: '1px solid var(--blue-200)',
                  }}
                >
                  <svg className="w-12 h-12" style={{ color: 'var(--blue-400)', opacity: 0.6 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 13.5h3.86a2.25 2.25 0 012.012 1.244l.256.512a2.25 2.25 0 002.013 1.244h3.218a2.25 2.25 0 002.013-1.244l.256-.512a2.25 2.25 0 012.013-1.244h3.859M12 3v8.25m0 0l-3-3m3 3l3-3" />
                  </svg>
                </div>
              </div>
              <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--charcoal)' }}>Inbox Ready</h3>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Submit an email ID to start AI triage</p>
            </div>
          )}

          {/* RUNNING */}
          {status === 'running' && (
            <div className="glass p-6">
              <div className="text-center mb-8">
                {/* Envelope animation */}
                <div className="relative inline-block mb-4">
                  <div
                    className="w-20 h-20 rounded-2xl flex items-center justify-center"
                    style={{
                      background: 'var(--blue-50)',
                      border: '1px solid var(--blue-200)',
                      animation: 'envelopeOpen 2s ease-in-out infinite',
                    }}
                  >
                    <svg className="w-10 h-10" style={{ color: 'var(--blue-500)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                    </svg>
                  </div>
                </div>

                <div className="mt-4">
                  <span
                    className="text-3xl font-black font-mono"
                    style={{ color: 'var(--blue-600)' }}
                  >
                    {elapsed}s
                  </span>
                </div>

                <h3 className="text-base font-bold mt-2 mb-1" style={{ color: 'var(--charcoal)' }}>
                  Triaging Email
                </h3>
                <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
                  Email: <span style={{ color: 'var(--blue-600)' }}>{entityId}</span>
                  {' '}&bull;{' '}
                  Mode: <span style={{ color: 'var(--blue-600)' }}>{selectedType}</span>
                </p>
              </div>

              {/* Progress bar */}
              <div className="mb-6">
                <div className="relative w-full h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--blue-100)' }}>
                  <div
                    className="absolute inset-y-0 rounded-full"
                    style={{
                      width: '100%',
                      background: 'linear-gradient(90deg, var(--blue-400), var(--blue-600), var(--blue-400))',
                      backgroundSize: '200% 100%',
                      animation: 'progress-flow 2s linear infinite',
                    }}
                  />
                </div>
              </div>

              <div className="space-y-3">
                {config.agents.map((agent, i) => (
                  <AgentWorkCard key={agent.id} name={agent.name} index={i} elapsed={elapsed} agentId={agent.id} />
                ))}
              </div>
            </div>
          )}

          {/* ERROR */}
          {status === 'error' && (
            <div
              className="glass animate-fade-in p-6"
              style={{ borderColor: 'var(--red-500)' }}
            >
              <div className="flex items-start gap-4">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: 'var(--red-50)', border: '1px solid var(--red-100)' }}
                >
                  <svg className="w-5 h-5" style={{ color: 'var(--red-500)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-base font-bold mb-1" style={{ color: 'var(--red-500)' }}>Triage Failed</h3>
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
