// @ts-nocheck
import { useState, useCallback } from 'react';
import type { RuntimeConfig } from '../config';
import type { AdvisoryResponse, ExecutionStatus } from '../types';
import { invokeAgent } from '../api/client';
import ResultsPanel from './ResultsPanel';

interface Props {
  config: RuntimeConfig;
}

const typeIcons: Record<string, string> = {
  FULL: 'M4 6h16M4 12h16M4 18h16',
  PORTFOLIO_REVIEW: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
  MARKET_ANALYSIS: 'M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  CLIENT_PROFILING: 'M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2 M8.5 3a4 4 0 100 8 4 4 0 000-8z',
  REBALANCING: 'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15',
};

const flowLabels = ['Profiling Client', 'Analyzing Portfolio', 'Generating Recommendations'];

export default function AgentConsole({ config }: Props) {
  const { input_schema } = config;
  const [clientId, setClientId] = useState('');
  const [advisoryType, setAdvisoryType] = useState(input_schema.type_options[0].value);
  const [status, setStatus] = useState<ExecutionStatus>('idle');
  const [result, setResult] = useState<AdvisoryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeStep, setActiveStep] = useState(-1);

  const handleSubmit = useCallback(async () => {
    if (!clientId.trim()) return;
    setStatus('running');
    setError(null);
    setResult(null);
    setActiveStep(0);

    // Simulate step progression
    const stepTimer1 = setTimeout(() => setActiveStep(1), 3000);
    const stepTimer2 = setTimeout(() => setActiveStep(2), 6000);

    try {
      const payload: Record<string, string> = {
        [input_schema.id_field]: clientId.trim(),
        [input_schema.type_field]: advisoryType,
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
  }, [clientId, advisoryType, config, input_schema]);

  return (
    <div className="max-w-6xl mx-auto px-6 py-10 space-y-8">

      {/* ── Header ── */}
      <div className="animate-fadeSlideUp">
        <h1 className="text-3xl heading-serif tracking-tight" style={{ color: 'var(--charcoal)' }}>
          Advisory Console
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
          Generate personalized investment advisory through the AI wealth engine
        </p>
      </div>

      {/* ── Input Form ── */}
      <div className="card animate-fadeSlideUp stagger-1">
        {/* Client ID */}
        <div className="mb-6">
          <label className="block text-xs font-bold uppercase tracking-wider mb-2"
            style={{ color: 'var(--text-secondary)' }}>
            {input_schema.id_label}
          </label>
          <input
            type="text"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            placeholder={input_schema.id_placeholder}
            className="w-full px-4 py-3 rounded-xl border-2 text-sm font-medium transition-all duration-200 outline-none"
            style={{
              borderColor: clientId ? 'var(--forest-600)' : '#E5E7EB',
              background: clientId ? 'var(--forest-50)' : 'white',
            }}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          />
          {input_schema.test_entities.length > 0 && (
            <div className="flex items-center gap-2 mt-2">
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Try:</span>
              {input_schema.test_entities.map((id) => (
                <button key={id} onClick={() => setClientId(id)}
                  className="text-xs font-bold px-2.5 py-1 rounded-lg transition-colors hover:opacity-80"
                  style={{ background: 'var(--forest-50)', color: 'var(--forest-800)' }}>
                  {id}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Advisory Type Cards */}
        <div className="mb-6">
          <label className="block text-xs font-bold uppercase tracking-wider mb-3"
            style={{ color: 'var(--text-secondary)' }}>
            Advisory Type
          </label>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {input_schema.type_options.map((opt) => {
              const selected = advisoryType === opt.value;
              return (
                <button
                  key={opt.value}
                  onClick={() => setAdvisoryType(opt.value)}
                  className="flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all duration-200 cursor-pointer"
                  style={{
                    borderColor: selected ? 'var(--forest-800)' : '#E5E7EB',
                    background: selected ? 'var(--forest-50)' : 'white',
                    transform: selected ? 'scale(1.02)' : 'scale(1)',
                  }}
                >
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                    style={{ background: selected ? 'linear-gradient(135deg, #064E3B, #059669)' : '#F3F4F6' }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                      stroke={selected ? 'white' : '#6B7280'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d={typeIcons[opt.value] || typeIcons.FULL} />
                    </svg>
                  </div>
                  <span className="text-xs font-bold" style={{ color: selected ? 'var(--forest-800)' : 'var(--text-secondary)' }}>
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
          disabled={!clientId.trim() || status === 'running'}
          className="w-full py-3.5 rounded-xl text-sm font-bold text-white transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed hover:scale-[1.01] active:scale-[0.99]"
          style={{ background: 'linear-gradient(135deg, #064E3B, #059669)' }}
        >
          {status === 'running' ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="white" strokeWidth="3" opacity="0.3" />
                <path d="M12 2a10 10 0 019.8 8" stroke="white" strokeWidth="3" strokeLinecap="round" />
              </svg>
              Advisory in Progress...
            </span>
          ) : (
            <span className="flex items-center justify-center gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2L2 7l10 5 10-5-10-5z" />
                <path d="M2 17l10 5 10-5" />
              </svg>
              Run Investment Advisory
            </span>
          )}
        </button>
      </div>

      {/* ── Processing Flow ── */}
      {status === 'running' && (
        <div className="card animate-fadeSlideUp">
          <h3 className="text-sm font-bold mb-5" style={{ color: 'var(--charcoal)' }}>Advisory Pipeline</h3>
          <div className="flex items-center justify-between mb-6">
            {flowLabels.map((label, i) => (
              <div key={label} className="flex items-center gap-3 flex-1">
                <div className="flex flex-col items-center">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-500 ${
                      activeStep > i ? 'text-white' : activeStep === i ? 'text-white animate-pulseForest' : 'text-gray-400'
                    }`}
                    style={{
                      background: activeStep > i
                        ? 'var(--forest-600)'
                        : activeStep === i
                          ? 'linear-gradient(135deg, #064E3B, #059669)'
                          : '#F3F4F6',
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
                    color: activeStep >= i ? 'var(--charcoal)' : 'var(--text-muted)',
                  }}>{label}</span>
                </div>
                {i < flowLabels.length - 1 && (
                  <div className="flex-1 h-1 rounded-full mx-2 mt-[-20px]"
                    style={{
                      background: activeStep > i ? 'var(--forest-600)' : '#E5E7EB',
                      transition: 'background 0.5s ease',
                    }} />
                )}
              </div>
            ))}
          </div>

          {/* Agent Status Cards */}
          <div className="grid grid-cols-3 gap-3">
            {config.agents.map((agent, i) => {
              const agentColors = ['#064E3B', '#D4A017', '#059669'];
              const isActive = activeStep === i;
              const isDone = activeStep > i;
              return (
                <div key={agent.id}
                  className="p-3 rounded-xl border transition-all duration-300"
                  style={{
                    borderColor: isActive ? agentColors[i] : isDone ? 'var(--forest-600)' : '#E5E7EB',
                    background: isActive ? `${agentColors[i]}08` : isDone ? 'var(--forest-50)' : 'white',
                  }}>
                  <div className="flex items-center gap-2 mb-2">
                    {isDone ? (
                      <div className="w-5 h-5 rounded-full flex items-center justify-center" style={{ background: '#D1FAE5' }}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      </div>
                    ) : isActive ? (
                      <div className="w-5 h-5 rounded-full flex items-center justify-center"
                        style={{ background: `${agentColors[i]}20` }}>
                        <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: agentColors[i] }} />
                      </div>
                    ) : (
                      <div className="w-5 h-5 rounded-full bg-gray-100" />
                    )}
                    <span className="text-xs font-bold" style={{ color: 'var(--charcoal)' }}>{agent.name}</span>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: '#F3F4F6' }}>
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
        <div className="card animate-fadeSlideUp" style={{ borderLeft: '4px solid #EF4444' }}>
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-red-50 flex items-center justify-center flex-shrink-0">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
            </div>
            <div>
              <h3 className="text-sm font-bold text-red-700 mb-1">Advisory Error</h3>
              <p className="text-xs text-red-600">{error}</p>
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
