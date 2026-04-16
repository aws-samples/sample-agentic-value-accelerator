// @ts-nocheck
import { useState, useCallback } from 'react';
import type { RuntimeConfig } from '../config';
import type { SurveillanceResponse, ExecutionStatus } from '../types';
import { invokeAgent } from '../api/client';
import ResultsPanel from './ResultsPanel';

interface Props {
  config: RuntimeConfig;
}

const typeIcons: Record<string, string> = {
  FULL: 'M4 6h16M4 12h16M4 18h16',
  TRADE_ONLY: 'M3 3v18h18 M18.7 8l-5.1 5.2-2.8-2.7L7 14.3',
  COMMS_ONLY: 'M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z',
  ALERT_ONLY: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z',
};

const flowLabels = ['Analyzing Trades', 'Monitoring Comms', 'Generating Alerts'];

export default function AgentConsole({ config }: Props) {
  const { input_schema } = config;
  const [entityId, setEntityId] = useState('');
  const [surveillanceType, setSurveillanceType] = useState(input_schema.type_options[0].value);
  const [status, setStatus] = useState<ExecutionStatus>('idle');
  const [result, setResult] = useState<SurveillanceResponse | null>(null);
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
        [input_schema.type_field]: surveillanceType,
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
  }, [entityId, surveillanceType, config, input_schema]);

  return (
    <div className="max-w-6xl mx-auto px-6 py-10 space-y-8">

      {/* ── Header ── */}
      <div className="animate-fadeSlideUp">
        <h1 className="text-3xl font-extrabold tracking-tight" style={{ color: 'var(--zinc-300)' }}>
          Surveillance Console
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--zinc-500)' }}>
          Run market surveillance analysis through the AI surveillance engine
        </p>
      </div>

      {/* ── Input Form ── */}
      <div className="card animate-fadeSlideUp stagger-1">
        {/* Customer ID */}
        <div className="mb-6">
          <label className="block text-xs font-bold uppercase tracking-wider mb-2"
            style={{ color: 'var(--zinc-400)' }}>
            {input_schema.id_label}
          </label>
          <input
            type="text"
            value={entityId}
            onChange={(e) => setEntityId(e.target.value)}
            placeholder={input_schema.id_placeholder}
            className="w-full px-4 py-3 rounded-xl border-2 text-sm font-medium transition-all duration-200 outline-none"
            style={{
              borderColor: entityId ? 'var(--cyan-500)' : 'var(--zinc-700)',
              background: entityId ? 'rgba(6,182,212,0.05)' : 'var(--zinc-800)',
              color: 'var(--zinc-300)',
            }}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          />
          {input_schema.test_entities.length > 0 && (
            <div className="flex items-center gap-2 mt-2">
              <span className="text-xs" style={{ color: 'var(--zinc-500)' }}>Try:</span>
              {input_schema.test_entities.map((id) => (
                <button key={id} onClick={() => setEntityId(id)}
                  className="text-xs font-bold px-2.5 py-1 rounded-lg transition-colors hover:opacity-80"
                  style={{ background: 'rgba(6,182,212,0.1)', color: 'var(--cyan-400)', border: '1px solid rgba(6,182,212,0.2)' }}>
                  {id}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Surveillance Type Cards */}
        <div className="mb-6">
          <label className="block text-xs font-bold uppercase tracking-wider mb-3"
            style={{ color: 'var(--zinc-400)' }}>
            Surveillance Type
          </label>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {input_schema.type_options.map((opt) => {
              const selected = surveillanceType === opt.value;
              return (
                <button
                  key={opt.value}
                  onClick={() => setSurveillanceType(opt.value)}
                  className="flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all duration-200 cursor-pointer"
                  style={{
                    borderColor: selected ? 'var(--cyan-500)' : 'var(--zinc-700)',
                    background: selected ? 'rgba(6,182,212,0.08)' : 'var(--zinc-800)',
                    transform: selected ? 'scale(1.02)' : 'scale(1)',
                  }}
                >
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                    style={{ background: selected ? 'linear-gradient(135deg, #164E63, #06B6D4)' : 'var(--zinc-700)' }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                      stroke={selected ? 'white' : '#71717A'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d={typeIcons[opt.value] || typeIcons.FULL} />
                    </svg>
                  </div>
                  <span className="text-xs font-bold" style={{ color: selected ? 'var(--cyan-400)' : 'var(--zinc-500)' }}>
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
          style={{ background: 'linear-gradient(135deg, #164E63, #06B6D4)' }}
        >
          {status === 'running' ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="white" strokeWidth="3" opacity="0.3" />
                <path d="M12 2a10 10 0 019.8 8" stroke="white" strokeWidth="3" strokeLinecap="round" />
              </svg>
              Surveillance in Progress...
            </span>
          ) : (
            <span className="flex items-center justify-center gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
              Run Market Surveillance
            </span>
          )}
        </button>
      </div>

      {/* ── Processing Flow ── */}
      {status === 'running' && (
        <div className="card animate-fadeSlideUp">
          <h3 className="text-sm font-bold mb-5" style={{ color: 'var(--zinc-300)' }}>Surveillance Pipeline</h3>
          <div className="flex items-center justify-between mb-6">
            {flowLabels.map((label, i) => (
              <div key={label} className="flex items-center gap-3 flex-1">
                <div className="flex flex-col items-center">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-500 ${
                      activeStep > i ? 'text-white' : activeStep === i ? 'text-white animate-pulseCyan' : ''
                    }`}
                    style={{
                      background: activeStep > i
                        ? 'var(--green-500)'
                        : activeStep === i
                          ? 'linear-gradient(135deg, #164E63, #06B6D4)'
                          : 'var(--zinc-800)',
                      color: activeStep > i || activeStep === i ? 'white' : 'var(--zinc-500)',
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
                    color: activeStep >= i ? 'var(--zinc-300)' : 'var(--zinc-600)',
                  }}>{label}</span>
                </div>
                {i < flowLabels.length - 1 && (
                  <div className="flex-1 h-1 rounded-full mx-2 mt-[-20px]"
                    style={{
                      background: activeStep > i ? 'var(--green-500)' : 'var(--zinc-800)',
                      transition: 'background 0.5s ease',
                    }} />
                )}
              </div>
            ))}
          </div>

          {/* Agent Status Cards */}
          <div className="grid grid-cols-3 gap-3">
            {config.agents.map((agent, i) => {
              const agentColors = ['#06B6D4', '#F97316', '#22C55E'];
              const isActive = activeStep === i;
              const isDone = activeStep > i;
              return (
                <div key={agent.id}
                  className="p-3 rounded-xl border transition-all duration-300"
                  style={{
                    borderColor: isActive ? agentColors[i] : isDone ? 'var(--green-500)' : 'var(--zinc-800)',
                    background: isActive ? `${agentColors[i]}10` : isDone ? 'rgba(34,197,94,0.05)' : 'var(--zinc-900)',
                  }}>
                  <div className="flex items-center gap-2 mb-2">
                    {isDone ? (
                      <div className="w-5 h-5 rounded-full flex items-center justify-center" style={{ background: 'rgba(34,197,94,0.15)' }}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      </div>
                    ) : isActive ? (
                      <div className="w-5 h-5 rounded-full flex items-center justify-center"
                        style={{ background: `${agentColors[i]}20` }}>
                        <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: agentColors[i] }} />
                      </div>
                    ) : (
                      <div className="w-5 h-5 rounded-full" style={{ background: 'var(--zinc-800)' }} />
                    )}
                    <span className="text-xs font-bold" style={{ color: 'var(--zinc-300)' }}>{agent.name}</span>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--zinc-800)' }}>
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
            <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(239,68,68,0.1)' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
            </div>
            <div>
              <h3 className="text-sm font-bold mb-1" style={{ color: 'var(--red-400)' }}>Surveillance Error</h3>
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
