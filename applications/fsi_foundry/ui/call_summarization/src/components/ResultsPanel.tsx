// @ts-nocheck
import { useState } from 'react';
import type { RuntimeConfig } from '../config';
import type { SummarizationResponse } from '../types';

/* ---- Sentiment Badge ---- */

function SentimentBadge({ sentiment }: { sentiment: string }) {
  const lower = sentiment.toLowerCase();
  let bg = 'rgba(124,58,237,0.06)';
  let border = 'rgba(124,58,237,0.2)';
  let color = 'var(--violet)';

  if (lower.includes('positive') || lower.includes('happy') || lower.includes('satisfied')) {
    bg = 'rgba(34,197,94,0.06)'; border = 'rgba(34,197,94,0.2)'; color = 'var(--green)';
  } else if (lower.includes('negative') || lower.includes('angry') || lower.includes('frustrated')) {
    bg = 'rgba(239,68,68,0.06)'; border = 'rgba(239,68,68,0.2)'; color = '#EF4444';
  } else if (lower.includes('neutral')) {
    bg = 'rgba(245,158,11,0.06)'; border = 'rgba(245,158,11,0.2)'; color = 'var(--amber)';
  }

  return (
    <span
      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold capitalize"
      style={{ background: bg, border: `1px solid ${border}`, color }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
      {sentiment}
    </span>
  );
}

/* ---- Collapsible Section ---- */

function Collapsible({ title, children, defaultOpen = false, delay = 0 }: { title: string; children: React.ReactNode; defaultOpen?: boolean; delay?: number }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="card-elevated animate-fade-in p-6" style={{ animationDelay: `${delay}s` }}>
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
  response: SummarizationResponse;
  config: RuntimeConfig;
  elapsed: number;
}) {
  const { key_points: _kp = {}, summary_result: _sr = {}, overall_summary = '' } = response as any;
  const key_points = { key_points: [], topics_discussed: [], call_outcome: '', ...(Array.isArray(_kp) ? {} : _kp) };
  const summary_result = { action_items: [], ..._sr };

  return (
    <div className="space-y-5">
      {/* ===== Hero — Overall Summary ===== */}
      <div
        className="card-elevated animate-fade-in-scale p-6"
        style={{
          background: 'linear-gradient(135deg, rgba(255,255,255,1) 0%, rgba(124,58,237,0.02) 100%)',
        }}
      >
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full" style={{ background: 'var(--green)' }} />
            <span
              className="text-xs font-mono uppercase tracking-widest"
              style={{ color: 'var(--violet)' }}
            >
              Summary Complete
            </span>
          </div>
          <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
            {response.call_id} &bull; {elapsed}s
          </span>
        </div>

        {/* Metrics row */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="text-center">
            <div className="text-[10px] font-mono uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>Key Points</div>
            <div className="text-lg font-bold font-mono" style={{ color: 'var(--violet)' }}>
              {key_points?.key_points?.length || 0}
            </div>
          </div>
          <div className="text-center">
            <div className="text-[10px] font-mono uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>Action Items</div>
            <div className="text-lg font-bold font-mono" style={{ color: 'var(--green)' }}>
              {summary_result?.action_items?.length || 0}
            </div>
          </div>
          <div className="text-center">
            <div className="text-[10px] font-mono uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>Sentiment</div>
            <SentimentBadge sentiment={summary_result?.customer_sentiment || 'Unknown'} />
          </div>
        </div>

        {/* Overall summary */}
        <div className="text-sm leading-relaxed whitespace-pre-line" style={{ color: 'var(--text-secondary)' }}>
          {overall_summary}
        </div>
      </div>

      {/* ===== Key Points ===== */}
      {key_points && (
        <div className="card-elevated animate-fade-in p-6" style={{ animationDelay: '0.1s' }}>
          <div className="flex items-center gap-2 mb-5">
            <svg className="w-4 h-4" style={{ color: 'var(--violet)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
            </svg>
            <h3 className="text-sm font-mono uppercase tracking-widest" style={{ color: 'var(--text-secondary)' }}>Key Points</h3>
          </div>
          <div className="space-y-3">
            {key_points.key_points?.map((point, i) => (
              <div
                key={i}
                className="flex items-start gap-3 p-3.5 rounded-xl animate-slide-left"
                style={{
                  background: 'rgba(124,58,237,0.03)',
                  border: '1px solid rgba(124,58,237,0.08)',
                  animationDelay: `${0.15 + i * 0.06}s`,
                }}
              >
                <div
                  className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                  style={{ background: 'rgba(124,58,237,0.08)', border: '1px solid rgba(124,58,237,0.15)' }}
                >
                  <span className="text-xs font-mono font-bold" style={{ color: 'var(--violet)' }}>{i + 1}</span>
                </div>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{point}</p>
              </div>
            ))}
          </div>

          {/* Call Outcome + Topics */}
          <div className="mt-5 pt-5 grid grid-cols-1 md:grid-cols-2 gap-4" style={{ borderTop: '1px solid var(--border)' }}>
            <div>
              <div className="text-[10px] font-mono uppercase tracking-widest mb-2" style={{ color: 'var(--text-muted)' }}>Call Outcome</div>
              <p className="text-sm" style={{ color: 'var(--text-primary)' }}>{key_points.call_outcome}</p>
            </div>
            <div>
              <div className="text-[10px] font-mono uppercase tracking-widest mb-2" style={{ color: 'var(--text-muted)' }}>Topics Discussed</div>
              <div className="flex flex-wrap gap-1.5">
                {key_points.topics_discussed?.map((topic, i) => (
                  <span
                    key={i}
                    className="px-2.5 py-1 rounded-full text-xs font-medium"
                    style={{ background: 'rgba(124,58,237,0.06)', color: 'var(--violet)' }}
                  >
                    {topic}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== Executive Summary ===== */}
      {summary_result && (
        <div className="card-elevated animate-fade-in p-6" style={{ animationDelay: '0.15s' }}>
          <div className="flex items-center gap-2 mb-5">
            <svg className="w-4 h-4" style={{ color: 'var(--green)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
            <h3 className="text-sm font-mono uppercase tracking-widest" style={{ color: 'var(--text-secondary)' }}>Executive Summary</h3>
          </div>
          <div className="text-sm leading-relaxed whitespace-pre-line mb-5" style={{ color: 'var(--text-secondary)' }}>
            {summary_result.executive_summary}
          </div>

          {/* Audience level */}
          <div className="flex items-center gap-2 mb-5 pb-5" style={{ borderBottom: '1px solid var(--border)' }}>
            <span className="text-[10px] font-mono uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Audience Level:</span>
            <span
              className="px-2.5 py-1 rounded-full text-xs font-medium"
              style={{ background: 'rgba(245,158,11,0.06)', color: 'var(--amber)', border: '1px solid rgba(245,158,11,0.15)' }}
            >
              {summary_result.audience_level}
            </span>
          </div>

          {/* Action Items */}
          <div>
            <div className="text-[10px] font-mono uppercase tracking-widest mb-3" style={{ color: 'var(--text-muted)' }}>Action Items</div>
            <div className="space-y-2">
              {summary_result.action_items?.map((item, i) => (
                <div
                  key={i}
                  className="flex items-start gap-3 p-3 rounded-xl animate-slide-right"
                  style={{
                    background: 'rgba(34,197,94,0.03)',
                    border: '1px solid rgba(34,197,94,0.08)',
                    animationDelay: `${0.2 + i * 0.06}s`,
                  }}
                >
                  <div
                    className="w-5 h-5 rounded-md flex items-center justify-center shrink-0 mt-0.5"
                    style={{ border: '1.5px solid rgba(34,197,94,0.3)' }}
                  >
                    <svg className="w-3 h-3" style={{ color: 'var(--green)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                  </div>
                  <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{item}</p>
                </div>
              ))}
            </div>
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
                key_point_extractor: 'var(--violet)',
                summary_generator: 'var(--green)',
              };
              const color = colorMap[agentData.agent] || 'var(--violet)';

              return (
                <div
                  key={key}
                  className="rounded-xl p-5"
                  style={{
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border)',
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
