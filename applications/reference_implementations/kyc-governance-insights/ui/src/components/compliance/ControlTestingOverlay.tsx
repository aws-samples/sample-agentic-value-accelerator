import React, { useState, useMemo } from 'react';
import {
  controlTestingRecords,
  computeTestDueStatus,
  getControlTestingSummary,
  type ControlTestRecord,
  type TestResult,
  type TestDueStatus,
} from '../../data/controlTestingData';

const resultConfig: Record<TestResult, { icon: string; color: string; bg: string; label: string }> = {
  pass: { icon: '✅', color: '#10b981', bg: 'rgba(16,185,129,0.1)', label: 'Pass' },
  fail: { icon: '❌', color: '#ef4444', bg: 'rgba(239,68,68,0.1)', label: 'Fail' },
  partial: { icon: '⚠️', color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', label: 'Partial' },
};

const dueConfig: Record<TestDueStatus, { color: string }> = {
  current: { color: 'var(--text-secondary)' },
  pending: { color: '#f59e0b' },
  overdue: { color: '#ef4444' },
};

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function TestRecordRow({ record, expanded, onToggle }: {
  record: ControlTestRecord;
  expanded: boolean;
  onToggle: () => void;
}) {
  const result = resultConfig[record.testResult];
  const dueStatus = computeTestDueStatus(record);
  const dueCfg = dueConfig[dueStatus];

  return (
    <div style={{ borderBottom: '1px solid var(--border)' }}>
      <div
        onClick={onToggle}
        style={{ display: 'grid', gridTemplateColumns: '90px 160px 100px 80px 100px 1fr', alignItems: 'center', padding: '12px 16px', cursor: 'pointer', gap: '8px' }}
      >
        <span style={{ fontSize: '0.7rem', fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>{record.controlId}</span>
        <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>{record.tester.split(',')[0]}</span>
        <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>{formatDate(record.lastTested)}</span>
        <span style={{ fontSize: '0.62rem', fontWeight: 600, padding: '2px 6px', borderRadius: '4px', background: result.bg, color: result.color, textAlign: 'center' }}>
          {result.icon} {result.label}
        </span>
        <span style={{ fontSize: '0.63rem', color: 'var(--text-muted)' }}>{record.cadence}</span>
        <span style={{ fontSize: '0.65rem', fontWeight: dueStatus !== 'current' ? 600 : 400, color: dueCfg.color }}>
          {dueStatus === 'overdue' ? 'OVERDUE' : formatDate(record.nextDue)}
        </span>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div style={{ padding: '0 16px 16px', background: 'var(--bg-secondary)', borderTop: '1px solid var(--border)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', paddingTop: '12px' }}>
            <div>
              <div style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>Test Procedure</div>
              <div style={{ fontSize: '0.63rem', color: 'var(--text-secondary)', marginBottom: '10px' }}>{record.testProcedure}</div>
              <div style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>Observations</div>
              <div style={{ fontSize: '0.63rem', color: 'var(--text-secondary)' }}>{record.observations}</div>
              {record.exceptions && (
                <>
                  <div style={{ fontSize: '0.65rem', fontWeight: 600, color: '#ef4444', marginTop: '10px', marginBottom: '4px' }}>Exceptions</div>
                  <div style={{ fontSize: '0.63rem', color: 'var(--text-secondary)' }}>{record.exceptions}</div>
                </>
              )}
            </div>
            <div>
              <div style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>Tester</div>
              <div style={{ fontSize: '0.63rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>{record.tester}</div>
              <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', fontStyle: 'italic', marginBottom: '10px' }}>{record.testerIndependence}</div>
              <div style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>Methodology</div>
              <div style={{ fontSize: '0.63rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>{record.methodology.replace(/_/g, ' ')}</div>
              {record.sampleSize && (
                <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>Sample: {record.sampleSize}</div>
              )}
              <div style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--text-primary)', marginTop: '10px', marginBottom: '6px' }}>Evidence</div>
              <div style={{ fontSize: '0.63rem', color: 'var(--accent)', cursor: 'pointer' }}>{record.evidenceLink}</div>
              {record.remediationAction && (
                <>
                  <div style={{ fontSize: '0.65rem', fontWeight: 600, color: '#f59e0b', marginTop: '10px', marginBottom: '4px' }}>Remediation</div>
                  <div style={{ fontSize: '0.63rem', color: 'var(--text-secondary)' }}>{record.remediationAction}</div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ControlTestingOverlay() {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [resultFilter, setResultFilter] = useState<TestResult | 'all'>('all');
  const summary = useMemo(() => getControlTestingSummary(), []);

  const filtered = useMemo(() => {
    if (resultFilter === 'all') return controlTestingRecords;
    return controlTestingRecords.filter(r => r.testResult === resultFilter);
  }, [resultFilter]);

  return (
    <div style={{ background: 'var(--bg-secondary)', borderRadius: '12px', overflow: 'hidden' }}>
      {/* Header + Summary Bar */}
      <div style={{ padding: '20px 20px 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <div>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
              Control Testing Evidence
            </h3>
            <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', margin: '4px 0 0' }}>
              Operating effectiveness testing — PRA SS1/23 Principle 4
            </p>
          </div>
          <select
            value={resultFilter}
            onChange={(e) => setResultFilter(e.target.value as TestResult | 'all')}
            style={{ fontSize: '0.7rem', padding: '4px 8px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)' }}
          >
            <option value="all">All Results</option>
            <option value="pass">Pass only</option>
            <option value="partial">Partial only</option>
            <option value="fail">Fail only</option>
          </select>
        </div>

        {/* Summary stats */}
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.68rem', padding: '4px 10px', borderRadius: '6px', background: 'rgba(16,185,129,0.1)', color: '#10b981', fontWeight: 600 }}>
            {summary.testedLast90Days} tested (90d)
          </span>
          <span style={{ fontSize: '0.68rem', padding: '4px 10px', borderRadius: '6px', background: 'rgba(16,185,129,0.1)', color: '#10b981', fontWeight: 600 }}>
            {summary.passed} passed
          </span>
          {summary.partial > 0 && (
            <span style={{ fontSize: '0.68rem', padding: '4px 10px', borderRadius: '6px', background: 'rgba(245,158,11,0.1)', color: '#f59e0b', fontWeight: 600 }}>
              {summary.partial} partial
            </span>
          )}
          {summary.failed > 0 && (
            <span style={{ fontSize: '0.68rem', padding: '4px 10px', borderRadius: '6px', background: 'rgba(239,68,68,0.1)', color: '#ef4444', fontWeight: 600 }}>
              {summary.failed} failed
            </span>
          )}
          {summary.pending > 0 && (
            <span style={{ fontSize: '0.68rem', padding: '4px 10px', borderRadius: '6px', background: 'rgba(245,158,11,0.1)', color: '#f59e0b', fontWeight: 600 }}>
              {summary.pending} pending
            </span>
          )}
          {summary.overdue > 0 && (
            <span style={{ fontSize: '0.68rem', padding: '4px 10px', borderRadius: '6px', background: 'rgba(239,68,68,0.1)', color: '#ef4444', fontWeight: 600 }}>
              {summary.overdue} overdue
            </span>
          )}
        </div>
      </div>

      {/* Column Headers */}
      <div style={{ display: 'grid', gridTemplateColumns: '90px 160px 100px 80px 100px 1fr', padding: '8px 16px', borderBottom: '2px solid var(--border)', borderTop: '1px solid var(--border)', gap: '8px' }}>
        {['Control ID', 'Tester', 'Last Tested', 'Result', 'Cadence', 'Next Due'].map(h => (
          <span key={h} style={{ fontSize: '0.6rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{h}</span>
        ))}
      </div>

      {/* Rows */}
      {filtered.map(record => (
        <TestRecordRow
          key={record.controlId}
          record={record}
          expanded={expandedId === record.controlId}
          onToggle={() => setExpandedId(expandedId === record.controlId ? null : record.controlId)}
        />
      ))}
    </div>
  );
}
