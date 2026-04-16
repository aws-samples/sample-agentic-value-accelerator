// @ts-nocheck
import { useState } from 'react';
import type { RuntimeConfig } from '../config';
import type { SupportResponse } from '../types';

/* ---- Urgency Badge ---- */

function UrgencyBadge({ urgency }: { urgency: string }) {
  const cfg: Record<string, { bg: string; border: string; text: string; label: string }> = {
    LOW: { bg: 'var(--emerald-100)', border: 'rgba(16, 185, 129, 0.3)', text: 'var(--emerald-500)', label: 'Low' },
    MEDIUM: { bg: 'var(--amber-100)', border: 'rgba(245, 158, 11, 0.3)', text: '#B45309', label: 'Medium' },
    HIGH: { bg: 'rgba(249, 115, 22, 0.1)', border: 'rgba(249, 115, 22, 0.3)', text: 'var(--orange-500)', label: 'High' },
    CRITICAL: { bg: 'var(--rose-100)', border: 'rgba(225, 29, 72, 0.3)', text: 'var(--rose-600)', label: 'Critical' },
  };
  const c = cfg[urgency] || cfg.MEDIUM;

  return (
    <span
      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider"
      style={{ background: c.bg, border: `1px solid ${c.border}`, color: c.text }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: c.text }} />
      {c.label}
    </span>
  );
}

/* ---- Urgency Thermometer Bar ---- */

function UrgencyBar({ urgency }: { urgency: string }) {
  const levelClass: Record<string, string> = {
    LOW: 'level-low',
    MEDIUM: 'level-medium',
    HIGH: 'level-high',
    CRITICAL: 'level-critical',
  };

  return (
    <div className="urgency-bar">
      <div className={`urgency-bar-fill ${levelClass[urgency] || 'level-medium'}`} />
    </div>
  );
}

/* ---- Confidence Meter ---- */

function ConfidenceMeter({ confidence }: { confidence: number }) {
  const pct = Math.round(confidence * 100);
  const color = pct >= 80 ? 'var(--emerald-500)' : pct >= 50 ? 'var(--amber-500)' : 'var(--rose-500)';

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Confidence</span>
        <span className="text-sm font-bold" style={{ color }}>{pct}%</span>
      </div>
      <div className="confidence-meter">
        <div
          className="confidence-meter-fill"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/* ---- Escalation Status Badge ---- */

function EscalationBadge({ status }: { status: string }) {
  const classMap: Record<string, string> = {
    NOT_NEEDED: 'status-not-needed',
    RECOMMENDED: 'status-recommended',
    REQUIRED: 'status-required',
  };
  const labelMap: Record<string, string> = {
    NOT_NEEDED: 'Not Needed',
    RECOMMENDED: 'Recommended',
    REQUIRED: 'Required',
  };
  const iconMap: Record<string, string> = {
    NOT_NEEDED: 'M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
    RECOMMENDED: 'M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z',
    REQUIRED: 'M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z',
  };

  return (
    <span className={`escalation-badge ${classMap[status] || 'status-not-needed'}`}>
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d={iconMap[status] || iconMap.NOT_NEEDED} />
      </svg>
      {labelMap[status] || status}
    </span>
  );
}

/* ---- Collapsible Section ---- */

function Collapsible({ title, children, defaultOpen = false, delay = 0 }: { title: string; children: React.ReactNode; defaultOpen?: boolean; delay?: number }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="card animate-fade-slide-up p-6" style={{ animationDelay: `${delay}s` }}>
      <button onClick={() => setOpen(!open)} className="flex items-center justify-between w-full text-left cursor-pointer">
        <h3 className="text-sm font-semibold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>{title}</h3>
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
  response: SupportResponse;
  config: RuntimeConfig;
  elapsed: number;
}) {
  const { classification: _cls = {}, resolution: _res = {}, escalation = {}, recommendations = [], summary = '' } = response as any;
  const classification = { required_expertise: [], tags: [], ..._cls };
  const resolution = { steps: [], similar_cases: [], knowledge_base_refs: [], ..._res };

  return (
    <div className="space-y-5">

      {/* ===== TICKET HEADER ===== */}
      <div
        className="card animate-fade-in-scale p-6"
        style={{
          background: 'linear-gradient(135deg, var(--sky-50), #FFFFFF)',
          borderColor: 'rgba(14, 165, 233, 0.2)',
          boxShadow: 'var(--shadow-md)',
        }}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full" style={{ background: 'var(--emerald-500)' }} />
            <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--sky-600)' }}>
              Analysis Complete
            </span>
          </div>
          <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
            {response.ticket_id?.slice(0, 12) || 'N/A'} &bull; {elapsed}s
          </span>
        </div>

        {/* Ticket metadata */}
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center">
            <div className="text-[10px] font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>Customer</div>
            <div className="text-lg font-bold font-mono" style={{ color: 'var(--text-primary)' }}>{response.customer_id}</div>
          </div>
          <div className="text-center">
            <div className="text-[10px] font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>Ticket ID</div>
            <div className="text-sm font-bold font-mono" style={{ color: 'var(--sky-600)' }}>{response.ticket_id || 'N/A'}</div>
          </div>
          <div className="text-center">
            <div className="text-[10px] font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>Timestamp</div>
            <div className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
              {response.timestamp ? new Date(response.timestamp).toLocaleString() : 'N/A'}
            </div>
          </div>
        </div>
      </div>

      {/* ===== 3-CARD LAYOUT ===== */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">

        {/* -- Classification Card -- */}
        <div
          className="card animate-ticket-slide p-5"
          style={{ animationDelay: '0.1s', borderTop: '3px solid var(--sky-500)' }}
        >
          <div className="flex items-center gap-2 mb-4">
            <svg className="w-4 h-4" style={{ color: 'var(--sky-500)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" />
            </svg>
            <h3 className="text-sm font-bold uppercase tracking-wider" style={{ color: 'var(--sky-600)' }}>Classification</h3>
          </div>

          {classification ? (
            <div className="space-y-4">
              {/* Category */}
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>Category</div>
                <span className="category-chip">{classification.category}</span>
              </div>

              {/* Urgency with thermometer */}
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-muted)' }}>Urgency</div>
                <UrgencyBadge urgency={classification.urgency} />
                <div className="mt-2">
                  <UrgencyBar urgency={classification.urgency} />
                </div>
              </div>

              {/* Expertise tags */}
              {classification.required_expertise.length > 0 && (
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-muted)' }}>Required Expertise</div>
                  <div className="flex flex-wrap gap-1.5">
                    {classification.required_expertise.map((exp, i) => (
                      <span key={i} className="tag-chip">{exp}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Tags */}
              {classification.tags.length > 0 && (
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-muted)' }}>Tags</div>
                  <div className="flex flex-wrap gap-1.5">
                    {classification.tags.map((tag, i) => (
                      <span key={i} className="tag-chip">{tag}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No classification data</p>
          )}
        </div>

        {/* -- Resolution Card -- */}
        <div
          className="card animate-ticket-slide p-5"
          style={{ animationDelay: '0.2s', borderTop: '3px solid var(--emerald-500)' }}
        >
          <div className="flex items-center gap-2 mb-4">
            <svg className="w-4 h-4" style={{ color: 'var(--emerald-500)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
            </svg>
            <h3 className="text-sm font-bold uppercase tracking-wider" style={{ color: 'var(--emerald-500)' }}>Resolution</h3>
          </div>

          {resolution ? (
            <div className="space-y-4">
              {/* Confidence Meter */}
              <ConfidenceMeter confidence={resolution.confidence} />

              {/* Suggested Resolution */}
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>Suggested Resolution</div>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{resolution.suggested_resolution}</p>
              </div>

              {/* Steps checklist */}
              {resolution.steps.length > 0 && (
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-muted)' }}>Steps</div>
                  <div className="space-y-1.5">
                    {resolution.steps.map((step, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <div
                          className="w-4 h-4 rounded flex items-center justify-center shrink-0 mt-0.5"
                          style={{ background: 'var(--emerald-100)', color: 'var(--emerald-500)' }}
                        >
                          <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                          </svg>
                        </div>
                        <span className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{step}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Similar cases */}
              {resolution.similar_cases.length > 0 && (
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-muted)' }}>Similar Cases</div>
                  <div className="flex flex-wrap gap-1.5">
                    {resolution.similar_cases.map((c, i) => (
                      <span key={i} className="tag-chip">{c}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* KB refs */}
              {resolution.knowledge_base_refs.length > 0 && (
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-muted)' }}>Knowledge Base</div>
                  <div className="flex flex-wrap gap-1.5">
                    {resolution.knowledge_base_refs.map((ref, i) => (
                      <span key={i} className="category-chip text-[10px]">{ref}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No resolution data</p>
          )}
        </div>

        {/* -- Escalation Card -- */}
        <div
          className="card animate-ticket-slide p-5"
          style={{ animationDelay: '0.3s', borderTop: '3px solid var(--amber-500)' }}
        >
          <div className="flex items-center gap-2 mb-4">
            <svg className="w-4 h-4" style={{ color: 'var(--amber-500)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 4.5h14.25M3 9h9.75M3 13.5h9.75m4.5-4.5v12m0 0l-3.75-3.75M17.25 21L21 17.25" />
            </svg>
            <h3 className="text-sm font-bold uppercase tracking-wider" style={{ color: '#B45309' }}>Escalation</h3>
          </div>

          {escalation ? (
            <div className="space-y-4">
              {/* Status badge */}
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-muted)' }}>Status</div>
                <EscalationBadge status={escalation.status} />
              </div>

              {/* Reason */}
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>Reason</div>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{escalation.reason}</p>
              </div>

              {/* Recommended team */}
              {escalation.recommended_team && (
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>Recommended Team</div>
                  <span className="category-chip">{escalation.recommended_team}</span>
                </div>
              )}

              {/* Priority override */}
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>Priority Override</div>
                <div className="flex items-center gap-2">
                  <div
                    className="w-5 h-5 rounded flex items-center justify-center"
                    style={{
                      background: escalation.priority_override ? 'var(--rose-100)' : 'var(--emerald-100)',
                      color: escalation.priority_override ? 'var(--rose-600)' : 'var(--emerald-500)',
                    }}
                  >
                    {escalation.priority_override ? (
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" />
                      </svg>
                    ) : (
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                    )}
                  </div>
                  <span className="text-xs font-medium" style={{ color: escalation.priority_override ? 'var(--rose-600)' : 'var(--emerald-500)' }}>
                    {escalation.priority_override ? 'Yes -- Priority Elevated' : 'No -- Standard Priority'}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No escalation data</p>
          )}
        </div>
      </div>

      {/* ===== RECOMMENDATIONS ===== */}
      {recommendations.length > 0 && (
        <div className="card animate-fade-slide-up p-6" style={{ animationDelay: '0.35s' }}>
          <div className="flex items-center gap-2 mb-5">
            <svg className="w-4 h-4" style={{ color: 'var(--sky-500)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
            </svg>
            <h3 className="text-sm font-semibold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>Recommendations</h3>
          </div>
          <div className="grid grid-cols-1 gap-3">
            {recommendations.map((rec, i) => {
              const colors = ['var(--sky-500)', 'var(--emerald-500)', 'var(--amber-500)'];
              const bgs = ['var(--sky-50)', 'rgba(16, 185, 129, 0.04)', 'rgba(245, 158, 11, 0.04)'];
              const color = colors[i % colors.length];
              const bg = bgs[i % bgs.length];
              return (
                <div
                  key={i}
                  className="flex items-start gap-3 p-3.5 rounded-xl animate-ticket-slide-right"
                  style={{
                    background: bg,
                    border: `1px solid ${color}20`,
                    animationDelay: `${0.4 + i * 0.08}s`,
                  }}
                >
                  <div
                    className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                    style={{ background: `${color}15`, color }}
                  >
                    <span className="text-xs font-bold">{i + 1}</span>
                  </div>
                  <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{rec}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ===== SUMMARY ===== */}
      {summary && (
        <div className="card animate-fade-slide-up p-6" style={{ animationDelay: '0.4s' }}>
          <div className="flex items-center gap-2 mb-4">
            <svg className="w-4 h-4" style={{ color: 'var(--sky-500)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
            <h3 className="text-sm font-semibold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>Summary</h3>
          </div>
          <div className="text-sm leading-relaxed whitespace-pre-line" style={{ color: 'var(--text-secondary)' }}>
            {summary.split('\n').map((line, i) => {
              if (line.startsWith('**') && line.endsWith('**')) {
                return <p key={i} className="font-bold mt-3 mb-1" style={{ color: 'var(--text-primary)' }}>{line.replace(/\*\*/g, '')}</p>;
              }
              if (line.startsWith('- **')) {
                const parts = line.replace(/^- /, '').split('**');
                return (
                  <p key={i} className="ml-4 mb-0.5">
                    <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{parts[1]}</span>
                    {parts[2]}
                  </p>
                );
              }
              if (line.trim() === '') return <br key={i} />;
              return <p key={i} className="mb-0.5">{line.replace(/\*\*/g, '')}</p>;
            })}
          </div>
        </div>
      )}

      {/* ===== RAW AGENT ANALYSIS ===== */}
      {response.raw_analysis && (
        <Collapsible title="Detailed Agent Reports" delay={0.5}>
          <div className="space-y-4">
            {Object.entries(response.raw_analysis).map(([key, agentData]) => {
              if (!agentData) return null;
              const agentMeta = config.agents.find((a) => a.id === agentData.agent) || { name: agentData.agent || key };
              const colorMap: Record<string, string> = {
                ticket_classifier: 'var(--sky-500)',
                resolution_agent: 'var(--emerald-500)',
                escalation_agent: 'var(--amber-500)',
              };
              const bgMap: Record<string, string> = {
                ticket_classifier: 'var(--sky-50)',
                resolution_agent: 'rgba(16, 185, 129, 0.04)',
                escalation_agent: 'rgba(245, 158, 11, 0.04)',
              };
              const color = colorMap[agentData.agent] || 'var(--sky-500)';
              const bg = bgMap[agentData.agent] || 'var(--sky-50)';

              return (
                <div
                  key={key}
                  className="rounded-xl p-5"
                  style={{
                    background: bg,
                    border: `1px solid ${color}20`,
                  }}
                >
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
                    <h4
                      className="text-xs font-bold uppercase tracking-wider"
                      style={{ color }}
                    >
                      {agentMeta.name}
                    </h4>
                  </div>
                  <pre
                    className="text-xs whitespace-pre-wrap leading-relaxed max-h-96 overflow-y-auto"
                    style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-sans)' }}
                  >
                    {JSON.stringify(agentData, null, 2)}
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
