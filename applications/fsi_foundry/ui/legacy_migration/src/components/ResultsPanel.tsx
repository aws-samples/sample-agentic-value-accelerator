// @ts-nocheck
import { useState } from 'react';
import type { RuntimeConfig } from '../config';
import type { MigrationResponse } from '../types';

/* ---- Complexity Badge ---- */

function ComplexityBadge({ level }: { level: string }) {
  const lower = level.toLowerCase();
  let bg = 'rgba(34,197,94,0.08)';
  let border = 'rgba(34,197,94,0.25)';
  let color = 'var(--green-term)';
  let glow = 'var(--green-term)';

  if (lower.includes('high') || lower.includes('complex')) {
    bg = 'rgba(239,68,68,0.08)'; border = 'rgba(239,68,68,0.25)'; color = 'var(--red)'; glow = 'var(--red)';
  } else if (lower.includes('medium') || lower.includes('moderate')) {
    bg = 'rgba(245,158,11,0.08)'; border = 'rgba(245,158,11,0.25)'; color = 'var(--amber)'; glow = 'var(--amber)';
  }

  return (
    <span
      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-bold uppercase tracking-wider"
      style={{ background: bg, border: `1px solid ${border}`, color }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: glow, boxShadow: `0 0 4px ${glow}` }} />
      {level}
    </span>
  );
}

/* ---- Confidence Bar ---- */

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  let color = 'var(--green-term)';
  if (pct < 70) color = 'var(--amber)';
  if (pct < 50) color = 'var(--red)';

  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'var(--dark)' }}>
        <div
          className="h-full rounded-full transition-all duration-1000"
          style={{ width: `${pct}%`, background: color, boxShadow: `0 0 8px ${color}40` }}
        />
      </div>
      <span className="text-sm font-mono font-bold tabular-nums" style={{ color, textShadow: `0 0 6px ${color}40` }}>{pct}%</span>
    </div>
  );
}

/* ---- Collapsible Section ---- */

function Collapsible({ title, children, defaultOpen = false, delay = 0 }: { title: string; children: React.ReactNode; defaultOpen?: boolean; delay?: number }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="card-terminal animate-fade-in p-6" style={{ animationDelay: `${delay}s` }}>
      <button onClick={() => setOpen(!open)} className="flex items-center justify-between w-full text-left">
        <h3 className="text-sm font-mono uppercase tracking-widest" style={{ color: 'var(--text-secondary)' }}>{title}</h3>
        <svg
          className="w-4 h-4 transition-transform"
          style={{ color: 'var(--text-muted)', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && <div className="mt-5 pt-5" style={{ borderTop: '1px solid var(--border)' }}>{children}</div>}
    </div>
  );
}

/* ============================================
   MAIN COMPONENT
   ============================================ */

function ResultsPanelInternal({
  response,
  config,
  elapsed,
}: {
  response: MigrationResponse;
  config: RuntimeConfig;
  elapsed: number;
}) {
  const { code_analysis: _ca = {}, migration_plan: _mp = {}, conversion_output: _co = {} } = response as any;
  const code_analysis = { languages_detected: [], dependencies: [], patterns_identified: [], risks: [], ..._ca };
  const migration_plan = { phases: [], dependency_order: [], ..._mp };
  const conversion_output = { patterns_converted: [], manual_review_needed: [], ..._co };

  return (
    <div className="space-y-5">
      {/* ===== Hero — Overview ===== */}
      <div
        className="card-terminal animate-fade-in-scale p-6"
        style={{
          borderColor: 'rgba(34,197,94,0.15)',
          boxShadow: '0 0 30px rgba(34,197,94,0.04)',
        }}
      >
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full" style={{ background: 'var(--green-term)', boxShadow: '0 0 6px var(--green-term)' }} />
            <span
              className="text-xs font-mono uppercase tracking-widest"
              style={{ color: 'var(--green-term)', textShadow: '0 0 6px rgba(34,197,94,0.3)' }}
            >
              Migration Complete
            </span>
          </div>
          <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
            {response.project_id} &bull; {elapsed}s
          </span>
        </div>

        {/* Metrics row */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="text-center">
            <div className="text-[10px] font-mono uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>Files</div>
            <div className="text-lg font-bold font-mono" style={{ color: 'var(--green-term)', textShadow: '0 0 8px rgba(34,197,94,0.3)' }}>
              {code_analysis?.total_files || 0}
            </div>
          </div>
          <div className="text-center">
            <div className="text-[10px] font-mono uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>Lines</div>
            <div className="text-lg font-bold font-mono" style={{ color: 'var(--blue)', textShadow: '0 0 8px rgba(59,130,246,0.3)' }}>
              {code_analysis?.total_lines?.toLocaleString() || 0}
            </div>
          </div>
          <div className="text-center">
            <div className="text-[10px] font-mono uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>Effort</div>
            <div className="text-lg font-bold font-mono" style={{ color: 'var(--amber)', textShadow: '0 0 8px rgba(245,158,11,0.3)' }}>
              {migration_plan?.estimated_effort_days || 0}d
            </div>
          </div>
          <div className="text-center">
            <div className="text-[10px] font-mono uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>Converted</div>
            <div className="text-lg font-bold font-mono" style={{ color: 'var(--green-term)', textShadow: '0 0 8px rgba(34,197,94,0.3)' }}>
              {conversion_output?.files_converted || 0}
            </div>
          </div>
        </div>

        {/* Complexity + Confidence */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-widest mb-2" style={{ color: 'var(--text-muted)' }}>Complexity</div>
            <ComplexityBadge level={code_analysis?.complexity_level || 'Unknown'} />
          </div>
          <div>
            <div className="text-[10px] font-mono uppercase tracking-widest mb-2" style={{ color: 'var(--text-muted)' }}>Conversion Confidence</div>
            <ConfidenceBar value={conversion_output?.conversion_confidence || 0} />
          </div>
        </div>
      </div>

      {/* ===== Code Analysis ===== */}
      {code_analysis && (
        <div className="card-terminal animate-fade-in p-6" style={{ animationDelay: '0.1s' }}>
          <div className="flex items-center gap-2 mb-5">
            <svg className="w-4 h-4" style={{ color: 'var(--green-term)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
            </svg>
            <h3 className="text-sm font-mono uppercase tracking-widest" style={{ color: 'var(--text-secondary)' }}>Code Analysis</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Languages */}
            <div>
              <div className="text-[10px] font-mono uppercase tracking-widest mb-2" style={{ color: 'var(--text-muted)' }}>Languages Detected</div>
              <div className="flex flex-wrap gap-1.5">
                {code_analysis.languages_detected?.map((lang, i) => (
                  <span
                    key={i}
                    className="px-2.5 py-1 rounded-lg text-xs font-mono font-semibold"
                    style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.15)', color: 'var(--green-term)' }}
                  >
                    {lang}
                  </span>
                ))}
              </div>
            </div>

            {/* Dependencies */}
            <div>
              <div className="text-[10px] font-mono uppercase tracking-widest mb-2" style={{ color: 'var(--text-muted)' }}>Dependencies</div>
              <div className="flex flex-wrap gap-1.5">
                {code_analysis.dependencies?.map((dep, i) => (
                  <span
                    key={i}
                    className="px-2.5 py-1 rounded-lg text-xs font-mono"
                    style={{ background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.15)', color: 'var(--blue)' }}
                  >
                    {dep}
                  </span>
                ))}
              </div>
            </div>

            {/* Patterns */}
            <div>
              <div className="text-[10px] font-mono uppercase tracking-widest mb-2" style={{ color: 'var(--text-muted)' }}>Patterns Identified</div>
              <div className="space-y-1.5">
                {code_analysis.patterns_identified?.map((pat, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--green-term)', boxShadow: '0 0 4px var(--green-term)' }} />
                    <span className="text-xs font-mono" style={{ color: 'var(--text-secondary)' }}>{pat}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Risks */}
            <div>
              <div className="text-[10px] font-mono uppercase tracking-widest mb-2" style={{ color: 'var(--text-muted)' }}>Risks</div>
              <div className="space-y-1.5">
                {code_analysis.risks?.map((risk, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--red)', boxShadow: '0 0 4px var(--red)' }} />
                    <span className="text-xs font-mono" style={{ color: 'var(--text-secondary)' }}>{risk}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== Migration Plan ===== */}
      {migration_plan && (
        <div className="card-terminal animate-fade-in p-6" style={{ animationDelay: '0.15s' }}>
          <div className="flex items-center gap-2 mb-5">
            <svg className="w-4 h-4" style={{ color: 'var(--blue)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z" />
            </svg>
            <h3 className="text-sm font-mono uppercase tracking-widest" style={{ color: 'var(--text-secondary)' }}>Migration Plan</h3>
          </div>

          {/* Phases */}
          <div className="space-y-3 mb-5">
            {migration_plan.phases?.map((phase, i) => {
              const colors = ['var(--green-term)', 'var(--blue)', 'var(--amber)', 'var(--green-term)'];
              const color = colors[i % colors.length];
              return (
                <div
                  key={i}
                  className="flex items-start gap-4 p-4 rounded-xl animate-slide-left"
                  style={{
                    background: `${color}06`,
                    border: `1px solid ${color}12`,
                    animationDelay: `${0.2 + i * 0.08}s`,
                  }}
                >
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                    style={{ background: `${color}10`, border: `1px solid ${color}25` }}
                  >
                    <span className="text-xs font-mono font-bold" style={{ color, textShadow: `0 0 4px ${color}` }}>{i + 1}</span>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{phase.name}</span>
                      <span className="text-xs font-mono" style={{ color }}>{phase.estimated_days}d</span>
                    </div>
                    <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{phase.description}</p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Plan metadata */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-5" style={{ borderTop: '1px solid var(--border)' }}>
            <div>
              <div className="text-[10px] font-mono uppercase tracking-widest mb-2" style={{ color: 'var(--text-muted)' }}>Risk Assessment</div>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{migration_plan.risk_assessment}</p>
            </div>
            <div>
              <div className="text-[10px] font-mono uppercase tracking-widest mb-2" style={{ color: 'var(--text-muted)' }}>Rollback Strategy</div>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{migration_plan.rollback_strategy}</p>
            </div>
          </div>

          {/* Dependency Order */}
          {migration_plan.dependency_order && migration_plan.dependency_order.length > 0 && (
            <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--border)' }}>
              <div className="text-[10px] font-mono uppercase tracking-widest mb-2" style={{ color: 'var(--text-muted)' }}>Dependency Order</div>
              <div className="flex flex-wrap gap-2 items-center">
                {migration_plan.dependency_order.map((dep, i) => (
                  <span key={i} className="flex items-center gap-2">
                    <span
                      className="px-2.5 py-1 rounded-lg text-xs font-mono font-semibold"
                      style={{ background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.15)', color: 'var(--blue)' }}
                    >
                      {dep}
                    </span>
                    {i < migration_plan.dependency_order.length - 1 && (
                      <svg width="12" height="12" viewBox="0 0 12 12" style={{ color: 'var(--text-muted)' }}>
                        <path d="M3 6 L9 6 M7 4 L9 6 L7 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                      </svg>
                    )}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===== Conversion Output ===== */}
      {conversion_output && (
        <div className="card-terminal animate-fade-in p-6" style={{ animationDelay: '0.2s' }}>
          <div className="flex items-center gap-2 mb-5">
            <svg className="w-4 h-4" style={{ color: 'var(--amber)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
            </svg>
            <h3 className="text-sm font-mono uppercase tracking-widest" style={{ color: 'var(--text-secondary)' }}>Conversion Output</h3>
          </div>

          {/* Target framework */}
          <div className="flex items-center gap-2 mb-4">
            <span className="text-[10px] font-mono uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Target Framework:</span>
            <span
              className="px-2.5 py-1 rounded-lg text-xs font-mono font-bold"
              style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)', color: 'var(--amber)' }}
            >
              {conversion_output.target_framework}
            </span>
          </div>

          {/* Patterns Converted */}
          {conversion_output.patterns_converted && conversion_output.patterns_converted.length > 0 && (
            <div className="mb-5">
              <div className="text-[10px] font-mono uppercase tracking-widest mb-2" style={{ color: 'var(--text-muted)' }}>Patterns Converted</div>
              <div className="space-y-2">
                {conversion_output.patterns_converted.map((pat, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 p-2.5 rounded-lg animate-slide-right"
                    style={{
                      background: 'rgba(34,197,94,0.04)',
                      border: '1px solid rgba(34,197,94,0.08)',
                      animationDelay: `${0.25 + i * 0.05}s`,
                    }}
                  >
                    <svg className="w-4 h-4 shrink-0" style={{ color: 'var(--green-term)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                    <span className="text-xs font-mono" style={{ color: 'var(--text-secondary)' }}>{pat}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Manual Review Needed */}
          {conversion_output.manual_review_needed && conversion_output.manual_review_needed.length > 0 && (
            <div>
              <div className="text-[10px] font-mono uppercase tracking-widest mb-2" style={{ color: 'var(--text-muted)' }}>Manual Review Needed</div>
              <div className="space-y-2">
                {conversion_output.manual_review_needed.map((item, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 p-2.5 rounded-lg"
                    style={{
                      background: 'rgba(245,158,11,0.04)',
                      border: '1px solid rgba(245,158,11,0.08)',
                    }}
                  >
                    <svg className="w-4 h-4 shrink-0" style={{ color: 'var(--amber)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" />
                    </svg>
                    <span className="text-xs font-mono" style={{ color: 'var(--text-secondary)' }}>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===== Raw Agent Analysis ===== */}
      {response.raw_analysis && (
        <Collapsible title="Detailed Agent Reports" delay={0.3}>
          <div className="space-y-4">
            {Object.entries(response.raw_analysis).map(([key, agentData]) => {
              if (!agentData) return null;
              const agentMeta = config.agents.find((a) => a.id === agentData.agent) || { name: agentData.agent || key };
              const content = agentData.analysis || agentData.assessment || '';
              const colorMap: Record<string, string> = {
                code_analyzer: 'var(--green-term)',
                migration_planner: 'var(--blue)',
                conversion_agent: 'var(--amber)',
              };
              const color = colorMap[agentData.agent] || 'var(--green-term)';

              return (
                <div
                  key={key}
                  className="rounded-xl p-5"
                  style={{
                    background: 'var(--dark)',
                    border: `1px solid ${color}12`,
                  }}
                >
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-1.5 h-1.5 rounded-full" style={{ background: color, boxShadow: `0 0 4px ${color}` }} />
                    <h4
                      className="text-xs font-mono font-bold uppercase tracking-wider"
                      style={{ color, textShadow: `0 0 6px ${color}40` }}
                    >
                      {agentMeta.name}
                    </h4>
                  </div>
                  <pre
                    className="text-xs whitespace-pre-wrap leading-relaxed max-h-96 overflow-y-auto"
                    style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}
                  >
                    {content}
                  </pre>
                </div>
              );
            })}
          </div>
        </Collapsible>
      )}
    </div>
  );
}

import { Component, type ErrorInfo, type ReactNode } from 'react';
class ResultsErrorBoundary extends Component<{children: ReactNode}, {hasError: boolean}> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('ResultsPanel error:', error, info); }
  render() {
    if (this.state.hasError) {
      return <div className="p-6 bg-amber-50 border border-amber-200 rounded-xl text-center">
        <p className="text-amber-800 font-medium">Unable to display results</p>
        <p className="text-amber-600 text-sm mt-1">The agent response format was unexpected. Check the raw output in deployment details.</p>
      </div>;
    }
    return this.props.children;
  }
}
export default function ResultsPanel(props: any) { return <ResultsErrorBoundary><ResultsPanelInternal {...props} /></ResultsErrorBoundary>; }
