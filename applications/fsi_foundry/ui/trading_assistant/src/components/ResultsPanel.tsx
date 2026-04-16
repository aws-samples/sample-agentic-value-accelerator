// @ts-nocheck
import { useState } from 'react';
import type { TradingResponse, Recommendation, TradeIdea } from '../types';

interface Props {
  result: TradingResponse;
}

/* ── Helper: Radial progress circle ── */
function RadialProgress({ value, size = 72, stroke = 6, color = '#22C55E' }: { value: number; size?: number; stroke?: number; color?: string }) {
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
  const color = pct >= 80 ? '#22C55E' : pct >= 60 ? '#4ADE80' : pct >= 40 ? '#F59E0B' : '#64748B';
  return (
    <div className="flex items-center gap-2">
      <div className="confidence-bar flex-1">
        <div className="confidence-bar-fill" style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${color}, ${color}88)` }} />
      </div>
      <span className="text-xs font-bold heading-terminal" style={{ color, minWidth: '32px' }}>{pct}%</span>
    </div>
  );
}

/* ── Helper: Condition icon ── */
function ConditionIcon({ condition }: { condition: string }) {
  const c = condition.toLowerCase();
  if (c === 'bullish') {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" />
      </svg>
    );
  }
  if (c === 'bearish') {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="5" x2="12" y2="19" /><polyline points="19 12 12 19 5 12" />
      </svg>
    );
  }
  if (c === 'volatile') {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
      </svg>
    );
  }
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

/* ── Helper: Trade idea card ── */
function TradeIdeaCard({ idea, index }: { idea: TradeIdea; index: number }) {
  const dirClass = idea.direction.toLowerCase() === 'long' ? 'long' : idea.direction.toLowerCase() === 'short' ? 'short' : 'neutral';
  return (
    <div className="market-card animate-signalReveal" style={{ animationDelay: `${index * 0.12}s` }}>
      <div className={`market-card-accent ${idea.direction.toLowerCase() === 'long' ? 'bullish' : idea.direction.toLowerCase() === 'short' ? 'bearish' : 'neutral'}`} />
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold heading-terminal" style={{ color: 'var(--white)' }}>{idea.instrument}</span>
            <span className={`direction-badge ${dirClass}`}>{idea.direction}</span>
          </div>
          <span className="text-xs font-bold heading-terminal px-2 py-0.5 rounded"
            style={{ background: 'rgba(34,197,94,0.15)', color: '#4ADE80' }}>
            R:R {idea.risk_reward}
          </span>
        </div>

        {/* Price levels grid */}
        <div className="grid grid-cols-3 gap-3 mb-3">
          <div className="p-2 rounded-lg" style={{ background: 'rgba(100,116,139,0.08)' }}>
            <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Entry</div>
            <div className="text-sm font-bold heading-terminal" style={{ color: '#4ADE80' }}>{idea.entry}</div>
          </div>
          <div className="p-2 rounded-lg" style={{ background: 'rgba(34,197,94,0.08)' }}>
            <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Target</div>
            <div className="text-sm font-bold heading-terminal" style={{ color: '#22C55E' }}>{idea.target}</div>
          </div>
          <div className="p-2 rounded-lg" style={{ background: 'rgba(239,68,68,0.08)' }}>
            <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Stop Loss</div>
            <div className="text-sm font-bold heading-terminal" style={{ color: '#EF4444' }}>{idea.stop_loss}</div>
          </div>
        </div>

        {/* Conviction & Rationale */}
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>Conviction:</span>
          <span className="text-xs font-bold heading-terminal" style={{ color: '#FBBF24' }}>{idea.conviction}</span>
        </div>
        <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{idea.rationale}</p>
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
  const { market_analysis, recommendations } = result;

  const keyLevelsCount = market_analysis?.key_levels.length ?? 0;
  const tradeIdeasCount = market_analysis?.trade_ideas.length ?? 0;
  const execNotesCount = market_analysis?.execution_notes.length ?? 0;
  const confidencePct = market_analysis ? Math.round(market_analysis.confidence_score * 100) : 0;

  return (
    <div className="space-y-6 animate-fadeSlideUp">

      {/* ── Result Header ── */}
      <div className="card flex items-center justify-between" style={{ borderTop: '3px solid #22C55E' }}>
        <div>
          <h2 className="text-lg font-extrabold heading-terminal" style={{ color: 'var(--white)' }}>Trading Analysis Result</h2>
          <div className="flex items-center gap-4 mt-1">
            <span className="text-xs font-mono heading-terminal" style={{ color: 'var(--text-muted)' }}>
              ID: {result.research_id}
            </span>
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {new Date(result.timestamp).toLocaleString()}
            </span>
          </div>
        </div>
        <div className="text-xs font-bold px-3 py-1.5 rounded-full heading-terminal"
          style={{ background: 'rgba(34,197,94,0.15)', color: '#4ADE80' }}>
          {result.entity_id}
        </div>
      </div>

      {/* ── Two-Column Layout: Market Analysis + Recommendations ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* ── Market Analysis Panel ── */}
        <div className="card animate-fadeSlideUp stagger-1">
          <h3 className="text-sm font-extrabold mb-4 flex items-center gap-2 heading-terminal" style={{ color: '#4ADE80' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 17 9 11 13 15 21 7" />
              <polyline points="14 7 21 7 21 14" />
            </svg>
            Market Analysis
          </h3>

          {market_analysis ? (
            <>
              {/* Stats Row */}
              <div className="grid grid-cols-3 gap-3 mb-5">
                <div className="text-center p-3 rounded-xl" style={{ background: 'rgba(34,197,94,0.08)' }}>
                  <div className="text-2xl font-extrabold heading-terminal" style={{ color: '#22C55E' }}>{keyLevelsCount}</div>
                  <div className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>Key Levels</div>
                </div>
                <div className="text-center p-3 rounded-xl" style={{ background: 'rgba(245,158,11,0.08)' }}>
                  <div className="text-2xl font-extrabold heading-terminal" style={{ color: '#F59E0B' }}>{tradeIdeasCount}</div>
                  <div className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>Trade Ideas</div>
                </div>
                <div className="flex flex-col items-center justify-center">
                  <RadialProgress
                    value={confidencePct}
                    size={64}
                    stroke={5}
                    color={confidencePct >= 80 ? '#22C55E' : confidencePct >= 60 ? '#4ADE80' : confidencePct >= 40 ? '#F59E0B' : '#64748B'}
                  />
                  <div className="text-xs font-semibold mt-1" style={{ color: 'var(--text-muted)' }}>Confidence</div>
                </div>
              </div>

              {/* Market Condition + Urgency */}
              <div className="flex items-center gap-3 mb-5 p-3 rounded-xl" style={{ background: 'rgba(100,116,139,0.08)' }}>
                <ConditionIcon condition={market_analysis.condition} />
                <div className="flex-1">
                  <span className="text-xs font-bold" style={{ color: 'var(--text-secondary)' }}>Market Condition</span>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-sm font-bold heading-terminal" style={{ color: 'var(--white)' }}>
                      {market_analysis.condition}
                    </span>
                    <span className={`condition-badge ${market_analysis.condition.toLowerCase()}`}>
                      {market_analysis.condition}
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>Urgency</span>
                  <div>
                    <span className={`urgency-badge ${market_analysis.urgency.toLowerCase()}`}>
                      {market_analysis.urgency}
                    </span>
                  </div>
                </div>
              </div>

              {/* Key Levels */}
              {keyLevelsCount > 0 && (
                <div className="mb-5">
                  <p className="text-xs font-bold mb-2" style={{ color: 'var(--text-secondary)' }}>Key Levels</p>
                  <div className="space-y-2">
                    {market_analysis.key_levels.map((level, i) => (
                      <div key={i} className="flex items-center gap-3 p-2.5 rounded-lg animate-signalReveal"
                        style={{ background: 'rgba(100,116,139,0.06)', animationDelay: `${i * 0.1}s` }}>
                        <span className="level-tag">{level.type}</span>
                        <span className="text-sm font-bold heading-terminal" style={{ color: 'var(--white)' }}>{level.price}</span>
                        <span className="text-xs ml-auto" style={{ color: 'var(--text-muted)' }}>{level.significance}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Trade Ideas */}
              {tradeIdeasCount > 0 && (
                <div className="mb-5">
                  <p className="text-xs font-bold mb-2" style={{ color: 'var(--text-secondary)' }}>Trade Ideas</p>
                  <div className="space-y-3">
                    {market_analysis.trade_ideas.map((idea, i) => (
                      <TradeIdeaCard key={i} idea={idea} index={i} />
                    ))}
                  </div>
                </div>
              )}

              {/* Execution Notes */}
              {execNotesCount > 0 && (
                <div>
                  <p className="text-xs font-bold mb-2" style={{ color: 'var(--text-secondary)' }}>Execution Notes</p>
                  <div className="flex flex-wrap gap-2">
                    {market_analysis.execution_notes.map((note, i) => (
                      <span key={i} className="exec-tag">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M9 12l2 2 4-4" />
                        </svg>
                        {note}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <EmptyState label="No market analysis available" />
          )}
        </div>

        {/* ── Recommendations Panel ── */}
        <div className="card animate-fadeSlideUp stagger-2">
          <h3 className="text-sm font-extrabold mb-4 flex items-center gap-2 heading-terminal" style={{ color: '#F59E0B' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            Recommendations
            {recommendations && (
              <span className="ml-auto text-xs font-bold px-2 py-0.5 rounded-full heading-terminal"
                style={{ background: 'rgba(245,158,11,0.15)', color: '#FBBF24' }}>
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
                        <div key={i} className={`trade-card ${tierLevel} animate-signalReveal`}
                          style={{ animationDelay: `${i * 0.1}s` }}>
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-xs font-bold heading-terminal" style={{ color: 'var(--white)' }}>{rec.title}</span>
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
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#4ADE80" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <circle cx="12" cy="12" r="10" />
                              <polyline points="12 6 12 12 16 14" />
                            </svg>
                            <span className="text-xs" style={{ color: '#4ADE80' }}>{rec.timeframe}</span>
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
        <div className="card animate-fadeSlideUp stagger-3" style={{ borderLeft: '4px solid #22C55E' }}>
          <h3 className="text-sm font-extrabold mb-2 flex items-center gap-2 heading-terminal" style={{ color: 'var(--white)' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 6h16M4 12h16M4 18h7" />
            </svg>
            Trading Summary
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
              style={{ background: 'rgba(100,116,139,0.08)', color: '#4ADE80', fontFamily: 'ui-monospace, monospace' }}>
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
      <div className="w-10 h-10 rounded-full mx-auto mb-2 flex items-center justify-center" style={{ background: 'rgba(100,116,139,0.15)' }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
