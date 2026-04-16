// @ts-nocheck
import { useState, useEffect } from 'react';
import type { RuntimeConfig } from '../config';
import type { KYCResponse, ExecutionStatus } from '../types';
import { invokeAgent } from '../api/client';
import ResultsPanel from './ResultsPanel';

function WaveformVisualizer() {
  return (
    <div className="flex items-center justify-center gap-[3px] h-8">
      {Array.from({ length: 24 }).map((_, i) => (
        <div
          key={i}
          className="w-[3px] rounded-full"
          style={{
            background: 'var(--accent)',
            height: '100%',
            animation: `wave 1.2s ease-in-out ${i * 0.05}s infinite`,
            opacity: 0.3 + Math.random() * 0.7,
          }}
        />
      ))}
    </div>
  );
}

function AgentStatusCard({ name, index, elapsed }: { name: string; index: number; elapsed: number }) {
  const stages = index === 0
    ? ['Initializing', 'Reviewing financials', 'Analyzing credit history', 'Scoring risk']
    : ['Initializing', 'Sanctions screening', 'PEP verification', 'AML assessment'];
  const stageIndex = Math.min(Math.floor((elapsed - index * 2) / 8), stages.length - 1);
  const currentStage = elapsed > index * 2 ? stages[Math.max(0, stageIndex)] : 'Queued';

  return (
    <div
      className="flex items-center gap-4 p-4 rounded-xl animate-fade-in"
      style={{
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border)',
        animationDelay: `${index * 0.15}s`,
      }}
    >
      <div className="relative">
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center"
          style={{ background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.2)' }}
        >
          <svg className="w-5 h-5 animate-spin" style={{ color: 'var(--accent)' }} fill="none" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31.4 31.4" strokeLinecap="round" />
          </svg>
        </div>
        <div
          className="absolute inset-0 rounded-lg"
          style={{
            border: '2px solid var(--accent)',
            animation: 'pulse-ring 2s ease-out infinite',
            animationDelay: `${index * 0.4}s`,
          }}
        />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{name}</div>
        <div className="text-xs font-mono" style={{ color: 'var(--accent)' }}>{currentStage}...</div>
      </div>
      <div className="text-xs font-mono tabular-nums" style={{ color: 'var(--text-muted)' }}>
        {elapsed > index * 2 ? `${elapsed - index * 2}s` : '--'}
      </div>
    </div>
  );
}

export default function AgentConsole({ config }: { config: RuntimeConfig }) {
  const { input_schema } = config;

  const [entityId, setEntityId] = useState('');
  const [selectedType, setSelectedType] = useState(input_schema.type_options[0].value);
  const [additionalContext, setAdditionalContext] = useState('');
  const [status, setStatus] = useState<ExecutionStatus>('idle');
  const [response, setResponse] = useState<KYCResponse | null>(null);
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
      <div className="mb-8 animate-fade-in">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>KYC Assessment Console</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
          Run KYC risk assessments with AI-powered credit analysis and compliance verification
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Input Panel */}
        <div className="lg:col-span-1 animate-fade-in stagger-1">
          <div className="card sticky top-24">
            <div className="flex items-center gap-2 mb-6">
              <div className="w-2 h-2 rounded-full" style={{ background: status === 'running' ? 'var(--accent)' : 'var(--text-muted)', animation: status === 'running' ? 'pulse-dot 1s infinite' : 'none' }} />
              <h2 className="text-sm font-mono uppercase tracking-widest" style={{ color: 'var(--text-secondary)' }}>Assessment Request</h2>
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

              <div>
                <label className="label">Assessment Type</label>
                <select
                  value={selectedType}
                  onChange={(e) => setSelectedType(e.target.value)}
                  className="input-field"
                  disabled={status === 'running'}
                >
                  {input_schema.type_options.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="label">Additional Context <span style={{ color: 'var(--text-muted)' }}>(optional)</span></label>
                <textarea
                  value={additionalContext}
                  onChange={(e) => setAdditionalContext(e.target.value)}
                  placeholder="Any additional context for the assessment..."
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
                {status === 'running' ? 'Assessing...' : 'Run KYC Assessment'}
              </button>

              <div>
                <div className="text-[10px] font-mono uppercase tracking-widest mb-2" style={{ color: 'var(--text-muted)' }}>Sample Customers</div>
                <div className="flex gap-2">
                  {input_schema.test_entities.map((id) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => fillTestData(id)}
                      className="px-3 py-1.5 rounded-lg text-xs font-mono transition-all cursor-pointer"
                      style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--accent)' }}
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

        {/* Results Panel */}
        <div className="lg:col-span-2 animate-fade-in stagger-2">
          {status === 'idle' && (
            <div className="card text-center py-20">
              <div
                className="w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-6 animate-float"
                style={{
                  background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.1), rgba(59, 130, 246, 0.02))',
                  border: '1px solid rgba(59, 130, 246, 0.15)',
                }}
              >
                <svg className="w-10 h-10" style={{ color: 'var(--accent)', opacity: 0.5 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>Ready to Assess</h3>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Enter a Customer ID to begin KYC risk assessment</p>
            </div>
          )}

          {status === 'running' && (
            <div className="card scan-overlay">
              <div className="text-center mb-8">
                <div className="relative inline-block mb-4">
                  <div
                    className="absolute inset-[-12px] rounded-full"
                    style={{ border: '2px dashed rgba(59, 130, 246, 0.2)', animation: 'orbit 8s linear infinite' }}
                  />
                  <div
                    className="w-20 h-20 rounded-2xl flex items-center justify-center animate-glow-pulse"
                    style={{
                      background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.15), rgba(59, 130, 246, 0.05))',
                      border: '1px solid rgba(59, 130, 246, 0.3)',
                    }}
                  >
                    <span className="text-2xl font-mono font-bold" style={{ color: 'var(--accent)' }}>{elapsed}s</span>
                  </div>
                </div>
                <h3 className="text-base font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
                  Running KYC Assessment
                </h3>
                <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
                  Customer: <span style={{ color: 'var(--accent)' }}>{entityId}</span>
                  {' '}&bull;{' '}
                  Type: <span style={{ color: 'var(--accent)' }}>{selectedType}</span>
                </p>
              </div>

              <div className="mb-6"><WaveformVisualizer /></div>

              <div className="mb-6">
                <div className="relative w-full h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg-secondary)' }}>
                  <div
                    className="absolute inset-y-0 w-1/3 rounded-full"
                    style={{
                      background: 'linear-gradient(90deg, transparent, var(--accent), transparent)',
                      animation: 'shimmer 1.5s ease-in-out infinite',
                      backgroundSize: '200% 100%',
                    }}
                  />
                </div>
              </div>

              <div className="space-y-3">
                {config.agents.map((agent, i) => (
                  <AgentStatusCard key={agent.id} name={agent.name} index={i} elapsed={elapsed} />
                ))}
              </div>
            </div>
          )}

          {status === 'error' && (
            <div
              className="card animate-fade-in"
              style={{ borderColor: 'rgba(239, 68, 68, 0.3)', background: 'rgba(239, 68, 68, 0.05)' }}
            >
              <div className="flex items-start gap-4">
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)' }}
                >
                  <svg className="w-5 h-5" style={{ color: '#ef4444' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-base font-bold mb-1" style={{ color: '#ef4444' }}>Assessment Failed</h3>
                  <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>{error}</p>
                  <button onClick={() => setStatus('idle')} className="btn-secondary text-xs">
                    Try Again
                  </button>
                </div>
              </div>
            </div>
          )}

          {status === 'complete' && response && (
            <ResultsPanel response={response} config={config} elapsed={elapsed} />
          )}
        </div>
      </div>
    </div>
  );
}
