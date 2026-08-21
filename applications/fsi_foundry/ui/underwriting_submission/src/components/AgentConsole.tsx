import { useState, useCallback, useEffect, useRef } from 'react';
import type { RuntimeConfig } from '../config';
import type { SubmissionResponse, ExecutionStatus } from '../types';
import { invokeAgent } from '../api/client';
import ResultsPanel from './ResultsPanel';

interface Props {
  config: RuntimeConfig;
}

const typeIcons: Record<string, string> = {
  full: 'M4 6h16M4 12h16M4 18h16',
  appetite_only: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
  exposure_only: 'M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 00-9.78 2.096A4.001 4.001 0 003 15z',
  pricing_only: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
};

/** Which specialists each triage mode runs — mirrors MODE_AGENTS in the orchestrator. */
const modeAgents: Record<string, string[]> = {
  full: ['appetite_screener', 'exposure_analyst', 'pricing_indicator'],
  appetite_only: ['appetite_screener'],
  exposure_only: ['exposure_analyst'],
  pricing_only: ['pricing_indicator'],
};

/** Non-routine modes, so the console says who they're for rather than implying otherwise. */
const modeHints: Record<string, string> = {
  full: 'Runs all three specialists in parallel and reaches a quote / refer / decline decision.',
  appetite_only: 'Cheap first pass — is the risk permitted at all? Returns no overall decision.',
  exposure_only: 'Portfolio and catastrophe-modelling view. Returns no overall decision.',
  pricing_only: 'Actuarial benchmarking, including on business already declined. Returns no overall decision.',
};

const agentColors = ['#0284C7', '#F97316', '#16A34A'];

export default function AgentConsole({ config }: Props) {
  const { input_schema } = config;
  const [entityId, setEntityId] = useState('');
  const [triageType, setTriageType] = useState(input_schema.type_options[0].value);
  const [status, setStatus] = useState<ExecutionStatus>('idle');
  const [result, setResult] = useState<SubmissionResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<number | undefined>(undefined);

  const activeAgents = config.agents.filter((a) =>
    (modeAgents[triageType] ?? modeAgents.full).includes(a.id),
  );

  // A full triage takes 1-5 minutes, so show elapsed time rather than a fake
  // step animation that could finish before the agents do.
  useEffect(() => {
    if (status === 'running') {
      timerRef.current = window.setInterval(() => setElapsed((e) => e + 1), 1000);
    } else if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = undefined;
    }
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [status]);

  const handleSubmit = useCallback(async () => {
    if (!entityId.trim()) return;
    setStatus('running');
    setError(null);
    setResult(null);
    setElapsed(0);

    try {
      const payload: Record<string, string> = {
        [input_schema.id_field]: entityId.trim(),
        [input_schema.type_field]: triageType,
      };
      const res = await invokeAgent(config, payload);
      setResult(res);
      setStatus('complete');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
      setStatus('error');
    }
  }, [entityId, triageType, config, input_schema]);

  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const ss = String(elapsed % 60).padStart(2, '0');

  return (
    <div className="max-w-6xl mx-auto px-6 py-10 space-y-8">

      {/* ── Header ── */}
      <div className="animate-fadeSlideUp">
        <h1 className="text-3xl font-extrabold tracking-tight heading-dash" style={{ color: 'var(--charcoal)' }}>
          Triage Console
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
          Screen a broker submission through the AI underwriting triage engine
        </p>
      </div>

      {/* ── Input Form ── */}
      <div className="card animate-fadeSlideUp stagger-1">
        {/* Submission ID */}
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

        {/* Triage Type */}
        <div className="mb-6">
          <label className="block text-xs font-bold uppercase tracking-wider mb-3"
            style={{ color: 'var(--text-secondary)' }}>
            Triage Scope
          </label>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {input_schema.type_options.map((opt) => {
              const selected = triageType === opt.value;
              return (
                <button
                  key={opt.value}
                  onClick={() => setTriageType(opt.value)}
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
                      <path d={typeIcons[opt.value] || typeIcons.full} />
                    </svg>
                  </div>
                  <span className="text-xs font-bold text-center" style={{ color: selected ? 'var(--sky-700)' : 'var(--text-secondary)' }}>
                    {opt.label}
                  </span>
                </button>
              );
            })}
          </div>
          {modeHints[triageType] && (
            <p className="text-xs mt-3 px-3 py-2 rounded-lg" style={{ background: 'var(--stone-50)', color: 'var(--text-muted)' }}>
              {modeHints[triageType]}
            </p>
          )}
        </div>

        {/* Submit */}
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
              Triage in Progress — {mm}:{ss}
            </span>
          ) : (
            <span className="flex items-center justify-center gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Run Submission Triage
            </span>
          )}
        </button>
      </div>

      {/* ── Running: which specialists are working ── */}
      {status === 'running' && (
        <div className="card animate-fadeSlideUp">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-sm font-bold" style={{ color: 'var(--charcoal)' }}>
              {activeAgents.length === 1 ? 'Specialist Running' : `${activeAgents.length} Specialists Running in Parallel`}
            </h3>
            <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-lg"
              style={{ background: 'var(--sky-50)', color: 'var(--sky-700)' }}>
              {mm}:{ss}
            </span>
          </div>

          <div className={`grid gap-3 ${activeAgents.length === 1 ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-3'}`}>
            {activeAgents.map((agent) => {
              const idx = config.agents.findIndex((a) => a.id === agent.id);
              const color = agentColors[idx] ?? agentColors[0];
              return (
                <div key={agent.id}
                  className="p-3 rounded-xl border transition-all duration-300"
                  style={{ borderColor: color, background: `${color}08` }}>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-5 h-5 rounded-full flex items-center justify-center"
                      style={{ background: `${color}20` }}>
                      <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: color }} />
                    </div>
                    <span className="text-xs font-bold" style={{ color: 'var(--charcoal)' }}>{agent.name}</span>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--stone-100)' }}>
                    <div className="h-full rounded-full animate-pulse"
                      style={{ width: '60%', background: `linear-gradient(90deg, ${color}, ${color}88)` }} />
                  </div>
                </div>
              );
            })}
          </div>

          <p className="text-xs mt-4 text-center" style={{ color: 'var(--text-muted)' }}>
            {activeAgents.length > 1
              ? 'A full triage runs three agents plus a synthesis step and typically takes one to five minutes.'
              : 'A single-specialist run typically takes 20 to 60 seconds.'}
          </p>
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
              <h3 className="text-sm font-bold mb-1" style={{ color: 'var(--red-600)' }}>Triage Error</h3>
              <p className="text-xs" style={{ color: 'var(--red-500)' }}>{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* ── Results ── */}
      {status === 'complete' && result && <ResultsPanel result={result} />}
    </div>
  );
}
