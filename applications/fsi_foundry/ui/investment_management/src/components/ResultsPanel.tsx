// @ts-nocheck
import { useState } from 'react';
import type { ManagementResponse, Recommendation, TradeRecommendation } from '../types';

interface Props {
  result: ManagementResponse;
}

/* ── Helper: Radial progress circle ── */
function RadialProgress({ value, size = 72, stroke = 6, color = '#0D9488' }: { value: number; size?: number; stroke?: number; color?: string }) {
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

/* ── Helper: Allocation bar with current vs target ── */
function AllocationBar({ current, target, label, color }: { current: number; target: number; label: string; color: string }) {
  const currentPct = Math.round(current * 100);
  const targetPct = Math.round(target * 100);
  const diff = currentPct - targetPct;
  return (
    <div className="mb-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-bold" style={{ color: 'var(--text-secondary)' }}>{label}</span>
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono" style={{ color }}>{currentPct}%</span>
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>/</span>
          <span className="text-xs font-mono" style={{ color: 'var(--slate-400)' }}>{targetPct}%</span>
          <span className={`text-xs font-bold ${diff > 0 ? 'text-amber-600' : diff < 0 ? 'text-rose-500' : 'text-teal-600'}`}>
            {diff > 0 ? `+${diff}` : diff}%
          </span>
        </div>
      </div>
      <div className="allocation-bar relative">
        <div className="allocation-bar-fill" style={{ width: `${currentPct}%`, background: `linear-gradient(90deg, ${color}, ${color}88)` }} />
        <div className="drift-meter-target" style={{ left: `${targetPct}%` }} />
      </div>
    </div>
  );
}

/* ── Helper: Drift meter gauge ── */
function DriftMeter({ driftPct }: { driftPct: number }) {
  const capped = Math.min(driftPct, 15);
  const widthPct = (capped / 15) * 100;
  const color = driftPct <= 2 ? '#0D9488' : driftPct <= 5 ? '#F59E0B' : '#E11D48';
  const label = driftPct <= 2 ? 'Within Tolerance' : driftPct <= 5 ? 'Approaching Limit' : 'Rebalance Required';
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-bold" style={{ color: 'var(--text-secondary)' }}>Portfolio Drift</span>
        <span className="text-xs font-bold" style={{ color }}>{driftPct.toFixed(1)}%</span>
      </div>
      <div className="drift-meter">
        <div className="drift-meter-fill" style={{ width: `${widthPct}%`, background: `linear-gradient(90deg, ${color}, ${color}66)` }} />
        {/* Threshold markers */}
        <div className="drift-meter-target" style={{ left: `${(2 / 15) * 100}%`, background: '#0D9488' }} />
        <div className="drift-meter-target" style={{ left: `${(5 / 15) * 100}%`, background: '#F59E0B' }} />
        <div className="drift-meter-target" style={{ left: `${(10 / 15) * 100}%`, background: '#E11D48' }} />
      </div>
      <div className="flex items-center justify-between mt-1">
        <span className="text-xs" style={{ color }}>{label}</span>
        <div className="flex items-center gap-3">
          <span className="text-xs" style={{ color: '#0D9488' }}>2%</span>
          <span className="text-xs" style={{ color: '#F59E0B' }}>5%</span>
          <span className="text-xs" style={{ color: '#E11D48' }}>10%</span>
        </div>
      </div>
    </div>
  );
}

/* ── Helper: Attribution chart (horizontal bars, positive/negative) ── */
function AttributionChart({ factors }: { factors: Record<string, number> }) {
  const entries = Object.entries(factors);
  const maxAbs = Math.max(...entries.map(([, v]) => Math.abs(v)), 1);
  const colors = ['#0D9488', '#7C3AED', '#F59E0B', '#E11D48', '#64748B', '#0F766E'];

  return (
    <div className="space-y-2.5">
      {entries.map(([key, value], i) => {
        const pct = (Math.abs(value) / maxAbs) * 100;
        const isPositive = value >= 0;
        const color = colors[i % colors.length];
        return (
          <div key={key} className="attribution-bar animate-signalReveal" style={{ animationDelay: `${i * 0.1}s` }}>
            <span className="attribution-bar-label">{key}</span>
            <div className="attribution-bar-track">
              <div
                className="attribution-bar-fill"
                style={{
                  width: `${Math.max(pct, 8)}%`,
                  background: isPositive
                    ? `linear-gradient(90deg, ${color}20, ${color})`
                    : `linear-gradient(90deg, ${color}20, ${color})`,
                  opacity: isPositive ? 1 : 0.7,
                }}
              >
                <span className="attribution-bar-value" style={{ color: pct < 20 ? color : 'white' }}>
                  {isPositive ? '+' : ''}{(value * 100).toFixed(1)}%
                </span>
              </div>
            </div>
            <span className={`text-xs font-bold ${isPositive ? '' : ''}`} style={{ color, minWidth: '36px', textAlign: 'right' }}>
              {isPositive ? '+' : ''}{(value * 100).toFixed(1)}%
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* ── Helper: Confidence bar ── */
function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color = pct >= 80 ? '#0D9488' : pct >= 60 ? '#7C3AED' : pct >= 40 ? '#F59E0B' : '#64748B';
  return (
    <div className="flex items-center gap-2">
      <div className="allocation-bar flex-1" style={{ height: '6px' }}>
        <div className="allocation-bar-fill" style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${color}, ${color}88)` }} />
      </div>
      <span className="text-xs font-bold" style={{ color, minWidth: '32px' }}>{pct}%</span>
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

/* ── Helper: Trade recommendation card ── */
function TradeCard({ trade, index }: { trade: TradeRecommendation; index: number }) {
  const actionColor = trade.action === 'BUY' ? '#0D9488' : trade.action === 'SELL' ? '#E11D48' : '#64748B';
  const currentPct = Math.round(trade.weight_current * 100);
  const targetPct = Math.round(trade.weight_target * 100);
  const diff = targetPct - currentPct;

  return (
    <div className={`rebalance-card ${trade.action.toLowerCase()} animate-signalReveal`}
      style={{ animationDelay: `${index * 0.1}s` }}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className={`trade-badge ${trade.action.toLowerCase()}`}>
            {trade.action === 'BUY' && (
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" />
              </svg>
            )}
            {trade.action === 'SELL' && (
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" /><polyline points="19 12 12 19 5 12" />
              </svg>
            )}
            {trade.action === 'HOLD' && (
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            )}
            {trade.action}
          </span>
          <span className="asset-tag">{trade.asset}</span>
        </div>
        <span className="text-xs font-bold" style={{ color: actionColor }}>
          {diff > 0 ? '+' : ''}{diff}%
        </span>
      </div>

      {/* Weight bar visualization */}
      <div className="mb-2">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Current: {currentPct}%</span>
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Target: {targetPct}%</span>
        </div>
        <div className="allocation-bar relative">
          <div className="allocation-bar-fill" style={{
            width: `${currentPct}%`,
            background: `linear-gradient(90deg, ${actionColor}40, ${actionColor})`,
          }} />
          <div className="drift-meter-target" style={{ left: `${targetPct}%` }} />
        </div>
      </div>

      <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{trade.rationale}</p>
    </div>
  );
}

function ResultsPanelInternal({ result }: Props) {
  const [rawExpanded, setRawExpanded] = useState(false);
  const { portfolio_analysis, recommendations } = result;

  const allocationScore = portfolio_analysis ? Math.round(portfolio_analysis.allocation_score * 100) : 0;
  const driftPct = portfolio_analysis?.drift_pct ?? 0;
  const tradeCount = portfolio_analysis?.trade_recommendations.length ?? 0;
  const factorCount = portfolio_analysis ? Object.keys(portfolio_analysis.attribution_factors).length : 0;

  const scoreColor = allocationScore >= 80 ? '#0D9488' : allocationScore >= 60 ? '#7C3AED' : allocationScore >= 40 ? '#F59E0B' : '#E11D48';
  const urgencyLevel = portfolio_analysis?.rebalance_urgency.toLowerCase() ?? 'low';

  return (
    <div className="space-y-6 animate-fadeSlideUp">

      {/* ── Assessment Header ── */}
      <div className="card flex items-center justify-between" style={{ borderTop: '3px solid var(--teal-600)' }}>
        <div>
          <h2 className="text-lg font-extrabold heading-dash" style={{ color: 'var(--charcoal)' }}>Assessment Result</h2>
          <div className="flex items-center gap-4 mt-1">
            <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
              ID: {result.assessment_id}
            </span>
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {new Date(result.timestamp).toLocaleString()}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-xs font-bold px-3 py-1.5 rounded-full"
            style={{ background: 'var(--teal-50)', color: 'var(--teal-700)' }}>
            {result.entity_id}
          </div>
          {portfolio_analysis && (
            <span className={`urgency-badge ${urgencyLevel}`}>
              {portfolio_analysis.rebalance_urgency} urgency
            </span>
          )}
        </div>
      </div>

      {/* ── Top Metrics Row ── */}
      {portfolio_analysis && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 animate-fadeSlideUp stagger-1">
          {/* Allocation Score */}
          <div className="metric-card">
            <div className="metric-card-accent optimal" />
            <div className="p-4 flex items-center gap-4">
              <RadialProgress value={allocationScore} size={64} stroke={5} color={scoreColor} />
              <div>
                <div className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>Allocation Score</div>
                <div className="text-lg font-extrabold" style={{ color: scoreColor }}>{allocationScore}/100</div>
              </div>
            </div>
          </div>

          {/* Portfolio Drift */}
          <div className="metric-card">
            <div className={`metric-card-accent ${driftPct <= 2 ? 'optimal' : driftPct <= 5 ? 'warning' : 'critical'}`} />
            <div className="p-4">
              <div className="text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Portfolio Drift</div>
              <div className="text-2xl font-extrabold" style={{ color: driftPct <= 2 ? '#0D9488' : driftPct <= 5 ? '#F59E0B' : '#E11D48' }}>
                {driftPct.toFixed(1)}%
              </div>
              <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {driftPct <= 2 ? 'Within tolerance' : driftPct <= 5 ? 'Monitor closely' : 'Action required'}
              </div>
            </div>
          </div>

          {/* Risk Profile */}
          <div className="metric-card">
            <div className="metric-card-accent neutral" />
            <div className="p-4">
              <div className="text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Risk Profile</div>
              <span className={`risk-badge ${portfolio_analysis.risk_profile.toLowerCase()}`}>
                {portfolio_analysis.risk_profile.replace('_', ' ')}
              </span>
              <div className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>
                {factorCount} attribution factors
              </div>
            </div>
          </div>

          {/* Trade Actions */}
          <div className="metric-card">
            <div className={`metric-card-accent ${urgencyLevel === 'critical' || urgencyLevel === 'high' ? 'critical' : urgencyLevel === 'medium' ? 'warning' : 'optimal'}`} />
            <div className="p-4">
              <div className="text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Trade Actions</div>
              <div className="text-2xl font-extrabold" style={{ color: 'var(--violet-600)' }}>{tradeCount}</div>
              <div className="text-xs" style={{ color: 'var(--text-muted)' }}>recommended trades</div>
            </div>
          </div>
        </div>
      )}

      {/* ── Two-Column Layout: Portfolio Analysis + Recommendations ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* ── Portfolio Analysis Panel ── */}
        <div className="space-y-6">

          {/* Drift Meter */}
          {portfolio_analysis && (
            <div className="card animate-fadeSlideUp stagger-1">
              <h3 className="text-sm font-extrabold mb-4 flex items-center gap-2 heading-dash" style={{ color: 'var(--teal-600)' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                </svg>
                Drift Analysis
              </h3>
              <DriftMeter driftPct={driftPct} />
            </div>
          )}

          {/* Trade Recommendations / Rebalance Cards */}
          {portfolio_analysis && portfolio_analysis.trade_recommendations.length > 0 && (
            <div className="card animate-fadeSlideUp stagger-2">
              <h3 className="text-sm font-extrabold mb-4 flex items-center gap-2 heading-dash" style={{ color: 'var(--violet-600)' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Rebalance Trades
                <span className="ml-auto text-xs font-bold px-2 py-0.5 rounded-full"
                  style={{ background: 'var(--violet-50)', color: 'var(--violet-600)' }}>
                  {tradeCount} trades
                </span>
              </h3>
              <div className="space-y-3">
                {portfolio_analysis.trade_recommendations.map((trade, i) => (
                  <TradeCard key={i} trade={trade} index={i} />
                ))}
              </div>
            </div>
          )}

          {/* Performance Attribution Chart */}
          {portfolio_analysis && factorCount > 0 && (
            <div className="card animate-fadeSlideUp stagger-3">
              <h3 className="text-sm font-extrabold mb-4 flex items-center gap-2 heading-dash" style={{ color: 'var(--amber-600)' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                Performance Attribution
                <span className="ml-auto text-xs font-bold px-2 py-0.5 rounded-full"
                  style={{ background: 'var(--amber-50)', color: 'var(--amber-600)' }}>
                  {factorCount} factors
                </span>
              </h3>
              <AttributionChart factors={portfolio_analysis.attribution_factors} />
            </div>
          )}
        </div>

        {/* ── Recommendations Panel ── */}
        <div className="card animate-fadeSlideUp stagger-2" style={{ alignSelf: 'start' }}>
          <h3 className="text-sm font-extrabold mb-4 flex items-center gap-2 heading-dash" style={{ color: 'var(--teal-600)' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Recommendations
            {recommendations && (
              <span className="ml-auto text-xs font-bold px-2 py-0.5 rounded-full"
                style={{ background: 'var(--teal-50)', color: 'var(--teal-700)' }}>
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
                                <span className="text-xs font-bold heading-dash" style={{ color: 'var(--charcoal)' }}>{rec.title}</span>
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
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--teal-500)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <circle cx="12" cy="12" r="10" />
                              <polyline points="12 6 12 12 16 14" />
                            </svg>
                            <span className="text-xs" style={{ color: 'var(--teal-600)' }}>{rec.timeframe}</span>
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
        <div className="card animate-fadeSlideUp stagger-3" style={{ borderLeft: '4px solid var(--teal-600)' }}>
          <h3 className="text-sm font-extrabold mb-2 flex items-center gap-2 heading-dash" style={{ color: 'var(--charcoal)' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--teal-600)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 6h16M4 12h16M4 18h7" />
            </svg>
            Assessment Summary
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
              style={{ background: 'var(--slate-50)', color: 'var(--text-secondary)', fontFamily: 'ui-monospace, monospace' }}>
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
