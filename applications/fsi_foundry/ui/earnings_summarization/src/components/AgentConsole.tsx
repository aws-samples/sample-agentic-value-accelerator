// @ts-nocheck
import { useState, useCallback } from 'react';
import type { RuntimeConfig } from '../config';
import type { SummarizationResponse, ExecutionStatus } from '../types';
import { invokeAgent } from '../api/client';
import ResultsPanel from './ResultsPanel';

interface Props {
  config: RuntimeConfig;
}

const typeIcons: Record<string, string> = {
  FULL: 'M4 6h16M4 12h16M4 18h16',
  TRANSCRIPT_ONLY: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
  METRICS_ONLY: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
  SENTIMENT_ONLY: 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6',
};

const flowLabels = ['Processing Transcript', 'Extracting Metrics', 'Analyzing Sentiment'];

export default function AgentConsole({ config }: Props) {
  const { input_schema } = config;
  const [entityId, setEntityId] = useState('');
  const [summarizationType, setSummarizationType] = useState(input_schema.type_options[0].value);
  const [status, setStatus] = useState<ExecutionStatus>('idle');
  const [result, setResult] = useState<SummarizationResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeStep, setActiveStep] = useState(-1);

  const handleSubmit = useCallback(async () => {
    if (!entityId.trim()) return;
    setStatus('running');
    setError(null);
    setResult(null);
    setActiveStep(0);

    const stepTimer1 = setTimeout(() => setActiveStep(1), 3000);
    const stepTimer2 = setTimeout(() => setActiveStep(2), 6000);

    try {
      const payload: Record<string, string> = {
        [input_schema.id_field]: entityId.trim(),
        [input_schema.type_field]: summarizationType,
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
  }, [entityId, summarizationType, config, input_schema]);

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">

      {/* ── Header ── */}
      <div className="animate-fadeSlideUp">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--blue-400)' }} />
          <h1 className="text-2xl font-extrabold tracking-tight" style={{ color: 'var(--white)' }}>
            Analysis Console
          </h1>
        </div>
        <p className="text-xs ml-4" style={{ color: 'var(--gray-400)', fontFamily: 'JetBrains Mono, ui-monospace, monospace' }}>
          // Process earnings calls through the AI analysis pipeline
        </p>
      </div>

      {/* ── Input Form ── */}
      <div className="terminal-card animate-fadeSlideUp stagger-1">
        {/* Entity ID */}
        <div className="mb-5">
          <label className="block text-xs font-bold uppercase tracking-wider mb-2"
            style={{ color: 'var(--gray-400)', fontFamily: 'JetBrains Mono, ui-monospace, monospace' }}>
            {input_schema.id_label}
          </label>
          <input
            type="text"
            value={entityId}
            onChange={(e) => setEntityId(e.target.value)}
            placeholder={input_schema.id_placeholder}
            className="w-full px-4 py-3 rounded text-sm font-bold transition-all duration-200 outline-none"
            style={{
              background: entityId ? 'rgba(37,99,235,0.08)' : 'var(--terminal-dark)',
              border: `1px solid ${entityId ? '#2563EB' : 'var(--terminal-border)'}`,
              color: 'var(--white)',
              fontFamily: 'JetBrains Mono, ui-monospace, monospace',
            }}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          />
          {input_schema.test_entities.length > 0 && (
            <div className="flex items-center gap-2 mt-2">
              <span className="text-xs" style={{ color: 'var(--gray-400)', fontFamily: 'JetBrains Mono, ui-monospace, monospace' }}>try:</span>
              {input_schema.test_entities.map((id) => (
                <button key={id} onClick={() => setEntityId(id)}
                  className="text-xs font-bold px-2.5 py-1 rounded transition-colors hover:opacity-80"
                  style={{
                    background: 'rgba(37,99,235,0.15)',
                    color: 'var(--blue-400)',
                    border: '1px solid rgba(37,99,235,0.3)',
                    fontFamily: 'JetBrains Mono, ui-monospace, monospace',
                  }}>
                  {id}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Summarization Type Cards */}
        <div className="mb-5">
          <label className="block text-xs font-bold uppercase tracking-wider mb-3"
            style={{ color: 'var(--gray-400)', fontFamily: 'JetBrains Mono, ui-monospace, monospace' }}>
            Summarization Type
          </label>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {input_schema.type_options.map((opt) => {
              const selected = summarizationType === opt.value;
              return (
                <button
                  key={opt.value}
                  onClick={() => setSummarizationType(opt.value)}
                  className="flex flex-col items-center gap-2 p-4 rounded transition-all duration-200 cursor-pointer"
                  style={{
                    border: `1px solid ${selected ? '#2563EB' : 'var(--terminal-border)'}`,
                    background: selected ? 'rgba(37,99,235,0.1)' : 'var(--terminal-dark)',
                  }}
                >
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center"
                    style={{
                      background: selected ? 'linear-gradient(135deg, #2563EB, #3B82F6)' : 'var(--terminal-border)',
                    }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                      stroke={selected ? 'white' : 'var(--gray-400)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d={typeIcons[opt.value] || typeIcons.FULL} />
                    </svg>
                  </div>
                  <span className="text-xs font-bold" style={{
                    color: selected ? 'var(--blue-400)' : 'var(--gray-400)',
                    fontFamily: 'JetBrains Mono, ui-monospace, monospace',
                  }}>
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
          className="w-full py-3 rounded text-xs font-bold text-white tracking-wider uppercase transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed hover:scale-[1.01] active:scale-[0.99]"
          style={{
            background: 'linear-gradient(135deg, #2563EB, #3B82F6)',
            fontFamily: 'JetBrains Mono, ui-monospace, monospace',
          }}
        >
          {status === 'running' ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="white" strokeWidth="3" opacity="0.3" />
                <path d="M12 2a10 10 0 019.8 8" stroke="white" strokeWidth="3" strokeLinecap="round" />
              </svg>
              ANALYZING EARNINGS...
            </span>
          ) : (
            <span className="flex items-center justify-center gap-2">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
              </svg>
              RUN EARNINGS ANALYSIS
            </span>
          )}
        </button>
      </div>

      {/* ── Processing Flow ── */}
      {status === 'running' && (
        <div className="terminal-card animate-fadeSlideUp">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'var(--blue-400)' }} />
            <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--white)', fontFamily: 'JetBrains Mono, ui-monospace, monospace' }}>
              Analysis Pipeline
            </h3>
          </div>

          <div className="flex items-center justify-between mb-5">
            {flowLabels.map((label, i) => (
              <div key={label} className="flex items-center gap-3 flex-1">
                <div className="flex flex-col items-center">
                  <div
                    className={`w-9 h-9 rounded flex items-center justify-center text-xs font-bold transition-all duration-500 ${
                      activeStep > i ? 'text-white' : activeStep === i ? 'text-white animate-terminalGlow' : ''
                    }`}
                    style={{
                      background: activeStep > i
                        ? 'var(--green-500)'
                        : activeStep === i
                          ? 'linear-gradient(135deg, #2563EB, #3B82F6)'
                          : 'var(--terminal-border)',
                      color: activeStep >= i ? 'white' : 'var(--gray-400)',
                      fontFamily: 'JetBrains Mono, ui-monospace, monospace',
                    }}
                  >
                    {activeStep > i ? (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    ) : (
                      i + 1
                    )}
                  </div>
                  <span className="text-xs font-bold mt-2" style={{
                    color: activeStep >= i ? 'var(--white)' : 'var(--gray-400)',
                    fontFamily: 'JetBrains Mono, ui-monospace, monospace',
                    fontSize: '0.6rem',
                  }}>{label}</span>
                </div>
                {i < flowLabels.length - 1 && (
                  <div className="flex-1 mx-2 mt-[-20px]">
                    <div className="terminal-progress">
                      <div className="terminal-progress-fill" style={{
                        width: activeStep > i ? '100%' : '0%',
                        background: 'linear-gradient(90deg, var(--green-500), var(--green-400))',
                      }} />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Agent Status Cards */}
          <div className="grid grid-cols-3 gap-3">
            {config.agents.map((agent, i) => {
              const agentColors = ['#2563EB', '#F97316', '#22C55E'];
              const isActive = activeStep === i;
              const isDone = activeStep > i;
              return (
                <div key={agent.id}
                  className="p-3 rounded transition-all duration-300"
                  style={{
                    border: `1px solid ${isActive ? agentColors[i] : isDone ? 'var(--green-500)' : 'var(--terminal-border)'}`,
                    background: isActive ? `${agentColors[i]}10` : isDone ? 'rgba(34,197,94,0.06)' : 'var(--terminal-dark)',
                  }}>
                  <div className="flex items-center gap-2 mb-2">
                    {isDone ? (
                      <div className="w-4 h-4 rounded flex items-center justify-center" style={{ background: 'rgba(34,197,94,0.2)' }}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      </div>
                    ) : isActive ? (
                      <div className="w-4 h-4 rounded flex items-center justify-center" style={{ background: `${agentColors[i]}20` }}>
                        <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: agentColors[i] }} />
                      </div>
                    ) : (
                      <div className="w-4 h-4 rounded" style={{ background: 'var(--terminal-border)' }} />
                    )}
                    <span className="text-xs font-bold" style={{ color: 'var(--white)', fontFamily: 'JetBrains Mono, ui-monospace, monospace', fontSize: '0.65rem' }}>
                      {agent.name}
                    </span>
                  </div>
                  <div className="terminal-progress">
                    <div className="terminal-progress-fill" style={{
                      width: isDone ? '100%' : isActive ? '60%' : '0%',
                      background: `linear-gradient(90deg, ${agentColors[i]}, ${agentColors[i]}88)`,
                    }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Error ── */}
      {status === 'error' && error && (
        <div className="terminal-card animate-fadeSlideUp" style={{ borderLeft: '3px solid #EF4444' }}>
          <div className="flex items-start gap-3">
            <div className="w-7 h-7 rounded flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(239,68,68,0.15)' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
            </div>
            <div>
              <h3 className="text-xs font-bold mb-1" style={{ color: '#EF4444', fontFamily: 'JetBrains Mono, ui-monospace, monospace' }}>ERROR</h3>
              <p className="text-xs" style={{ color: 'var(--red-400)' }}>{error}</p>
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
