// @ts-nocheck
import { useState, useCallback } from 'react';
import type { RuntimeConfig } from '../config';
import type { ClaimResponse, ExecutionStatus } from '../types';
import { invokeAgent } from '../api/client';
import ResultsPanel from './ResultsPanel';

interface Props {
  config: RuntimeConfig;
}

const typeIcons: Record<string, string> = {
  FULL: 'M4 6h16M4 12h16M4 18h16',
  CLAIMS_INTAKE_ONLY: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
  DAMAGE_ASSESSMENT_ONLY: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z',
  SETTLEMENT_ONLY: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
};

const flowLabels = ['Processing Intake', 'Assessing Damage', 'Recommending Settlement'];

export default function AgentConsole({ config }: Props) {
  const { input_schema } = config;
  const [entityId, setEntityId] = useState('');
  const [assessmentType, setAssessmentType] = useState(input_schema.type_options[0].value);
  const [status, setStatus] = useState<ExecutionStatus>('idle');
  const [result, setResult] = useState<ClaimResponse | null>(null);
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
        [input_schema.type_field]: assessmentType,
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
  }, [entityId, assessmentType, config, input_schema]);

  return (
    <div className="max-w-6xl mx-auto px-6 py-10 space-y-8">

      {/* ── Header ── */}
      <div className="animate-fadeSlideUp">
        <h1 className="text-3xl font-extrabold tracking-tight heading-dash" style={{ color: 'var(--charcoal)' }}>
          Assessment Console
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
          Generate claims assessments through the AI claims processing engine
        </p>
      </div>

      {/* ── Input Form ── */}
      <div className="card animate-fadeSlideUp stagger-1">
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
            className="w-full px-4 py-3 rounded-xl border-2 text-sm font-medium transition-all duration-200 outline-none"
            style={{
              borderColor: entityId ? '#38BDF8' : '#E7E5E4',
              background: entityId ? 'var(--sky-50)' : 'white',
            }}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          />
          {input_schema.test_entities.length > 0 && (
            <div className="flex items-center gap-2 mt-2">
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Try:</span>
              {input_schema.test_entities.map((id) => (
                <button key={id} onClick={() => setEntityId(id)}
                  className="text-xs font-bold px-2.5 py-1 rounded-lg transition-colors hover:opacity-80"
                  style={{ background: 'var(--sky-50)', color: 'var(--sky-700)' }}>
                  {id}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Assessment Type Cards */}
        <div className="mb-6">
          <label className="block text-xs font-bold uppercase tracking-wider mb-3"
            style={{ color: 'var(--text-secondary)' }}>
            Assessment Type
          </label>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {input_schema.type_options.map((opt) => {
              const selected = assessmentType === opt.value;
              return (
                <button
                  key={opt.value}
                  onClick={() => setAssessmentType(opt.value)}
                  className="flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all duration-200 cursor-pointer"
                  style={{
                    borderColor: selected ? 'var(--sky-700)' : '#E7E5E4',
                    background: selected ? 'var(--sky-50)' : 'white',
                    transform: selected ? 'scale(1.02)' : 'scale(1)',
                  }}
                >
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                    style={{ background: selected ? 'linear-gradient(135deg, #0284C7, #38BDF8)' : '#F5F5F4' }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                      stroke={selected ? 'white' : '#78716C'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d={typeIcons[opt.value] || typeIcons.FULL} />
                    </svg>
                  </div>
                  <span className="text-xs font-bold" style={{ color: selected ? 'var(--sky-700)' : 'var(--text-secondary)' }}>
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
          className="w-full py-3.5 rounded-xl text-sm font-bold text-white transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed hover:scale-[1.01] active:scale-[0.99]"
          style={{ background: 'linear-gradient(135deg, #0284C7, #38BDF8)' }}
        >
          {status === 'running' ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="white" strokeWidth="3" opacity="0.3" />
                <path d="M12 2a10 10 0 019.8 8" stroke="white" strokeWidth="3" strokeLinecap="round" />
              </svg>
              Assessment in Progress...
            </span>
          ) : (
            <span className="flex items-center justify-center gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Run Claims Assessment
            </span>
          )}
        </button>
      </div>

      {/* ── Processing Flow ── */}
      {status === 'running' && (
        <div className="card animate-fadeSlideUp">
          <h3 className="text-sm font-bold mb-5" style={{ color: 'var(--charcoal)' }}>Assessment Pipeline</h3>
          <div className="flex items-center justify-between mb-6">
            {flowLabels.map((label, i) => (
              <div key={label} className="flex items-center gap-3 flex-1">
                <div className="flex flex-col items-center">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-500 ${
                      activeStep > i ? 'text-white' : activeStep === i ? 'text-white animate-pulseSky' : 'text-gray-400'
                    }`}
                    style={{
                      background: activeStep > i
                        ? 'var(--sky-700)'
                        : activeStep === i
                          ? 'linear-gradient(135deg, #0284C7, #38BDF8)'
                          : '#F5F5F4',
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
                      background: activeStep > i ? 'var(--sky-700)' : '#E7E5E4',
                      transition: 'background 0.5s ease',
                    }} />
                )}
              </div>
            ))}
          </div>

          {/* Agent Status Cards */}
          <div className="grid grid-cols-3 gap-3">
            {config.agents.map((agent, i) => {
              const agentColors = ['#0284C7', '#F97316', '#16A34A'];
              const isActive = activeStep === i;
              const isDone = activeStep > i;
              return (
                <div key={agent.id}
                  className="p-3 rounded-xl border transition-all duration-300"
                  style={{
                    borderColor: isActive ? agentColors[i] : isDone ? 'var(--green-600)' : '#E7E5E4',
                    background: isActive ? `${agentColors[i]}08` : isDone ? 'var(--green-50)' : 'white',
                  }}>
                  <div className="flex items-center gap-2 mb-2">
                    {isDone ? (
                      <div className="w-5 h-5 rounded-full flex items-center justify-center" style={{ background: 'var(--green-50)' }}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--green-600)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      </div>
                    ) : isActive ? (
                      <div className="w-5 h-5 rounded-full flex items-center justify-center"
                        style={{ background: `${agentColors[i]}20` }}>
                        <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: agentColors[i] }} />
                      </div>
                    ) : (
                      <div className="w-5 h-5 rounded-full" style={{ background: 'var(--stone-100)' }} />
                    )}
                    <span className="text-xs font-bold" style={{ color: 'var(--charcoal)' }}>{agent.name}</span>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--stone-100)' }}>
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
        <div className="card animate-fadeSlideUp" style={{ borderLeft: '4px solid var(--red-600)' }}>
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'var(--red-50)' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--red-600)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
            </div>
            <div>
              <h3 className="text-sm font-bold mb-1" style={{ color: 'var(--red-600)' }}>Assessment Error</h3>
              <p className="text-xs" style={{ color: 'var(--red-500)' }}>{error}</p>
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
