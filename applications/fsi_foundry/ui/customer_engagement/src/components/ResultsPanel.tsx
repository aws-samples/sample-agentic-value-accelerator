// @ts-nocheck
import { useState } from 'react';
import type { RuntimeConfig } from '../config';
import type { EngagementResponse } from '../types';

/* ---- Risk Level Badge ---- */

function RiskBadge({ level }: { level: string }) {
  const cfg: Record<string, { bg: string; border: string; text: string; label: string }> = {
    LOW: { bg: 'rgba(34,197,94,0.06)', border: 'rgba(34,197,94,0.25)', text: 'var(--green)', label: 'Low Risk' },
    MEDIUM: { bg: 'rgba(245,158,11,0.06)', border: 'rgba(245,158,11,0.25)', text: 'var(--amber)', label: 'Medium Risk' },
    HIGH: { bg: 'rgba(225,29,72,0.06)', border: 'rgba(225,29,72,0.25)', text: 'var(--rose)', label: 'High Risk' },
    CRITICAL: { bg: 'rgba(225,29,72,0.1)', border: 'rgba(225,29,72,0.4)', text: 'var(--rose)', label: 'Critical Risk' },
  };
  const c = cfg[level.toUpperCase()] || cfg.MEDIUM;
  const icons: Record<string, string> = {
    LOW: 'M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
    MEDIUM: 'M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z',
    HIGH: 'M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z',
    CRITICAL: 'M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z',
  };

  return (
    <div
      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold uppercase tracking-wider animate-fade-in-scale"
      style={{ background: c.bg, border: `1px solid ${c.border}`, color: c.text }}
    >
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d={icons[level.toUpperCase()] || icons.MEDIUM} />
      </svg>
      {c.label}
    </div>
  );
}

/* ---- Churn Probability Meter ---- */

function ChurnMeter({ probability }: { probability: number }) {
  const pct = Math.round(probability * 100);
  let color = 'var(--green)';
  if (probability > 0.6) color = 'var(--rose)';
  else if (probability > 0.3) color = 'var(--amber)';

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-mono uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Churn Probability</span>
        <span className="text-lg font-black font-mono" style={{ color }}>{pct}%</span>
      </div>
      <div className="risk-meter">
        <div
          className="risk-meter-fill"
          style={{
            width: `${pct}%`,
            background: `linear-gradient(90deg, var(--green), ${color})`,
            boxShadow: `0 0 8px ${color}40`,
          }}
        />
      </div>
    </div>
  );
}

/* ---- Info Item ---- */

function InfoItem({ label, value, color = 'var(--teal)' }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <div className="text-[10px] font-mono uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>{label}</div>
      <div className="text-sm font-semibold" style={{ color }}>{value}</div>
    </div>
  );
}

/* ---- List Section ---- */

function ListSection({ items, color }: { items: string[]; color: string }) {
  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div
          key={i}
          className="flex items-start gap-3 p-3 rounded-xl animate-slide-left"
          style={{
            background: `${color}06`,
            border: `1px solid ${color}12`,
            animationDelay: `${0.1 + i * 0.06}s`,
          }}
        >
          <div
            className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
            style={{ background: `${color}10`, border: `1px solid ${color}20` }}
          >
            <span className="text-xs font-mono font-bold" style={{ color }}>{i + 1}</span>
          </div>
          <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{item}</p>
        </div>
      ))}
    </div>
  );
}

/* ---- Collapsible Section ---- */

function Collapsible({ title, children, defaultOpen = false, delay = 0 }: { title: string; children: React.ReactNode; defaultOpen?: boolean; delay?: number }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="glass animate-fade-in p-6" style={{ animationDelay: `${delay}s` }}>
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
  response: EngagementResponse;
  config: RuntimeConfig;
  elapsed: number;
}) {
  const { churn_prediction: _cp = {}, outreach_plan: _op = {}, policy_recommendations: _pr = {}, summary = '' } = response as any;
  const churn_prediction = { risk_factors: [], behavioral_signals: [], ..._cp };
  const outreach_plan = { secondary_channels: [], talking_points: [], personalization_elements: [], ..._op };
  const policy_recommendations = { recommended_actions: [], coverage_adjustments: [], bundling_opportunities: [], value_improvements: [], ..._pr };

  return (
    <div className="space-y-5">
      {/* ===== Hero — Engagement Overview ===== */}
      <div
        className="glass animate-fade-in-scale p-6"
        style={{
          background: 'linear-gradient(135deg, rgba(255,255,255,0.9) 0%, rgba(20,184,166,0.03) 50%, rgba(245,158,11,0.02) 100%)',
          borderColor: 'rgba(15,118,110,0.15)',
          boxShadow: '0 4px 30px rgba(15,118,110,0.05)',
        }}
      >
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full" style={{ background: 'var(--green)', boxShadow: '0 0 6px var(--green)' }} />
            <span
              className="text-xs font-mono uppercase tracking-widest"
              style={{ color: 'var(--teal)' }}
            >
              Assessment Complete
            </span>
          </div>
          <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
            {response.engagement_id?.slice(0, 8) || "N/A"} &bull; {elapsed}s
          </span>
        </div>

        {/* Risk Badge */}
        <div className="flex items-center justify-center gap-4 mb-6">
          <RiskBadge level={churn_prediction.risk_level} />
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="text-center">
            <div className="text-[10px] font-mono uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>Customer</div>
            <div className="text-lg font-bold font-mono" style={{ color: 'var(--text-primary)' }}>{response.customer_id}</div>
          </div>
          <div className="text-center">
            <div className="text-[10px] font-mono uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>Channel</div>
            <div className="text-lg font-bold font-mono" style={{ color: 'var(--teal)' }}>{outreach_plan.recommended_channel}</div>
          </div>
          <div className="text-center">
            <div className="text-[10px] font-mono uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>Retention Window</div>
            <div
              className="text-lg font-bold font-mono"
              style={{ color: churn_prediction.retention_window_days <= 14 ? 'var(--rose)' : 'var(--amber)' }}
            >
              {churn_prediction.retention_window_days}d
            </div>
          </div>
          <div className="text-center">
            <div className="text-[10px] font-mono uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>Est. Savings</div>
            <div className="text-lg font-bold font-mono" style={{ color: 'var(--green)' }}>{policy_recommendations.estimated_savings}</div>
          </div>
        </div>

        {/* Churn Meter */}
        <div className="mb-6">
          <ChurnMeter probability={churn_prediction.churn_probability} />
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

      {/* ===== Churn Prediction Details ===== */}
      <div className="glass animate-fade-in p-6" style={{ animationDelay: '0.1s' }}>
        <div className="flex items-center gap-2 mb-6">
          <svg className="w-4 h-4" style={{ color: 'var(--rose)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
          </svg>
          <h3 className="text-sm font-mono uppercase tracking-widest" style={{ color: 'var(--text-secondary)' }}>Churn Prediction</h3>
        </div>

        <div className="grid grid-cols-2 gap-6 mb-6">
          <div>
            <h4 className="text-xs font-mono uppercase tracking-wider mb-3" style={{ color: 'var(--rose)' }}>Risk Factors</h4>
            <div className="space-y-2">
              {churn_prediction.risk_factors.map((factor, i) => (
                <div key={i} className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ background: 'var(--rose)' }} />
                  <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{factor}</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <h4 className="text-xs font-mono uppercase tracking-wider mb-3" style={{ color: 'var(--amber)' }}>Behavioral Signals</h4>
            <div className="space-y-2">
              {churn_prediction.behavioral_signals.map((signal, i) => (
                <div key={i} className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ background: 'var(--amber)' }} />
                  <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{signal}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {churn_prediction.notes && (
          <div
            className="p-4 rounded-xl text-sm leading-relaxed"
            style={{ background: 'rgba(225,29,72,0.03)', border: '1px solid rgba(225,29,72,0.08)', color: 'var(--text-secondary)' }}
          >
            {churn_prediction.notes}
          </div>
        )}
      </div>

      {/* ===== Outreach Plan ===== */}
      <div className="glass animate-fade-in p-6" style={{ animationDelay: '0.15s' }}>
        <div className="flex items-center gap-2 mb-6">
          <svg className="w-4 h-4" style={{ color: 'var(--teal)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.34 15.84c-.688-.06-1.386-.09-2.09-.09H7.5a4.5 4.5 0 110-9h.75c.704 0 1.402-.03 2.09-.09m0 9.18c.253.962.584 1.892.985 2.783.247.55.06 1.21-.463 1.511l-.657.38c-.551.318-1.26.117-1.527-.461a20.845 20.845 0 01-1.44-4.282m3.102.069a18.03 18.03 0 01-.59-4.59c0-1.586.205-3.124.59-4.59m0 9.18a23.848 23.848 0 018.835 2.535M10.34 6.66a23.847 23.847 0 008.835-2.535m0 0A23.74 23.74 0 0018.795 3m.38 1.125a23.91 23.91 0 011.014 5.395m-1.014 8.855c-.118.38-.245.754-.38 1.125m.38-1.125a23.91 23.91 0 001.014-5.395m0-3.46c.495.413.811 1.035.811 1.73 0 .695-.316 1.317-.811 1.73m0-3.46a24.347 24.347 0 010 3.46" />
          </svg>
          <h3 className="text-sm font-mono uppercase tracking-widest" style={{ color: 'var(--text-secondary)' }}>Outreach Plan</h3>
        </div>

        <div className="grid grid-cols-3 gap-4 mb-6">
          <InfoItem label="Primary Channel" value={outreach_plan.recommended_channel} color="var(--teal)" />
          <InfoItem label="Messaging Theme" value={outreach_plan.messaging_theme} color="var(--teal-light)" />
          <InfoItem label="Optimal Timing" value={outreach_plan.optimal_timing} color="var(--amber)" />
        </div>

        {outreach_plan.secondary_channels.length > 0 && (
          <div className="mb-5">
            <div className="text-[10px] font-mono uppercase tracking-widest mb-2" style={{ color: 'var(--text-muted)' }}>Secondary Channels</div>
            <div className="flex flex-wrap gap-2">
              {outreach_plan.secondary_channels.map((ch, i) => (
                <span
                  key={i}
                  className="px-3 py-1 rounded-full text-xs font-mono"
                  style={{ background: 'rgba(15,118,110,0.06)', border: '1px solid rgba(15,118,110,0.12)', color: 'var(--teal)' }}
                >
                  {ch}
                </span>
              ))}
            </div>
          </div>
        )}

        {outreach_plan.talking_points.length > 0 && (
          <div className="mb-5">
            <h4 className="text-xs font-mono uppercase tracking-wider mb-3" style={{ color: 'var(--teal)' }}>Talking Points</h4>
            <ListSection items={outreach_plan.talking_points} color="#0F766E" />
          </div>
        )}

        {outreach_plan.personalization_elements.length > 0 && (
          <div className="mb-4">
            <h4 className="text-xs font-mono uppercase tracking-wider mb-3" style={{ color: 'var(--amber)' }}>Personalization Elements</h4>
            <div className="space-y-2">
              {outreach_plan.personalization_elements.map((el, i) => (
                <div key={i} className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ background: 'var(--amber)' }} />
                  <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{el}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {outreach_plan.notes && (
          <div
            className="p-4 rounded-xl text-sm leading-relaxed"
            style={{ background: 'rgba(15,118,110,0.03)', border: '1px solid rgba(15,118,110,0.08)', color: 'var(--text-secondary)' }}
          >
            {outreach_plan.notes}
          </div>
        )}
      </div>

      {/* ===== Policy Recommendations ===== */}
      <div className="glass animate-fade-in p-6" style={{ animationDelay: '0.2s' }}>
        <div className="flex items-center gap-2 mb-6">
          <svg className="w-4 h-4" style={{ color: 'var(--amber)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
          </svg>
          <h3 className="text-sm font-mono uppercase tracking-widest" style={{ color: 'var(--text-secondary)' }}>Policy Recommendations</h3>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-6">
          <InfoItem label="Estimated Savings" value={policy_recommendations.estimated_savings} color="var(--green)" />
          <InfoItem label="Actions Count" value={`${policy_recommendations.recommended_actions.length} recommendations`} color="var(--amber)" />
        </div>

        {policy_recommendations.recommended_actions.length > 0 && (
          <div className="mb-5">
            <h4 className="text-xs font-mono uppercase tracking-wider mb-3" style={{ color: 'var(--amber)' }}>Recommended Actions</h4>
            <ListSection items={policy_recommendations.recommended_actions} color="#F59E0B" />
          </div>
        )}

        {policy_recommendations.coverage_adjustments.length > 0 && (
          <div className="mb-5">
            <h4 className="text-xs font-mono uppercase tracking-wider mb-3" style={{ color: 'var(--teal)' }}>Coverage Adjustments</h4>
            <div className="space-y-2">
              {policy_recommendations.coverage_adjustments.map((adj, i) => (
                <div key={i} className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ background: 'var(--teal)' }} />
                  <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{adj}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {policy_recommendations.bundling_opportunities.length > 0 && (
          <div className="mb-5">
            <h4 className="text-xs font-mono uppercase tracking-wider mb-3" style={{ color: 'var(--green)' }}>Bundling Opportunities</h4>
            <div className="grid grid-cols-1 gap-2">
              {policy_recommendations.bundling_opportunities.map((opp, i) => (
                <div
                  key={i}
                  className="flex items-start gap-3 p-3 rounded-xl"
                  style={{ background: 'rgba(34,197,94,0.04)', border: '1px solid rgba(34,197,94,0.1)' }}
                >
                  <div className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ background: 'var(--green)' }} />
                  <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{opp}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {policy_recommendations.value_improvements.length > 0 && (
          <div className="mb-4">
            <h4 className="text-xs font-mono uppercase tracking-wider mb-3" style={{ color: 'var(--teal-light)' }}>Value Improvements</h4>
            <div className="space-y-2">
              {policy_recommendations.value_improvements.map((imp, i) => (
                <div key={i} className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ background: 'var(--teal-light)' }} />
                  <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{imp}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {policy_recommendations.notes && (
          <div
            className="p-4 rounded-xl text-sm leading-relaxed"
            style={{ background: 'rgba(245,158,11,0.03)', border: '1px solid rgba(245,158,11,0.08)', color: 'var(--text-secondary)' }}
          >
            {policy_recommendations.notes}
          </div>
        )}
      </div>

      {/* ===== Raw Agent Analysis ===== */}
      {response.raw_analysis && (
        <Collapsible title="Detailed Agent Reports" delay={0.3}>
          <div className="space-y-4">
            {Object.entries(response.raw_analysis).map(([key, agentData]) => {
              if (!agentData) return null;
              const agentMeta = config.agents.find((a) => a.id === agentData.agent) || { name: agentData.agent || key };
              const content = agentData.analysis || agentData.assessment || '';
              const colorMap: Record<string, string> = {
                churn_predictor: 'var(--rose)',
                outreach_agent: 'var(--teal)',
                policy_optimizer: 'var(--amber)',
              };
              const color = colorMap[agentData.agent] || 'var(--teal)';

              return (
                <div
                  key={key}
                  className="rounded-xl p-5"
                  style={{
                    background: 'var(--bg-secondary)',
                    border: `1px solid var(--border)`,
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
