// @ts-nocheck
import { useState } from 'react';
import type { InvestigationResponse, RegulatoryMapping } from '../types';

interface Props {
  result: InvestigationResponse;
}

/* ── Helper: Radial progress circle ── */
function RadialProgress({ value, size = 72, stroke = 6, color = '#D97706' }: { value: number; size?: number; stroke?: number; color?: string }) {
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

/* ── Helper: Severity badge ── */
function SeverityBadge({ severity }: { severity: string }) {
  const sev = severity.toLowerCase();
  return (
    <span className={`severity-badge ${sev}`}>
      <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor">
        <circle cx="4" cy="4" r="3" />
      </svg>
      {severity}
    </span>
  );
}

/* ── Helper: Status badge ── */
function StatusBadge({ status }: { status: string }) {
  const cls = status.toLowerCase().replace(/_/g, '-');
  return (
    <span className={`status-badge ${cls}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

/* ── Helper: Severity color ── */
function severityColor(severity: string): string {
  switch (severity.toUpperCase()) {
    case 'CRITICAL': return '#DC2626';
    case 'HIGH': return '#B45309';
    case 'MEDIUM': return '#D97706';
    case 'LOW': return '#0D9488';
    default: return '#94A3B8';
  }
}

/* ── Helper: Severity dot class ── */
function severityDotClass(severity: string): string {
  return severity.toLowerCase();
}

/* ── Regulatory Mapping Table ── */
function RegulatoryTable({ mappings }: { mappings: RegulatoryMapping[] }) {
  if (mappings.length === 0) return null;
  return (
    <div className="overflow-x-auto">
      <table className="reg-table">
        <thead>
          <tr>
            <th>Regulation</th>
            <th>Requirement</th>
            <th>Violation Type</th>
            <th>Severity</th>
            <th>Evidence Refs</th>
          </tr>
        </thead>
        <tbody>
          {mappings.map((m, i) => (
            <tr key={i}>
              <td className="font-semibold" style={{ color: 'var(--slate-900)' }}>{m.regulation}</td>
              <td>{m.requirement}</td>
              <td>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold"
                  style={{ background: '#FEF2F2', color: '#DC2626' }}>
                  {m.violation_type}
                </span>
              </td>
              <td><SeverityBadge severity={m.severity} /></td>
              <td>
                <div className="flex flex-wrap gap-1">
                  {m.evidence_references.map((ref, j) => (
                    <span key={j} className="inline-block px-1.5 py-0.5 rounded text-xs font-mono"
                      style={{ background: '#F1F5F9', color: '#475569', fontSize: '0.6rem' }}>
                      {ref}
                    </span>
                  ))}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ResultsPanelInternal({ result }: Props) {
  const [rawExpanded, setRawExpanded] = useState(false);
  const { findings, regulatory_mappings } = result;

  /* Compute severity distribution for the mini chart */
  const severityCounts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
  regulatory_mappings.forEach((m) => {
    if (m.severity in severityCounts) {
      severityCounts[m.severity as keyof typeof severityCounts]++;
    }
  });

  return (
    <div className="space-y-6 animate-fadeSlideUp">

      {/* ── Investigation Header ── */}
      <div className="card flex items-center justify-between" style={{ borderTop: '3px solid #D97706' }}>
        <div>
          <h2 className="text-lg font-extrabold" style={{ color: 'var(--slate-900)' }}>Investigation Result</h2>
          <div className="flex items-center gap-4 mt-1">
            <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
              ID: {result.investigation_id}
            </span>
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {new Date(result.timestamp).toLocaleString()}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {findings && <StatusBadge status={findings.status} />}
          <div className="text-xs font-bold px-3 py-1.5 rounded"
            style={{ background: '#FFFBEB', color: '#D97706', border: '1px solid #FEF3C7' }}>
            {result.entity_id}
          </div>
        </div>
      </div>

      {/* ── Key Metrics Row ── */}
      {findings && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 animate-fadeSlideUp stagger-1">
          <div className="card text-center py-4" style={{ borderLeft: '4px solid #DC2626' }}>
            <div className="text-2xl font-extrabold" style={{ color: '#DC2626' }}>{findings.violations_found}</div>
            <div className="text-xs font-semibold uppercase tracking-wider mt-1" style={{ color: 'var(--text-muted)' }}>Violations Found</div>
          </div>
          <div className="card text-center py-4" style={{ borderLeft: '4px solid #D97706' }}>
            <div className="text-2xl font-extrabold" style={{ color: '#D97706' }}>{findings.evidence_items.length}</div>
            <div className="text-xs font-semibold uppercase tracking-wider mt-1" style={{ color: 'var(--text-muted)' }}>Evidence Items</div>
          </div>
          <div className="card text-center py-4" style={{ borderLeft: '4px solid #0D9488' }}>
            <div className="text-2xl font-extrabold" style={{ color: '#0D9488' }}>{findings.patterns_identified.length}</div>
            <div className="text-xs font-semibold uppercase tracking-wider mt-1" style={{ color: 'var(--text-muted)' }}>Patterns Identified</div>
          </div>
          <div className="card text-center py-4" style={{ borderLeft: '4px solid #1E293B' }}>
            <div className="text-2xl font-extrabold" style={{ color: '#1E293B' }}>{regulatory_mappings.length}</div>
            <div className="text-xs font-semibold uppercase tracking-wider mt-1" style={{ color: 'var(--text-muted)' }}>Regulatory Mappings</div>
          </div>
        </div>
      )}

      {/* ── 2-Column Layout: Evidence + Patterns/Risk ── */}
      {findings && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* ── Evidence Items ── */}
          <div className="card animate-fadeSlideUp stagger-2">
            <h3 className="text-sm font-extrabold mb-4 flex items-center gap-2" style={{ color: '#D97706' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              Evidence Items
            </h3>
            {findings.evidence_items.length > 0 ? (
              <div className="space-y-2">
                {findings.evidence_items.map((item, i) => (
                  <div key={i} className="evidence-card animate-fadeSlideUp"
                    style={{ animationDelay: `${i * 0.1}s` }}>
                    <div className="evidence-card-marker" style={{ background: '#D97706' }} />
                    <div className="flex items-start gap-3 p-3 pl-5">
                      <div className="w-6 h-6 rounded flex items-center justify-center flex-shrink-0 mt-0.5"
                        style={{ background: '#FFFBEB' }}>
                        <span className="text-xs font-bold" style={{ color: '#D97706' }}>{i + 1}</span>
                      </div>
                      <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{item}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState label="No evidence collected" />
            )}
          </div>

          {/* ── Patterns + Risk Indicators ── */}
          <div className="space-y-6">
            {/* Patterns Identified */}
            <div className="card animate-fadeSlideUp stagger-2">
              <h3 className="text-sm font-extrabold mb-4 flex items-center gap-2" style={{ color: '#0D9488' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                Patterns Identified
              </h3>
              {findings.patterns_identified.length > 0 ? (
                <div className="violation-timeline">
                  {findings.patterns_identified.map((pattern, i) => (
                    <div key={i} className="violation-timeline-item">
                      <div className="violation-timeline-dot" style={{ background: '#0D9488', boxShadow: '0 0 0 2px #0D9488' }} />
                      <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{pattern}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState label="No patterns identified" />
              )}
            </div>

            {/* Risk Indicators */}
            <div className="card animate-fadeSlideUp stagger-3">
              <h3 className="text-sm font-extrabold mb-4 flex items-center gap-2" style={{ color: '#DC2626' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                Risk Indicators
              </h3>
              {findings.risk_indicators.length > 0 ? (
                <div className="space-y-2">
                  {findings.risk_indicators.map((risk, i) => (
                    <div key={i} className="risk-indicator">
                      <div className="w-2 h-2 rounded-full flex-shrink-0 animate-alertPulse" style={{ background: '#DC2626' }} />
                      <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{risk}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState label="No risk indicators" />
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Regulatory Mappings Table ── */}
      {regulatory_mappings.length > 0 && (
        <div className="card animate-fadeSlideUp stagger-3">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-extrabold flex items-center gap-2" style={{ color: 'var(--slate-900)' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1E293B" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
              Regulatory Mapping
            </h3>
            {/* Severity distribution mini-bar */}
            <div className="flex items-center gap-3">
              {Object.entries(severityCounts).map(([sev, count]) => count > 0 && (
                <div key={sev} className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full" style={{ background: severityColor(sev) }} />
                  <span className="text-xs font-bold" style={{ color: severityColor(sev) }}>{count}</span>
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{sev.toLowerCase()}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Violation Timeline above table */}
          <div className="mb-5 p-4 rounded-lg" style={{ background: '#F8FAFC' }}>
            <p className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>
              Violation Severity Timeline
            </p>
            <div className="violation-timeline">
              {regulatory_mappings.map((m, i) => (
                <div key={i} className="violation-timeline-item">
                  <div className={`violation-timeline-dot ${severityDotClass(m.severity)}`} />
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold" style={{ color: 'var(--slate-900)' }}>{m.regulation}</span>
                    <SeverityBadge severity={m.severity} />
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{m.violation_type}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <RegulatoryTable mappings={regulatory_mappings} />
        </div>
      )}

      {/* ── Recommendations ── */}
      {findings && findings.recommendations.length > 0 && (
        <div className="card animate-fadeSlideUp stagger-4" style={{ borderLeft: '4px solid #0D9488' }}>
          <h3 className="text-sm font-extrabold mb-3 flex items-center gap-2" style={{ color: '#0D9488' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Recommendations
          </h3>
          <div className="space-y-2">
            {findings.recommendations.map((rec, i) => (
              <div key={i} className="flex items-start gap-2">
                <div className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0 mt-0.5"
                  style={{ background: '#F0FDFA' }}>
                  <span className="text-xs font-bold" style={{ color: '#0D9488' }}>{i + 1}</span>
                </div>
                <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{rec}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Summary ── */}
      {result.summary && (
        <div className="card animate-fadeSlideUp stagger-4" style={{ borderLeft: '4px solid #D97706' }}>
          <h3 className="text-sm font-extrabold mb-2 flex items-center gap-2" style={{ color: 'var(--slate-900)' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 6h16M4 12h16M4 18h7" />
            </svg>
            Investigation Summary
          </h3>
          <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{result.summary}</p>
        </div>
      )}

      {/* ── Raw Analysis ── */}
      {Object.keys(result.raw_analysis).length > 0 && (
        <div className="card animate-fadeSlideUp stagger-5">
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
            <pre className="mt-4 p-4 rounded-lg text-xs overflow-x-auto"
              style={{ background: '#0F172A', color: '#94A3B8', fontFamily: 'ui-monospace, monospace' }}>
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
      <div className="w-10 h-10 rounded-full mx-auto mb-2 flex items-center justify-center" style={{ background: '#F1F5F9' }}>
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
