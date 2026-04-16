// @ts-nocheck
import { useState } from 'react';
import type { RuntimeConfig } from '../config';
import type { AnalyticsResponse } from '../types';

/* ---- Score Bar ---- */

function ScoreBar({ value, max, color, label }: { value: number; max: number; color: string; label: string }) {
  const pct = Math.round((value / max) * 100);
  return (
    <div className="mb-3">
      <div className="flex justify-between items-baseline mb-1">
        <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>{label}</span>
        <span className="text-xs font-mono font-bold" style={{ color }}>{pct}%</span>
      </div>
      <div className="score-bar">
        <div className="score-bar-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

/* ---- KPI Card ---- */

function KpiCard({ label, value, color, icon }: { label: string; value: string; color: string; icon: React.ReactNode }) {
  return (
    <div className="card-kpi animate-count-up">
      <div className="flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: `${color}0A`, border: `1px solid ${color}20`, color }}
        >
          {icon}
        </div>
        <div>
          <div className="text-[10px] font-mono uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>{label}</div>
          <div className="text-lg font-bold font-mono" style={{ color: 'var(--text-primary)' }}>{value}</div>
        </div>
      </div>
    </div>
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

/* ---- List Item ---- */

function ListItem({ text, color, index }: { text: string; color: string; index: number }) {
  return (
    <div
      className="flex items-start gap-3 p-3 rounded-xl animate-slide-right"
      style={{
        background: `${color}06`,
        border: `1px solid ${color}12`,
        animationDelay: `${0.2 + index * 0.06}s`,
      }}
    >
      <div
        className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
        style={{ background: `${color}10`, border: `1px solid ${color}20` }}
      >
        <span className="text-xs font-mono font-bold" style={{ color }}>{index + 1}</span>
      </div>
      <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{text}</p>
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
  response: AnalyticsResponse;
  config: RuntimeConfig;
  elapsed: number;
}) {
  const { call_monitoring: _cm = {}, performance_metrics: _pm = {}, operational_insights: _oi = {} } = response as any;
  const call_monitoring = { quality_issues: [], compliance_violations: [], ..._cm };
  const performance_metrics = { top_performers: [], coaching_opportunities: [], kpi_summary: {}, ..._pm };
  const operational_insights = { peak_hours: [], bottlenecks: [], staffing_recommendations: [], process_improvements: [], ..._oi };

  return (
    <div className="space-y-5">
      {/* ===== Hero KPIs ===== */}
      <div
        className="card-elevated animate-fade-in-scale p-6"
        style={{ borderColor: 'rgba(37,99,235,0.15)' }}
      >
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full" style={{ background: 'var(--emerald)' }} />
            <span className="text-xs font-mono uppercase tracking-widest" style={{ color: 'var(--blue)' }}>
              Analytics Complete
            </span>
          </div>
          <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
            {response.call_center_id} &bull; {elapsed}s
          </span>
        </div>

        {/* Top-level KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <KpiCard
            label="Calls Reviewed"
            value={String(call_monitoring.calls_reviewed)}
            color="#2563EB"
            icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" /></svg>}
          />
          <KpiCard
            label="Avg Handle Time"
            value={`${performance_metrics.average_handle_time}s`}
            color="#10B981"
            icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
          />
          <KpiCard
            label="CSAT Score"
            value={`${performance_metrics.customer_satisfaction_score}/5`}
            color="#F59E0B"
            icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" /></svg>}
          />
          <KpiCard
            label="Volume Trend"
            value={operational_insights.call_volume_trend}
            color="#8B5CF6"
            icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" /></svg>}
          />
        </div>

        {/* Score Bars */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <ScoreBar value={call_monitoring.overall_quality} max={1} color="#2563EB" label="Overall Quality" />
          <ScoreBar value={call_monitoring.compliance_score} max={1} color="#10B981" label="Compliance Score" />
          <ScoreBar value={performance_metrics.first_call_resolution_rate} max={1} color="#F59E0B" label="First Call Resolution" />
        </div>
      </div>

      {/* ===== Call Monitoring ===== */}
      <Collapsible title="Call Monitoring" defaultOpen delay={0.1}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="p-3 rounded-lg" style={{ background: 'var(--bg-secondary)' }}>
              <div className="text-[10px] font-mono uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>Avg Sentiment</div>
              <div className="text-lg font-bold font-mono" style={{ color: call_monitoring.average_sentiment >= 0 ? 'var(--emerald)' : 'var(--red)' }}>
                {call_monitoring.average_sentiment.toFixed(2)}
              </div>
            </div>
            <div className="p-3 rounded-lg" style={{ background: 'var(--bg-secondary)' }}>
              <div className="text-[10px] font-mono uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>Issues Found</div>
              <div className="text-lg font-bold font-mono" style={{ color: call_monitoring.quality_issues.length > 0 ? 'var(--amber)' : 'var(--emerald)' }}>
                {call_monitoring.quality_issues.length}
              </div>
            </div>
          </div>

          {call_monitoring.quality_issues.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>Quality Issues</h4>
              <div className="space-y-2">
                {call_monitoring.quality_issues.map((issue, i) => (
                  <div key={i} className="flex items-start gap-3 p-3 rounded-lg" style={{ background: 'rgba(245,158,11,0.04)', border: '1px solid rgba(245,158,11,0.12)' }}>
                    <span className="badge" style={{ background: 'rgba(245,158,11,0.1)', color: 'var(--amber)' }}>{issue.severity}</span>
                    <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{issue.description}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {call_monitoring.compliance_violations.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>Compliance Violations</h4>
              <div className="space-y-2">
                {call_monitoring.compliance_violations.map((v, i) => (
                  <div key={i} className="flex items-start gap-3 p-3 rounded-lg" style={{ background: 'rgba(239,68,68,0.04)', border: '1px solid rgba(239,68,68,0.12)' }}>
                    <span className="badge" style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--red)' }}>{v.regulation}</span>
                    <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{v.description}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {call_monitoring.notes && (
            <div className="text-sm leading-relaxed whitespace-pre-line" style={{ color: 'var(--text-secondary)' }}>
              {call_monitoring.notes}
            </div>
          )}
        </div>
      </Collapsible>

      {/* ===== Performance Metrics ===== */}
      <Collapsible title="Performance Metrics" defaultOpen delay={0.15}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="p-3 rounded-lg" style={{ background: 'var(--bg-secondary)' }}>
              <div className="text-[10px] font-mono uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>Coaching Priority</div>
              <div className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>{performance_metrics.coaching_priority}</div>
            </div>
            <div className="p-3 rounded-lg" style={{ background: 'var(--bg-secondary)' }}>
              <div className="text-[10px] font-mono uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>Satisfaction</div>
              <div className="text-base font-bold font-mono" style={{ color: 'var(--amber)' }}>{performance_metrics.customer_satisfaction_score}/5</div>
            </div>
          </div>

          {performance_metrics.top_performers.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>Top Performers</h4>
              <div className="flex flex-wrap gap-2">
                {performance_metrics.top_performers.map((p, i) => (
                  <span key={i} className="badge" style={{ background: 'rgba(16,185,129,0.08)', color: 'var(--emerald)', border: '1px solid rgba(16,185,129,0.2)' }}>{p}</span>
                ))}
              </div>
            </div>
          )}

          {performance_metrics.coaching_opportunities.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>Coaching Opportunities</h4>
              <div className="space-y-2">
                {performance_metrics.coaching_opportunities.map((opp, i) => (
                  <ListItem key={i} text={opp} color="#F59E0B" index={i} />
                ))}
              </div>
            </div>
          )}

          {Object.keys(performance_metrics.kpi_summary).length > 0 && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>KPI Summary</h4>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(performance_metrics.kpi_summary).map(([key, val]) => (
                  <div key={key} className="p-2 rounded-lg flex justify-between" style={{ background: 'var(--bg-secondary)' }}>
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{key}</span>
                    <span className="text-xs font-mono font-bold" style={{ color: 'var(--text-primary)' }}>{String(val)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {performance_metrics.notes && (
            <div className="text-sm leading-relaxed whitespace-pre-line" style={{ color: 'var(--text-secondary)' }}>
              {performance_metrics.notes}
            </div>
          )}
        </div>
      </Collapsible>

      {/* ===== Operational Insights ===== */}
      <Collapsible title="Operational Insights" defaultOpen delay={0.2}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="p-3 rounded-lg" style={{ background: 'var(--bg-secondary)' }}>
              <div className="text-[10px] font-mono uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>Volume Trend</div>
              <div className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>{operational_insights.call_volume_trend}</div>
            </div>
            <div className="p-3 rounded-lg" style={{ background: 'var(--bg-secondary)' }}>
              <div className="text-[10px] font-mono uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>Peak Hours</div>
              <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{operational_insights.peak_hours.join(', ')}</div>
            </div>
          </div>

          {operational_insights.bottlenecks.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>Bottlenecks</h4>
              <div className="space-y-2">
                {operational_insights.bottlenecks.map((b, i) => (
                  <ListItem key={i} text={b} color="#EF4444" index={i} />
                ))}
              </div>
            </div>
          )}

          {operational_insights.staffing_recommendations.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>Staffing Recommendations</h4>
              <div className="space-y-2">
                {operational_insights.staffing_recommendations.map((rec, i) => (
                  <ListItem key={i} text={rec} color="#2563EB" index={i} />
                ))}
              </div>
            </div>
          )}

          {operational_insights.process_improvements.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>Process Improvements</h4>
              <div className="space-y-2">
                {operational_insights.process_improvements.map((imp, i) => (
                  <ListItem key={i} text={imp} color="#10B981" index={i} />
                ))}
              </div>
            </div>
          )}

          {operational_insights.forecast_summary && (
            <div className="p-4 rounded-xl" style={{ background: 'rgba(37,99,235,0.03)', border: '1px solid rgba(37,99,235,0.1)' }}>
              <h4 className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--blue)' }}>Forecast</h4>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{operational_insights.forecast_summary}</p>
            </div>
          )}

          {operational_insights.notes && (
            <div className="text-sm leading-relaxed whitespace-pre-line" style={{ color: 'var(--text-secondary)' }}>
              {operational_insights.notes}
            </div>
          )}
        </div>
      </Collapsible>

      {/* ===== Summary ===== */}
      {response.summary && (
        <div className="card animate-fade-in p-6" style={{ animationDelay: '0.25s' }}>
          <div className="flex items-center gap-2 mb-4">
            <svg className="w-4 h-4" style={{ color: 'var(--blue)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
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
                call_monitor: '#2563EB',
                performance_analyst: '#10B981',
                insight_generator: '#F59E0B',
              };
              const color = colorMap[agentData.agent] || '#2563EB';

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
