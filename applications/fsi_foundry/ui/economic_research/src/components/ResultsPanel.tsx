// @ts-nocheck
import { useState } from 'react';
import type { ResearchResponse, Recommendation } from '../types';

interface Props {
  result: ResearchResponse;
}

/* ── Helper: Radial progress circle ── */
function RadialProgress({ value, size = 72, stroke = 6, color = '#1E3A5F' }: { value: number; size?: number; stroke?: number; color?: string }) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value / 100) * circumference;
  return (
    <div className="radial-progress" style={{ '--size': `${size}px`, '--stroke': `${stroke}px` } as React.CSSProperties}>
      <svg>
        <circle className="track" cx={size / 2} cy={size / 2} r={radius} />
        <circle className="fill" cx={size / 2} cy={size / 2} r={radius}
          style={{ stroke: color, strokeDasharray: circumference, strokeDashoffset: offset }} />
      </svg>
      <span className="label">{value}%</span>
    </div>
  );
}

/* ── Helper: Confidence bar ── */
function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color = pct >= 80 ? '#4D7C0F' : pct >= 60 ? '#1E3A5F' : pct >= 40 ? '#F59E0B' : '#78716C';
  return (
    <div className="flex items-center gap-2">
      <div className="confidence-bar flex-1">
        <div className="confidence-bar-fill" style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${color}, ${color}88)` }} />
      </div>
      <span className="text-xs font-bold" style={{ color, minWidth: '32px' }}>{pct}%</span>
    </div>
  );
}

/* ── Helper: Trend direction icon ── */
function TrendIcon({ direction }: { direction: string }) {
  const d = direction.toLowerCase();
  if (d === 'up') {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4D7C0F" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" />
      </svg>
    );
  }
  if (d === 'down') {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#C2410C" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="5" x2="12" y2="19" /><polyline points="19 12 12 19 5 12" />
      </svg>
    );
  }
  if (d === 'volatile') {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="3 17 9 11 13 15 21 7" />
        <polyline points="14 7 21 7 21 14" />
      </svg>
    );
  }
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1E3A5F" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

/* ── Helper: group recommendations by confidence tier ── */
function groupRecommendations(recs: Recommendation[]): Record<string, Recommendation[]> {
  const grouped: Record<string, Recommendation[]> = {};
  for (const r of recs) {
    const tier = r.confidence >= 0.8 ? 'HIGH' : r.confidence >= 0.5 ? 'MEDIUM' : 'LOW';
    if (!grouped[tier]) grouped[tier] = [];
    grouped[tier].push(r);
  }
  const order = ['HIGH', 'MEDIUM', 'LOW'];
  const sorted: Record<string, Recommendation[]> = {};
  for (const key of order) {
    if (grouped[key]) sorted[key] = grouped[key];
  }
  return sorted;
}

function ResultsPanelInternal({ result }: Props) {
  const [rawExpanded, setRawExpanded] = useState(false);
  const { economic_overview, recommendations } = result;

  const sourcesCount = economic_overview?.data_sources_used.length ?? 0;
  const findingsCount = economic_overview ? Object.keys(economic_overview.key_findings).length : 0;
  const correlationsCount = economic_overview?.correlations_identified.length ?? 0;

  return (
    <div className="space-y-6 animate-fadeSlideUp">

      {/* ── Research Header ── */}
      <div className="card flex items-center justify-between" style={{ borderTop: '3px solid var(--navy-800)' }}>
        <div>
          <h2 className="text-lg font-extrabold heading-serif" style={{ color: 'var(--charcoal)' }}>Research Result</h2>
          <div className="flex items-center gap-4 mt-1">
            <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
              ID: {result.research_id}
            </span>
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {new Date(result.timestamp).toLocaleString()}
            </span>
          </div>
        </div>
        <div className="text-xs font-bold px-3 py-1.5 rounded-full"
          style={{ background: 'var(--navy-50)', color: 'var(--navy-800)' }}>
          {result.entity_id}
        </div>
      </div>

      {/* ── Two-Column Layout: Economic Overview + Recommendations ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* ── Economic Overview Panel ── */}
        <div className="card animate-fadeSlideUp stagger-1">
          <h3 className="text-sm font-extrabold mb-4 flex items-center gap-2 heading-serif" style={{ color: 'var(--navy-800)' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 3v18h18" />
              <path d="M7 16l4-8 4 4 4-12" />
            </svg>
            Economic Overview
          </h3>

          {economic_overview ? (
            <>
              {/* Stats Row */}
              <div className="grid grid-cols-3 gap-3 mb-5">
                <div className="text-center p-3 rounded-xl" style={{ background: 'var(--navy-50)' }}>
                  <div className="text-2xl font-extrabold" style={{ color: 'var(--navy-800)' }}>{sourcesCount}</div>
                  <div className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>Data Sources</div>
                </div>
                <div className="text-center p-3 rounded-xl" style={{ background: 'var(--terracotta-50)' }}>
                  <div className="text-2xl font-extrabold" style={{ color: 'var(--terracotta)' }}>{findingsCount}</div>
                  <div className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>Key Findings</div>
                </div>
                <div className="flex flex-col items-center justify-center">
                  <RadialProgress
                    value={Math.min(correlationsCount * 20, 100)}
                    size={64}
                    stroke={5}
                    color={correlationsCount > 3 ? '#4D7C0F' : correlationsCount > 1 ? '#1E3A5F' : '#78716C'}
                  />
                  <div className="text-xs font-semibold mt-1" style={{ color: 'var(--text-muted)' }}>Correlations</div>
                </div>
              </div>

              {/* Primary Indicator + Trend */}
              <div className="flex items-center gap-3 mb-5 p-3 rounded-xl" style={{ background: 'var(--stone-100)' }}>
                <TrendIcon direction={economic_overview.trend_direction} />
                <div className="flex-1">
                  <span className="text-xs font-bold" style={{ color: 'var(--text-secondary)' }}>Primary Indicator</span>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-sm font-bold heading-serif" style={{ color: 'var(--charcoal)' }}>
                      {economic_overview.primary_indicator}
                    </span>
                    <span className={`trend-badge ${economic_overview.trend_direction.toLowerCase()}`}>
                      {economic_overview.trend_direction}
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>Forecast Horizon</span>
                  <div className="text-sm font-bold" style={{ color: 'var(--navy-800)' }}>{economic_overview.forecast_horizon}</div>
                </div>
              </div>

              {/* Key Findings */}
              {findingsCount > 0 && (
                <div className="mb-5">
                  <p className="text-xs font-bold mb-2" style={{ color: 'var(--text-secondary)' }}>Key Findings</p>
                  <div className="space-y-2">
                    {Object.entries(economic_overview.key_findings).map(([key, value], i) => (
                      <div key={key} className="paper-card animate-signalReveal" style={{ animationDelay: `${i * 0.1}s` }}>
                        <div className={`paper-card-accent ${economic_overview.trend_direction.toLowerCase()}`} />
                        <div className="p-3">
                          <div className="flex items-start gap-2">
                            <span className="indicator-tag flex-shrink-0">{key}</span>
                            <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{value}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Correlations */}
              {correlationsCount > 0 && (
                <div className="mb-5">
                  <p className="text-xs font-bold mb-2" style={{ color: 'var(--text-secondary)' }}>Correlations Identified</p>
                  <div className="flex flex-wrap gap-2">
                    {economic_overview.correlations_identified.map((corr, i) => (
                      <span key={i} className="correlation-tag">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 17 9 11 13 15 21 7" />
                        </svg>
                        {corr}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Data Sources */}
              {sourcesCount > 0 && (
                <div>
                  <p className="text-xs font-bold mb-2" style={{ color: 'var(--text-secondary)' }}>Data Sources Used</p>
                  <div className="flex flex-wrap gap-2">
                    {economic_overview.data_sources_used.map((src, i) => (
                      <span key={i} className="source-badge">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7" />
                        </svg>
                        {src}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <EmptyState label="No economic overview available" />
          )}
        </div>

        {/* ── Recommendations Panel ── */}
        <div className="card animate-fadeSlideUp stagger-2">
          <h3 className="text-sm font-extrabold mb-4 flex items-center gap-2 heading-serif" style={{ color: 'var(--terracotta)' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Recommendations
            {recommendations && (
              <span className="ml-auto text-xs font-bold px-2 py-0.5 rounded-full"
                style={{ background: 'var(--terracotta-50)', color: 'var(--terracotta)' }}>
                {recommendations.length} recommendations
              </span>
            )}
          </h3>

          {recommendations && recommendations.length > 0 ? (
            <div className="space-y-4">
              {Object.entries(groupRecommendations(recommendations)).map(([tier, recs]) => (
                <div key={tier}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`confidence-badge ${tier.toLowerCase()}`}>{tier} confidence</span>
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>({recs.length})</span>
                  </div>
                  <div className="space-y-2">
                    {recs.map((rec, i) => {
                      const tierLevel = rec.confidence >= 0.8 ? 'high' : rec.confidence >= 0.5 ? 'medium' : 'low';
                      return (
                        <div key={i} className={`recommendation-card ${tierLevel} animate-signalReveal`}
                          style={{ animationDelay: `${i * 0.1}s` }}>
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-xs font-bold heading-serif" style={{ color: 'var(--charcoal)' }}>{rec.title}</span>
                              </div>
                              <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{rec.rationale}</p>
                            </div>
                          </div>

                          {/* Confidence */}
                          <div className="mb-2">
                            <span className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>Confidence</span>
                            <ConfidenceBar value={rec.confidence} />
                          </div>

                          {/* Timeframe */}
                          <div className="flex items-center gap-2">
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--navy-500)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <circle cx="12" cy="12" r="10" />
                              <polyline points="12 6 12 12 16 14" />
                            </svg>
                            <span className="text-xs" style={{ color: 'var(--navy-500)' }}>{rec.timeframe}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState label="No recommendations generated" />
          )}
        </div>
      </div>

      {/* ── Summary ── */}
      {result.summary && (
        <div className="card animate-fadeSlideUp stagger-3" style={{ borderLeft: '4px solid var(--navy-800)' }}>
          <h3 className="text-sm font-extrabold mb-2 flex items-center gap-2 heading-serif" style={{ color: 'var(--charcoal)' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--navy-800)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 6h16M4 12h16M4 18h7" />
            </svg>
            Research Summary
          </h3>
          <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{result.summary}</p>
        </div>
      )}

      {/* ── Raw Analysis ── */}
      {Object.keys(result.raw_analysis).length > 0 && (
        <div className="card animate-fadeSlideUp stagger-4">
          <button
            onClick={() => setRawExpanded(!rawExpanded)}
            className="w-full flex items-center justify-between text-sm font-bold"
            style={{ color: 'var(--text-secondary)' }}
          >
            <span className="flex items-center gap-2">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="16 18 22 12 16 6" />
                <polyline points="8 6 2 12 8 18" />
              </svg>
              Raw Agent Analysis
            </span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              style={{ transform: rawExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease' }}>
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          {rawExpanded && (
            <pre className="mt-4 p-4 rounded-xl text-xs overflow-x-auto"
              style={{ background: '#F8FAFC', color: 'var(--text-secondary)', fontFamily: 'ui-monospace, monospace' }}>
              {JSON.stringify(result.raw_analysis, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="text-center py-6">
      <div className="w-10 h-10 rounded-full mx-auto mb-2 flex items-center justify-center" style={{ background: 'var(--stone-100)' }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#A8A29E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="8" y1="15" x2="16" y2="15" />
          <line x1="9" y1="9" x2="9.01" y2="9" />
          <line x1="15" y1="9" x2="15.01" y2="9" />
        </svg>
      </div>
      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{label}</p>
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
