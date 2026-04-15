// @ts-nocheck
import { useState, useEffect } from 'react';
import type { RuntimeConfig } from '../config';
import type { EngagementResponse, ExecutionStatus } from '../types';
import { invokeAgent } from '../api/client';
import ResultsPanel from './ResultsPanel';

const assessmentIcons: Record<string, string> = {
  FULL: '\u{1F50D}',
  CHURN_PREDICTION_ONLY: '\u{1F4CA}',
  OUTREACH_ONLY: '\u{1F4E3}',
  POLICY_OPTIMIZATION_ONLY: '\u{2728}',
};

const assessmentDescriptions: Record<string, string> = {
  FULL: 'Complete engagement analysis with all three agents',
  CHURN_PREDICTION_ONLY: 'Analyze churn risk, behavioral signals, and retention window',
  OUTREACH_ONLY: 'Plan optimal outreach channels, messaging, and timing',
  POLICY_OPTIMIZATION_ONLY: 'Identify coverage adjustments, bundling, and savings',
};

/* ---- 3D Rotating Cube ---- */

function ProcessingCube() {
  return (
    <div className="cube-scene mx-auto">
      <div className="cube">
        <div className="cube-face front">
          <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--teal-light)', boxShadow: '0 0 8px var(--teal-light)' }} />
        </div>
        <div className="cube-face back">
          <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--rose)', boxShadow: '0 0 8px var(--rose)' }} />
        </div>
        <div className="cube-face right">
          <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--amber)', boxShadow: '0 0 8px var(--amber)' }} />
        </div>
        <div className="cube-face left">
          <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--teal-light)', boxShadow: '0 0 8px var(--teal-light)' }} />
        </div>
        <div className="cube-face top">
          <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--green)', boxShadow: '0 0 8px var(--green)' }} />
        </div>
        <div className="cube-face bottom">
          <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--amber)', boxShadow: '0 0 8px var(--amber)' }} />
        </div>
      </div>
    </div>
  );
}

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
    churn_predictor: ['Collecting behavioral data', 'Analyzing engagement patterns', 'Computing churn probability', 'Assessing retention window'],
    outreach_agent: ['Queued', 'Evaluating channel preferences', 'Crafting messaging themes', 'Optimizing outreach timing'],
    policy_optimizer: ['Queued', 'Reviewing current coverage', 'Identifying bundling opportunities', 'Calculating potential savings'],
  };
  const colorMap: Record<string, string> = {
    churn_predictor: '#E11D48',
    outreach_agent: '#0F766E',
    policy_optimizer: '#F59E0B',
  };

  const stages = stageMap[agentId] || stageMap.churn_predictor;
  const color = colorMap[agentId] || '#0F766E';
  const agentElapsed = elapsed - index * 3;
  const stageIndex = Math.min(Math.floor(Math.max(agentElapsed, 0) / 8), stages.length - 1);
  const currentStage = agentElapsed > 0 ? stages[stageIndex] : 'Waiting...';
  const isActive = agentElapsed > 0;

  return (
    <div
      className="flex items-center gap-4 p-4 rounded-xl animate-slide-left"
      style={{
        background: isActive ? `${color}08` : 'var(--bg-secondary)',
        border: `1px solid ${isActive ? `${color}20` : 'var(--border)'}`,
        boxShadow: isActive ? `0 2px 12px ${color}08` : 'none',
        animationDelay: `${index * 0.15}s`,
      }}
    >
      <div className="relative">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{
            background: `${color}10`,
            border: `1px solid ${color}20`,
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
        {isActive && (
          <div
            className="absolute inset-0 rounded-xl"
            style={{
              border: `1px solid ${color}`,
              animation: 'ripple 2s ease-out infinite',
              animationDelay: `${index * 0.3}s`,
            }}
          />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{name}</div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono" style={{ color: isActive ? color : 'var(--text-muted)' }}>
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
  const [additionalContext, setAdditionalContext] = useState('');
  const [status, setStatus] = useState<ExecutionStatus>('idle');
  const [response, setResponse] = useState<EngagementResponse | null>(null);
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
      if (additionalContext.trim()) {
        payload.additional_context = additionalContext.trim();
      }

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
              background: 'linear-gradient(135deg, rgba(15,118,110,0.1), rgba(20,184,166,0.12))',
              border: '1px solid rgba(15,118,110,0.2)',
              boxShadow: '0 2px 8px rgba(15,118,110,0.08)',
            }}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="#0F766E" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
            </svg>
          </div>
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Retention Dashboard</h1>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Analyze customer engagement and generate retention strategies
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ---- INPUT PANEL ---- */}
        <div className="lg:col-span-1 animate-fade-in stagger-1">
          <div className="glass sticky top-24 p-6">
            <div className="flex items-center gap-2 mb-6">
              <div
                className="w-2 h-2 rounded-full"
                style={{
                  background: status === 'running' ? 'var(--green)' : 'var(--text-muted)',
                  boxShadow: status === 'running' ? '0 0 6px var(--green)' : 'none',
                  animation: status === 'running' ? 'pulse-dot 1s infinite' : 'none',
                }}
              />
              <h2 className="text-sm font-mono uppercase tracking-widest" style={{ color: 'var(--text-secondary)' }}>New Assessment</h2>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="label">{input_schema.id_label}</label>
                <input
                  type="text"
                  value={entityId}
                  onChange={(e) => setEntityId(e.target.value)}
                  placeholder={input_schema.id_placeholder}
                  className="input-field font-mono"
                  disabled={status === 'running'}
                />
              </div>

              {/* Assessment type cards */}
              <div>
                <label className="label">Assessment Type</label>
                <div className="space-y-2">
                  {input_schema.type_options.map((opt) => (
                    <div
                      key={opt.value}
                      className={`inquiry-card ${selectedType === opt.value ? 'selected' : ''}`}
                      onClick={() => status !== 'running' && setSelectedType(opt.value)}
                    >
                      <span className="text-lg">{assessmentIcons[opt.value] || '\u{1F4CB}'}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{opt.label}</div>
                        <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{assessmentDescriptions[opt.value] || ''}</div>
                      </div>
                      {selectedType === opt.value && (
                        <div
                          className="w-5 h-5 rounded-full flex items-center justify-center shrink-0"
                          style={{ background: 'rgba(20,184,166,0.1)', border: '1px solid var(--teal-light)' }}
                        >
                          <svg className="w-3 h-3" style={{ color: 'var(--teal)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                          </svg>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className="label">Additional Context <span style={{ color: 'var(--text-muted)' }}>(optional)</span></label>
                <textarea
                  value={additionalContext}
                  onChange={(e) => setAdditionalContext(e.target.value)}
                  placeholder="Any specific concerns about this customer..."
                  rows={3}
                  className="input-field resize-none"
                  disabled={status === 'running'}
                />
              </div>

              <button
                type="submit"
                disabled={!entityId.trim() || status === 'running'}
                className="btn-primary w-full"
              >
                {status === 'running' ? 'Analyzing...' : 'Run Assessment'}
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
                        background: 'rgba(15,118,110,0.04)',
                        border: '1px solid rgba(15,118,110,0.12)',
                        color: 'var(--teal)',
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
            <div className="glass text-center py-20 p-6">
              <div className="relative inline-block mb-6">
                <div
                  className="w-24 h-24 rounded-2xl flex items-center justify-center animate-hero-float"
                  style={{
                    background: 'linear-gradient(135deg, rgba(15,118,110,0.06), rgba(245,158,11,0.04))',
                    border: '1px solid rgba(15,118,110,0.12)',
                    boxShadow: '0 4px 20px rgba(15,118,110,0.06)',
                  }}
                >
                  <svg className="w-12 h-12" style={{ color: 'var(--teal)', opacity: 0.4 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                  </svg>
                </div>
                <div
                  className="absolute inset-[-20px] rounded-3xl opacity-50"
                  style={{
                    border: '1px solid rgba(15,118,110,0.08)',
                    animation: 'warmPulse 4s ease-in-out infinite',
                  }}
                />
              </div>
              <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>Ready to Analyze</h3>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Submit an assessment to activate the retention agents</p>
            </div>
          )}

          {/* RUNNING */}
          {status === 'running' && (
            <div className="glass scan-overlay p-6">
              <div className="text-center mb-8">
                <div className="relative inline-block mb-4">
                  <ProcessingCube />
                  <div
                    className="absolute inset-[-20px] rounded-full"
                    style={{ border: '1px solid rgba(15,118,110,0.1)', animation: 'warmPulse 3s ease-in-out infinite' }}
                  />
                </div>

                <div className="mt-6">
                  <span
                    className="text-3xl font-black font-mono"
                    style={{ color: 'var(--teal)' }}
                  >
                    {elapsed}s
                  </span>
                </div>

                <h3 className="text-base font-bold mt-2 mb-1" style={{ color: 'var(--text-primary)' }}>
                  Analyzing Customer Engagement
                </h3>
                <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
                  Customer: <span style={{ color: 'var(--teal)' }}>{entityId}</span>
                  {' '}&bull;{' '}
                  Type: <span style={{ color: 'var(--rose)' }}>{selectedType}</span>
                </p>
              </div>

              {/* Progress bar */}
              <div className="mb-6">
                <div className="relative w-full h-1 rounded-full overflow-hidden" style={{ background: 'rgba(15,118,110,0.06)' }}>
                  <div
                    className="absolute inset-y-0 rounded-full"
                    style={{
                      width: '100%',
                      background: 'linear-gradient(90deg, var(--teal), var(--teal-light), var(--amber), var(--teal))',
                      backgroundSize: '200% 100%',
                      animation: 'progress-flow 2s linear infinite',
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
              className="glass animate-fade-in p-6"
              style={{ borderColor: 'rgba(225, 29, 72, 0.2)', boxShadow: '0 4px 20px rgba(225,29,72,0.06)' }}
            >
              <div className="flex items-start gap-4">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: 'rgba(225,29,72,0.06)', border: '1px solid rgba(225,29,72,0.15)' }}
                >
                  <svg className="w-5 h-5" style={{ color: 'var(--rose)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-base font-bold mb-1" style={{ color: 'var(--rose)' }}>Assessment Failed</h3>
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
