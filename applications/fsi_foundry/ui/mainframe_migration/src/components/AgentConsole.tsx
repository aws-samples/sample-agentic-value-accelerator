// @ts-nocheck
import { useState, useEffect } from 'react';
import type { RuntimeConfig } from '../config';
import type { MainframeMigrationResponse, ExecutionStatus } from '../types';
import { invokeAgent } from '../api/client';
import ResultsPanel from './ResultsPanel';

const scopeIcons: Record<string, string> = {
  FULL: '>_',
  MAINFRAME_ANALYSIS: '[]',
  RULE_EXTRACTION: '{}',
  CODE_GENERATION: '<>',
};

const scopeDescriptions: Record<string, string> = {
  FULL: 'Complete end-to-end migration with all agents',
  MAINFRAME_ANALYSIS: 'Analyze COBOL, JCL, and copybooks only',
  RULE_EXTRACTION: 'Extract business rules and validation logic',
  CODE_GENERATION: 'Generate cloud-native code from extracted rules',
};

/* ---- 3D Rotating Cube ---- */

function ProcessingCube() {
  return (
    <div className="cube-scene mx-auto">
      <div className="cube">
        <div className="cube-face front">
          <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#00FF41', boxShadow: '0 0 10px #00FF41' }} />
        </div>
        <div className="cube-face back">
          <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#FFB000', boxShadow: '0 0 10px #FFB000' }} />
        </div>
        <div className="cube-face right">
          <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#64748B', boxShadow: '0 0 10px #64748B' }} />
        </div>
        <div className="cube-face left">
          <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#00FF41', boxShadow: '0 0 10px #00FF41' }} />
        </div>
        <div className="cube-face top">
          <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#FFB000', boxShadow: '0 0 10px #FFB000' }} />
        </div>
        <div className="cube-face bottom">
          <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#64748B', boxShadow: '0 0 10px #64748B' }} />
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
    mainframe_analyzer: ['Scanning mainframe source', 'Parsing COBOL programs', 'Analyzing JCL jobs', 'Building dependency graph'],
    business_rule_extractor: ['Queued', 'Identifying validation rules', 'Extracting computational formulas', 'Scoring extraction confidence'],
    cloud_code_generator: ['Queued', 'Mapping services', 'Generating cloud-native code', 'Verifying functional equivalence'],
  };
  const colorMap: Record<string, string> = {
    mainframe_analyzer: '#00FF41',
    business_rule_extractor: '#FFB000',
    cloud_code_generator: '#64748B',
  };

  const stages = stageMap[agentId] || stageMap.mainframe_analyzer;
  const color = colorMap[agentId] || '#00FF41';
  const agentElapsed = elapsed - index * 3;
  const stageIndex = Math.min(Math.floor(Math.max(agentElapsed, 0) / 8), stages.length - 1);
  const currentStage = agentElapsed > 0 ? stages[stageIndex] : 'Waiting...';
  const isActive = agentElapsed > 0;

  return (
    <div
      className="flex items-center gap-4 p-4 rounded-xl animate-slide-left"
      style={{
        background: isActive ? `${color}06` : 'rgba(0,0,0,0.4)',
        backdropFilter: 'blur(8px)',
        border: `1px solid ${isActive ? `${color}25` : 'rgba(0,255,65,0.06)'}`,
        boxShadow: isActive ? `0 0 20px ${color}08, inset 0 0 20px ${color}03` : 'none',
        animationDelay: `${index * 0.15}s`,
      }}
    >
      <div className="relative">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{
            background: `${color}10`,
            border: `1px solid ${color}25`,
            boxShadow: isActive ? `0 0 12px ${color}20` : 'none',
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
          <span className="text-xs font-mono" style={{ color: isActive ? color : 'var(--text-muted)', textShadow: isActive ? `0 0 8px ${color}40` : 'none' }}>
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
  const [response, setResponse] = useState<MainframeMigrationResponse | null>(null);
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
      <div className="mb-8 animate-fade-in">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{
              background: 'linear-gradient(135deg, rgba(0,255,65,0.1), rgba(255,176,0,0.08))',
              border: '1px solid rgba(0,255,65,0.2)',
              boxShadow: '0 0 15px rgba(0,255,65,0.1)',
            }}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="#00FF41" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 14.25h13.5m-13.5 0a3 3 0 01-3-3m3 3a3 3 0 100 6h13.5a3 3 0 100-6m-16.5-3a3 3 0 013-3h13.5a3 3 0 013 3m-19.5 0a4.5 4.5 0 01.9-2.7L5.737 5.1a3.375 3.375 0 012.7-1.35h7.126c1.062 0 2.062.5 2.7 1.35l2.587 3.45a4.5 4.5 0 01.9 2.7m0 0a3 3 0 01-3 3m0 3h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008zm-3 6h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008z" />
            </svg>
          </div>
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Migration Console</h1>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Submit mainframe projects for AI-powered cloud migration
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 animate-fade-in stagger-1">
          <div className="glass sticky top-24 p-6">
            <div className="flex items-center gap-2 mb-6">
              <div
                className="w-2 h-2 rounded-full"
                style={{
                  background: status === 'running' ? '#00FF41' : 'var(--text-muted)',
                  boxShadow: status === 'running' ? '0 0 8px #00FF41' : 'none',
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
                  className="input-field font-mono"
                  disabled={status === 'running'}
                />
              </div>

              <div>
                <label className="label">Migration Scope</label>
                <div className="space-y-2">
                  {input_schema.type_options.map((opt) => (
                    <div
                      key={opt.value}
                      className={`inquiry-card ${selectedType === opt.value ? 'selected' : ''}`}
                      onClick={() => status !== 'running' && setSelectedType(opt.value)}
                    >
                      <span className="text-sm font-mono font-bold" style={{ color: '#39FF14' }}>{scopeIcons[opt.value] || '>_'}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{opt.label}</div>
                        <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{scopeDescriptions[opt.value] || ''}</div>
                      </div>
                      {selectedType === opt.value && (
                        <div
                          className="w-5 h-5 rounded-full flex items-center justify-center shrink-0"
                          style={{ background: 'rgba(0,255,65,0.15)', border: '1px solid #00FF41' }}
                        >
                          <svg className="w-3 h-3" style={{ color: '#00FF41' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                          </svg>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className="label">Description <span style={{ color: 'var(--text-muted)' }}>(optional)</span></label>
                <textarea
                  value={additionalContext}
                  onChange={(e) => setAdditionalContext(e.target.value)}
                  placeholder="Describe the mainframe system to migrate..."
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
                        background: 'rgba(0,255,65,0.04)',
                        border: '1px solid rgba(0,255,65,0.12)',
                        color: '#00FF41',
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

        <div className="lg:col-span-2 animate-fade-in stagger-2">
          {status === 'idle' && (
            <div className="glass text-center py-20 p-6">
              <div className="relative inline-block mb-6">
                <div
                  className="w-24 h-24 rounded-2xl flex items-center justify-center animate-hero-float"
                  style={{
                    background: 'linear-gradient(135deg, rgba(0,255,65,0.06), rgba(255,176,0,0.04))',
                    border: '1px solid rgba(0,255,65,0.12)',
                    boxShadow: '0 0 30px rgba(0,255,65,0.08)',
                  }}
                >
                  <svg className="w-12 h-12" style={{ color: '#00FF41', opacity: 0.5 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 14.25h13.5m-13.5 0a3 3 0 01-3-3m3 3a3 3 0 100 6h13.5a3 3 0 100-6m-16.5-3a3 3 0 013-3h13.5a3 3 0 013 3m-19.5 0a4.5 4.5 0 01.9-2.7L5.737 5.1a3.375 3.375 0 012.7-1.35h7.126c1.062 0 2.062.5 2.7 1.35l2.587 3.45a4.5 4.5 0 01.9 2.7m0 0a3 3 0 01-3 3m0 3h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008zm-3 6h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008z" />
                  </svg>
                </div>
                <div
                  className="absolute inset-[-20px] rounded-3xl opacity-50"
                  style={{ border: '1px solid rgba(0,255,65,0.05)', animation: 'neonPulse 4s ease-in-out infinite' }}
                />
              </div>
              <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>Ready to Migrate</h3>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Submit a mainframe project to activate the AI migration agents</p>
            </div>
          )}

          {status === 'running' && (
            <div className="glass scan-overlay p-6">
              <div className="text-center mb-8">
                <div className="relative inline-block mb-4">
                  <ProcessingCube />
                  <div className="absolute inset-[-20px] rounded-full" style={{ border: '1px solid rgba(0,255,65,0.08)', animation: 'neonPulse 3s ease-in-out infinite' }} />
                </div>
                <div className="mt-6">
                  <span className="text-3xl font-black font-mono" style={{ color: '#00FF41', textShadow: '0 0 20px rgba(0,255,65,0.5)' }}>
                    {elapsed}s
                  </span>
                </div>
                <h3 className="text-base font-bold mt-2 mb-1" style={{ color: 'var(--text-primary)' }}>
                  Migrating Mainframe
                </h3>
                <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
                  Project: <span style={{ color: '#00FF41', textShadow: '0 0 6px rgba(0,255,65,0.3)' }}>{entityId}</span>
                  {' '}&bull;{' '}
                  Scope: <span style={{ color: '#FFB000', textShadow: '0 0 6px rgba(255,176,0,0.3)' }}>{selectedType}</span>
                </p>
              </div>
              <div className="mb-6">
                <div className="relative w-full h-1 rounded-full overflow-hidden" style={{ background: 'rgba(0,255,65,0.06)' }}>
                  <div
                    className="absolute inset-y-0 rounded-full"
                    style={{
                      width: '100%',
                      background: 'linear-gradient(90deg, #00FF41, #FFB000, #64748B, #00FF41)',
                      backgroundSize: '200% 100%',
                      animation: 'progress-flow 2s linear infinite',
                      boxShadow: '0 0 10px rgba(0,255,65,0.3)',
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

          {status === 'error' && (
            <div className="glass animate-fade-in p-6" style={{ borderColor: 'rgba(255, 51, 102, 0.3)', boxShadow: '0 0 30px rgba(255,51,102,0.08)' }}>
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgba(255,51,102,0.1)', border: '1px solid rgba(255,51,102,0.2)' }}>
                  <svg className="w-5 h-5" style={{ color: '#ff3366' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-base font-bold mb-1" style={{ color: '#ff3366' }}>Migration Failed</h3>
                  <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>{error}</p>
                  <button onClick={() => setStatus('idle')} className="btn-secondary text-xs">
                    Try Again
                  </button>
                </div>
              </div>
            </div>
          )}

          {status === 'complete' && response && (
            <ResultsPanel response={response} config={config} elapsed={elapsed} />
          )}
        </div>
      </div>
    </div>
  );
}
