// @ts-nocheck
import { useState, useEffect } from 'react';
import type { RuntimeConfig } from '../config';
import type { MigrationResponse, ExecutionStatus } from '../types';
import { invokeAgent } from '../api/client';
import ResultsPanel from './ResultsPanel';

const scopeIcons: Record<string, string> = {
  FULL: '\u{1F680}',
  CODE_ANALYSIS: '\u{1F50D}',
  PLANNING: '\u{1F4CB}',
  CONVERSION: '\u{1F504}',
};

const scopeDescriptions: Record<string, string> = {
  FULL: 'Complete analysis, planning, and code conversion pipeline',
  CODE_ANALYSIS: 'Scan codebase for languages, dependencies, and risks',
  PLANNING: 'Generate migration plan with phases and effort estimates',
  CONVERSION: 'Convert legacy code to modern target framework',
};

/* ---- Typing Dots ---- */

function TypingDots({ color }: { color: string }) {
  return (
    <div className="flex items-center gap-1">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="w-1.5 h-1.5 rounded-full"
          style={{
            background: color,
            boxShadow: `0 0 4px ${color}`,
            animation: `typing 1.4s ${i * 0.2}s ease-in-out infinite`,
          }}
        />
      ))}
    </div>
  );
}

/* ---- Agent Status Card ---- */

function AgentWorkCard({ name, index, elapsed, agentId }: { name: string; index: number; elapsed: number; agentId: string }) {
  const stageMap: Record<string, string[]> = {
    code_analyzer: ['Scanning project structure', 'Detecting languages and frameworks', 'Analyzing dependencies', 'Identifying patterns and risks'],
    migration_planner: ['Queued', 'Evaluating analysis results', 'Creating migration phases', 'Estimating effort and risks'],
    conversion_agent: ['Queued', 'Mapping source to target patterns', 'Converting code modules', 'Scoring conversion confidence'],
  };
  const colorMap: Record<string, string> = {
    code_analyzer: '#22C55E',
    migration_planner: '#3B82F6',
    conversion_agent: '#F59E0B',
  };

  const stages = stageMap[agentId] || stageMap.code_analyzer;
  const color = colorMap[agentId] || '#22C55E';
  const agentElapsed = elapsed - index * 5;
  const stageIndex = Math.min(Math.floor(Math.max(agentElapsed, 0) / 10), stages.length - 1);
  const currentStage = agentElapsed > 0 ? stages[stageIndex] : 'Waiting...';
  const isActive = agentElapsed > 0;

  return (
    <div
      className="flex items-center gap-4 p-4 rounded-xl animate-slide-left"
      style={{
        background: isActive ? `${color}08` : 'var(--dark)',
        border: `1px solid ${isActive ? `${color}20` : 'var(--border)'}`,
        boxShadow: isActive ? `0 0 15px ${color}06` : 'none',
        animationDelay: `${index * 0.15}s`,
      }}
    >
      <div className="relative">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{
            background: `${color}0A`,
            border: `1px solid ${color}20`,
            boxShadow: isActive ? `0 0 10px ${color}15` : 'none',
          }}
        >
          {isActive ? (
            <svg className="w-5 h-5 animate-spin" style={{ color }} fill="none" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" strokeDasharray="31.4 31.4" strokeLinecap="round" />
            </svg>
          ) : (
            <div className="w-2 h-2 rounded-full" style={{ background: 'var(--text-muted)' }} />
          )}
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{name}</div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono" style={{ color: isActive ? color : 'var(--text-muted)', textShadow: isActive ? `0 0 6px ${color}40` : 'none' }}>
            {currentStage}
          </span>
          {isActive && <TypingDots color={color} />}
        </div>
      </div>
      <div className="text-xs font-mono tabular-nums" style={{ color: 'var(--text-muted)' }}>
        {agentElapsed > 0 ? `${agentElapsed}s` : '--'}
      </div>
    </div>
  );
}

/* ============================================
   MAIN COMPONENT
   ============================================ */

export default function AgentConsole({ config }: { config: RuntimeConfig }) {
  const { input_schema } = config;

  const [entityId, setEntityId] = useState('');
  const [selectedType, setSelectedType] = useState(input_schema.type_options[0].value);
  const [status, setStatus] = useState<ExecutionStatus>('idle');
  const [response, setResponse] = useState<MigrationResponse | null>(null);
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
    setSelectedType(input_schema.type_options[0].value);
  };

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="mb-8 animate-fade-in">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{
              background: 'rgba(34,197,94,0.08)',
              border: '1px solid rgba(34,197,94,0.2)',
              boxShadow: '0 0 10px rgba(34,197,94,0.08)',
            }}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="var(--green-term)" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
            </svg>
          </div>
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Migration Console</h1>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Submit legacy projects for AI-powered migration analysis
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ---- INPUT PANEL ---- */}
        <div className="lg:col-span-1 animate-fade-in stagger-1">
          <div className="card-terminal sticky top-24 p-6">
            <div className="flex items-center gap-2 mb-6">
              <div
                className="w-2 h-2 rounded-full"
                style={{
                  background: status === 'running' ? 'var(--green-term)' : 'var(--text-muted)',
                  boxShadow: status === 'running' ? '0 0 6px var(--green-term)' : 'none',
                  animation: status === 'running' ? 'pulse-dot 1s infinite' : 'none',
                }}
              />
              <h2 className="text-sm font-mono uppercase tracking-widest" style={{ color: 'var(--text-secondary)' }}>New Migration</h2>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="label">{input_schema.id_label}</label>
                <input
                  type="text"
                  value={entityId}
                  onChange={(e) => setEntityId(e.target.value)}
                  placeholder={input_schema.id_placeholder}
                  className="input-field"
                  disabled={status === 'running'}
                />
              </div>

              <div>
                <label className="label">Migration Scope</label>
                <div className="space-y-2">
                  {input_schema.type_options.map((opt) => (
                    <div
                      key={opt.value}
                      className={`scope-card ${selectedType === opt.value ? 'selected' : ''}`}
                      onClick={() => status !== 'running' && setSelectedType(opt.value)}
                    >
                      <span className="text-lg">{scopeIcons[opt.value] || '\u{1F4CB}'}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{opt.label}</div>
                        <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{scopeDescriptions[opt.value] || ''}</div>
                      </div>
                      {selectedType === opt.value && (
                        <div
                          className="w-5 h-5 rounded-full flex items-center justify-center shrink-0"
                          style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid var(--green-term)' }}
                        >
                          <svg className="w-3 h-3" style={{ color: 'var(--green-term)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                          </svg>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <button
                type="submit"
                disabled={!entityId.trim() || status === 'running'}
                className="btn-primary w-full"
              >
                {status === 'running' ? 'Migrating...' : 'Start Migration'}
              </button>

              <div>
                <div className="text-[10px] font-mono uppercase tracking-widest mb-2" style={{ color: 'var(--text-muted)' }}>Quick Fill</div>
                <div className="flex gap-2">
                  {input_schema.test_entities.map((id) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => fillTestData(id)}
                      className="px-3 py-1.5 rounded-lg text-xs font-mono transition-all cursor-pointer"
                      style={{
                        background: 'rgba(34,197,94,0.04)',
                        border: '1px solid rgba(34,197,94,0.12)',
                        color: 'var(--green-term)',
                      }}
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

        {/* ---- RESULTS PANEL ---- */}
        <div className="lg:col-span-2 animate-fade-in stagger-2">
          {/* IDLE */}
          {status === 'idle' && (
            <div className="card-terminal text-center py-20 p-6">
              <div className="relative inline-block mb-6">
                <div
                  className="w-20 h-20 rounded-2xl flex items-center justify-center"
                  style={{
                    background: 'rgba(34,197,94,0.06)',
                    border: '1px solid rgba(34,197,94,0.12)',
                    boxShadow: '0 0 20px rgba(34,197,94,0.06)',
                  }}
                >
                  <svg className="w-10 h-10" style={{ color: 'var(--green-term)', opacity: 0.5 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
                  </svg>
                </div>
              </div>
              <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>Ready to Migrate</h3>
              <p className="text-sm font-mono" style={{ color: 'var(--text-muted)' }}>
                <span style={{ color: 'var(--green-term)' }}>$</span> Submit a project ID to begin migration analysis
              </p>
            </div>
          )}

          {/* RUNNING */}
          {status === 'running' && (
            <div className="card-terminal p-6">
              <div className="text-center mb-8">
                <div className="relative inline-block mb-4">
                  <div
                    className="w-16 h-16 rounded-2xl flex items-center justify-center"
                    style={{
                      background: 'rgba(34,197,94,0.06)',
                      border: '1px solid rgba(34,197,94,0.15)',
                      boxShadow: '0 0 20px rgba(34,197,94,0.08)',
                    }}
                  >
                    <svg className="w-8 h-8 animate-spin" style={{ color: 'var(--green-term)' }} fill="none" viewBox="0 0 24 24">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" strokeDasharray="31.4 31.4" strokeLinecap="round" />
                    </svg>
                  </div>
                </div>

                <div className="mt-4">
                  <span
                    className="text-3xl font-black font-mono"
                    style={{ color: 'var(--green-term)', textShadow: '0 0 15px rgba(34,197,94,0.4)' }}
                  >
                    {elapsed}s
                  </span>
                </div>

                <h3 className="text-base font-bold mt-2 mb-1" style={{ color: 'var(--text-primary)' }}>
                  Running Migration Pipeline
                </h3>
                <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
                  Project: <span style={{ color: 'var(--green-term)', textShadow: '0 0 4px rgba(34,197,94,0.3)' }}>{entityId}</span>
                  {' '}&bull;{' '}
                  Scope: <span style={{ color: 'var(--blue)', textShadow: '0 0 4px rgba(59,130,246,0.3)' }}>{selectedType}</span>
                </p>
              </div>

              {/* Progress bar */}
              <div className="mb-6">
                <div className="relative w-full h-1 rounded-full overflow-hidden" style={{ background: 'rgba(34,197,94,0.06)' }}>
                  <div
                    className="absolute inset-y-0 rounded-full"
                    style={{
                      width: '100%',
                      background: 'linear-gradient(90deg, var(--green-term), var(--blue), var(--amber), var(--green-term))',
                      backgroundSize: '200% 100%',
                      animation: 'progress-flow 2s linear infinite',
                      boxShadow: '0 0 8px rgba(34,197,94,0.2)',
                    }}
                  />
                </div>
              </div>

              <div className="space-y-3">
                {config.agents.map((agent, i) => (
                  <AgentWorkCard key={agent.id} name={agent.name} index={i} elapsed={elapsed} agentId={agent.id} />
                ))}
              </div>
            </div>
          )}

          {/* ERROR */}
          {status === 'error' && (
            <div
              className="card-terminal animate-fade-in p-6"
              style={{ borderColor: 'rgba(239, 68, 68, 0.3)', boxShadow: '0 0 20px rgba(239,68,68,0.05)' }}
            >
              <div className="flex items-start gap-4">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}
                >
                  <svg className="w-5 h-5" style={{ color: 'var(--red)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-base font-bold mb-1" style={{ color: 'var(--red)' }}>Migration Failed</h3>
                  <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>{error}</p>
                  <button onClick={() => setStatus('idle')} className="btn-secondary text-xs">
                    Try Again
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* COMPLETE */}
          {status === 'complete' && response && (
            <ResultsPanel response={response} config={config} elapsed={elapsed} />
          )}
        </div>
      </div>
    </div>
  );
}
