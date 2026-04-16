// @ts-nocheck
import { useState } from 'react';
import type { AdvisoryResponse, Recommendation } from '../types';

interface Props {
  result: AdvisoryResponse;
}

/* ── Pie chart colors for asset allocation ── */
const allocationColors = ['#064E3B', '#065F46', '#059669', '#10B981', '#D4A017', '#FCD34D', '#6B7280', '#9CA3AF'];

/* ── Helper: Radial progress circle ── */
function RadialProgress({ value, size = 72, stroke = 6, color = '#065F46' }: { value: number; size?: number; stroke?: number; color?: string }) {
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

/* ── Helper: Performance bar ── */
function PerformanceBar({ value, label }: { value: number; label: string }) {
  const color = value >= 30 ? '#064E3B' : value >= 15 ? '#059669' : value >= 5 ? '#D4A017' : '#6B7280';
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs font-semibold w-28 truncate" style={{ color: 'var(--text-secondary)' }}>{label}</span>
      <div className="performance-bar flex-1">
        <div className="performance-bar-fill" style={{ width: `${Math.min(value, 100)}%`, background: `linear-gradient(90deg, ${color}, ${color}88)` }} />
      </div>
      <span className="text-xs font-bold" style={{ color, minWidth: '36px', textAlign: 'right' }}>{value}%</span>
    </div>
  );
}

/* ── Helper: Risk level indicator ── */
function RiskLevelIndicator({ level }: { level: string }) {
  const normalized = level.toLowerCase().replace(/_/g, ' ');
  const levels = ['conservative', 'moderate', 'aggressive', 'very aggressive'];
  const activeIndex = levels.indexOf(normalized);
  const colors = ['#059669', '#D4A017', '#EA580C', '#EF4444'];
  const bgColors = ['#ECFDF5', '#FEFCE8', '#FFF7ED', '#FEF2F2'];

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1">
        {levels.map((l, i) => (
          <div key={l} className="flex-1">
            <div
              className="h-3 rounded-full transition-all duration-500"
              style={{
                background: i <= activeIndex ? colors[activeIndex] : '#E5E7EB',
                opacity: i <= activeIndex ? 1 : 0.3,
              }}
            />
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between">
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Conservative</span>
        <span className="text-xs font-bold px-2 py-0.5 rounded-full"
          style={{ background: bgColors[activeIndex] || '#F3F4F6', color: colors[activeIndex] || '#6B7280' }}>
          {normalized.charAt(0).toUpperCase() + normalized.slice(1)}
        </span>
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Aggressive</span>
      </div>
    </div>
  );
}

/* ── Helper: Priority sorting ── */
function sortByPriority(recs: Recommendation[]): Recommendation[] {
  const order: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  return [...recs].sort((a, b) => (order[a.priority] ?? 3) - (order[b.priority] ?? 3));
}

function ResultsPanelInternal({ result }: Props) {
  const [rawExpanded, setRawExpanded] = useState(false);
  const { portfolio_analysis, recommendations } = result;

  /* ── Build allocation entries ── */
  const allocationEntries = portfolio_analysis
    ? Object.entries(portfolio_analysis.asset_allocation).sort((a, b) => b[1] - a[1])
    : [];

  /* ── Build conic-gradient for pie chart ── */
  let cumulative = 0;
  const conicStops = allocationEntries.map(([, pct], i) => {
    const start = cumulative;
    cumulative += pct;
    return `${allocationColors[i % allocationColors.length]} ${start}% ${cumulative}%`;
  }).join(', ');

  const totalAllocation = allocationEntries.reduce((sum, [, pct]) => sum + pct, 0);

  return (
    <div className="space-y-6 animate-fadeSlideUp">

      {/* ── Advisory Header ── */}
      <div className="card flex items-center justify-between" style={{ borderTop: '3px solid var(--forest-800)' }}>
        <div>
          <h2 className="text-lg heading-serif" style={{ color: 'var(--charcoal)' }}>Advisory Result</h2>
          <div className="flex items-center gap-4 mt-1">
            <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
              ID: {result.advisory_id}
            </span>
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {new Date(result.timestamp).toLocaleString()}
            </span>
          </div>
        </div>
        <div className="text-xs font-bold px-3 py-1.5 rounded-full"
          style={{ background: 'var(--forest-50)', color: 'var(--forest-800)' }}>
          {result.client_id}
        </div>
      </div>

      {/* ── Two-Column Layout: Portfolio Analysis + Recommendations ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* ── Portfolio Analysis Panel ── */}
        <div className="card animate-fadeSlideUp stagger-1">
          <h3 className="text-sm font-extrabold mb-4 flex items-center gap-2" style={{ color: 'var(--forest-800)' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            Portfolio Analysis
          </h3>

          {portfolio_analysis ? (
            <>
              {/* Risk Level */}
              <div className="mb-5 p-3 rounded-xl" style={{ background: 'var(--warm-gray-100)' }}>
                <p className="text-xs font-bold mb-2" style={{ color: 'var(--text-secondary)' }}>Risk Level</p>
                <RiskLevelIndicator level={portfolio_analysis.risk_level} />
              </div>

              {/* Asset Allocation Pie Chart + Legend */}
              <div className="mb-5">
                <p className="text-xs font-bold mb-3" style={{ color: 'var(--text-secondary)' }}>Asset Allocation</p>
                <div className="flex items-center gap-6">
                  {/* Pie Chart */}
                  <div className="flex-shrink-0 animate-pieReveal">
                    <div className="pie-chart" style={{ background: allocationEntries.length > 0 ? `conic-gradient(${conicStops})` : '#E5E7EB' }}>
                      <div className="pie-chart-center">
                        <div className="text-center">
                          <div className="text-sm font-bold" style={{ color: 'var(--forest-800)' }}>{allocationEntries.length}</div>
                          <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Classes</div>
                        </div>
                      </div>
                    </div>
                  </div>
                  {/* Legend + bars */}
                  <div className="flex-1 space-y-2">
                    {allocationEntries.map(([name, pct]) => (
                      <PerformanceBar key={name} value={pct} label={name} />
                    ))}
                    {totalAllocation > 0 && (
                      <div className="pt-2 border-t" style={{ borderColor: 'var(--warm-gray-200)' }}>
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold" style={{ color: 'var(--text-secondary)' }}>Total</span>
                          <RadialProgress
                            value={Math.min(totalAllocation, 100)}
                            size={48}
                            stroke={4}
                            color={totalAllocation === 100 ? '#059669' : '#D4A017'}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Performance Summary */}
              {portfolio_analysis.performance_summary && (
                <div className="mb-5 p-3 rounded-xl" style={{ background: 'var(--forest-50)' }}>
                  <p className="text-xs font-bold mb-1" style={{ color: 'var(--forest-800)' }}>Performance Summary</p>
                  <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                    {portfolio_analysis.performance_summary}
                  </p>
                </div>
              )}

              {/* Rebalancing Indicator */}
              <div className="flex items-center gap-3 mb-5 p-3 rounded-xl" style={{ background: portfolio_analysis.rebalancing_needed ? '#FEFCE8' : 'var(--forest-50)' }}>
                <div className="w-8 h-8 rounded-full flex items-center justify-center"
                  style={{ background: portfolio_analysis.rebalancing_needed ? '#FEF9C3' : '#D1FAE5' }}>
                  {portfolio_analysis.rebalancing_needed ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#D4A017" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </div>
                <div>
                  <span className="text-xs font-bold" style={{ color: 'var(--text-secondary)' }}>Rebalancing Status</span>
                  <div className="mt-0.5">
                    <span className={`risk-badge ${portfolio_analysis.rebalancing_needed ? 'moderate' : 'conservative'}`}>
                      {portfolio_analysis.rebalancing_needed ? 'Rebalancing Recommended' : 'Portfolio Balanced'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Concentration Risks */}
              {portfolio_analysis.concentration_risks.length > 0 && (
                <div>
                  <p className="text-xs font-bold mb-2" style={{ color: 'var(--text-secondary)' }}>Concentration Risks</p>
                  <div className="space-y-2">
                    {portfolio_analysis.concentration_risks.map((risk, i) => (
                      <div key={i} className="flex items-start gap-2 p-2 rounded-lg animate-signalReveal"
                        style={{ background: '#FEF2F2', animationDelay: `${i * 0.1}s` }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 mt-0.5">
                          <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        <p className="text-xs leading-relaxed" style={{ color: '#991B1B' }}>{risk}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <EmptyState label="No portfolio analysis available" />
          )}
        </div>

        {/* ── Recommendations Panel ── */}
        <div className="card animate-fadeSlideUp stagger-2">
          <h3 className="text-sm font-extrabold mb-4 flex items-center gap-2" style={{ color: '#92400E' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            Recommendations
            {recommendations && (
              <span className="ml-auto text-xs font-bold px-2 py-0.5 rounded-full"
                style={{ background: 'var(--gold-50)', color: 'var(--gold-600)' }}>
                {recommendations.length} actions
              </span>
            )}
          </h3>

          {recommendations && recommendations.length > 0 ? (
            <div className="space-y-3">
              {sortByPriority(recommendations).map((rec, i) => (
                <div key={i} className={`recommendation-card ${rec.priority.toLowerCase()} animate-signalReveal`}
                  style={{ animationDelay: `${i * 0.1}s` }}>
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-bold" style={{ color: 'var(--charcoal)' }}>{rec.action}</span>
                        <span className={`priority-badge ${rec.priority.toLowerCase()}`}>{rec.priority}</span>
                      </div>
                      <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{rec.rationale}</p>
                    </div>
                  </div>

                  {/* Asset Class Tag */}
                  {rec.asset_class && (
                    <div className="flex items-center gap-2 mt-2">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--forest-600)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 2L2 7l10 5 10-5-10-5z" />
                      </svg>
                      <span className="allocation-tag">{rec.asset_class}</span>
                    </div>
                  )}
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
        <div className="card animate-fadeSlideUp stagger-3" style={{ borderLeft: '4px solid var(--forest-800)' }}>
          <h3 className="text-sm font-extrabold mb-2 flex items-center gap-2" style={{ color: 'var(--charcoal)' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--forest-800)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 6h16M4 12h16M4 18h7" />
            </svg>
            Advisory Summary
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
      <div className="w-10 h-10 rounded-full mx-auto mb-2 flex items-center justify-center" style={{ background: 'var(--warm-gray-100)' }}>
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
