// @ts-nocheck
import { useState, useCallback } from 'react';
import type { RuntimeConfig } from '../config';
import type { InvestigationResponse, ExecutionStatus } from '../types';
import { invokeAgent } from '../api/client';
import ResultsPanel from './ResultsPanel';

interface Props {
  config: RuntimeConfig;
}

const typeIcons: Record<string, string> = {
  FULL: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  EVIDENCE_COLLECTION: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z',
  PATTERN_ANALYSIS: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
  REGULATORY_MAPPING: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253',
};

const flowLabels = ['Gathering Evidence', 'Analyzing Patterns', 'Mapping Regulations'];

export default function AgentConsole({ config }: Props) {
  const { input_schema } = config;
  const [entityId, setEntityId] = useState('');
  const [investigationType, setInvestigationType] = useState(input_schema.type_options[0].value);
  const [status, setStatus] = useState<ExecutionStatus>('idle');
  const [result, setResult] = useState<InvestigationResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeStep, setActiveStep] = useState(-1);

  const handleSubmit = useCallback(async () => {
    if (!entityId.trim()) return;
    setStatus('running');
    setError(null);
    setResult(null);
    setActiveStep(0);

    // Simulate step progression
    const stepTimer1 = setTimeout(() => setActiveStep(1), 3000);
    const stepTimer2 = setTimeout(() => setActiveStep(2), 6000);

    try {
      const payload: Record<string, string> = {
        [input_schema.id_field]: entityId.trim(),
        [input_schema.type_field]: investigationType,
      };
      const res = await invokeAgent(config, payload);
      setResult(res);
      setStatus('complete');
      setActiveStep(3);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
      setStatus('error');
    } finally {
      clearTimeout(stepTimer1);
      clearTimeout(stepTimer2);
    }
  }, [entityId, investigationType, config, input_schema]);

  return (
    <div className="max-w-6xl mx-auto px-6 py-10 space-y-8">

      {/* ── Header ── */}
      <div className="animate-fadeSlideUp">
        <h1 className="text-3xl font-extrabold tracking-tight" style={{ color: 'var(--slate-900)' }}>
          Investigation Console
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
          Launch compliance investigations through the AI investigation engine
        </p>
      </div>

      {/* ── Input Form ── */}
      <div className="card animate-fadeSlideUp stagger-1" style={{ borderTop: '2px solid var(--amber-600)' }}>
        {/* Entity ID */}
        <div className="mb-6">
          <label className="block text-xs font-bold uppercase tracking-wider mb-2"
            style={{ color: 'var(--text-secondary)' }}>
            {input_schema.id_label}
          </label>
          <input
            type="text"
            value={entityId}
            onChange={(e) => setEntityId(e.target.value)}
            placeholder={input_schema.id_placeholder}
            className="w-full px-4 py-3 rounded-lg border-2 text-sm font-medium transition-all duration-200 outline-none"
            style={{
              borderColor: entityId ? '#D97706' : '#E2E8F0',
              background: entityId ? '#FFFBEB' : 'white',
            }}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          />
          {input_schema.test_entities.length > 0 && (
            <div className="flex items-center gap-2 mt-2">
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Try:</span>
              {input_schema.test_entities.map((id) => (
                <button key={id} onClick={() => setEntityId(id)}
                  className="text-xs font-bold px-2.5 py-1 rounded transition-colors hover:opacity-80"
                  style={{ background: '#FFFBEB', color: '#D97706', border: '1px solid #FEF3C7' }}>
                  {id}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Investigation Type Cards */}
        <div className="mb-6">
          <label className="block text-xs font-bold uppercase tracking-wider mb-3"
            style={{ color: 'var(--text-secondary)' }}>
            Investigation Type
          </label>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {input_schema.type_options.map((opt) => {
              const selected = investigationType === opt.value;
              return (
                <button
                  key={opt.value}
                  onClick={() => setInvestigationType(opt.value)}
                  className="flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all duration-200 cursor-pointer"
                  style={{
                    borderColor: selected ? '#D97706' : '#E2E8F0',
                    background: selected ? '#FFFBEB' : 'white',
                    transform: selected ? 'scale(1.02)' : 'scale(1)',
                  }}
                >
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center"
                    style={{ background: selected ? 'linear-gradient(135deg, #D97706, #F59E0B)' : '#F1F5F9' }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                      stroke={selected ? 'white' : '#94A3B8'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d={typeIcons[opt.value] || typeIcons.FULL} />
                    </svg>
                  </div>
                  <span className="text-xs font-bold" style={{ color: selected ? '#D97706' : 'var(--text-secondary)' }}>
                    {opt.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Submit Button */}
        <button
          onClick={handleSubmit}
          disabled={!entityId.trim() || status === 'running'}
          className="w-full py-3.5 rounded-lg text-sm font-bold text-white transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed hover:scale-[1.01] active:scale-[0.99]"
          style={{ background: 'linear-gradient(135deg, #D97706, #F59E0B)' }}
        >
          {status === 'running' ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="white" strokeWidth="3" opacity="0.3" />
                <path d="M12 2a10 10 0 019.8 8" stroke="white" strokeWidth="3" strokeLinecap="round" />
              </svg>
              Running Investigation...
            </span>
          ) : (
            <span className="flex items-center justify-center gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
              Launch Investigation
            </span>
          )}
        </button>
      </div>

      {/* ── Processing Flow ── */}
      {status === 'running' && (
        <div className="card animate-fadeSlideUp" style={{ borderTop: '2px solid var(--amber-600)' }}>
          <h3 className="text-sm font-bold mb-5" style={{ color: 'var(--slate-900)' }}>Investigation Pipeline</h3>
          <div className="flex items-center justify-between mb-6">
            {flowLabels.map((label, i) => (
              <div key={label} className="flex items-center gap-3 flex-1">
                <div className="flex flex-col items-center">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-500 ${
                      activeStep > i ? 'text-white' : activeStep === i ? 'text-white animate-pulseAmber' : 'text-slate-400'
                    }`}
                    style={{
                      background: activeStep > i
                        ? '#0D9488'
                        : activeStep === i
                          ? 'linear-gradient(135deg, #D97706, #F59E0B)'
                          : '#F1F5F9',
                    }}
                  >
                    {activeStep > i ? (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    ) : (
                      i + 1
                    )}
                  </div>
                  <span className="text-xs font-semibold mt-2" style={{
                    color: activeStep >= i ? 'var(--slate-900)' : 'var(--text-muted)',
                  }}>{label}</span>
                </div>
                {i < flowLabels.length - 1 && (
                  <div className="flex-1 h-1 rounded-full mx-2 mt-[-20px]"
                    style={{
                      background: activeStep > i ? '#0D9488' : '#E2E8F0',
                      transition: 'background 0.5s ease',
                    }} />
                )}
              </div>
            ))}
          </div>

          {/* Agent Status Cards */}
          <div className="grid grid-cols-3 gap-3">
            {config.agents.map((agent, i) => {
              const agentColors = ['#D97706', '#0D9488', '#1E293B'];
              const isActive = activeStep === i;
              const isDone = activeStep > i;
              return (
                <div key={agent.id}
                  className="p-3 rounded-lg border transition-all duration-300"
                  style={{
                    borderColor: isActive ? agentColors[i] : isDone ? '#0D9488' : '#E2E8F0',
                    background: isActive ? `${agentColors[i]}08` : isDone ? '#F0FDFA' : 'white',
                  }}>
                  <div className="flex items-center gap-2 mb-2">
                    {isDone ? (
                      <div className="w-5 h-5 rounded-full flex items-center justify-center" style={{ background: '#CCFBF1' }}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#0D9488" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      </div>
                    ) : isActive ? (
                      <div className="w-5 h-5 rounded-full flex items-center justify-center"
                        style={{ background: `${agentColors[i]}20` }}>
                        <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: agentColors[i] }} />
                      </div>
                    ) : (
                      <div className="w-5 h-5 rounded-full" style={{ background: '#F1F5F9' }} />
                    )}
                    <span className="text-xs font-bold" style={{ color: 'var(--slate-900)' }}>{agent.name}</span>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: '#F1F5F9' }}>
                    <div
                      className="h-full rounded-full transition-all duration-1000"
                      style={{
                        width: isDone ? '100%' : isActive ? '60%' : '0%',
                        background: `linear-gradient(90deg, ${agentColors[i]}, ${agentColors[i]}88)`,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Error ── */}
      {status === 'error' && error && (
        <div className="card animate-fadeSlideUp" style={{ borderLeft: '4px solid #DC2626' }}>
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: '#FEF2F2' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
            </div>
            <div>
              <h3 className="text-sm font-bold mb-1" style={{ color: '#DC2626' }}>Investigation Error</h3>
              <p className="text-xs" style={{ color: '#991B1B' }}>{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* ── Results ── */}
      {status === 'complete' && result && (
        <ResultsPanel result={result} />
      )}
    </div>
  );
}
