/**
 * useFleetHealth - Live data hooks for the FleetHealth component
 *
 * Combines data from:
 * - governFleetApi: Fleet summary, segments, exceptions
 * - governAgentCoreApi: Agent runtime metrics from CloudWatch
 * - useAgentRegistry: Agent inventory with deployment details
 *
 * Provides:
 * - useFleetStatus(): KPI summary for the fleet
 * - useFleetAgents(filters): Agent list with metrics
 * - useAgentDetail(agentId): Detailed metrics for drawer view
 */

import { useState, useEffect, useMemo } from 'react';
import {
  governFleetApi,
  governAgentCoreApi,
  type FleetSummaryResponse,
  type AwsAgentRuntimeMetricsResponse,
  type AwsAgentRuntimeMetric,
  type AwsDiscoveredAgentsResponse,
} from '../../api/client';

// ============================================================================
// Types
// ============================================================================

export type AgentStatus = 'healthy' | 'degraded' | 'down';
export type CloudProvider = 'AWS' | 'Azure' | 'GCP';

export interface HealthMetric {
  timestamp: string;
  value: number;
}

export interface Incident {
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  timestamp: string;
  resolved: boolean;
}

export interface SLA {
  name: string;
  target: number;
  current: number;
  status: 'met' | 'at-risk' | 'breached';
}

export interface FleetAgent {
  id: string;
  name: string;
  provider: CloudProvider;
  status: AgentStatus;
  latencyP99: number;
  errorRate: number;
  invocations24h: number;
  cost24h: number;
  healthHistory: HealthMetric[];
  lastIncident: string | null;
  owner: string;
  incidents: Incident[];
  slas: SLA[];
  runbookUrl: string;
  framework: string;
  version: string;
  region: string;
  isLive: boolean;
}

export interface FleetFilters {
  status?: AgentStatus | 'all';
  provider?: CloudProvider | 'all';
  search?: string;
}

export interface FleetStatusKPIs {
  total: number;
  healthy: number;
  degraded: number;
  down: number;
  healthyPct: number;
  avgLatency: number;
  avgErrorRate: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

function generateHealthHistory(): HealthMetric[] {
  const now = Date.now();
  return Array.from({ length: 12 }, (_, i) => ({
    timestamp: new Date(now - (11 - i) * 5 * 60 * 1000).toISOString(),
    value: 80 + Math.random() * 20 + (Math.random() > 0.85 ? -30 : 0),
  }));
}

function generateIncidents(count: number): Incident[] {
  const severities: Incident['severity'][] = ['critical', 'high', 'medium', 'low'];
  const titles = [
    'High latency detected',
    'Error rate spike',
    'Memory utilization exceeded threshold',
    'Connection timeout to downstream service',
    'Rate limit approached',
    'Model inference timeout',
    'Tool execution failure',
    'Authentication failure spike',
  ];
  return Array.from({ length: count }, (_, i) => ({
    id: `inc-${i}`,
    severity: severities[Math.floor(Math.random() * severities.length)],
    title: titles[Math.floor(Math.random() * titles.length)],
    timestamp: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString(),
    resolved: Math.random() > 0.3,
  }));
}

function generateSLAs(): SLA[] {
  return [
    { name: 'Availability', target: 99.9, current: 99.2 + Math.random() * 0.79, status: Math.random() > 0.2 ? 'met' : 'at-risk' },
    { name: 'Latency p99 < 500ms', target: 500, current: 200 + Math.random() * 400, status: Math.random() > 0.3 ? 'met' : 'at-risk' },
    { name: 'Error Rate < 1%', target: 1, current: Math.random() * 1.5, status: Math.random() > 0.25 ? 'met' : 'breached' },
  ];
}

/**
 * Derive agent health status from latency and error rate thresholds
 */
function deriveStatus(latencyMs: number, errorRate: number): AgentStatus {
  // Down: error rate > 50% or latency indicates no responses
  if (errorRate >= 50 || latencyMs === 0) return 'down';
  // Degraded: error rate > 5% or latency > 2000ms
  if (errorRate > 5 || latencyMs > 2000) return 'degraded';
  // Healthy: error rate <= 5% and latency <= 2000ms
  return 'healthy';
}

/**
 * Map a live CloudWatch agent metric to FleetAgent format
 */
function liveMetricToFleetAgent(
  metric: AwsAgentRuntimeMetric,
  index: number,
): FleetAgent {
  const errorRate = metric.invocations > 0
    ? (metric.errors / metric.invocations) * 100
    : 0;
  const status = deriveStatus(metric.avg_latency_ms, errorRate);

  return {
    id: `live-cw-${index}`,
    name: metric.runtime_name,
    provider: 'AWS',
    status,
    // Only average latency is exposed by the runtime metric; surface the real
    // value rather than a fabricated p99 (previously avg * 1.5).
    latencyP99: Math.round(metric.avg_latency_ms),
    errorRate: parseFloat(errorRate.toFixed(2)),
    invocations24h: metric.invocations,
    cost24h: 0, // real 24h cost is not available from CloudWatch runtime metrics
    healthHistory: [], // no fabricated sparkline for live agents
    lastIncident: null, // real incident history is not wired for live agents
    owner: 'AWS Account',
    incidents: [], // real incident data is not wired for live agents
    slas: [], // real SLA data is not wired for live agents
    // Empty, not a plausible-looking URL. 'https://wiki.example.com/runbooks/aws-agent'
    // was rendered as a working runbook link for every live agent.
    runbookUrl: '',
    // Empty rather than invented. `AwsAgentRuntimeMetric` carries only runtime_name,
    // invocations, avg_latency_ms, errors and sessions - there is no framework, version
    // or region on the payload to read. These previously read 'Bedrock AgentCore',
    // 'v1.0.0' and 'us-east-1' for EVERY live agent and were printed in the drawer
    // subtitle as "Bedrock AgentCore v1.0.0 - us-east-1", which looks like discovered
    // metadata. 'v1.0.0' in particular is a version nobody deployed.
    framework: '',
    version: '',
    region: '',
    isLive: true,
  };
}

// ============================================================================
// Mock Data (fallback when no live data)
// ============================================================================

const MOCK_AGENTS: FleetAgent[] = [
  // AWS Agents
  { id: 'aws-1', name: 'Customer Support Bot', provider: 'AWS', status: 'healthy', latencyP99: 245, errorRate: 0.3, invocations24h: 45200, cost24h: 128.50, healthHistory: generateHealthHistory(), lastIncident: null, owner: 'support-team', incidents: generateIncidents(2), slas: generateSLAs(), runbookUrl: 'https://wiki.example.com/runbooks/support-bot', framework: 'Bedrock Agents', version: '2.3.1', region: 'us-east-1', isLive: false },
  { id: 'aws-2', name: 'Document Processor', provider: 'AWS', status: 'healthy', latencyP99: 890, errorRate: 0.5, invocations24h: 12800, cost24h: 89.20, healthHistory: generateHealthHistory(), lastIncident: '2024-01-08', owner: 'data-team', incidents: generateIncidents(4), slas: generateSLAs(), runbookUrl: 'https://wiki.example.com/runbooks/doc-processor', framework: 'LangGraph', version: '1.8.0', region: 'us-west-2', isLive: false },
  { id: 'aws-3', name: 'Fraud Detection Agent', provider: 'AWS', status: 'degraded', latencyP99: 1250, errorRate: 2.1, invocations24h: 89400, cost24h: 234.80, healthHistory: generateHealthHistory(), lastIncident: '2024-01-10', owner: 'risk-team', incidents: generateIncidents(6), slas: generateSLAs(), runbookUrl: 'https://wiki.example.com/runbooks/fraud-agent', framework: 'Bedrock Agents', version: '3.1.0', region: 'us-east-1', isLive: false },
  { id: 'aws-4', name: 'Inventory Optimizer', provider: 'AWS', status: 'healthy', latencyP99: 340, errorRate: 0.2, invocations24h: 8900, cost24h: 45.60, healthHistory: generateHealthHistory(), lastIncident: null, owner: 'supply-chain', incidents: generateIncidents(1), slas: generateSLAs(), runbookUrl: 'https://wiki.example.com/runbooks/inventory-opt', framework: 'AutoGen', version: '0.4.2', region: 'eu-west-1', isLive: false },
  { id: 'aws-5', name: 'Compliance Checker', provider: 'AWS', status: 'down', latencyP99: 0, errorRate: 100, invocations24h: 0, cost24h: 0, healthHistory: generateHealthHistory().map(h => ({ ...h, value: 0 })), lastIncident: '2024-01-11', owner: 'compliance-team', incidents: generateIncidents(8), slas: generateSLAs(), runbookUrl: 'https://wiki.example.com/runbooks/compliance', framework: 'Bedrock Agents', version: '2.0.5', region: 'us-east-1', isLive: false },
  // Azure Agents
  { id: 'azure-1', name: 'Knowledge Assistant', provider: 'Azure', status: 'healthy', latencyP99: 310, errorRate: 0.4, invocations24h: 23400, cost24h: 67.80, healthHistory: generateHealthHistory(), lastIncident: null, owner: 'knowledge-team', incidents: generateIncidents(2), slas: generateSLAs(), runbookUrl: 'https://wiki.example.com/runbooks/knowledge-assist', framework: 'Semantic Kernel', version: '1.2.0', region: 'eastus', isLive: false },
  { id: 'azure-2', name: 'HR Onboarding Bot', provider: 'Azure', status: 'healthy', latencyP99: 420, errorRate: 0.6, invocations24h: 3200, cost24h: 23.40, healthHistory: generateHealthHistory(), lastIncident: '2024-01-05', owner: 'hr-team', incidents: generateIncidents(3), slas: generateSLAs(), runbookUrl: 'https://wiki.example.com/runbooks/hr-bot', framework: 'Azure AI Agent Service', version: '1.0.3', region: 'westus2', isLive: false },
  { id: 'azure-3', name: 'Sales Intelligence', provider: 'Azure', status: 'degraded', latencyP99: 980, errorRate: 1.8, invocations24h: 15600, cost24h: 98.50, healthHistory: generateHealthHistory(), lastIncident: '2024-01-11', owner: 'sales-ops', incidents: generateIncidents(5), slas: generateSLAs(), runbookUrl: 'https://wiki.example.com/runbooks/sales-intel', framework: 'LangChain', version: '0.1.5', region: 'northeurope', isLive: false },
  { id: 'azure-4', name: 'IT Helpdesk Agent', provider: 'Azure', status: 'healthy', latencyP99: 280, errorRate: 0.3, invocations24h: 67800, cost24h: 156.20, healthHistory: generateHealthHistory(), lastIncident: null, owner: 'it-support', incidents: generateIncidents(2), slas: generateSLAs(), runbookUrl: 'https://wiki.example.com/runbooks/it-helpdesk', framework: 'Semantic Kernel', version: '1.3.1', region: 'westeurope', isLive: false },
  { id: 'azure-5', name: 'Legal Review Assistant', provider: 'Azure', status: 'healthy', latencyP99: 1100, errorRate: 0.1, invocations24h: 890, cost24h: 34.70, healthHistory: generateHealthHistory(), lastIncident: null, owner: 'legal-team', incidents: generateIncidents(1), slas: generateSLAs(), runbookUrl: 'https://wiki.example.com/runbooks/legal-review', framework: 'AutoGen', version: '0.4.0', region: 'eastus2', isLive: false },
  // GCP Agents
  { id: 'gcp-1', name: 'Data Analytics Agent', provider: 'GCP', status: 'healthy', latencyP99: 560, errorRate: 0.7, invocations24h: 34500, cost24h: 112.30, healthHistory: generateHealthHistory(), lastIncident: '2024-01-07', owner: 'analytics-team', incidents: generateIncidents(3), slas: generateSLAs(), runbookUrl: 'https://wiki.example.com/runbooks/data-analytics', framework: 'Vertex AI Agents', version: '2.1.0', region: 'us-central1', isLive: false },
  { id: 'gcp-2', name: 'Marketing Copilot', provider: 'GCP', status: 'healthy', latencyP99: 380, errorRate: 0.5, invocations24h: 8900, cost24h: 45.80, healthHistory: generateHealthHistory(), lastIncident: null, owner: 'marketing-team', incidents: generateIncidents(2), slas: generateSLAs(), runbookUrl: 'https://wiki.example.com/runbooks/marketing-copilot', framework: 'LangChain', version: '0.1.8', region: 'europe-west1', isLive: false },
  { id: 'gcp-3', name: 'Code Review Bot', provider: 'GCP', status: 'degraded', latencyP99: 1450, errorRate: 3.2, invocations24h: 12300, cost24h: 78.90, healthHistory: generateHealthHistory(), lastIncident: '2024-01-10', owner: 'platform-team', incidents: generateIncidents(7), slas: generateSLAs(), runbookUrl: 'https://wiki.example.com/runbooks/code-review', framework: 'CrewAI', version: '0.28.0', region: 'us-east4', isLive: false },
  { id: 'gcp-4', name: 'Financial Analyst', provider: 'GCP', status: 'healthy', latencyP99: 720, errorRate: 0.2, invocations24h: 5600, cost24h: 89.40, healthHistory: generateHealthHistory(), lastIncident: null, owner: 'finance-team', incidents: generateIncidents(1), slas: generateSLAs(), runbookUrl: 'https://wiki.example.com/runbooks/financial-analyst', framework: 'Vertex AI Agents', version: '2.0.4', region: 'us-central1', isLive: false },
  { id: 'gcp-5', name: 'Research Assistant', provider: 'GCP', status: 'down', latencyP99: 0, errorRate: 100, invocations24h: 0, cost24h: 0, healthHistory: generateHealthHistory().map(h => ({ ...h, value: 0 })), lastIncident: '2024-01-11', owner: 'research-team', incidents: generateIncidents(9), slas: generateSLAs(), runbookUrl: 'https://wiki.example.com/runbooks/research-assist', framework: 'CrewAI', version: '0.27.5', region: 'asia-east1', isLive: false },
];

// ============================================================================
// useFleetStatus - KPI summary for fleet
// ============================================================================

export interface UseFleetStatusResult {
  loading: boolean;
  error: string | null;
  kpis: FleetStatusKPIs;
  source: 'live' | 'demo' | 'mixed';
  refresh: () => void;
}

export function useFleetStatus(): UseFleetStatusResult {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [summaryData, setSummaryData] = useState<FleetSummaryResponse | null>(null);
  const [metricsData, setMetricsData] = useState<AwsAgentRuntimeMetricsResponse | null>(null);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      setError(null);

      try {
        const [summaryRes, metricsRes] = await Promise.allSettled([
          governFleetApi.summary(),
          governAgentCoreApi.agentMetrics(1), // 1 day for 24h metrics
        ]);

        if (summaryRes.status === 'fulfilled') {
          setSummaryData(summaryRes.value);
        }
        if (metricsRes.status === 'fulfilled') {
          setMetricsData(metricsRes.value);
        }

        if (summaryRes.status === 'rejected' && metricsRes.status === 'rejected') {
          setError('Unable to load fleet data - showing demo data');
        }
      } catch (err) {
        console.error('Failed to load fleet status:', err);
        setError('Unable to load fleet data - showing demo data');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [refreshKey]);

  const result = useMemo(() => {
    const hasLiveSummary = summaryData?.live;
    const hasLiveMetrics = metricsData?.live;

    let kpis: FleetStatusKPIs;

    if (hasLiveSummary && summaryData) {
      // Use live fleet summary data
      const summary = summaryData.summary;
      const total = summary.total;
      const healthy = summary.governance.compliant;
      const degraded = summary.governance.review_needed;
      const down = summary.governance.blocked;

      // Calculate avg latency and error rate from metrics if available
      let avgLatency = 0;
      let avgErrorRate = '0.00';

      if (hasLiveMetrics && metricsData?.by_agent.length) {
        const activeAgents = metricsData.by_agent.filter(a => a.invocations > 0);
        if (activeAgents.length > 0) {
          avgLatency = Math.round(
            activeAgents.reduce((sum, a) => sum + a.avg_latency_ms, 0) / activeAgents.length
          );
          const totalErrors = activeAgents.reduce((sum, a) => sum + a.errors, 0);
          const totalInvocations = activeAgents.reduce((sum, a) => sum + a.invocations, 0);
          avgErrorRate = totalInvocations > 0
            ? ((totalErrors / totalInvocations) * 100).toFixed(2)
            : '0.00';
        }
      }

      kpis = {
        total,
        healthy,
        degraded,
        down,
        healthyPct: total > 0 ? Math.round((healthy / total) * 100) : 0,
        avgLatency,
        avgErrorRate,
      };
    } else {
      // Fallback to mock data calculations
      const total = MOCK_AGENTS.length;
      const healthy = MOCK_AGENTS.filter(a => a.status === 'healthy').length;
      const degraded = MOCK_AGENTS.filter(a => a.status === 'degraded').length;
      const down = MOCK_AGENTS.filter(a => a.status === 'down').length;
      const healthyAgents = MOCK_AGENTS.filter(a => a.status !== 'down');
      const avgLatency = healthyAgents.length > 0
        ? Math.round(healthyAgents.reduce((sum, a) => sum + a.latencyP99, 0) / healthyAgents.length)
        : 0;
      const avgErrorRate = healthyAgents.length > 0
        ? (healthyAgents.reduce((sum, a) => sum + a.errorRate, 0) / healthyAgents.length).toFixed(2)
        : '0.00';

      kpis = { total, healthy, degraded, down, healthyPct: Math.round((healthy / total) * 100), avgLatency, avgErrorRate };
    }

    const source: 'live' | 'demo' | 'mixed' =
      hasLiveSummary && hasLiveMetrics ? 'live' :
      hasLiveSummary || hasLiveMetrics ? 'mixed' : 'demo';

    return {
      loading,
      error,
      kpis,
      source,
      refresh: () => setRefreshKey(k => k + 1),
    };
  }, [loading, error, summaryData, metricsData]);

  return result;
}

// ============================================================================
// useFleetAgents - Agent list with metrics and filtering
// ============================================================================

export interface UseFleetAgentsResult {
  loading: boolean;
  error: string | null;
  agents: FleetAgent[];
  liveCount: number;
  demoCount: number;
  source: 'live' | 'demo' | 'mixed';
  refresh: () => void;
}

export function useFleetAgents(filters?: FleetFilters): UseFleetAgentsResult {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [metricsData, setMetricsData] = useState<AwsAgentRuntimeMetricsResponse | null>(null);
  const [discoveredAgents, setDiscoveredAgents] = useState<AwsDiscoveredAgentsResponse | null>(null);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      setError(null);

      try {
        const [metricsRes, agentsRes] = await Promise.allSettled([
          governAgentCoreApi.agentMetrics(1), // 1 day for 24h metrics
          governAgentCoreApi.agents(),
        ]);

        if (metricsRes.status === 'fulfilled') {
          setMetricsData(metricsRes.value);
        }
        if (agentsRes.status === 'fulfilled') {
          setDiscoveredAgents(agentsRes.value);
        }

        if (metricsRes.status === 'rejected' && agentsRes.status === 'rejected') {
          setError('Unable to load agent data - showing demo data');
        }
      } catch (err) {
        console.error('Failed to load fleet agents:', err);
        setError('Unable to load agent data - showing demo data');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [refreshKey]);

  const result = useMemo(() => {
    const hasLiveMetrics = metricsData?.live && metricsData.by_agent.length > 0;

    // Build live agents from CloudWatch metrics
    const liveAgents: FleetAgent[] = hasLiveMetrics
      ? metricsData!.by_agent.map((metric, i) => liveMetricToFleetAgent(metric, i))
      : [];

    // Use live agents when we have them; only fall back to mock/demo agents when
    // there are none. Never inject demo agents alongside live ones — that would
    // render 15 fabricated agents under a live badge.
    const usingLive = liveAgents.length > 0;
    const allAgents = usingLive ? liveAgents : MOCK_AGENTS;

    // Apply filters
    let filteredAgents = allAgents;

    if (filters?.status && filters.status !== 'all') {
      filteredAgents = filteredAgents.filter(a => a.status === filters.status);
    }

    if (filters?.provider && filters.provider !== 'all') {
      filteredAgents = filteredAgents.filter(a => a.provider === filters.provider);
    }

    if (filters?.search) {
      const q = filters.search.toLowerCase();
      filteredAgents = filteredAgents.filter(a =>
        a.name.toLowerCase().includes(q) ||
        a.owner.toLowerCase().includes(q)
      );
    }

    const liveCount = liveAgents.length;
    const demoCount = usingLive ? 0 : MOCK_AGENTS.length;
    const source: 'live' | 'demo' | 'mixed' = usingLive ? 'live' : 'demo';

    return {
      loading,
      error,
      agents: filteredAgents,
      liveCount,
      demoCount,
      source,
      refresh: () => setRefreshKey(k => k + 1),
    };
  }, [loading, error, metricsData, discoveredAgents, filters?.status, filters?.provider, filters?.search]);

  return result;
}

// ============================================================================
// useAgentDetail - Detailed metrics for a specific agent
// ============================================================================

export interface AgentDetailMetrics {
  latencyTrend: { hour: string; latency: number; errors: number; invocations: number }[];
  slas: SLA[];
  incidents: Incident[];
}

export interface UseAgentDetailResult {
  loading: boolean;
  error: string | null;
  agent: FleetAgent | null;
  detailMetrics: AgentDetailMetrics | null;
  source: 'live' | 'demo';
}

export function useAgentDetail(agentId: string | null): UseAgentDetailResult {
  const { agents, loading: agentsLoading } = useFleetAgents();

  const result = useMemo(() => {
    if (!agentId) {
      return {
        loading: false,
        error: null,
        agent: null,
        detailMetrics: null,
        source: 'demo' as const,
      };
    }

    const agent = agents.find(a => a.id === agentId) || null;

    if (!agent) {
      return {
        loading: agentsLoading,
        error: agentsLoading ? null : 'Agent not found',
        agent: null,
        detailMetrics: null,
        source: 'demo' as const,
      };
    }

    // No trend. This used to manufacture 24 hourly points from Math.random():
    //
    //   latency: agent.latencyP99 * (0.6 + Math.random() * 0.8)
    //   errors:  agent.errorRate  * (0.5 + Math.random())
    //   invocations: agent.invocations24h / 24 * (0.5 + Math.random())
    //
    // Three problems. It is random, so the "trend" changed on every render and any shape a
    // viewer read into it was noise. It is returned with `source: 'live'` below whenever the
    // agent is live, so noise would have been labelled as measured. And random variation is
    // more convincing than a static mock precisely because it looks like real telemetry.
    //
    // No component consumes useAgentDetail today, so nothing rendered it — but leaving a
    // fabricated series in the returned object is how it gets rendered by whoever wires this
    // up next. An empty series makes the absence explicit.
    //
    // To populate it for real: CloudWatch GetMetricData over AWS/Bedrock-AgentCore with
    // period=3600 for the agent's runtime dimension, which is the same source the AgentCore
    // telemetry endpoint already uses for its per-agent invocation counts.
    const latencyTrend: { hour: string; latency: number; errors: number; invocations: number }[] = [];

    return {
      loading: agentsLoading,
      error: null,
      agent,
      detailMetrics: {
        latencyTrend,
        slas: agent.slas,
        incidents: agent.incidents,
      },
      source: agent.isLive ? 'live' as const : 'demo' as const,
    };
  }, [agentId, agents, agentsLoading]);

  return result;
}

// Export mock data for fallback use
export { MOCK_AGENTS };
