// @ts-nocheck
import { useState } from 'react';
import type { RuntimeConfig } from '../config';
import type { ServiceResponse } from '../types';

/* ---- Status Badge ---- */

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { bg: string; border: string; text: string; glow: string; label: string }> = {
    RESOLVED: { bg: 'rgba(57,255,20,0.06)', border: 'rgba(57,255,20,0.3)', text: 'var(--neon-green)', glow: '0 0 20px rgba(57,255,20,0.15)', label: 'Resolved' },
    PENDING: { bg: 'rgba(255,230,0,0.06)', border: 'rgba(255,230,0,0.3)', text: 'var(--neon-yellow)', glow: '0 0 20px rgba(255,230,0,0.15)', label: 'Pending' },
    ESCALATED: { bg: 'rgba(255,51,102,0.06)', border: 'rgba(255,51,102,0.3)', text: 'var(--status-escalated)', glow: '0 0 20px rgba(255,51,102,0.15)', label: 'Escalated' },
  };
  const c = cfg[status] || cfg.PENDING;
  const icons: Record<string, string> = {
    RESOLVED: 'M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
    PENDING: 'M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z',
    ESCALATED: 'M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z',
  };

  return (
    <div
      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold uppercase tracking-wider animate-fade-in-scale"
      style={{ background: c.bg, border: `1px solid ${c.border}`, color: c.text, boxShadow: c.glow }}
    >
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d={icons[status] || icons.PENDING} />
      </svg>
      {c.label}
    </div>
  );
}

/* ---- Priority Badge ---- */

function PriorityBadge({ priority }: { priority: string }) {
  const cfg: Record<string, { bg: string; border: string; text: string; glow: string }> = {
    LOW: { bg: 'rgba(57,255,20,0.06)', border: 'rgba(57,255,20,0.25)', text: 'var(--neon-green)', glow: 'var(--neon-green)' },
    MEDIUM: { bg: 'rgba(255,230,0,0.06)', border: 'rgba(255,230,0,0.25)', text: 'var(--neon-yellow)', glow: 'var(--neon-yellow)' },
    HIGH: { bg: 'rgba(255,107,0,0.06)', border: 'rgba(255,107,0,0.25)', text: 'var(--neon-orange)', glow: 'var(--neon-orange)' },
    URGENT: { bg: 'rgba(255,51,102,0.06)', border: 'rgba(255,51,102,0.25)', text: 'var(--priority-urgent)', glow: 'var(--priority-urgent)' },
  };
  const c = cfg[priority] || cfg.MEDIUM;

  return (
    <span
      className="ticket-badge"
      style={{ background: c.bg, border: `1px solid ${c.border}`, color: c.text }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: c.text, boxShadow: `0 0 4px ${c.glow}` }} />
      {priority}
    </span>
  );
}

/* ---- Timeline Item ---- */

function TimelineItem({ action, index, total }: { action: string; index: number; total: number }) {
  const isLast = index === total - 1;
  const colors = ['var(--neon-cyan)', 'var(--neon-magenta)', 'var(--neon-green)', 'var(--neon-cyan)', 'var(--neon-magenta)'];
  const color = colors[index % colors.length];

  return (
    <div className="relative flex gap-4 animate-slide-left" style={{ animationDelay: `${0.3 + index * 0.1}s` }}>
      <div className="flex flex-col items-center">
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 relative z-10"
          style={{
            background: `${color}10`,
            border: `1px solid ${color}40`,
            boxShadow: `0 0 12px ${color}20`,
          }}
        >
          <svg className="w-4 h-4" style={{ color }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" style={{ strokeDasharray: 24, strokeDashoffset: 0 }} />
          </svg>
        </div>
        {!isLast && (
          <div className="w-px flex-1 min-h-[20px]" style={{ background: `linear-gradient(to bottom, ${color}30, rgba(0,240,255,0.06))` }} />
        )}
      </div>
      <div className="pb-5 flex-1">
        <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{action}</p>
      </div>
    </div>
  );
}

/* ---- Collapsible Section ---- */

function Collapsible({ title, children, defaultOpen = false, delay = 0 }: { title: string; children: React.ReactNode; defaultOpen?: boolean; delay?: number }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="glass animate-fade-in p-6" style={{ animationDelay: `${delay}s` }}>
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
      {open && <div className="mt-5 pt-5" style={{ borderTop: '1px solid rgba(0,240,255,0.08)' }}>{children}</div>}
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
  response: ServiceResponse;
  config: RuntimeConfig;
  elapsed: number;
}) {
  const { resolution: _res = {}, summary = '', recommendations = [] } = response as any;
  const resolution = { actions_taken: [], ..._res };

  return (
    <div className="space-y-5">
      {/* ===== Hero — Resolution ===== */}
      <div
        className="glass animate-fade-in-scale p-6"
        style={{
          background: 'linear-gradient(135deg, rgba(10,10,30,0.6) 0%, rgba(0,240,255,0.02) 50%, rgba(255,0,229,0.02) 100%)',
          borderColor: 'rgba(0,240,255,0.15)',
          boxShadow: '0 0 40px rgba(0,240,255,0.05)',
        }}
      >
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full" style={{ background: 'var(--neon-green)', boxShadow: '0 0 8px var(--neon-green)' }} />
            <span
              className="text-xs font-mono uppercase tracking-widest"
              style={{ color: 'var(--neon-cyan)', textShadow: '0 0 8px rgba(0,240,255,0.3)' }}
            >
              Service Complete
            </span>
          </div>
          <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
            {response.service_id?.slice(0, 8) || "N/A"} &bull; {elapsed}s
          </span>
        </div>

        {/* Status + Priority */}
        <div className="flex items-center justify-center gap-4 mb-6">
          <StatusBadge status={resolution.status} />
          <PriorityBadge priority={resolution.priority} />
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="text-center">
            <div className="text-[10px] font-mono uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>Customer</div>
            <div className="text-lg font-bold font-mono" style={{ color: 'var(--text-primary)' }}>{response.customer_id}</div>
          </div>
          <div className="text-center">
            <div className="text-[10px] font-mono uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>Actions</div>
            <div
              className="text-lg font-bold font-mono"
              style={{ color: 'var(--neon-cyan)', textShadow: '0 0 10px rgba(0,240,255,0.3)' }}
            >
              {resolution.actions_taken.length}
            </div>
          </div>
          <div className="text-center">
            <div className="text-[10px] font-mono uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>Follow-Up</div>
            <div
              className="text-lg font-bold font-mono"
              style={{
                color: resolution.follow_up_required ? 'var(--neon-orange)' : 'var(--neon-green)',
                textShadow: resolution.follow_up_required ? '0 0 10px rgba(255,107,0,0.3)' : '0 0 10px rgba(57,255,20,0.3)',
              }}
            >
              {resolution.follow_up_required ? 'Required' : 'None'}
            </div>
          </div>
        </div>

        {/* Summary */}
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

      {/* ===== Actions Timeline ===== */}
      {resolution.actions_taken.length > 0 && (
        <div className="glass animate-fade-in p-6" style={{ animationDelay: '0.1s' }}>
          <div className="flex items-center gap-2 mb-6">
            <svg className="w-4 h-4" style={{ color: 'var(--neon-cyan)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" />
            </svg>
            <h3
              className="text-sm font-mono uppercase tracking-widest"
              style={{ color: 'var(--text-secondary)' }}
            >
              Actions Taken
            </h3>
          </div>
          <div>
            {resolution.actions_taken.map((action, i) => (
              <TimelineItem key={i} action={action} index={i} total={resolution.actions_taken.length} />
            ))}
          </div>
        </div>
      )}

      {/* ===== Recommendations ===== */}
      {recommendations.length > 0 && (
        <div className="glass animate-fade-in p-6" style={{ animationDelay: '0.15s' }}>
          <div className="flex items-center gap-2 mb-5">
            <svg className="w-4 h-4" style={{ color: 'var(--neon-magenta)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
            </svg>
            <h3 className="text-sm font-mono uppercase tracking-widest" style={{ color: 'var(--text-secondary)' }}>Recommendations</h3>
          </div>
          <div className="grid grid-cols-1 gap-3">
            {recommendations.map((rec, i) => {
              const colors = ['var(--neon-cyan)', 'var(--neon-magenta)', 'var(--neon-green)'];
              const color = colors[i % colors.length];
              return (
                <div
                  key={i}
                  className="flex items-start gap-3 p-3.5 rounded-xl animate-slide-right"
                  style={{
                    background: `${color}04`,
                    border: `1px solid ${color}12`,
                    animationDelay: `${0.2 + i * 0.08}s`,
                  }}
                >
                  <div
                    className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                    style={{ background: `${color}10`, border: `1px solid ${color}25` }}
                  >
                    <span className="text-xs font-mono font-bold" style={{ color, textShadow: `0 0 4px ${color}` }}>{i + 1}</span>
                  </div>
                  <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{rec}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ===== Resolution Notes ===== */}
      {resolution.notes && (
        <div className="glass animate-fade-in p-6" style={{ animationDelay: '0.2s' }}>
          <div className="flex items-center gap-2 mb-4">
            <svg className="w-4 h-4" style={{ color: 'var(--neon-cyan)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
            <h3 className="text-sm font-mono uppercase tracking-widest" style={{ color: 'var(--text-secondary)' }}>Resolution Notes</h3>
          </div>
          <div className="text-sm leading-relaxed whitespace-pre-line" style={{ color: 'var(--text-secondary)' }}>
            {resolution.notes}
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
                inquiry_handler: 'var(--neon-cyan)',
                transaction_specialist: 'var(--neon-magenta)',
                product_advisor: 'var(--neon-green)',
              };
              const color = colorMap[agentData.agent] || 'var(--neon-cyan)';

              return (
                <div
                  key={key}
                  className="rounded-xl p-5"
                  style={{
                    background: 'rgba(0,0,0,0.3)',
                    backdropFilter: 'blur(8px)',
                    border: `1px solid ${color}15`,
                  }}
                >
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-1.5 h-1.5 rounded-full" style={{ background: color, boxShadow: `0 0 6px ${color}` }} />
                    <h4
                      className="text-xs font-mono font-bold uppercase tracking-wider"
                      style={{ color, textShadow: `0 0 8px ${color}40` }}
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
