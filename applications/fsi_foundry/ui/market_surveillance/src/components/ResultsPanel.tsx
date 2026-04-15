// @ts-nocheck
import { useState } from 'react';
import type { SurveillanceResponse } from '../types';

interface Props {
  result: SurveillanceResponse;
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
      <span className="label">{value}</span>
    </div>
  );
}

/* ── Helper: Risk bar ── */
function RiskBar({ value }: { value: number }) {
  const color = value >= 80 ? '#EF4444' : value >= 60 ? '#F97316' : value >= 40 ? '#F59E0B' : '#22C55E';
  return (
    <div className="flex items-center gap-2">
      <div className="risk-bar flex-1">
        <div className="risk-bar-fill" style={{ width: `${value}%`, background: `linear-gradient(90deg, ${color}, ${color}88)` }} />
      </div>
      <span className="text-xs font-bold" style={{ color, minWidth: '32px' }}>{value}/100</span>
    </div>
  );
}

function ResultsPanelInternal({ result }: Props) {
  const [rawExpanded, setRawExpanded] = useState(false);
  const { trade_pattern, comms_monitor, alert } = result;

  const riskScore = trade_pattern?.risk_score ?? 0;
  const riskColor = riskScore >= 80 ? '#EF4444' : riskScore >= 60 ? '#F97316' : riskScore >= 40 ? '#F59E0B' : '#22C55E';

  return (
    <div className="space-y-6 animate-fadeSlideUp">

      {/* ── Surveillance Header ── */}
      <div className="card flex items-center justify-between" style={{ borderTop: '3px solid var(--cyan-500)' }}>
        <div>
          <h2 className="text-lg font-extrabold" style={{ color: 'var(--zinc-300)' }}>Surveillance Result</h2>
          <div className="flex items-center gap-4 mt-1">
            <span className="text-xs font-mono" style={{ color: 'var(--zinc-500)' }}>
              ID: {result.surveillance_id}
            </span>
            <span className="text-xs" style={{ color: 'var(--zinc-500)' }}>
              {new Date(result.timestamp).toLocaleString()}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {alert && (
            <span className={`severity-badge ${alert.severity.toLowerCase()}`}>
              {alert.escalation_required && (
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" />
                </svg>
              )}
              {alert.severity}
            </span>
          )}
          <div className="text-xs font-bold px-3 py-1.5 rounded-full"
            style={{ background: 'rgba(6,182,212,0.1)', color: 'var(--cyan-400)', border: '1px solid rgba(6,182,212,0.2)' }}>
            {result.entity_id}
          </div>
        </div>
      </div>

      {/* ── Alert Banner (if escalation required) ── */}
      {alert && alert.escalation_required && (
        <div className="card animate-fadeSlideUp animate-glowBorder" style={{ borderLeft: '4px solid #EF4444', borderColor: undefined }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(239,68,68,0.1)' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div>
              <h3 className="text-sm font-extrabold" style={{ color: 'var(--red-400)' }}>Escalation Required</h3>
              <p className="text-xs" style={{ color: 'var(--zinc-400)' }}>
                This surveillance alert requires immediate escalation -- Alert Type: {alert.alert_type}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Three-Panel Layout ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ── Trade Pattern Panel ── */}
        <div className="card animate-fadeSlideUp stagger-1">
          <h3 className="text-sm font-extrabold mb-4 flex items-center gap-2" style={{ color: 'var(--cyan-400)' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 3v18h18 M18.7 8l-5.1 5.2-2.8-2.7L7 14.3" />
            </svg>
            Trade Patterns
          </h3>

          {trade_pattern ? (
            <>
              {/* Risk Score */}
              <div className="flex items-center gap-4 mb-5 p-3 rounded-xl" style={{ background: 'var(--zinc-800)' }}>
                <RadialProgress
                  value={trade_pattern.risk_score}
                  size={64}
                  stroke={5}
                  color={riskColor}
                />
                <div className="flex-1">
                  <span className="text-xs font-bold" style={{ color: 'var(--zinc-400)' }}>Risk Score</span>
                  <RiskBar value={trade_pattern.risk_score} />
                </div>
              </div>

              {/* Patterns Detected */}
              {trade_pattern.patterns_detected.length > 0 && (
                <div className="mb-4">
                  <p className="text-xs font-bold mb-2" style={{ color: 'var(--zinc-400)' }}>Patterns Detected</p>
                  <div className="space-y-2">
                    {trade_pattern.patterns_detected.map((pattern, i) => (
                      <div key={i} className="pattern-card animate-signalReveal" style={{ animationDelay: `${i * 0.1}s` }}>
                        <div className="pattern-card-accent anomaly" />
                        <div className="p-3 flex items-start gap-2">
                          <div className="surv-pulse alert mt-1.5 flex-shrink-0" />
                          <p className="text-xs leading-relaxed" style={{ color: 'var(--zinc-400)' }}>{pattern}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Anomalies */}
              {trade_pattern.anomalies.length > 0 && (
                <div className="mb-4">
                  <p className="text-xs font-bold mb-2" style={{ color: 'var(--zinc-400)' }}>Anomalies</p>
                  <div className="flex flex-wrap gap-2">
                    {trade_pattern.anomalies.map((anomaly, i) => (
                      <span key={i} className="category-tag" style={{ background: 'rgba(249,115,22,0.1)', color: 'var(--orange-400)', borderColor: 'rgba(249,115,22,0.2)' }}>
                        {anomaly}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Notes */}
              {trade_pattern.notes && (
                <div className="p-3 rounded-xl" style={{ background: 'var(--zinc-800)' }}>
                  <p className="text-xs font-bold mb-1" style={{ color: 'var(--zinc-400)' }}>Notes</p>
                  <p className="text-xs leading-relaxed" style={{ color: 'var(--zinc-500)' }}>{trade_pattern.notes}</p>
                </div>
              )}
            </>
          ) : (
            <EmptyState label="No trade patterns available" />
          )}
        </div>

        {/* ── Communications Monitor Panel ── */}
        <div className="card animate-fadeSlideUp stagger-2">
          <h3 className="text-sm font-extrabold mb-4 flex items-center gap-2" style={{ color: 'var(--orange-400)' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
            </svg>
            Communications
          </h3>

          {comms_monitor ? (
            <>
              {/* Flagged Communications */}
              {comms_monitor.flagged_communications.length > 0 && (
                <div className="mb-4">
                  <p className="text-xs font-bold mb-2 flex items-center gap-2" style={{ color: 'var(--zinc-400)' }}>
                    Flagged Communications
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                      style={{ background: 'rgba(249,115,22,0.1)', color: 'var(--orange-400)' }}>
                      {comms_monitor.flagged_communications.length}
                    </span>
                  </p>
                  <div className="space-y-2">
                    {comms_monitor.flagged_communications.map((comm, i) => (
                      <div key={i} className="comm-flag-card flagged animate-signalReveal" style={{ animationDelay: `${i * 0.1}s` }}>
                        <div className="flex items-start gap-2 pl-3">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--orange-500)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 mt-0.5">
                            <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
                            <line x1="4" y1="22" x2="4" y2="15" />
                          </svg>
                          <p className="text-xs leading-relaxed" style={{ color: 'var(--zinc-400)' }}>{comm}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Risk Indicators */}
              {comms_monitor.risk_indicators.length > 0 && (
                <div className="mb-4">
                  <p className="text-xs font-bold mb-2" style={{ color: 'var(--zinc-400)' }}>Risk Indicators</p>
                  <div className="space-y-2">
                    {comms_monitor.risk_indicators.map((indicator, i) => (
                      <div key={i} className="comm-flag-card indicator animate-signalReveal" style={{ animationDelay: `${i * 0.1}s` }}>
                        <div className="flex items-start gap-2 pl-3">
                          <div className="surv-pulse mt-1.5 flex-shrink-0" />
                          <p className="text-xs leading-relaxed" style={{ color: 'var(--zinc-400)' }}>{indicator}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Compliance Concerns */}
              {comms_monitor.compliance_concerns.length > 0 && (
                <div>
                  <p className="text-xs font-bold mb-2" style={{ color: 'var(--zinc-400)' }}>Compliance Concerns</p>
                  <div className="space-y-2">
                    {comms_monitor.compliance_concerns.map((concern, i) => (
                      <div key={i} className="comm-flag-card concern animate-signalReveal" style={{ animationDelay: `${i * 0.1}s` }}>
                        <div className="flex items-start gap-2 pl-3">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--red-500)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 mt-0.5">
                            <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                          </svg>
                          <p className="text-xs leading-relaxed" style={{ color: 'var(--zinc-400)' }}>{concern}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <EmptyState label="No communications data available" />
          )}
        </div>

        {/* ── Alert Panel ── */}
        <div className="card animate-fadeSlideUp stagger-3">
          <h3 className="text-sm font-extrabold mb-4 flex items-center gap-2" style={{ color: 'var(--green-400)' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            Alert Details
          </h3>

          {alert ? (
            <>
              {/* Alert Severity & Type */}
              <div className="p-4 rounded-xl mb-4" style={{ background: 'var(--zinc-800)' }}>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold" style={{ color: 'var(--zinc-400)' }}>Severity</span>
                  <span className={`severity-badge ${alert.severity.toLowerCase()}`}>{alert.severity}</span>
                </div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold" style={{ color: 'var(--zinc-400)' }}>Alert Type</span>
                  <span className="category-tag">{alert.alert_type}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold" style={{ color: 'var(--zinc-400)' }}>Escalation</span>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                    alert.escalation_required
                      ? ''
                      : ''
                  }`}
                    style={{
                      background: alert.escalation_required ? 'rgba(239,68,68,0.15)' : 'rgba(34,197,94,0.15)',
                      color: alert.escalation_required ? 'var(--red-400)' : 'var(--green-400)',
                    }}>
                    {alert.escalation_required ? 'REQUIRED' : 'NOT REQUIRED'}
                  </span>
                </div>
              </div>

              {/* Recommended Actions */}
              {alert.recommended_actions.length > 0 && (
                <div>
                  <p className="text-xs font-bold mb-2" style={{ color: 'var(--zinc-400)' }}>Recommended Actions</p>
                  <div className="space-y-2">
                    {alert.recommended_actions.map((action, i) => (
                      <div key={i} className="flex items-start gap-2 p-3 rounded-xl animate-signalReveal"
                        style={{ background: 'var(--zinc-800)', animationDelay: `${i * 0.1}s` }}>
                        <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                          style={{ background: 'rgba(34,197,94,0.15)' }}>
                          <span className="text-xs font-bold" style={{ color: 'var(--green-400)' }}>{i + 1}</span>
                        </div>
                        <p className="text-xs leading-relaxed" style={{ color: 'var(--zinc-400)' }}>{action}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <EmptyState label="No alert generated" />
          )}
        </div>
      </div>

      {/* ── Summary ── */}
      {result.summary && (
        <div className="card animate-fadeSlideUp stagger-4" style={{ borderLeft: '4px solid var(--cyan-500)' }}>
          <h3 className="text-sm font-extrabold mb-2 flex items-center gap-2" style={{ color: 'var(--zinc-300)' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--cyan-400)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 6h16M4 12h16M4 18h7" />
            </svg>
            Surveillance Summary
          </h3>
          <p className="text-sm leading-relaxed" style={{ color: 'var(--zinc-400)' }}>{result.summary}</p>
        </div>
      )}

      {/* ── Raw Analysis ── */}
      {Object.keys(result.raw_analysis).length > 0 && (
        <div className="card animate-fadeSlideUp stagger-5">
          <button
            onClick={() => setRawExpanded(!rawExpanded)}
            className="w-full flex items-center justify-between text-sm font-bold"
            style={{ color: 'var(--zinc-400)' }}
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
              style={{ background: 'var(--zinc-800)', color: 'var(--zinc-400)', fontFamily: 'ui-monospace, monospace' }}>
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
      <div className="w-10 h-10 rounded-full mx-auto mb-2 flex items-center justify-center" style={{ background: 'var(--zinc-800)' }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#52525B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="8" y1="15" x2="16" y2="15" />
          <line x1="9" y1="9" x2="9.01" y2="9" />
          <line x1="15" y1="9" x2="15.01" y2="9" />
        </svg>
      </div>
      <p className="text-xs" style={{ color: 'var(--zinc-500)' }}>{label}</p>
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
