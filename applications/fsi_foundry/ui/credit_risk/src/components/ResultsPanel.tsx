// @ts-nocheck
import { useState, useEffect } from 'react';
import type { RuntimeConfig } from '../config';
import type { AgentResponse } from '../types';

/* ---- Animated Score Ring ---- */

function ScoreRing({ score, max = 100 }: { score: number; max?: number }) {
  const [rendered, setRendered] = useState(false);
  useEffect(() => { requestAnimationFrame(() => setRendered(true)); }, []);

  const pct = Math.min(score / max, 1);
  const circumference = 2 * Math.PI * 45; // r=45
  const offset = circumference * (1 - (rendered ? pct : 0));

  const color = pct >= 0.75 ? 'var(--risk-low)' : pct >= 0.5 ? 'var(--risk-medium)' : 'var(--risk-high)';

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width="140" height="140" viewBox="0 0 100 100" className="score-ring">
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
        <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>/ {max}</span>
      </div>
    </div>
  );
}

/* ---- Animated Number Counter ---- */

function AnimatedNumber({ value, className, style }: { value: number; className?: string; style?: React.CSSProperties }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    const duration = 1200;
    const start = performance.now();
    function tick(now: number) {
      const progress = Math.min((now - start) / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      setDisplay(Math.round(ease * value));
      if (progress < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }, [value]);

  return <span className={className} style={style}>{display}</span>;
}

/* ---- Risk Level Badge ---- */

function RiskBadge({ level }: { level: string }) {
  const config: Record<string, { bg: string; border: string; text: string }> = {
    low: { bg: 'rgba(0, 212, 170, 0.1)', border: 'rgba(0, 212, 170, 0.3)', text: 'var(--risk-low)' },
    medium: { bg: 'rgba(240, 180, 41, 0.1)', border: 'rgba(240, 180, 41, 0.3)', text: 'var(--risk-medium)' },
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

/* ---- Stat Card ---- */

function StatCard({ label, value, delay = 0 }: { label: string; value: string | number; delay?: number }) {
  return (
    <div className="card text-center animate-fade-in" style={{ animationDelay: `${delay}s` }}>
      <div className="text-[10px] font-mono uppercase tracking-widest mb-2" style={{ color: 'var(--text-muted)' }}>{label}</div>
      <div className="text-xl font-bold font-mono" style={{ color: 'var(--text-primary)' }}>{value}</div>
    </div>
  );
}

/* ---- Collapsible ---- */

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

/* ---- Summary parser ---- */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseSummary(summary: string): Record<string, any> | null {
  try { return JSON.parse(summary); } catch { return null; }
}

interface ParsedScore {
  score: number;
  level: string;
  rating: string;
  probability_of_default: number;
  factors: string[];
}

function extractScore(
  response: AgentResponse,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  summaryData: Record<string, any> | null,
): ParsedScore | null {
  if (response.credit_risk_score) return response.credit_risk_score;
  if (!summaryData) return null;
  const score = summaryData.credit_score ?? summaryData.risk_score ?? summaryData.score;
  if (score == null) return null;
  return {
    score: Number(score),
    level: summaryData.risk_level || summaryData.level || '',
    rating: summaryData.credit_rating || summaryData.rating || '',
    probability_of_default: parseFloat(summaryData.probability_of_default || '0'),
    factors: summaryData.risk_factors || summaryData.factors || [],
  };
}

/* ---- Main Component ---- */

function ResultsPanelInternal({
  response,
  config,
  elapsed,
}: {
  response: AgentResponse;
  config: RuntimeConfig;
  elapsed: number;
}) {
  const summaryData = typeof response.summary === 'string' ? parseSummary(response.summary) : null;
  const summaryText = summaryData?.summary || (typeof response.summary === 'string' && !summaryData ? response.summary : '');
  const riskScore = extractScore(response, summaryData);
  const recommendations: string[] = summaryData?.recommendations || response.recommendations || response.credit_risk_score?.recommendations || [];
  const portfolioText: string = summaryData?.portfolio_impact_assessment || '';

  return (
    <div className="space-y-5">
      {/* Hero Result Card */}
      <div
        className="card-glow animate-fade-in-scale"
        style={{
          background: 'linear-gradient(135deg, var(--bg-card) 0%, rgba(0, 212, 170, 0.03) 100%)',
          borderColor: 'rgba(0, 212, 170, 0.2)',
        }}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full" style={{ background: 'var(--accent)' }} />
            <span className="text-xs font-mono uppercase tracking-widest" style={{ color: 'var(--accent)' }}>Assessment Complete</span>
          </div>
          <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>{elapsed}s</span>
        </div>

        {riskScore && (
          <div className="flex flex-col md:flex-row items-center gap-8 mb-6">
            {/* Score Ring */}
            <div className="shrink-0">
              <ScoreRing score={riskScore.score} />
            </div>

            {/* Key Metrics */}
            <div className="flex-1 grid grid-cols-3 gap-4 w-full">
              <div className="text-center">
                <div className="text-[10px] font-mono uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>Risk Level</div>
                <RiskBadge level={riskScore.level} />
              </div>
              <div className="text-center">
                <div className="text-[10px] font-mono uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>Credit Rating</div>
                <div className="text-2xl font-extrabold font-mono animate-fade-in" style={{ color: 'var(--text-primary)', animationDelay: '0.3s' }}>{riskScore.rating}</div>
              </div>
              <div className="text-center">
                <div className="text-[10px] font-mono uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>Default Prob.</div>
                <div className="text-2xl font-extrabold font-mono animate-fade-in" style={{ color: 'var(--text-primary)', animationDelay: '0.5s' }}>
                  {(riskScore.probability_of_default * 100).toFixed(1)}%
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Summary Text */}
        <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{summaryText}</p>
      </div>

      {/* Portfolio Impact */}
      {response.portfolio_impact && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Diversification" value={response.portfolio_impact.diversification_score.toFixed(2)} delay={0.1} />
          <StatCard label="Sector" value={response.portfolio_impact.sector_exposure} delay={0.15} />
          <StatCard label="Risk-Adj Return" value={`${response.portfolio_impact.risk_adjusted_return}%`} delay={0.2} />
          <StatCard label="Concentration" value={`${response.portfolio_impact.concentration_change > 0 ? '+' : ''}${response.portfolio_impact.concentration_change}`} delay={0.25} />
        </div>
      )}
      {!response.portfolio_impact && portfolioText && (
        <Collapsible title="Portfolio Impact" defaultOpen delay={0.15}>
          <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{portfolioText}</p>
        </Collapsible>
      )}

      {/* Risk Factors */}
      {riskScore && riskScore.factors.length > 0 && (
        <Collapsible title="Risk Factors" defaultOpen delay={0.2}>
          <ul className="space-y-3">
            {riskScore.factors.map((factor, i) => (
              <li
                key={i}
                className="flex items-start gap-3 text-sm animate-fade-in"
                style={{ animationDelay: `${0.3 + i * 0.06}s`, color: 'var(--text-secondary)' }}
              >
                <span
                  className="mt-1.5 w-2 h-2 rounded-full shrink-0"
                  style={{ background: 'var(--risk-medium)' }}
                />
                {factor}
              </li>
            ))}
          </ul>
        </Collapsible>
      )}

      {/* Recommendations */}
      {recommendations.length > 0 && (
        <Collapsible title="Recommendations" defaultOpen delay={0.25}>
          <ul className="space-y-3">
            {recommendations.map((rec, i) => (
              <li
                key={i}
                className="flex items-start gap-3 text-sm animate-fade-in"
                style={{ animationDelay: `${0.35 + i * 0.06}s`, color: 'var(--text-secondary)' }}
              >
                <span
                  className="mt-1.5 w-2 h-2 rounded-full shrink-0"
                  style={{ background: 'var(--accent)' }}
                />
                {rec}
              </li>
            ))}
          </ul>
        </Collapsible>
      )}

      {/* Raw Agent Analysis */}
      {response.raw_analysis && (
        <Collapsible title="Detailed Agent Analysis" delay={0.3}>
          <div className="space-y-4">
            {Object.entries(response.raw_analysis).filter(([, v]) => v != null).map(([key, agentData]) => {
              const agentMeta = config.agents.find((a) => a.id === agentData?.agent) || { name: agentData?.agent || key };
              const content = agentData?.analysis || agentData?.scoring || agentData?.portfolio || '';
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
