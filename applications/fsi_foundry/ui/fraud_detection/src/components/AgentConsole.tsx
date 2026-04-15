// @ts-nocheck
import { useState, useEffect } from 'react';
import type { RuntimeConfig } from '../config';
import type { MonitoringResponse, ExecutionStatus } from '../types';
import { invokeAgent } from '../api/client';
import ResultsPanel from './ResultsPanel';

const monitoringIcons: Record<string, string> = {
  FULL: '\u{1F6E1}',
  TRANSACTION_MONITORING: '\u{1F50D}',
  PATTERN_ANALYSIS: '\u{1F4CA}',
  ALERT_GENERATION: '\u{1F6A8}',
};

const monitoringDescriptions: Record<string, string> = {
  FULL: 'Complete end-to-end fraud monitoring with all agents',
  TRANSACTION_MONITORING: 'Real-time transaction surveillance and anomaly detection',
  PATTERN_ANALYSIS: 'Historical behavioral pattern analysis and correlation',
  ALERT_GENERATION: 'Alert classification, evidence compilation, and action generation',
};

/* ---- Threat Scanner ---- */

function ThreatScanner() {
  return (
    <div className="flex justify-center mb-4">
      <div className="relative" style={{ width: '100px', height: '100px' }}>
        {/* Outer ring */}
        <svg viewBox="0 0 100 100" className="w-full h-full">
          <circle cx="50" cy="50" r="45" fill="none" stroke="rgba(239,68,68,0.1)" strokeWidth="2" />
          <circle cx="50" cy="50" r="35" fill="none" stroke="rgba(239,68,68,0.06)" strokeWidth="1" />
          <circle cx="50" cy="50" r="25" fill="none" stroke="rgba(239,68,68,0.04)" strokeWidth="1" />
          {/* Scanning arc */}
          <circle
            cx="50" cy="50" r="45"
            fill="none"
            stroke="#EF4444"
            strokeWidth="2"
            strokeDasharray="70 213"
            strokeLinecap="round"
            style={{ animation: 'spin 2s linear infinite', transformOrigin: '50px 50px' }}
          />
        </svg>
        {/* Center pulse */}
        <div
          className="absolute animate-pulse-dot"
          style={{
            top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '12px', height: '12px',
            borderRadius: '50%',
            background: 'var(--soc-red-bright)',
            boxShadow: '0 0 15px var(--soc-red-bright), 0 0 30px rgba(239,68,68,0.3)',
          }}
        />
        {/* Pulse ring */}
        <div
          className="absolute"
          style={{
            top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '30px', height: '30px',
            borderRadius: '50%',
            border: '1px solid rgba(239,68,68,0.4)',
            animation: 'pulse-ring 2s ease-out infinite',
          }}
        />
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
    transaction_monitor: ['Initializing monitor', 'Scanning transactions', 'Checking velocity thresholds', 'Evaluating geo-risk'],
    pattern_analyst: ['Queued', 'Loading behavioral profiles', 'Correlating patterns', 'Mapping anomalies'],
    alert_generator: ['Queued', 'Collecting evidence', 'Classifying severity', 'Generating alerts'],
  };
  const colorMap: Record<string, string> = {
    transaction_monitor: '#EF4444',
    pattern_analyst: '#F59E0B',
    alert_generator: '#3B82F6',
  };

  const stages = stageMap[agentId] || stageMap.transaction_monitor;
  const color = colorMap[agentId] || '#EF4444';
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
        border: `1px solid ${isActive ? `${color}25` : 'rgba(239,68,68,0.06)'}`,
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
  const [response, setResponse] = useState<MonitoringResponse | null>(null);
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
              background: 'linear-gradient(135deg, rgba(239,68,68,0.1), rgba(59,130,246,0.08))',
              border: '1px solid rgba(239,68,68,0.2)',
              boxShadow: '0 0 15px rgba(239,68,68,0.1)',
            }}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="#EF4444" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
            </svg>
          </div>
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Fraud Ops Center</h1>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Submit customer IDs for AI-powered fraud monitoring and threat analysis
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
                  background: status === 'running' ? 'var(--soc-red-bright)' : 'var(--text-muted)',
                  boxShadow: status === 'running' ? '0 0 8px var(--soc-red-bright)' : 'none',
                  animation: status === 'running' ? 'pulse-dot 1s infinite' : 'none',
                }}
              />
              <h2 className="text-sm font-mono uppercase tracking-widest" style={{ color: 'var(--text-secondary)' }}>New Scan</h2>
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

              {/* Monitoring type cards */}
              <div>
                <label className="label">Monitoring Type</label>
                <div className="space-y-2">
                  {input_schema.type_options.map((opt) => (
                    <div
                      key={opt.value}
                      className={`inquiry-card ${selectedType === opt.value ? 'selected' : ''}`}
                      onClick={() => status !== 'running' && setSelectedType(opt.value)}
                    >
                      <span className="text-lg">{monitoringIcons[opt.value] || '\u{1F4CB}'}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{opt.label}</div>
                        <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{monitoringDescriptions[opt.value] || ''}</div>
                      </div>
                      {selectedType === opt.value && (
                        <div
                          className="w-5 h-5 rounded-full flex items-center justify-center shrink-0"
                          style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid var(--soc-red-bright)' }}
                        >
                          <svg className="w-3 h-3" style={{ color: 'var(--soc-red-bright)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                          </svg>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className="label">Context <span style={{ color: 'var(--text-muted)' }}>(optional)</span></label>
                <textarea
                  value={additionalContext}
                  onChange={(e) => setAdditionalContext(e.target.value)}
                  placeholder="Additional context for the monitoring scan..."
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
                {status === 'running' ? 'Scanning...' : 'Initiate Scan'}
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
                        background: 'rgba(239,68,68,0.04)',
                        border: '1px solid rgba(239,68,68,0.12)',
                        color: 'var(--soc-red-bright)',
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
                    background: 'linear-gradient(135deg, rgba(239,68,68,0.06), rgba(59,130,246,0.04))',
                    border: '1px solid rgba(239,68,68,0.12)',
                    boxShadow: '0 0 30px rgba(239,68,68,0.08)',
                  }}
                >
                  <svg className="w-12 h-12" style={{ color: 'var(--soc-red-bright)', opacity: 0.5 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                  </svg>
                </div>
                {/* Glow ring */}
                <div
                  className="absolute inset-[-20px] rounded-3xl opacity-50"
                  style={{
                    border: '1px solid rgba(239,68,68,0.05)',
                    animation: 'alertPulse 4s ease-in-out infinite',
                  }}
                />
              </div>
              <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>Monitoring Standby</h3>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Submit a customer ID to activate threat detection agents</p>
            </div>
          )}

          {/* RUNNING — Threat Scanner + Agent Status */}
          {status === 'running' && (
            <div className="glass scan-overlay p-6">
              <div className="text-center mb-8">
                <ThreatScanner />

                <div className="mt-6">
                  <span
                    className="text-3xl font-black font-mono"
                    style={{ color: 'var(--soc-red-bright)', textShadow: '0 0 20px rgba(239,68,68,0.5)' }}
                  >
                    {elapsed}s
                  </span>
                </div>

                <h3 className="text-base font-bold mt-2 mb-1" style={{ color: 'var(--text-primary)' }}>
                  Scanning for Threats
                </h3>
                <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
                  Customer: <span style={{ color: 'var(--soc-red-bright)', textShadow: '0 0 6px rgba(239,68,68,0.3)' }}>{entityId}</span>
                  {' '}&bull;{' '}
                  Mode: <span style={{ color: 'var(--soc-amber)', textShadow: '0 0 6px rgba(245,158,11,0.3)' }}>{selectedType}</span>
                </p>
              </div>

              {/* Progress bar */}
              <div className="mb-6">
                <div className="relative w-full h-1 rounded-full overflow-hidden" style={{ background: 'rgba(239,68,68,0.06)' }}>
                  <div
                    className="absolute inset-y-0 rounded-full"
                    style={{
                      width: '100%',
                      background: 'linear-gradient(90deg, var(--soc-red-bright), var(--soc-amber), var(--soc-blue), var(--soc-red-bright))',
                      backgroundSize: '200% 100%',
                      animation: 'progress-flow 2s linear infinite',
                      boxShadow: '0 0 10px rgba(239,68,68,0.3)',
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
              style={{ borderColor: 'rgba(239, 68, 68, 0.3)', boxShadow: '0 0 30px rgba(239,68,68,0.08)' }}
            >
              <div className="flex items-start gap-4">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}
                >
                  <svg className="w-5 h-5" style={{ color: '#EF4444' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-base font-bold mb-1" style={{ color: '#EF4444' }}>Scan Failed</h3>
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
