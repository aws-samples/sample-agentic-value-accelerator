// @ts-nocheck
import { useState } from 'react';
import type { InsightsResponse, Recommendation, SignalItem, CrossAssetOpportunity, ScenarioOutcome } from '../types';

interface Props {
  result: InsightsResponse;
}

/* ── Helper: Radial progress circle ── */
function RadialProgress({ value, size = 72, stroke = 6, color = '#06B6D4' }: { value: number; size?: number; stroke?: number; color?: string }) {
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

/* ── Helper: Strength bar ── */
function StrengthBar({ value, color = '#06B6D4' }: { value: number; color?: string }) {
  const pct = Math.round(value * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="strength-bar flex-1">
        <div className="strength-bar-fill" style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${color}, ${color}88)` }} />
      </div>
      <span className="text-xs font-bold" style={{ color, minWidth: '32px' }}>{pct}%</span>
    </div>
  );
}

/* ── Helper: Confidence bar ── */
function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color = pct >= 80 ? '#06B6D4' : pct >= 60 ? '#D946EF' : pct >= 40 ? '#F59E0B' : '#737373';
  return (
    <div className="flex items-center gap-2">
      <div className="strength-bar flex-1" style={{ height: '6px' }}>
        <div className="strength-bar-fill" style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${color}, ${color}88)` }} />
      </div>
      <span className="text-xs font-bold" style={{ color, minWidth: '32px' }}>{pct}%</span>
    </div>
  );
}

/* ── Helper: Signal card ── */
function SignalCard({ signal, index }: { signal: SignalItem; index: number }) {
  const typeClass = signal.type.toLowerCase() as 'bullish' | 'bearish' | 'neutral';
  const strengthColor = signal.strength >= 0.7 ? '#22C55E' : signal.strength >= 0.4 ? '#F59E0B' : '#737373';

  return (
    <div className={`signal-card ${typeClass} animate-signalReveal`}
      style={{ animationDelay: `${index * 0.1}s` }}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className={`signal-badge ${typeClass}`}>
            {signal.type === 'BULLISH' && (
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" />
              </svg>
            )}
            {signal.type === 'BEARISH' && (
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" /><polyline points="19 12 12 19 5 12" />
              </svg>
            )}
            {signal.type === 'NEUTRAL' && (
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            )}
            {signal.type}
          </span>
          <span className="asset-tag">{signal.asset_class}</span>
        </div>
      </div>

      <h4 className="text-sm font-bold text-white mb-1">{signal.name}</h4>
      <p className="text-xs leading-relaxed mb-2" style={{ color: 'var(--text-secondary)' }}>{signal.description}</p>

      {/* Strength bar */}
      <div>
        <span className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>Signal Strength</span>
        <StrengthBar value={signal.strength} color={strengthColor} />
      </div>
    </div>
  );
}

/* ── Helper: Cross-Asset Opportunity card ── */
function OpportunityCard({ opp, index }: { opp: CrossAssetOpportunity; index: number }) {
  const dirClass = opp.direction.toLowerCase() as 'long' | 'short' | 'pair';
  const returnColor = opp.expected_return >= 0 ? '#22C55E' : '#EF4444';

  return (
    <div className={`opportunity-card ${dirClass} animate-signalReveal`}
      style={{ animationDelay: `${index * 0.1}s` }}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className={`direction-badge ${dirClass}`}>
            {opp.direction === 'LONG' && (
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" />
              </svg>
            )}
            {opp.direction === 'SHORT' && (
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" /><polyline points="19 12 12 19 5 12" />
              </svg>
            )}
            {opp.direction === 'PAIR' && (
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 7h12l-2 13H6L4 7h2" />
              </svg>
            )}
            {opp.direction}
          </span>
          <span className="asset-tag">{opp.pair}</span>
        </div>
        <span className="text-xs font-bold" style={{ color: returnColor }}>
          {opp.expected_return >= 0 ? '+' : ''}{(opp.expected_return * 100).toFixed(1)}%
        </span>
      </div>

      <p className="text-xs leading-relaxed mb-2" style={{ color: 'var(--text-secondary)' }}>{opp.rationale}</p>

      {/* Correlation bar */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>Correlation</span>
          <span className="text-xs font-bold" style={{ color: '#D946EF' }}>{opp.correlation.toFixed(2)}</span>
        </div>
        <div className="strength-bar">
          <div className="strength-bar-fill" style={{
            width: `${Math.abs(opp.correlation) * 100}%`,
            background: `linear-gradient(90deg, #D946EF, #D946EF88)`,
          }} />
        </div>
      </div>
    </div>
  );
}

/* ── Helper: Scenario Outcome card ── */
function ScenarioCard({ scenario, index }: { scenario: ScenarioOutcome; index: number }) {
  const impactClass = scenario.impact.toLowerCase() as 'high' | 'medium' | 'low';
  const moveColor = scenario.expected_move >= 0 ? '#22C55E' : '#EF4444';
  const likelihoodColor = scenario.likelihood >= 0.6 ? '#06B6D4' : scenario.likelihood >= 0.3 ? '#F59E0B' : '#737373';

  return (
    <div className={`scenario-card ${impactClass} animate-signalReveal`}
      style={{ animationDelay: `${index * 0.1}s` }}>
      <div className="flex items-center justify-between mb-2">
        <span className={`impact-badge ${impactClass}`}>
          {scenario.impact} impact
        </span>
        <span className="text-xs font-bold" style={{ color: moveColor }}>
          {scenario.expected_move >= 0 ? '+' : ''}{(scenario.expected_move * 100).toFixed(1)}%
        </span>
      </div>

      <h4 className="text-sm font-bold text-white mb-1">{scenario.scenario}</h4>
      <p className="text-xs leading-relaxed mb-3" style={{ color: 'var(--text-secondary)' }}>{scenario.description}</p>

      {/* Likelihood meter */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>Likelihood</span>
          <span className="text-xs font-bold" style={{ color: likelihoodColor }}>{Math.round(scenario.likelihood * 100)}%</span>
        </div>
        <div className="likelihood-meter">
          <div className="likelihood-meter-fill" style={{
            width: `${scenario.likelihood * 100}%`,
            background: `linear-gradient(90deg, ${likelihoodColor}, ${likelihoodColor}66)`,
          }} />
        </div>
      </div>
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
  const { insights_detail, recommendations } = result;

  const signalStrengthPct = insights_detail ? Math.round(insights_detail.signal_strength * 100) : 0;
  const confidencePct = insights_detail ? Math.round(insights_detail.confidence_score * 100) : 0;
  const scenarioLikelihoodPct = insights_detail ? Math.round(insights_detail.scenario_likelihood * 100) : 0;
  const signalsCount = insights_detail?.signals_identified.length ?? 0;
  const opportunitiesCount = insights_detail?.cross_asset_opportunities.length ?? 0;
  const scenariosCount = insights_detail?.scenario_outcomes.length ?? 0;

  const strengthColor = signalStrengthPct >= 70 ? '#22C55E' : signalStrengthPct >= 40 ? '#F59E0B' : '#737373';
  const confidenceColor = confidencePct >= 80 ? '#06B6D4' : confidencePct >= 60 ? '#D946EF' : confidencePct >= 40 ? '#F59E0B' : '#737373';

  return (
    <div className="space-y-6 animate-fadeSlideUp">

      {/* ── Assessment Header ── */}
      <div className="card flex items-center justify-between" style={{ borderTop: '3px solid #06B6D4' }}>
        <div>
          <h2 className="text-lg font-extrabold heading-dash text-white">Analysis Result</h2>
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
            style={{ background: 'rgba(6,182,212,0.12)', color: 'var(--cyan-400)' }}>
            {result.entity_id}
          </div>
        </div>
      </div>

      {/* ── Top Metrics Row ── */}
      {insights_detail && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 animate-fadeSlideUp stagger-1">
          {/* Signal Strength */}
          <div className="metric-card">
            <div className="metric-card-accent green" />
            <div className="p-4 flex items-center gap-4">
              <RadialProgress value={signalStrengthPct} size={64} stroke={5} color={strengthColor} />
              <div>
                <div className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>Signal Strength</div>
                <div className="text-lg font-extrabold" style={{ color: strengthColor }}>{signalStrengthPct}/100</div>
              </div>
            </div>
          </div>

          {/* Confidence Score */}
          <div className="metric-card">
            <div className="metric-card-accent cyan" />
            <div className="p-4 flex items-center gap-4">
              <RadialProgress value={confidencePct} size={64} stroke={5} color={confidenceColor} />
              <div>
                <div className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>Confidence</div>
                <div className="text-lg font-extrabold" style={{ color: confidenceColor }}>{confidencePct}/100</div>
              </div>
            </div>
          </div>

          {/* Scenario Likelihood */}
          <div className="metric-card">
            <div className="metric-card-accent magenta" />
            <div className="p-4">
              <div className="text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Scenario Likelihood</div>
              <div className="text-2xl font-extrabold" style={{ color: '#D946EF' }}>
                {scenarioLikelihoodPct}%
              </div>
              <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                top scenario probability
              </div>
            </div>
          </div>

          {/* Signal Count */}
          <div className="metric-card">
            <div className="metric-card-accent amber" />
            <div className="p-4">
              <div className="text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Signals Identified</div>
              <div className="text-2xl font-extrabold" style={{ color: '#F59E0B' }}>{signalsCount}</div>
              <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {opportunitiesCount} opportunities, {scenariosCount} scenarios
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Two-Column Layout: Signals + Scenarios / Opportunities + Recommendations ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* ── Left Column: Signals + Cross-Asset Opportunities ── */}
        <div className="space-y-6">

          {/* Signals */}
          {insights_detail && insights_detail.signals_identified.length > 0 && (
            <div className="card animate-fadeSlideUp stagger-1">
              <h3 className="text-sm font-extrabold mb-4 flex items-center gap-2 heading-dash" style={{ color: '#22C55E' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                </svg>
                Trading Signals
                <span className="ml-auto text-xs font-bold px-2 py-0.5 rounded-full"
                  style={{ background: 'rgba(34,197,94,0.12)', color: '#22C55E' }}>
                  {signalsCount} signals
                </span>
              </h3>
              <div className="space-y-3">
                {insights_detail.signals_identified.map((signal, i) => (
                  <SignalCard key={i} signal={signal} index={i} />
                ))}
              </div>
            </div>
          )}

          {/* Cross-Asset Opportunities */}
          {insights_detail && insights_detail.cross_asset_opportunities.length > 0 && (
            <div className="card animate-fadeSlideUp stagger-2">
              <h3 className="text-sm font-extrabold mb-4 flex items-center gap-2 heading-dash" style={{ color: '#D946EF' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Cross-Asset Opportunities
                <span className="ml-auto text-xs font-bold px-2 py-0.5 rounded-full"
                  style={{ background: 'rgba(217,70,239,0.12)', color: '#D946EF' }}>
                  {opportunitiesCount} opportunities
                </span>
              </h3>
              <div className="space-y-3">
                {insights_detail.cross_asset_opportunities.map((opp, i) => (
                  <OpportunityCard key={i} opp={opp} index={i} />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Right Column: Scenarios + Recommendations ── */}
        <div className="space-y-6">

          {/* Scenario Outcomes */}
          {insights_detail && insights_detail.scenario_outcomes.length > 0 && (
            <div className="card animate-fadeSlideUp stagger-1">
              <h3 className="text-sm font-extrabold mb-4 flex items-center gap-2 heading-dash" style={{ color: '#F59E0B' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                Scenario Outcomes
                <span className="ml-auto text-xs font-bold px-2 py-0.5 rounded-full"
                  style={{ background: 'rgba(245,158,11,0.12)', color: '#F59E0B' }}>
                  {scenariosCount} scenarios
                </span>
              </h3>
              <div className="space-y-3">
                {insights_detail.scenario_outcomes.map((scenario, i) => (
                  <ScenarioCard key={i} scenario={scenario} index={i} />
                ))}
              </div>
            </div>
          )}

          {/* Recommendations */}
          <div className="card animate-fadeSlideUp stagger-2" style={{ alignSelf: 'start' }}>
            <h3 className="text-sm font-extrabold mb-4 flex items-center gap-2 heading-dash" style={{ color: '#06B6D4' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Recommendations
              {recommendations && (
                <span className="ml-auto text-xs font-bold px-2 py-0.5 rounded-full"
                  style={{ background: 'rgba(6,182,212,0.12)', color: 'var(--cyan-400)' }}>
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
                                  <span className="text-xs font-bold heading-dash text-white">{rec.title}</span>
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
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#06B6D4" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="10" />
                                <polyline points="12 6 12 12 16 14" />
                              </svg>
                              <span className="text-xs" style={{ color: 'var(--cyan-400)' }}>{rec.timeframe}</span>
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
      </div>

      {/* ── Summary ── */}
      {result.summary && (
        <div className="card animate-fadeSlideUp stagger-3" style={{ borderLeft: '4px solid #06B6D4' }}>
          <h3 className="text-sm font-extrabold mb-2 flex items-center gap-2 heading-dash text-white">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#06B6D4" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 6h16M4 12h16M4 18h7" />
            </svg>
            Analysis Summary
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
              style={{ background: 'var(--dark-900)', color: 'var(--text-secondary)', fontFamily: 'ui-monospace, monospace' }}>
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
      <div className="w-10 h-10 rounded-full mx-auto mb-2 flex items-center justify-center" style={{ background: 'var(--dark-700)' }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#525252" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
