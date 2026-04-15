// @ts-nocheck
import { useState } from 'react';
import type { RuntimeConfig } from '../config';
import type { AnalyticsResponse } from '../types';

/* ---- Data Quality Badge ---- */

function DataQualityBadge({ quality }: { quality: string }) {
  const cfg: Record<string, { bg: string; border: string; text: string; label: string }> = {
    HIGH: { bg: 'rgba(16,185,129,0.06)', border: 'rgba(16,185,129,0.25)', text: 'var(--emerald)', label: 'High Quality' },
    MEDIUM: { bg: 'rgba(245,158,11,0.06)', border: 'rgba(245,158,11,0.25)', text: 'var(--amber)', label: 'Medium Quality' },
    LOW: { bg: 'rgba(239,68,68,0.06)', border: 'rgba(239,68,68,0.25)', text: '#EF4444', label: 'Low Quality' },
  };
  const c = cfg[quality.toUpperCase()] || cfg.MEDIUM;

  return (
    <div
      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold uppercase tracking-wider animate-fade-in-scale"
      style={{ background: c.bg, border: `1px solid ${c.border}`, color: c.text }}
    >
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      {c.label}
    </div>
  );
}

/* ---- Confidence Badge ---- */

function ConfidenceBadge({ confidence }: { confidence: string }) {
  const cfg: Record<string, { bg: string; border: string; text: string }> = {
    HIGH: { bg: 'rgba(16,185,129,0.06)', border: 'rgba(16,185,129,0.2)', text: 'var(--emerald)' },
    MEDIUM: { bg: 'rgba(245,158,11,0.06)', border: 'rgba(245,158,11,0.2)', text: 'var(--amber)' },
    LOW: { bg: 'rgba(239,68,68,0.06)', border: 'rgba(239,68,68,0.2)', text: '#EF4444' },
  };
  const c = cfg[confidence.toUpperCase()] || cfg.MEDIUM;

  return (
    <span
      className="ticket-badge"
      style={{ background: c.bg, border: `1px solid ${c.border}`, color: c.text }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: c.text }} />
      {confidence} Confidence
    </span>
  );
}

/* ---- Coverage Bar ---- */

function CoverageBar({ pct }: { pct: number }) {
  const color = pct >= 80 ? 'var(--emerald)' : pct >= 50 ? 'var(--amber)' : '#EF4444';
  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-mono uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Data Coverage</span>
        <span className="text-sm font-bold font-mono" style={{ color }}>{pct}%</span>
      </div>
      <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: 'var(--light-gray)' }}>
        <div
          className="h-full rounded-full bar-chart-bar"
          style={{
            width: `${pct}%`,
            background: `linear-gradient(90deg, ${color}, ${color}cc)`,
          }}
        />
      </div>
    </div>
  );
}

/* ---- Finding Item ---- */

function FindingItem({ finding, index, total }: { finding: string; index: number; total: number }) {
  const isLast = index === total - 1;
  const colors = ['var(--indigo)', 'var(--emerald)', 'var(--amber)'];
  const color = colors[index % colors.length];

  return (
    <div className="relative flex gap-4 animate-slide-left" style={{ animationDelay: `${0.3 + index * 0.1}s` }}>
      <div className="flex flex-col items-center">
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 relative z-10"
          style={{
            background: `${color}10`,
            border: `1px solid ${color}30`,
          }}
        >
          <svg className="w-4 h-4" style={{ color }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        </div>
        {!isLast && (
          <div className="w-px flex-1 min-h-[20px]" style={{ background: `linear-gradient(to bottom, ${color}25, var(--border))` }} />
        )}
      </div>
      <div className="pb-5 flex-1">
        <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{finding}</p>
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
  response: AnalyticsResponse;
  config: RuntimeConfig;
  elapsed: number;
}) {
  const { analytics_detail: _ad = {}, summary = '', recommendations = [] } = response as any;
  const analytics_detail = { statistical_findings: [], visualization_suggestions: [], ..._ad };

  return (
    <div className="space-y-5">
      {/* ===== Hero -- Analytics Complete ===== */}
      <div
        className="glass animate-fade-in-scale p-6"
        style={{
          background: 'linear-gradient(135deg, rgba(79, 70, 229, 0.02) 0%, rgba(16, 185, 129, 0.02) 50%, rgba(245, 158, 11, 0.01) 100%)',
          borderColor: 'rgba(79, 70, 229, 0.15)',
        }}
      >
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full" style={{ background: 'var(--emerald)' }} />
            <span
              className="text-xs font-mono uppercase tracking-widest"
              style={{ color: 'var(--indigo)' }}
            >
              Analysis Complete
            </span>
          </div>
          <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
            {response.analytics_id?.slice(0, 8) || "N/A"} &bull; {elapsed}s
          </span>
        </div>

        {/* Quality + Confidence */}
        <div className="flex items-center justify-center gap-4 mb-6">
          <DataQualityBadge quality={analytics_detail.data_quality} />
          <ConfidenceBadge confidence={analytics_detail.insight_confidence} />
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="text-center">
            <div className="text-[10px] font-mono uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>Entity</div>
            <div className="text-lg font-bold font-mono" style={{ color: 'var(--text-primary)' }}>{response.entity_id}</div>
          </div>
          <div className="text-center">
            <div className="text-[10px] font-mono uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>Patterns</div>
            <div
              className="text-lg font-bold font-mono gradient-text"
            >
              {analytics_detail.patterns_identified}
            </div>
          </div>
          <div className="text-center">
            <div className="text-[10px] font-mono uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>Coverage</div>
            <div
              className="text-lg font-bold font-mono"
              style={{
                color: analytics_detail.data_coverage_pct >= 80 ? 'var(--emerald)' : analytics_detail.data_coverage_pct >= 50 ? 'var(--amber)' : '#EF4444',
              }}
            >
              {analytics_detail.data_coverage_pct}%
            </div>
          </div>
        </div>

        {/* Coverage Bar */}
        <div className="mb-6">
          <CoverageBar pct={analytics_detail.data_coverage_pct} />
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

      {/* ===== Statistical Findings ===== */}
      {analytics_detail.statistical_findings && analytics_detail.statistical_findings.length > 0 && (
        <div className="glass animate-fade-in p-6" style={{ animationDelay: '0.1s' }}>
          <div className="flex items-center gap-2 mb-6">
            <svg className="w-4 h-4" style={{ color: 'var(--indigo)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
            </svg>
            <h3 className="text-sm font-mono uppercase tracking-widest" style={{ color: 'var(--text-secondary)' }}>Statistical Findings</h3>
          </div>
          <div>
            {analytics_detail.statistical_findings.map((finding, i) => (
              <FindingItem key={i} finding={finding} index={i} total={analytics_detail.statistical_findings.length} />
            ))}
          </div>
        </div>
      )}

      {/* ===== Visualization Suggestions ===== */}
      {analytics_detail.visualization_suggestions && analytics_detail.visualization_suggestions.length > 0 && (
        <div className="glass animate-fade-in p-6" style={{ animationDelay: '0.15s' }}>
          <div className="flex items-center gap-2 mb-5">
            <svg className="w-4 h-4" style={{ color: 'var(--amber)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
            </svg>
            <h3 className="text-sm font-mono uppercase tracking-widest" style={{ color: 'var(--text-secondary)' }}>Visualization Suggestions</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {analytics_detail.visualization_suggestions.map((viz, i) => {
              const colors = ['var(--indigo)', 'var(--emerald)', 'var(--amber)'];
              const color = colors[i % colors.length];
              return (
                <div
                  key={i}
                  className="flex items-start gap-3 p-3.5 rounded-xl animate-slide-right"
                  style={{
                    background: `${color}06`,
                    border: `1px solid ${color}15`,
                    animationDelay: `${0.2 + i * 0.08}s`,
                  }}
                >
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                    style={{ background: `${color}10`, border: `1px solid ${color}20` }}
                  >
                    <svg className="w-4 h-4" style={{ color }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5" />
                    </svg>
                  </div>
                  <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{viz}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ===== Recommendations ===== */}
      {recommendations.length > 0 && (
        <div className="glass animate-fade-in p-6" style={{ animationDelay: '0.2s' }}>
          <div className="flex items-center gap-2 mb-5">
            <svg className="w-4 h-4" style={{ color: 'var(--emerald)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
            </svg>
            <h3 className="text-sm font-mono uppercase tracking-widest" style={{ color: 'var(--text-secondary)' }}>Recommendations</h3>
          </div>
          <div className="grid grid-cols-1 gap-3">
            {recommendations.map((rec, i) => {
              const colors = ['var(--indigo)', 'var(--emerald)', 'var(--amber)'];
              const color = colors[i % colors.length];
              return (
                <div
                  key={i}
                  className="flex items-start gap-3 p-3.5 rounded-xl animate-slide-right"
                  style={{
                    background: `${color}06`,
                    border: `1px solid ${color}15`,
                    animationDelay: `${0.25 + i * 0.08}s`,
                  }}
                >
                  <div
                    className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                    style={{ background: `${color}10`, border: `1px solid ${color}20` }}
                  >
                    <span className="text-xs font-mono font-bold" style={{ color }}>{i + 1}</span>
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
                data_explorer: 'var(--indigo)',
                statistical_analyst: 'var(--emerald)',
                insight_generator: 'var(--amber)',
              };
              const color = colorMap[agentData.agent] || 'var(--indigo)';

              return (
                <div
                  key={key}
                  className="rounded-xl p-5"
                  style={{
                    background: 'var(--light-gray)',
                    border: `1px solid ${color}15`,
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
