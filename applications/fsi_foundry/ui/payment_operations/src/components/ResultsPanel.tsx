// @ts-nocheck
import { useState } from 'react';
import type { RuntimeConfig } from '../config';
import type { OperationsResponse, ExceptionResolution, SettlementResult } from '../types';

interface Props {
  result: OperationsResponse;
  config: RuntimeConfig;
}

/* ── Severity gauge (animated SVG arc) ── */
function SeverityGauge({ severity }: { severity: ExceptionResolution['severity'] }) {
  const severityMap: Record<string, { pct: number; color: string }> = {
    LOW: { pct: 0.25, color: '#14B8A6' },
    MEDIUM: { pct: 0.5, color: '#FBBF24' },
    HIGH: { pct: 0.75, color: '#F97316' },
    CRITICAL: { pct: 1.0, color: '#F87171' },
  };
  const { pct, color } = severityMap[severity] || severityMap.LOW;
  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - pct);

  return (
    <div style={{ textAlign: 'center' }}>
      <svg width="120" height="120" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r={radius} className="gauge-ring-bg" strokeWidth="8" />
        <circle
          cx="60" cy="60" r={radius}
          className="gauge-ring"
          strokeWidth="8"
          stroke={color}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform="rotate(-90 60 60)"
          style={{ animation: `gaugeArc 1.5s ease-out` }}
        />
        <text x="60" y="56" textAnchor="middle" fill={color} fontSize="14" fontWeight="800" fontFamily="monospace">
          {severity}
        </text>
        <text x="60" y="72" textAnchor="middle" fill="var(--text-muted)" fontSize="9">
          Severity
        </text>
      </svg>
    </div>
  );
}

/* ── Settlement status badge helper ── */
function settlementBadgeClass(status: SettlementResult['status']): string {
  const map: Record<string, string> = {
    PENDING: 'settlement-pending',
    SETTLED: 'settlement-settled',
    FAILED: 'settlement-failed',
    REQUIRES_ACTION: 'settlement-requires_action',
  };
  return map[status] || 'settlement-pending';
}

/* ── Accordion for raw analysis ── */
function RawAccordion({ agentId, data, config }: { agentId: string; data: unknown; config: RuntimeConfig }) {
  const [open, setOpen] = useState(false);
  const agent = config.agents.find((a) => a.id === agentId);
  const isException = agentId === 'exception_handler';
  const accentColor = isException ? 'var(--copper)' : 'var(--teal)';

  return (
    <div style={{ border: '1px solid rgba(71,85,105,0.2)', borderRadius: 8, overflow: 'hidden', marginBottom: '0.5rem' }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.75rem 1rem',
          background: isException ? 'rgba(234,88,12,0.05)' : 'rgba(13,148,136,0.05)',
          border: 'none',
          cursor: 'pointer',
          borderLeft: `3px solid ${accentColor}`,
        }}
      >
        <span style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-primary)' }}>
          {agent?.name || agentId}
        </span>
        <svg
          width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)"
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease' }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      <div className={`accordion-content ${open ? 'open' : ''}`}>
        <pre
          className="mono"
          style={{
            padding: '1rem',
            fontSize: '0.75rem',
            color: 'var(--text-secondary)',
            background: 'rgba(15,23,42,0.6)',
            margin: 0,
            overflowX: 'auto',
            lineHeight: 1.6,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {JSON.stringify(data, null, 2)}
        </pre>
      </div>
    </div>
  );
}

function ResultsPanelInternal({ result, config }: Props) {
  return (
    <div className="animate-fade-slide-up">
      {/* ── Operation Header ── */}
      <div
        className="card"
        style={{
          marginBottom: '1.5rem',
          display: 'flex',
          flexWrap: 'wrap',
          gap: '1.5rem',
          alignItems: 'center',
        }}
      >
        <div>
          <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.2rem' }}>
            Operation
          </div>
          <div className="mono" style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--copper-light)' }}>
            {result.operation_id}
          </div>
        </div>
        <div style={{ width: 1, height: 36, background: 'rgba(71,85,105,0.3)' }} />
        <div>
          <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.2rem' }}>
            Customer
          </div>
          <div className="mono" style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)' }}>
            {result.customer_id}
          </div>
        </div>
        <div style={{ width: 1, height: 36, background: 'rgba(71,85,105,0.3)' }} />
        <div>
          <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.2rem' }}>
            Timestamp
          </div>
          <div className="mono" style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            {result.timestamp}
          </div>
        </div>
      </div>

      {/* ── Two-column results ── */}
      <div className="grid md:grid-cols-2 gap-6 mb-6">
        {/* Exception Resolution */}
        {result.exception_resolution && (
          <div
            className="card"
            style={{
              borderTop: '3px solid var(--copper)',
              opacity: 0,
              animation: 'fadeSlideUp 0.5s ease-out 0.1s forwards',
            }}
          >
            <h3 style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#F97316" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
              Exception Resolution
            </h3>

            {/* Severity Gauge */}
            <SeverityGauge severity={result.exception_resolution.severity} />

            {/* Severity badge */}
            <div style={{ textAlign: 'center', margin: '0.75rem 0' }}>
              <span className={`severity-${result.exception_resolution.severity.toLowerCase()}`}>
                {result.exception_resolution.severity}
              </span>
            </div>

            {/* Resolution text */}
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.3rem' }}>
                Resolution
              </div>
              <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
                {result.exception_resolution.resolution}
              </p>
            </div>

            {/* Actions taken */}
            {result.exception_resolution.actions_taken.length > 0 && (
              <div style={{ marginBottom: '1rem' }}>
                <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.3rem' }}>
                  Actions Taken
                </div>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  {result.exception_resolution.actions_taken.map((action, i) => (
                    <li
                      key={i}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '0.5rem',
                        padding: '0.3rem 0',
                        fontSize: '0.83rem',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#F97316" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 2 }}>
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      {action}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Escalation */}
            <div>
              <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.3rem' }}>
                Escalation Required
              </div>
              <span
                style={{
                  display: 'inline-block',
                  padding: '0.25rem 0.7rem',
                  borderRadius: 6,
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  fontFamily: 'monospace',
                  letterSpacing: '0.05em',
                  background: result.exception_resolution.requires_escalation
                    ? 'rgba(220,38,38,0.12)'
                    : 'rgba(13,148,136,0.12)',
                  color: result.exception_resolution.requires_escalation
                    ? '#F87171'
                    : 'var(--teal-light)',
                  border: `1px solid ${result.exception_resolution.requires_escalation ? 'rgba(220,38,38,0.3)' : 'rgba(13,148,136,0.3)'}`,
                }}
              >
                {result.exception_resolution.requires_escalation ? 'YES - ESCALATE' : 'NO'}
              </span>
            </div>
          </div>
        )}

        {/* Settlement Result */}
        {result.settlement_result && (
          <div
            className="card"
            style={{
              borderTop: '3px solid var(--teal)',
              opacity: 0,
              animation: 'fadeSlideUp 0.5s ease-out 0.2s forwards',
            }}
          >
            <h3 style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#14B8A6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
              Settlement Result
            </h3>

            {/* Status badge */}
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.3rem' }}>
                Status
              </div>
              <span className={settlementBadgeClass(result.settlement_result.status)}>
                {result.settlement_result.status.replace('_', ' ')}
              </span>
            </div>

            {/* Settlement date */}
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.3rem' }}>
                Settlement Date
              </div>
              <div className="mono" style={{ fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                {result.settlement_result.settlement_date || 'N/A'}
              </div>
            </div>

            {/* Reconciliation status */}
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.3rem' }}>
                Reconciliation
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                {result.settlement_result.reconciled ? (
                  <>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#14B8A6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                      <polyline points="22 4 12 14.01 9 11.01" />
                    </svg>
                    <span style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--teal-light)' }}>Reconciled</span>
                  </>
                ) : (
                  <>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#F87171" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="15" y1="9" x2="9" y2="15" />
                      <line x1="9" y1="9" x2="15" y2="15" />
                    </svg>
                    <span style={{ fontSize: '0.88rem', fontWeight: 600, color: '#F87171' }}>Not Reconciled</span>
                  </>
                )}
              </div>
            </div>

            {/* Notes */}
            {result.settlement_result.notes.length > 0 && (
              <div>
                <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.3rem' }}>
                  Notes
                </div>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  {result.settlement_result.notes.map((note, i) => (
                    <li
                      key={i}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '0.5rem',
                        padding: '0.3rem 0',
                        fontSize: '0.83rem',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--teal)', flexShrink: 0, marginTop: 6 }} />
                      {note}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Summary ── */}
      <div
        className="card"
        style={{
          marginBottom: '1.5rem',
          opacity: 0,
          animation: 'fadeSlideUp 0.5s ease-out 0.3s forwards',
        }}
      >
        <h3 style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
          Summary
        </h3>
        <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.7, margin: 0 }}>
          {result.summary}
        </p>
      </div>

      {/* ── Raw Analysis Accordions ── */}
      {result.raw_analysis && Object.keys(result.raw_analysis).length > 0 && (
        <div
          style={{
            opacity: 0,
            animation: 'fadeSlideUp 0.5s ease-out 0.4s forwards',
          }}
        >
          <h3 style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)', marginBottom: '0.75rem' }}>
            Raw Agent Analysis
          </h3>
          {Object.entries(result.raw_analysis).map(([agentId, data]) => (
            <RawAccordion key={agentId} agentId={agentId} data={data} config={config} />
          ))}
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
