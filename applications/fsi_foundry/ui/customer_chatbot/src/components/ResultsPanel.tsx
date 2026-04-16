// @ts-nocheck
import { useState } from 'react';
import type { RuntimeConfig } from '../config';
import type { ChatResponse, ActionDetail } from '../types';

/* ---- Action Type Badge ---- */

function ActionBadge({ type }: { type: ActionDetail['action_type'] }) {
  const cfg: Record<string, { className: string; label: string }> = {
    BALANCE_CHECK: { className: 'action-badge--balance', label: 'Balance Check' },
    STATEMENT_REQUEST: { className: 'action-badge--statement', label: 'Statement' },
    TRANSFER_INITIATED: { className: 'action-badge--transfer', label: 'Transfer' },
    BILL_PAID: { className: 'action-badge--bill', label: 'Bill Paid' },
    PROFILE_UPDATED: { className: 'action-badge--profile', label: 'Profile Updated' },
    INFO_PROVIDED: { className: 'action-badge--info', label: 'Info Provided' },
  };
  const c = cfg[type] || cfg.INFO_PROVIDED;

  return <span className={`action-badge ${c.className}`}>{c.label}</span>;
}

/* ---- Status Indicator ---- */

function StatusIndicator({ status }: { status: ActionDetail['status'] }) {
  const cfg: Record<string, { dotClass: string; label: string }> = {
    RESOLVED: { dotClass: 'status-dot--resolved', label: 'Resolved' },
    PENDING: { dotClass: 'status-dot--pending', label: 'Pending' },
    ESCALATED: { dotClass: 'status-dot--escalated', label: 'Escalated' },
    ACTIVE: { dotClass: 'status-dot--active', label: 'Active' },
  };
  const c = cfg[status] || cfg.PENDING;

  return (
    <div className="inline-flex items-center gap-1.5">
      <span className={`status-dot ${c.dotClass}`} />
      <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>{c.label}</span>
    </div>
  );
}

/* ---- Collapsible Section ---- */

function Collapsible({ title, children, defaultOpen = false, delay = 0 }: { title: string; children: React.ReactNode; defaultOpen?: boolean; delay?: number }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="card animate-fade-slide-up" style={{ animationDelay: `${delay}s` }}>
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
      {open && <div className="mt-5 pt-5" style={{ borderTop: '1px solid #E7E5E4' }}>{children}</div>}
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
  response: ChatResponse;
  config: RuntimeConfig;
  elapsed: number;
}) {
  return (
    <div className="space-y-5">
      {/* ===== Conversation Header ===== */}
      <div
        className="card animate-fade-slide-up"
        style={{
          background: 'linear-gradient(135deg, rgba(101,163,13,0.03), rgba(255,251,235,0.4))',
          borderColor: 'rgba(101,163,13,0.12)',
        }}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full" style={{ background: 'var(--sage)', boxShadow: '0 0 6px rgba(101,163,13,0.4)' }} />
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--sage)' }}>
              Conversation Complete
            </span>
          </div>
          <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
            {elapsed}s
          </span>
        </div>

        {/* Metrics row */}
        <div className="grid grid-cols-3 gap-4 mb-5">
          <div className="text-center">
            <div className="text-xs font-medium uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>Customer</div>
            <div className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>{response.customer_id}</div>
          </div>
          <div className="text-center">
            <div className="text-xs font-medium uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>Conversation</div>
            <div className="text-xs font-mono" style={{ color: 'var(--text-secondary)' }}>{response.conversation_id?.slice(0, 12)}...</div>
          </div>
          <div className="text-center">
            <div className="text-xs font-medium uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>Timestamp</div>
            <div className="text-xs font-mono" style={{ color: 'var(--text-secondary)' }}>{response.timestamp}</div>
          </div>
        </div>
      </div>

      {/* ===== Response Message (large chat bubble) ===== */}
      <div className="animate-fade-slide-up" style={{ animationDelay: '0.1s' }}>
        <div className="flex items-start gap-3">
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 mt-1"
            style={{
              background: 'linear-gradient(135deg, var(--sage), var(--sage-light))',
              boxShadow: '0 2px 8px rgba(101,163,13,0.2)',
            }}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="#FFFFFF" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" />
            </svg>
          </div>
          <div
            className="chat-bubble chat-bubble--bot-filled"
            style={{
              maxWidth: '100%',
              flex: 1,
              fontSize: '0.95rem',
              lineHeight: 1.7,
              padding: '1.25rem 1.5rem',
            }}
          >
            <div className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ opacity: 0.7 }}>
              AVA Response
            </div>
            <div className="whitespace-pre-line">
              {response.response_message}
            </div>
          </div>
        </div>
      </div>

      {/* ===== Actions Taken ===== */}
      {response.actions_taken && response.actions_taken.length > 0 && (
        <div className="card animate-fade-slide-up" style={{ animationDelay: '0.15s' }}>
          <div className="flex items-center gap-2 mb-5">
            <svg className="w-4 h-4" style={{ color: 'var(--sage)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h3 className="text-sm font-semibold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
              Actions Taken
            </h3>
          </div>

          <div className="space-y-3">
            {response.actions_taken.map((action, i) => (
              <div
                key={i}
                className="flex items-center gap-4 p-3.5 rounded-xl animate-slide-left"
                style={{
                  background: 'rgba(250, 250, 249, 0.6)',
                  border: '1px solid #E7E5E4',
                  animationDelay: `${0.2 + i * 0.08}s`,
                }}
              >
                <ActionBadge type={action.action_type} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{action.description}</p>
                </div>
                <StatusIndicator status={action.status} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ===== Recommendations ===== */}
      {response.recommendations.length > 0 && (
        <div className="card animate-fade-slide-up" style={{ animationDelay: '0.2s' }}>
          <div className="flex items-center gap-2 mb-5">
            <svg className="w-4 h-4" style={{ color: 'var(--coral)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
            </svg>
            <h3 className="text-sm font-semibold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>Suggestions</h3>
          </div>

          <div className="space-y-3">
            {response.recommendations.map((rec, i) => (
              <div
                key={i}
                className="flex items-start gap-3 p-3.5 rounded-xl animate-slide-right"
                style={{
                  background: 'var(--bg-card)',
                  borderLeft: '3px solid var(--sage-light)',
                  border: '1px solid #E7E5E4',
                  borderLeftWidth: '3px',
                  borderLeftColor: 'var(--sage-light)',
                  animationDelay: `${0.25 + i * 0.08}s`,
                }}
              >
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                  style={{
                    background: 'rgba(101,163,13,0.08)',
                    border: '1px solid rgba(101,163,13,0.15)',
                  }}
                >
                  <span className="text-xs font-bold" style={{ color: 'var(--sage)' }}>{i + 1}</span>
                </div>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{rec}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ===== Summary ===== */}
      {response.summary && (
        <div className="card animate-fade-slide-up" style={{ animationDelay: '0.25s' }}>
          <div className="flex items-center gap-2 mb-4">
            <svg className="w-4 h-4" style={{ color: 'var(--warm-gray)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
            <h3 className="text-sm font-semibold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>Summary</h3>
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
              const content = (agentData as Record<string, unknown>).analysis || (agentData as Record<string, unknown>).assessment || '';
              const colorMap: Record<string, { color: string; bg: string; border: string }> = {
                conversation_manager: { color: 'var(--sage)', bg: 'rgba(101,163,13,0.04)', border: 'rgba(101,163,13,0.12)' },
                account_agent: { color: 'var(--coral)', bg: 'rgba(249,115,22,0.04)', border: 'rgba(249,115,22,0.12)' },
                transaction_agent: { color: 'var(--warm-gray)', bg: 'rgba(120,113,108,0.04)', border: 'rgba(120,113,108,0.12)' },
              };
              const c = colorMap[agentData.agent] || colorMap.conversation_manager;

              return (
                <div
                  key={key}
                  className="rounded-xl p-5"
                  style={{
                    background: c.bg,
                    border: `1px solid ${c.border}`,
                  }}
                >
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-1.5 h-1.5 rounded-full" style={{ background: c.color }} />
                    <h4 className="text-xs font-bold uppercase tracking-wider" style={{ color: c.color }}>
                      {agentMeta.name}
                    </h4>
                  </div>
                  <pre
                    className="text-xs whitespace-pre-wrap leading-relaxed max-h-96 overflow-y-auto"
                    style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-sans)' }}
                  >
                    {String(content)}
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
