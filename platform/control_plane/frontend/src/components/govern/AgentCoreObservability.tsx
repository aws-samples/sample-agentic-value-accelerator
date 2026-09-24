/**
 * AgentCoreObservability — comprehensive AgentCore observability dashboard
 *
 * Provides 4 tabs of live monitoring data for AWS AgentCore deployments:
 * - Runtime: agent invocations, latency, errors, resource usage
 * - Gateway: API Gateway metrics per gateway/endpoint
 * - Memory: memory store operations and performance
 * - Traces: distributed trace list with filtering
 *
 * Uses live AWS CloudWatch + X-Ray data with auto-refresh.
 */

import { useState, useEffect, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import type { Formatter, ValueType, NameType } from 'recharts/types/component/DefaultTooltipContent';
import { governAgentCoreApi } from '../../api/client';
import type {
  AwsAgentRuntimeMetricsResponse,
  AwsResourceUsageResponse,
  AwsGatewayMetricsResponse,
  AwsMemoryMetricsResponse,
  AwsAgentTracesResponse,
} from '../../api/client';
import { Icon } from './icons';
import { LiveDataBadge } from './DataSourceIndicator';
import GovernPageLayout from './GovernPageLayout';
import StatCard from './StatCard';
import { usePollingKey } from './usePollingKey';
import { useDataSources } from './DataSourceContext';

type TabId = 'runtime' | 'gateway' | 'memory' | 'traces' | 'llm';

interface Tab {
  id: TabId;
  label: string;
  icon: string;
}

const TABS: Tab[] = [
  { id: 'runtime', label: 'Runtime', icon: 'cpu-chip' },
  { id: 'gateway', label: 'Gateway', icon: 'arrow-right-on-rectangle' },
  { id: 'memory', label: 'Memory', icon: 'circle-stack' },
  { id: 'traces', label: 'Traces', icon: 'chart-line' },
  { id: 'llm', label: 'LLM Calls', icon: 'sparkles' },
];

const compact = (n: number) => n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : `${n}`;
const pct = (n: number) => `${n.toFixed(1)}%`;
const ms = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(2)}s` : `${Math.round(n)}ms`;

interface AgentCoreObservabilityContentProps {
  days?: number;
  /** Reports aggregate liveness (any section .live) up to the page layout badge. */
  onLiveChange?: (live: boolean) => void;
}

export function AgentCoreObservabilityContent({ days = 7, onLiveChange }: AgentCoreObservabilityContentProps) {
  const [activeTab, setActiveTab] = useState<TabId>('runtime');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Data states
  const [runtimeData, setRuntimeData] = useState<AwsAgentRuntimeMetricsResponse | null>(null);
  const [resourceData, setResourceData] = useState<AwsResourceUsageResponse | null>(null);
  const [gatewayData, setGatewayData] = useState<AwsGatewayMetricsResponse | null>(null);
  const [memoryData, setMemoryData] = useState<AwsMemoryMetricsResponse | null>(null);
  const [tracesData, setTracesData] = useState<AwsAgentTracesResponse | null>(null);
  // `total_count` is the real window total (Logs Insights count); `invocations` is the
  // capped detail list. `total_count_is_window` is false when the backend could not
  // establish the window total — then total_count is only the fetched-sample size.
  const [llmData, setLlmData] = useState<{
    invocations: any[];
    total_count: number;
    returned_count?: number;
    total_count_is_window?: boolean;
    live: boolean;
  } | null>(null);

  // Trace filters
  const [traceFilter, setTraceFilter] = useState({
    operation: '',
    agent: '',
    errorOnly: false,
  });
  const [expandedTrace, setExpandedTrace] = useState<string | null>(null);

  const pollingKey = usePollingKey(60_000); // Auto-refresh every 60s
  const { updateSource } = useDataSources();

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError(null);

    Promise.all([
      governAgentCoreApi.agentMetrics(days),
      governAgentCoreApi.resourceUsage(days),
      governAgentCoreApi.gatewayMetrics(days),
      governAgentCoreApi.memoryMetrics(days),
      governAgentCoreApi.traces(days, 100),
      governAgentCoreApi.modelInvocations(days * 24, 50),
    ])
      .then(([runtime, resource, gateway, memory, traces, llm]) => {
        if (!mounted) return;
        setRuntimeData(runtime);
        setResourceData(resource);
        setGatewayData(gateway);
        setMemoryData(memory);
        setTracesData(traces);
        setLlmData(llm);

        // Honesty gate: the page-level badge must reflect real liveness, not claim
        // "Live" unconditionally. Surface true only when a section actually returned live data.
        onLiveChange?.(Boolean(
          runtime?.live || gateway?.live || memory?.live || traces?.live || resource?.live || llm?.live
        ));

        // Register data sources as connected
        updateSource('aws-agentcore-metrics', {
          name: 'AgentCore Runtime Metrics',
          provider: 'aws',
          status: runtime?.live ? 'live' : 'demo',
          lastFetch: Date.now(),
          description: 'CloudWatch AWS/Bedrock-AgentCore metrics',
        });
        updateSource('aws-agentcore-gateway', {
          name: 'AgentCore Gateway Metrics',
          provider: 'aws',
          status: gateway?.live ? 'live' : 'demo',
          lastFetch: Date.now(),
          description: 'API Gateway invocation metrics',
        });
        updateSource('aws-agentcore-memory', {
          name: 'AgentCore Memory Metrics',
          provider: 'aws',
          status: memory?.live ? 'live' : 'demo',
          lastFetch: Date.now(),
          description: 'Memory store operations',
        });
        updateSource('aws-agentcore-traces', {
          name: 'AgentCore Traces',
          provider: 'aws',
          status: traces?.live ? 'live' : 'demo',
          lastFetch: Date.now(),
          description: 'X-Ray / CloudWatch distributed traces',
        });
      })
      .catch(err => {
        if (!mounted) return;
        setError(err.message || 'Failed to load AgentCore observability data');
        updateSource('aws-agentcore-metrics', {
          name: 'AgentCore Runtime Metrics',
          provider: 'aws',
          status: 'error',
          error: err.message,
        });
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => { mounted = false; };
  }, [days, pollingKey, updateSource, onLiveChange]);

  // Runtime tab KPIs
  const runtimeKPIs = useMemo(() => {
    if (!runtimeData?.by_agent) return null;
    const totalInvocations = runtimeData.by_agent.reduce((sum, a) => sum + (a.invocations || 0), 0);
    const totalErrors = runtimeData.by_agent.reduce((sum, a) => sum + (a.errors || 0), 0);
    const totalSessions = runtimeData.by_agent.reduce((sum, a) => sum + (a.sessions || 0), 0);
    const avgLatency = totalInvocations > 0
      ? runtimeData.by_agent.reduce((sum, a) => sum + (a.avg_latency_ms || 0) * (a.invocations || 0), 0) / totalInvocations
      : 0;
    const errorRate = totalInvocations > 0 ? (totalErrors / totalInvocations) * 100 : 0;
    const throttleRate = 0; // Not in runtime metrics; placeholder

    return { totalInvocations, totalErrors, totalSessions, avgLatency, errorRate, throttleRate };
  }, [runtimeData]);

  // Gateway tab KPIs
  const gatewayKPIs = useMemo(() => {
    if (!gatewayData?.by_gateway) return null;
    // Sum from by_gateway since totals may be null
    const totalInvocations = gatewayData.total_invocations ??
      gatewayData.by_gateway.reduce((sum, g) => sum + (g.invocations || 0), 0);
    const totalThrottles = gatewayData.by_gateway.reduce((sum, g) => sum + (g.throttles || 0), 0);
    const totalErrors = gatewayData.total_errors ??
      gatewayData.by_gateway.reduce((sum, g) => sum + (g.system_errors || 0) + (g.user_errors || 0), 0);
    // Field names: latency_avg_ms, duration_avg_ms, target_execution_time_avg_ms
    const avgLatency = gatewayData.by_gateway.length > 0
      ? gatewayData.by_gateway.reduce((sum, g) => sum + (g.latency_avg_ms || 0), 0) / gatewayData.by_gateway.length
      : 0;
    const avgDuration = gatewayData.by_gateway.length > 0
      ? gatewayData.by_gateway.reduce((sum, g) => sum + (g.duration_avg_ms || 0), 0) / gatewayData.by_gateway.length
      : 0;
    const avgTargetExecution = gatewayData.by_gateway.length > 0
      ? gatewayData.by_gateway.reduce((sum, g) => sum + (g.target_execution_time_avg_ms || 0), 0) / gatewayData.by_gateway.length
      : 0;
    const errorRate = totalInvocations > 0 ? (totalErrors / totalInvocations) * 100 : 0;

    return { totalInvocations, totalThrottles, totalErrors, avgLatency, avgDuration, avgTargetExecution, errorRate };
  }, [gatewayData]);

  // Memory tab KPIs
  const memoryKPIs = useMemo(() => {
    if (!memoryData?.by_memory) return null;
    // Sum invocations from by_memory since total_invocations may be null
    const totalInvocations = memoryData.total_invocations ??
      memoryData.by_memory.reduce((sum, m) => sum + (m.invocations || 0), 0);
    const totalErrors = memoryData.by_memory.reduce((sum, m) => sum + (m.system_errors || 0) + (m.user_errors || 0), 0);
    const totalCreations = memoryData.by_memory.reduce((sum, m) => sum + (m.creation_count || 0), 0);
    // Field is latency_avg_ms, not avg_latency_ms
    const avgLatency = memoryData.by_memory.length > 0
      ? memoryData.by_memory.reduce((sum, m) => sum + (m.latency_avg_ms || 0), 0) / memoryData.by_memory.length
      : 0;

    return { totalInvocations, totalErrors, totalCreations, avgLatency };
  }, [memoryData]);

  // Resource usage chart data
  const resourceChartData = useMemo(() => {
    if (!resourceData?.by_resource) return [];
    return resourceData.by_resource.map(r => {
      // Backend ResourceUsageMetric exposes service/resource/name
      const displayName = r.name || r.resource || 'Unknown';
      return {
        name: displayName.length > 20 ? displayName.substring(0, 20) + '...' : displayName,
        cpu: parseFloat((r.cpu_vcpu_hours || 0).toFixed(2)),
        memory: parseFloat((r.memory_gb_hours || 0).toFixed(2)),
      };
    });
  }, [resourceData]);

  // Invocations by agent chart data
  const invocationChartData = useMemo(() => {
    if (!runtimeData?.by_agent) return [];
    return runtimeData.by_agent
      .filter(a => (a.invocations || 0) > 0)
      .sort((a, b) => (b.invocations || 0) - (a.invocations || 0))
      .slice(0, 10)
      .map(a => ({
        name: (a.runtime_name || 'Unknown').length > 15
          ? (a.runtime_name || 'Unknown').substring(0, 15) + '...'
          : (a.runtime_name || 'Unknown'),
        invocations: a.invocations || 0,
        errors: a.errors || 0,
        latency: Math.round(a.avg_latency_ms || 0),
      }));
  }, [runtimeData]);

  // Latency distribution chart data
  const latencyChartData = useMemo(() => {
    if (!runtimeData?.by_agent) return [];
    return runtimeData.by_agent
      .filter(a => (a.avg_latency_ms || 0) > 0)
      .sort((a, b) => (b.avg_latency_ms || 0) - (a.avg_latency_ms || 0))
      .slice(0, 10)
      .map(a => ({
        name: (a.runtime_name || 'Unknown').length > 15
          ? (a.runtime_name || 'Unknown').substring(0, 15) + '...'
          : (a.runtime_name || 'Unknown'),
        latency: Math.round(a.avg_latency_ms || 0),
      }));
  }, [runtimeData]);

  // Gateway operations chart
  const gatewayChartData = useMemo(() => {
    if (!gatewayData?.by_gateway) return [];
    return gatewayData.by_gateway
      .filter(g => (g.invocations || 0) > 0)
      .sort((a, b) => (b.invocations || 0) - (a.invocations || 0))
      .slice(0, 10)
      .map(g => ({
        name: (g.name || g.operation || 'Unknown').length > 15
          ? (g.name || g.operation || 'Unknown').substring(0, 15) + '...'
          : (g.name || g.operation || 'Unknown'),
        invocations: g.invocations || 0,
        errors: (g.system_errors || 0) + (g.user_errors || 0),
      }));
  }, [gatewayData]);

  // Filtered traces
  const filteredTraces = useMemo(() => {
    if (!tracesData) return [];
    return tracesData.traces.filter(t => {
      if (traceFilter.operation && !t.operation_name.toLowerCase().includes(traceFilter.operation.toLowerCase())) return false;
      if (traceFilter.agent && !t.agent_id.toLowerCase().includes(traceFilter.agent.toLowerCase())) return false;
      if (traceFilter.errorOnly && !t.error_type) return false;
      return true;
    });
  }, [tracesData, traceFilter]);

  // Unique operations and agents for filters
  const uniqueOperations = useMemo(() => {
    if (!tracesData) return [];
    return Array.from(new Set(tracesData.traces.map(t => t.operation_name))).sort();
  }, [tracesData]);

  const uniqueAgents = useMemo(() => {
    if (!tracesData) return [];
    return Array.from(new Set(tracesData.traces.map(t => t.agent_id))).sort();
  }, [tracesData]);

  if (loading && !runtimeData) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-400">Loading observability data...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
        <div className="flex items-start gap-2">
          <Icon name="exclamation-circle" className="w-5 h-5 text-rose-500 mt-0.5" />
          <div>
            <div className="font-medium text-rose-800">Failed to load observability data</div>
            <div className="text-sm text-rose-600 mt-1">{error}</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`
              flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px
              ${activeTab === tab.id
                ? 'border-indigo-500 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
              }
            `}
          >
            <Icon name={tab.icon as any} className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Runtime Tab */}
      {activeTab === 'runtime' && (
        <div className="space-y-6">
          {/* KPI Strip */}
          {runtimeKPIs && (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <StatCard
                label="Total Invocations"
                value={compact(runtimeKPIs.totalInvocations)}
                sub={`${days}d window`}
                variant="info"
                size="sm"
              />
              <StatCard
                label="Active Sessions"
                value={compact(runtimeKPIs.totalSessions)}
                variant="default"
                size="sm"
              />
              <StatCard
                label="Throttle Rate"
                value={pct(runtimeKPIs.throttleRate)}
                variant={runtimeKPIs.throttleRate > 5 ? 'warning' : 'success'}
                size="sm"
              />
              <StatCard
                label="Error Rate"
                value={pct(runtimeKPIs.errorRate)}
                variant={runtimeKPIs.errorRate > 2 ? 'danger' : 'success'}
                size="sm"
              />
              <StatCard
                label="Avg Latency"
                value={ms(runtimeKPIs.avgLatency)}
                variant="default"
                size="sm"
              />
            </div>
          )}

          {/* Invocations & Latency Charts */}
          {invocationChartData.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <div className="flex items-center gap-2 mb-4">
                <h3 className="text-sm font-semibold text-slate-900">Agent Performance Overview</h3>
                {runtimeData?.live && <LiveDataBadge source="CloudWatch AgentCore" />}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Invocations by Agent */}
                <div>
                  <div className="text-xs text-slate-500 mb-2 font-medium">Invocations by Agent</div>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={invocationChartData} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis type="number" tick={{ fontSize: 10 }} />
                      <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} width={100} />
                      <Tooltip formatter={((value: number) => [value.toLocaleString(), 'Invocations']) as Formatter<ValueType, NameType>} />
                      <Bar dataKey="invocations" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Latency by Agent */}
                <div>
                  <div className="text-xs text-slate-500 mb-2 font-medium">Avg Latency by Agent (ms)</div>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={latencyChartData} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis type="number" tick={{ fontSize: 10 }} />
                      <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} width={100} />
                      <Tooltip formatter={((value: number) => [`${value.toLocaleString()}ms`, 'Latency']) as Formatter<ValueType, NameType>} />
                      <Bar dataKey="latency" fill="#f59e0b" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}

          {/* Errors Breakdown */}
          {runtimeData?.by_agent && runtimeData.by_agent.some(a => (a.errors || 0) > 0) && (
            <div className="bg-white rounded-xl border border-rose-200 p-5">
              <div className="flex items-center gap-2 mb-3">
                <Icon name="exclamation-triangle" className="w-5 h-5 text-rose-500" />
                <h3 className="text-sm font-semibold text-slate-900">Agents with Errors</h3>
                <span className="text-xs text-slate-500 ml-2">Runtime initialization failures, timeouts, or invocation errors</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {runtimeData.by_agent
                  .filter(a => (a.errors || 0) > 0)
                  .sort((a, b) => (b.errors || 0) - (a.errors || 0))
                  .map((agent, idx) => {
                    const errorRate = ((agent.errors || 0) / (agent.invocations || 1) * 100);
                    const severity = errorRate > 50 ? 'high' : errorRate > 20 ? 'medium' : 'low';
                    return (
                      <div key={idx} className={`flex items-center justify-between rounded-lg px-4 py-3 ${
                        severity === 'high' ? 'bg-rose-100 border border-rose-300' :
                        severity === 'medium' ? 'bg-amber-50 border border-amber-200' :
                        'bg-slate-50 border border-slate-200'
                      }`}>
                        <div>
                          <div className="font-medium text-slate-800 text-sm">{agent.runtime_name || 'Unknown'}</div>
                          <div className="text-xs text-slate-500">
                            {agent.invocations || 0} total invocations
                          </div>
                          <div className={`text-xs font-medium ${
                            severity === 'high' ? 'text-rose-600' :
                            severity === 'medium' ? 'text-amber-600' :
                            'text-slate-600'
                          }`}>
                            {errorRate.toFixed(1)}% error rate
                          </div>
                        </div>
                        <div className={`font-bold text-xl ${
                          severity === 'high' ? 'text-rose-600' :
                          severity === 'medium' ? 'text-amber-600' :
                          'text-slate-600'
                        }`}>{agent.errors || 0}</div>
                      </div>
                    );
                  })}
              </div>
              <div className="mt-4 p-3 bg-slate-50 rounded-lg text-xs text-slate-600">
                <div className="font-medium mb-1">Common causes:</div>
                <ul className="list-disc list-inside space-y-0.5">
                  <li><strong>Cold start timeout</strong> — Runtime initialization exceeded 30s limit</li>
                  <li><strong>Memory/CPU limits</strong> — Agent exceeded allocated resources</li>
                  <li><strong>Dependency errors</strong> — External API calls failed (LLM, tools)</li>
                  <li><strong>Code exceptions</strong> — Unhandled errors in agent logic</li>
                </ul>
                <div className="mt-2">
                  <span className="font-medium">Investigate:</span> CloudWatch Logs at <code className="bg-white px-1 rounded border">/aws/bedrock-agentcore/runtimes/[agent-id]-DEFAULT</code>
                </div>
              </div>
            </div>
          )}

          {/* Resource Usage Charts */}
          {resourceChartData.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <div className="flex items-center gap-2 mb-4">
                <h3 className="text-sm font-semibold text-slate-900">Resource Usage</h3>
                {resourceData?.live && <LiveDataBadge source="CloudWatch" />}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* CPU Chart */}
                <div>
                  <div className="text-xs text-slate-500 mb-2 font-medium">CPU (vCPU-Hours)</div>
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={resourceChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-45} textAnchor="end" height={60} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip />
                      <Bar dataKey="cpu" fill="#6366f1" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Memory Chart */}
                <div>
                  <div className="text-xs text-slate-500 mb-2 font-medium">Memory (GB-Hours)</div>
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={resourceChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-45} textAnchor="end" height={60} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip />
                      <Bar dataKey="memory" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}

          {/* Per-Agent Metrics Table */}
          {runtimeData && runtimeData.by_agent.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="flex items-center gap-2 mb-3">
                <h3 className="text-sm font-semibold text-slate-900">Per-Agent Metrics</h3>
                {runtimeData.live && <LiveDataBadge />}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-slate-500 text-xs uppercase tracking-wide text-left border-b border-slate-200">
                      <th className="pb-2 font-medium">Agent</th>
                      <th className="pb-2 font-medium text-right">Invocations</th>
                      <th className="pb-2 font-medium text-right">Avg Latency</th>
                      <th className="pb-2 font-medium text-right">Errors</th>
                      <th className="pb-2 font-medium text-right">Sessions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {runtimeData.by_agent.map((agent, idx) => (
                      <tr key={idx} className="border-t border-slate-100">
                        <td className="py-2.5 font-medium text-slate-800">{agent.runtime_name || 'Unknown'}</td>
                        <td className="py-2.5 text-right tabular-nums">{(agent.invocations || 0).toLocaleString()}</td>
                        <td className="py-2.5 text-right tabular-nums">{ms(agent.avg_latency_ms || 0)}</td>
                        <td className={`py-2.5 text-right tabular-nums ${(agent.errors || 0) > 0 ? 'text-rose-600 font-semibold' : 'text-slate-500'}`}>
                          {agent.errors || 0}
                        </td>
                        <td className="py-2.5 text-right tabular-nums">{agent.sessions || 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {(!runtimeData || runtimeData.by_agent.length === 0) && (
            <div className="bg-slate-50 rounded-xl border border-slate-200 p-6 text-center">
              <Icon name="information-circle" className="w-8 h-8 text-slate-400 mx-auto mb-2" />
              <div className="text-sm text-slate-600">No runtime metrics available for the selected time window.</div>
              <div className="text-xs text-slate-500 mt-1">Deploy AgentCore runtimes and invoke them to see metrics here.</div>
            </div>
          )}
        </div>
      )}

      {/* Gateway Tab */}
      {activeTab === 'gateway' && (
        <div className="space-y-6">
          {/* KPI Strip */}
          {gatewayKPIs && (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <StatCard
                label="Total Invocations"
                value={compact(gatewayKPIs.totalInvocations)}
                sub={`${days}d window`}
                variant="info"
                size="sm"
              />
              <StatCard
                label="Throttles"
                value={compact(gatewayKPIs.totalThrottles)}
                variant={gatewayKPIs.totalThrottles > 10 ? 'warning' : 'success'}
                size="sm"
              />
              <StatCard
                label="Error Rate"
                value={pct(gatewayKPIs.errorRate)}
                variant={gatewayKPIs.errorRate > 2 ? 'danger' : 'success'}
                size="sm"
              />
              <StatCard
                label="Avg Latency"
                value={ms(gatewayKPIs.avgLatency)}
                variant="default"
                size="sm"
              />
              <StatCard
                label="Avg Target Exec"
                value={ms(gatewayKPIs.avgTargetExecution)}
                variant="default"
                size="sm"
              />
            </div>
          )}

          {/* Gateway Operations Chart */}
          {gatewayChartData.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <div className="flex items-center gap-2 mb-4">
                <h3 className="text-sm font-semibold text-slate-900">Top Operations by Invocations</h3>
                {gatewayData?.live && <LiveDataBadge source="CloudWatch" />}
              </div>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={gatewayChartData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis type="number" tick={{ fontSize: 10 }} />
                  <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} width={120} />
                  <Tooltip formatter={((value: number) => [value.toLocaleString(), 'Invocations']) as Formatter<ValueType, NameType>} />
                  <Legend />
                  <Bar dataKey="invocations" fill="#10b981" name="Invocations" radius={[0, 4, 4, 0]} />
                  <Bar dataKey="errors" fill="#ef4444" name="Errors" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Per-Gateway Table */}
          {gatewayData && gatewayData.by_gateway.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="flex items-center gap-2 mb-3">
                <h3 className="text-sm font-semibold text-slate-900">Per-Gateway Metrics</h3>
                {gatewayData.live && <LiveDataBadge source="API Gateway CloudWatch" />}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-slate-500 text-xs uppercase tracking-wide text-left border-b border-slate-200">
                      <th className="pb-2 font-medium">Gateway</th>
                      <th className="pb-2 font-medium text-right">Invocations</th>
                      <th className="pb-2 font-medium text-right">Throttles</th>
                      <th className="pb-2 font-medium text-right">Errors</th>
                      <th className="pb-2 font-medium text-right">Latency</th>
                      <th className="pb-2 font-medium text-right">Duration</th>
                      <th className="pb-2 font-medium text-right">Target Exec</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gatewayData.by_gateway.map((gw, idx) => {
                      const totalErrors = (gw.system_errors || 0) + (gw.user_errors || 0);
                      return (
                        <tr key={idx} className="border-t border-slate-100">
                          <td className="py-2.5 font-medium text-slate-800">
                            <div>{gw.name || gw.operation || 'Unknown'}</div>
                            {/* GatewayMetric carries operation/protocol/method; show operation as the secondary identifier */}
                            <div className="text-xs text-slate-400">{gw.operation || ''}</div>
                          </td>
                          <td className="py-2.5 text-right tabular-nums">{(gw.invocations || 0).toLocaleString()}</td>
                          <td className={`py-2.5 text-right tabular-nums ${(gw.throttles || 0) > 0 ? 'text-amber-600 font-semibold' : 'text-slate-500'}`}>
                            {gw.throttles || 0}
                          </td>
                          <td className={`py-2.5 text-right tabular-nums ${totalErrors > 0 ? 'text-rose-600 font-semibold' : 'text-slate-500'}`}>
                            {totalErrors}
                          </td>
                          <td className="py-2.5 text-right tabular-nums">{ms(gw.latency_avg_ms || 0)}</td>
                          <td className="py-2.5 text-right tabular-nums">{ms(gw.duration_avg_ms || 0)}</td>
                          <td className="py-2.5 text-right tabular-nums">{ms(gw.target_execution_time_avg_ms || 0)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {(!gatewayData || gatewayData.by_gateway.length === 0) && (
            <div className="bg-slate-50 rounded-xl border border-slate-200 p-6 text-center">
              <Icon name="information-circle" className="w-8 h-8 text-slate-400 mx-auto mb-2" />
              <div className="text-sm text-slate-600">No gateway metrics available for the selected time window.</div>
              <div className="text-xs text-slate-500 mt-1">Provision API Gateway endpoints for your agents to see metrics here.</div>
            </div>
          )}
        </div>
      )}

      {/* Memory Tab */}
      {activeTab === 'memory' && (
        <div className="space-y-6">
          {/* KPI Strip */}
          {memoryKPIs && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard
                label="Total Invocations"
                value={compact(memoryKPIs.totalInvocations)}
                sub={`${days}d window`}
                variant="info"
                size="sm"
              />
              <StatCard
                label="Avg Latency"
                value={ms(memoryKPIs.avgLatency)}
                variant="default"
                size="sm"
              />
              <StatCard
                label="Errors"
                value={compact(memoryKPIs.totalErrors)}
                variant={memoryKPIs.totalErrors > 0 ? 'danger' : 'success'}
                size="sm"
              />
              <StatCard
                label="Creation Count"
                value={compact(memoryKPIs.totalCreations)}
                variant="default"
                size="sm"
              />
            </div>
          )}

          {/* Per-Memory Table */}
          {memoryData && memoryData.by_memory.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="flex items-center gap-2 mb-3">
                <h3 className="text-sm font-semibold text-slate-900">Per-Memory Store Metrics</h3>
                {memoryData.live && <LiveDataBadge source="AgentCore CloudWatch" />}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-slate-500 text-xs uppercase tracking-wide text-left border-b border-slate-200">
                      <th className="pb-2 font-medium">Memory ID</th>
                      <th className="pb-2 font-medium text-right">Invocations</th>
                      <th className="pb-2 font-medium text-right">Avg Latency</th>
                      <th className="pb-2 font-medium text-right">System Errors</th>
                      <th className="pb-2 font-medium text-right">User Errors</th>
                      <th className="pb-2 font-medium text-right">Creation Count</th>
                    </tr>
                  </thead>
                  <tbody>
                    {memoryData.by_memory.map((mem, idx) => (
                      <tr key={idx} className="border-t border-slate-100">
                        <td className="py-2.5 font-mono text-xs text-slate-700">{mem.name || 'Unknown'}</td>
                        <td className="py-2.5 text-right tabular-nums">{mem.invocations.toLocaleString()}</td>
                        <td className="py-2.5 text-right tabular-nums">{ms(mem.latency_avg_ms || 0)}</td>
                        <td className={`py-2.5 text-right tabular-nums ${mem.system_errors > 0 ? 'text-rose-600 font-semibold' : 'text-slate-500'}`}>
                          {mem.system_errors}
                        </td>
                        <td className={`py-2.5 text-right tabular-nums ${mem.user_errors > 0 ? 'text-amber-600 font-semibold' : 'text-slate-500'}`}>
                          {mem.user_errors}
                        </td>
                        <td className="py-2.5 text-right tabular-nums">{mem.creation_count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {(!memoryData || memoryData.by_memory.length === 0) && (
            <div className="bg-slate-50 rounded-xl border border-slate-200 p-6 text-center">
              <Icon name="information-circle" className="w-8 h-8 text-slate-400 mx-auto mb-2" />
              <div className="text-sm text-slate-600">No memory metrics available for the selected time window.</div>
              <div className="text-xs text-slate-500 mt-1">Configure memory stores for your agents to see metrics here.</div>
            </div>
          )}
        </div>
      )}

      {/* Traces Tab */}
      {activeTab === 'traces' && (
        <div className="space-y-6">
          {/* Filters */}
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex-1 min-w-[200px]">
                <label className="block text-xs font-medium text-slate-600 mb-1">Operation</label>
                <select
                  value={traceFilter.operation}
                  onChange={e => setTraceFilter(prev => ({ ...prev, operation: e.target.value }))}
                  className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">All operations</option>
                  {uniqueOperations.map(op => (
                    <option key={op} value={op}>{op}</option>
                  ))}
                </select>
              </div>

              <div className="flex-1 min-w-[200px]">
                <label className="block text-xs font-medium text-slate-600 mb-1">Agent</label>
                <select
                  value={traceFilter.agent}
                  onChange={e => setTraceFilter(prev => ({ ...prev, agent: e.target.value }))}
                  className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">All agents</option>
                  {uniqueAgents.map(agent => (
                    <option key={agent} value={agent}>{agent}</option>
                  ))}
                </select>
              </div>

              <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={traceFilter.errorOnly}
                  onChange={e => setTraceFilter(prev => ({ ...prev, errorOnly: e.target.checked }))}
                  className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-2 focus:ring-indigo-500"
                />
                Errors only
              </label>

              <button
                onClick={() => setTraceFilter({ operation: '', agent: '', errorOnly: false })}
                className="px-3 py-1.5 text-sm text-slate-600 hover:text-slate-800 border border-slate-200 rounded-lg hover:bg-slate-50"
              >
                Clear filters
              </button>
            </div>

            <div className="mt-2 text-xs text-slate-500">
              Showing {filteredTraces.length} of {tracesData?.total_count ?? 0} traces
            </div>
          </div>

          {/* Trace List */}
          {filteredTraces.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="flex items-center gap-2 mb-3">
                <h3 className="text-sm font-semibold text-slate-900">Distributed Traces</h3>
                {tracesData?.live && <LiveDataBadge source="X-Ray" />}
              </div>
              <div className="space-y-2">
                {filteredTraces.map(trace => (
                  <div
                    key={trace.trace_id}
                    className="border border-slate-200 rounded-lg overflow-hidden"
                  >
                    {/* Trace header (clickable to expand) */}
                    <button
                      onClick={() => setExpandedTrace(expandedTrace === trace.trace_id ? null : trace.trace_id)}
                      className="w-full px-4 py-2.5 flex items-center justify-between hover:bg-slate-50 text-left"
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${trace.error_type ? 'bg-rose-500' : 'bg-emerald-500'}`} />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-slate-800 truncate">{trace.operation_name}</div>
                          <div className="flex items-center gap-3 text-xs text-slate-500">
                            <span>{new Date(trace.timestamp).toLocaleString()}</span>
                            <span className="truncate">{trace.agent_id}</span>
                            <span className="tabular-nums">{ms(trace.latency_ms)}</span>
                          </div>
                        </div>
                      </div>
                      <Icon
                        name={expandedTrace === trace.trace_id ? 'chevron-up' : 'chevron-down'}
                        className="w-4 h-4 text-slate-400 flex-shrink-0"
                      />
                    </button>

                    {/* Trace details (expanded) */}
                    {expandedTrace === trace.trace_id && (
                      <div className="px-4 pb-3 pt-1 bg-slate-50 border-t border-slate-200 text-xs space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <span className="text-slate-500">Trace ID:</span>
                            <span className="ml-2 font-mono text-slate-700">{trace.trace_id}</span>
                          </div>
                          <div>
                            <span className="text-slate-500">Span ID:</span>
                            <span className="ml-2 font-mono text-slate-700">{trace.span_id}</span>
                          </div>
                          <div>
                            <span className="text-slate-500">Session ID:</span>
                            <span className="ml-2 font-mono text-slate-700">{trace.session_id}</span>
                          </div>
                          <div>
                            <span className="text-slate-500">Request ID:</span>
                            <span className="ml-2 font-mono text-slate-700">{trace.request_id}</span>
                          </div>
                          <div>
                            <span className="text-slate-500">Endpoint:</span>
                            <span className="ml-2 text-slate-700">{trace.endpoint_name}</span>
                          </div>
                          <div>
                            <span className="text-slate-500">Latency:</span>
                            <span className="ml-2 text-slate-700 tabular-nums">{ms(trace.latency_ms)}</span>
                          </div>
                        </div>
                        {trace.error_type && (
                          <div className="pt-2 border-t border-slate-200">
                            <span className="text-rose-600 font-medium">Error:</span>
                            <span className="ml-2 text-rose-700">{trace.error_type}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {filteredTraces.length === 0 && (
            <div className="bg-slate-50 rounded-xl border border-slate-200 p-6 text-center">
              <Icon name="information-circle" className="w-8 h-8 text-slate-400 mx-auto mb-2" />
              <div className="text-sm text-slate-600">
                {traceFilter.operation || traceFilter.agent || traceFilter.errorOnly
                  ? 'No traces match the selected filters.'
                  : 'No traces available for the selected time window.'}
              </div>
              <div className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                Traces are automatically collected for AgentCore Runtimes with observability enabled.
                Standard Bedrock Agents use X-Ray directly. CloudWatch Transaction Search is already
                enabled in this account.
              </div>
            </div>
          )}
        </div>
      )}

      {/* LLM Calls Tab */}
      {activeTab === 'llm' && (
        <div className="space-y-6">
          {/* LLM KPIs */}
          {llmData && (
            <div className="space-y-2">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {/* Honest label: only call it a window total when the backend actually
                    counted the window; otherwise it is just what was fetched. */}
                <StatCard
                  label="Model Invocations"
                  value={compact(llmData.total_count)}
                  sub={llmData.total_count_is_window === false
                    ? `fetched sample · last ${days * 24}h`
                    : `Last ${days * 24}h`}
                  variant="info"
                  size="sm"
                />
                <StatCard
                  label="Guardrail Blocks"
                  value={compact(llmData.invocations.filter(i => i.guardrail_intervened).length)}
                  sub={`of ${llmData.invocations.length} sampled`}
                  variant={llmData.invocations.some(i => i.guardrail_intervened) ? 'warning' : 'success'}
                  size="sm"
                />
                <StatCard
                  label="Avg Latency"
                  value={ms(llmData.invocations.length > 0
                    ? llmData.invocations.reduce((sum, i) => sum + (i.latency_ms || 0), 0) / llmData.invocations.length
                    : 0)}
                  sub={`of ${llmData.invocations.length} sampled`}
                  variant="default"
                  size="sm"
                />
                <StatCard
                  label="Models Used"
                  value={new Set(llmData.invocations.map(i => i.model_id)).size}
                  sub={`of ${llmData.invocations.length} sampled`}
                  variant="default"
                  size="sm"
                />
              </div>
              {/* The detail list is capped, so only Model Invocations is a window total. */}
              <p className="text-[10px] text-slate-400">
                {llmData.total_count_is_window === false
                  ? `Window total unavailable — every figure above is computed from the ${llmData.invocations.length} invocation(s) in the fetched detail list.`
                  : `Model Invocations is the window total; the other three are computed from the ${llmData.invocations.length} invocation(s) in the fetched detail list.`}
              </p>
            </div>
          )}

          {/* Model Invocations List */}
          {llmData && llmData.invocations.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="flex items-center gap-2 mb-4">
                <h3 className="text-sm font-semibold text-slate-900">Model Invocation Logs</h3>
                {llmData.live && <LiveDataBadge source="Bedrock Invocation Logging" />}
              </div>
              <div className="space-y-3">
                {llmData.invocations.map((inv, idx) => (
                  <div
                    key={idx}
                    className={`p-4 rounded-lg border ${
                      inv.guardrail_intervened
                        ? 'bg-rose-50 border-rose-200'
                        : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono bg-slate-200 px-2 py-0.5 rounded">
                          {inv.model_id?.split(':')[0] || 'unknown'}
                        </span>
                        {inv.guardrail_intervened && (
                          <span className="text-xs font-medium bg-rose-500 text-white px-2 py-0.5 rounded">
                            BLOCKED
                          </span>
                        )}
                        <span className="text-xs text-slate-500">{inv.operation}</span>
                      </div>
                      <div className="text-xs text-slate-500 tabular-nums">
                        {ms(inv.latency_ms)} · {inv.timestamp?.slice(0, 19)}
                      </div>
                    </div>

                    {/* Prompt */}
                    <div className="mb-2">
                      <div className="text-xs text-slate-500 mb-1">Prompt:</div>
                      <div className="text-sm text-slate-700 bg-white rounded p-2 border border-slate-200 font-mono text-xs">
                        {inv.prompt_preview || '(empty)'}
                      </div>
                    </div>

                    {/* Response */}
                    <div>
                      <div className="text-xs text-slate-500 mb-1">Response:</div>
                      <div className={`text-sm rounded p-2 border font-mono text-xs ${
                        inv.guardrail_intervened
                          ? 'bg-rose-100 border-rose-300 text-rose-800'
                          : 'bg-white border-slate-200 text-slate-700'
                      }`}>
                        {inv.response_preview || '(empty)'}
                      </div>
                    </div>

                    {/* Metadata */}
                    <div className="mt-2 flex gap-4 text-xs text-slate-500">
                      <span>Tokens: {inv.input_tokens || 0} in / {inv.output_tokens || 0} out</span>
                      <span>Stop: {inv.stop_reason || 'N/A'}</span>
                      {inv.caller_arn && (
                        <span className="truncate max-w-xs" title={inv.caller_arn}>
                          Caller: {inv.caller_arn.split('/').pop()}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {(!llmData || llmData.invocations.length === 0) && (
            <div className="bg-slate-50 rounded-xl border border-slate-200 p-6 text-center">
              <Icon name="sparkles" className="w-8 h-8 text-slate-400 mx-auto mb-2" />
              <div className="text-sm text-slate-600">No model invocations found.</div>
              <div className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                Enable Bedrock model invocation logging in the AWS Console under Bedrock → Settings → Model invocation logging
                to see detailed LLM call data including prompts, responses, and token usage.
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * AgentCoreObservability — full page version wrapped in GovernPageLayout
 */
export default function AgentCoreObservability() {
  // Honesty gate: the page badge reflects aggregate section liveness reported by the
  // content component. Until any section confirms live data, LiveDataBadge renders Demo.
  const [live, setLive] = useState(false);
  return (
    <GovernPageLayout
      title="AgentCore Observability"
      description="Comprehensive runtime monitoring for AWS AgentCore deployments: agents, gateways, memory stores, and distributed traces."
      badge={<LiveDataBadge source="CloudWatch + X-Ray" live={live} />}
    >
      <AgentCoreObservabilityContent onLiveChange={setLive} />
    </GovernPageLayout>
  );
}
