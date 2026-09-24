import React, { useState, useMemo } from 'react';
import {
  issuesData,
  computeAging,
  computeAgingStatus,
  isOverdue,
  getIssuesSummary,
  type Finding,
  type FindingSeverity,
  type FindingStatus,
  type FindingSource,
  type AgingStatus,
} from '../../data/issuesTrackerData';

const severityConfig: Record<FindingSeverity, { icon: string; color: string; bg: string; label: string }> = {
  critical: { icon: '🔴', color: '#ef4444', bg: 'rgba(239,68,68,0.1)', label: 'Critical' },
  high: { icon: '🟠', color: '#f97316', bg: 'rgba(249,115,22,0.1)', label: 'High' },
  medium: { icon: '🟡', color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', label: 'Medium' },
  low: { icon: '🟢', color: '#10b981', bg: 'rgba(16,185,129,0.1)', label: 'Low' },
};

const statusConfig: Record<FindingStatus, { color: string; label: string }> = {
  open: { color: '#ef4444', label: 'Open' },
  in_progress: { color: '#f59e0b', label: 'In Progress' },
  remediated: { color: '#3b82f6', label: 'Remediated' },
  closed: { color: '#10b981', label: 'Closed' },
};

const sourceLabels: Record<FindingSource, string> = {
  internal_audit: 'Internal Audit',
  external_audit: 'External Audit',
  self_assessment: 'Self-Assessment',
  regulatory_exam: 'Regulatory Exam',
};

const agingColors: Record<AgingStatus, string> = {
  green: '#10b981',
  amber: '#f59e0b',
  red: '#ef4444',
};

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function FindingRow({ finding, expanded, onToggle }: {
  finding: Finding;
  expanded: boolean;
  onToggle: () => void;
}) {
  const sev = severityConfig[finding.severity];
  const stat = statusConfig[finding.status];
  const aging = computeAging(finding);
  const agingStatus = computeAgingStatus(finding);
  const overdue = isOverdue(finding);

  return (
    <div style={{ borderBottom: '1px solid var(--border)' }}>
      <div
        onClick={onToggle}
        style={{ display: 'grid', gridTemplateColumns: '90px 100px 70px 1fr 90px 80px 80px 60px', alignItems: 'center', padding: '12px 16px', cursor: 'pointer', gap: '8px' }}
      >
        <span style={{ fontSize: '0.68rem', fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>{finding.id}</span>
        <span style={{ fontSize: '0.63rem', color: 'var(--text-muted)' }}>{sourceLabels[finding.source]}</span>
        <span style={{ fontSize: '0.6rem', fontWeight: 600, padding: '2px 6px', borderRadius: '4px', background: sev.bg, color: sev.color, textAlign: 'center' }}>
          {sev.icon} {sev.label}
        </span>
        <span style={{ fontSize: '0.7rem', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {finding.title}
        </span>
        <span style={{ fontSize: '0.63rem', color: 'var(--text-secondary)' }}>{finding.owner}</span>
        <span style={{ fontSize: '0.63rem', fontWeight: 600, color: stat.color }}>
          {stat.label}
        </span>
        <span style={{ fontSize: '0.63rem', color: overdue ? '#ef4444' : 'var(--text-muted)', fontWeight: overdue ? 600 : 400 }}>
          {overdue ? 'OVERDUE' : formatDate(finding.targetDate)}
        </span>
        <span style={{ fontSize: '0.65rem', fontWeight: 600, color: agingColors[agingStatus] }}>
          {finding.closedDate ? `${aging}d` : `${aging}d`}
        </span>
      </div>

      {/* Expanded */}
      {expanded && (
        <div style={{ padding: '0 16px 16px', background: 'var(--bg-secondary)', borderTop: '1px solid var(--border)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', paddingTop: '12px' }}>
            <div>
              <div style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>Description</div>
              <div style={{ fontSize: '0.63rem', color: 'var(--text-secondary)', marginBottom: '12px' }}>{finding.description}</div>
              <div style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>Root Cause</div>
              <div style={{ fontSize: '0.63rem', color: 'var(--text-secondary)', marginBottom: '12px' }}>{finding.rootCause}</div>
              <div style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>Remediation Plan</div>
              <div style={{ fontSize: '0.63rem', color: 'var(--text-secondary)' }}>{finding.remediationPlan}</div>
            </div>
            <div>
              <div style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>Owner</div>
              <div style={{ fontSize: '0.63rem', color: 'var(--text-secondary)', marginBottom: '12px' }}>{finding.owner} ({finding.ownerRole})</div>
              <div style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>Opened</div>
              <div style={{ fontSize: '0.63rem', color: 'var(--text-secondary)', marginBottom: '12px' }}>{formatDate(finding.openedDate)}</div>
              <div style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>Target Date</div>
              <div style={{ fontSize: '0.63rem', color: overdue ? '#ef4444' : 'var(--text-secondary)', fontWeight: overdue ? 600 : 400, marginBottom: '12px' }}>
                {formatDate(finding.targetDate)} {overdue && '(OVERDUE)'}
              </div>
              <div style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>Linked Controls</div>
              <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                {finding.linkedControls.map(c => (
                  <span key={c} style={{ fontSize: '0.6rem', padding: '2px 6px', borderRadius: '4px', background: 'rgba(59,130,246,0.1)', color: '#3b82f6' }}>{c}</span>
                ))}
              </div>
              {finding.remediationEvidence && (
                <>
                  <div style={{ fontSize: '0.65rem', fontWeight: 600, color: '#10b981', marginTop: '12px', marginBottom: '4px' }}>Remediation Evidence</div>
                  <div style={{ fontSize: '0.63rem', color: 'var(--text-secondary)' }}>{finding.remediationEvidence}</div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function IssuesTracker() {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<FindingStatus | 'all'>('all');
  const [severityFilter, setSeverityFilter] = useState<FindingSeverity | 'all'>('all');
  const summary = useMemo(() => getIssuesSummary(), []);

  const filtered = useMemo(() => {
    let result = issuesData;
    if (statusFilter !== 'all') result = result.filter(f => f.status === statusFilter);
    if (severityFilter !== 'all') result = result.filter(f => f.severity === severityFilter);
    // Sort: overdue first, then by aging descending
    return [...result].sort((a, b) => {
      const aOverdue = isOverdue(a) ? 1 : 0;
      const bOverdue = isOverdue(b) ? 1 : 0;
      if (aOverdue !== bOverdue) return bOverdue - aOverdue;
      return computeAging(b) - computeAging(a);
    });
  }, [statusFilter, severityFilter]);

  return (
    <div style={{ background: 'var(--bg-secondary)', borderRadius: '12px', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '20px 20px 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <div>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
              Issues & Findings
            </h3>
            <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', margin: '4px 0 0' }}>
              Audit findings lifecycle — identification through closure
            </p>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as FindingStatus | 'all')}
              style={{ fontSize: '0.68rem', padding: '4px 8px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)' }}>
              <option value="all">All Status</option>
              <option value="open">Open</option>
              <option value="in_progress">In Progress</option>
              <option value="remediated">Remediated</option>
              <option value="closed">Closed</option>
            </select>
            <select value={severityFilter} onChange={(e) => setSeverityFilter(e.target.value as FindingSeverity | 'all')}
              style={{ fontSize: '0.68rem', padding: '4px 8px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)' }}>
              <option value="all">All Severity</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
        </div>

        {/* Summary stats */}
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.68rem', padding: '4px 10px', borderRadius: '6px', background: 'rgba(239,68,68,0.1)', color: '#ef4444', fontWeight: 600 }}>
            {summary.totalOpen} open
          </span>
          {summary.critical > 0 && (
            <span style={{ fontSize: '0.68rem', padding: '4px 10px', borderRadius: '6px', background: 'rgba(239,68,68,0.1)', color: '#ef4444', fontWeight: 600 }}>
              {summary.critical} critical
            </span>
          )}
          {summary.overdue > 0 && (
            <span style={{ fontSize: '0.68rem', padding: '4px 10px', borderRadius: '6px', background: 'rgba(239,68,68,0.15)', color: '#ef4444', fontWeight: 600 }}>
              {summary.overdue} overdue
            </span>
          )}
          <span style={{ fontSize: '0.68rem', padding: '4px 10px', borderRadius: '6px', background: 'rgba(100,116,139,0.1)', color: 'var(--text-muted)', fontWeight: 600 }}>
            Oldest: {summary.oldestOpenDays}d
          </span>
        </div>
      </div>

      {/* Column Headers */}
      <div style={{ display: 'grid', gridTemplateColumns: '90px 100px 70px 1fr 90px 80px 80px 60px', padding: '8px 16px', borderBottom: '2px solid var(--border)', borderTop: '1px solid var(--border)', gap: '8px' }}>
        {['ID', 'Source', 'Severity', 'Description', 'Owner', 'Status', 'Target', 'Aging'].map(h => (
          <span key={h} style={{ fontSize: '0.6rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{h}</span>
        ))}
      </div>

      {/* Rows */}
      {filtered.map(finding => (
        <FindingRow
          key={finding.id}
          finding={finding}
          expanded={expandedId === finding.id}
          onToggle={() => setExpandedId(expandedId === finding.id ? null : finding.id)}
        />
      ))}

      {filtered.length === 0 && (
        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
          No findings match the current filters
        </div>
      )}
    </div>
  );
}
