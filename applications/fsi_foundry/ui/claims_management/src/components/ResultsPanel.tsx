// @ts-nocheck
import { useState } from 'react';
import type { ClaimResponse, ComparableSettlement } from '../types';

interface Props {
  result: ClaimResponse;
}

/* ── Helper: Radial progress circle ── */
function RadialProgress({ value, size = 72, stroke = 6, color = '#0284C7' }: { value: number; size?: number; stroke?: number; color?: string }) {
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
  const color = pct >= 80 ? '#16A34A' : pct >= 60 ? '#0284C7' : pct >= 40 ? '#EAB308' : '#78716C';
  return (
    <div className="flex items-center gap-2">
      <div className="progress-bar flex-1" style={{ height: '6px' }}>
        <div className="progress-bar-fill" style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${color}, ${color}88)` }} />
      </div>
      <span className="text-xs font-bold" style={{ color, minWidth: '32px' }}>{pct}%</span>
    </div>
  );
}

/* ── Helper: Currency formatter ── */
function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);
}

/* ── Helper: Cost comparison bar ── */
function CostComparisonBar({ repair, replacement }: { repair: number; replacement: number }) {
  const max = Math.max(repair, replacement, 1);
  return (
    <div className="space-y-3">
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-bold" style={{ color: 'var(--text-secondary)' }}>Estimated Repair</span>
          <span className="text-xs font-bold" style={{ color: '#0284C7' }}>{formatCurrency(repair)}</span>
        </div>
        <div className="cost-bar">
          <div className="cost-bar-fill" style={{ width: `${(repair / max) * 100}%`, background: 'linear-gradient(90deg, #0284C7, #38BDF8)' }} />
        </div>
      </div>
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-bold" style={{ color: 'var(--text-secondary)' }}>Estimated Replacement</span>
          <span className="text-xs font-bold" style={{ color: '#F97316' }}>{formatCurrency(replacement)}</span>
        </div>
        <div className="cost-bar">
          <div className="cost-bar-fill" style={{ width: `${(replacement / max) * 100}%`, background: 'linear-gradient(90deg, #F97316, #FB923C)' }} />
        </div>
      </div>
    </div>
  );
}

/* ── Helper: Comparable settlement card ── */
function ComparableCard({ settlement, index }: { settlement: ComparableSettlement; index: number }) {
  const similarityPct = Math.round(settlement.similarity_score * 100);
  const simColor = similarityPct >= 80 ? '#16A34A' : similarityPct >= 60 ? '#0284C7' : '#EAB308';

  return (
    <div className="comparable-card animate-signalReveal" style={{ animationDelay: `${index * 0.1}s` }}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="doc-tag">{settlement.claim_id}</span>
          <span className="text-sm font-bold" style={{ color: 'var(--charcoal)' }}>{formatCurrency(settlement.amount)}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Similarity</span>
          <span className="text-xs font-bold" style={{ color: simColor }}>{similarityPct}%</span>
        </div>
      </div>
      <div className="progress-bar" style={{ height: '4px' }}>
        <div className="progress-bar-fill" style={{ width: `${similarityPct}%`, background: `linear-gradient(90deg, ${simColor}, ${simColor}66)` }} />
      </div>
    </div>
  );
}

function ResultsPanelInternal({ result }: Props) {
  const [rawExpanded, setRawExpanded] = useState(false);
  const { intake_summary, damage_assessment, settlement_recommendation } = result;

  const confidencePct = settlement_recommendation ? Math.round(settlement_recommendation.confidence_score * 100) : 0;
  const confidenceColor = confidencePct >= 80 ? '#16A34A' : confidencePct >= 60 ? '#0284C7' : confidencePct >= 40 ? '#EAB308' : '#78716C';

  const severityLevel = damage_assessment?.severity.toLowerCase() ?? 'low';
  const evidenceLevel = damage_assessment?.evidence_quality.toLowerCase() ?? 'fair';
  const docsComplete = intake_summary?.documentation_complete ?? false;
  const missingCount = intake_summary?.missing_documents.length ?? 0;
  const findingsCount = damage_assessment?.findings.length ?? 0;
  const comparablesCount = settlement_recommendation?.comparable_settlements.length ?? 0;

  return (
    <div className="space-y-6 animate-fadeSlideUp">

      {/* ── Assessment Header ── */}
      <div className="card flex items-center justify-between" style={{ borderTop: '3px solid var(--sky-700)' }}>
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
            style={{ background: 'var(--sky-50)', color: 'var(--sky-700)' }}>
            {result.entity_id}
          </div>
          {intake_summary && (
            <span className={`status-badge ${intake_summary.status.toLowerCase().replace(' ', '_')}`}>
              {intake_summary.status}
            </span>
          )}
        </div>
      </div>

      {/* ── Top Metrics Row ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 animate-fadeSlideUp stagger-1">
        {/* Documentation Status */}
        <div className="metric-card">
          <div className={`metric-card-accent ${docsComplete ? 'optimal' : 'warning'}`} />
          <div className="p-4">
            <div className="text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Documentation</div>
            <div className="text-lg font-extrabold" style={{ color: docsComplete ? '#16A34A' : '#EAB308' }}>
              {docsComplete ? 'Complete' : 'Incomplete'}
            </div>
            <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {missingCount > 0 ? `${missingCount} missing` : 'All documents received'}
            </div>
          </div>
        </div>

        {/* Damage Severity */}
        <div className="metric-card">
          <div className={`metric-card-accent ${severityLevel === 'low' ? 'optimal' : severityLevel === 'moderate' ? 'warning' : 'critical'}`} />
          <div className="p-4">
            <div className="text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Damage Severity</div>
            {damage_assessment ? (
              <span className={`severity-badge ${severityLevel}`}>
                {damage_assessment.severity}
              </span>
            ) : (
              <span className="text-sm" style={{ color: 'var(--text-muted)' }}>N/A</span>
            )}
            <div className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>
              {findingsCount} findings
            </div>
          </div>
        </div>

        {/* Confidence Score */}
        <div className="metric-card">
          <div className="metric-card-accent sky" />
          <div className="p-4 flex items-center gap-4">
            <RadialProgress value={confidencePct} size={64} stroke={5} color={confidenceColor} />
            <div>
              <div className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>Confidence</div>
              <div className="text-lg font-extrabold" style={{ color: confidenceColor }}>{confidencePct}%</div>
            </div>
          </div>
        </div>

        {/* Settlement Amount */}
        <div className="metric-card">
          <div className="metric-card-accent optimal" />
          <div className="p-4">
            <div className="text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Recommended Settlement</div>
            <div className="text-2xl font-extrabold" style={{ color: '#16A34A' }}>
              {settlement_recommendation ? formatCurrency(settlement_recommendation.recommended_amount) : 'N/A'}
            </div>
            <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {comparablesCount} comparable claims
            </div>
          </div>
        </div>
      </div>

      {/* ── Two-Column Layout: Left (Intake + Damage) | Right (Settlement) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* ── Left Column: Intake + Damage Assessment ── */}
        <div className="space-y-6">

          {/* Intake Summary */}
          {intake_summary && (
            <div className="card animate-fadeSlideUp stagger-1">
              <h3 className="text-sm font-extrabold mb-4 flex items-center gap-2 heading-dash" style={{ color: 'var(--sky-700)' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Claims Intake Summary
              </h3>

              {/* Claim Type & Status */}
              <div className="flex items-center gap-3 mb-4">
                <span className="doc-tag">{intake_summary.claim_type}</span>
                <span className={`status-badge ${intake_summary.status.toLowerCase().replace(' ', '_')}`}>
                  {intake_summary.status}
                </span>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${docsComplete ? '' : ''}`}
                  style={{ background: docsComplete ? 'var(--green-50)' : 'var(--amber-50)', color: docsComplete ? 'var(--green-700)' : 'var(--amber-600)' }}>
                  {docsComplete ? 'Docs Complete' : 'Docs Incomplete'}
                </span>
              </div>

              {/* Missing Documents */}
              {intake_summary.missing_documents.length > 0 && (
                <div className="mb-4 p-3 rounded-xl" style={{ background: 'var(--amber-50)', border: '1px solid rgba(234,179,8,0.2)' }}>
                  <div className="flex items-center gap-2 mb-2">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                    </svg>
                    <span className="text-xs font-bold" style={{ color: '#D97706' }}>Missing Documents ({intake_summary.missing_documents.length})</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {intake_summary.missing_documents.map((doc, i) => (
                      <span key={i} className="text-xs font-semibold px-2.5 py-1 rounded-lg"
                        style={{ background: 'white', color: '#D97706', border: '1px solid rgba(234,179,8,0.3)' }}>
                        {doc}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Key Details */}
              {Object.keys(intake_summary.key_details).length > 0 && (
                <div className="space-y-2 mb-4">
                  <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Key Details</span>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(intake_summary.key_details).map(([key, value]) => (
                      <div key={key} className="p-2 rounded-lg" style={{ background: 'var(--stone-50)' }}>
                        <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{key}</div>
                        <div className="text-xs font-bold" style={{ color: 'var(--charcoal)' }}>{value}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Intake Notes */}
              {intake_summary.notes && (
                <div className="p-3 rounded-xl" style={{ background: 'var(--sky-50)', borderLeft: '3px solid var(--sky-700)' }}>
                  <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{intake_summary.notes}</p>
                </div>
              )}
            </div>
          )}

          {/* Damage Assessment */}
          {damage_assessment && (
            <div className="card animate-fadeSlideUp stagger-2">
              <h3 className="text-sm font-extrabold mb-4 flex items-center gap-2 heading-dash" style={{ color: '#EA580C' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                Damage Assessment
                <span className="ml-auto flex items-center gap-2">
                  <span className={`severity-badge ${severityLevel}`}>{damage_assessment.severity} severity</span>
                  <span className={`evidence-badge ${evidenceLevel}`}>{damage_assessment.evidence_quality} evidence</span>
                </span>
              </h3>

              {/* Cost Comparison */}
              <div className="mb-5">
                <CostComparisonBar repair={damage_assessment.estimated_repair_cost} replacement={damage_assessment.estimated_replacement_cost} />
              </div>

              {/* Findings */}
              {damage_assessment.findings.length > 0 && (
                <div className="mb-4">
                  <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                    Findings ({damage_assessment.findings.length})
                  </span>
                  <div className="space-y-2 mt-2">
                    {damage_assessment.findings.map((finding, i) => (
                      <div key={i} className="flex items-start gap-2 animate-signalReveal" style={{ animationDelay: `${i * 0.08}s` }}>
                        <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                          style={{ background: 'var(--coral-50)' }}>
                          <span className="text-xs font-bold" style={{ color: '#EA580C' }}>{i + 1}</span>
                        </div>
                        <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{finding}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Assessment Notes */}
              {damage_assessment.notes && (
                <div className="p-3 rounded-xl" style={{ background: 'var(--coral-50)', borderLeft: '3px solid #F97316' }}>
                  <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{damage_assessment.notes}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Right Column: Settlement Recommendation ── */}
        <div className="space-y-6" style={{ alignSelf: 'start' }}>

          {/* Settlement Recommendation */}
          {settlement_recommendation ? (
            <div className="card animate-fadeSlideUp stagger-2">
              <h3 className="text-sm font-extrabold mb-4 flex items-center gap-2 heading-dash" style={{ color: '#15803D' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Settlement Recommendation
              </h3>

              {/* Big settlement amount */}
              <div className="text-center p-6 rounded-xl mb-5" style={{ background: 'linear-gradient(135deg, #F0FDF4, #F0F9FF)' }}>
                <div className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>Recommended Amount</div>
                <div className="text-4xl font-extrabold" style={{ color: '#16A34A' }}>
                  {formatCurrency(settlement_recommendation.recommended_amount)}
                </div>
                <div className="mt-3">
                  <span className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>Confidence</span>
                  <div className="max-w-xs mx-auto mt-1">
                    <ConfidenceBar value={settlement_recommendation.confidence_score} />
                  </div>
                </div>
              </div>

              {/* Justification */}
              <div className="mb-5 p-3 rounded-xl" style={{ background: 'var(--green-50)', borderLeft: '3px solid #16A34A' }}>
                <span className="text-xs font-bold uppercase tracking-wider" style={{ color: '#15803D' }}>Justification</span>
                <p className="text-xs leading-relaxed mt-1" style={{ color: 'var(--text-secondary)' }}>{settlement_recommendation.justification}</p>
              </div>

              {/* Policy Coverage */}
              {settlement_recommendation.policy_coverage_applicable.length > 0 && (
                <div className="mb-5">
                  <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                    Applicable Policy Coverage
                  </span>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {settlement_recommendation.policy_coverage_applicable.map((coverage, i) => (
                      <span key={i} className="coverage-tag">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                        {coverage}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Comparable Settlements */}
              {settlement_recommendation.comparable_settlements.length > 0 && (
                <div className="mb-4">
                  <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                    Comparable Settlements ({settlement_recommendation.comparable_settlements.length})
                  </span>
                  <div className="space-y-2 mt-2">
                    {settlement_recommendation.comparable_settlements.map((s, i) => (
                      <ComparableCard key={i} settlement={s} index={i} />
                    ))}
                  </div>
                </div>
              )}

              {/* Settlement Notes */}
              {settlement_recommendation.notes && (
                <div className="p-3 rounded-xl" style={{ background: 'var(--stone-50)' }}>
                  <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{settlement_recommendation.notes}</p>
                </div>
              )}
            </div>
          ) : (
            <div className="card animate-fadeSlideUp stagger-2" style={{ alignSelf: 'start' }}>
              <h3 className="text-sm font-extrabold mb-4 flex items-center gap-2 heading-dash" style={{ color: '#15803D' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8V7m0 10v1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Settlement Recommendation
              </h3>
              <EmptyState label="No settlement recommendation generated" />
            </div>
          )}
        </div>
      </div>

      {/* ── Summary ── */}
      {result.summary && (
        <div className="card animate-fadeSlideUp stagger-3" style={{ borderLeft: '4px solid var(--sky-700)' }}>
          <h3 className="text-sm font-extrabold mb-2 flex items-center gap-2 heading-dash" style={{ color: 'var(--charcoal)' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0284C7" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
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
              style={{ background: 'var(--stone-50)', color: 'var(--text-secondary)', fontFamily: 'ui-monospace, monospace' }}>
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
