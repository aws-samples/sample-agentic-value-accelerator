// @ts-nocheck
import { useState } from 'react';
import type { InsuranceResponse } from '../types';

interface Props {
  result: InsuranceResponse;
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

/* ── Helper: Coverage gap visualization ── */
function CoverageGapBar({ current, recommended, label }: { current: number; recommended: number; label: string }) {
  const maxVal = Math.max(current, recommended, 1);
  const currentPct = Math.round((current / maxVal) * 100);
  const recommendedPct = Math.round((recommended / maxVal) * 100);
  const gap = recommended - current;
  const gapFormatted = gap > 0 ? `+$${(gap / 1000).toFixed(0)}K` : 'Covered';

  return (
    <div className="mb-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-bold" style={{ color: 'var(--text-secondary)' }}>{label}</span>
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono" style={{ color: 'var(--blue-600)' }}>${(current / 1000).toFixed(0)}K</span>
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>/</span>
          <span className="text-xs font-mono" style={{ color: 'var(--warm-gray-400)' }}>${(recommended / 1000).toFixed(0)}K</span>
          <span className={`text-xs font-bold ${gap > 0 ? 'text-rose-500' : 'text-green-600'}`}>
            {gapFormatted}
          </span>
        </div>
      </div>
      <div className="coverage-bar relative">
        <div className="coverage-bar-fill" style={{ width: `${currentPct}%`, background: 'linear-gradient(90deg, #2563EB, #3B82F688)' }} />
        <div className="gap-meter-target" style={{ left: `${recommendedPct}%` }} />
      </div>
    </div>
  );
}

/* ── Helper: Factor chart (horizontal bars) ── */
function FactorChart({ factors, title, color }: { factors: string[]; title: string; color: string }) {
  if (factors.length === 0) return null;
  return (
    <div>
      <h4 className="text-xs font-bold mb-2" style={{ color }}>{title}</h4>
      <div className="space-y-1.5">
        {factors.map((factor, i) => (
          <div key={i} className="flex items-center gap-2 animate-signalReveal" style={{ animationDelay: `${i * 0.1}s` }}>
            <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: color }} />
            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{factor}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Helper: Confidence bar ── */
function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color = pct >= 80 ? '#2563EB' : pct >= 60 ? '#166534' : pct >= 40 ? '#F59E0B' : '#78716C';
  return (
    <div className="flex items-center gap-2">
      <div className="coverage-bar flex-1" style={{ height: '6px' }}>
        <div className="coverage-bar-fill" style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${color}, ${color}88)` }} />
      </div>
      <span className="text-xs font-bold" style={{ color, minWidth: '32px' }}>{pct}%</span>
    </div>
  );
}

/* ── Helper: format currency ── */
function formatCurrency(amount: number): string {
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `$${(amount / 1_000).toFixed(0)}K`;
  return `$${amount.toFixed(0)}`;
}

/* ── Helper: risk category color ── */
function riskColor(category: string): string {
  const lower = category.toLowerCase();
  if (lower === 'preferred' || lower === 'super_preferred') return '#2563EB';
  if (lower === 'standard' || lower === 'standard_plus') return '#166534';
  if (lower === 'moderate' || lower === 'substandard') return '#F59E0B';
  return '#E11D48';
}

/* ── Helper: risk category CSS class ── */
function riskClass(category: string): string {
  const lower = category.toLowerCase();
  if (lower === 'preferred' || lower === 'super_preferred') return 'preferred';
  if (lower === 'standard' || lower === 'standard_plus') return 'standard';
  if (lower === 'moderate' || lower === 'substandard') return 'moderate';
  return 'high';
}

/* ── Helper: life stage CSS class ── */
function stageClass(stage: string): string {
  const lower = stage.toLowerCase();
  if (lower.includes('young')) return 'young';
  if (lower.includes('family') || lower.includes('growing')) return 'family';
  if (lower.includes('established') || lower.includes('mid')) return 'established';
  return 'pre-retirement';
}

function ResultsPanelInternal({ result }: Props) {
  const [rawExpanded, setRawExpanded] = useState(false);
  const { needs_analysis, product_recommendations, underwriting_assessment } = result;

  const confidenceScore = underwriting_assessment ? Math.round(underwriting_assessment.confidence_score * 100) : 0;
  const coverageGap = needs_analysis?.coverage_gap ?? 0;
  const incomeYears = needs_analysis?.income_replacement_years ?? 0;
  const productCount = product_recommendations?.recommended_products.length ?? 0;

  const confidenceColor = confidenceScore >= 80 ? '#2563EB' : confidenceScore >= 60 ? '#166534' : confidenceScore >= 40 ? '#F59E0B' : '#E11D48';

  return (
    <div className="space-y-6 animate-fadeSlideUp">

      {/* ── Assessment Header ── */}
      <div className="card flex items-center justify-between" style={{ borderTop: '3px solid var(--blue-600)' }}>
        <div>
          <h2 className="text-lg font-extrabold heading-dash" style={{ color: 'var(--text-primary)' }}>Analysis Result</h2>
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
            style={{ background: 'var(--blue-50)', color: 'var(--blue-800)' }}>
            {result.entity_id}
          </div>
          {needs_analysis && (
            <span className={`stage-badge ${stageClass(needs_analysis.life_stage)}`}>
              {needs_analysis.life_stage}
            </span>
          )}
        </div>
      </div>

      {/* ── Top Metrics Row ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 animate-fadeSlideUp stagger-1">
        {/* Confidence Score */}
        <div className="metric-card">
          <div className="metric-card-accent optimal" />
          <div className="p-4 flex items-center gap-4">
            <RadialProgress value={confidenceScore} size={64} stroke={5} color={confidenceColor} />
            <div>
              <div className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>Confidence</div>
              <div className="text-lg font-extrabold" style={{ color: confidenceColor }}>{confidenceScore}/100</div>
            </div>
          </div>
        </div>

        {/* Coverage Gap */}
        <div className="metric-card">
          <div className={`metric-card-accent ${coverageGap <= 0 ? 'good' : coverageGap <= 100000 ? 'warning' : 'critical'}`} />
          <div className="p-4">
            <div className="text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Coverage Gap</div>
            <div className="text-2xl font-extrabold" style={{ color: coverageGap <= 0 ? '#166534' : coverageGap <= 100000 ? '#F59E0B' : '#E11D48' }}>
              {coverageGap <= 0 ? 'None' : formatCurrency(coverageGap)}
            </div>
            <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {coverageGap <= 0 ? 'Fully covered' : 'Additional needed'}
            </div>
          </div>
        </div>

        {/* Risk Category */}
        {underwriting_assessment && (
          <div className="metric-card">
            <div className="metric-card-accent neutral" />
            <div className="p-4">
              <div className="text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Risk Category</div>
              <span className={`risk-badge ${riskClass(underwriting_assessment.risk_category)}`}>
                {underwriting_assessment.risk_category.replace(/_/g, ' ')}
              </span>
              <div className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>
                {incomeYears > 0 ? `${incomeYears}yr income replacement` : 'Assessment complete'}
              </div>
            </div>
          </div>
        )}

        {/* Products Matched */}
        <div className="metric-card">
          <div className={`metric-card-accent ${productCount > 0 ? 'good' : 'neutral'}`} />
          <div className="p-4">
            <div className="text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Products Matched</div>
            <div className="text-2xl font-extrabold" style={{ color: 'var(--green-700)' }}>{productCount}</div>
            <div className="text-xs" style={{ color: 'var(--text-muted)' }}>recommended products</div>
          </div>
        </div>
      </div>

      {/* ── Two-Column Layout: Needs + Underwriting | Products ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* ── Left Column: Needs Analysis + Underwriting ── */}
        <div className="space-y-6">

          {/* Needs Analysis */}
          {needs_analysis && (
            <div className="card animate-fadeSlideUp stagger-1">
              <h3 className="text-sm font-extrabold mb-4 flex items-center gap-2 heading-dash" style={{ color: 'var(--blue-600)' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4-4v2m5.5-6a4 4 0 100-8 4 4 0 000 8z" />
                </svg>
                Needs Analysis
              </h3>

              {/* Life Stage + Income Replacement */}
              <div className="flex items-center gap-3 mb-4">
                <span className={`stage-badge ${stageClass(needs_analysis.life_stage)}`}>{needs_analysis.life_stage}</span>
                <span className="factor-tag">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                  {needs_analysis.income_replacement_years} years income replacement
                </span>
              </div>

              {/* Coverage Gap Bar */}
              <CoverageGapBar
                current={needs_analysis.recommended_coverage - needs_analysis.coverage_gap}
                recommended={needs_analysis.recommended_coverage}
                label="Coverage vs. Recommended"
              />

              {/* Key Needs */}
              {needs_analysis.key_needs.length > 0 && (
                <div className="mt-4">
                  <h4 className="text-xs font-bold mb-2" style={{ color: 'var(--text-secondary)' }}>Key Protection Needs</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {needs_analysis.key_needs.map((need, i) => (
                      <span key={i} className="need-tag animate-signalReveal" style={{ animationDelay: `${i * 0.08}s` }}>{need}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Notes */}
              {needs_analysis.notes && (
                <div className="mt-3 p-3 rounded-lg" style={{ background: 'var(--blue-50)' }}>
                  <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{needs_analysis.notes}</p>
                </div>
              )}
            </div>
          )}

          {/* Underwriting Assessment */}
          {underwriting_assessment && (
            <div className="card animate-fadeSlideUp stagger-2">
              <h3 className="text-sm font-extrabold mb-4 flex items-center gap-2 heading-dash" style={{ color: '#E11D48' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Underwriting Assessment
                <span className="ml-auto">
                  <span className={`risk-badge ${riskClass(underwriting_assessment.risk_category)}`}>
                    {underwriting_assessment.risk_category.replace(/_/g, ' ')}
                  </span>
                </span>
              </h3>

              {/* Confidence */}
              <div className="mb-4">
                <span className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>Confidence Score</span>
                <ConfidenceBar value={underwriting_assessment.confidence_score} />
              </div>

              {/* Health + Lifestyle Factors */}
              <div className="grid grid-cols-2 gap-4 mb-4">
                <FactorChart
                  factors={underwriting_assessment.health_factors}
                  title="Health Factors"
                  color={riskColor(underwriting_assessment.risk_category)}
                />
                <FactorChart
                  factors={underwriting_assessment.lifestyle_factors}
                  title="Lifestyle Factors"
                  color="#78716C"
                />
              </div>

              {/* Recommended Actions */}
              {underwriting_assessment.recommended_actions.length > 0 && (
                <div>
                  <h4 className="text-xs font-bold mb-2" style={{ color: 'var(--text-secondary)' }}>Recommended Actions</h4>
                  <div className="space-y-2">
                    {underwriting_assessment.recommended_actions.map((action, i) => {
                      const actionType = action.toLowerCase().includes('approve') ? 'approve'
                        : action.toLowerCase().includes('decline') ? 'decline' : 'review';
                      return (
                        <div key={i} className={`action-card ${actionType} animate-signalReveal`}
                          style={{ animationDelay: `${i * 0.1}s` }}>
                          <div className="flex items-center gap-2">
                            {actionType === 'approve' && (
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#166534" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                            )}
                            {actionType === 'review' && (
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="10" />
                                <line x1="12" y1="8" x2="12" y2="12" />
                                <line x1="12" y1="16" x2="12.01" y2="16" />
                              </svg>
                            )}
                            {actionType === 'decline' && (
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#E11D48" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="10" />
                                <line x1="15" y1="9" x2="9" y2="15" />
                                <line x1="9" y1="9" x2="15" y2="15" />
                              </svg>
                            )}
                            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{action}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Notes */}
              {underwriting_assessment.notes && (
                <div className="mt-3 p-3 rounded-lg" style={{ background: 'var(--rose-50)' }}>
                  <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{underwriting_assessment.notes}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Right Column: Product Recommendations ── */}
        <div className="card animate-fadeSlideUp stagger-2" style={{ alignSelf: 'start' }}>
          <h3 className="text-sm font-extrabold mb-4 flex items-center gap-2 heading-dash" style={{ color: 'var(--green-700)' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Product Recommendations
            {product_recommendations && (
              <span className="ml-auto text-xs font-bold px-2 py-0.5 rounded-full"
                style={{ background: 'var(--green-50)', color: 'var(--green-700)' }}>
                {product_recommendations.recommended_products.length} products
              </span>
            )}
          </h3>

          {product_recommendations ? (
            <div className="space-y-4">
              {/* Primary Product Highlight */}
              <div className="p-4 rounded-xl border-2" style={{ borderColor: 'var(--green-600)', background: 'var(--green-50)' }}>
                <div className="flex items-center gap-2 mb-2">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#166534" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                  </svg>
                  <span className="text-xs font-bold" style={{ color: 'var(--green-800)' }}>Primary Recommendation</span>
                </div>
                <h4 className="text-sm font-extrabold mb-2" style={{ color: 'var(--green-800)' }}>
                  {product_recommendations.primary_product}
                </h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Coverage Amount</span>
                    <div className="text-lg font-extrabold" style={{ color: 'var(--green-700)' }}>
                      {formatCurrency(product_recommendations.coverage_amount)}
                    </div>
                  </div>
                  <div>
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Est. Premium</span>
                    <div className="text-lg font-extrabold" style={{ color: 'var(--blue-600)' }}>
                      {formatCurrency(product_recommendations.estimated_premium)}/mo
                    </div>
                  </div>
                </div>
              </div>

              {/* All Recommended Products */}
              <div>
                <h4 className="text-xs font-bold mb-2" style={{ color: 'var(--text-secondary)' }}>All Recommended Products</h4>
                <div className="flex flex-wrap gap-1.5">
                  {product_recommendations.recommended_products.map((product, i) => (
                    <span key={i} className="product-tag animate-signalReveal" style={{ animationDelay: `${i * 0.08}s` }}>
                      {product}
                    </span>
                  ))}
                </div>
              </div>

              {/* Comparison Notes */}
              {product_recommendations.comparison_notes && (
                <div className="p-3 rounded-lg" style={{ background: 'var(--warm-gray-50)' }}>
                  <h4 className="text-xs font-bold mb-1" style={{ color: 'var(--text-secondary)' }}>Comparison Notes</h4>
                  <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                    {product_recommendations.comparison_notes}
                  </p>
                </div>
              )}

              {/* Notes */}
              {product_recommendations.notes && (
                <div className="p-3 rounded-lg" style={{ background: 'var(--green-50)' }}>
                  <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{product_recommendations.notes}</p>
                </div>
              )}
            </div>
          ) : (
            <EmptyState label="No product recommendations generated" />
          )}
        </div>
      </div>

      {/* ── Summary ── */}
      {result.summary && (
        <div className="card animate-fadeSlideUp stagger-3" style={{ borderLeft: '4px solid var(--blue-600)' }}>
          <h3 className="text-sm font-extrabold mb-2 flex items-center gap-2 heading-dash" style={{ color: 'var(--text-primary)' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--blue-600)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
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
              style={{ background: 'var(--warm-gray-50)', color: 'var(--text-secondary)', fontFamily: 'ui-monospace, monospace' }}>
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
