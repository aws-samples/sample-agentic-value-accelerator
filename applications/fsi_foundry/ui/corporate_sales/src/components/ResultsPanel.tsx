// @ts-nocheck
import { useState } from 'react';
import type { SalesResponse, LeadScore, OpportunityDetail } from '../types';

interface Props {
  result: SalesResponse;
}

/* ── Helpers ─────────────────────────────────────── */

function tierIcon(tier: LeadScore['tier']): string {
  switch (tier) {
    case 'HOT': return '\u{1F525}';       // fire
    case 'WARM': return '\u2600\uFE0F';   // sun
    case 'COLD': return '\u2744\uFE0F';   // snowflake
    case 'UNQUALIFIED': return '\u26D4';   // no-entry
  }
}

function gaugeColor(score: number): string {
  if (score >= 80) return '#DC2626';
  if (score >= 60) return '#D4A017';
  if (score >= 40) return '#F59E0B';
  if (score >= 20) return '#3B82F6';
  return '#6B7280';
}

function stageLabel(stage: OpportunityDetail['stage']): string {
  return stage.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

const STAGE_ORDER: OpportunityDetail['stage'][] = [
  'PROSPECTING', 'QUALIFICATION', 'PROPOSAL', 'NEGOTIATION', 'CLOSED_WON', 'CLOSED_LOST',
];

function formatCurrency(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toLocaleString()}`;
}

/* ── Circular Score Gauge ────────────────────────── */
function ScoreGauge({ score }: { score: number }) {
  const size = 140;
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const dashLen = (score / 100) * circumference;
  const color = gaugeColor(score);

  return (
    <div className="score-gauge" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox="0 0 140 140">
        <circle className="gauge-track" cx="70" cy="70" r={radius} />
        <circle
          className="gauge-fill"
          cx="70" cy="70" r={radius}
          stroke={color}
          style={{ strokeDasharray: `${dashLen}, ${circumference}` }}
        />
      </svg>
      <div className="gauge-value">
        <span className="gauge-number" style={{ fontSize: '2.25rem' }}>{score}</span>
        <span className="gauge-label">Score</span>
      </div>
    </div>
  );
}

/* ── Opportunity Stage Timeline ──────────────────── */
function StageTimeline({ currentStage }: { currentStage: OpportunityDetail['stage'] }) {
  const currentIdx = STAGE_ORDER.indexOf(currentStage);
  const isLost = currentStage === 'CLOSED_LOST';

  return (
    <div style={{ overflowX: 'auto', paddingBottom: '0.5rem' }}>
      <div className="stage-timeline" style={{ minWidth: '28rem' }}>
        {STAGE_ORDER.filter((s) => s !== 'CLOSED_LOST').map((stage, i) => {
          const stageIdx = STAGE_ORDER.indexOf(stage);
          const isCompleted = !isLost && stageIdx < currentIdx;
          const isActive = stageIdx === currentIdx;
          const shortLabel = stage.slice(0, 4);

          return (
            <div key={stage} style={{ display: 'contents' }}>
              {i > 0 && (
                <div
                  className={`stage-line ${isCompleted ? 'completed' : isActive ? 'active' : ''}`}
                />
              )}
              <div
                className={`stage-dot ${isCompleted ? 'completed' : isActive ? 'active' : ''}`}
                title={stageLabel(stage)}
              >
                {isCompleted ? (
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : (
                  shortLabel
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.375rem', minWidth: '28rem' }}>
        {STAGE_ORDER.filter((s) => s !== 'CLOSED_LOST').map((stage) => (
          <span key={stage} style={{ fontSize: '0.6rem', color: '#9CA3AF', textAlign: 'center', flex: 1 }}>
            {stageLabel(stage)}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ── Main Results Panel ──────────────────────────── */
function ResultsPanelInternal({ result }: Props) {
  const [showRaw, setShowRaw] = useState(false);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* ── Assessment Header ─────────────────── */}
      <div className="card card-gold animate-fade-slide-up">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#1F2937' }}>Sales Assessment</h2>
            <div style={{ display: 'flex', gap: '1rem', marginTop: '0.25rem', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.75rem', color: '#6B7280' }}>
                Client: <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#D4A017' }}>{result.customer_id}</span>
              </span>
              <span style={{ fontSize: '0.75rem', color: '#6B7280' }}>
                ID: <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{result.assessment_id}</span>
              </span>
            </div>
          </div>
          <div style={{ fontSize: '0.7rem', color: '#9CA3AF', textAlign: 'right' }}>
            {new Date(result.timestamp).toLocaleString()}
          </div>
        </div>
      </div>

      {/* ── Two Column Layout ─────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(18rem, 1fr))', gap: '1.5rem' }}>
        {/* ── Lead Score Card ─────────────────── */}
        {result.lead_score && (
          <div className="card animate-fade-slide-up stagger-1">
            <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#1F2937', marginBottom: '1rem' }}>Lead Score</h3>

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '1rem' }}>
              <ScoreGauge score={result.lead_score.score} />
              <div style={{ marginTop: '0.75rem' }}>
                <span className={`lead-tier lead-tier-${result.lead_score.tier}`}>
                  {tierIcon(result.lead_score.tier)} {result.lead_score.tier}
                </span>
              </div>
            </div>

            {/* Scoring Factors */}
            {result.lead_score.factors.length > 0 && (
              <div style={{ marginBottom: '1rem' }}>
                <h4 style={{ fontSize: '0.75rem', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
                  Scoring Factors
                </h4>
                <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                  {result.lead_score.factors.map((f, i) => (
                    <li
                      key={i}
                      className="animate-slide-right"
                      style={{
                        fontSize: '0.8rem',
                        color: '#374151',
                        padding: '0.375rem 0.625rem',
                        borderRadius: '6px',
                        background: '#FFFBEB',
                        borderLeft: '3px solid #D4A017',
                        animationDelay: `${0.1 * i}s`,
                      }}
                    >
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Score Recommendations */}
            {result.lead_score.recommendations.length > 0 && (
              <div>
                <h4 style={{ fontSize: '0.75rem', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
                  Recommendations
                </h4>
                <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                  {result.lead_score.recommendations.map((r, i) => (
                    <li
                      key={i}
                      className="animate-slide-right"
                      style={{
                        fontSize: '0.8rem',
                        color: '#374151',
                        padding: '0.375rem 0.625rem',
                        borderRadius: '6px',
                        background: '#F0FDF4',
                        borderLeft: '3px solid #22C55E',
                        animationDelay: `${0.15 * i}s`,
                      }}
                    >
                      {r}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* ── Opportunity Card ────────────────── */}
        {result.opportunity && (
          <div className="card animate-fade-slide-up stagger-2">
            <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#1F2937', marginBottom: '1rem' }}>Opportunity Analysis</h3>

            {/* Stage Timeline */}
            <div style={{ marginBottom: '1.25rem' }}>
              <h4 style={{ fontSize: '0.75rem', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
                Pipeline Stage
              </h4>
              <StageTimeline currentStage={result.opportunity.stage} />
            </div>

            {/* Confidence Bar */}
            <div style={{ marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.375rem' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#6B7280' }}>Confidence</span>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#D4A017' }}>{result.opportunity.confidence}%</span>
              </div>
              <div className="confidence-bar">
                <div className="fill" style={{ width: `${result.opportunity.confidence}%` }} />
              </div>
            </div>

            {/* Estimated Value */}
            <div style={{ marginBottom: '1.25rem', textAlign: 'center', padding: '1rem', borderRadius: '8px', background: '#FFFBEB' }}>
              <div style={{ fontSize: '0.7rem', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>
                Estimated Deal Value
              </div>
              <div className="deal-value">{formatCurrency(result.opportunity.estimated_value)}</div>
            </div>

            {/* Key Drivers */}
            {result.opportunity.key_drivers.length > 0 && (
              <div style={{ marginBottom: '1rem' }}>
                <h4 style={{ fontSize: '0.75rem', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
                  Key Drivers
                </h4>
                <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                  {result.opportunity.key_drivers.map((d, i) => (
                    <li
                      key={i}
                      className="animate-slide-right"
                      style={{
                        fontSize: '0.8rem', color: '#374151',
                        padding: '0.375rem 0.625rem', borderRadius: '6px',
                        background: '#EFF6FF', borderLeft: '3px solid #3B82F6',
                        animationDelay: `${0.1 * i}s`,
                      }}
                    >
                      {d}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Risks */}
            {result.opportunity.risks.length > 0 && (
              <div style={{ marginBottom: '1rem' }}>
                <h4 style={{ fontSize: '0.75rem', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
                  Risks
                </h4>
                <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                  {result.opportunity.risks.map((r, i) => (
                    <li
                      key={i}
                      className="animate-slide-right"
                      style={{
                        fontSize: '0.8rem', color: '#991B1B',
                        padding: '0.375rem 0.625rem', borderRadius: '6px',
                        background: '#FEF2F2', borderLeft: '3px solid #DC2626',
                        animationDelay: `${0.1 * i}s`,
                      }}
                    >
                      {r}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Next Steps */}
            {result.opportunity.next_steps.length > 0 && (
              <div>
                <h4 style={{ fontSize: '0.75rem', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
                  Next Steps
                </h4>
                <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                  {result.opportunity.next_steps.map((s, i) => (
                    <li
                      key={i}
                      className="animate-slide-right"
                      style={{
                        fontSize: '0.8rem', color: '#374151',
                        padding: '0.375rem 0.625rem', borderRadius: '6px',
                        background: '#F0FDF4', borderLeft: '3px solid #22C55E',
                        animationDelay: `${0.1 * i}s`,
                      }}
                    >
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Recommendations ───────────────────── */}
      {result.recommendations.length > 0 && (
        <div className="card animate-fade-slide-up stagger-3">
          <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#1F2937', marginBottom: '0.75rem' }}>
            Strategic Recommendations
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {result.recommendations.map((rec, i) => (
              <div
                key={i}
                className="animate-deal-slide"
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '0.75rem',
                  padding: '0.75rem 1rem',
                  borderRadius: '8px',
                  background: i % 2 === 0 ? '#FFFBEB' : '#FFFDF7',
                  animationDelay: `${0.1 * i}s`,
                }}
              >
                <div style={{
                  width: '1.5rem', height: '1.5rem', borderRadius: '50%', flexShrink: 0,
                  background: 'linear-gradient(135deg, #D4A017, #F5C842)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'white', fontSize: '0.65rem', fontWeight: 800,
                }}>
                  {i + 1}
                </div>
                <span style={{ fontSize: '0.85rem', color: '#374151', lineHeight: 1.5 }}>{rec}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Summary ───────────────────────────── */}
      {result.summary && (
        <div className="card card-navy animate-fade-slide-up stagger-4">
          <h3 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '0.5rem', color: '#FCD34D' }}>
            Executive Summary
          </h3>
          <p style={{ fontSize: '0.85rem', lineHeight: 1.7, color: '#D1D5DB' }}>
            {result.summary}
          </p>
        </div>
      )}

      {/* ── Raw Analysis (expandable) ─────────── */}
      {result.raw_analysis && Object.keys(result.raw_analysis).length > 0 && (
        <div className="card animate-fade-slide-up stagger-5">
          <button
            onClick={() => setShowRaw(!showRaw)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              width: '100%',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
            }}
          >
            <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#1F2937' }}>
              Raw Agent Analysis
            </h3>
            <svg
              width="16" height="16" viewBox="0 0 24 24" fill="none"
              stroke="#6B7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              style={{ transform: showRaw ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease' }}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>

          {showRaw && (
            <pre style={{
              marginTop: '1rem',
              padding: '1rem',
              borderRadius: '8px',
              background: '#1A2332',
              color: '#D1D5DB',
              fontSize: '0.75rem',
              lineHeight: 1.6,
              overflow: 'auto',
              maxHeight: '24rem',
              fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
            }}>
              {JSON.stringify(result.raw_analysis, null, 2)}
            </pre>
          )}
        </div>
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
