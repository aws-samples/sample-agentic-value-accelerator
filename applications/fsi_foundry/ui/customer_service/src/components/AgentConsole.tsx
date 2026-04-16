// @ts-nocheck
import { useState, useEffect } from 'react';
import type { RuntimeConfig } from '../config';
import type { ServiceResponse, ExecutionStatus } from '../types';
import { invokeAgent } from '../api/client';
import ResultsPanel from './ResultsPanel';

const inquiryIcons: Record<string, string> = {
  full: '🔮',
  general: '💬',
  transaction_dispute: '🔍',
  product_inquiry: '💡',
  service_request: '⚡',
};

const inquiryDescriptions: Record<string, string> = {
  full: 'Complete end-to-end service with all agents',
  general: 'General questions about your account',
  transaction_dispute: 'Investigate suspicious or incorrect charges',
  product_inquiry: 'Explore products, features, and eligibility',
  service_request: 'Account changes, updates, and requests',
};

/* ---- 3D Rotating Cube ---- */

function ProcessingCube() {
  return (
    <div className="cube-scene mx-auto">
      <div className="cube">
        <div className="cube-face front">
          <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--neon-cyan)', boxShadow: '0 0 10px var(--neon-cyan)' }} />
        </div>
        <div className="cube-face back">
          <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--neon-magenta)', boxShadow: '0 0 10px var(--neon-magenta)' }} />
        </div>
        <div className="cube-face right">
          <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--neon-green)', boxShadow: '0 0 10px var(--neon-green)' }} />
        </div>
        <div className="cube-face left">
          <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--neon-cyan)', boxShadow: '0 0 10px var(--neon-cyan)' }} />
        </div>
        <div className="cube-face top">
          <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--neon-magenta)', boxShadow: '0 0 10px var(--neon-magenta)' }} />
        </div>
        <div className="cube-face bottom">
          <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--neon-green)', boxShadow: '0 0 10px var(--neon-green)' }} />
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
    inquiry_handler: ['Receiving inquiry', 'Analyzing customer context', 'Classifying intent', 'Routing to specialists'],
    transaction_specialist: ['Queued', 'Pulling transaction records', 'Analyzing patterns', 'Building resolution'],
    product_advisor: ['Queued', 'Reviewing customer profile', 'Matching products', 'Preparing recommendations'],
  };
  const colorMap: Record<string, string> = {
    inquiry_handler: '#00f0ff',
    transaction_specialist: '#ff00e5',
    product_advisor: '#39ff14',
  };

  const stages = stageMap[agentId] || stageMap.inquiry_handler;
  const color = colorMap[agentId] || '#00f0ff';
  const agentElapsed = elapsed - index * 3;
  const stageIndex = Math.min(Math.floor(Math.max(agentElapsed, 0) / 8), stages.length - 1);
  const currentStage = agentElapsed > 0 ? stages[stageIndex] : 'Waiting...';
  const isActive = agentElapsed > 0;

  return (
    <div
      className="flex items-center gap-4 p-4 rounded-xl animate-slide-left"
      style={{
        background: isActive ? `${color}06` : 'rgba(0,0,0,0.3)',
        backdropFilter: 'blur(8px)',
        border: `1px solid ${isActive ? `${color}25` : 'rgba(0,240,255,0.06)'}`,
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
  const [response, setResponse] = useState<ServiceResponse | null>(null);
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
    setSelectedType('full');
  };

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="mb-8 animate-fade-in">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{
              background: 'linear-gradient(135deg, rgba(0,240,255,0.1), rgba(255,0,229,0.08))',
              border: '1px solid rgba(0,240,255,0.2)',
              boxShadow: '0 0 15px rgba(0,240,255,0.1)',
            }}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="var(--neon-cyan)" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 6v.75m0 3v.75m0 3v.75m0 3V18m-9-5.25h5.25M7.5 15h3M3.375 5.25c-.621 0-1.125.504-1.125 1.125v3.026a2.999 2.999 0 010 5.198v3.026c0 .621.504 1.125 1.125 1.125h17.25c.621 0 1.125-.504 1.125-1.125v-3.026a2.999 2.999 0 010-5.198V6.375c0-.621-.504-1.125-1.125-1.125H3.375z" />
            </svg>
          </div>
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Service Desk</h1>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Submit customer inquiries for AI-powered resolution
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
                  background: status === 'running' ? 'var(--neon-green)' : 'var(--text-muted)',
                  boxShadow: status === 'running' ? '0 0 8px var(--neon-green)' : 'none',
                  animation: status === 'running' ? 'pulse-dot 1s infinite' : 'none',
                }}
              />
              <h2 className="text-sm font-mono uppercase tracking-widest" style={{ color: 'var(--text-secondary)' }}>New Ticket</h2>
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

              {/* Inquiry type as neon cards */}
              <div>
                <label className="label">Inquiry Type</label>
                <div className="space-y-2">
                  {input_schema.type_options.map((opt) => (
                    <div
                      key={opt.value}
                      className={`inquiry-card ${selectedType === opt.value ? 'selected' : ''}`}
                      onClick={() => status !== 'running' && setSelectedType(opt.value)}
                    >
                      <span className="text-lg">{inquiryIcons[opt.value] || '📋'}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{opt.label}</div>
                        <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{inquiryDescriptions[opt.value] || ''}</div>
                      </div>
                      {selectedType === opt.value && (
                        <div
                          className="w-5 h-5 rounded-full flex items-center justify-center shrink-0"
                          style={{ background: 'rgba(0,240,255,0.15)', border: '1px solid var(--neon-cyan)' }}
                        >
                          <svg className="w-3 h-3" style={{ color: 'var(--neon-cyan)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
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
                  placeholder="Describe the customer's inquiry..."
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
                {status === 'running' ? 'Processing...' : 'Submit Ticket'}
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
                        background: 'rgba(0,240,255,0.04)',
                        border: '1px solid rgba(0,240,255,0.12)',
                        color: 'var(--neon-cyan)',
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
                    background: 'linear-gradient(135deg, rgba(0,240,255,0.06), rgba(255,0,229,0.04))',
                    border: '1px solid rgba(0,240,255,0.12)',
                    boxShadow: '0 0 30px rgba(0,240,255,0.08)',
                  }}
                >
                  <svg className="w-12 h-12" style={{ color: 'var(--neon-cyan)', opacity: 0.5 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 01-.825-.242m9.345-8.334a2.126 2.126 0 00-.476-.095 48.64 48.64 0 00-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0011.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155" />
                  </svg>
                </div>
                {/* Glow ring */}
                <div
                  className="absolute inset-[-20px] rounded-3xl opacity-50"
                  style={{
                    border: '1px solid rgba(0,240,255,0.05)',
                    animation: 'neonPulse 4s ease-in-out infinite',
                  }}
                />
              </div>
              <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>Ready to Help</h3>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Submit a ticket to activate the AI service agents</p>
            </div>
          )}

          {/* RUNNING — 3D Cube + Agent Status */}
          {status === 'running' && (
            <div className="glass scan-overlay p-6">
              <div className="text-center mb-8">
                {/* 3D Rotating Cube */}
                <div className="relative inline-block mb-4">
                  <ProcessingCube />
                  {/* Outer glow */}
                  <div
                    className="absolute inset-[-20px] rounded-full"
                    style={{ border: '1px solid rgba(0,240,255,0.08)', animation: 'neonPulse 3s ease-in-out infinite' }}
                  />
                </div>

                <div className="mt-6">
                  <span
                    className="text-3xl font-black font-mono"
                    style={{ color: 'var(--neon-cyan)', textShadow: '0 0 20px rgba(0,240,255,0.5)' }}
                  >
                    {elapsed}s
                  </span>
                </div>

                <h3 className="text-base font-bold mt-2 mb-1" style={{ color: 'var(--text-primary)' }}>
                  Processing Service Request
                </h3>
                <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
                  Customer: <span style={{ color: 'var(--neon-cyan)', textShadow: '0 0 6px rgba(0,240,255,0.3)' }}>{entityId}</span>
                  {' '}&bull;{' '}
                  Type: <span style={{ color: 'var(--neon-magenta)', textShadow: '0 0 6px rgba(255,0,229,0.3)' }}>{selectedType}</span>
                </p>
              </div>

              {/* Neon progress bar */}
              <div className="mb-6">
                <div className="relative w-full h-1 rounded-full overflow-hidden" style={{ background: 'rgba(0,240,255,0.06)' }}>
                  <div
                    className="absolute inset-y-0 rounded-full"
                    style={{
                      width: '100%',
                      background: 'linear-gradient(90deg, var(--neon-cyan), var(--neon-magenta), var(--neon-green), var(--neon-cyan))',
                      backgroundSize: '200% 100%',
                      animation: 'progress-flow 2s linear infinite',
                      boxShadow: '0 0 10px rgba(0,240,255,0.3)',
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
              style={{ borderColor: 'rgba(255, 51, 102, 0.3)', boxShadow: '0 0 30px rgba(255,51,102,0.08)' }}
            >
              <div className="flex items-start gap-4">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: 'rgba(255,51,102,0.1)', border: '1px solid rgba(255,51,102,0.2)' }}
                >
                  <svg className="w-5 h-5" style={{ color: '#ff3366' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-base font-bold mb-1" style={{ color: '#ff3366' }}>Service Request Failed</h3>
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
