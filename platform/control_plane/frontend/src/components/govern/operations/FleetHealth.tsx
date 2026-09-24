/**
 * FleetHealth - Deep-dive fleet monitoring view for SREs
 *
 * Features:
 * - KPI summary row (Total Agents, Healthy %, Degraded/Down counts, Latency p99, Error Rate)
 * - Grid/Table view toggle for agent display
 * - Multi-dimensional filtering (status, provider, search, sort)
 * - Agent detail drawer with full metrics, incidents, SLAs, and runbook access
 * - Bulk actions (pause, restart, diagnostic) with selection
 * - Mini sparklines for health visualization
 * - Live data from CloudWatch when available, with mock fallback
 */

import { useState, useMemo, useCallback, useEffect } from 'react';
import { Icon } from '../icons';
import StatCard from '../StatCard';
import Drawer from '../Drawer';
import { MockDataBadge, LiveDataBadge } from '../DataSourceIndicator';
import {
  useFleetStatus,
  useFleetAgents,
  type FleetAgent,
  type AgentStatus,
  type CloudProvider,
  type HealthMetric,
} from '../useFleetHealth';

// ============================================================================
// Types
// ============================================================================

type SortField = 'name' | 'status' | 'latency' | 'errorRate' | 'invocations';


// ============================================================================
// Helper Components
// ============================================================================

const PROVIDER_COLORS: Record<CloudProvider, { bg: string; text: string; border: string }> = {
  AWS: { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200' },
  Azure: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
  GCP: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' },
};

const STATUS_CONFIG: Record<AgentStatus, { dot: string; bg: string; text: string; label: string }> = {
  healthy: { dot: 'bg-emerald-500', bg: 'bg-emerald-50', text: 'text-emerald-700', label: 'Healthy' },
  degraded: { dot: 'bg-amber-500', bg: 'bg-amber-50', text: 'text-amber-700', label: 'Degraded' },
  down: { dot: 'bg-rose-500', bg: 'bg-rose-50', text: 'text-rose-700', label: 'Down' },
};

function MiniSparkline({ data, status }: { data: HealthMetric[]; status: AgentStatus }) {
  const values = data.map(d => d.value);
  const max = Math.max(...values, 100);
  const min = Math.min(...values, 0);
  const range = max - min || 1;

  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * 60;
    const y = 20 - ((v - min) / range) * 18;
    return `${x},${y}`;
  }).join(' ');

  const color = status === 'healthy' ? '#10b981' : status === 'degraded' ? '#f59e0b' : '#ef4444';

  return (
    <svg width="60" height="24" className="flex-shrink-0">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ProviderBadge({ provider }: { provider: CloudProvider }) {
  const colors = PROVIDER_COLORS[provider];
  return (
    <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded border ${colors.bg} ${colors.text} ${colors.border}`}>
      {provider}
    </span>
  );
}

function StatusDot({ status }: { status: AgentStatus }) {
  const config = STATUS_CONFIG[status];
  return (
    <span className={`w-2 h-2 rounded-full ${config.dot} ${status === 'healthy' ? '' : 'animate-pulse'}`} />
  );
}

// ============================================================================
// Agent Card (Grid View)
// ============================================================================

interface AgentCardProps {
  agent: FleetAgent;
  selected: boolean;
  onSelect: (id: string) => void;
  onClick: (agent: FleetAgent) => void;
}

function AgentCard({ agent, selected, onSelect, onClick }: AgentCardProps) {
  const statusConfig = STATUS_CONFIG[agent.status];

  return (
    <div
      className={`bg-white/80 backdrop-blur-sm rounded-xl border p-4 cursor-pointer transition-all hover:shadow-md ${
        selected ? 'border-blue-400 ring-2 ring-blue-200' : 'border-slate-200/60'
      }`}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={selected}
            onChange={(e) => {
              e.stopPropagation();
              onSelect(agent.id);
            }}
            className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
          />
          <StatusDot status={agent.status} />
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${statusConfig.bg} ${statusConfig.text}`}>
            {statusConfig.label}
          </span>
          {agent.isLive && (
            <span className="text-[8px] px-1 py-0.5 rounded bg-emerald-100 text-emerald-700 font-medium" title="Live CloudWatch metrics">
              LIVE
            </span>
          )}
        </div>
        <ProviderBadge provider={agent.provider} />
      </div>

      {/* Name & Click Area */}
      <div onClick={() => onClick(agent)} className="space-y-3">
        <div>
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-semibold text-slate-900 truncate">{agent.name}</span>
          </div>
          <div className="text-[10px] text-slate-500">{agent.owner}</div>
        </div>

        {/* Sparkline */}
        <div className="flex items-center justify-between">
          <MiniSparkline data={agent.healthHistory} status={agent.status} />
          <div className="text-right">
            <div className="text-xs font-semibold text-slate-700">{agent.latencyP99}ms</div>
            <div className="text-[9px] text-slate-400">p99 latency</div>
          </div>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100">
          <div>
            <div className={`text-xs font-semibold ${agent.errorRate > 2 ? 'text-rose-600' : agent.errorRate > 1 ? 'text-amber-600' : 'text-slate-700'}`}>
              {agent.errorRate.toFixed(1)}%
            </div>
            <div className="text-[9px] text-slate-400">Error Rate</div>
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-700">{agent.invocations24h.toLocaleString()}</div>
            <div className="text-[9px] text-slate-400">24h Invocations</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Agent Table Row
// ============================================================================

interface AgentRowProps {
  agent: FleetAgent;
  selected: boolean;
  onSelect: (id: string) => void;
  onClick: (agent: FleetAgent) => void;
}

function AgentRow({ agent, selected, onSelect, onClick }: AgentRowProps) {
  const statusConfig = STATUS_CONFIG[agent.status];

  return (
    <tr
      className={`border-t border-slate-100 cursor-pointer hover:bg-slate-50/50 transition-colors ${
        selected ? 'bg-blue-50/50' : ''
      }`}
      onClick={() => onClick(agent)}
    >
      <td className="py-3 px-4" onClick={(e) => e.stopPropagation()}>
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onSelect(agent.id)}
          className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
        />
      </td>
      <td className="py-3 px-4">
        <div className="flex items-center gap-2">
          <StatusDot status={agent.status} />
          <span className="text-sm font-medium text-slate-900">{agent.name}</span>
          {agent.isLive && (
            <span className="text-[8px] px-1 py-0.5 rounded bg-emerald-100 text-emerald-700 font-medium" title="Live CloudWatch metrics">
              LIVE
            </span>
          )}
        </div>
      </td>
      <td className="py-3 px-4">
        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${statusConfig.bg} ${statusConfig.text}`}>
          {statusConfig.label}
        </span>
      </td>
      <td className="py-3 px-4">
        <ProviderBadge provider={agent.provider} />
      </td>
      <td className="py-3 px-4 text-sm tabular-nums text-slate-700">{agent.latencyP99}ms</td>
      <td className={`py-3 px-4 text-sm tabular-nums ${agent.errorRate > 2 ? 'text-rose-600' : agent.errorRate > 1 ? 'text-amber-600' : 'text-slate-700'}`}>
        {agent.errorRate.toFixed(1)}%
      </td>
      <td className="py-3 px-4 text-sm tabular-nums text-slate-700">{agent.invocations24h.toLocaleString()}</td>
      <td className="py-3 px-4 text-xs text-slate-500">{agent.lastIncident || '-'}</td>
      <td className="py-3 px-4 text-xs text-slate-500">{agent.owner}</td>
    </tr>
  );
}

// ============================================================================
// Agent Detail Drawer
// ============================================================================

interface AgentDrawerProps {
  agent: FleetAgent | null;
  onClose: () => void;
}

function AgentDetailDrawer({ agent, onClose }: AgentDrawerProps) {
  // Deterministic 24-hour series derived from a HASH OF THE AGENT ID. It is not
  // telemetry - there is no hourly history behind it. Rendered only for seeded
  // (non-live) agents; for a live CloudWatch agent the charts are suppressed instead,
  // matching the treatment this drawer already applies to 24h Cost below.
  //
  // Why this matters: `AwsAgentRuntimeMetric` carries only runtime_name, invocations,
  // avg_latency_ms, errors and sessions - no hourly breakdown exists to plot. The bars
  // previously rendered for live agents with exact-value tooltips ("14:00: 431ms"),
  // which reads as measured history.
  // Note: must be before early return to satisfy Rules of Hooks.
  const seed = agent?.id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) ?? 0;
  const chartData = useMemo(() => Array.from({ length: 24 }, (_, i) => ({
    hour: `${i}:00`,
    latency: 200 + ((seed * (i + 1) * 17) % 300),
    errors: ((seed * (i + 1) * 13) % 200) / 100,
    invocations: 1000 + ((seed * (i + 1) * 23) % 3000),
  })), [seed]);

  if (!agent) return null;

  const statusConfig = STATUS_CONFIG[agent.status];

  return (
    <Drawer
      open={!!agent}
      onClose={onClose}
      title={agent.name}
      // Only render the parts that actually exist. For a live CloudWatch agent these
      // are all empty (the runtime payload has no framework/version/region), so the
      // subtitle collapses to the provider rather than printing "  v  - ".
      subtitle={[
        agent.framework,
        agent.version ? `v${agent.version}` : '',
        agent.region,
      ].filter(Boolean).join(' ') || `${agent.provider} runtime metrics`}
      width="xl"
    >
      <div className="space-y-6">
        {/* Status Banner */}
        <div className={`flex items-center justify-between p-3 rounded-lg ${statusConfig.bg} border ${statusConfig.bg.replace('bg-', 'border-').replace('-50', '-200')}`}>
          <div className="flex items-center gap-3">
            <StatusDot status={agent.status} />
            <div>
              <span className={`text-sm font-semibold ${statusConfig.text}`}>{statusConfig.label}</span>
              <span className="text-slate-500 text-xs ml-2">Last updated: just now</span>
            </div>
          </div>
          <ProviderBadge provider={agent.provider} />
        </div>

        {/* Metrics Grid */}
        <div>
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Key Metrics</div>
          <div className="grid grid-cols-4 gap-3">
            <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
              <div className="text-[10px] text-slate-400 uppercase">Latency p99</div>
              <div className={`text-lg font-bold ${agent.latencyP99 > 1000 ? 'text-rose-600' : agent.latencyP99 > 500 ? 'text-amber-600' : 'text-slate-900'}`}>
                {agent.latencyP99}ms
              </div>
            </div>
            <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
              <div className="text-[10px] text-slate-400 uppercase">Error Rate</div>
              <div className={`text-lg font-bold ${agent.errorRate > 2 ? 'text-rose-600' : agent.errorRate > 1 ? 'text-amber-600' : 'text-emerald-600'}`}>
                {agent.errorRate.toFixed(2)}%
              </div>
            </div>
            <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
              <div className="text-[10px] text-slate-400 uppercase">24h Invocations</div>
              <div className="text-lg font-bold text-slate-900">{agent.invocations24h.toLocaleString()}</div>
            </div>
            <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
              <div className="text-[10px] text-slate-400 uppercase">24h Cost</div>
              {agent.isLive ? (
                <div className="text-lg font-bold text-slate-400" title="Cost is not available from live runtime metrics">--</div>
              ) : (
                <div className="text-lg font-bold text-slate-900">${agent.cost24h.toFixed(2)}</div>
              )}
            </div>
          </div>
        </div>

        {/* 24-Hour Charts. Suppressed for live agents - see the note on `seed`. */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">24-Hour Trends</div>
            {!agent.isLive && <MockDataBadge integration="Hourly latency and error history" />}
          </div>
          {agent.isLive ? (
            <div className="text-[11px] text-slate-500 bg-slate-50 border border-slate-200 rounded-lg p-3">
              Hourly history is not available from live CloudWatch runtime metrics. The
              runtime feed reports current invocations, average latency, errors and
              sessions &mdash; not an hourly breakdown, so there is no 24-hour series to plot.
            </div>
          ) : (
          <div className="grid grid-cols-2 gap-4">
            {/* Latency Chart */}
            <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
              <div className="text-[10px] text-slate-500 mb-2">Latency (ms)</div>
              <div className="h-20 flex items-end gap-0.5">
                {chartData.map((d, i) => (
                  <div
                    key={i}
                    className="flex-1 bg-blue-400 rounded-t"
                    style={{ height: `${(d.latency / 500) * 100}%` }}
                    title={`${d.hour}: ${d.latency.toFixed(0)}ms`}
                  />
                ))}
              </div>
            </div>
            {/* Error Rate Chart */}
            <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
              <div className="text-[10px] text-slate-500 mb-2">Error Rate (%)</div>
              <div className="h-20 flex items-end gap-0.5">
                {chartData.map((d, i) => (
                  <div
                    key={i}
                    className={`flex-1 rounded-t ${d.errors > 1.5 ? 'bg-rose-400' : d.errors > 0.5 ? 'bg-amber-400' : 'bg-emerald-400'}`}
                    style={{ height: `${(d.errors / 2) * 100}%` }}
                    title={`${d.hour}: ${d.errors.toFixed(2)}%`}
                  />
                ))}
              </div>
            </div>
          </div>
          )}
        </div>

        {/* SLA Status */}
        <div>
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">SLA Compliance</div>
          <div className="space-y-2">
            {agent.slas.map((sla, i) => {
              const statusColors = {
                met: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
                'at-risk': { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
                breached: { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200' },
              };
              const colors = statusColors[sla.status];
              return (
                <div key={i} className={`flex items-center justify-between p-3 rounded-lg border ${colors.bg} ${colors.border}`}>
                  <div>
                    <div className="text-sm font-medium text-slate-800">{sla.name}</div>
                    <div className="text-[10px] text-slate-500">Target: {sla.target}{sla.name.includes('%') || sla.name.includes('Rate') ? '%' : ''}</div>
                  </div>
                  <div className="text-right">
                    <div className={`text-lg font-bold ${colors.text}`}>
                      {sla.current.toFixed(sla.current < 10 ? 2 : 1)}{sla.name.includes('%') || sla.name.includes('Availability') ? '%' : 'ms'}
                    </div>
                    <div className={`text-[10px] font-semibold uppercase ${colors.text}`}>{sla.status}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Recent Incidents */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Recent Incidents</div>
            <span className="text-[10px] text-slate-400">{agent.incidents.filter(i => !i.resolved).length} open</span>
          </div>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {agent.incidents.slice(0, 5).map((incident) => {
              const severityColors = {
                critical: 'bg-rose-100 text-rose-700',
                high: 'bg-orange-100 text-orange-700',
                medium: 'bg-amber-100 text-amber-700',
                low: 'bg-slate-100 text-slate-600',
              };
              return (
                <div key={incident.id} className={`flex items-center justify-between p-2.5 rounded-lg border ${incident.resolved ? 'bg-slate-50 border-slate-100' : 'bg-white border-slate-200'}`}>
                  <div className="flex items-center gap-2">
                    <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded uppercase ${severityColors[incident.severity]}`}>
                      {incident.severity}
                    </span>
                    <span className={`text-xs ${incident.resolved ? 'text-slate-500' : 'text-slate-800'}`}>{incident.title}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-400">{new Date(incident.timestamp).toLocaleDateString()}</span>
                    {incident.resolved ? (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 font-medium">Resolved</span>
                    ) : (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 font-medium">Open</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Runbook Quick Launch */}
        {/* Hidden entirely when there is no runbook. Live agents now carry an empty
            runbookUrl (the runtime payload has no such field), and an <a href=""> renders
            a fully-styled "Open Runbook" button that silently reloads the page - a dead
            control that looks operational. */}
        {agent.runbookUrl ? (
        <div className="flex items-center justify-between p-4 rounded-lg bg-blue-50 border border-blue-200">
          <div>
            <div className="text-sm font-semibold text-blue-900">Runbook</div>
            <div className="text-[10px] text-blue-700">Quick access to operational procedures</div>
          </div>
          <a
            href={agent.runbookUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors flex items-center gap-1.5"
          >
            <Icon name="book-open" className="w-4 h-4" />
            Open Runbook
          </a>
        </div>
        ) : (
          <div className="flex items-center justify-between p-4 rounded-lg bg-slate-50 border border-slate-200">
            <div>
              <div className="text-sm font-semibold text-slate-700">Runbook</div>
              <div className="text-[10px] text-slate-500">No runbook is linked for this agent</div>
            </div>
          </div>
        )}

        {/* Actions — demo controls, not yet wired to a backend */}
        <div className="pt-4 border-t border-slate-200">
          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled
              title="Demo — pause is not yet wired to a backend"
              className="flex-1 px-4 py-2 text-sm font-medium text-white bg-amber-500 rounded-lg opacity-50 cursor-not-allowed flex items-center justify-center gap-2"
            >
              <Icon name="pause-circle" className="w-4 h-4" />
              Pause Agent
            </button>
            <button
              type="button"
              disabled
              title="Demo — restart is not yet wired to a backend"
              className="flex-1 px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg opacity-50 cursor-not-allowed flex items-center justify-center gap-2"
            >
              <Icon name="arrow-path" className="w-4 h-4" />
              Restart
            </button>
            <button
              type="button"
              disabled
              title="Demo — diagnostics are not yet wired to a backend"
              className="flex-1 px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg opacity-50 cursor-not-allowed flex items-center justify-center gap-2"
            >
              <Icon name="beaker" className="w-4 h-4" />
              Run Diagnostic
            </button>
          </div>
          <div className="mt-2 text-[10px] text-slate-400 italic">
            Agent lifecycle actions are a demo preview and are not yet connected.
          </div>
        </div>
      </div>
    </Drawer>
  );
}

// ============================================================================
// Loading Skeletons
// ============================================================================

function KpiSkeleton() {
  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-4 animate-pulse">
      <div className="h-3 w-16 bg-slate-200 rounded mb-2" />
      <div className="h-6 w-12 bg-slate-200 rounded" />
    </div>
  );
}

function AgentCardSkeleton() {
  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-4 animate-pulse">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-slate-200 rounded" />
          <div className="w-2 h-2 bg-slate-200 rounded-full" />
          <div className="h-4 w-16 bg-slate-200 rounded" />
        </div>
        <div className="h-4 w-10 bg-slate-200 rounded" />
      </div>
      <div className="space-y-3">
        <div>
          <div className="h-4 w-32 bg-slate-200 rounded mb-1" />
          <div className="h-3 w-20 bg-slate-200 rounded" />
        </div>
        <div className="flex items-center justify-between">
          <div className="w-16 h-6 bg-slate-200 rounded" />
          <div className="text-right">
            <div className="h-4 w-12 bg-slate-200 rounded mb-1" />
            <div className="h-2 w-16 bg-slate-200 rounded" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100">
          <div>
            <div className="h-4 w-10 bg-slate-200 rounded mb-1" />
            <div className="h-2 w-14 bg-slate-200 rounded" />
          </div>
          <div>
            <div className="h-4 w-14 bg-slate-200 rounded mb-1" />
            <div className="h-2 w-16 bg-slate-200 rounded" />
          </div>
        </div>
      </div>
    </div>
  );
}

function AgentRowSkeleton() {
  return (
    <tr className="border-t border-slate-100 animate-pulse">
      <td className="py-3 px-4"><div className="w-4 h-4 bg-slate-200 rounded" /></td>
      <td className="py-3 px-4"><div className="h-4 w-32 bg-slate-200 rounded" /></td>
      <td className="py-3 px-4"><div className="h-4 w-16 bg-slate-200 rounded" /></td>
      <td className="py-3 px-4"><div className="h-4 w-10 bg-slate-200 rounded" /></td>
      <td className="py-3 px-4"><div className="h-4 w-14 bg-slate-200 rounded" /></td>
      <td className="py-3 px-4"><div className="h-4 w-12 bg-slate-200 rounded" /></td>
      <td className="py-3 px-4"><div className="h-4 w-16 bg-slate-200 rounded" /></td>
      <td className="py-3 px-4"><div className="h-4 w-20 bg-slate-200 rounded" /></td>
      <td className="py-3 px-4"><div className="h-4 w-20 bg-slate-200 rounded" /></td>
    </tr>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export default function FleetHealth() {
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [statusFilter, setStatusFilter] = useState<AgentStatus | 'all'>('all');
  const [providerFilter, setProviderFilter] = useState<CloudProvider | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<SortField>('status');
  const [sortAsc, setSortAsc] = useState(true);
  const [selectedAgents, setSelectedAgents] = useState<Set<string>>(new Set());
  const [detailAgent, setDetailAgent] = useState<FleetAgent | null>(null);

  // Live data hooks
  const { kpis, loading: kpisLoading, source: kpisSource, refresh: refreshKpis } = useFleetStatus();
  const {
    agents: rawAgents,
    loading: agentsLoading,
    liveCount,
    demoCount,
    source: agentsSource,
    refresh: refreshAgents,
  } = useFleetAgents({
    status: statusFilter,
    provider: providerFilter,
    search: searchQuery,
  });

  // Refetch on filter changes
  useEffect(() => {
    refreshAgents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, providerFilter, searchQuery]);

  // Sort filtered agents (hooks handle filtering, we just sort)
  const filteredAgents = useMemo(() => {
    let result = [...rawAgents];

    // Sort
    result = result.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'name':
          cmp = a.name.localeCompare(b.name);
          break;
        case 'status': {
          const statusOrder = { down: 0, degraded: 1, healthy: 2 };
          cmp = statusOrder[a.status] - statusOrder[b.status];
          break;
        }
        case 'latency':
          cmp = a.latencyP99 - b.latencyP99;
          break;
        case 'errorRate':
          cmp = a.errorRate - b.errorRate;
          break;
        case 'invocations':
          cmp = a.invocations24h - b.invocations24h;
          break;
      }
      return sortAsc ? cmp : -cmp;
    });

    return result;
  }, [rawAgents, sortField, sortAsc]);

  // Determine overall data source for badge
  const dataSource = kpisSource === 'live' && agentsSource === 'live' ? 'live' :
    kpisSource === 'demo' && agentsSource === 'demo' ? 'demo' : 'mixed';

  // Selection handlers
  const toggleSelection = useCallback((id: string) => {
    setSelectedAgents(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    if (selectedAgents.size === filteredAgents.length) {
      setSelectedAgents(new Set());
    } else {
      setSelectedAgents(new Set(filteredAgents.map(a => a.id)));
    }
  }, [filteredAgents, selectedAgents.size]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  // Refresh handler
  const handleRefresh = useCallback(() => {
    refreshKpis();
    refreshAgents();
  }, [refreshKpis, refreshAgents]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-slate-900">Fleet Health</h2>
            {dataSource === 'live' ? (
              <LiveDataBadge source="CloudWatch" detail="Live metrics from AWS CloudWatch" />
            ) : dataSource === 'mixed' ? (
              <span className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded bg-sky-50 text-sky-600 border border-sky-200 cursor-help" title={`${liveCount} live agents, ${demoCount} demo agents`}>
                <span className="w-1 h-1 rounded-full bg-sky-500" />
                Mixed ({liveCount} live)
              </span>
            ) : (
              <MockDataBadge integration="CloudWatch / provider metrics" />
            )}
          </div>
          <p className="text-[11px] text-slate-500">
            Deep-dive fleet monitoring for SREs. Real-time health, metrics, and incident tracking across all agents.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            disabled={kpisLoading || agentsLoading}
            className={`p-2 rounded-lg transition-colors bg-slate-100 text-slate-500 hover:bg-slate-200 disabled:opacity-50`}
            title="Refresh data"
          >
            <Icon name="arrow-path" className={`w-4 h-4 ${(kpisLoading || agentsLoading) ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setViewMode('grid')}
            className={`p-2 rounded-lg transition-colors ${viewMode === 'grid' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
            title="Grid View"
          >
            <Icon name="squares-2x2" className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode('table')}
            className={`p-2 rounded-lg transition-colors ${viewMode === 'table' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
            title="Table View"
          >
            <Icon name="queue-list" className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* KPI Summary Row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpisLoading ? (
          <>
            <KpiSkeleton />
            <KpiSkeleton />
            <KpiSkeleton />
            <KpiSkeleton />
            <KpiSkeleton />
            <KpiSkeleton />
          </>
        ) : (
          <>
            <StatCard label="Total Agents" value={kpis.total} />
            <StatCard
              label="Healthy %"
              value={`${kpis.healthyPct}%`}
              variant={kpis.healthyPct >= 90 ? 'success' : kpis.healthyPct >= 70 ? 'warning' : 'danger'}
            />
            <StatCard
              label="Degraded"
              value={kpis.degraded}
              variant={kpis.degraded > 0 ? 'warning' : 'default'}
            />
            <StatCard
              label="Down"
              value={kpis.down}
              variant={kpis.down > 0 ? 'danger' : 'success'}
            />
            <StatCard label="Avg Latency p99" value={`${kpis.avgLatency}ms`} />
            <StatCard
              label="Avg Error Rate"
              value={`${kpis.avgErrorRate}%`}
              variant={parseFloat(kpis.avgErrorRate) > 2 ? 'danger' : parseFloat(kpis.avgErrorRate) > 1 ? 'warning' : 'success'}
            />
          </>
        )}
      </div>

      {/* Filters & Bulk Actions */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Status Filter */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">Status:</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as AgentStatus | 'all')}
            className="px-2 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-blue-500"
          >
            <option value="all">All</option>
            <option value="healthy">Healthy</option>
            <option value="degraded">Degraded</option>
            <option value="down">Down</option>
          </select>
        </div>

        {/* Provider Filter */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">Provider:</span>
          <select
            value={providerFilter}
            onChange={(e) => setProviderFilter(e.target.value as CloudProvider | 'all')}
            className="px-2 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-blue-500"
          >
            <option value="all">All</option>
            <option value="AWS">AWS</option>
            <option value="Azure">Azure</option>
            <option value="GCP">GCP</option>
          </select>
        </div>

        {/* Search */}
        <div className="flex items-center gap-2 flex-1 max-w-xs">
          <Icon name="search" className="w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by name or owner..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 px-2 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-blue-500"
          />
        </div>

        {/* Sort */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">Sort:</span>
          <select
            value={sortField}
            onChange={(e) => handleSort(e.target.value as SortField)}
            className="px-2 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-blue-500"
          >
            <option value="status">Status</option>
            <option value="name">Name</option>
            <option value="latency">Latency</option>
            <option value="errorRate">Error Rate</option>
            <option value="invocations">Invocations</option>
          </select>
          <button
            onClick={() => setSortAsc(!sortAsc)}
            className="p-1.5 text-slate-500 hover:bg-slate-100 rounded transition-colors"
            title={sortAsc ? 'Ascending' : 'Descending'}
          >
            <Icon name={sortAsc ? 'chevron-up' : 'chevron-down'} className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1" />

        {/* Bulk Actions — demo controls, not yet wired to a backend */}
        {selectedAgents.size > 0 && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-lg">
            <span className="text-xs font-medium text-blue-700">{selectedAgents.size} selected</span>
            <div className="w-px h-4 bg-blue-200" />
            <button
              type="button"
              disabled
              title="Demo — bulk pause is not yet wired to a backend"
              className="px-2 py-1 text-[10px] font-medium text-amber-700 bg-amber-100 rounded flex items-center gap-1 opacity-50 cursor-not-allowed"
            >
              <Icon name="pause-circle" className="w-3 h-3" />
              Pause
            </button>
            <button
              type="button"
              disabled
              title="Demo — bulk restart is not yet wired to a backend"
              className="px-2 py-1 text-[10px] font-medium text-emerald-700 bg-emerald-100 rounded flex items-center gap-1 opacity-50 cursor-not-allowed"
            >
              <Icon name="arrow-path" className="w-3 h-3" />
              Restart
            </button>
            <button
              type="button"
              disabled
              title="Demo — bulk diagnostics are not yet wired to a backend"
              className="px-2 py-1 text-[10px] font-medium text-blue-700 bg-blue-100 rounded flex items-center gap-1 opacity-50 cursor-not-allowed"
            >
              <Icon name="beaker" className="w-3 h-3" />
              Diagnostic
            </button>
            <span className="text-[9px] text-slate-400 italic">Demo</span>
            <button
              type="button"
              onClick={() => setSelectedAgents(new Set())}
              className="p-1 text-slate-500 hover:bg-slate-100 rounded transition-colors"
              title="Clear selection"
            >
              <Icon name="x-mark" className="w-3 h-3" />
            </button>
          </div>
        )}

        <span className="text-xs text-slate-500">
          {agentsLoading ? 'Loading...' : `${filteredAgents.length} agents`}
          {!agentsLoading && liveCount > 0 && (
            <span className="text-emerald-600 ml-1">({liveCount} live)</span>
          )}
        </span>
      </div>

      {/* Agent Display */}
      {viewMode === 'grid' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {agentsLoading ? (
            <>
              <AgentCardSkeleton />
              <AgentCardSkeleton />
              <AgentCardSkeleton />
              <AgentCardSkeleton />
              <AgentCardSkeleton />
              <AgentCardSkeleton />
              <AgentCardSkeleton />
              <AgentCardSkeleton />
            </>
          ) : (
            filteredAgents.map((agent) => (
              <AgentCard
                key={agent.id}
                agent={agent}
                selected={selectedAgents.has(agent.id)}
                onSelect={toggleSelection}
                onClick={setDetailAgent}
              />
            ))
          )}
        </div>
      ) : (
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50/50 text-[10px] text-slate-500 uppercase tracking-wide">
                <th className="py-3 px-4 text-left">
                  <input
                    type="checkbox"
                    checked={selectedAgents.size === filteredAgents.length && filteredAgents.length > 0}
                    onChange={selectAll}
                    disabled={agentsLoading}
                    className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                </th>
                <th className="py-3 px-4 text-left font-medium cursor-pointer hover:text-slate-700" onClick={() => handleSort('name')}>
                  Name {sortField === 'name' && (sortAsc ? '↑' : '↓')}
                </th>
                <th className="py-3 px-4 text-left font-medium cursor-pointer hover:text-slate-700" onClick={() => handleSort('status')}>
                  Status {sortField === 'status' && (sortAsc ? '↑' : '↓')}
                </th>
                <th className="py-3 px-4 text-left font-medium">Provider</th>
                <th className="py-3 px-4 text-left font-medium cursor-pointer hover:text-slate-700" onClick={() => handleSort('latency')}>
                  Latency p99 {sortField === 'latency' && (sortAsc ? '↑' : '↓')}
                </th>
                <th className="py-3 px-4 text-left font-medium cursor-pointer hover:text-slate-700" onClick={() => handleSort('errorRate')}>
                  Error Rate {sortField === 'errorRate' && (sortAsc ? '↑' : '↓')}
                </th>
                <th className="py-3 px-4 text-left font-medium cursor-pointer hover:text-slate-700" onClick={() => handleSort('invocations')}>
                  24h Invocations {sortField === 'invocations' && (sortAsc ? '↑' : '↓')}
                </th>
                <th className="py-3 px-4 text-left font-medium">Last Incident</th>
                <th className="py-3 px-4 text-left font-medium">Owner</th>
              </tr>
            </thead>
            <tbody>
              {agentsLoading ? (
                <>
                  <AgentRowSkeleton />
                  <AgentRowSkeleton />
                  <AgentRowSkeleton />
                  <AgentRowSkeleton />
                  <AgentRowSkeleton />
                </>
              ) : (
                filteredAgents.map((agent) => (
                  <AgentRow
                    key={agent.id}
                    agent={agent}
                    selected={selectedAgents.has(agent.id)}
                    onSelect={toggleSelection}
                    onClick={setDetailAgent}
                  />
                ))
              )}
            </tbody>
          </table>
          {!agentsLoading && filteredAgents.length === 0 && (
            <div className="text-center py-12 text-slate-500">
              <Icon name="search" className="w-12 h-12 mx-auto mb-3 text-slate-300" />
              <div className="text-sm font-medium">No agents match your filters</div>
              <div className="text-xs">Try adjusting your search or filter criteria</div>
            </div>
          )}
        </div>
      )}

      {/* Agent Detail Drawer */}
      <AgentDetailDrawer agent={detailAgent} onClose={() => setDetailAgent(null)} />
    </div>
  );
}
