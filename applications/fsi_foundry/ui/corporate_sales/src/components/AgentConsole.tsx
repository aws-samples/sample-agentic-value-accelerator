// @ts-nocheck
import { useState } from 'react';
import type { RuntimeConfig } from '../config';
import type { SalesResponse, ExecutionStatus } from '../types';
import { invokeAgent } from '../api/client';
import ResultsPanel from './ResultsPanel';

interface Props {
  config: RuntimeConfig;
}

/* ── Agent progress stages ─────────────────────── */
const AGENT_STAGES = [
  { id: 'lead_scorer', label: 'Lead Scorer', description: 'Scoring lead...' },
  { id: 'opportunity_analyst', label: 'Opportunity Analyst', description: 'Analyzing pipeline...' },
  { id: 'pitch_preparer', label: 'Pitch Preparer', description: 'Preparing pitch...' },
];

export default function AgentConsole({ config }: Props) {
  const [entityId, setEntityId] = useState('');
  const [analysisType, setAnalysisType] = useState(config.input_schema.type_options[0]?.value ?? 'full');
  const [status, setStatus] = useState<ExecutionStatus>('idle');
  const [result, setResult] = useState<SalesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeStage, setActiveStage] = useState(-1);

  const handleSubmit = async () => {
    const id = entityId.trim();
    if (!id) return;

    setStatus('running');
    setResult(null);
    setError(null);
    setActiveStage(0);

    // Simulate stage progression
    const stageTimer = setInterval(() => {
      setActiveStage((prev) => {
        if (prev >= AGENT_STAGES.length - 1) {
          clearInterval(stageTimer);
          return prev;
        }
        return prev + 1;
      });
    }, 3000);

    try {
      const payload: Record<string, string> = {
        [config.input_schema.id_field]: id,
        [config.input_schema.type_field]: analysisType,
      };
      const data = await invokeAgent(config, payload);
      setResult(data);
      setStatus('complete');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred.');
      setStatus('error');
    } finally {
      clearInterval(stageTimer);
      setActiveStage(AGENT_STAGES.length);
    }
  };

  const handleReset = () => {
    setEntityId('');
    setAnalysisType(config.input_schema.type_options[0]?.value ?? 'full');
    setStatus('idle');
    setResult(null);
    setError(null);
    setActiveStage(-1);
  };

  return (
    <div style={{ maxWidth: '64rem', margin: '0 auto', padding: '2rem 1.5rem 4rem' }}>
      {/* ── Header ─────────────────────────────── */}
      <div className="animate-fade-slide-up" style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#1F2937', marginBottom: '0.25rem' }}>
          Lead Analysis Console
        </h1>
        <p style={{ fontSize: '0.9rem', color: '#6B7280' }}>
          Enter a client or lead ID and select the type of analysis to run.
        </p>
      </div>

      {/* ── Input Section ──────────────────────── */}
      <div className="card animate-fade-slide-up stagger-1" style={{ marginBottom: '1.5rem' }}>
        {/* Entity ID input */}
        <div style={{ marginBottom: '1.25rem' }}>
          <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#374151', marginBottom: '0.5rem' }}>
            {config.input_schema.id_label}
          </label>
          <input
            type="text"
            value={entityId}
            onChange={(e) => setEntityId(e.target.value)}
            placeholder={config.input_schema.id_placeholder}
            disabled={status === 'running'}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            style={{
              width: '100%',
              padding: '0.75rem 1rem',
              borderRadius: '8px',
              border: '2px solid #E5E7EB',
              fontSize: '0.9rem',
              fontFamily: 'monospace',
              outline: 'none',
              transition: 'border-color 0.2s ease',
              background: status === 'running' ? '#F9FAFB' : 'white',
            }}
            onFocus={(e) => (e.target.style.borderColor = '#D4A017')}
            onBlur={(e) => (e.target.style.borderColor = '#E5E7EB')}
          />
          {config.input_schema.test_entities.length > 0 && (
            <div style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.7rem', color: '#9CA3AF' }}>Quick:</span>
              {config.input_schema.test_entities.map((te) => (
                <button
                  key={te}
                  onClick={() => setEntityId(te)}
                  disabled={status === 'running'}
                  style={{
                    padding: '0.2rem 0.5rem',
                    borderRadius: '4px',
                    border: '1px solid #FCD34D',
                    background: '#FFFBEB',
                    color: '#92400E',
                    fontSize: '0.7rem',
                    fontFamily: 'monospace',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {te}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Analysis type selection as cards */}
        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#374151', marginBottom: '0.5rem' }}>
            Analysis Type
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(10rem, 1fr))', gap: '0.5rem' }}>
            {config.input_schema.type_options.map((opt) => {
              const isSelected = analysisType === opt.value;
              return (
                <button
                  key={opt.value}
                  onClick={() => setAnalysisType(opt.value)}
                  disabled={status === 'running'}
                  style={{
                    padding: '0.75rem',
                    borderRadius: '8px',
                    border: `2px solid ${isSelected ? '#D4A017' : '#E5E7EB'}`,
                    background: isSelected ? '#FFFBEB' : 'white',
                    color: isSelected ? '#92400E' : '#6B7280',
                    fontSize: '0.8rem',
                    fontWeight: isSelected ? 700 : 500,
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    textAlign: 'center',
                  }}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Submit / Reset */}
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button
            onClick={handleSubmit}
            disabled={!entityId.trim() || status === 'running'}
            style={{
              flex: 1,
              padding: '0.75rem 1.5rem',
              borderRadius: '8px',
              border: 'none',
              background: (!entityId.trim() || status === 'running')
                ? '#E5E7EB'
                : 'linear-gradient(135deg, #D4A017, #F5C842)',
              color: (!entityId.trim() || status === 'running') ? '#9CA3AF' : '#1F2937',
              fontWeight: 700,
              fontSize: '0.9rem',
              cursor: (!entityId.trim() || status === 'running') ? 'not-allowed' : 'pointer',
              boxShadow: (!entityId.trim() || status === 'running') ? 'none' : '0 4px 12px rgba(212, 160, 23, 0.25)',
              transition: 'all 0.2s ease',
            }}
          >
            {status === 'running' ? 'Analyzing...' : 'Analyze'}
          </button>
          {(status === 'complete' || status === 'error') && (
            <button
              onClick={handleReset}
              style={{
                padding: '0.75rem 1.5rem',
                borderRadius: '8px',
                border: '2px solid #E5E7EB',
                background: 'white',
                color: '#6B7280',
                fontWeight: 600,
                fontSize: '0.9rem',
                cursor: 'pointer',
              }}
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* ── Processing State ───────────────────── */}
      {status === 'running' && (
        <div className="card animate-fade-slide-up" style={{ marginBottom: '1.5rem' }}>
          <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#1F2937', marginBottom: '1rem' }}>Agent Pipeline</h3>

          {/* Gold gradient progress bar */}
          <div style={{ height: '4px', borderRadius: '999px', background: '#F3F4F6', marginBottom: '1.5rem', overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              borderRadius: '999px',
              background: 'linear-gradient(90deg, #D4A017, #F5C842, #D4A017)',
              backgroundSize: '200% 100%',
              animation: 'progressFill 2s ease-out forwards, shimmer 1.5s ease-in-out infinite',
              width: `${Math.min(((activeStage + 1) / AGENT_STAGES.length) * 100, 100)}%`,
              transition: 'width 0.5s ease',
            }} />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {AGENT_STAGES.map((stage, i) => {
              const isActive = i === activeStage;
              const isDone = i < activeStage;
              return (
                <div
                  key={stage.id}
                  className="animate-slide-right"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    padding: '0.75rem 1rem',
                    borderRadius: '8px',
                    background: isActive ? '#FFFBEB' : isDone ? '#F0FDF4' : '#F9FAFB',
                    border: `1px solid ${isActive ? '#FCD34D' : isDone ? '#86EFAC' : '#E5E7EB'}`,
                    animationDelay: `${i * 0.1}s`,
                  }}
                >
                  {/* Status icon */}
                  <div style={{
                    width: '1.75rem',
                    height: '1.75rem',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    background: isDone ? '#22C55E' : isActive ? 'linear-gradient(135deg, #D4A017, #F5C842)' : '#E5E7EB',
                  }}>
                    {isDone ? (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    ) : isActive ? (
                      <div style={{
                        width: '10px',
                        height: '10px',
                        border: '2px solid white',
                        borderTopColor: 'transparent',
                        borderRadius: '50%',
                        animation: 'spin 0.8s linear infinite',
                      }} />
                    ) : (
                      <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#9CA3AF' }} />
                    )}
                  </div>

                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.85rem', color: isDone ? '#166534' : isActive ? '#92400E' : '#6B7280' }}>
                      {stage.label}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: isDone ? '#22C55E' : isActive ? '#D4A017' : '#9CA3AF' }}>
                      {isDone ? 'Complete' : isActive ? stage.description : 'Pending'}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Error State ────────────────────────── */}
      {status === 'error' && error && (
        <div className="card animate-fade-slide-up" style={{ borderLeft: '4px solid #DC2626', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
            <div style={{
              width: '2rem', height: '2rem', borderRadius: '50%', background: '#FEE2E2',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2.5" strokeLinecap="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
            </div>
            <div>
              <h3 style={{ fontWeight: 700, fontSize: '0.9rem', color: '#991B1B', marginBottom: '0.25rem' }}>Analysis Failed</h3>
              <p style={{ fontSize: '0.8rem', color: '#DC2626', fontFamily: 'monospace' }}>{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* ── Results ────────────────────────────── */}
      {status === 'complete' && result && <ResultsPanel result={result} />}
    </div>
  );
}
