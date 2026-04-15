// @ts-nocheck
import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { RuntimeConfig } from '../config';
import type { OperationsResponse, ExecutionStatus } from '../types';
import { invokeAgent } from '../api/client';
import ResultsPanel from './ResultsPanel';

interface Props {
  config: RuntimeConfig;
}

/* ── Processing stage gauge (SVG) ── */
function StageGauge({ label, active, complete }: { label: string; active: boolean; complete: boolean }) {
  const radius = 32;
  const circumference = 2 * Math.PI * radius;
  const offset = complete ? 0 : active ? circumference * 0.3 : circumference;
  const color = complete ? 'var(--teal-light)' : active ? 'var(--copper-light)' : 'var(--steel)';

  return (
    <div style={{ textAlign: 'center' }}>
      <svg width="80" height="80" viewBox="0 0 80 80">
        <circle cx="40" cy="40" r={radius} className="gauge-ring-bg" strokeWidth="4" />
        <circle
          cx="40" cy="40" r={radius}
          className="gauge-ring"
          strokeWidth="4"
          stroke={color}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform="rotate(-90 40 40)"
        />
        {complete && (
          <text x="40" y="44" textAnchor="middle" fill="var(--teal-light)" fontSize="18" fontWeight="700">
            &#10003;
          </text>
        )}
        {active && !complete && (
          <circle cx="40" cy="40" r="4" fill={color} style={{ animation: 'dotPulse 1.5s ease-in-out infinite' }} />
        )}
        {!active && !complete && (
          <circle cx="40" cy="40" r="3" fill="var(--steel)" opacity="0.4" />
        )}
      </svg>
      <div style={{ fontSize: '0.75rem', fontWeight: 600, color, marginTop: 4 }}>
        {label}
      </div>
    </div>
  );
}

/* ── Agent status indicator ── */
function AgentStatusDot({ name, agentId, active }: { name: string; agentId: string; active: boolean }) {
  const isException = agentId === 'exception_handler';
  const color = isException ? 'var(--copper-light)' : 'var(--teal-light)';
  const bg = isException ? 'rgba(234,88,12,0.08)' : 'rgba(13,148,136,0.08)';
  const border = isException ? 'rgba(234,88,12,0.25)' : 'rgba(13,148,136,0.25)';

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        padding: '0.75rem 1rem',
        background: bg,
        border: `1px solid ${border}`,
        borderRadius: 8,
      }}
    >
      <div
        style={{
          width: 10,
          height: 10,
          borderRadius: '50%',
          background: active ? color : 'var(--steel)',
          animation: active ? 'dotPulse 1.5s ease-in-out infinite' : 'none',
        }}
      />
      <div>
        <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>{name}</div>
        <div className="mono" style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{agentId}</div>
      </div>
      <span
        className="mono"
        style={{
          marginLeft: 'auto',
          fontSize: '0.65rem',
          fontWeight: 600,
          padding: '0.2rem 0.5rem',
          borderRadius: 4,
          background: active ? `${isException ? 'rgba(234,88,12,0.15)' : 'rgba(13,148,136,0.15)'}` : 'rgba(71,85,105,0.15)',
          color: active ? color : 'var(--text-muted)',
        }}
      >
        {active ? 'ACTIVE' : 'IDLE'}
      </span>
    </div>
  );
}

/* ── Operation type descriptions ── */
const typeDescriptions: Record<string, string> = {
  full: 'Run both exception analysis and settlement processing',
  exception_only: 'Analyze payment exceptions and severity only',
  settlement_only: 'Process settlement verification and reconciliation only',
};

const typeIcons: Record<string, JSX.Element> = {
  full: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M8 12l2 2 4-4" />
    </svg>
  ),
  exception_only: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  ),
  settlement_only: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <path d="M12 12h.01" />
      <path d="M17 12h.01" />
      <path d="M7 12h.01" />
    </svg>
  ),
};

export default function AgentConsole({ config }: Props) {
  const [searchParams] = useSearchParams();
  const [customerId, setCustomerId] = useState(searchParams.get('id') || '');
  const [operationType, setOperationType] = useState('full');
  const [status, setStatus] = useState<ExecutionStatus>('idle');
  const [result, setResult] = useState<OperationsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [processingStage, setProcessingStage] = useState(0);

  // Simulate stage progression while running
  useEffect(() => {
    if (status !== 'running') return;
    setProcessingStage(0);
    const t1 = setTimeout(() => setProcessingStage(1), 3000);
    const t2 = setTimeout(() => setProcessingStage(2), 8000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [status]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!customerId.trim()) return;

    setStatus('running');
    setResult(null);
    setError(null);

    try {
      const payload: Record<string, string> = {
        [config.input_schema.id_field]: customerId.trim(),
        [config.input_schema.type_field]: operationType,
      };
      const res = await invokeAgent(config, payload);
      setResult(res);
      setStatus('complete');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
      setStatus('error');
    }
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-10">
      {/* Header */}
      <div className="mb-8">
        <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '0.3rem' }}>
          Operations Console
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
          Analyze payment exceptions and settlement operations
        </p>
      </div>

      {/* Input form */}
      <form onSubmit={handleSubmit}>
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          {/* ID input */}
          <div style={{ marginBottom: '1.25rem' }}>
            <label
              htmlFor="customer-id"
              style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.4rem' }}
            >
              {config.input_schema.id_label}
            </label>
            <input
              id="customer-id"
              type="text"
              className="ops-input"
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              placeholder={config.input_schema.id_placeholder}
              disabled={status === 'running'}
            />
            {config.input_schema.test_entities.length > 0 && (
              <div style={{ marginTop: '0.4rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Test:{' '}
                {config.input_schema.test_entities.map((id) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setCustomerId(id)}
                    className="mono"
                    style={{
                      background: 'rgba(234,88,12,0.08)',
                      border: '1px solid rgba(234,88,12,0.2)',
                      borderRadius: 4,
                      padding: '0.1rem 0.4rem',
                      color: 'var(--copper-light)',
                      cursor: 'pointer',
                      fontSize: '0.72rem',
                      marginLeft: '0.25rem',
                    }}
                  >
                    {id}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Operation type selection cards */}
          <div style={{ marginBottom: '1.25rem' }}>
            <label
              style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.5rem' }}
            >
              Operation Type
            </label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {config.input_schema.type_options.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={`selection-card ${operationType === opt.value ? 'selected' : ''}`}
                  onClick={() => setOperationType(opt.value)}
                  disabled={status === 'running'}
                  style={{ textAlign: 'left' }}
                >
                  <div style={{ color: operationType === opt.value ? 'var(--copper-light)' : 'var(--text-muted)', marginBottom: '0.5rem' }}>
                    {typeIcons[opt.value]}
                  </div>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)', marginBottom: '0.2rem' }}>
                    {opt.label}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                    {typeDescriptions[opt.value]}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Submit */}
          <button
            type="submit"
            className="btn-primary"
            disabled={!customerId.trim() || status === 'running'}
            style={{ width: '100%' }}
          >
            {status === 'running' ? 'Analyzing...' : 'Run Analysis'}
          </button>
        </div>
      </form>

      {/* ── Processing state ── */}
      {status === 'running' && (
        <div className="card animate-fade-slide-up" style={{ marginBottom: '1.5rem' }}>
          <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
            <h3 style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.3rem' }}>
              Processing Operations
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Running agent analysis pipeline...
            </p>
          </div>

          {/* Pipeline gauges */}
          <div className="flex items-center justify-center gap-8 mb-6">
            <StageGauge
              label="Exception Analysis"
              active={processingStage >= 0}
              complete={processingStage >= 1}
            />
            {/* Connector */}
            <div style={{ position: 'relative', width: 60, height: 2, background: 'rgba(71,85,105,0.3)' }}>
              <div
                style={{
                  position: 'absolute',
                  top: -3,
                  left: 0,
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: processingStage >= 1 ? 'var(--teal)' : 'var(--copper)',
                  animation: 'flowDot 2s ease-in-out infinite',
                }}
              />
            </div>
            <StageGauge
              label="Settlement Processing"
              active={processingStage >= 1}
              complete={processingStage >= 2}
            />
          </div>

          {/* Agent status indicators */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
            {config.agents.map((agent) => (
              <AgentStatusDot
                key={agent.id}
                name={agent.name}
                agentId={agent.id}
                active={
                  agent.id === 'exception_handler'
                    ? processingStage < 1
                    : processingStage >= 1
                }
              />
            ))}
          </div>

          {/* Progress bar */}
          <div style={{ background: 'rgba(71,85,105,0.2)', borderRadius: 6, height: 6, overflow: 'hidden' }}>
            <div
              style={{
                height: '100%',
                borderRadius: 6,
                background: 'linear-gradient(90deg, var(--copper), var(--teal))',
                width: processingStage === 0 ? '25%' : processingStage === 1 ? '60%' : '90%',
                transition: 'width 1.5s ease-in-out',
                animation: 'progressFill 1s ease-out',
              }}
            />
          </div>
        </div>
      )}

      {/* ── Error state ── */}
      {status === 'error' && error && (
        <div
          className="card animate-fade-slide-up"
          style={{
            marginBottom: '1.5rem',
            borderColor: 'rgba(220,38,38,0.3)',
            background: 'rgba(220,38,38,0.05)',
          }}
        >
          <div className="flex items-start gap-3">
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                background: 'rgba(220,38,38,0.12)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#F87171" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
            </div>
            <div>
              <h3 style={{ fontWeight: 700, color: '#F87171', fontSize: '0.95rem', marginBottom: '0.3rem' }}>
                Operation Failed
              </h3>
              <p className="mono" style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                {error}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Results ── */}
      {status === 'complete' && result && (
        <ResultsPanel result={result} config={config} />
      )}
    </div>
  );
}
