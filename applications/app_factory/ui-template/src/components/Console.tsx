import { useState, useEffect } from 'react';
import type { RuntimeConfig } from '../config';
import { invokeAgent } from '../api/client';

const AGENT_COLORS = ['#0ea5e9', '#8b5cf6', '#22c55e', '#f59e0b', '#ef4444'];

type Status = 'idle' | 'running' | 'complete' | 'error';

export default function Console({ config }: { config: RuntimeConfig }) {
  const { input_schema } = config;

  const [entityId, setEntityId] = useState('');
  const [selectedType, setSelectedType] = useState(input_schema.type_options[0].value);
  const [status, setStatus] = useState<Status>('idle');
  const [response, setResponse] = useState<any>(null);
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

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <div className="mb-6">
        <h1 className="text-xl font-bold" style={{ color: 'var(--text)' }}>{config.use_case_name} Console</h1>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Submit requests for AI-powered processing</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Input Panel */}
        <div className="lg:col-span-1">
          <div className="rounded-xl border p-5 sticky top-20" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
            <div className="flex items-center gap-2 mb-5">
              <div
                className="w-2 h-2 rounded-full"
                style={{
                  background: status === 'running' ? 'var(--success)' : 'var(--text-muted)',
                  boxShadow: status === 'running' ? '0 0 6px var(--success)' : 'none',
                }}
              />
              <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
                New Request
              </span>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                  {input_schema.id_label}
                </label>
                <input
                  type="text"
                  value={entityId}
                  onChange={(e) => setEntityId(e.target.value)}
                  placeholder={input_schema.id_placeholder}
                  disabled={status === 'running'}
                  className="w-full px-3 py-2.5 rounded-lg text-sm bg-slate-900 border border-slate-700 text-white placeholder-slate-500 focus:border-sky-500 focus:outline-none disabled:opacity-50"
                />
              </div>

              <div>
                <label className="block text-xs font-medium uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                  Assessment Type
                </label>
                <select
                  value={selectedType}
                  onChange={(e) => setSelectedType(e.target.value)}
                  disabled={status === 'running'}
                  className="w-full px-3 py-2.5 rounded-lg text-sm bg-slate-900 border border-slate-700 text-white focus:border-sky-500 focus:outline-none disabled:opacity-50"
                >
                  {input_schema.type_options.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              <button
                type="submit"
                disabled={!entityId.trim() || status === 'running'}
                className="w-full px-4 py-2.5 rounded-lg font-semibold text-sm bg-sky-500 hover:bg-sky-400 text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                {status === 'running' ? 'Processing...' : 'Submit'}
              </button>

              {input_schema.test_entities.length > 0 && (
                <div>
                  <div className="text-xs text-slate-500 mb-1.5">Quick fill:</div>
                  <div className="flex gap-2 flex-wrap">
                    {input_schema.test_entities.map((id) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => { setEntityId(id); setSelectedType('full'); }}
                        disabled={status === 'running'}
                        className="px-2.5 py-1 rounded-md text-xs font-mono bg-sky-500/10 text-sky-400 border border-sky-500/20 hover:bg-sky-500/20 disabled:opacity-50"
                      >
                        {id}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </form>
          </div>
        </div>

        {/* Results Panel */}
        <div className="lg:col-span-2">
          {/* Idle */}
          {status === 'idle' && (
            <div className="rounded-xl border p-12 text-center" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
              <div className="w-16 h-16 rounded-2xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>Ready</h3>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Submit a request to activate the AI agents</p>
            </div>
          )}

          {/* Running */}
          {status === 'running' && (
            <div className="rounded-xl border p-6" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
              <div className="text-center mb-6">
                <div className="w-10 h-10 border-2 border-sky-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                <div className="text-2xl font-bold font-mono text-sky-400 mb-1">{elapsed}s</div>
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                  Processing <span className="text-sky-400">{entityId}</span> &middot; {selectedType}
                </p>
              </div>

              {/* Agent progress */}
              <div className="space-y-3">
                {config.agents.map((agent, i) => {
                  const color = AGENT_COLORS[i % AGENT_COLORS.length];
                  const agentElapsed = elapsed - i * 2;
                  const isActive = agentElapsed > 0;

                  return (
                    <div
                      key={agent.id}
                      className="flex items-center gap-3 p-3 rounded-lg border"
                      style={{
                        background: isActive ? `${color}08` : 'transparent',
                        borderColor: isActive ? `${color}30` : 'var(--border)',
                      }}
                    >
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center"
                        style={{ background: `${color}15`, border: `1px solid ${color}30` }}
                      >
                        {isActive ? (
                          <div className="w-4 h-4 border-2 rounded-full animate-spin" style={{ borderColor: color, borderTopColor: 'transparent' }} />
                        ) : (
                          <div className="w-2 h-2 rounded-full bg-slate-600" />
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="text-sm font-medium" style={{ color: 'var(--text)' }}>{agent.name}</div>
                        <div className="text-xs" style={{ color: isActive ? color : 'var(--text-muted)' }}>
                          {isActive ? 'Processing...' : 'Waiting...'}
                        </div>
                      </div>
                      <div className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
                        {agentElapsed > 0 ? `${agentElapsed}s` : '--'}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Error */}
          {status === 'error' && (
            <div className="rounded-xl border border-red-500/30 p-6" style={{ background: 'rgba(127,29,29,0.1)' }}>
              <h3 className="text-base font-semibold text-red-400 mb-2">Request Failed</h3>
              <p className="text-sm text-slate-300 mb-4">{error}</p>
              <button
                onClick={() => setStatus('idle')}
                className="px-4 py-2 rounded-lg text-sm border border-slate-600 text-slate-300 hover:border-slate-400 transition-colors"
              >
                Try Again
              </button>
            </div>
          )}

          {/* Complete */}
          {status === 'complete' && response && (
            <div className="space-y-4">
              {/* Summary */}
              <div className="rounded-xl border p-6" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-green-400" style={{ boxShadow: '0 0 6px var(--success)' }} />
                    <span className="text-xs font-semibold uppercase tracking-wider text-green-400">Complete</span>
                  </div>
                  <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>{elapsed}s</span>
                </div>
                {response.summary && (
                  <div className="text-sm leading-relaxed whitespace-pre-line" style={{ color: 'var(--text-secondary)' }}>
                    {response.summary}
                  </div>
                )}
              </div>

              {/* Raw Response */}
              <details className="rounded-xl border" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
                <summary className="px-6 py-4 cursor-pointer text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                  Full Response
                </summary>
                <div className="px-6 pb-6">
                  <pre className="text-xs leading-relaxed overflow-auto max-h-96 p-4 rounded-lg bg-slate-900 border border-slate-800" style={{ color: 'var(--text-secondary)' }}>
                    {JSON.stringify(response, null, 2)}
                  </pre>
                </div>
              </details>

              <button
                onClick={() => { setStatus('idle'); setResponse(null); }}
                className="px-4 py-2 rounded-lg text-sm border border-slate-600 text-slate-300 hover:border-slate-400 transition-colors"
              >
                New Request
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
