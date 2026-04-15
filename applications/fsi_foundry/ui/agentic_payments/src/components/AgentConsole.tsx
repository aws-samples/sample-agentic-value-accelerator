// @ts-nocheck
import { useState, useEffect, useCallback } from 'react';
import type { RuntimeConfig } from '../config';
import type { PaymentResponse, ExecutionStatus } from '../types';
import { invokeAgent } from '../api/client';
import ResultsPanel from './ResultsPanel';

interface Props {
  config: RuntimeConfig;
}

const paymentTypeIcons: Record<string, string> = {
  wire: '\u2194',
  ach: '\u21C4',
  real_time: '\u26A1',
  international: '\u{1F310}',
  domestic: '\u{1F3E6}',
};

const pipelineStages = [
  { key: 'validation', label: 'Validation', icon: '\u2713', agentName: 'Payment Validator', color: 'var(--emerald-600)', bgColor: 'var(--emerald-50)' },
  { key: 'routing', label: 'Routing', icon: '\u2191', agentName: 'Routing Agent', color: 'var(--blue-500)', bgColor: 'var(--blue-50)' },
  { key: 'reconciliation', label: 'Reconciliation', icon: '\u2261', agentName: 'Reconciliation Agent', color: 'var(--slate-700)', bgColor: 'var(--slate-100)' },
];

export default function AgentConsole({ config }: Props) {
  const { input_schema } = config;
  const [paymentId, setPaymentId] = useState('');
  const [paymentType, setPaymentType] = useState(input_schema.type_options[0]?.value || '');
  const [status, setStatus] = useState<ExecutionStatus>('idle');
  const [result, setResult] = useState<PaymentResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeStage, setActiveStage] = useState(-1);
  const [progress, setProgress] = useState(0);

  // Simulate pipeline progress during execution
  useEffect(() => {
    if (status !== 'running') return;

    setActiveStage(0);
    setProgress(10);

    const timers = [
      setTimeout(() => { setActiveStage(1); setProgress(40); }, 2000),
      setTimeout(() => { setActiveStage(2); setProgress(70); }, 4000),
      setTimeout(() => setProgress(85), 5500),
    ];

    return () => timers.forEach(clearTimeout);
  }, [status]);

  const handleSubmit = useCallback(async () => {
    if (!paymentId.trim()) return;

    setStatus('running');
    setResult(null);
    setError(null);
    setActiveStage(-1);
    setProgress(0);

    try {
      const payload: Record<string, string> = {
        [input_schema.id_field]: paymentId.trim(),
        [input_schema.type_field]: paymentType,
      };

      const response = await invokeAgent(config, payload);
      setResult(response);
      setStatus('complete');
      setActiveStage(3);
      setProgress(100);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
      setStatus('error');
      setProgress(0);
      setActiveStage(-1);
    }
  }, [config, paymentId, paymentType, input_schema]);

  const handleReset = () => {
    setStatus('idle');
    setResult(null);
    setError(null);
    setActiveStage(-1);
    setProgress(0);
    setPaymentId('');
  };

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="mb-8 animate-fade-in">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--slate-900)' }}>
          Payment Processing Console
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
          Submit a payment for AI-powered validation, routing, and reconciliation
        </p>
      </div>

      {/* Input Form */}
      <div className="card mb-6 animate-slide-up">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          {/* Payment ID */}
          <div>
            <label
              className="block text-sm font-semibold mb-2"
              style={{ color: 'var(--text-primary)' }}
            >
              {input_schema.id_label}
            </label>
            <input
              type="text"
              value={paymentId}
              onChange={(e) => setPaymentId(e.target.value)}
              placeholder={input_schema.id_placeholder}
              disabled={status === 'running'}
              className="w-full px-4 py-3 rounded-lg text-sm outline-none transition-all"
              style={{
                border: '1px solid var(--border-color)',
                background: 'var(--white)',
                color: 'var(--text-primary)',
              }}
              onFocus={(e) => (e.target.style.borderColor = 'var(--emerald-500)')}
              onBlur={(e) => (e.target.style.borderColor = 'var(--border-color)')}
            />
            {input_schema.test_entities.length > 0 && (
              <div className="mt-2 flex items-center gap-2">
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Try:</span>
                {input_schema.test_entities.map((id) => (
                  <button
                    key={id}
                    onClick={() => setPaymentId(id)}
                    className="text-xs px-2 py-1 rounded cursor-pointer border-none"
                    style={{
                      background: 'var(--slate-100)',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    {id}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Payment Type Selection */}
          <div>
            <label
              className="block text-sm font-semibold mb-2"
              style={{ color: 'var(--text-primary)' }}
            >
              Payment Type
            </label>
            <div className="grid grid-cols-2 gap-2">
              {input_schema.type_options.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setPaymentType(opt.value)}
                  disabled={status === 'running'}
                  className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium cursor-pointer transition-all border"
                  style={{
                    background: paymentType === opt.value ? 'var(--emerald-50)' : 'var(--white)',
                    borderColor: paymentType === opt.value ? 'var(--emerald-500)' : 'var(--border-color)',
                    color: paymentType === opt.value ? 'var(--emerald-600)' : 'var(--text-secondary)',
                  }}
                >
                  <span className="text-base">{paymentTypeIcons[opt.value] || '\u25CF'}</span>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Submit / Reset */}
        <div className="flex items-center gap-3">
          {status === 'idle' || status === 'error' ? (
            <button
              onClick={handleSubmit}
              disabled={!paymentId.trim() || status === 'running'}
              className="btn-primary"
            >
              Process Payment
            </button>
          ) : (
            <button
              onClick={handleReset}
              className="px-6 py-3 rounded-lg text-sm font-semibold cursor-pointer border transition-colors"
              style={{
                background: 'var(--white)',
                borderColor: 'var(--border-color)',
                color: 'var(--text-secondary)',
              }}
            >
              New Payment
            </button>
          )}
        </div>
      </div>

      {/* Pipeline Progress */}
      {status !== 'idle' && (
        <div className="card mb-6 animate-slide-up-delay-1">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              Processing Pipeline
            </h3>
            {status === 'running' && (
              <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
                Processing...
              </span>
            )}
            {status === 'complete' && (
              <span className="status-pill approved text-xs">Complete</span>
            )}
            {status === 'error' && (
              <span className="status-pill rejected text-xs">Failed</span>
            )}
          </div>

          {/* Progress bar */}
          <div className="progress-bar mb-6">
            <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
          </div>

          {/* Pipeline steps */}
          <div className="flex items-start">
            {pipelineStages.map((stage, i) => {
              const isComplete = activeStage > i;
              const isActive = activeStage === i;
              const stateClass = isComplete ? 'complete' : isActive ? 'active' : '';

              return (
                <div key={stage.key} className="contents">
                  <div className={`pipeline-step ${stateClass}`}>
                    <div
                      className="pipeline-step-icon"
                      style={
                        isComplete
                          ? { background: stage.color, borderColor: stage.color, color: 'white' }
                          : isActive
                          ? { background: stage.bgColor, borderColor: stage.color, color: stage.color }
                          : {}
                      }
                    >
                      {isComplete ? (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      ) : (
                        <span className="text-lg">{stage.icon}</span>
                      )}
                    </div>
                    <span className="pipeline-step-label">{stage.label}</span>
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      {stage.agentName}
                    </span>
                    {isActive && (
                      <div className="flex items-center gap-1 mt-1">
                        <span className="agent-dot running" />
                        <span className="text-xs" style={{ color: 'var(--emerald-600)' }}>Running</span>
                      </div>
                    )}
                  </div>
                  {i < pipelineStages.length - 1 && (
                    <div className={`pipeline-connector ${isComplete ? 'active' : ''}`} />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Agent Status Cards */}
      {status === 'running' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 animate-slide-up-delay-2">
          {pipelineStages.map((stage, i) => {
            const isComplete = activeStage > i;
            const isActive = activeStage === i;
            const agentStatus = isComplete ? 'complete' : isActive ? 'running' : 'idle';

            return (
              <div key={stage.key} className="card" style={{ padding: '16px 20px' }}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold"
                      style={{ background: stage.bgColor, color: stage.color }}
                    >
                      {stage.agentName.split(' ').map((w) => w[0]).join('')}
                    </div>
                    <div>
                      <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                        {stage.agentName}
                      </div>
                      <div className="text-xs capitalize" style={{ color: 'var(--text-muted)' }}>
                        {agentStatus}
                      </div>
                    </div>
                  </div>
                  <span className={`agent-dot ${agentStatus}`} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Error */}
      {error && (
        <div
          className="card mb-6 animate-slide-up"
          style={{ borderLeft: '4px solid var(--red-500)' }}
        >
          <div className="flex items-start gap-3">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--red-500)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-0.5">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
            <div>
              <h4 className="text-sm font-semibold" style={{ color: 'var(--red-500)' }}>
                Processing Failed
              </h4>
              <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
                {error}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Results */}
      {result && <ResultsPanel result={result} />}
    </div>
  );
}
