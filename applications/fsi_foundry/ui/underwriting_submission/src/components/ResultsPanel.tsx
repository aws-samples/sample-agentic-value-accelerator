import { useState, Component, type ErrorInfo, type ReactNode, type CSSProperties } from 'react';
import type { SubmissionResponse } from '../types';

interface Props {
  result: SubmissionResponse;
}

/* ── Helpers ── */

function norm(value: string | null | undefined, fallback = 'unknown'): string {
  if (!value) return fallback;
  return value.trim().toLowerCase().replace(/\s+/g, '_');
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatCompactCurrency(amount: number): string {
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `$${(amount / 1_000).toFixed(0)}K`;
  return formatCurrency(amount);
}

/** Pull a leading rule id (e.g. "APP-03") out of a citation string. */
function ruleId(citation: string): string | null {
  const match = citation.match(/^\s*(APP-\d+)/i);
  return match ? match[1].toUpperCase() : null;
}

/** Strip the leading rule id and separator so the reason reads cleanly. */
function ruleReason(citation: string): string {
  return citation.replace(/^\s*APP-\d+\s*[:\-–]?\s*/i, '').trim() || citation;
}

function RadialProgress({ value, size = 72, stroke = 6, color = '#0284C7' }: {
  value: number; size?: number; stroke?: number; color?: string;
}) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, value));
  const offset = circumference - (clamped / 100) * circumference;
  return (
    <div className="radial-progress" style={{ '--size': `${size}px`, '--stroke': `${stroke}px` } as CSSProperties}>
      <svg>
        <circle className="track" cx={size / 2} cy={size / 2} r={radius} />
        <circle className="fill" cx={size / 2} cy={size / 2} r={radius}
          style={{ stroke: color, strokeDasharray: circumference, strokeDashoffset: offset }} />
      </svg>
      <span className="label">{clamped}%</span>
    </div>
  );
}

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
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

/** Loss ratio can legitimately exceed 1.0 — claims cost more than premium. */
function LossRatioBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const width = Math.min(100, pct);
  const color = pct >= 100 ? '#DC2626' : pct >= 70 ? '#EAB308' : '#16A34A';
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-bold" style={{ color: 'var(--text-secondary)' }}>Expected Loss Ratio</span>
        <span className="text-xs font-bold" style={{ color }}>
          {value.toFixed(2)}{pct >= 100 ? ' — exceeds premium' : ''}
        </span>
      </div>
      <div className="cost-bar">
        <div className="cost-bar-fill" style={{ width: `${width}%`, background: `linear-gradient(90deg, ${color}, ${color}88)` }} />
      </div>
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

/* ── Main panel ── */

function ResultsPanelInternal({ result }: Props) {
  const [rawExpanded, setRawExpanded] = useState(false);
  const { appetite_review, exposure_assessment, pricing_indication } = result;

  const decision = norm(result.decision, 'none');
  const decisionLabel = decision === 'none' ? 'No Decision' : decision;
  const appetiteStatus = norm(appetite_review?.status);
  const severity = norm(exposure_assessment?.severity);

  // Which specialists actually ran. A partial triage returns nulls for the
  // rest, and deliberately returns no decision at all.
  const ranSections = [
    appetite_review ? 'risk appetite screening' : null,
    exposure_assessment ? 'exposure analysis' : null,
    pricing_indication ? 'technical pricing' : null,
  ].filter(Boolean) as string[];
  const isPartial = ranSections.length < 3;

  const confidencePct = pricing_indication ? Math.round(pricing_indication.confidence_score * 100) : 0;
  const confidenceColor = confidencePct >= 80 ? '#16A34A' : confidencePct >= 60 ? '#0284C7' : confidencePct >= 40 ? '#EAB308' : '#78716C';

  const decisionIcon = decision === 'quote'
    ? 'M9 12l2 2 4-4'
    : decision === 'refer'
      ? 'M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z'
      : decision === 'decline'
        ? 'M18 6L6 18M6 6l12 12'
        : 'M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z';

  return (
    <div className="space-y-6 animate-fadeSlideUp">

      {/* ── Header ── */}
      <div className="card flex items-center justify-between" style={{ borderTop: '3px solid var(--sky-700)' }}>
        <div>
          <h2 className="text-lg font-extrabold heading-dash" style={{ color: 'var(--charcoal)' }}>Triage Result</h2>
          <div className="flex items-center gap-4 mt-1">
            <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
              ID: {result.assessment_id}
            </span>
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {result.timestamp ? new Date(result.timestamp).toLocaleString() : ''}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-xs font-bold px-3 py-1.5 rounded-full"
            style={{ background: 'var(--sky-50)', color: 'var(--sky-700)' }}>
            {result.submission_id}
          </div>
          <span className={`decision-badge ${decision}`}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <path d={decisionIcon} />
            </svg>
            {decisionLabel}
          </span>
        </div>
      </div>

      {/* ── Partial-run notice: never imply an outcome that was not reached ── */}
      {isPartial && (
        <div className="card animate-fadeSlideUp" style={{ borderLeft: '4px solid var(--stone-400)', background: 'var(--stone-50)' }}>
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'white' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--stone-500)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="16" x2="12" y2="12" />
                <line x1="12" y1="8" x2="12.01" y2="8" />
              </svg>
            </div>
            <div>
              <h3 className="text-sm font-bold mb-1" style={{ color: 'var(--charcoal)' }}>Partial assessment</h3>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                Only {ranSections.join(' and ')} {ranSections.length === 1 ? 'was' : 'were'} performed, so no overall
                quote, refer or decline outcome has been reached. Appetite screening alone is sufficient to decline but
                never sufficient to quote; exposure or pricing alone cannot decide in either direction.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Metrics Row ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 animate-fadeSlideUp stagger-1">
        {/* Appetite */}
        <div className="metric-card">
          <div className={`metric-card-accent ${
            appetiteStatus === 'in_appetite' ? 'optimal' : appetiteStatus === 'referral_required' ? 'warning' : appetiteStatus === 'out_of_appetite' ? 'critical' : 'neutral'
          }`} />
          <div className="p-4">
            <div className="text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Risk Appetite</div>
            {appetite_review ? (
              <>
                <span className={`appetite-badge ${appetiteStatus}`}>{appetiteStatus.replace(/_/g, ' ')}</span>
                <div className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>
                  {appetite_review.checks_passed.length} passed · {appetite_review.checks_failed.length} breached
                </div>
              </>
            ) : (
              <span className="text-sm" style={{ color: 'var(--text-muted)' }}>Not assessed</span>
            )}
          </div>
        </div>

        {/* Total insured value */}
        <div className="metric-card">
          <div className="metric-card-accent sky" />
          <div className="p-4">
            <div className="text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Total Insured Value</div>
            {exposure_assessment ? (
              <>
                <div className="text-2xl font-extrabold" style={{ color: 'var(--sky-700)' }}>
                  {formatCompactCurrency(exposure_assessment.total_insured_value)}
                </div>
                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  current property schedule
                </div>
              </>
            ) : (
              <span className="text-sm" style={{ color: 'var(--text-muted)' }}>Not assessed</span>
            )}
          </div>
        </div>

        {/* Exposure severity */}
        <div className="metric-card">
          <div className={`metric-card-accent ${
            severity === 'low' ? 'optimal' : severity === 'moderate' ? 'warning' : severity === 'high' || severity === 'critical' ? 'critical' : 'neutral'
          }`} />
          <div className="p-4">
            <div className="text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Exposure Severity</div>
            {exposure_assessment ? (
              <>
                <span className={`severity-badge ${severity}`}>{severity}</span>
                <div className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>
                  {exposure_assessment.concentration_flags.length} concentration flag{exposure_assessment.concentration_flags.length === 1 ? '' : 's'}
                </div>
              </>
            ) : (
              <span className="text-sm" style={{ color: 'var(--text-muted)' }}>Not assessed</span>
            )}
          </div>
        </div>

        {/* Indicated premium */}
        <div className="metric-card">
          <div className={`metric-card-accent ${pricing_indication && pricing_indication.indicated_premium > 0 ? 'optimal' : 'neutral'}`} />
          <div className="p-4">
            <div className="text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Indicated Premium</div>
            {pricing_indication ? (
              pricing_indication.indicated_premium > 0 ? (
                <>
                  <div className="text-2xl font-extrabold" style={{ color: '#16A34A' }}>
                    {formatCurrency(pricing_indication.indicated_premium)}
                  </div>
                  <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {pricing_indication.rate_per_thousand.toFixed(2)} per $1,000 TIV
                  </div>
                </>
              ) : (
                <>
                  <div className="text-lg font-extrabold" style={{ color: 'var(--stone-500)' }}>Not priced</div>
                  <div className="text-xs" style={{ color: 'var(--text-muted)' }}>see pricing rationale</div>
                </>
              )
            ) : (
              <span className="text-sm" style={{ color: 'var(--text-muted)' }}>Not assessed</span>
            )}
          </div>
        </div>
      </div>

      {/* ── Two-column: Left (Appetite + Exposure) | Right (Pricing + Actions) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        <div className="space-y-6">

          {/* ── Appetite Review ── */}
          {appetite_review ? (
            <div className="card animate-fadeSlideUp stagger-1">
              <h3 className="text-sm font-extrabold mb-4 flex items-center gap-2 heading-dash" style={{ color: 'var(--sky-700)' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Risk Appetite Screening
                <span className="ml-auto">
                  <span className={`appetite-badge ${appetiteStatus}`}>{appetiteStatus.replace(/_/g, ' ')}</span>
                </span>
              </h3>

              {/* Prohibited classes — an absolute bar, surfaced first */}
              {appetite_review.prohibited_classes_triggered.length > 0 && (
                <div className="mb-4 p-3 rounded-xl" style={{ background: 'var(--red-50)', border: '1px solid rgba(220,38,38,0.2)' }}>
                  <div className="flex items-center gap-2 mb-2">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--red-600)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
                    </svg>
                    <span className="text-xs font-bold" style={{ color: 'var(--red-600)' }}>
                      Prohibited Class — Not Writable ({appetite_review.prohibited_classes_triggered.length})
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {appetite_review.prohibited_classes_triggered.map((cls, i) => (
                      <span key={i} className="prohibited-tag">{cls.replace(/_/g, ' ')}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Breached rules */}
              {appetite_review.checks_failed.length > 0 && (
                <div className="mb-4">
                  <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                    Rules Breached ({appetite_review.checks_failed.length})
                  </span>
                  <div className="space-y-2 mt-2">
                    {appetite_review.checks_failed.map((check, i) => (
                      <div key={i} className="flex items-start gap-2 animate-signalReveal" style={{ animationDelay: `${i * 0.08}s` }}>
                        <span className="rule-tag failed flex-shrink-0">
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M18 6L6 18M6 6l12 12" />
                          </svg>
                          {ruleId(check) ?? 'RULE'}
                        </span>
                        <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{ruleReason(check)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Satisfied rules */}
              {appetite_review.checks_passed.length > 0 && (
                <div className="mb-4">
                  <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                    Rules Satisfied or Not Applicable ({appetite_review.checks_passed.length})
                  </span>
                  <div className="space-y-2 mt-2">
                    {appetite_review.checks_passed.map((check, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <span className="rule-tag passed flex-shrink-0">
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                          {ruleId(check) ?? 'OK'}
                        </span>
                        <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>{ruleReason(check)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Screening notes */}
              {appetite_review.notes.length > 0 && (
                <div className="p-3 rounded-xl space-y-2" style={{ background: 'var(--sky-50)', borderLeft: '3px solid var(--sky-700)' }}>
                  {appetite_review.notes.map((note, i) => (
                    <p key={i} className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{note}</p>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="card animate-fadeSlideUp stagger-1">
              <h3 className="text-sm font-extrabold mb-4 flex items-center gap-2 heading-dash" style={{ color: 'var(--sky-700)' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Risk Appetite Screening
              </h3>
              <EmptyState label="Appetite screening was not part of this triage" />
            </div>
          )}

          {/* ── Exposure Assessment ── */}
          {exposure_assessment && (
            <div className="card animate-fadeSlideUp stagger-2">
              <h3 className="text-sm font-extrabold mb-4 flex items-center gap-2 heading-dash" style={{ color: '#EA580C' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 00-9.78 2.096A4.001 4.001 0 003 15z" />
                </svg>
                Exposure &amp; Loss History
                <span className="ml-auto">
                  <span className={`severity-badge ${severity}`}>{severity} severity</span>
                </span>
              </h3>

              {/* TIV headline */}
              <div className="mb-5 p-4 rounded-xl text-center" style={{ background: 'linear-gradient(135deg, #F0F9FF, #FFF7ED)' }}>
                <div className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>
                  Total Insured Value
                </div>
                <div className="text-3xl font-extrabold" style={{ color: 'var(--sky-700)' }}>
                  {formatCurrency(exposure_assessment.total_insured_value)}
                </div>
              </div>

              {/* Concentration flags */}
              {exposure_assessment.concentration_flags.length > 0 && (
                <div className="mb-4">
                  <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                    Catastrophe Concentration ({exposure_assessment.concentration_flags.length})
                  </span>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {exposure_assessment.concentration_flags.map((flag, i) => (
                      <span key={i} className="concentration-tag">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                        </svg>
                        {flag}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Loss history narrative */}
              {exposure_assessment.loss_history_summary && (
                <div className="mb-4 p-3 rounded-xl" style={{ background: 'var(--coral-50)', borderLeft: '3px solid #F97316' }}>
                  <span className="text-xs font-bold uppercase tracking-wider" style={{ color: '#EA580C' }}>Loss History</span>
                  <p className="text-xs leading-relaxed mt-1" style={{ color: 'var(--text-secondary)' }}>
                    {exposure_assessment.loss_history_summary}
                  </p>
                </div>
              )}

              {/* Findings */}
              {exposure_assessment.findings.length > 0 && (
                <div className="mb-4">
                  <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                    Findings ({exposure_assessment.findings.length})
                  </span>
                  <div className="space-y-2 mt-2">
                    {exposure_assessment.findings.map((finding, i) => (
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

              {/* Notes */}
              {exposure_assessment.notes.length > 0 && (
                <div className="p-3 rounded-xl space-y-2" style={{ background: 'var(--stone-50)' }}>
                  {exposure_assessment.notes.map((note, i) => (
                    <p key={i} className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{note}</p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Right column ── */}
        <div className="space-y-6" style={{ alignSelf: 'start' }}>

          {/* ── Pricing Indication ── */}
          {pricing_indication ? (
            <div className="card animate-fadeSlideUp stagger-2">
              <h3 className="text-sm font-extrabold mb-4 flex items-center gap-2 heading-dash" style={{ color: '#15803D' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Technical Pricing
              </h3>

              {pricing_indication.indicated_premium > 0 ? (
                <div className="text-center p-6 rounded-xl mb-5" style={{ background: 'linear-gradient(135deg, #F0FDF4, #F0F9FF)' }}>
                  <div className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>
                    Indicated Annual Premium
                  </div>
                  <div className="text-4xl font-extrabold" style={{ color: '#16A34A' }}>
                    {formatCurrency(pricing_indication.indicated_premium)}
                  </div>
                  <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                    {pricing_indication.rate_per_thousand.toFixed(2)} per $1,000 of insured value
                  </div>
                  <div className="mt-4">
                    <span className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>Confidence</span>
                    <div className="max-w-xs mx-auto mt-1">
                      <ConfidenceBar value={pricing_indication.confidence_score} />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center p-6 rounded-xl mb-5" style={{ background: 'var(--stone-50)', border: '1px dashed var(--stone-300)' }}>
                  <div className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>
                    No Price Indicated
                  </div>
                  <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                    The risk was not priced. This is the expected outcome where a submission falls outside appetite or
                    the data is too incomplete to rate credibly — see the rationale below.
                  </p>
                  <div className="mt-4 flex items-center justify-center gap-4">
                    <div className="text-center">
                      <RadialProgress value={confidencePct} size={56} stroke={5} color={confidenceColor} />
                      <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>confidence</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Loss ratio */}
              <div className="mb-5">
                <LossRatioBar value={pricing_indication.loss_ratio_estimate} />
              </div>

              {/* Justification */}
              {pricing_indication.justification.length > 0 && (
                <div className="mb-4">
                  <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                    Rating Factors ({pricing_indication.justification.length})
                  </span>
                  <div className="space-y-2 mt-2">
                    {pricing_indication.justification.map((item, i) => (
                      <div key={i} className="flex items-start gap-2 animate-signalReveal" style={{ animationDelay: `${i * 0.08}s` }}>
                        <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                          style={{ background: 'var(--green-50)' }}>
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#15803D" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        </div>
                        <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{item}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Notes */}
              {pricing_indication.notes.length > 0 && (
                <div className="p-3 rounded-xl space-y-2" style={{ background: 'var(--stone-50)' }}>
                  {pricing_indication.notes.map((note, i) => (
                    <p key={i} className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{note}</p>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="card animate-fadeSlideUp stagger-2">
              <h3 className="text-sm font-extrabold mb-4 flex items-center gap-2 heading-dash" style={{ color: '#15803D' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8V7m0 10v1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Technical Pricing
              </h3>
              <EmptyState label="Pricing was not part of this triage" />
            </div>
          )}

          {/* ── Broker Follow-Up ── */}
          {result.missing_information.length > 0 && (
            <div className="card animate-fadeSlideUp stagger-3" style={{ borderLeft: '4px solid var(--amber-500)' }}>
              <h3 className="text-sm font-extrabold mb-3 flex items-center gap-2 heading-dash" style={{ color: 'var(--amber-600)' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                Required from Broker ({result.missing_information.length})
              </h3>
              <div className="space-y-2">
                {result.missing_information.map((item, i) => (
                  <div key={i} className="flex items-start gap-2 animate-signalReveal" style={{ animationDelay: `${i * 0.06}s` }}>
                    <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                      style={{ background: 'var(--amber-50)' }}>
                      <span className="text-xs font-bold" style={{ color: 'var(--amber-600)' }}>{i + 1}</span>
                    </div>
                    <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{item}</p>
                  </div>
                ))}
              </div>
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
            Underwriter Summary
          </h3>
          <p className="text-sm leading-relaxed whitespace-pre-line" style={{ color: 'var(--text-secondary)' }}>{result.summary}</p>
        </div>
      )}

      {/* ── Raw Analysis ── */}
      {result.raw_analysis && Object.keys(result.raw_analysis).length > 0 && (
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

/* ── Error boundary: an unexpected response shape must not blank the page ── */
class ResultsErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('ResultsPanel error:', error, info); }
  render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 rounded-xl text-center" style={{ background: 'var(--amber-50)', border: '1px solid rgba(234,179,8,0.3)' }}>
          <p className="font-medium" style={{ color: '#92400E' }}>Unable to display results</p>
          <p className="text-sm mt-1" style={{ color: 'var(--amber-600)' }}>
            The agent response format was unexpected. Expand the raw output or check the runtime logs.
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function ResultsPanel({ result }: Props) {
  return (
    <ResultsErrorBoundary>
      <ResultsPanelInternal result={result} />
    </ResultsErrorBoundary>
  );
}
