// @ts-nocheck
import { useState } from 'react';
import type { PaymentResponse } from '../types';

interface Props {
  result: PaymentResponse;
}

function getRiskLevel(score: number): { label: string; cssClass: string } {
  if (score <= 30) return { label: 'Low', cssClass: 'low' };
  if (score <= 70) return { label: 'Medium', cssClass: 'medium' };
  return { label: 'High', cssClass: 'high' };
}

function formatRail(rail: string): string {
  const map: Record<string, string> = {
    fedwire: 'Fedwire',
    ach: 'ACH',
    rtp: 'RTP',
    swift: 'SWIFT',
    sepa: 'SEPA',
  };
  return map[rail] || rail.toUpperCase();
}

function getRailBadgeClass(rail: string): string {
  const map: Record<string, string> = {
    fedwire: 'fedwire',
    ach: 'ach',
    rtp: 'rtp',
    swift: 'swift',
    sepa: 'sepa',
  };
  return map[rail] || '';
}

function ResultsPanelInternal({ result }: Props) {
  const [rawExpanded, setRawExpanded] = useState(false);
  const { validation_result, routing_decision, reconciliation_status } = result;

  return (
    <div className="animate-slide-up">
      {/* Transaction Summary Header */}
      <div className="card mb-6" style={{ borderTop: '3px solid var(--emerald-500)' }}>
        <div className="flex flex-wrap items-center gap-6">
          <div>
            <div className="text-xs font-semibold uppercase" style={{ color: 'var(--text-muted)', letterSpacing: '0.05em' }}>
              Payment ID
            </div>
            <div className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>
              {result.payment_id}
            </div>
          </div>
          <div style={{ width: 1, height: 32, background: 'var(--border-color)' }} />
          <div>
            <div className="text-xs font-semibold uppercase" style={{ color: 'var(--text-muted)', letterSpacing: '0.05em' }}>
              Transaction ID
            </div>
            <div className="text-sm font-mono font-medium" style={{ color: 'var(--text-secondary)' }}>
              {result.transaction_id}
            </div>
          </div>
          <div style={{ width: 1, height: 32, background: 'var(--border-color)' }} />
          <div>
            <div className="text-xs font-semibold uppercase" style={{ color: 'var(--text-muted)', letterSpacing: '0.05em' }}>
              Timestamp
            </div>
            <div className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
              {result.timestamp}
            </div>
          </div>
        </div>
      </div>

      {/* Three Column Results */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        {/* Validation Result */}
        <div className="card animate-slide-up-delay-1" style={{ borderLeft: '4px solid var(--emerald-500)' }}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              Validation
            </h3>
            {validation_result && (
              <span className={`status-pill ${validation_result.status}`}>
                {validation_result.status === 'requires_review'
                  ? 'Review Required'
                  : validation_result.status.charAt(0).toUpperCase() + validation_result.status.slice(1)}
              </span>
            )}
          </div>

          {validation_result ? (
            <div className="space-y-4">
              {/* Risk Score */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                    Risk Score
                  </span>
                  <span className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>
                    {validation_result.risk_score}/100
                  </span>
                </div>
                <div className="risk-meter">
                  <div
                    className={`risk-meter-fill ${getRiskLevel(validation_result.risk_score).cssClass}`}
                    style={{ width: `${validation_result.risk_score}%` }}
                  />
                </div>
                <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                  {getRiskLevel(validation_result.risk_score).label} Risk
                </div>
              </div>

              {/* Sanctions */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                  Sanctions:
                </span>
                {validation_result.sanctions_clear ? (
                  <span className="flex items-center gap-1 text-xs font-semibold" style={{ color: 'var(--emerald-600)' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    Clear
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-xs font-semibold" style={{ color: 'var(--red-500)' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                    Flagged
                  </span>
                )}
              </div>

              {/* Rules Checked */}
              {validation_result.rules_checked.length > 0 && (
                <div>
                  <div className="text-xs font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                    Rules Checked
                  </div>
                  <div className="space-y-1">
                    {validation_result.rules_checked.map((rule) => (
                      <div key={rule} className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-primary)' }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--emerald-500)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                        {rule}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Violations */}
              {validation_result.violations.length > 0 && (
                <div>
                  <div className="text-xs font-medium mb-2" style={{ color: 'var(--red-500)' }}>
                    Violations
                  </div>
                  <div className="space-y-1">
                    {validation_result.violations.map((v) => (
                      <div
                        key={v}
                        className="text-xs px-2 py-1.5 rounded"
                        style={{ background: 'var(--red-50)', color: 'var(--red-500)' }}
                      >
                        {v}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Notes */}
              {validation_result.notes.length > 0 && (
                <div>
                  <div className="text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>
                    Notes
                  </div>
                  {validation_result.notes.map((note) => (
                    <div key={note} className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                      {note}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="text-sm" style={{ color: 'var(--text-muted)' }}>
              No validation data available
            </div>
          )}
        </div>

        {/* Routing Decision */}
        <div className="card animate-slide-up-delay-2" style={{ borderLeft: '4px solid var(--blue-500)' }}>
          <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
            Routing Decision
          </h3>

          {routing_decision ? (
            <div className="space-y-4">
              {/* Selected Rail */}
              <div className="text-center py-3 rounded-lg" style={{ background: 'var(--slate-50)' }}>
                <div className="text-xs font-medium mb-2" style={{ color: 'var(--text-muted)' }}>
                  Selected Rail
                </div>
                <span className={`payment-rail-badge ${getRailBadgeClass(routing_decision.selected_rail)} text-sm`}>
                  {formatRail(routing_decision.selected_rail)}
                </span>
              </div>

              {/* Settlement & Cost */}
              <div className="grid grid-cols-2 gap-3">
                <div className="text-center py-2 rounded-lg" style={{ background: 'var(--slate-50)' }}>
                  <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Settlement</div>
                  <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {routing_decision.estimated_settlement_time}
                  </div>
                </div>
                <div className="text-center py-2 rounded-lg" style={{ background: 'var(--slate-50)' }}>
                  <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Cost</div>
                  <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                    ${routing_decision.routing_cost.toFixed(2)}
                  </div>
                </div>
              </div>

              {/* Alternative Rails */}
              {routing_decision.alternative_rails.length > 0 && (
                <div>
                  <div className="text-xs font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                    Alternatives
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {routing_decision.alternative_rails.map((rail) => (
                      <span
                        key={rail}
                        className={`payment-rail-badge ${getRailBadgeClass(rail)}`}
                        style={{ opacity: 0.7 }}
                      >
                        {formatRail(rail)}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Rationale */}
              <div>
                <div className="text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
                  Rationale
                </div>
                <div className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                  {routing_decision.routing_rationale}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-sm" style={{ color: 'var(--text-muted)' }}>
              No routing data available
            </div>
          )}
        </div>

        {/* Reconciliation */}
        <div className="card animate-slide-up-delay-3" style={{ borderLeft: '4px solid var(--slate-400)' }}>
          <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
            Reconciliation
          </h3>

          {reconciliation_status ? (
            <div className="space-y-4">
              <div className="text-center py-6 rounded-lg" style={{ background: 'var(--slate-50)' }}>
                <div className="text-xs font-medium mb-3" style={{ color: 'var(--text-muted)' }}>
                  Status
                </div>
                <span className={`status-pill ${reconciliation_status}`}>
                  {reconciliation_status.charAt(0).toUpperCase() + reconciliation_status.slice(1)}
                </span>
              </div>

              <div className="text-center">
                {reconciliation_status === 'matched' && (
                  <div className="text-xs" style={{ color: 'var(--emerald-600)' }}>
                    Transaction successfully matched across all systems.
                  </div>
                )}
                {reconciliation_status === 'pending' && (
                  <div className="text-xs" style={{ color: 'var(--amber-500)' }}>
                    Awaiting confirmation from counterparty systems.
                  </div>
                )}
                {reconciliation_status === 'discrepancy' && (
                  <div className="text-xs" style={{ color: 'var(--red-500)' }}>
                    Discrepancies detected. Manual review recommended.
                  </div>
                )}
                {reconciliation_status === 'unmatched' && (
                  <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    No matching transaction found in target systems.
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="text-sm" style={{ color: 'var(--text-muted)' }}>
              No reconciliation data available
            </div>
          )}
        </div>
      </div>

      {/* Summary */}
      {result.summary && (
        <div className="card mb-6 animate-slide-up-delay-4">
          <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
            Summary
          </h3>
          <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            {result.summary}
          </p>
        </div>
      )}

      {/* Raw Analysis Accordion */}
      {result.raw_analysis && Object.keys(result.raw_analysis).length > 0 && (
        <div className="animate-slide-up-delay-4">
          <button
            className="accordion-toggle"
            onClick={() => setRawExpanded(!rawExpanded)}
          >
            <span>Raw Analysis Data</span>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{
                transform: rawExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform 0.2s ease',
              }}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          <div className={`accordion-content ${rawExpanded ? 'open' : ''}`}>
            <div
              className="mt-2 p-4 rounded-lg overflow-auto"
              style={{
                background: 'var(--slate-50)',
                border: '1px solid var(--border-color)',
                maxHeight: 400,
              }}
            >
              <pre className="text-xs font-mono whitespace-pre-wrap" style={{ color: 'var(--text-secondary)' }}>
                {JSON.stringify(result.raw_analysis, null, 2)}
              </pre>
            </div>
          </div>
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
