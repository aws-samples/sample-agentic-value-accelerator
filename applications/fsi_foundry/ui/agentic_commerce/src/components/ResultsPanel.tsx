// @ts-nocheck
import { useState } from 'react';
import type { CommerceResponse } from '../types';

interface Props {
  result: CommerceResponse;
}

/* ── Helper: Radial progress circle ── */
function RadialProgress({ value, size = 72, stroke = 6, color = '#E11D48' }: { value: number; size?: number; stroke?: number; color?: string }) {
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

/* ── Helper: Match score mini circle ── */
function MatchScoreCircle({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const radius = 18;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (pct / 100) * circumference;
  const color = pct >= 80 ? '#34D399' : pct >= 60 ? '#F59E0B' : '#EF4444';
  return (
    <div className="match-score">
      <svg width="48" height="48" viewBox="0 0 48 48">
        <circle cx="24" cy="24" r={radius} fill="none" stroke="#F1F5F9" strokeWidth="4" />
        <circle cx="24" cy="24" r={radius} fill="none" stroke={color} strokeWidth="4"
          strokeLinecap="round"
          style={{ strokeDasharray: circumference, strokeDashoffset: offset, transition: 'stroke-dashoffset 1s ease-out' }} />
      </svg>
      <span className="match-score-value">{pct}%</span>
    </div>
  );
}

/* ── Helper: Channel badge with icon ── */
function ChannelBadge({ channel }: { channel: string }) {
  const ch = channel.toLowerCase();
  const cls = ch.includes('digital') ? 'digital' : ch.includes('branch') ? 'branch' : ch.includes('phone') ? 'phone' : 'digital';
  const iconPaths: Record<string, string> = {
    digital: 'M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
    branch: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0H5m14 0h2m-16 0H3m5-10h4',
    phone: 'M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z',
  };
  return (
    <span className={`channel-badge ${cls}`}>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d={iconPaths[cls] || iconPaths.digital} />
      </svg>
      {channel}
    </span>
  );
}

/* ── Helper: Status ribbon class ── */
function statusRibbonClass(status: string): string {
  switch (status) {
    case 'GENERATED': return 'generated';
    case 'APPROVED': return 'approved';
    case 'REJECTED': return 'rejected';
    case 'PENDING_REVIEW': return 'pending';
    default: return 'generated';
  }
}

function statusBadgeClass(status: string): string {
  return status.toLowerCase().replace(/_/g, '-');
}

function ResultsPanelInternal({ result }: Props) {
  const [rawExpanded, setRawExpanded] = useState(false);
  const { offer_result, fulfillment_result, match_result } = result;

  return (
    <div className="space-y-6 animate-fadeSlideUp">

      {/* ── Commerce Header ── */}
      <div className="card flex items-center justify-between" style={{ borderTop: '3px solid var(--rose-600)' }}>
        <div>
          <h2 className="text-lg font-extrabold" style={{ color: 'var(--charcoal)' }}>Commerce Result</h2>
          <div className="flex items-center gap-4 mt-1">
            <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
              ID: {result.commerce_id}
            </span>
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {new Date(result.timestamp).toLocaleString()}
            </span>
          </div>
        </div>
        <div className="text-xs font-bold px-3 py-1.5 rounded-full"
          style={{ background: 'var(--rose-50)', color: 'var(--rose-600)' }}>
          {result.customer_id}
        </div>
      </div>

      {/* ── 3-Card Layout ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ── Offer Result ── */}
        <div className="card animate-fadeSlideUp stagger-1 relative overflow-hidden">
          {offer_result && (
            <div className={`offer-ribbon ${statusRibbonClass(offer_result.status)}`}>
              {offer_result.status.replace(/_/g, ' ')}
            </div>
          )}
          <div className="pt-6">
            <h3 className="text-sm font-extrabold mb-4 flex items-center gap-2" style={{ color: 'var(--rose-600)' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 12v6a2 2 0 01-2 2H6a2 2 0 01-2-2v-6m16-4H4m16 0l-2-4H6L4 8" />
              </svg>
              Offers
            </h3>

            {offer_result ? (
              <>
                {/* Personalization Score */}
                <div className="flex items-center justify-center mb-4">
                  <div className="text-center">
                    <RadialProgress value={Math.round(offer_result.personalization_score * 100)} color="#E11D48" />
                    <p className="text-xs font-semibold mt-1" style={{ color: 'var(--text-muted)' }}>Personalization</p>
                  </div>
                </div>

                {/* Offer Cards */}
                <div className="space-y-2 mb-4">
                  {offer_result.offers.map((offer, i) => (
                    <div key={i} className="offer-card animate-matchReveal" style={{ animationDelay: `${i * 0.15}s` }}>
                      <div className="offer-card-header" style={{ height: '48px', background: `linear-gradient(135deg, #FB7185, #818CF8)` }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.7">
                          <path d="M20 12v6a2 2 0 01-2 2H6a2 2 0 01-2-2v-6m16-4H4" />
                        </svg>
                      </div>
                      <div className="offer-card-body py-2">
                        <p className="text-xs font-bold" style={{ color: 'var(--charcoal)' }}>{offer}</p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Notes */}
                {offer_result.notes.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs font-bold" style={{ color: 'var(--text-secondary)' }}>Notes</p>
                    {offer_result.notes.map((note, i) => (
                      <p key={i} className="text-xs pl-3 border-l-2" style={{ color: 'var(--text-muted)', borderColor: 'var(--rose-400)' }}>{note}</p>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <EmptyState label="No offer data" />
            )}
          </div>
        </div>

        {/* ── Fulfillment Result ── */}
        <div className="card animate-fadeSlideUp stagger-2">
          <h3 className="text-sm font-extrabold mb-4 flex items-center gap-2" style={{ color: '#059669' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Fulfillment
          </h3>

          {fulfillment_result ? (
            <>
              {/* Status + Channel */}
              <div className="flex items-center gap-3 mb-5">
                <span className={`status-badge ${statusBadgeClass(fulfillment_result.status)}`}>
                  {fulfillment_result.status.replace(/_/g, ' ')}
                </span>
                <ChannelBadge channel={fulfillment_result.channel} />
              </div>

              {/* Step Tracker */}
              {fulfillment_result.steps_completed.length > 0 && (
                <div className="mb-5">
                  <p className="text-xs font-bold mb-3" style={{ color: 'var(--text-secondary)' }}>Completion Steps</p>
                  <div className="fulfillment-tracker">
                    {fulfillment_result.steps_completed.map((step, i) => (
                      <div key={i} className="flex items-center flex-1">
                        <div className="fulfillment-step completed">
                          <div className="fulfillment-step-circle" style={{ animationDelay: `${i * 0.2}s` }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          </div>
                          <span className="fulfillment-step-label">{step}</span>
                        </div>
                        {i < fulfillment_result.steps_completed.length - 1 && (
                          <div className="fulfillment-connector completed" style={{ animationDelay: `${i * 0.2}s` }} />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Blockers */}
              {fulfillment_result.blockers.length > 0 && (
                <div>
                  <p className="text-xs font-bold mb-2" style={{ color: '#B91C1C' }}>Blockers</p>
                  <div className="space-y-1.5">
                    {fulfillment_result.blockers.map((blocker, i) => (
                      <div key={i} className="flex items-start gap-2 p-2 rounded-lg" style={{ background: '#FEF2F2' }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 flex-shrink-0">
                          <circle cx="12" cy="12" r="10" />
                          <line x1="12" y1="8" x2="12" y2="12" />
                          <line x1="12" y1="16" x2="12.01" y2="16" />
                        </svg>
                        <span className="text-xs font-medium" style={{ color: '#991B1B' }}>{blocker}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <EmptyState label="No fulfillment data" />
          )}
        </div>

        {/* ── Match Result ── */}
        <div className="card animate-fadeSlideUp stagger-3">
          <h3 className="text-sm font-extrabold mb-4 flex items-center gap-2" style={{ color: 'var(--indigo-600)' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            Product Matching
          </h3>

          {match_result ? (
            <>
              {/* Matched Products with Confidence */}
              <div className="space-y-3 mb-4">
                {match_result.matched_products.map((product, i) => {
                  const score = match_result.confidence_scores[product] ?? 0;
                  return (
                    <div key={i} className="p-3 rounded-xl border animate-matchReveal"
                      style={{ borderColor: '#E5E7EB', animationDelay: `${i * 0.15}s` }}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="product-tag">{product}</span>
                        <MatchScoreCircle value={score} />
                      </div>
                      {/* Confidence bar */}
                      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: '#F1F5F9' }}>
                        <div className="h-full rounded-full transition-all duration-1000"
                          style={{
                            width: `${Math.round(score * 100)}%`,
                            background: score >= 0.8
                              ? 'linear-gradient(90deg, #34D399, #6EE7B7)'
                              : score >= 0.6
                                ? 'linear-gradient(90deg, #F59E0B, #FBBF24)'
                                : 'linear-gradient(90deg, #EF4444, #FCA5A5)',
                          }} />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Recommendations */}
              {match_result.recommendations.length > 0 && (
                <div>
                  <p className="text-xs font-bold mb-2" style={{ color: 'var(--text-secondary)' }}>Recommendations</p>
                  <div className="space-y-1.5">
                    {match_result.recommendations.map((rec, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#818CF8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 flex-shrink-0">
                          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                        </svg>
                        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{rec}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <EmptyState label="No match data" />
          )}
        </div>
      </div>

      {/* ── Summary ── */}
      {result.summary && (
        <div className="card animate-fadeSlideUp stagger-4" style={{ borderLeft: '4px solid var(--rose-600)' }}>
          <h3 className="text-sm font-extrabold mb-2 flex items-center gap-2" style={{ color: 'var(--charcoal)' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--rose-600)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 6h16M4 12h16M4 18h7" />
            </svg>
            Summary
          </h3>
          <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{result.summary}</p>
        </div>
      )}

      {/* ── Raw Analysis ── */}
      {Object.keys(result.raw_analysis).length > 0 && (
        <div className="card animate-fadeSlideUp stagger-5">
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
      <div className="w-10 h-10 rounded-full mx-auto mb-2 flex items-center justify-center" style={{ background: '#F3F4F6' }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#A1A1AA" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
