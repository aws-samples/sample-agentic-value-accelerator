/**
 * PolicyDriftDashboard - Dedicated Policy-Reality Drift Detection Dashboard
 *
 * Provides a focused view of policy drift analysis including:
 * - Summary KPIs (total findings, compliance gap, worst offender, last analysis)
 * - Drift by type visualization (pie/donut chart)
 * - Main findings table with filtering, sorting, and expandable rows
 * - Worst offenders panel with mini bar chart
 * - 7-day trend chart
 * - Policy comparison panel showing expected vs actual
 *
 * Data source: AWS CloudTrail via governPolicyDriftApi
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import GovernPageLayout from './GovernPageLayout';
import { MockDataBadge, LiveDataBadge } from './DataSourceIndicator';
import StatCard from './StatCard';
import { Icon } from './icons';
import Drawer from './Drawer';
import { useDataSources } from './DataSourceContext';
import { DataSourceInfo, getPageDataSources } from './DataSourceInfo';
import {
  governPolicyDriftApi,
  type DriftType,
  type DriftSeverity,
  type PolicyDriftFinding,
  type DriftSummary,
  type WorstOffender,
} from '../../api/client';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  LineChart,
  Line,
  CartesianGrid,
  Legend,
} from 'recharts';

// ─────────────────────────── Constants & Types ───────────────────────────

const DRIFT_TYPE_LABELS: Record<DriftType, string> = {
  tier_violation: 'Tier Violation',
  path_violation: 'Path Violation',
  unknown_harness: 'Unknown Harness',
};

const DRIFT_TYPE_COLORS: Record<DriftType, string> = {
  tier_violation: '#ef4444',    // red-500
  path_violation: '#f97316',    // orange-500
  unknown_harness: '#6b7280',   // gray-500
};

const SEVERITY_STYLES: Record<DriftSeverity, { bg: string; text: string; border: string }> = {
  critical: { bg: 'bg-rose-100', text: 'text-rose-700', border: 'border-rose-200' },
  high: { bg: 'bg-orange-100', text: 'text-orange-700', border: 'border-orange-200' },
  medium: { bg: 'bg-amber-100', text: 'text-amber-700', border: 'border-amber-200' },
  low: { bg: 'bg-slate-100', text: 'text-slate-600', border: 'border-slate-200' },
};

const SEVERITY_ORDER: DriftSeverity[] = ['critical', 'high', 'medium', 'low'];

// Mock trend data for the 7-day chart
const MOCK_TREND_DATA = [
  { date: 'Day 1', findings: 3, resolved: 2 },
  { date: 'Day 2', findings: 5, resolved: 3 },
  { date: 'Day 3', findings: 2, resolved: 4 },
  { date: 'Day 4', findings: 4, resolved: 2 },
  { date: 'Day 5', findings: 1, resolved: 3 },
  { date: 'Day 6', findings: 3, resolved: 1 },
  { date: 'Day 7', findings: 2, resolved: 2 },
];

// ─────────────────────────── Helper Functions ───────────────────────────

function formatTimestamp(ts: string): string {
  return new Date(ts).toLocaleString();
}

function timeAgo(ts: string): string {
  const now = Date.now();
  const then = new Date(ts).getTime();
  const diff = now - then;

  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ─────────────────────────── Sub-Components ───────────────────────────

interface SeverityBadgeProps {
  severity: DriftSeverity;
}

function SeverityBadge({ severity }: SeverityBadgeProps) {
  const style = SEVERITY_STYLES[severity];
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded uppercase ${style.bg} ${style.text}`}>
      {severity}
    </span>
  );
}

interface DriftTypeBadgeProps {
  type: DriftType;
}

function DriftTypeBadge({ type }: DriftTypeBadgeProps) {
  return (
    <span
      className="text-[10px] font-medium px-2 py-0.5 rounded"
      style={{
        backgroundColor: `${DRIFT_TYPE_COLORS[type]}20`,
        color: DRIFT_TYPE_COLORS[type],
      }}
    >
      {DRIFT_TYPE_LABELS[type]}
    </span>
  );
}

interface DriftTypeChartProps {
  data: { type: DriftType; count: number }[];
  onSelectType: (type: DriftType | null) => void;
  selectedType: DriftType | null;
}

function DriftTypeChart({ data, onSelectType, selectedType }: DriftTypeChartProps) {
  const total = data.reduce((acc, d) => acc + d.count, 0);
  if (total === 0) {
    return (
      <div className="h-48 flex items-center justify-center text-sm text-slate-400">
        No drift findings detected
      </div>
    );
  }

  const chartData = data.map((d) => ({
    name: DRIFT_TYPE_LABELS[d.type],
    value: d.count,
    type: d.type,
    fill: DRIFT_TYPE_COLORS[d.type],
  }));

  return (
    <div className="h-48">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            innerRadius={40}
            outerRadius={70}
            paddingAngle={2}
            dataKey="value"
            onClick={(_entry, index) => {
              const t = chartData[index].type;
              onSelectType(selectedType === t ? null : t);
            }}
            cursor="pointer"
          >
            {chartData.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={entry.fill}
                opacity={selectedType && selectedType !== entry.type ? 0.3 : 1}
                stroke={selectedType === entry.type ? '#1e293b' : 'transparent'}
                strokeWidth={2}
              />
            ))}
          </Pie>
          <Tooltip
            formatter={(value, name) => [`${value} findings`, name]}
            contentStyle={{
              backgroundColor: 'white',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              fontSize: '11px',
            }}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="flex flex-wrap justify-center gap-3 mt-2">
        {chartData.map((d) => (
          <button
            key={d.type}
            onClick={() => onSelectType(selectedType === d.type ? null : d.type)}
            className={`flex items-center gap-1.5 text-[10px] px-2 py-1 rounded transition ${
              selectedType === d.type
                ? 'bg-slate-900 text-white'
                : 'hover:bg-slate-100'
            }`}
          >
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: d.fill }}
            />
            <span>{d.name}</span>
            <span className="font-semibold">({d.value})</span>
          </button>
        ))}
      </div>
    </div>
  );
}

interface WorstOffendersPanelProps {
  offenders: WorstOffender[];
  onSelectOffender: (identity: string | null) => void;
  selectedOffender: string | null;
}

function WorstOffendersPanel({ offenders, onSelectOffender, selectedOffender }: WorstOffendersPanelProps) {
  const top5 = offenders.slice(0, 5);
  const maxCount = Math.max(...top5.map((o) => o.finding_count), 1);

  if (top5.length === 0) {
    return (
      <div className="p-4 text-sm text-slate-400 text-center">
        No offenders detected
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {top5.map((offender, idx) => (
        <button
          key={offender.identity}
          onClick={() => onSelectOffender(selectedOffender === offender.identity ? null : offender.identity)}
          className={`w-full text-left p-3 rounded-lg border transition ${
            selectedOffender === offender.identity
              ? 'border-slate-900 bg-slate-50'
              : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/50'
          }`}
        >
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-slate-400">#{idx + 1}</span>
              <span className="text-xs font-medium text-slate-900 truncate max-w-[180px]">
                {offender.identity}
              </span>
            </div>
            <span className={`text-[10px] px-1.5 py-0.5 rounded ${
              offender.identity_type === 'user' ? 'bg-blue-100 text-blue-700' : 'bg-violet-100 text-violet-700'
            }`}>
              {offender.identity_type}
            </span>
          </div>
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${(offender.finding_count / maxCount) * 100}%`,
                backgroundColor: offender.critical_count > 0 ? '#ef4444' : offender.high_count > 0 ? '#f97316' : '#6b7280',
              }}
            />
          </div>
          <div className="flex items-center gap-3 mt-1.5 text-[10px] text-slate-500">
            <span>{offender.finding_count} findings</span>
            {offender.critical_count > 0 && (
              <span className="text-rose-600">{offender.critical_count} critical</span>
            )}
            {offender.high_count > 0 && (
              <span className="text-orange-600">{offender.high_count} high</span>
            )}
          </div>
        </button>
      ))}
    </div>
  );
}

interface TrendChartProps {
  data: { date: string; findings: number; resolved: number }[];
}

function TrendChart({ data }: TrendChartProps) {
  return (
    <div className="h-48">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 10, fill: '#64748b' }}
            axisLine={{ stroke: '#e2e8f0' }}
          />
          <YAxis
            tick={{ fontSize: 10, fill: '#64748b' }}
            axisLine={{ stroke: '#e2e8f0' }}
            allowDecimals={false}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'white',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              fontSize: '11px',
            }}
          />
          <Legend
            wrapperStyle={{ fontSize: '10px' }}
            iconSize={8}
          />
          <Line
            type="monotone"
            dataKey="findings"
            stroke="#ef4444"
            strokeWidth={2}
            dot={{ r: 3 }}
            name="New Findings"
          />
          <Line
            type="monotone"
            dataKey="resolved"
            stroke="#10b981"
            strokeWidth={2}
            dot={{ r: 3 }}
            name="Resolved"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

interface FindingsTableProps {
  findings: PolicyDriftFinding[];
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
  onExpand: (finding: PolicyDriftFinding) => void;
  onResolve: (finding: PolicyDriftFinding) => void;
  sortBy: string;
  sortDir: 'asc' | 'desc';
  onSort: (field: string) => void;
}

function FindingsTable({
  findings,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  onExpand,
  onResolve,
  sortBy,
  sortDir,
  onSort,
}: FindingsTableProps) {
  const allSelected = findings.length > 0 && findings.every((f) => selectedIds.has(f.finding_id));
  const someSelected = findings.some((f) => selectedIds.has(f.finding_id));

  const SortHeader = ({ field, label }: { field: string; label: string }) => (
    <button
      onClick={() => onSort(field)}
      className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500 hover:text-slate-700"
    >
      {label}
      {sortBy === field && (
        <Icon
          name={sortDir === 'asc' ? 'chevron-up' : 'chevron-down'}
          className="w-3 h-3"
        />
      )}
    </button>
  );

  if (findings.length === 0) {
    return (
      <div className="bg-white/80 rounded-xl border border-slate-200/60 p-8 text-center">
        <Icon name="shield-check" className="w-12 h-12 text-emerald-300 mx-auto mb-3" />
        <div className="text-sm font-semibold text-slate-800 mb-1">No drift findings</div>
        <p className="text-[11px] text-slate-500 max-w-md mx-auto">
          Policy-reality drift detection found no violations matching the current filters.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white/80 rounded-xl border border-slate-200/60 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200/60">
              <th className="w-10 px-4 py-3">
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = someSelected && !allSelected;
                  }}
                  onChange={onToggleSelectAll}
                  className="rounded border-slate-300"
                />
              </th>
              <th className="px-4 py-3 text-left">
                <SortHeader field="severity" label="Severity" />
              </th>
              <th className="px-4 py-3 text-left">
                <SortHeader field="drift_type" label="Type" />
              </th>
              <th className="px-4 py-3 text-left">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  Harness
                </span>
              </th>
              <th className="px-4 py-3 text-left">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  Expected vs Actual
                </span>
              </th>
              <th className="px-4 py-3 text-left">
                <SortHeader field="detected_at" label="Detected" />
              </th>
              <th className="px-4 py-3 text-left">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  Actions
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {findings.map((finding) => (
              <tr
                key={finding.finding_id}
                className={`border-b border-slate-100 hover:bg-slate-50/50 transition ${
                  selectedIds.has(finding.finding_id) ? 'bg-blue-50/50' : ''
                }`}
              >
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(finding.finding_id)}
                    onChange={() => onToggleSelect(finding.finding_id)}
                    className="rounded border-slate-300"
                  />
                </td>
                <td className="px-4 py-3">
                  <SeverityBadge severity={finding.severity} />
                </td>
                <td className="px-4 py-3">
                  <DriftTypeBadge type={finding.drift_type} />
                </td>
                <td className="px-4 py-3">
                  <span className="text-xs text-slate-700">{finding.harness_type}</span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2 text-[11px]">
                    <span className="text-emerald-600 truncate max-w-[100px]" title={finding.expected}>
                      {finding.expected}
                    </span>
                    <Icon name="arrow-right" className="w-3 h-3 text-slate-400 flex-shrink-0" />
                    <span className="text-rose-600 truncate max-w-[100px]" title={finding.actual}>
                      {finding.actual}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className="text-[11px] text-slate-500" title={formatTimestamp(finding.detected_at)}>
                    {timeAgo(finding.detected_at)}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => onExpand(finding)}
                      className="p-1.5 rounded hover:bg-slate-100 transition text-slate-400 hover:text-slate-600"
                      title="View details"
                    >
                      <Icon name="eye" className="w-4 h-4" />
                    </button>
                    {!finding.resolved && (
                      <button
                        onClick={() => onResolve(finding)}
                        className="p-1.5 rounded hover:bg-emerald-50 transition text-slate-400 hover:text-emerald-600"
                        title="Mark as resolved"
                      >
                        <Icon name="check-circle" className="w-4 h-4" />
                      </button>
                    )}
                    {finding.resolved && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">
                        Resolved
                      </span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface PolicyComparisonPanelProps {
  finding: PolicyDriftFinding | null;
}

function PolicyComparisonPanel({ finding }: PolicyComparisonPanelProps) {
  if (!finding) {
    return (
      <div className="p-4 text-sm text-slate-400 text-center">
        Select a finding to view policy comparison
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-600 mb-1">
            Expected (Policy)
          </div>
          <div className="text-sm text-emerald-800 font-mono">{finding.expected}</div>
        </div>
        <div className="p-3 rounded-lg bg-rose-50 border border-rose-200">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-rose-600 mb-1">
            Actual (Reality)
          </div>
          <div className="text-sm text-rose-800 font-mono">{finding.actual}</div>
        </div>
      </div>
      <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2">
          Discrepancy Details
        </div>
        <div className="space-y-2 text-[11px]">
          <div className="flex items-center gap-2">
            <span className="text-slate-500">Policy ID:</span>
            <span className="font-mono text-slate-700">{finding.policy_id}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-slate-500">Harness:</span>
            <span className="text-slate-700">{finding.harness_type}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-slate-500">Type:</span>
            <DriftTypeBadge type={finding.drift_type} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────── Main Component ───────────────────────────

/**
 * PolicyDriftContent - The inner content without page layout wrapper.
 * Use this when embedding in another page (like DevToolsGovernance tabs).
 */
export function PolicyDriftContent() {
  // State
  const [findings, setFindings] = useState<PolicyDriftFinding[]>([]);
  const [summary, setSummary] = useState<DriftSummary | null>(null);
  const [offenders, setOffenders] = useState<WorstOffender[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isLive, setIsLive] = useState(false);
  const [lastAnalysis, setLastAnalysis] = useState<string | null>(null);

  // Filters
  const [typeFilter, setTypeFilter] = useState<DriftType | null>(null);
  const [severityFilter, setSeverityFilter] = useState<DriftSeverity | null>(null);
  const [resolvedFilter, setResolvedFilter] = useState<boolean | null>(false);
  const [offenderFilter, setOffenderFilter] = useState<string | null>(null);

  // Selection and sorting
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<string>('detected_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  // Drawer
  const [expandedFinding, setExpandedFinding] = useState<PolicyDriftFinding | null>(null);
  const [resolving, setResolving] = useState<PolicyDriftFinding | null>(null);
  const [resolutionNote, setResolutionNote] = useState('');

  // Data source context
  const { updateSource } = useDataSources();

  // Load data
  useEffect(() => {
    let mounted = true;

    async function loadData() {
      setLoading(true);
      setError(null);

      try {
        const [analysisResp, offendersResp] = await Promise.all([
          governPolicyDriftApi.analyze(24),
          governPolicyDriftApi.offenders(24, 10),
        ]);

        if (!mounted) return;

        setFindings(analysisResp.findings);
        setSummary(analysisResp.summary);
        setOffenders(offendersResp.offenders);
        setIsLive(analysisResp.live);
        // Use the backend's own analysis timestamp: `analyze` is cached (120s TTL), so the client
        // fetch time can read "~0m ago" while the underlying CloudTrail scan is minutes old.
        // Fall back to fetch time only if the backend omits it.
        setLastAnalysis(analysisResp.last_analysis ?? new Date().toISOString());

        // Update data source status
        if (analysisResp.live) {
          updateSource('aws-cloudtrail', { status: 'live', lastFetch: Date.now() });
        }
      } catch (err) {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : 'Failed to load drift data');
        setIsLive(false);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadData();

    return () => {
      mounted = false;
    };
  }, [updateSource]);

  // Filter and sort findings
  const filteredFindings = useMemo(() => {
    let result = [...findings];

    // Apply filters
    if (typeFilter) {
      result = result.filter((f) => f.drift_type === typeFilter);
    }
    if (severityFilter) {
      result = result.filter((f) => f.severity === severityFilter);
    }
    if (resolvedFilter !== null) {
      result = result.filter((f) => f.resolved === resolvedFilter);
    }
    if (offenderFilter) {
      result = result.filter(
        (f) =>
          f.evidence.username === offenderFilter ||
          f.harness_type === offenderFilter
      );
    }

    // Sort
    result.sort((a, b) => {
      let cmp = 0;
      switch (sortBy) {
        case 'severity':
          cmp = SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity);
          break;
        case 'drift_type':
          cmp = a.drift_type.localeCompare(b.drift_type);
          break;
        case 'detected_at':
          cmp = new Date(a.detected_at).getTime() - new Date(b.detected_at).getTime();
          break;
        default:
          cmp = 0;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return result;
  }, [findings, typeFilter, severityFilter, resolvedFilter, offenderFilter, sortBy, sortDir]);

  // Drift type chart data
  const typeChartData = useMemo(() => {
    if (!summary) return [];
    return [
      { type: 'tier_violation' as DriftType, count: summary.by_type.tier_violation },
      { type: 'path_violation' as DriftType, count: summary.by_type.path_violation },
      { type: 'unknown_harness' as DriftType, count: summary.by_type.unknown_harness },
    ].filter((d) => d.count > 0);
  }, [summary]);

  // Handlers
  const handleSort = useCallback((field: string) => {
    if (sortBy === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(field);
      setSortDir('desc');
    }
  }, [sortBy]);

  const handleToggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleToggleSelectAll = useCallback(() => {
    if (selectedIds.size === filteredFindings.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredFindings.map((f) => f.finding_id)));
    }
  }, [filteredFindings, selectedIds.size]);

  const handleResolve = useCallback(async (finding: PolicyDriftFinding) => {
    setResolving(finding);
    setResolutionNote('');
  }, []);

  const handleConfirmResolve = useCallback(async () => {
    if (!resolving) return;

    try {
      await governPolicyDriftApi.resolve(resolving.finding_id, resolutionNote || undefined);
      setFindings((prev) =>
        prev.map((f) =>
          f.finding_id === resolving.finding_id
            ? { ...f, resolved: true, resolved_at: new Date().toISOString() }
            : f
        )
      );
      setResolving(null);
      setResolutionNote('');
    } catch (err) {
      console.error('Failed to resolve finding:', err);
    }
  }, [resolving, resolutionNote]);

  const handleBulkResolve = useCallback(async () => {
    const ids = Array.from(selectedIds);
    for (const id of ids) {
      try {
        await governPolicyDriftApi.resolve(id, 'Bulk resolved');
      } catch (err) {
        console.error(`Failed to resolve ${id}:`, err);
      }
    }
    setFindings((prev) =>
      prev.map((f) =>
        selectedIds.has(f.finding_id)
          ? { ...f, resolved: true, resolved_at: new Date().toISOString() }
          : f
      )
    );
    setSelectedIds(new Set());
  }, [selectedIds]);

  // Compute KPIs
  const kpis = useMemo(() => {
    if (!summary) {
      return {
        totalFindings: 0,
        complianceGap: 0,
        worstOffender: 'N/A',
        worstOffenderType: 'N/A',
        timeSinceAnalysis: 'N/A',
        severityBreakdown: { critical: 0, high: 0, medium: 0, low: 0 },
      };
    }

    const worst = offenders[0];
    return {
      totalFindings: summary.total_findings,
      complianceGap: summary.compliance_gap_percentage,
      worstOffender: worst?.identity ?? 'None',
      worstOffenderType: worst?.identity_type ?? 'N/A',
      timeSinceAnalysis: lastAnalysis ? timeAgo(lastAnalysis) : 'N/A',
      severityBreakdown: summary.by_severity,
    };
  }, [summary, offenders, lastAnalysis]);

  // Clear filters
  const clearFilters = useCallback(() => {
    setTypeFilter(null);
    setSeverityFilter(null);
    setResolvedFilter(false);
    setOffenderFilter(null);
  }, []);

  const hasActiveFilters = typeFilter || severityFilter || resolvedFilter !== false || offenderFilter;

  return (
      <div className="space-y-6">
        {/* Header for embedded mode */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-slate-900">Policy-Reality Drift</h2>
            {isLive ? (
              <LiveDataBadge source="CloudTrail" detail={`${findings.length} findings`} />
            ) : (
              <MockDataBadge integration="AWS CloudTrail + Policy Registry" />
            )}
          </div>
          <p className="text-sm text-slate-500 max-w-md">
            Detect discrepancies between declared policies and actual behavior.
          </p>
        </div>
        {/* Error state */}
        {error && (
          <div className="bg-rose-50 border border-rose-200 rounded-lg p-4 text-sm text-rose-700">
            <div className="flex items-center gap-2">
              <Icon name="exclamation-circle" className="w-5 h-5" />
              <span>{error}</span>
            </div>
          </div>
        )}

        {/* Loading state */}
        {loading && (
          <div className="bg-white/80 rounded-xl border border-slate-200/60 p-8 text-center text-sm text-slate-400 animate-pulse">
            Analyzing policy-reality drift...
          </div>
        )}

        {!loading && (
          <>
            {/* Summary KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard
                label="Total Drift Findings"
                value={kpis.totalFindings}
                sub={
                  <span className="flex items-center gap-2">
                    {kpis.severityBreakdown.critical > 0 && (
                      <span className="text-rose-600">{kpis.severityBreakdown.critical} critical</span>
                    )}
                    {kpis.severityBreakdown.high > 0 && (
                      <span className="text-orange-600">{kpis.severityBreakdown.high} high</span>
                    )}
                  </span>
                }
                variant={kpis.severityBreakdown.critical > 0 ? 'danger' : kpis.totalFindings > 0 ? 'warning' : 'success'}
                icon={<Icon name="exclamation-triangle" className="w-5 h-5 text-current opacity-50" />}
              />
              <StatCard
                label="Compliance Gap"
                value={`${kpis.complianceGap.toFixed(1)}%`}
                sub="policy vs reality variance"
                variant={kpis.complianceGap > 10 ? 'danger' : kpis.complianceGap > 5 ? 'warning' : 'success'}
                icon={<Icon name="scale" className="w-5 h-5 text-current opacity-50" />}
              />
              <StatCard
                label="Worst Offender"
                value={kpis.worstOffender}
                sub={kpis.worstOffenderType}
                variant="default"
                icon={<Icon name="user" className="w-5 h-5 text-slate-400" />}
              />
              <StatCard
                label="Last Analysis"
                value={kpis.timeSinceAnalysis}
                sub={lastAnalysis ? formatTimestamp(lastAnalysis) : 'No analysis yet'}
                variant="muted"
                icon={<Icon name="clock" className="w-5 h-5 text-slate-400" />}
              />
            </div>

            {/* Main content grid */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
              {/* Left column: Chart + Worst Offenders */}
              <div className="lg:col-span-1 space-y-6">
                {/* Drift by Type */}
                <div className="bg-white/80 rounded-xl border border-slate-200/60 p-5 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-semibold text-slate-900">Drift by Type</h3>
                    {typeFilter && (
                      <button
                        onClick={() => setTypeFilter(null)}
                        className="text-[10px] text-blue-600 hover:text-blue-700"
                      >
                        Clear filter
                      </button>
                    )}
                  </div>
                  <DriftTypeChart
                    data={typeChartData}
                    onSelectType={setTypeFilter}
                    selectedType={typeFilter}
                  />
                </div>

                {/* Worst Offenders */}
                <div className="bg-white/80 rounded-xl border border-slate-200/60 p-5 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-semibold text-slate-900">Worst Offenders</h3>
                    {offenderFilter && (
                      <button
                        onClick={() => setOffenderFilter(null)}
                        className="text-[10px] text-blue-600 hover:text-blue-700"
                      >
                        Clear filter
                      </button>
                    )}
                  </div>
                  <WorstOffendersPanel
                    offenders={offenders}
                    onSelectOffender={setOffenderFilter}
                    selectedOffender={offenderFilter}
                  />
                </div>
              </div>

              {/* Right column: Table + Trend + Comparison */}
              <div className="lg:col-span-3 space-y-6">
                {/* Filter bar */}
                <div className="bg-white/80 rounded-xl border border-slate-200/60 p-4 shadow-sm">
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div className="flex items-center gap-3">
                      {/* Severity filter */}
                      <select
                        value={severityFilter ?? ''}
                        onChange={(e) => setSeverityFilter(e.target.value as DriftSeverity || null)}
                        className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 bg-white"
                      >
                        <option value="">All Severities</option>
                        {SEVERITY_ORDER.map((s) => (
                          <option key={s} value={s}>
                            {s.charAt(0).toUpperCase() + s.slice(1)}
                          </option>
                        ))}
                      </select>

                      {/* Resolved filter */}
                      <select
                        value={resolvedFilter === null ? 'all' : resolvedFilter ? 'resolved' : 'unresolved'}
                        onChange={(e) => {
                          const v = e.target.value;
                          setResolvedFilter(v === 'all' ? null : v === 'resolved');
                        }}
                        className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 bg-white"
                      >
                        <option value="all">All Status</option>
                        <option value="unresolved">Unresolved</option>
                        <option value="resolved">Resolved</option>
                      </select>

                      {hasActiveFilters && (
                        <button
                          onClick={clearFilters}
                          className="text-[11px] text-blue-600 hover:text-blue-700"
                        >
                          Clear all filters
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {selectedIds.size > 0 && (
                        <button
                          onClick={handleBulkResolve}
                          className="text-xs px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition"
                        >
                          Resolve {selectedIds.size} selected
                        </button>
                      )}
                      <span className="text-[11px] text-slate-400">
                        {filteredFindings.length} findings
                      </span>
                    </div>
                  </div>
                </div>

                {/* Findings Table */}
                <FindingsTable
                  findings={filteredFindings}
                  selectedIds={selectedIds}
                  onToggleSelect={handleToggleSelect}
                  onToggleSelectAll={handleToggleSelectAll}
                  onExpand={setExpandedFinding}
                  onResolve={handleResolve}
                  sortBy={sortBy}
                  sortDir={sortDir}
                  onSort={handleSort}
                />

                {/* Bottom section: Trend + Comparison side by side */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Trend Chart */}
                  <div className="bg-white/80 rounded-xl border border-slate-200/60 p-5 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-sm font-semibold text-slate-900">7-Day Drift Trend</h3>
                      <MockDataBadge integration="CloudTrail Lake trend history" />
                    </div>
                    <TrendChart data={MOCK_TREND_DATA} />
                  </div>

                  {/* Policy Comparison */}
                  <div className="bg-white/80 rounded-xl border border-slate-200/60 p-5 shadow-sm">
                    <h3 className="text-sm font-semibold text-slate-900 mb-4">Policy Comparison</h3>
                    <PolicyComparisonPanel finding={expandedFinding} />
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Finding Detail Drawer */}
        <Drawer
          open={expandedFinding != null}
          onClose={() => setExpandedFinding(null)}
          title={expandedFinding ? `Drift Finding ${expandedFinding.finding_id.slice(0, 8)}...` : ''}
          subtitle={expandedFinding ? formatTimestamp(expandedFinding.detected_at) : ''}
          width="md"
        >
          {expandedFinding && (
            <div className="space-y-5">
              {/* Badges */}
              <div className="flex flex-wrap gap-2">
                <SeverityBadge severity={expandedFinding.severity} />
                <DriftTypeBadge type={expandedFinding.drift_type} />
                {expandedFinding.resolved && (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-emerald-100 text-emerald-700">
                    Resolved
                  </span>
                )}
              </div>

              {/* Policy Comparison */}
              <PolicyComparisonPanel finding={expandedFinding} />

              {/* CloudTrail Evidence */}
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2">
                  CloudTrail Evidence
                </div>
                <div className="bg-slate-50 rounded-lg p-4 space-y-2">
                  <div className="grid grid-cols-2 gap-3 text-[11px]">
                    <div>
                      <span className="text-slate-500">Event ID:</span>
                      <span className="font-mono text-slate-700 ml-1">{expandedFinding.evidence.event_id}</span>
                    </div>
                    <div>
                      <span className="text-slate-500">Event Name:</span>
                      <span className="text-slate-700 ml-1">{expandedFinding.evidence.event_name}</span>
                    </div>
                    <div>
                      <span className="text-slate-500">Source:</span>
                      <span className="text-slate-700 ml-1">{expandedFinding.evidence.event_source}</span>
                    </div>
                    {expandedFinding.evidence.username && (
                      <div>
                        <span className="text-slate-500">User:</span>
                        <span className="text-slate-700 ml-1">{expandedFinding.evidence.username}</span>
                      </div>
                    )}
                    {expandedFinding.evidence.event_time && (
                      <div>
                        <span className="text-slate-500">Time:</span>
                        <span className="text-slate-700 ml-1">
                          {formatTimestamp(expandedFinding.evidence.event_time)}
                        </span>
                      </div>
                    )}
                    {expandedFinding.evidence.user_agent && (
                      <div className="col-span-2">
                        <span className="text-slate-500">User Agent:</span>
                        <span className="text-slate-700 ml-1 truncate block">
                          {expandedFinding.evidence.user_agent}
                        </span>
                      </div>
                    )}
                  </div>

                  {expandedFinding.evidence.request_params && (
                    <div className="mt-3">
                      <div className="text-[10px] text-slate-500 mb-1">Request Parameters:</div>
                      <pre className="text-[10px] text-slate-700 bg-slate-100 rounded p-2 overflow-auto max-h-32">
                        {JSON.stringify(expandedFinding.evidence.request_params, null, 2)}
                      </pre>
                    </div>
                  )}

                  {expandedFinding.evidence.error_code && (
                    <div className="text-[11px] text-rose-600">
                      Error: {expandedFinding.evidence.error_code}
                    </div>
                  )}
                </div>
              </div>

              {/* Resolution info */}
              {expandedFinding.resolved && (
                <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-600 mb-1">
                    Resolution
                  </div>
                  <div className="text-[11px] text-emerald-800">
                    {expandedFinding.resolution_note || 'No notes provided'}
                  </div>
                  {expandedFinding.resolved_at && (
                    <div className="text-[10px] text-emerald-600 mt-1">
                      Resolved {timeAgo(expandedFinding.resolved_at)} by {expandedFinding.resolved_by || 'system'}
                    </div>
                  )}
                </div>
              )}

              {/* Resolve button */}
              {!expandedFinding.resolved && (
                <div className="pt-3 border-t border-slate-100">
                  <button
                    onClick={() => handleResolve(expandedFinding)}
                    className="w-full px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition"
                  >
                    Mark as Resolved
                  </button>
                </div>
              )}
            </div>
          )}
        </Drawer>

        {/* Resolve Confirmation Drawer */}
        <Drawer
          open={resolving != null}
          onClose={() => {
            setResolving(null);
            setResolutionNote('');
          }}
          title="Resolve Drift Finding"
          subtitle={resolving ? `${resolving.finding_id.slice(0, 8)}...` : ''}
          width="md"
        >
          {resolving && (
            <div className="space-y-4">
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                <div className="flex items-center gap-2 mb-2">
                  <SeverityBadge severity={resolving.severity} />
                  <DriftTypeBadge type={resolving.drift_type} />
                </div>
                <div className="text-[11px] text-slate-600">
                  <span className="text-emerald-600">{resolving.expected}</span>
                  {' -> '}
                  <span className="text-rose-600">{resolving.actual}</span>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-700 mb-1">
                  Resolution Note (optional)
                </label>
                <textarea
                  value={resolutionNote}
                  onChange={(e) => setResolutionNote(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm resize-none"
                  rows={3}
                  placeholder="Describe how this was resolved..."
                />
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setResolving(null);
                    setResolutionNote('');
                  }}
                  className="flex-1 px-3 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmResolve}
                  className="flex-1 px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition"
                >
                  Confirm Resolve
                </button>
              </div>
            </div>
          )}
        </Drawer>

        {/* Data Source Info Panel */}
        <DataSourceInfo
          pageId="policy-drift"
          pageTitle="Policy-Reality Drift Dashboard"
          sources={getPageDataSources('policy-drift')}
        />
      </div>
  );
}

/**
 * PolicyDriftDashboard - Full page version with layout wrapper.
 * Use this for standalone /govern/policy-drift route.
 */
export default function PolicyDriftDashboard() {
  return (
    <GovernPageLayout
      title="Policy-Reality Drift"
      description="Detect and remediate discrepancies between declared policies and actual AI system behavior."
    >
      <PolicyDriftContent />
    </GovernPageLayout>
  );
}
