// @ts-nocheck
import { useState } from 'react';
import type { RuntimeConfig } from '../config';
import type { TriageResponse } from '../types';

/* ---- Urgency Badge ---- */

function UrgencyBadge({ urgency }: { urgency: string }) {
  const cfg: Record<string, { bg: string; border: string; text: string; label: string }> = {
    CRITICAL: { bg: 'var(--red-50)', border: 'var(--red-500)', text: 'var(--red-500)', label: 'Critical' },
    HIGH: { bg: 'var(--amber-50)', border: 'var(--amber-500)', text: 'var(--amber-500)', label: 'High' },
    MEDIUM: { bg: 'var(--blue-50)', border: 'var(--blue-500)', text: 'var(--blue-500)', label: 'Medium' },
    LOW: { bg: 'var(--green-50)', border: 'var(--green-500)', text: 'var(--green-500)', label: 'Low' },
  };
  const c = cfg[urgency] || cfg.MEDIUM;
  const icons: Record<string, string> = {
    CRITICAL: 'M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z',
    HIGH: 'M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z',
    MEDIUM: 'M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z',
    LOW: 'M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  };

  return (
    <div
      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold uppercase tracking-wider animate-fade-in-scale"
      style={{ background: c.bg, border: `1px solid ${c.border}`, color: c.text }}
    >
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d={icons[urgency] || icons.MEDIUM} />
      </svg>
      {c.label}
    </div>
  );
}

/* ---- Category Badge ---- */

function CategoryBadge({ category }: { category: string }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold"
      style={{ background: 'var(--blue-50)', border: '1px solid var(--blue-200)', color: 'var(--blue-600)' }}
    >
      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" />
      </svg>
      {category}
    </span>
  );
}

/* ---- Importance Meter ---- */

function ImportanceMeter({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const getColor = () => {
    if (value >= 0.8) return 'var(--red-500)';
    if (value >= 0.6) return 'var(--amber-500)';
    if (value >= 0.4) return 'var(--blue-500)';
    return 'var(--green-500)';
  };

  return (
    <div className="flex items-center gap-3">
      <div className="importance-bar flex-1">
        <div
          className="importance-bar-fill"
          style={{ width: `${pct}%`, background: getColor() }}
        />
      </div>
      <span className="text-sm font-bold font-mono" style={{ color: getColor() }}>{pct}%</span>
    </div>
  );
}

/* ---- Topic Tag ---- */

function TopicTag({ topic }: { topic: string }) {
  return (
    <span
      className="inline-flex items-center px-3 py-1 rounded-lg text-xs font-medium"
      style={{ background: 'var(--gray-100)', border: '1px solid var(--gray-200)', color: 'var(--charcoal)' }}
    >
      {topic}
    </span>
  );
}

/* ---- Action Item ---- */

function ActionItem({ action, index, total }: { action: string; index: number; total: number }) {
  const isLast = index === total - 1;

  return (
    <div className="relative flex gap-4 animate-slide-left" style={{ animationDelay: `${0.3 + index * 0.1}s` }}>
      <div className="flex flex-col items-center">
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 relative z-10"
          style={{
            background: 'var(--blue-50)',
            border: '1px solid var(--blue-300)',
          }}
        >
          <svg className="w-3.5 h-3.5" style={{ color: 'var(--blue-500)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        </div>
        {!isLast && (
          <div className="w-px flex-1 min-h-[16px]" style={{ background: 'var(--blue-200)' }} />
        )}
      </div>
      <div className="pb-4 flex-1">
        <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{action}</p>
      </div>
    </div>
  );
}

/* ---- Deadline Item ---- */

function DeadlineItem({ deadline, index }: { deadline: string; index: number }) {
  return (
    <div
      className="flex items-center gap-3 p-3 rounded-lg animate-slide-right"
      style={{
        background: 'var(--amber-50)',
        border: '1px solid var(--amber-100)',
        animationDelay: `${0.2 + index * 0.08}s`,
      }}
    >
      <svg className="w-4 h-4 shrink-0" style={{ color: 'var(--amber-500)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <span className="text-sm" style={{ color: 'var(--charcoal)' }}>{deadline}</span>
    </div>
  );
}

/* ---- Collapsible Section ---- */

function Collapsible({ title, children, defaultOpen = false, delay = 0 }: { title: string; children: React.ReactNode; defaultOpen?: boolean; delay?: number }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="glass animate-fade-in p-6" style={{ animationDelay: `${delay}s` }}>
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
  response: TriageResponse;
  config: RuntimeConfig;
  elapsed: number;
}) {
  const { classification: _cls = {}, summary = '', recommendations = [] } = response as any;
  const classification = { actions_required: [], deadlines: [], topics: [], ..._cls };

  return (
    <div className="space-y-5">
      {/* ===== Hero -- Classification ===== */}
      <div
        className="glass animate-fade-in-scale p-6"
        style={{
          background: 'linear-gradient(135deg, #FFFFFF 0%, #EFF6FF 100%)',
          borderColor: 'var(--blue-200)',
        }}
      >
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full" style={{ background: 'var(--green-500)' }} />
            <span
              className="text-xs font-mono uppercase tracking-widest"
              style={{ color: 'var(--blue-600)' }}
            >
              Triage Complete
            </span>
          </div>
          <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
            {response.triage_id?.slice(0, 8) || "N/A"} &bull; {elapsed}s
          </span>
        </div>

        {/* Urgency + Category */}
        <div className="flex items-center justify-center gap-4 mb-6">
          <UrgencyBadge urgency={classification.urgency} />
          <CategoryBadge category={classification.category} />
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="text-center">
            <div className="text-[10px] font-mono uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>Email ID</div>
            <div className="text-lg font-bold font-mono" style={{ color: 'var(--charcoal)' }}>{response.entity_id}</div>
          </div>
          <div className="text-center">
            <div className="text-[10px] font-mono uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>Actions Found</div>
            <div className="text-lg font-bold font-mono" style={{ color: 'var(--blue-600)' }}>
              {classification.actions_required.length}
            </div>
          </div>
          <div className="text-center">
            <div className="text-[10px] font-mono uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>Deadlines</div>
            <div
              className="text-lg font-bold font-mono"
              style={{
                color: classification.deadlines.length > 0 ? 'var(--amber-500)' : 'var(--green-500)',
              }}
            >
              {classification.deadlines.length > 0 ? classification.deadlines.length : 'None'}
            </div>
          </div>
        </div>

        {/* Sender Importance */}
        <div className="mb-6">
          <div className="text-[10px] font-mono uppercase tracking-widest mb-2" style={{ color: 'var(--text-muted)' }}>Sender Importance</div>
          <ImportanceMeter value={classification.sender_importance} />
        </div>

        {/* Topics */}
        {classification.topics.length > 0 && (
          <div className="mb-4">
            <div className="text-[10px] font-mono uppercase tracking-widest mb-2" style={{ color: 'var(--text-muted)' }}>Topics</div>
            <div className="flex flex-wrap gap-2">
              {classification.topics.map((topic, i) => (
                <TopicTag key={i} topic={topic} />
              ))}
            </div>
          </div>
        )}

        {/* Summary */}
        <div className="text-sm leading-relaxed whitespace-pre-line mt-4 pt-4" style={{ color: 'var(--text-secondary)', borderTop: '1px solid var(--border)' }}>
          {summary.split('\n').map((line, i) => {
            if (line.startsWith('**') && line.endsWith('**')) {
              return <p key={i} className="font-bold mt-3 mb-1" style={{ color: 'var(--charcoal)' }}>{line.replace(/\*\*/g, '')}</p>;
            }
            if (line.startsWith('- **')) {
              const parts = line.replace(/^- /, '').split('**');
              return (
                <p key={i} className="ml-4 mb-0.5">
                  <span className="font-semibold" style={{ color: 'var(--charcoal)' }}>{parts[1]}</span>
                  {parts[2]}
                </p>
              );
            }
            if (line.trim() === '') return <br key={i} />;
            return <p key={i} className="mb-0.5">{line.replace(/\*\*/g, '')}</p>;
          })}
        </div>
      </div>

      {/* ===== Actions Required ===== */}
      {classification.actions_required.length > 0 && (
        <div className="glass animate-fade-in p-6" style={{ animationDelay: '0.1s' }}>
          <div className="flex items-center gap-2 mb-6">
            <svg className="w-4 h-4" style={{ color: 'var(--blue-500)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11.35 3.836c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15a2.25 2.25 0 012.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m8.9-4.414c.376.023.75.05 1.124.08 1.131.094 1.976 1.057 1.976 2.192V16.5A2.25 2.25 0 0118 18.75h-2.25m-7.5-10.5H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V18.75m-7.5-10.5h6.375c.621 0 1.125.504 1.125 1.125v9.375m-8.25-3l1.5 1.5 3-3.75" />
            </svg>
            <h3 className="text-sm font-semibold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
              Actions Required
            </h3>
          </div>
          <div>
            {classification.actions_required.map((action, i) => (
              <ActionItem key={i} action={action} index={i} total={classification.actions_required.length} />
            ))}
          </div>
        </div>
      )}

      {/* ===== Deadlines ===== */}
      {classification.deadlines.length > 0 && (
        <div className="glass animate-fade-in p-6" style={{ animationDelay: '0.15s' }}>
          <div className="flex items-center gap-2 mb-5">
            <svg className="w-4 h-4" style={{ color: 'var(--amber-500)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h3 className="text-sm font-semibold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>Deadlines</h3>
          </div>
          <div className="space-y-2">
            {classification.deadlines.map((deadline, i) => (
              <DeadlineItem key={i} deadline={deadline} index={i} />
            ))}
          </div>
        </div>
      )}

      {/* ===== Recommendations ===== */}
      {recommendations.length > 0 && (
        <div className="glass animate-fade-in p-6" style={{ animationDelay: '0.2s' }}>
          <div className="flex items-center gap-2 mb-5">
            <svg className="w-4 h-4" style={{ color: 'var(--blue-600)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
            </svg>
            <h3 className="text-sm font-semibold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>Recommendations</h3>
          </div>
          <div className="grid grid-cols-1 gap-3">
            {recommendations.map((rec, i) => (
              <div
                key={i}
                className="flex items-start gap-3 p-3.5 rounded-xl animate-slide-right"
                style={{
                  background: 'var(--blue-50)',
                  border: '1px solid var(--blue-100)',
                  animationDelay: `${0.2 + i * 0.08}s`,
                }}
              >
                <div
                  className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                  style={{ background: 'var(--blue-100)', border: '1px solid var(--blue-200)' }}
                >
                  <span className="text-xs font-mono font-bold" style={{ color: 'var(--blue-600)' }}>{i + 1}</span>
                </div>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{rec}</p>
              </div>
            ))}
          </div>
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
                email_classifier: 'var(--blue-500)',
                action_extractor: 'var(--blue-700)',
              };
              const bgMap: Record<string, string> = {
                email_classifier: 'var(--blue-50)',
                action_extractor: '#EEF2FF',
              };
              const color = colorMap[agentData.agent] || 'var(--blue-500)';
              const bg = bgMap[agentData.agent] || 'var(--blue-50)';

              return (
                <div
                  key={key}
                  className="rounded-xl p-5"
                  style={{
                    background: bg,
                    border: `1px solid var(--blue-200)`,
                  }}
                >
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
                    <h4
                      className="text-xs font-mono font-bold uppercase tracking-wider"
                      style={{ color }}
                    >
                      {agentMeta.name}
                    </h4>
                  </div>
                  <pre
                    className="text-xs whitespace-pre-wrap leading-relaxed max-h-96 overflow-y-auto"
                    style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-sans)' }}
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
