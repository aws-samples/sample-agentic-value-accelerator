/**
 * useAgentRegistry — Pulls agent data from live AVA deployments
 *
 * Combines data from:
 * - deploymentsApi: Live deployments from Build module
 * - frontierAgentsApi: AWS Frontier Agents catalog
 * - AGENT_REGISTRY: Mock data as fallback when no live deployments exist
 *
 * Maps deployment data to the AgentRegistryEntry format for the registry UI.
 */

import { useState, useEffect, useMemo } from 'react';
import { deploymentsApi, frontierAgentsApi, governAgentCoreApi } from '../../api/client';
import type { FrontierAgentCatalogEntry, AwsDiscoveredAgent } from '../../api/client';
import type { Deployment } from '../../types';
import {
  AGENT_REGISTRY,
  TOOL_REGISTRY,
  type AgentRegistryEntry,
  type AgentStatus,
  type AgentScopeLevel,
} from './mockData';

export interface AgentRegistryResult {
  /** Loading state */
  loading: boolean;
  /** Error message if any */
  error: string | null;
  /** Combined agent list (live deployments + mock fallback) */
  agents: AgentRegistryEntry[];
  /** Count of live agents from deployments */
  liveCount: number;
  /** Count of demo/mock agents */
  demoCount: number;
  /** Data source: 'live' if we have real deployments, 'demo' if only mock data */
  source: 'live' | 'demo' | 'mixed';
  /** Raw deployments from API */
  deployments: Deployment[];
  /** Raw frontier agents from API */
  frontierAgents: FrontierAgentCatalogEntry[];
  /** Refresh data */
  refresh: () => void;
}

/**
 * Maps a deployment status to an agent status
 */
function mapDeploymentStatus(status: Deployment['status']): AgentStatus {
  switch (status) {
    case 'deployed':
    case 'delivered':
      return 'production';
    case 'deploying':
    case 'validating':
    case 'packaging':
    case 'pending':
    case 'verifying':
      return 'pilot';
    case 'failed':
    case 'rolled_back':
    case 'destroyed':
      return 'retired';
    default:
      return 'development';
  }
}

/**
 * Infers scope level from template/deployment characteristics
 */
function inferScopeLevel(deployment: Deployment): AgentScopeLevel {
  const templateId = deployment.template_id?.toLowerCase() || '';
  const name = deployment.deployment_name?.toLowerCase() || '';

  // Full agency patterns
  if (templateId.includes('agentic') || templateId.includes('autonomous') || name.includes('autonomous')) {
    return 4;
  }
  // Supervised patterns (most agents with tools)
  if (templateId.includes('agent') || templateId.includes('assistant')) {
    return 3;
  }
  // Prescribed Agency (limited tools, approval required)
  if (templateId.includes('chatbot') || templateId.includes('simple')) {
    return 2;
  }
  // Default to supervised for most deployed agents
  return 3;
}

/**
 * Extracts framework from template ID
 */
function extractFramework(templateId: string | undefined): string {
  if (!templateId) return 'Unknown';
  const lower = templateId.toLowerCase();
  if (lower.includes('strands')) return 'Strands';
  if (lower.includes('langgraph') || lower.includes('langraph')) return 'LangGraph';
  if (lower.includes('agentcore') || lower.includes('bedrock')) return 'Bedrock AgentCore';
  if (lower.includes('claude') || lower.includes('anthropic')) return 'Claude';
  return 'Custom';
}

/**
 * Maps a deployment to an AgentRegistryEntry
 */
function deploymentToAgent(d: Deployment, index: number): AgentRegistryEntry {
  const status = mapDeploymentStatus(d.status);
  const scopeLevel = inferScopeLevel(d);
  const framework = extractFramework(d.template_id);

  // Generate a consistent ID
  const id = `live-${d.deployment_id}`;

  // Infer tools from template (simplified - real implementation would query actual tool bindings)
  const tools = inferToolsFromTemplate(d.template_id);

  return {
    id,
    name: d.deployment_name || `Deployment ${index + 1}`,
    description: `Live deployment from ${d.template_id || 'custom template'}`,
    owner: d.created_by || 'Platform Team',
    productOwner: d.created_by || 'Unknown',
    businessPurpose: `Deployed via AVA Build module on ${d.aws_region}`,
    status,
    scopeLevel,
    securityClassification: scopeLevel >= 3 ? 'confidential' : 'internal',
    framework,
    model: inferModelFromTemplate(d.template_id),
    version: 'v1.0.0',
    firstDeployed: d.created_at,
    lastUpdated: d.updated_at,
    rateLimit: { rpm: 100, tpm: 50000 },
    approvalState: status === 'production' ? 'approved' : 'pending',
    tools,
    invokesAgents: [],
    dataAccess: ['Deployment Data'],
    guardrailId: undefined,
    metrics: {
      invocations30d: 0, // Would need CloudWatch integration
      errorRate: 0,
      p95LatencyMs: 0,
      avgCostPerDay: 0,
    },
    incidents: { count90d: 0, openCount: 0 },
    versionHistory: [
      {
        version: 'v1.0.0',
        date: d.created_at,
        change: 'Initial deployment via AVA Build',
      },
    ],
  };
}

/**
 * Maps a Frontier Agent catalog entry to an AgentRegistryEntry
 */
function frontierAgentToAgent(agent: FrontierAgentCatalogEntry): AgentRegistryEntry {
  const id = `frontier-${agent.id}`;

  return {
    id,
    name: agent.name,
    description: agent.description,
    owner: 'AWS Frontier Agents',
    productOwner: 'AWS',
    businessPurpose: 'Pre-built AWS Frontier Agent from catalog',
    status: agent.status === 'available' ? 'production' : 'development',
    scopeLevel: 3,
    securityClassification: 'confidential',
    framework: 'AWS Frontier Agents',
    model: 'bedrock',
    version: 'v1.0.0',
    firstDeployed: new Date().toISOString().split('T')[0],
    lastUpdated: new Date().toISOString().split('T')[0],
    rateLimit: { rpm: 100, tpm: 50000 },
    approvalState: 'pending',
    tools: [],
    invokesAgents: [],
    dataAccess: ['Frontier Agent Capabilities'],
    guardrailId: undefined,
    metrics: {
      invocations30d: 0,
      errorRate: 0,
      p95LatencyMs: 0,
      avgCostPerDay: 0,
    },
    incidents: { count90d: 0, openCount: 0 },
    versionHistory: [
      {
        version: 'v1.0.0',
        date: new Date().toISOString().split('T')[0],
        change: 'AWS Frontier Agent from catalog',
      },
    ],
  };
}

/**
 * Maps a real deployed agent (Bedrock Agent or AgentCore runtime) to a registry entry.
 * These are discovered straight from AWS — the account's actual agents.
 */
function discoveredAgentToAgent(a: AwsDiscoveredAgent): AgentRegistryEntry {
  const isCore = a.platform === 'agentcore-runtime';
  const ready = /READY|PREPARED|ACTIVE|AVAILABLE/i.test(a.status);
  const date = (a.updated_at || new Date().toISOString()).split('T')[0];
  return {
    id: `live-${a.platform}-${a.id}`,
    name: a.name,
    description: isCore ? 'AWS Bedrock AgentCore runtime (live)' : 'AWS Bedrock Agent (live)',
    owner: 'AWS Account',
    productOwner: 'Platform',
    businessPurpose: `Discovered from ${isCore ? 'Bedrock AgentCore' : 'Bedrock Agents'} in the connected account`,
    status: ready ? 'production' : 'development',
    scopeLevel: 3,
    securityClassification: 'confidential',
    framework: isCore ? 'Bedrock AgentCore' : 'Bedrock Agents',
    model: 'bedrock',
    version: a.version ? `v${a.version}` : 'v1',
    firstDeployed: date,
    lastUpdated: date,
    rateLimit: { rpm: 100, tpm: 50000 },
    approvalState: 'approved',
    tools: [],
    invokesAgents: [],
    dataAccess: [],
    guardrailId: undefined,
    metrics: { invocations30d: 0, errorRate: 0, p95LatencyMs: 0, avgCostPerDay: 0 },
    incidents: { count90d: 0, openCount: 0 },
    versionHistory: [{ version: a.version ? `v${a.version}` : 'v1', date, change: `Discovered live from ${a.platform}` }],
  };
}

/**
 * Infers model from template ID
 */
function inferModelFromTemplate(templateId: string | undefined): string {
  if (!templateId) return 'bedrock';
  const lower = templateId.toLowerCase();
  if (lower.includes('haiku')) return 'haiku';
  if (lower.includes('sonnet')) return 'sonnet';
  if (lower.includes('opus')) return 'opus';
  if (lower.includes('claude')) return 'claude';
  if (lower.includes('nova')) return 'nova';
  return 'bedrock';
}

/**
 * Infers tools from template ID (simplified mapping)
 */
function inferToolsFromTemplate(templateId: string | undefined): string[] {
  if (!templateId) return [];
  const lower = templateId.toLowerCase();
  const tools: string[] = [];

  // Map template patterns to tool IDs from TOOL_REGISTRY
  if (lower.includes('rag') || lower.includes('knowledge')) {
    tools.push('tool-kb-search');
  }
  if (lower.includes('customer') || lower.includes('service')) {
    tools.push('tool-kb-search', 'tool-ticket-create');
  }
  if (lower.includes('fraud') || lower.includes('risk')) {
    tools.push('tool-txn-query', 'tool-case-enrich');
  }
  if (lower.includes('trading') || lower.includes('market')) {
    tools.push('tool-market-data', 'tool-order-exec');
  }
  if (lower.includes('kyc') || lower.includes('compliance')) {
    tools.push('tool-doc-extract', 'tool-sanctions-check');
  }

  // Filter to only tools that exist in TOOL_REGISTRY
  const validToolIds = TOOL_REGISTRY.map(t => t.id);
  return tools.filter(t => validToolIds.includes(t));
}

/**
 * Hook to fetch and combine agent registry data from live deployments and mock fallback
 */
export function useAgentRegistry(): AgentRegistryResult {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [frontierAgents, setFrontierAgents] = useState<FrontierAgentCatalogEntry[]>([]);
  const [discovered, setDiscovered] = useState<AwsDiscoveredAgent[]>([]);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      setError(null);

      try {
        const [deploymentsRes, frontierRes, discoveredRes] = await Promise.allSettled([
          deploymentsApi.list(),
          frontierAgentsApi.listCatalog(),
          governAgentCoreApi.agents(),
        ]);

        if (deploymentsRes.status === 'fulfilled') {
          setDeployments(deploymentsRes.value);
        }
        if (frontierRes.status === 'fulfilled') {
          setFrontierAgents(frontierRes.value);
        }
        if (discoveredRes.status === 'fulfilled' && discoveredRes.value.live) {
          setDiscovered(discoveredRes.value.agents);
        }

        // Only set error if all failed
        if (deploymentsRes.status === 'rejected' && frontierRes.status === 'rejected' && discoveredRes.status === 'rejected') {
          setError('Unable to load live deployment data - showing demo data');
        }
      } catch (err) {
        console.error('Failed to load agent registry data:', err);
        setError('Unable to load live deployment data - showing demo data');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [refreshKey]);

  const result = useMemo(() => {
    // Convert live deployments to agent format
    // Filter to agent-like deployments (exclude infrastructure-only deployments)
    const agentDeployments = deployments.filter(d => {
      const templateId = d.template_id?.toLowerCase() || '';
      const name = d.deployment_name?.toLowerCase() || '';
      return (
        templateId.includes('agent') ||
        templateId.includes('assistant') ||
        templateId.includes('chatbot') ||
        templateId.includes('agentic') ||
        name.includes('agent') ||
        name.includes('assistant') ||
        // Include if it's in a production-like state (likely intentional deployment)
        (d.status === 'deployed' || d.status === 'delivered')
      );
    });

    const deploymentAgents = agentDeployments.map((d, i) => deploymentToAgent(d, i));

    // Real agents discovered straight from AWS (Bedrock Agents + AgentCore runtimes).
    const discoveredAgents = discovered.map(discoveredAgentToAgent);

    // Live agents = AVA deployments + AWS-discovered agents.
    const liveAgents = [...discoveredAgents, ...deploymentAgents];

    // Convert frontier agents to agent format (only those with deployments or marked available)
    const catalogAgents = frontierAgents
      .filter(a => a.status === 'available')
      .map(frontierAgentToAgent);

    // Determine what to show:
    // - If we have live agents, show them first
    // - Always include mock data as reference/fallback for complete view
    const hasLiveData = liveAgents.length > 0 || catalogAgents.length > 0;

    // Combine: live agents first, then catalog agents, then mock agents (marked differently)
    // Mark mock agents to distinguish them in the UI
    const mockAgents = AGENT_REGISTRY.map(a => ({
      ...a,
      // Keep original ID but can be distinguished by not having 'live-' or 'frontier-' prefix
    }));

    // If no live data, use only mock
    // If live data exists, combine live + mock (mock shows what's possible)
    const agents = hasLiveData
      ? [...liveAgents, ...catalogAgents, ...mockAgents]
      : mockAgents;

    const liveCount = liveAgents.length + catalogAgents.length;
    const demoCount = mockAgents.length;

    const source: 'live' | 'demo' | 'mixed' =
      liveCount === 0 ? 'demo' :
      demoCount === 0 ? 'live' : 'mixed';

    return {
      loading,
      error,
      agents,
      liveCount,
      demoCount,
      source,
      deployments,
      frontierAgents,
      refresh: () => setRefreshKey(k => k + 1),
    };
  }, [loading, error, deployments, frontierAgents, discovered]);

  return result;
}

/**
 * Utility to check if an agent is from live data
 */
export function isLiveAgent(agentId: string): boolean {
  return agentId.startsWith('live-') || agentId.startsWith('frontier-');
}

export default useAgentRegistry;
