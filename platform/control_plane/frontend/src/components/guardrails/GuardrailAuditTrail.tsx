/**
 * GuardrailAuditTrail — Complete audit log of guardrail changes with approval workflows
 */

import { useState, useMemo } from 'react';
import { Icon } from '../govern/icons';
import type { IconName } from '../govern/icons';

interface AuditEntry {
  id: string;
  timestamp: string;
  actor: string;
  actorRole: string;
  action: 'created' | 'updated' | 'deleted' | 'deployed' | 'approval_requested' | 'approved' | 'rejected' | 'assigned' | 'unassigned';
  targetType: 'guardrail' | 'rule' | 'assignment' | 'version';
  targetId: string;
  targetName: string;
  details: string;
  changes?: { field: string; oldValue: string; newValue: string }[];
  approvalStatus?: 'pending' | 'approved' | 'rejected';
  approver?: string;
  ipAddress?: string;
}

interface PendingApproval {
  id: string;
  requestedBy: string;
  requestedAt: string;
  guardrailId: string;
  guardrailName: string;
  changeType: string;
  changeSummary: string;
  riskLevel: 'low' | 'medium' | 'high';
  reviewers: string[];
}

const MOCK_AUDIT_ENTRIES: AuditEntry[] = [
  {
    id: 'audit-001',
    timestamp: '2024-06-08T15:30:00Z',
    actor: 'security-admin@example.com',
    actorRole: 'Admin',
    action: 'updated',
    targetType: 'guardrail',
    targetId: 'gr-001',
    targetName: 'FSI Standard',
    details: 'Modified content filter strengths',
    changes: [
      { field: 'MISCONDUCT.inputStrength', oldValue: 'MEDIUM', newValue: 'HIGH' },
      { field: 'MISCONDUCT.outputStrength', oldValue: 'MEDIUM', newValue: 'HIGH' },
    ],
    ipAddress: '10.0.1.45',
  },
  {
    id: 'audit-002',
    timestamp: '2024-06-08T14:15:00Z',
    actor: 'security.team@example.com',
    actorRole: 'Security',
    action: 'approved',
    targetType: 'guardrail',
    targetId: 'gr-001',
    targetName: 'FSI Standard',
    details: 'Approved deployment to production',
    approvalStatus: 'approved',
    approver: 'security.team@example.com',
    ipAddress: '10.0.2.12',
  },
  {
    id: 'audit-003',
    timestamp: '2024-06-08T12:00:00Z',
    actor: 'security-admin@example.com',
    actorRole: 'Admin',
    action: 'approval_requested',
    targetType: 'guardrail',
    targetId: 'gr-001',
    targetName: 'FSI Standard',
    details: 'Requested approval for production deployment',
    approvalStatus: 'pending',
    ipAddress: '10.0.1.45',
  },
  {
    id: 'audit-004',
    timestamp: '2024-06-08T10:30:00Z',
    actor: 'security-admin@example.com',
    actorRole: 'Admin',
    action: 'assigned',
    targetType: 'assignment',
    targetId: 'assign-001',
    targetName: 'FSI Standard → Customer Service Bot',
    details: 'Assigned guardrail to agent',
    ipAddress: '10.0.1.45',
  },
  {
    id: 'audit-005',
    timestamp: '2024-06-07T16:45:00Z',
    actor: 'compliance@example.com',
    actorRole: 'Compliance',
    action: 'created',
    targetType: 'rule',
    targetId: 'rule-insider',
    targetName: 'Insider Trading Detection',
    details: 'Added new denied topic for insider trading compliance',
    ipAddress: '10.0.3.8',
  },
  {
    id: 'audit-006',
    timestamp: '2024-06-07T14:20:00Z',
    actor: 'ml.ops@example.com',
    actorRole: 'MLOps',
    action: 'deployed',
    targetType: 'version',
    targetId: 'gr-001-v3',
    targetName: 'FSI Standard v3',
    details: 'Deployed version 3 to production',
    ipAddress: '10.0.4.22',
  },
  {
    id: 'audit-007',
    timestamp: '2024-06-06T09:00:00Z',
    actor: 'admin@example.com',
    actorRole: 'SuperAdmin',
    action: 'rejected',
    targetType: 'guardrail',
    targetId: 'gr-005',
    targetName: 'Experimental Filter',
    details: 'Rejected due to insufficient testing',
    approvalStatus: 'rejected',
    approver: 'admin@example.com',
    ipAddress: '10.0.1.1',
  },
];

const MOCK_PENDING_APPROVALS: PendingApproval[] = [
  {
    id: 'approval-001',
    requestedBy: 'developer@example.com',
    requestedAt: '2024-06-08T16:00:00Z',
    guardrailId: 'gr-002',
    guardrailName: 'Trading Compliance',
    changeType: 'Rule Addition',
    changeSummary: 'Add new denied topic for market manipulation detection',
    riskLevel: 'high',
    reviewers: ['security.team@example.com', 'compliance@example.com'],
  },
  {
    id: 'approval-002',
    requestedBy: 'security-admin@example.com',
    requestedAt: '2024-06-08T15:45:00Z',
    guardrailId: 'gr-001',
    guardrailName: 'FSI Standard',
    changeType: 'Filter Strength',
    changeSummary: 'Reduce INSULTS filter from HIGH to MEDIUM for customer service',
    riskLevel: 'medium',
    reviewers: ['security.team@example.com'],
  },
];

export default function GuardrailAuditTrail() {
  const [entries] = useState<AuditEntry[]>(MOCK_AUDIT_ENTRIES);
  const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>(MOCK_PENDING_APPROVALS);
  const [actionFilter, setActionFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [dateRange, setDateRange] = useState<'24h' | '7d' | '30d' | 'all'>('7d');

  const filteredEntries = useMemo(() => {
    return entries.filter(e => {
      if (actionFilter !== 'all' && e.action !== actionFilter) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return (
          e.actor.toLowerCase().includes(q) ||
          e.targetName.toLowerCase().includes(q) ||
          e.details.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [entries, actionFilter, searchQuery]);

  const handleApprove = (approvalId: string) => {
    setPendingApprovals(prev => prev.filter(a => a.id !== approvalId));
  };

  const handleReject = (approvalId: string) => {
    setPendingApprovals(prev => prev.filter(a => a.id !== approvalId));
  };

  const getActionStyle = (action: string): { bg: string; text: string; icon: IconName | string } => {
    switch (action) {
      case 'created': return { bg: 'bg-emerald-100', text: 'text-emerald-700', icon: 'check-circle' as IconName };
      case 'updated': return { bg: 'bg-blue-100', text: 'text-blue-700', icon: 'arrow-path' as IconName };
      case 'deleted': return { bg: 'bg-red-100', text: 'text-red-700', icon: 'x-circle' as IconName };
      case 'deployed': return { bg: 'bg-violet-100', text: 'text-violet-700', icon: 'rocket-launch' as IconName };
      case 'approval_requested': return { bg: 'bg-amber-100', text: 'text-amber-700', icon: 'exclamation-triangle' as IconName };
      case 'approved': return { bg: 'bg-emerald-100', text: 'text-emerald-700', icon: 'check' as IconName };
      case 'rejected': return { bg: 'bg-red-100', text: 'text-red-700', icon: 'x-mark' as IconName };
      case 'assigned': return { bg: 'bg-blue-100', text: 'text-blue-700', icon: 'link' as IconName };
      case 'unassigned': return { bg: 'bg-slate-100', text: 'text-slate-700', icon: 'link-slash' as IconName };
      default: return { bg: 'bg-slate-100', text: 'text-slate-700', icon: 'exclamation-triangle' as IconName };
    }
  };

  const getRiskStyle = (risk: string) => {
    switch (risk) {
      case 'high': return { bg: 'bg-red-100', text: 'text-red-700' };
      case 'medium': return { bg: 'bg-amber-100', text: 'text-amber-700' };
      case 'low': return { bg: 'bg-emerald-100', text: 'text-emerald-700' };
      default: return { bg: 'bg-slate-100', text: 'text-slate-700' };
    }
  };

  const formatTime = (iso: string) => {
    const date = new Date(iso);
    return date.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Audit Trail</h2>
          <p className="text-sm text-slate-500 mt-1">Complete history of guardrail changes and approvals</p>
        </div>
        <button className="px-4 py-2 text-xs font-medium bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Export Log
        </button>
      </div>

      {/* Pending Approvals */}
      {pendingApprovals.length > 0 && (
        <div className="p-4 bg-amber-50 rounded-xl border border-amber-200">
          <div className="flex items-center gap-2 mb-3">
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            <h3 className="text-sm font-semibold text-amber-800">
              {pendingApprovals.length} Pending Approval{pendingApprovals.length !== 1 ? 's' : ''}
            </h3>
          </div>
          <div className="space-y-3">
            {pendingApprovals.map(approval => {
              const riskStyle = getRiskStyle(approval.riskLevel);
              return (
                <div key={approval.id} className="p-3 bg-white rounded-lg border border-amber-200">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-semibold text-slate-900">{approval.guardrailName}</span>
                        <span className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded">
                          {approval.changeType}
                        </span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${riskStyle.bg} ${riskStyle.text}`}>
                          {approval.riskLevel.toUpperCase()} RISK
                        </span>
                      </div>
                      <p className="text-xs text-slate-600">{approval.changeSummary}</p>
                      <div className="flex items-center gap-3 mt-2 text-[10px] text-slate-500">
                        <span>Requested by: {approval.requestedBy}</span>
                        <span>{formatTime(approval.requestedAt)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleReject(approval.id)}
                        className="px-3 py-1.5 text-xs font-medium border border-red-200 text-red-600 rounded-lg hover:bg-red-50"
                      >
                        Reject
                      </button>
                      <button
                        onClick={() => handleApprove(approval.id)}
                        className="px-3 py-1.5 text-xs font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"
                      >
                        Approve
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="flex-1 relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search by actor, target, or details..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-sm border border-slate-200 rounded-lg"
          />
        </div>
        <select
          value={actionFilter}
          onChange={e => setActionFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-slate-200 rounded-lg"
        >
          <option value="all">All Actions</option>
          <option value="created">Created</option>
          <option value="updated">Updated</option>
          <option value="deleted">Deleted</option>
          <option value="deployed">Deployed</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="assigned">Assigned</option>
        </select>
        <div className="flex gap-1">
          {(['24h', '7d', '30d', 'all'] as const).map(range => (
            <button
              key={range}
              onClick={() => setDateRange(range)}
              className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
                dateRange === range ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {range === 'all' ? 'All' : range}
            </button>
          ))}
        </div>
      </div>

      {/* Audit Log */}
      <div className="border border-slate-200 rounded-xl overflow-hidden">
        <div className="bg-slate-50 px-4 py-2 border-b border-slate-200 grid grid-cols-[120px_150px_1fr_100px_100px] gap-4 text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
          <span>Timestamp</span>
          <span>Actor</span>
          <span>Action</span>
          <span>Target</span>
          <span>Details</span>
        </div>
        <div className="divide-y divide-slate-100">
          {filteredEntries.map(entry => {
            const actionStyle = getActionStyle(entry.action);
            return (
              <div key={entry.id} className="px-4 py-3 hover:bg-slate-50">
                <div className="grid grid-cols-[120px_150px_1fr_100px_100px] gap-4 items-start">
                  <div className="text-xs text-slate-500">{formatTime(entry.timestamp)}</div>
                  <div>
                    <div className="text-xs font-medium text-slate-700 truncate">{entry.actor}</div>
                    <div className="text-[10px] text-slate-400">{entry.actorRole}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`w-6 h-6 rounded flex items-center justify-center ${actionStyle.bg} ${actionStyle.text}`}>
                      <Icon name={actionStyle.icon as IconName} className="w-3.5 h-3.5" />
                    </span>
                    <div>
                      <div className="text-xs font-medium text-slate-900">{entry.action.replace('_', ' ')}</div>
                      <div className="text-[10px] text-slate-500">{entry.targetName}</div>
                    </div>
                  </div>
                  <div className="text-[10px] text-slate-500">{entry.targetType}</div>
                  <div className="text-[10px] text-slate-600 truncate" title={entry.details}>
                    {entry.details}
                  </div>
                </div>
                {entry.changes && entry.changes.length > 0 && (
                  <div className="mt-2 ml-[270px] flex flex-wrap gap-2">
                    {entry.changes.map((change, i) => (
                      <span key={i} className="text-[9px] px-2 py-1 bg-slate-100 rounded font-mono">
                        {change.field}: <span className="text-red-600 line-through">{change.oldValue}</span>
                        {' → '}
                        <span className="text-emerald-600">{change.newValue}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Compliance Note */}
      <div className="p-4 bg-blue-50 rounded-xl border border-blue-200">
        <div className="flex items-start gap-3">
          <svg className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <h4 className="text-sm font-semibold text-blue-800">Audit Log Retention</h4>
            <p className="text-xs text-blue-700 mt-1">
              All guardrail changes are retained for 7 years per SR 26-2 and SOX requirements.
              Logs are immutable and cryptographically signed. For compliance exports, use the Export Log button above.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
