// @ts-nocheck
import { useState, useEffect } from 'react';
import type { RuntimeConfig } from '../config';
import type { KYCResponse } from '../types';

/* ---- Animated Score Ring ---- */

function ScoreRing({ score, max = 100 }: { score: number; max?: number }) {
  const [rendered, setRendered] = useState(false);
  useEffect(() => { requestAnimationFrame(() => setRendered(true)); }, []);

  const pct = Math.min(score / max, 1);
  const circumference = 2 * Math.PI * 45;
  const offset = circumference * (1 - (rendered ? pct : 0));

  // Inverted: low score = good (green), high score = bad (red)
  const color = pct <= 0.35 ? 'var(--risk-low)' : pct <= 0.6 ? 'var(--risk-medium)' : 'var(--risk-high)';

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width="130" height="130" viewBox="0 0 100 100" className="score-ring">
        <circle cx="50" cy="50" r="45" className="score-ring-track" strokeWidth="6" />
        <circle
          cx="50" cy="50" r="45"
          className="score-ring-fill"
          strokeWidth="6"
          stroke={color}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <AnimatedNumber value={score} className="text-3xl font-extrabold font-mono" style={{ color }} />
        <span className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>RISK / {max}</span>
      </div>
    </div>
  );
}

/* ---- Animated Number ---- */

function AnimatedNumber({ value, className, style }: { value: number; className?: string; style?: React.CSSProperties }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    const duration = 1200;
    const start = performance.now();
    function tick(now: number) {
      const progress = Math.min((now - start) / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(ease * value));
      if (progress < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }, [value]);
  return <span className={className} style={style}>{display}</span>;
}

/* ---- Recommendation Badge ---- */

function RecommendationBadge({ summary }: { summary: string }) {
  const upper = summary.toUpperCase();
  let recommendation: 'APPROVE' | 'REJECT' | 'ESCALATE' = 'ESCALATE';
  if (upper.includes('APPROVE')) recommendation = 'APPROVE';
  else if (upper.includes('REJECT')) recommendation = 'REJECT';

  const styles = {
    APPROVE: { bg: 'rgba(16, 185, 129, 0.1)', border: 'rgba(16, 185, 129, 0.3)', color: 'var(--approve)', icon: 'M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
    REJECT: { bg: 'rgba(239, 68, 68, 0.1)', border: 'rgba(239, 68, 68, 0.3)', color: 'var(--reject)', icon: 'M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
    ESCALATE: { bg: 'rgba(245, 158, 11, 0.1)', border: 'rgba(245, 158, 11, 0.3)', color: 'var(--escalate)', icon: 'M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z' },
  };
  const s = styles[recommendation];

  return (
    <div
      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold uppercase tracking-wider animate-fade-in-scale"
      style={{ background: s.bg, border: `1px solid ${s.border}`, color: s.color }}
    >
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d={s.icon} />
      </svg>
      {recommendation}
    </div>
  );
}

/* ---- Risk Level Badge ---- */

function RiskBadge({ level }: { level: string }) {
  const config: Record<string, { bg: string; border: string; text: string }> = {
    low: { bg: 'rgba(16, 185, 129, 0.1)', border: 'rgba(16, 185, 129, 0.3)', text: 'var(--risk-low)' },
    medium: { bg: 'rgba(245, 158, 11, 0.1)', border: 'rgba(245, 158, 11, 0.3)', text: 'var(--risk-medium)' },
    high: { bg: 'rgba(239, 68, 68, 0.1)', border: 'rgba(239, 68, 68, 0.3)', text: 'var(--risk-high)' },
    critical: { bg: 'rgba(220, 38, 38, 0.1)', border: 'rgba(220, 38, 38, 0.3)', text: 'var(--risk-critical)' },
  };
  const c = config[level] || config.medium;

  return (
    <span
      className="inline-flex px-3 py-1.5 rounded-lg text-xs font-mono font-bold uppercase tracking-wider"
      style={{ background: c.bg, border: `1px solid ${c.border}`, color: c.text }}
    >
      {level}
    </span>
  );
}

/* ---- Compliance Status Badge ---- */

function ComplianceStatusBadge({ status }: { status: string }) {
  const config: Record<string, { bg: string; border: string; text: string; label: string }> = {
    compliant: { bg: 'rgba(16, 185, 129, 0.1)', border: 'rgba(16, 185, 129, 0.3)', text: 'var(--status-compliant)', label: 'Compliant' },
    non_compliant: { bg: 'rgba(239, 68, 68, 0.1)', border: 'rgba(239, 68, 68, 0.3)', text: 'var(--status-non-compliant)', label: 'Non-Compliant' },
    review_required: { bg: 'rgba(245, 158, 11, 0.1)', border: 'rgba(245, 158, 11, 0.3)', text: 'var(--status-review)', label: 'Review Required' },
  };
  const c = config[status] || config.review_required;

  return (
    <span
      className="inline-flex px-3 py-1.5 rounded-lg text-xs font-mono font-bold uppercase tracking-wider"
      style={{ background: c.bg, border: `1px solid ${c.border}`, color: c.text }}
    >
      {c.label}
    </span>
  );
}

/* ---- Collapsible Section ---- */

function Collapsible({ title, children, defaultOpen = false, delay = 0 }: { title: string; children: React.ReactNode; defaultOpen?: boolean; delay?: number }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="card animate-fade-in" style={{ animationDelay: `${delay}s` }}>
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

/* ---- Main Component ---- */

function ResultsPanelInternal({
  response,
  config,
  elapsed,
}: {
  response: KYCResponse;
  config: RuntimeConfig;
  elapsed: number;
}) {
  const { credit_risk: _cr = {}, compliance: _comp = {}, summary = '' } = response as any;
  const credit_risk = { factors: [], recommendations: [], level: '', score: 0, ..._cr };
  const compliance = { checks_passed: [], checks_failed: [], regulatory_notes: [], status: '', ..._comp };

  return (
    <div className="space-y-5">
      {/* Hero — Recommendation + Summary */}
      <div
        className="card-glow animate-fade-in-scale"
        style={{
          background: 'linear-gradient(135deg, var(--bg-card) 0%, rgba(59, 130, 246, 0.03) 100%)',
          borderColor: 'rgba(59, 130, 246, 0.2)',
        }}
      >
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full" style={{ background: 'var(--accent)' }} />
            <span className="text-xs font-mono uppercase tracking-widest" style={{ color: 'var(--accent)' }}>Assessment Complete</span>
          </div>
          <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
            {response.assessment_id?.slice(0, 8) || "N/A"} &bull; {elapsed}s
          </span>
        </div>

        {/* Recommendation */}
        <div className="text-center mb-6">
          <RecommendationBadge summary={summary} />
        </div>

        {/* Key metrics row */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="text-center">
            <div className="text-[10px] font-mono uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>Customer</div>
            <div className="text-lg font-bold font-mono" style={{ color: 'var(--text-primary)' }}>{response.customer_id}</div>
          </div>
          <div className="text-center">
            <div className="text-[10px] font-mono uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>Credit Risk</div>
            {credit_risk ? <RiskBadge level={credit_risk.level} /> : <span className="text-sm" style={{ color: 'var(--text-muted)' }}>N/A</span>}
          </div>
          <div className="text-center">
            <div className="text-[10px] font-mono uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>Compliance</div>
            {compliance ? <ComplianceStatusBadge status={compliance.status} /> : <span className="text-sm" style={{ color: 'var(--text-muted)' }}>N/A</span>}
          </div>
        </div>

        {/* Summary text (render markdown-like bold) */}
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

      {/* Credit Risk Section */}
      {credit_risk && (
        <div className="card animate-fade-in" style={{ animationDelay: '0.1s' }}>
          <div className="flex items-center gap-2 mb-5">
            <svg className="w-4 h-4" style={{ color: 'var(--accent)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" /></svg>
            <h3 className="text-sm font-mono uppercase tracking-widest" style={{ color: 'var(--text-secondary)' }}>Credit Risk Assessment</h3>
          </div>

          <div className="flex flex-col md:flex-row items-center gap-8">
            <div className="shrink-0">
              <ScoreRing score={credit_risk.score} />
            </div>
            <div className="flex-1 w-full">
              <div className="flex items-center gap-3 mb-4">
                <RiskBadge level={credit_risk.level} />
              </div>

              {credit_risk.factors.length > 0 && (
                <div className="mb-4">
                  <div className="text-[10px] font-mono uppercase tracking-widest mb-2" style={{ color: 'var(--text-muted)' }}>Risk Factors</div>
                  <ul className="space-y-1.5">
                    {credit_risk.factors.map((f, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                        <span className="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0" style={{ background: 'var(--risk-medium)' }} />
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {credit_risk.recommendations.length > 0 && (
                <div>
                  <div className="text-[10px] font-mono uppercase tracking-widest mb-2" style={{ color: 'var(--text-muted)' }}>Recommendations</div>
                  <ul className="space-y-1.5">
                    {credit_risk.recommendations.map((r, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                        <span className="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0" style={{ background: 'var(--accent)' }} />
                        {r}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Compliance Section */}
      {compliance && (
        <div className="card animate-fade-in" style={{ animationDelay: '0.15s' }}>
          <div className="flex items-center gap-2 mb-5">
            <svg className="w-4 h-4" style={{ color: 'var(--accent)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" /></svg>
            <h3 className="text-sm font-mono uppercase tracking-widest" style={{ color: 'var(--text-secondary)' }}>Compliance Verification</h3>
            <div className="ml-auto">
              <ComplianceStatusBadge status={compliance.status} />
            </div>
          </div>

          {/* Checks Passed */}
          {compliance.checks_passed.length > 0 && (
            <div className="mb-5">
              <div className="text-[10px] font-mono uppercase tracking-widest mb-3" style={{ color: 'var(--text-muted)' }}>
                Checks Passed ({compliance.checks_passed.length})
              </div>
              <div className="grid grid-cols-1 gap-2">
                {compliance.checks_passed.map((check, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-3 px-3 py-2.5 rounded-lg animate-fade-in"
                    style={{ background: 'rgba(16, 185, 129, 0.05)', border: '1px solid rgba(16, 185, 129, 0.1)', animationDelay: `${0.2 + i * 0.04}s` }}
                  >
                    <svg className="w-4 h-4 mt-0.5 shrink-0" style={{ color: 'var(--status-compliant)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                    <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{check}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Checks Failed */}
          {compliance.checks_failed.length > 0 && (
            <div className="mb-5">
              <div className="text-[10px] font-mono uppercase tracking-widest mb-3" style={{ color: 'var(--text-muted)' }}>
                Checks Failed ({compliance.checks_failed.length})
              </div>
              <div className="grid grid-cols-1 gap-2">
                {compliance.checks_failed.map((check, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-3 px-3 py-2.5 rounded-lg"
                    style={{ background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.1)' }}
                  >
                    <svg className="w-4 h-4 mt-0.5 shrink-0" style={{ color: 'var(--status-non-compliant)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{check}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Regulatory Notes */}
          {compliance.regulatory_notes.length > 0 && (
            <div>
              <div className="text-[10px] font-mono uppercase tracking-widest mb-3" style={{ color: 'var(--text-muted)' }}>
                Regulatory Notes
              </div>
              <ul className="space-y-2">
                {compliance.regulatory_notes.map((note, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0" style={{ background: 'var(--accent)' }} />
                    {note}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Raw Agent Analysis */}
      {response.raw_analysis && (
        <Collapsible title="Detailed Agent Reports" delay={0.25}>
          <div className="space-y-4">
            {Object.entries(response.raw_analysis).map(([key, agentData]) => {
              if (!agentData) return null;
              const agentMeta = config.agents.find((a) => a.id === agentData.agent) || { name: agentData.agent || key };
              const content = agentData.analysis || agentData.assessment || '';
              return (
                <div
                  key={key}
                  className="rounded-xl p-5"
                  style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
                >
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--accent)' }} />
                    <h4 className="text-xs font-mono font-bold uppercase tracking-wider" style={{ color: 'var(--accent)' }}>
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
