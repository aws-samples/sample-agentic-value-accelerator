// @ts-nocheck
import { useState } from 'react';
import type { ScreeningResponse, RiskSignal } from '../types';

interface Props {
  result: ScreeningResponse;
}

/* ── Helper: Radial progress circle ── */
function RadialProgress({ value, size = 72, stroke = 6, color = '#4338CA' }: { value: number; size?: number; stroke?: number; color?: string }) {
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
  const color = pct >= 80 ? '#EF4444' : pct >= 60 ? '#F97316' : pct >= 40 ? '#F59E0B' : '#22C55E';
  return (
    <div className="flex items-center gap-2">
      <div className="confidence-bar flex-1">
        <div className="confidence-bar-fill" style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${color}, ${color}88)` }} />
      </div>
      <span className="text-xs font-bold" style={{ color, minWidth: '32px' }}>{pct}%</span>
    </div>
  );
}

/* ── Helper: Sentiment icon ── */
function SentimentIcon({ sentiment }: { sentiment: string }) {
  const s = sentiment.toLowerCase();
  if (s === 'negative') {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <path d="M16 16s-1.5-2-4-2-4 2-4 2" />
        <line x1="9" y1="9" x2="9.01" y2="9" />
        <line x1="15" y1="9" x2="15.01" y2="9" />
      </svg>
    );
  }
  if (s === 'positive') {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <path d="M8 14s1.5 2 4 2 4-2 4-2" />
        <line x1="9" y1="9" x2="9.01" y2="9" />
        <line x1="15" y1="9" x2="15.01" y2="9" />
      </svg>
    );
  }
  if (s === 'mixed') {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6366F1" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <line x1="8" y1="15" x2="16" y2="15" />
        <line x1="9" y1="9" x2="9.01" y2="9" />
        <line x1="15" y1="9" x2="15.01" y2="9" />
      </svg>
    );
  }
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="8" y1="15" x2="16" y2="15" />
      <line x1="9" y1="9" x2="9.01" y2="9" />
      <line x1="15" y1="9" x2="15.01" y2="9" />
    </svg>
  );
}

/* ── Helper: Risk signal severity icon ── */
function SeverityIcon({ severity }: { severity: string }) {
  const s = severity.toLowerCase();
  const color = s === 'critical' ? '#EF4444' : s === 'high' ? '#F97316' : s === 'medium' ? '#F59E0B' : '#22C55E';
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  );
}

/* ── Helper: Risk signal grouping ── */
function groupSignalsBySeverity(signals: RiskSignal[]): Record<string, RiskSignal[]> {
  const order = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
  const grouped: Record<string, RiskSignal[]> = {};
  for (const s of order) {
    const items = signals.filter((sig) => sig.severity === s);
    if (items.length > 0) grouped[s] = items;
  }
  return grouped;
}

function ResultsPanelInternal({ result }: Props) {
  const [rawExpanded, setRawExpanded] = useState(false);
  const { media_findings, risk_signals } = result;

  const adverseRatio = media_findings && media_findings.articles_screened > 0
    ? Math.round((media_findings.adverse_mentions / media_findings.articles_screened) * 100)
    : 0;

  return (
    <div className="space-y-6 animate-fadeSlideUp">

      {/* ── Screening Header ── */}
      <div className="card flex items-center justify-between" style={{ borderTop: '3px solid var(--indigo-700)' }}>
        <div>
          <h2 className="text-lg font-extrabold" style={{ color: 'var(--charcoal)' }}>Screening Result</h2>
          <div className="flex items-center gap-4 mt-1">
            <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
              ID: {result.screening_id}
            </span>
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {new Date(result.timestamp).toLocaleString()}
            </span>
          </div>
        </div>
        <div className="text-xs font-bold px-3 py-1.5 rounded-full"
          style={{ background: 'var(--indigo-50)', color: 'var(--indigo-700)' }}>
          {result.entity_id}
        </div>
      </div>

      {/* ── Two-Column Layout: Media Findings + Risk Signals ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* ── Media Findings Panel ── */}
        <div className="card animate-fadeSlideUp stagger-1">
          <h3 className="text-sm font-extrabold mb-4 flex items-center gap-2" style={{ color: 'var(--indigo-700)' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z" />
              <path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z" />
            </svg>
            Media Findings
          </h3>

          {media_findings ? (
            <>
              {/* Stats Row */}
              <div className="grid grid-cols-3 gap-3 mb-5">
                <div className="text-center p-3 rounded-xl" style={{ background: 'var(--indigo-50)' }}>
                  <div className="text-2xl font-extrabold" style={{ color: 'var(--indigo-700)' }}>{media_findings.articles_screened}</div>
                  <div className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>Articles Screened</div>
                </div>
                <div className="text-center p-3 rounded-xl" style={{ background: 'var(--red-50)' }}>
                  <div className="text-2xl font-extrabold" style={{ color: '#EF4444' }}>{media_findings.adverse_mentions}</div>
                  <div className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>Adverse Mentions</div>
                </div>
                <div className="flex flex-col items-center justify-center">
                  <RadialProgress
                    value={adverseRatio}
                    size={64}
                    stroke={5}
                    color={adverseRatio > 50 ? '#EF4444' : adverseRatio > 25 ? '#F97316' : '#22C55E'}
                  />
                  <div className="text-xs font-semibold mt-1" style={{ color: 'var(--text-muted)' }}>Adverse Rate</div>
                </div>
              </div>

              {/* Sentiment */}
              <div className="flex items-center gap-3 mb-5 p-3 rounded-xl" style={{ background: 'var(--neutral-100)' }}>
                <SentimentIcon sentiment={media_findings.sentiment} />
                <div>
                  <span className="text-xs font-bold" style={{ color: 'var(--text-secondary)' }}>Overall Sentiment</span>
                  <div className="mt-0.5">
                    <span className={`sentiment-badge ${media_findings.sentiment.toLowerCase()}`}>
                      {media_findings.sentiment}
                    </span>
                  </div>
                </div>
              </div>

              {/* Categories */}
              {media_findings.categories.length > 0 && (
                <div className="mb-5">
                  <p className="text-xs font-bold mb-2" style={{ color: 'var(--text-secondary)' }}>Categories</p>
                  <div className="flex flex-wrap gap-2">
                    {media_findings.categories.map((cat, i) => (
                      <span key={i} className="category-tag">{cat}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Key Findings */}
              {media_findings.key_findings.length > 0 && (
                <div className="mb-5">
                  <p className="text-xs font-bold mb-2" style={{ color: 'var(--text-secondary)' }}>Key Findings</p>
                  <div className="space-y-2">
                    {media_findings.key_findings.map((finding, i) => (
                      <div key={i} className="article-card animate-signalReveal" style={{ animationDelay: `${i * 0.1}s` }}>
                        <div className={`article-card-accent ${media_findings.sentiment.toLowerCase()}`} />
                        <div className="p-3 flex items-start gap-2">
                          <div className="feed-pulse negative mt-1.5 flex-shrink-0" />
                          <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{finding}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Sources */}
              {media_findings.sources.length > 0 && (
                <div>
                  <p className="text-xs font-bold mb-2" style={{ color: 'var(--text-secondary)' }}>Sources</p>
                  <div className="flex flex-wrap gap-2">
                    {media_findings.sources.map((src, i) => (
                      <span key={i} className="source-tag">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
                          <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
                        </svg>
                        {src}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <EmptyState label="No media findings available" />
          )}
        </div>

        {/* ── Risk Signals Panel ── */}
        <div className="card animate-fadeSlideUp stagger-2">
          <h3 className="text-sm font-extrabold mb-4 flex items-center gap-2" style={{ color: '#EA580C' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            Risk Signals
            {risk_signals && (
              <span className="ml-auto text-xs font-bold px-2 py-0.5 rounded-full"
                style={{ background: 'var(--coral-50)', color: 'var(--coral)' }}>
                {risk_signals.length} signals
              </span>
            )}
          </h3>

          {risk_signals && risk_signals.length > 0 ? (
            <div className="space-y-4">
              {Object.entries(groupSignalsBySeverity(risk_signals)).map(([severity, signals]) => (
                <div key={severity}>
                  <div className="flex items-center gap-2 mb-2">
                    <SeverityIcon severity={severity} />
                    <span className={`severity-badge ${severity.toLowerCase()}`}>{severity}</span>
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>({signals.length})</span>
                  </div>
                  <div className="space-y-2">
                    {signals.map((signal, i) => (
                      <div key={i} className={`risk-signal-card ${signal.severity.toLowerCase()} animate-signalReveal`}
                        style={{ animationDelay: `${i * 0.1}s` }}>
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-xs font-bold" style={{ color: 'var(--charcoal)' }}>{signal.signal_type}</span>
                            </div>
                            <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{signal.description}</p>
                          </div>
                        </div>

                        {/* Confidence */}
                        <div className="mb-2">
                          <span className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>Confidence</span>
                          <ConfidenceBar value={signal.confidence} />
                        </div>

                        {/* Entity Linkage */}
                        <div className="flex items-center gap-2 mb-2">
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--indigo-500)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
                            <circle cx="8.5" cy="7" r="4" />
                            <line x1="20" y1="8" x2="20" y2="14" />
                            <line x1="23" y1="11" x2="17" y2="11" />
                          </svg>
                          <span className="text-xs" style={{ color: 'var(--indigo-500)' }}>{signal.entity_linkage}</span>
                        </div>

                        {/* Source References */}
                        {signal.source_references.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {signal.source_references.map((ref, j) => (
                              <span key={j} className="source-tag">{ref}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState label="No risk signals detected" />
          )}
        </div>
      </div>

      {/* ── Summary ── */}
      {result.summary && (
        <div className="card animate-fadeSlideUp stagger-3" style={{ borderLeft: '4px solid var(--indigo-700)' }}>
          <h3 className="text-sm font-extrabold mb-2 flex items-center gap-2" style={{ color: 'var(--charcoal)' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--indigo-700)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 6h16M4 12h16M4 18h7" />
            </svg>
            Intelligence Summary
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
      <div className="w-10 h-10 rounded-full mx-auto mb-2 flex items-center justify-center" style={{ background: 'var(--neutral-100)' }}>
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
