// @ts-nocheck
import { useState } from 'react';
import type { MemoResponse, Recommendation, KeyRatio } from '../types';

interface Props {
  result: MemoResponse;
}

/* ── Helper: Radial progress circle ── */
function RadialProgress({ value, size = 72, stroke = 6, color = '#2563EB' }: { value: number; size?: number; stroke?: number; color?: string }) {
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
  const color = pct >= 80 ? '#059669' : pct >= 60 ? '#2563EB' : pct >= 40 ? '#D97706' : '#64748B';
  return (
    <div className="flex items-center gap-2">
      <div className="confidence-bar flex-1">
        <div className="confidence-bar-fill" style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${color}, ${color}88)` }} />
      </div>
      <span className="text-xs font-bold" style={{ color, minWidth: '32px' }}>{pct}%</span>
    </div>
  );
}

/* ── Helper: Rating badge class ── */
function ratingClass(rating: string): string {
  const r = rating.replace(/[+-]/g, '').toUpperCase();
  if (r === 'AAA' || r === 'AA') return 'aaa';
  if (r === 'A' || r === 'BBB') return 'a';
  if (r === 'BB' || r === 'B') return 'bb';
  return 'ccc';
}

/* ── Helper: Rating color ── */
function ratingColor(rating: string): string {
  const r = rating.replace(/[+-]/g, '').toUpperCase();
  if (r === 'AAA' || r === 'AA') return '#059669';
  if (r === 'A' || r === 'BBB') return '#2563EB';
  if (r === 'BB' || r === 'B') return '#D97706';
  return '#DC2626';
}

/* ── Helper: Ratio status icon ── */
function RatioStatusIcon({ status }: { status: string }) {
  if (status === 'strong') {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    );
  }
  if (status === 'adequate') {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <line x1="5" y1="12" x2="19" y2="12" />
        <circle cx="12" cy="12" r="10" />
      </svg>
    );
  }
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  );
}

/* ── Helper: Ratio table ── */
function RatioTable({ ratios }: { ratios: KeyRatio[] }) {
  return (
    <div className="overflow-hidden rounded-xl border" style={{ borderColor: 'var(--slate-200)' }}>
      <table className="ratio-table">
        <thead>
          <tr>
            <th>Ratio</th>
            <th>Value</th>
            <th>Benchmark</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {ratios.map((ratio, i) => (
            <tr key={i}>
              <td className="font-semibold" style={{ color: 'var(--charcoal-900)' }}>{ratio.name}</td>
              <td className="font-bold font-mono" style={{ color: 'var(--charcoal-900)' }}>{ratio.value}</td>
              <td className="font-mono" style={{ color: 'var(--slate)' }}>{ratio.benchmark}</td>
              <td>
                <div className="flex items-center gap-1.5">
                  <RatioStatusIcon status={ratio.status} />
                  <span className={`ratio-status ${ratio.status}`}>{ratio.status}</span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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
  const { credit_analysis, recommendations } = result;

  const ratiosCount = credit_analysis?.key_ratios.length ?? 0;
  const riskCount = credit_analysis?.risk_factors.length ?? 0;
  const peerNotesCount = credit_analysis?.peer_comparison_notes.length ?? 0;
  const confidencePct = credit_analysis ? Math.round(credit_analysis.confidence_score * 100) : 0;

  return (
    <div className="space-y-6 animate-fadeSlideUp">

      {/* ── Memo Header ── */}
      <div className="card flex items-center justify-between" style={{ borderTop: '3px solid var(--charcoal-900)' }}>
        <div>
          <h2 className="text-lg font-extrabold heading-serif" style={{ color: 'var(--charcoal-900)' }}>Credit Research Memo</h2>
          <div className="flex items-center gap-4 mt-1">
            <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
              ID: {result.research_id}
            </span>
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {new Date(result.timestamp).toLocaleString()}
            </span>
            {credit_analysis && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded" style={{ background: 'var(--slate-100)', color: 'var(--slate)' }}>
                {credit_analysis.memo_format}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {credit_analysis && (
            <span className={`rating-badge ${ratingClass(credit_analysis.rating)}`}>
              {credit_analysis.rating}
            </span>
          )}
          <div className="text-xs font-bold px-3 py-1.5 rounded-full"
            style={{ background: 'var(--blue-50)', color: 'var(--blue)' }}>
            {result.entity_id}
          </div>
        </div>
      </div>

      {/* ── Two-Column Layout: Credit Analysis + Recommendations ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* ── Credit Analysis Panel ── */}
        <div className="card animate-fadeSlideUp stagger-1">
          <h3 className="text-sm font-extrabold mb-4 flex items-center gap-2 heading-serif" style={{ color: 'var(--blue)' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 3v18h18" />
              <path d="M7 16l4-8 4 4 4-12" />
            </svg>
            Credit Analysis
          </h3>

          {credit_analysis ? (
            <>
              {/* Rating + Confidence Row */}
              <div className="grid grid-cols-3 gap-3 mb-5">
                <div className="text-center p-3 rounded-xl" style={{ background: `${ratingColor(credit_analysis.rating)}10` }}>
                  <span className={`rating-badge ${ratingClass(credit_analysis.rating)}`} style={{ fontSize: '1.25rem' }}>
                    {credit_analysis.rating}
                  </span>
                  <div className="text-xs font-semibold mt-2" style={{ color: 'var(--text-muted)' }}>Credit Rating</div>
                </div>
                <div className="text-center p-3 rounded-xl" style={{ background: 'var(--blue-50)' }}>
                  <div className="flex justify-center">
                    <RadialProgress
                      value={confidencePct}
                      size={64}
                      stroke={5}
                      color={confidencePct >= 80 ? '#059669' : confidencePct >= 60 ? '#2563EB' : '#D97706'}
                    />
                  </div>
                  <div className="text-xs font-semibold mt-1" style={{ color: 'var(--text-muted)' }}>Confidence</div>
                </div>
                <div className="text-center p-3 rounded-xl" style={{ background: 'var(--amber-50)' }}>
                  <div className="text-2xl font-extrabold" style={{ color: 'var(--amber)' }}>{riskCount}</div>
                  <div className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>Risk Factors</div>
                </div>
              </div>

              {/* Key Ratios Table */}
              {ratiosCount > 0 && (
                <div className="mb-5">
                  <p className="text-xs font-bold mb-2 flex items-center gap-1.5" style={{ color: 'var(--text-secondary)' }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="18" height="18" rx="2" />
                      <path d="M3 9h18M9 3v18" />
                    </svg>
                    Key Financial Ratios
                  </p>
                  <RatioTable ratios={credit_analysis.key_ratios} />
                </div>
              )}

              {/* Risk Factors */}
              {riskCount > 0 && (
                <div className="mb-5">
                  <p className="text-xs font-bold mb-2" style={{ color: 'var(--text-secondary)' }}>Risk Factors</p>
                  <div className="space-y-2">
                    {credit_analysis.risk_factors.map((risk, i) => (
                      <div key={i} className="memo-card animate-signalReveal" style={{ animationDelay: `${i * 0.1}s` }}>
                        <div className="memo-card-accent default" />
                        <div className="p-3 flex items-start gap-2">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 mt-0.5">
                            <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                          </svg>
                          <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{risk}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Peer Comparison Notes */}
              {peerNotesCount > 0 && (
                <div>
                  <p className="text-xs font-bold mb-2" style={{ color: 'var(--text-secondary)' }}>Peer Comparison Notes</p>
                  <div className="flex flex-wrap gap-2">
                    {credit_analysis.peer_comparison_notes.map((note, i) => (
                      <span key={i} className="peer-tag">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
                          <circle cx="9" cy="7" r="4" />
                          <path d="M23 21v-2a4 4 0 00-3-3.87" />
                          <path d="M16 3.13a4 4 0 010 7.75" />
                        </svg>
                        {note}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <EmptyState label="No credit analysis available" />
          )}
        </div>

        {/* ── Recommendations Panel ── */}
        <div className="card animate-fadeSlideUp stagger-2">
          <h3 className="text-sm font-extrabold mb-4 flex items-center gap-2 heading-serif" style={{ color: 'var(--amber)' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Recommendations
            {recommendations && (
              <span className="ml-auto text-xs font-bold px-2 py-0.5 rounded-full"
                style={{ background: 'var(--amber-50)', color: 'var(--amber)' }}>
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
                                <span className="text-xs font-bold heading-serif" style={{ color: 'var(--charcoal-900)' }}>{rec.title}</span>
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
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--blue)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <circle cx="12" cy="12" r="10" />
                              <polyline points="12 6 12 12 16 14" />
                            </svg>
                            <span className="text-xs" style={{ color: 'var(--blue)' }}>{rec.timeframe}</span>
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
        <div className="card animate-fadeSlideUp stagger-3" style={{ borderLeft: '4px solid var(--charcoal-900)' }}>
          <h3 className="text-sm font-extrabold mb-2 flex items-center gap-2 heading-serif" style={{ color: 'var(--charcoal-900)' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--charcoal-900)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 6h16M4 12h16M4 18h7" />
            </svg>
            Memo Summary
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
      <div className="w-10 h-10 rounded-full mx-auto mb-2 flex items-center justify-center" style={{ background: 'var(--slate-100)' }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
