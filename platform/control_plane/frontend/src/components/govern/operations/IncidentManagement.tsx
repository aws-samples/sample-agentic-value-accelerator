/**
 * IncidentManagement - Full incident lifecycle management for AI/ML agent operations
 *
 * Features:
 * - KPI row with open incidents, MTTR, MTTA, and other metrics
 * - Kanban board view with drag-and-drop workflow columns
 * - Table view with filtering and sorting
 * - Create Incident modal with agent linking
 * - Incident Detail drawer with timeline, runbooks, and communications
 * - Actions: Acknowledge, Escalate, Assign, Comment, Run Runbook, Resolve, Create Postmortem
 *
 * FSI-specific scenarios: trading system latency, KYC failures, fraud detection issues
 *
 * Live data integration:
 * - useIncidents(filters) for incident list
 * - useIncidentDetail(id) for drawer detail
 * - useIncidentMutations() for create/update actions with optimistic updates
 * - useOpsMetrics() for MTTR/MTTA KPIs
 */

import { useState, useMemo, useCallback } from 'react';
import { Icon, type IconName } from '../icons';
import StatCard from '../StatCard';
import Drawer from '../Drawer';
import {
  useIncidents,
  useIncidentMutations,
  useOpsMetrics,
  type Incident,
  type IncidentSeverity,
  type IncidentStatus,
} from './useIncidents';
import type { IncidentTimelineEntry } from '../../../api/client';

// ============================================================================
// Local Type Aliases (for backward compatibility with existing components)
// ============================================================================

type Severity = IncidentSeverity;

// ============================================================================
// Reference Data
// ============================================================================

const AGENTS = [
  'trading-order-agent',
  'kyc-verification-agent',
  'fraud-detection-agent',
  'risk-assessment-agent',
  'market-data-agent',
  'compliance-monitor-agent',
  'aml-screening-agent',
  'portfolio-rebalance-agent',
  'customer-service-agent',
  'credit-scoring-agent',
];

const OWNERS = [
  'John Smith',
  'Sarah Chen',
  'Mike Johnson',
  'Emily Davis',
  'Alex Kumar',
  'Rachel Wong',
];

const RUNBOOKS = [
  { id: 'RB-TRADING-001', name: 'Trading Latency Mitigation', description: 'Steps to diagnose and resolve trading latency issues' },
  { id: 'RB-KYC-002', name: 'KYC Timeout Recovery', description: 'Recovery steps for KYC verification timeouts' },
  { id: 'RB-KYC-003', name: 'KYC Third-Party API Failover', description: 'Failover to backup identity verification provider' },
  { id: 'RB-FRAUD-001', name: 'Fraud Model Rollback', description: 'Rollback fraud detection model to previous version' },
  { id: 'RB-CREDIT-001', name: 'Credit Scoring Performance', description: 'Performance optimization for credit scoring agent' },
  { id: 'RB-CS-001', name: 'Customer Service Quality', description: 'Quality recovery for customer service agent' },
  { id: 'RB-MARKET-001', name: 'Market Data Recovery', description: 'Market data feed reconnection procedures' },
  { id: 'RB-AML-001', name: 'AML Queue Processing', description: 'Expedited AML queue processing procedures' },
  { id: 'RB-RISK-001', name: 'Risk Data Refresh', description: 'Force refresh of risk calculation data' },
];

// ============================================================================
// Styling Constants
// ============================================================================

const SEVERITY_CONFIG: Record<Severity, { bg: string; text: string; border: string; icon: IconName }> = {
  Critical: { bg: 'bg-red-100', text: 'text-red-700', border: 'border-red-300', icon: 'exclamation-circle' },
  High: { bg: 'bg-orange-100', text: 'text-orange-700', border: 'border-orange-300', icon: 'exclamation-triangle' },
  Medium: { bg: 'bg-amber-100', text: 'text-amber-700', border: 'border-amber-300', icon: 'bell-alert' },
  Low: { bg: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-300', icon: 'information-circle' },
};

const STATUS_CONFIG: Record<IncidentStatus, { bg: string; text: string; border: string }> = {
  New: { bg: 'bg-slate-100', text: 'text-slate-700', border: 'border-slate-300' },
  Triaging: { bg: 'bg-purple-100', text: 'text-purple-700', border: 'border-purple-300' },
  Investigating: { bg: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-300' },
  Identified: { bg: 'bg-amber-100', text: 'text-amber-700', border: 'border-amber-300' },
  Monitoring: { bg: 'bg-cyan-100', text: 'text-cyan-700', border: 'border-cyan-300' },
  Resolved: { bg: 'bg-emerald-100', text: 'text-emerald-700', border: 'border-emerald-300' },
};

const KANBAN_COLUMNS: IncidentStatus[] = ['New', 'Triaging', 'Investigating', 'Identified', 'Monitoring', 'Resolved'];

// Fallback styles for unknown severity/status keys (e.g. from a live API that
// returns a value not present in the config maps). Prevents runtime crashes
// from reading properties off an undefined lookup.
const DEFAULT_SEVERITY_CONFIG: { bg: string; text: string; border: string; icon: IconName } = {
  bg: 'bg-slate-100', text: 'text-slate-700', border: 'border-slate-300', icon: 'information-circle',
};
const DEFAULT_STATUS_CONFIG: { bg: string; text: string; border: string } = {
  bg: 'bg-slate-100', text: 'text-slate-700', border: 'border-slate-300',
};

// ============================================================================
// Utility Functions
// ============================================================================

function formatDuration(start: string, end?: string): string {
  const startDate = new Date(start);
  const endDate = end ? new Date(end) : new Date();
  const diffMs = endDate.getTime() - startDate.getTime();
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

  if (hours > 24) {
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h`;
  }
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

function formatTimestamp(ts: string): string {
  return new Date(ts).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ============================================================================
// Sub-components
// ============================================================================

function KPIRow({ incidents, isLive }: { incidents: Incident[]; isLive: boolean }) {
  // Use the ops metrics hook for KPIs - pass incidents for local computation fallback
  const { metrics, loading: metricsLoading } = useOpsMetrics(incidents);

  return (
    <div className="grid grid-cols-5 gap-4">
      <StatCard
        label="Open Incidents"
        value={metricsLoading ? '-' : metrics.openIncidents}
        variant={metrics.bySeverity.critical > 0 ? 'danger' : metrics.bySeverity.high > 0 ? 'warning' : 'default'}
        sub={
          <span className="flex items-center gap-1.5 text-[9px]">
            <span className="text-red-600">{metrics.bySeverity.critical} Crit</span>
            <span className="text-orange-600">{metrics.bySeverity.high} High</span>
            <span className="text-amber-600">{metrics.bySeverity.medium} Med</span>
            {isLive && <span className="ml-1 text-emerald-600">(Live)</span>}
          </span>
        }
        icon={<Icon name="bell-alert" className="w-5 h-5 text-slate-400" />}
      />
      <StatCard
        label="MTTR"
        value={metricsLoading ? '-' : metrics.mttr}
        sub="Mean Time to Resolve"
        variant="default"
        icon={<Icon name="clock" className="w-5 h-5 text-slate-400" />}
      />
      <StatCard
        label="MTTA"
        value={metricsLoading ? '-' : metrics.mtta}
        sub="Mean Time to Acknowledge"
        variant="default"
        icon={<Icon name="bolt" className="w-5 h-5 text-slate-400" />}
      />
      <StatCard
        label="This Month"
        value={metricsLoading ? '-' : metrics.thisMonth}
        sub="Incidents created"
        variant="default"
        icon={<Icon name="calendar" className="w-5 h-5 text-slate-400" />}
      />
      <StatCard
        label="Postmortems"
        value={metricsLoading ? '-' : metrics.postmortemsPending}
        sub="Pending completion"
        variant={metrics.postmortemsPending > 0 ? 'warning' : 'success'}
        icon={<Icon name="document-text" className="w-5 h-5 text-slate-400" />}
      />
    </div>
  );
}

function IncidentCard({ incident, onClick }: { incident: Incident; onClick: () => void }) {
  const sev = SEVERITY_CONFIG[incident.severity] ?? DEFAULT_SEVERITY_CONFIG;
  const duration = formatDuration(incident.createdAt, incident.resolvedAt);

  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-3 rounded-xl border bg-white/80 backdrop-blur-sm shadow-sm hover:shadow-md transition-shadow ${sev.border}`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <span className="text-[10px] font-mono text-slate-500">{incident.id}</span>
        <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${sev.bg} ${sev.text}`}>
          {incident.severity}
        </span>
      </div>
      <div className="text-xs font-medium text-slate-800 line-clamp-2 mb-2">{incident.title}</div>
      <div className="flex items-center gap-2 text-[10px] text-slate-500">
        <Icon name="clock" className="w-3 h-3" />
        <span>{duration}</span>
      </div>
      <div className="flex items-center gap-2 text-[10px] text-slate-500 mt-1">
        <Icon name="user" className="w-3 h-3" />
        <span className="truncate">{incident.owner}</span>
      </div>
      {incident.affectedAgents.length > 0 && (
        <div className="flex items-center gap-1 mt-2 flex-wrap">
          {incident.affectedAgents.slice(0, 2).map(agent => (
            <span key={agent} className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 truncate max-w-[100px]">
              {agent.replace('-agent', '')}
            </span>
          ))}
          {incident.affectedAgents.length > 2 && (
            <span className="text-[9px] text-slate-400">+{incident.affectedAgents.length - 2}</span>
          )}
        </div>
      )}
    </button>
  );
}

function KanbanBoard({ incidents, onSelectIncident, loading }: { incidents: Incident[]; onSelectIncident: (i: Incident) => void; loading?: boolean }) {
  const groupedIncidents = useMemo(() => {
    const groups: Record<IncidentStatus, Incident[]> = {
      New: [],
      Triaging: [],
      Investigating: [],
      Identified: [],
      Monitoring: [],
      Resolved: [],
    };
    incidents.forEach(i => groups[i.status]?.push(i));
    return groups;
  }, [incidents]);

  return (
    <div className="grid grid-cols-6 gap-4">
      {KANBAN_COLUMNS.map(status => {
        const config = STATUS_CONFIG[status];
        const columnIncidents = groupedIncidents[status];
        return (
          <div key={status} className="flex flex-col">
            <div className={`flex items-center justify-between px-3 py-2 rounded-t-lg ${config.bg}`}>
              <span className={`text-xs font-semibold ${config.text}`}>{status}</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${config.bg} ${config.text} font-medium`}>
                {loading ? '-' : columnIncidents.length}
              </span>
            </div>
            <div className="flex-1 bg-slate-50 rounded-b-lg p-2 space-y-2 min-h-[300px]">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-pulse flex flex-col items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-slate-200" />
                    <div className="w-16 h-2 rounded bg-slate-200" />
                  </div>
                </div>
              ) : (
                <>
                  {columnIncidents.map(incident => (
                    <IncidentCard key={incident.id} incident={incident} onClick={() => onSelectIncident(incident)} />
                  ))}
                  {columnIncidents.length === 0 && (
                    <div className="text-center text-[10px] text-slate-400 py-8">No incidents</div>
                  )}
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

interface IncidentTableProps {
  incidents: Incident[];
  onSelectIncident: (i: Incident) => void;
  filters: {
    status: IncidentStatus | 'all';
    severity: Severity | 'all';
    owner: string | 'all';
    dateRange: 'today' | '7d' | '30d' | 'all';
  };
  setFilters: (f: IncidentTableProps['filters']) => void;
  sortBy: keyof Incident | 'duration';
  sortDir: 'asc' | 'desc';
  setSortBy: (key: keyof Incident | 'duration') => void;
  setSortDir: (dir: 'asc' | 'desc') => void;
  loading?: boolean;
}

function IncidentTable({ incidents, onSelectIncident, filters, setFilters, sortBy, sortDir, setSortBy, setSortDir, loading }: IncidentTableProps) {
  const filteredAndSorted = useMemo(() => {
    let result = [...incidents];

    // Apply filters
    if (filters.status !== 'all') {
      result = result.filter(i => i.status === filters.status);
    }
    if (filters.severity !== 'all') {
      result = result.filter(i => i.severity === filters.severity);
    }
    if (filters.owner !== 'all') {
      result = result.filter(i => i.owner === filters.owner);
    }
    if (filters.dateRange !== 'all') {
      const now = new Date();
      const cutoff = new Date();
      if (filters.dateRange === 'today') cutoff.setHours(0, 0, 0, 0);
      else if (filters.dateRange === '7d') cutoff.setDate(now.getDate() - 7);
      else if (filters.dateRange === '30d') cutoff.setDate(now.getDate() - 30);
      result = result.filter(i => new Date(i.createdAt) >= cutoff);
    }

    // Apply sorting
    result.sort((a, b) => {
      let aVal: string | number, bVal: string | number;
      if (sortBy === 'duration') {
        aVal = new Date(a.resolvedAt || new Date()).getTime() - new Date(a.createdAt).getTime();
        bVal = new Date(b.resolvedAt || new Date()).getTime() - new Date(b.createdAt).getTime();
      } else if (sortBy === 'severity') {
        const order = { Critical: 0, High: 1, Medium: 2, Low: 3 };
        aVal = order[a.severity];
        bVal = order[b.severity];
      } else {
        aVal = a[sortBy] as string;
        bVal = b[sortBy] as string;
      }
      if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [incidents, filters, sortBy, sortDir]);

  const handleSort = (key: keyof Incident | 'duration') => {
    if (sortBy === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(key);
      setSortDir('asc');
    }
  };

  const renderSortIcon = (column: keyof Incident | 'duration') => (
    sortBy === column ? (
      <Icon name={sortDir === 'asc' ? 'chevron-up' : 'chevron-down'} className="w-3 h-3" />
    ) : null
  );

  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm">
      {/* Filters */}
      <div className="flex items-center gap-4 p-4 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">Status:</span>
          <select
            value={filters.status}
            onChange={e => setFilters({ ...filters, status: e.target.value as IncidentStatus | 'all' })}
            className="text-xs border border-slate-200 rounded px-2 py-1"
          >
            <option value="all">All</option>
            {KANBAN_COLUMNS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">Severity:</span>
          <select
            value={filters.severity}
            onChange={e => setFilters({ ...filters, severity: e.target.value as Severity | 'all' })}
            className="text-xs border border-slate-200 rounded px-2 py-1"
          >
            <option value="all">All</option>
            <option value="Critical">Critical</option>
            <option value="High">High</option>
            <option value="Medium">Medium</option>
            <option value="Low">Low</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">Owner:</span>
          <select
            value={filters.owner}
            onChange={e => setFilters({ ...filters, owner: e.target.value })}
            className="text-xs border border-slate-200 rounded px-2 py-1"
          >
            <option value="all">All</option>
            {OWNERS.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">Date:</span>
          <select
            value={filters.dateRange}
            onChange={e => setFilters({ ...filters, dateRange: e.target.value as 'today' | '7d' | '30d' | 'all' })}
            className="text-xs border border-slate-200 rounded px-2 py-1"
          >
            <option value="all">All Time</option>
            <option value="today">Today</option>
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
          </select>
        </div>
        <div className="flex-1" />
        <span className="text-xs text-slate-500">{filteredAndSorted.length} incidents</span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-slate-50">
            <tr>
              <th className="text-left px-4 py-2 text-[10px] font-semibold text-slate-600 uppercase cursor-pointer hover:bg-slate-100" onClick={() => handleSort('id')}>
                <div className="flex items-center gap-1">ID {renderSortIcon('id')}</div>
              </th>
              <th className="text-left px-4 py-2 text-[10px] font-semibold text-slate-600 uppercase cursor-pointer hover:bg-slate-100" onClick={() => handleSort('title')}>
                <div className="flex items-center gap-1">Title {renderSortIcon('title')}</div>
              </th>
              <th className="text-left px-4 py-2 text-[10px] font-semibold text-slate-600 uppercase cursor-pointer hover:bg-slate-100" onClick={() => handleSort('severity')}>
                <div className="flex items-center gap-1">Severity {renderSortIcon('severity')}</div>
              </th>
              <th className="text-left px-4 py-2 text-[10px] font-semibold text-slate-600 uppercase cursor-pointer hover:bg-slate-100" onClick={() => handleSort('status')}>
                <div className="flex items-center gap-1">Status {renderSortIcon('status')}</div>
              </th>
              <th className="text-left px-4 py-2 text-[10px] font-semibold text-slate-600 uppercase cursor-pointer hover:bg-slate-100" onClick={() => handleSort('owner')}>
                <div className="flex items-center gap-1">Owner {renderSortIcon('owner')}</div>
              </th>
              <th className="text-left px-4 py-2 text-[10px] font-semibold text-slate-600 uppercase cursor-pointer hover:bg-slate-100" onClick={() => handleSort('duration')}>
                <div className="flex items-center gap-1">Duration {renderSortIcon('duration')}</div>
              </th>
              <th className="text-left px-4 py-2 text-[10px] font-semibold text-slate-600 uppercase">Affected Agents</th>
              <th className="text-left px-4 py-2 text-[10px] font-semibold text-slate-600 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              // Loading skeleton rows
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={`skeleton-${i}`} className="border-t border-slate-100">
                  <td className="px-4 py-3"><div className="animate-pulse h-4 w-20 bg-slate-200 rounded" /></td>
                  <td className="px-4 py-3"><div className="animate-pulse h-4 w-48 bg-slate-200 rounded" /></td>
                  <td className="px-4 py-3"><div className="animate-pulse h-4 w-16 bg-slate-200 rounded" /></td>
                  <td className="px-4 py-3"><div className="animate-pulse h-4 w-20 bg-slate-200 rounded" /></td>
                  <td className="px-4 py-3"><div className="animate-pulse h-4 w-24 bg-slate-200 rounded" /></td>
                  <td className="px-4 py-3"><div className="animate-pulse h-4 w-12 bg-slate-200 rounded" /></td>
                  <td className="px-4 py-3"><div className="animate-pulse h-4 w-28 bg-slate-200 rounded" /></td>
                  <td className="px-4 py-3"><div className="animate-pulse h-4 w-12 bg-slate-200 rounded" /></td>
                </tr>
              ))
            ) : (
              filteredAndSorted.map(incident => {
                const sev = SEVERITY_CONFIG[incident.severity] ?? DEFAULT_SEVERITY_CONFIG;
                const stat = STATUS_CONFIG[incident.status] ?? DEFAULT_STATUS_CONFIG;
                return (
                  <tr key={incident.id} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3 text-xs font-mono text-slate-600">{incident.id}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => onSelectIncident(incident)}
                        className="text-xs text-slate-800 hover:text-blue-600 text-left font-medium line-clamp-1"
                      >
                        {incident.title}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-[10px] px-2 py-0.5 rounded font-medium ${sev.bg} ${sev.text}`}>
                        {incident.severity}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-[10px] px-2 py-0.5 rounded font-medium ${stat.bg} ${stat.text}`}>
                        {incident.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">{incident.owner}</td>
                    <td className="px-4 py-3 text-xs text-slate-600">{formatDuration(incident.createdAt, incident.resolvedAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        {incident.affectedAgents.slice(0, 2).map(a => (
                          <span key={a} className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                            {a.replace('-agent', '')}
                          </span>
                        ))}
                        {incident.affectedAgents.length > 2 && (
                          <span className="text-[9px] text-slate-400">+{incident.affectedAgents.length - 2}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => onSelectIncident(incident)}
                        className="text-[10px] px-2 py-1 rounded bg-blue-50 text-blue-600 hover:bg-blue-100 font-medium"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface CreateIncidentModalProps {
  open: boolean;
  onClose: () => void;
  onCreate: (incident: Partial<Incident>) => void;
}

function CreateIncidentModal({ open, onClose, onCreate }: CreateIncidentModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState<Severity>('Medium');
  const [selectedAgents, setSelectedAgents] = useState<string[]>([]);
  const [owner, setOwner] = useState(OWNERS[0]);
  const [linkedAlert, setLinkedAlert] = useState('');

  const handleSubmit = () => {
    onCreate({
      title,
      description,
      severity,
      affectedAgents: selectedAgents,
      owner,
      linkedAlertId: linkedAlert || undefined,
    });
    // Reset form
    setTitle('');
    setDescription('');
    setSeverity('Medium');
    setSelectedAgents([]);
    setOwner(OWNERS[0]);
    setLinkedAlert('');
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-full max-w-xl bg-white rounded-xl shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-lg font-semibold text-slate-900">Create Incident</h2>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded">
            <Icon name="x-mark" className="w-5 h-5 text-slate-400" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Title</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Brief description of the incident"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Description</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Detailed description of the issue and impact"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Severity</label>
              <select
                value={severity}
                onChange={e => setSeverity(e.target.value as Severity)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="Critical">Critical</option>
                <option value="High">High</option>
                <option value="Medium">Medium</option>
                <option value="Low">Low</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Owner</label>
              <select
                value={owner}
                onChange={e => setOwner(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {OWNERS.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Affected Agents</label>
            <div className="flex flex-wrap gap-2 p-2 border border-slate-200 rounded-lg min-h-[60px]">
              {AGENTS.map(agent => (
                <button
                  key={agent}
                  onClick={() => {
                    if (selectedAgents.includes(agent)) {
                      setSelectedAgents(selectedAgents.filter(a => a !== agent));
                    } else {
                      setSelectedAgents([...selectedAgents, agent]);
                    }
                  }}
                  className={`text-[10px] px-2 py-1 rounded transition-colors ${
                    selectedAgents.includes(agent)
                      ? 'bg-blue-100 text-blue-700 border border-blue-300'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {agent.replace('-agent', '')}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Link to Alert (Optional)</label>
            <input
              type="text"
              value={linkedAlert}
              onChange={e => setLinkedAlert(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g., ALT-4521"
            />
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!title || !description}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Create Incident
          </button>
        </div>
      </div>
    </div>
  );
}

interface IncidentDetailDrawerProps {
  incident: Incident | null;
  onClose: () => void;
  onAction: (action: string, incidentId: string, data?: Record<string, string>) => void;
}

function IncidentDetailDrawer({ incident, onClose, onAction }: IncidentDetailDrawerProps) {
  const [newComment, setNewComment] = useState('');
  const [selectedRunbook, setSelectedRunbook] = useState('');

  if (!incident) return null;

  const sev = SEVERITY_CONFIG[incident.severity] ?? DEFAULT_SEVERITY_CONFIG;
  const stat = STATUS_CONFIG[incident.status] ?? DEFAULT_STATUS_CONFIG;

  const TIMELINE_ICONS: Record<IncidentTimelineEntry['type'], { icon: IconName; color: string }> = {
    status_change: { icon: 'arrow-path', color: 'text-blue-500' },
    comment: { icon: 'chat-bubble', color: 'text-slate-500' },
    action: { icon: 'bolt', color: 'text-amber-500' },
    alert: { icon: 'bell-alert', color: 'text-red-500' },
    communication: { icon: 'megaphone', color: 'text-purple-500' },
  };

  const CHANNEL_ICONS: Record<string, IconName> = {
    slack: 'chat-bubble',
    pagerduty: 'bell-alert',
    email: 'envelope',
  };

  return (
    <Drawer
      open={!!incident}
      onClose={onClose}
      title={incident.id}
      subtitle={incident.title}
      width="xl"
    >
      <div className="space-y-6">
        {/* Header Info */}
        <div className="flex items-center gap-3">
          <span className={`text-xs px-2 py-1 rounded font-medium ${sev.bg} ${sev.text}`}>
            <Icon name={sev.icon} className="w-3 h-3 inline mr-1" />
            {incident.severity}
          </span>
          <span className={`text-xs px-2 py-1 rounded font-medium ${stat.bg} ${stat.text}`}>
            {incident.status}
          </span>
          <span className="text-xs text-slate-500">
            <Icon name="user" className="w-3 h-3 inline mr-1" />
            {incident.owner}
          </span>
          <span className="text-xs text-slate-500">
            <Icon name="clock" className="w-3 h-3 inline mr-1" />
            {formatDuration(incident.createdAt, incident.resolvedAt)}
          </span>
        </div>

        {/* Description */}
        <div>
          <h3 className="text-sm font-semibold text-slate-900 mb-2">Description</h3>
          <p className="text-sm text-slate-600">{incident.description}</p>
        </div>

        {/* Actions */}
        <div>
          <h3 className="text-sm font-semibold text-slate-900 mb-2">Actions</h3>
          <div className="flex flex-wrap gap-2">
            {incident.status !== 'Resolved' && !incident.acknowledgedAt && (
              <button
                onClick={() => onAction('acknowledge', incident.id)}
                className="text-xs px-3 py-1.5 rounded bg-emerald-100 text-emerald-700 hover:bg-emerald-200 font-medium"
              >
                <Icon name="check" className="w-3 h-3 inline mr-1" />
                Acknowledge
              </button>
            )}
            {incident.status !== 'Resolved' && (
              <>
                <button
                  onClick={() => onAction('escalate', incident.id)}
                  className="text-xs px-3 py-1.5 rounded bg-orange-100 text-orange-700 hover:bg-orange-200 font-medium"
                >
                  <Icon name="arrow-trending-up" className="w-3 h-3 inline mr-1" />
                  Escalate
                </button>
                <button
                  onClick={() => onAction('assign', incident.id)}
                  className="text-xs px-3 py-1.5 rounded bg-blue-100 text-blue-700 hover:bg-blue-200 font-medium"
                >
                  <Icon name="user" className="w-3 h-3 inline mr-1" />
                  Assign
                </button>
                <button
                  onClick={() => onAction('resolve', incident.id)}
                  className="text-xs px-3 py-1.5 rounded bg-emerald-100 text-emerald-700 hover:bg-emerald-200 font-medium"
                >
                  <Icon name="check-circle" className="w-3 h-3 inline mr-1" />
                  Resolve
                </button>
              </>
            )}
            {incident.status === 'Resolved' && !incident.postmortemId && (
              <button
                onClick={() => onAction('create_postmortem', incident.id)}
                className="text-xs px-3 py-1.5 rounded bg-purple-100 text-purple-700 hover:bg-purple-200 font-medium"
              >
                <Icon name="document-text" className="w-3 h-3 inline mr-1" />
                Create Postmortem
              </button>
            )}
          </div>
        </div>

        {/* Run Runbook */}
        {incident.status !== 'Resolved' && (
          <div>
            <h3 className="text-sm font-semibold text-slate-900 mb-2">Run Runbook</h3>
            <div className="flex items-center gap-2">
              <select
                value={selectedRunbook}
                onChange={e => setSelectedRunbook(e.target.value)}
                className="flex-1 text-xs border border-slate-200 rounded px-3 py-2"
              >
                <option value="">Select a runbook...</option>
                {RUNBOOKS.map(rb => (
                  <option key={rb.id} value={rb.id}>{rb.name}</option>
                ))}
              </select>
              <button
                onClick={() => {
                  if (selectedRunbook) {
                    onAction('run_runbook', incident.id, { runbookId: selectedRunbook });
                    setSelectedRunbook('');
                  }
                }}
                disabled={!selectedRunbook}
                className="text-xs px-3 py-2 rounded bg-violet-100 text-violet-700 hover:bg-violet-200 font-medium disabled:opacity-50"
              >
                <Icon name="play-circle" className="w-3 h-3 inline mr-1" />
                Run
              </button>
            </div>
            {incident.runbooksExecuted.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                <span className="text-[10px] text-slate-500">Executed:</span>
                {incident.runbooksExecuted.map(rb => (
                  <span key={rb} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                    {rb}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Affected Agents */}
        <div>
          <h3 className="text-sm font-semibold text-slate-900 mb-2">Affected Agents</h3>
          <div className="flex flex-wrap gap-2">
            {incident.affectedAgents.map(agent => (
              <div key={agent} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-50 border border-slate-200">
                <Icon name="cpu-chip" className="w-4 h-4 text-slate-400" />
                <span className="text-xs text-slate-700">{agent}</span>
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">Impacted</span>
              </div>
            ))}
          </div>
        </div>

        {/* Related Alerts */}
        {incident.relatedAlerts.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-slate-900 mb-2">Related Alerts</h3>
            <div className="flex flex-wrap gap-2">
              {incident.relatedAlerts.map(alert => (
                <span key={alert} className="text-xs px-2 py-1 rounded bg-red-50 text-red-600 font-mono">
                  {alert}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Timeline */}
        <div>
          <h3 className="text-sm font-semibold text-slate-900 mb-2">Timeline</h3>
          <div className="space-y-3">
            {incident.timeline.map((entry) => {
              const config = TIMELINE_ICONS[entry.type];
              return (
                <div key={entry.id} className="flex gap-3">
                  <div className={`w-6 h-6 rounded-full bg-white border-2 border-slate-200 flex items-center justify-center flex-shrink-0 ${config.color}`}>
                    <Icon name={config.icon} className="w-3 h-3" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-slate-800">{entry.description}</div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-slate-500">{entry.actor}</span>
                      <span className="text-[10px] text-slate-400">{formatTimestamp(entry.timestamp)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Add Comment */}
        {incident.status !== 'Resolved' && (
          <div>
            <h3 className="text-sm font-semibold text-slate-900 mb-2">Add Comment</h3>
            <div className="flex gap-2">
              <input
                type="text"
                value={newComment}
                onChange={e => setNewComment(e.target.value)}
                className="flex-1 px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Add a comment..."
              />
              <button
                onClick={() => {
                  if (newComment) {
                    onAction('add_comment', incident.id, { comment: newComment });
                    setNewComment('');
                  }
                }}
                disabled={!newComment}
                className="px-3 py-2 text-xs bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 disabled:opacity-50"
              >
                Add
              </button>
            </div>
          </div>
        )}

        {/* Communication Log */}
        {incident.communicationLog.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-slate-900 mb-2">Communication Log</h3>
            <div className="space-y-2">
              {incident.communicationLog.map((log, idx) => (
                <div key={idx} className="flex items-start gap-2 p-2 rounded-lg bg-slate-50">
                  <Icon name={CHANNEL_ICONS[log.channel]} className="w-4 h-4 text-slate-400 mt-0.5" />
                  <div className="flex-1">
                    <div className="text-xs text-slate-700">{log.message}</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      {log.channel} - {formatTimestamp(log.timestamp)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Resolution Notes */}
        {incident.resolutionNotes && (
          <div>
            <h3 className="text-sm font-semibold text-slate-900 mb-2">Resolution Notes</h3>
            <p className="text-sm text-slate-600 p-3 rounded-lg bg-emerald-50 border border-emerald-200">
              {incident.resolutionNotes}
            </p>
          </div>
        )}

        {/* Postmortem Link */}
        {incident.postmortemId && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-purple-50 border border-purple-200">
            <Icon name="document-text" className="w-4 h-4 text-purple-500" />
            <span className="text-xs text-purple-700">Postmortem:</span>
            <span className="text-xs font-mono text-purple-800">{incident.postmortemId}</span>
          </div>
        )}
      </div>
    </Drawer>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export default function IncidentManagement() {
  const [viewMode, setViewMode] = useState<'board' | 'table'>('board');
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);

  // Table filters and sorting
  const [filters, setFilters] = useState<{
    status: IncidentStatus | 'all';
    severity: Severity | 'all';
    owner: string | 'all';
    dateRange: 'today' | '7d' | '30d' | 'all';
  }>({
    status: 'all',
    severity: 'all',
    owner: 'all',
    dateRange: 'all',
  });
  const [sortBy, setSortBy] = useState<keyof Incident | 'duration'>('createdAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  // ─── Live Data Hooks ───────────────────────────────────────────────────────
  const {
    incidents,
    loading: incidentsLoading,
    isLive,
    source,
    setIncidents,
    refresh: refreshIncidents,
  } = useIncidents();

  // Mutation hooks with optimistic updates
  const {
    createIncident,
    acknowledge,
    escalate,
    resolve,
    addTimelineEvent,
    runRunbook,
    createPostmortem,
    creating,
    updating,
  } = useIncidentMutations(setIncidents);

  // ─── Handlers ──────────────────────────────────────────────────────────────

  const handleCreateIncident = useCallback(async (data: Partial<Incident>) => {
    await createIncident({
      title: data.title || '',
      description: data.description || '',
      severity: data.severity || 'Medium',
      owner: data.owner || OWNERS[0],
      affectedAgents: data.affectedAgents,
      linkedAlertId: data.linkedAlertId,
    });
  }, [createIncident]);

  const handleAction = useCallback(async (action: string, incidentId: string, data?: Record<string, string>) => {
    switch (action) {
      case 'acknowledge':
        await acknowledge(incidentId);
        break;
      case 'escalate':
        await escalate(incidentId);
        break;
      case 'resolve':
        await resolve(incidentId);
        break;
      case 'add_comment':
        if (data?.comment) {
          await addTimelineEvent(incidentId, {
            type: 'comment',
            description: data.comment,
            actor: 'Current User',
          });
        }
        break;
      case 'run_runbook':
        if (data?.runbookId) {
          await runRunbook(incidentId, data.runbookId);
        }
        break;
      case 'create_postmortem':
        await createPostmortem(incidentId);
        break;
      default:
        console.warn(`Unknown action: ${action}`);
    }

    // Update selected incident from the updated incidents list
    if (selectedIncident?.id === incidentId) {
      const updated = incidents.find(i => i.id === incidentId);
      if (updated) setSelectedIncident(updated);
    }
  }, [acknowledge, escalate, resolve, addTimelineEvent, runRunbook, createPostmortem, selectedIncident, incidents]);

  // Keep selected incident in sync with incidents list
  const currentSelectedIncident = useMemo(() => {
    if (!selectedIncident) return null;
    return incidents.find(i => i.id === selectedIncident.id) || selectedIncident;
  }, [selectedIncident, incidents]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Incident Management</h2>
          <p className="text-sm text-slate-500">
            Full incident lifecycle management for AI agent operations
            {isLive && (
              <span className="ml-2 inline-flex items-center gap-1 text-emerald-600">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Live
              </span>
            )}
            {!isLive && source && (
              <span className="ml-2 text-amber-600 text-xs">({source})</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Refresh button */}
          <button
            onClick={refreshIncidents}
            disabled={incidentsLoading}
            className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg disabled:opacity-50"
            title="Refresh incidents"
          >
            <Icon name="arrow-path" className={`w-4 h-4 ${incidentsLoading ? 'animate-spin' : ''}`} />
          </button>
          <div className="flex items-center bg-slate-100 rounded-lg p-1">
            <button
              onClick={() => setViewMode('board')}
              className={`px-3 py-1.5 text-xs font-medium rounded ${
                viewMode === 'board' ? 'bg-white shadow text-slate-800' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <Icon name="squares-2x2" className="w-4 h-4 inline mr-1" />
              Board
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`px-3 py-1.5 text-xs font-medium rounded ${
                viewMode === 'table' ? 'bg-white shadow text-slate-800' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <Icon name="queue-list" className="w-4 h-4 inline mr-1" />
              Table
            </button>
          </div>
          <button
            onClick={() => setCreateModalOpen(true)}
            disabled={creating}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium flex items-center gap-2 disabled:opacity-50"
          >
            {creating ? (
              <Icon name="arrow-path" className="w-4 h-4 animate-spin" />
            ) : (
              <Icon name="plus" className="w-4 h-4" />
            )}
            Create Incident
          </button>
        </div>
      </div>

      {/* KPI Row */}
      <KPIRow incidents={incidents} isLive={isLive} />

      {/* View */}
      {viewMode === 'board' ? (
        <KanbanBoard
          incidents={incidents}
          onSelectIncident={setSelectedIncident}
          loading={incidentsLoading}
        />
      ) : (
        <IncidentTable
          incidents={incidents}
          onSelectIncident={setSelectedIncident}
          filters={filters}
          setFilters={setFilters}
          sortBy={sortBy}
          sortDir={sortDir}
          setSortBy={setSortBy}
          setSortDir={setSortDir}
          loading={incidentsLoading}
        />
      )}

      {/* Modals & Drawers */}
      <CreateIncidentModal
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onCreate={handleCreateIncident}
      />
      <IncidentDetailDrawer
        incident={currentSelectedIncident}
        onClose={() => setSelectedIncident(null)}
        onAction={handleAction}
      />

      {/* Updating indicator */}
      {updating && (
        <div className="fixed bottom-4 right-4 flex items-center gap-2 px-3 py-2 bg-blue-600 text-white text-xs rounded-lg shadow-lg">
          <Icon name="arrow-path" className="w-3 h-3 animate-spin" />
          Updating...
        </div>
      )}
    </div>
  );
}
