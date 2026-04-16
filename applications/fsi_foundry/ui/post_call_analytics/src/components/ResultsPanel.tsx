// @ts-nocheck
import { useState } from 'react';
import type { RuntimeConfig } from '../config';
import type { PostCallResponse } from '../types';

/* ---- Sentiment Color Helper ---- */

function sentimentColor(sentiment: string): string {
  const s = sentiment.toLowerCase();
  if (s.includes('positive') || s.includes('good') || s.includes('happy')) return '#16A34A';
  if (s.includes('negative') || s.includes('bad') || s.includes('angry') || s.includes('frustrated')) return '#DC2626';
  if (s.includes('neutral') || s.includes('mixed')) return '#D97706';
  return '#6B7280';
}

/* ---- Sentiment Pill ---- */

function SentimentPill({ label, sentiment }: { label: string; sentiment: string }) {
  const color = sentimentColor(sentiment);
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span
        className="sentiment-pill"
        style={{ background: `${color}0A`, color, border: `1px solid ${color}20` }}
      >
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
        {sentiment}
      </span>
    </div>
  );
}

/* ---- Priority Badge ---- */

function PriorityBadge({ priority }: { priority: string }) {
  const colorMap: Record<string, string> = {
    LOW: '#16A34A',
    MEDIUM: '#D97706',
    HIGH: '#DC2626',
    URGENT: '#DC2626',
    low: '#16A34A',
    medium: '#D97706',
    high: '#DC2626',
    urgent: '#DC2626',
  };
  const color = colorMap[priority] || '#6B7280';

  return (
    <span
      className="badge"
      style={{ background: `${color}0A`, color, border: `1px solid ${color}20` }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
      {priority}
    </span>
  );
}

/* ---- Status Badge ---- */

function StatusBadge({ status }: { status: string }) {
  const colorMap: Record<string, string> = {
    OPEN: '#D97706',
    PENDING: '#D97706',
    IN_PROGRESS: '#4338CA',
    COMPLETE: '#16A34A',
    DONE: '#16A34A',
    open: '#D97706',
    pending: '#D97706',
    in_progress: '#4338CA',
    complete: '#16A34A',
    done: '#16A34A',
  };
  const color = colorMap[status] || '#6B7280';

  return (
    <span
      className="badge"
      style={{ background: `${color}0A`, color, border: `1px solid ${color}20` }}
    >
      {status}
    </span>
  );
}

/* ---- Collapsible Section ---- */

function Collapsible({ title, children, defaultOpen = false, delay = 0 }: { title: string; children: React.ReactNode; defaultOpen?: boolean; delay?: number }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="card animate-fade-in p-6" style={{ animationDelay: `${delay}s` }}>
      <button onClick={() => setOpen(!open)} className="flex items-center justify-between w-full text-left cursor-pointer">
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
  response: PostCallResponse;
  config: RuntimeConfig;
  elapsed: number;
}) {
  const { transcription: _tr = {}, sentiment: _st = {}, action_items = [] } = response as any;
  const transcription = { key_topics: [], duration_seconds: 0, speaker_count: 0, ..._tr };
  const sentiment = { emotional_shifts: [], ..._st };

  return (
    <div className="space-y-5">
      {/* ===== Hero — Call Overview ===== */}
      <div
        className="card-elevated animate-fade-in-scale p-6"
        style={{ borderColor: 'rgba(67,56,202,0.15)' }}
      >
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full" style={{ background: 'var(--green)' }} />
            <span className="text-xs font-mono uppercase tracking-widest" style={{ color: 'var(--indigo)' }}>
              Review Complete
            </span>
          </div>
          <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
            {response.call_id} &bull; {elapsed}s
          </span>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="p-3 rounded-lg" style={{ background: 'var(--bg-secondary)' }}>
            <div className="text-[10px] font-mono uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>Speakers</div>
            <div className="text-lg font-bold font-mono" style={{ color: 'var(--indigo)' }}>{transcription.speaker_count}</div>
          </div>
          <div className="p-3 rounded-lg" style={{ background: 'var(--bg-secondary)' }}>
            <div className="text-[10px] font-mono uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>Duration</div>
            <div className="text-lg font-bold font-mono" style={{ color: 'var(--text-primary)' }}>
              {Math.floor(transcription.duration_seconds / 60)}m {transcription.duration_seconds % 60}s
            </div>
          </div>
          <div className="p-3 rounded-lg" style={{ background: 'var(--bg-secondary)' }}>
            <div className="text-[10px] font-mono uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>Satisfaction</div>
            <div className="text-lg font-bold font-mono" style={{ color: sentiment.satisfaction_score >= 0.7 ? 'var(--green)' : sentiment.satisfaction_score >= 0.4 ? 'var(--amber)' : 'var(--red)' }}>
              {Math.round(sentiment.satisfaction_score * 100)}%
            </div>
          </div>
          <div className="p-3 rounded-lg" style={{ background: 'var(--bg-secondary)' }}>
            <div className="text-[10px] font-mono uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>Action Items</div>
            <div className="text-lg font-bold font-mono" style={{ color: 'var(--amber)' }}>{action_items.length}</div>
          </div>
        </div>

        {/* Sentiment Overview */}
        <div className="flex flex-wrap gap-4 mb-4">
          <SentimentPill label="Overall" sentiment={sentiment.overall_sentiment} />
          <SentimentPill label="Customer" sentiment={sentiment.customer_sentiment} />
          <SentimentPill label="Agent" sentiment={sentiment.agent_sentiment} />
        </div>

        {/* Satisfaction Bar */}
        <div>
          <div className="flex justify-between items-baseline mb-1">
            <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Satisfaction Score</span>
            <span className="text-xs font-mono font-bold" style={{ color: 'var(--indigo)' }}>{Math.round(sentiment.satisfaction_score * 100)}%</span>
          </div>
          <div className="sentiment-bar">
            <div
              className="sentiment-bar-fill"
              style={{
                width: `${sentiment.satisfaction_score * 100}%`,
                background: sentiment.satisfaction_score >= 0.7 ? 'var(--green)' : sentiment.satisfaction_score >= 0.4 ? 'var(--amber)' : 'var(--red)',
              }}
            />
          </div>
        </div>
      </div>

      {/* ===== Transcription ===== */}
      <Collapsible title="Transcription" defaultOpen delay={0.1}>
        <div className="space-y-4">
          {/* Key Topics */}
          {transcription.key_topics.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>Key Topics</h4>
              <div className="flex flex-wrap gap-2">
                {transcription.key_topics.map((topic, i) => (
                  <span
                    key={i}
                    className="badge"
                    style={{ background: 'rgba(67,56,202,0.06)', color: 'var(--indigo)', border: '1px solid rgba(67,56,202,0.15)' }}
                  >
                    {topic}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Transcript Summary */}
          {transcription.transcript_summary && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>Summary</h4>
              <div className="transcript-block">
                <p className="text-sm leading-relaxed whitespace-pre-line" style={{ color: 'var(--text-secondary)' }}>
                  {transcription.transcript_summary}
                </p>
              </div>
            </div>
          )}
        </div>
      </Collapsible>

      {/* ===== Sentiment Analysis ===== */}
      <Collapsible title="Sentiment Analysis" defaultOpen delay={0.15}>
        <div className="space-y-4">
          {/* Sentiment Details */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { label: 'Overall', value: sentiment.overall_sentiment },
              { label: 'Customer', value: sentiment.customer_sentiment },
              { label: 'Agent', value: sentiment.agent_sentiment },
            ].map((item) => {
              const color = sentimentColor(item.value);
              return (
                <div key={item.label} className="p-4 rounded-xl text-center" style={{ background: `${color}06`, border: `1px solid ${color}15` }}>
                  <div className="text-[10px] font-mono uppercase tracking-widest mb-2" style={{ color: 'var(--text-muted)' }}>{item.label}</div>
                  <div className="text-base font-bold" style={{ color }}>{item.value}</div>
                </div>
              );
            })}
          </div>

          {/* Emotional Shifts */}
          {sentiment.emotional_shifts.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>Emotional Shifts</h4>
              <div className="space-y-2">
                {sentiment.emotional_shifts.map((shift, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 p-3 rounded-lg animate-slide-right"
                    style={{
                      background: 'var(--bg-secondary)',
                      border: '1px solid var(--border)',
                      animationDelay: `${0.2 + i * 0.06}s`,
                    }}
                  >
                    <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0" style={{ background: 'rgba(67,56,202,0.08)' }}>
                      <svg className="w-3.5 h-3.5" style={{ color: 'var(--indigo)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
                      </svg>
                    </div>
                    <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{shift}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </Collapsible>

      {/* ===== Action Items ===== */}
      {action_items.length > 0 && (
        <Collapsible title="Action Items" defaultOpen delay={0.2}>
          <div className="space-y-3">
            {action_items.map((item, i) => (
              <div
                key={i}
                className="action-row animate-slide-left"
                style={{ animationDelay: `${0.2 + i * 0.08}s` }}
              >
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                  style={{ background: 'rgba(67,56,202,0.06)', border: '1px solid rgba(67,56,202,0.12)' }}
                >
                  <span className="text-xs font-mono font-bold" style={{ color: 'var(--indigo)' }}>{i + 1}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>{item.description}</p>
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-1.5">
                      <svg className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                      </svg>
                      <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{item.assignee}</span>
                    </div>
                    <PriorityBadge priority={item.priority} />
                    <StatusBadge status={item.status} />
                    {item.deadline && (
                      <div className="flex items-center gap-1.5">
                        <svg className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                        </svg>
                        <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{item.deadline}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Collapsible>
      )}

      {/* ===== Summary ===== */}
      {response.summary && (
        <div className="card animate-fade-in p-6" style={{ animationDelay: '0.25s' }}>
          <div className="flex items-center gap-2 mb-4">
            <svg className="w-4 h-4" style={{ color: 'var(--indigo)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
            <h3 className="text-sm font-mono uppercase tracking-widest" style={{ color: 'var(--text-secondary)' }}>Summary</h3>
          </div>
          <div className="text-sm leading-relaxed whitespace-pre-line" style={{ color: 'var(--text-secondary)' }}>
            {response.summary}
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
                transcription_processor: '#4338CA',
                sentiment_analyst: '#16A34A',
                action_extractor: '#D97706',
              };
              const color = colorMap[agentData.agent] || '#4338CA';

              return (
                <div
                  key={key}
                  className="rounded-xl p-5"
                  style={{
                    background: 'var(--bg-secondary)',
                    border: `1px solid ${color}15`,
                  }}
                >
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
                    <h4 className="text-xs font-mono font-bold uppercase tracking-wider" style={{ color }}>
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
