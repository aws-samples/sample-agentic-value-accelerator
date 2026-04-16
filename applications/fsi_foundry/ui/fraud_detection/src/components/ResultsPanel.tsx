// @ts-nocheck
import { useState } from 'react';
import type { RuntimeConfig } from '../config';
import type { MonitoringResponse } from '../types';

/* ---- Risk Score Gauge ---- */

function RiskGauge({ score, level }: { score: number; level: string }) {
  const circumference = 2 * Math.PI * 45;
  const offset = circumference - (score / 100) * circumference;

  const colorMap: Record<string, { stroke: string; text: string; glow: string; bg: string }> = {
    LOW: { stroke: '#10B981', text: 'var(--soc-emerald)', glow: 'rgba(16,185,129,0.3)', bg: 'rgba(16,185,129,0.06)' },
    MEDIUM: { stroke: '#F59E0B', text: 'var(--soc-amber)', glow: 'rgba(245,158,11,0.3)', bg: 'rgba(245,158,11,0.06)' },
    HIGH: { stroke: '#EF4444', text: 'var(--soc-red-bright)', glow: 'rgba(239,68,68,0.3)', bg: 'rgba(239,68,68,0.06)' },
    CRITICAL: { stroke: '#DC2626', text: 'var(--soc-red)', glow: 'rgba(220,38,38,0.5)', bg: 'rgba(220,38,38,0.08)' },
  };
  const c = colorMap[level] || colorMap.MEDIUM;

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: '140px', height: '140px' }}>
        <svg viewBox="0 0 100 100" className="w-full h-full" style={{ transform: 'rotate(-90deg)' }}>
          {/* Background ring */}
          <circle cx="50" cy="50" r="45" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="6" />
          {/* Score ring */}
          <circle
            cx="50" cy="50" r="45"
            fill="none"
            stroke={c.stroke}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className="gauge-ring"
            style={{
              filter: `drop-shadow(0 0 6px ${c.glow})`,
              animation: `gaugeReveal 1.5s cubic-bezier(0.23, 1, 0.32, 1) forwards`,
            }}
          />
        </svg>
        {/* Center text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className="text-3xl font-black font-mono"
            style={{ color: c.text, textShadow: `0 0 15px ${c.glow}` }}
          >
            {score}
          </span>
          <span className="text-[10px] font-mono uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
            / 100
          </span>
        </div>
      </div>
      <div
        className="mt-3 px-4 py-1.5 rounded-full text-xs font-mono font-bold uppercase tracking-wider"
        style={{
          background: c.bg,
          border: `1px solid ${c.stroke}30`,
          color: c.text,
          boxShadow: `0 0 12px ${c.glow}`,
        }}
      >
        {level} RISK
      </div>
    </div>
  );
}

/* ---- Severity Badge ---- */

function SeverityBadge({ severity }: { severity: string }) {
  const cfg: Record<string, { bg: string; border: string; text: string; glow: string }> = {
    LOW: { bg: 'rgba(16,185,129,0.06)', border: 'rgba(16,185,129,0.3)', text: 'var(--soc-emerald)', glow: '0 0 12px rgba(16,185,129,0.15)' },
    MEDIUM: { bg: 'rgba(245,158,11,0.06)', border: 'rgba(245,158,11,0.3)', text: 'var(--soc-amber)', glow: '0 0 12px rgba(245,158,11,0.15)' },
    HIGH: { bg: 'rgba(239,68,68,0.06)', border: 'rgba(239,68,68,0.3)', text: 'var(--soc-red-bright)', glow: '0 0 12px rgba(239,68,68,0.15)' },
    CRITICAL: { bg: 'rgba(220,38,38,0.1)', border: 'rgba(220,38,38,0.4)', text: 'var(--soc-red)', glow: '0 0 20px rgba(220,38,38,0.25)' },
  };
  const c = cfg[severity] || cfg.MEDIUM;
  const icons: Record<string, string> = {
    LOW: 'M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
    MEDIUM: 'M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z',
    HIGH: 'M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z',
    CRITICAL: 'M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z',
  };

  return (
    <div
      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider"
      style={{ background: c.bg, border: `1px solid ${c.border}`, color: c.text, boxShadow: c.glow }}
    >
      {severity === 'CRITICAL' && (
        <span className="w-2 h-2 rounded-full animate-alert-blink" style={{ background: 'var(--soc-red)', boxShadow: '0 0 6px var(--soc-red)' }} />
      )}
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d={icons[severity] || icons.MEDIUM} />
      </svg>
      {severity}
    </div>
  );
}

/* ---- Alert Card ---- */

function AlertCard({ alert, index }: { alert: { alert_id: string; severity: string; description: string; evidence: string[]; recommended_actions: string[] }; index: number }) {
  const [expanded, setExpanded] = useState(false);

  const severityColors: Record<string, string> = {
    LOW: '#10B981',
    MEDIUM: '#F59E0B',
    HIGH: '#EF4444',
    CRITICAL: '#DC2626',
  };
  const color = severityColors[alert.severity] || '#F59E0B';

  return (
    <div
      className="rounded-xl overflow-hidden animate-slide-left"
      style={{
        background: `${color}04`,
        border: `1px solid ${color}20`,
        animationDelay: `${0.2 + index * 0.1}s`,
      }}
    >
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-3 w-full p-4 text-left"
      >
        {/* Pulsing alert dot */}
        <div className="relative shrink-0">
          <div
            className="w-3 h-3 rounded-full"
            style={{
              background: color,
              boxShadow: `0 0 8px ${color}`,
              animation: alert.severity === 'CRITICAL' || alert.severity === 'HIGH' ? 'pulse-dot 1.5s infinite' : 'none',
            }}
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>{alert.alert_id}</span>
            <SeverityBadge severity={alert.severity} />
          </div>
          <p className="text-sm" style={{ color: 'var(--text-primary)' }}>{alert.description}</p>
        </div>
        <svg
          className="w-4 h-4 shrink-0 transition-transform"
          style={{ color: 'var(--text-muted)', transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="px-4 pb-4 pt-0">
          <div style={{ borderTop: `1px solid ${color}15` }} className="pt-4">
            {/* Evidence */}
            {alert.evidence.length > 0 && (
              <div className="mb-4">
                <h5 className="text-[10px] font-mono uppercase tracking-wider mb-2" style={{ color }}>Evidence</h5>
                <div className="space-y-1.5">
                  {alert.evidence.map((ev, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <div className="w-1 h-1 rounded-full mt-2 shrink-0" style={{ background: color }} />
                      <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{ev}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {/* Recommended Actions */}
            {alert.recommended_actions.length > 0 && (
              <div>
                <h5 className="text-[10px] font-mono uppercase tracking-wider mb-2" style={{ color: 'var(--soc-blue)' }}>Recommended Actions</h5>
                <div className="space-y-1.5">
                  {alert.recommended_actions.map((action, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <div
                        className="w-4 h-4 rounded flex items-center justify-center shrink-0 mt-0.5"
                        style={{ background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.2)' }}
                      >
                        <span className="text-[8px] font-mono font-bold" style={{ color: 'var(--soc-blue)' }}>{i + 1}</span>
                      </div>
                      <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{action}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
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
      {open && <div className="mt-5 pt-5" style={{ borderTop: '1px solid rgba(239,68,68,0.08)' }}>{children}</div>}
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
  response: MonitoringResponse;
  config: RuntimeConfig;
  elapsed: number;
}) {
  const { risk_assessment: _ra = {}, alerts = [], summary = '' } = response as any;
  const risk_assessment = { score: 0, level: 'MEDIUM', factors: [], recommendations: [], ..._ra };

  return (
    <div className="space-y-5">
      {/* ===== Hero — Risk Assessment ===== */}
      <div
        className="glass animate-fade-in-scale p-6"
        style={{
          background: 'linear-gradient(135deg, rgba(17,24,39,0.7) 0%, rgba(239,68,68,0.03) 50%, rgba(59,130,246,0.02) 100%)',
          borderColor: 'rgba(239,68,68,0.15)',
          boxShadow: '0 0 40px rgba(239,68,68,0.05)',
        }}
      >
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full" style={{ background: 'var(--soc-emerald)', boxShadow: '0 0 8px var(--soc-emerald)' }} />
            <span
              className="text-xs font-mono uppercase tracking-widest"
              style={{ color: 'var(--soc-red-bright)', textShadow: '0 0 8px rgba(239,68,68,0.3)' }}
            >
              Scan Complete
            </span>
          </div>
          <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
            {response.session_id?.slice(0, 8) || "N/A"} &bull; {elapsed}s
          </span>
        </div>

        {/* Risk Gauge + Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          <div className="md:col-span-1 flex justify-center">
            <RiskGauge score={risk_assessment.score} level={risk_assessment.level} />
          </div>
          <div className="md:col-span-2">
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="text-center">
                <div className="text-[10px] font-mono uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>Customer</div>
                <div className="text-lg font-bold font-mono" style={{ color: 'var(--text-primary)' }}>{response.customer_id}</div>
              </div>
              <div className="text-center">
                <div className="text-[10px] font-mono uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>Alerts</div>
                <div
                  className="text-lg font-bold font-mono"
                  style={{
                    color: alerts.length > 0 ? 'var(--soc-red-bright)' : 'var(--soc-emerald)',
                    textShadow: alerts.length > 0 ? '0 0 10px rgba(239,68,68,0.3)' : '0 0 10px rgba(16,185,129,0.3)',
                  }}
                >
                  {alerts.length}
                </div>
              </div>
              <div className="text-center">
                <div className="text-[10px] font-mono uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>Factors</div>
                <div
                  className="text-lg font-bold font-mono"
                  style={{ color: 'var(--soc-amber)', textShadow: '0 0 10px rgba(245,158,11,0.3)' }}
                >
                  {risk_assessment.factors.length}
                </div>
              </div>
            </div>

            {/* Risk Factors */}
            {risk_assessment.factors.length > 0 && (
              <div>
                <h4 className="text-[10px] font-mono uppercase tracking-wider mb-2" style={{ color: 'var(--soc-amber)' }}>Risk Factors</h4>
                <div className="space-y-1.5">
                  {risk_assessment.factors.map((factor, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <svg className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: 'var(--soc-amber)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" />
                      </svg>
                      <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{factor}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
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

      {/* ===== Fraud Alerts ===== */}
      {alerts.length > 0 && (
        <div className="glass animate-fade-in p-6" style={{ animationDelay: '0.1s' }}>
          <div className="flex items-center gap-2 mb-5">
            <svg className="w-4 h-4" style={{ color: 'var(--soc-red-bright)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
            </svg>
            <h3
              className="text-sm font-mono uppercase tracking-widest"
              style={{ color: 'var(--text-secondary)' }}
            >
              Fraud Alerts ({alerts.length})
            </h3>
          </div>
          <div className="space-y-3">
            {alerts.map((alert, i) => (
              <AlertCard key={alert.alert_id} alert={alert} index={i} />
            ))}
          </div>
        </div>
      )}

      {/* ===== Recommendations ===== */}
      {risk_assessment.recommendations.length > 0 && (
        <div className="glass animate-fade-in p-6" style={{ animationDelay: '0.15s' }}>
          <div className="flex items-center gap-2 mb-5">
            <svg className="w-4 h-4" style={{ color: 'var(--soc-blue)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
            </svg>
            <h3 className="text-sm font-mono uppercase tracking-widest" style={{ color: 'var(--text-secondary)' }}>Recommendations</h3>
          </div>
          <div className="grid grid-cols-1 gap-3">
            {risk_assessment.recommendations.map((rec, i) => {
              const colors = ['var(--soc-red-bright)', 'var(--soc-amber)', 'var(--soc-blue)'];
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

      {/* ===== Raw Agent Analysis ===== */}
      {response.raw_analysis && (
        <Collapsible title="Detailed Agent Reports" delay={0.3}>
          <div className="space-y-4">
            {Object.entries(response.raw_analysis).map(([key, agentData]) => {
              if (!agentData) return null;
              const agentMeta = config.agents.find((a) => a.id === agentData.agent) || { name: agentData.agent || key };
              const content = agentData.analysis || agentData.assessment || '';
              const colorMap: Record<string, string> = {
                transaction_monitor: 'var(--soc-red-bright)',
                pattern_analyst: 'var(--soc-amber)',
                alert_generator: 'var(--soc-blue)',
              };
              const color = colorMap[agentData.agent] || 'var(--soc-red-bright)';

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
