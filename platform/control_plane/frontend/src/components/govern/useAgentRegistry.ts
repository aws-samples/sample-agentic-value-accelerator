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
import {
  deploymentsApi,
  frontierAgentsApi,
  governAgentCoreApi,
  buildAgentsApi,
  buildMcpApi,
  buildSkillsApi,
  buildMemoryApi,
  buildHarnessApi,
} from '../../api/client';
import type {
  FrontierAgentCatalogEntry,
  AwsDiscoveredAgent,
  AwsRegionProvenance,
  BuildRegistryAgent,
  BuildMcpServer,
  BuildSkill,
  BuildMemory,
  BuildHarness,
} from '../../api/client';
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
  /**
   * Live-only subset of `agents` — AWS-discovered agents, AVA deployments, Build
   * registries, and the AWS catalog. Never contains AGENT_REGISTRY demo agents.
   * Views that badge themselves "Live" should aggregate over this list so demo
   * agents can't inflate a live rollup.
   */
  liveAgents: AgentRegistryEntry[];
  /** Count of live agents from deployments */
  liveCount: number;
  /** Count of demo/mock agents */
  demoCount: number;
  /** Data source: 'live' if we have real deployments, 'demo' if only mock data */
  source: 'live' | 'demo' | 'mixed';
  /**
   * Region coverage of the AWS agent-discovery fan-out. A governed region that did
   * not answer is dropped from the result rather than failing the request, so the
   * discovered-agent count can be a floor; this is what lets a view say so. Null
   * when the response carried no provenance block (single-region by construction).
   */
  discoveredRegions: AwsRegionProvenance | null;
  /** Raw deployments from API */
  deployments: Deployment[];
  /** Raw frontier agents from API */
  frontierAgents: FrontierAgentCatalogEntry[];
  /** Build module registries */
  buildAgents: BuildRegistryAgent[];
  buildMcpServers: BuildMcpServer[];
  buildSkills: BuildSkill[];
  buildMemory: BuildMemory[];
  buildHarnesses: BuildHarness[];
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
    // The agent's real description when AWS has one (both list calls return it at no extra
    // cost; 13 of 36 agents on the reference account carry one). The previous value was a
    // sentence this mapper wrote - every Bedrock agent read "AWS Bedrock Agent (live)",
    // which describes the platform, not the agent, and looked like recorded metadata.
    // Absence is stated rather than papered over.
    description: a.description
      || (isCore
        ? 'No description recorded on this AgentCore runtime.'
        : 'No description recorded on this Bedrock agent.'),
    owner: 'AWS Account',
    productOwner: 'Platform',
    // A business purpose is something a person records during onboarding; AWS holds no such
    // field. This used to read "Discovered from Bedrock AgentCore in the connected account",
    // which is provenance, not a purpose - and the drawer renders it under a "Business
    // Purpose" heading, so it asserted an answer to a question nobody had answered. The
    // provenance it used to carry is already on screen: the Live badge names the discovery
    // source and the framework field names the platform.
    businessPurpose: 'No business purpose recorded — this agent was discovered in the account rather than registered through AVA.',
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
 * Maps a Build Registry Agent to an AgentRegistryEntry
 */
function buildAgentToEntry(agent: BuildRegistryAgent): AgentRegistryEntry {
  const date = (agent.created_at || new Date().toISOString()).split('T')[0];
  return {
    id: `build-agent-${agent.agent_id}`,
    name: agent.name,
    description: agent.description || 'Agent from Build Registry',
    owner: 'Build Module',
    productOwner: 'Platform',
    businessPurpose: `Registered agent using ${agent.runtime} runtime`,
    status: agent.status === 'active' ? 'production' : agent.status === 'pending' ? 'pilot' : 'development',
    scopeLevel: 3,
    securityClassification: 'confidential',
    framework: agent.runtime || 'Custom',
    model: 'bedrock',
    version: 'v1.0.0',
    firstDeployed: date,
    lastUpdated: (agent.updated_at || agent.created_at || new Date().toISOString()).split('T')[0],
    rateLimit: { rpm: 100, tpm: 50000 },
    approvalState: agent.status === 'active' ? 'approved' : 'pending',
    tools: [],
    invokesAgents: [],
    dataAccess: agent.capabilities || [],
    guardrailId: undefined,
    metrics: { invocations30d: 0, errorRate: 0, p95LatencyMs: 0, avgCostPerDay: 0 },
    incidents: { count90d: 0, openCount: 0 },
    versionHistory: [{ version: 'v1.0.0', date, change: 'Registered via Build module' }],
  };
}

/**
 * Maps a Build MCP Server to an AgentRegistryEntry (for unified inventory)
 */
function buildMcpToEntry(server: BuildMcpServer): AgentRegistryEntry {
  const date = (server.created_at || new Date().toISOString()).split('T')[0];
  return {
    id: `build-mcp-${server.server_id}`,
    name: `MCP: ${server.name}`,
    description: server.description || `MCP Server (${server.transport})`,
    owner: 'Build Module',
    productOwner: 'Platform',
    businessPurpose: `MCP tool server providing ${(server.capabilities || []).length} capabilities`,
    status: server.status === 'active' ? 'production' : 'development',
    scopeLevel: 2,
    securityClassification: 'internal',
    framework: `MCP (${server.transport})`,
    model: 'n/a',
    version: 'v1.0.0',
    firstDeployed: date,
    lastUpdated: (server.updated_at || server.created_at || new Date().toISOString()).split('T')[0],
    rateLimit: { rpm: 1000, tpm: 100000 },
    approvalState: server.status === 'active' ? 'approved' : 'pending',
    tools: server.capabilities || [],
    invokesAgents: [],
    dataAccess: [],
    guardrailId: undefined,
    metrics: { invocations30d: 0, errorRate: 0, p95LatencyMs: 0, avgCostPerDay: 0 },
    incidents: { count90d: 0, openCount: 0 },
    versionHistory: [{ version: 'v1.0.0', date, change: 'MCP server registered' }],
  };
}

/**
 * Maps a Build Skill to an AgentRegistryEntry
 */
function buildSkillToEntry(skill: BuildSkill): AgentRegistryEntry {
  const date = (skill.created_at || new Date().toISOString()).split('T')[0];
  return {
    id: `build-skill-${skill.skill_id}`,
    name: `Skill: ${skill.name}`,
    description: skill.description || `${skill.type} skill`,
    owner: 'Build Module',
    productOwner: 'Platform',
    businessPurpose: `Reusable skill of type ${skill.type}`,
    status: skill.status === 'active' ? 'production' : 'development',
    scopeLevel: 1,
    securityClassification: 'internal',
    framework: skill.type,
    model: 'n/a',
    version: 'v1.0.0',
    firstDeployed: date,
    lastUpdated: (skill.updated_at || skill.created_at || new Date().toISOString()).split('T')[0],
    rateLimit: { rpm: 500, tpm: 50000 },
    approvalState: skill.status === 'active' ? 'approved' : 'pending',
    tools: skill.capabilities || [],
    invokesAgents: [],
    dataAccess: [],
    guardrailId: undefined,
    metrics: { invocations30d: 0, errorRate: 0, p95LatencyMs: 0, avgCostPerDay: 0 },
    incidents: { count90d: 0, openCount: 0 },
    versionHistory: [{ version: 'v1.0.0', date, change: 'Skill registered' }],
  };
}

/**
 * Maps a Build Memory store to an AgentRegistryEntry
 */
function buildMemoryToEntry(memory: BuildMemory): AgentRegistryEntry {
  const date = (memory.created_at || new Date().toISOString()).split('T')[0];
  return {
    id: `build-memory-${memory.memory_id}`,
    name: `Memory: ${memory.name}`,
    description: memory.description || `${memory.strategy} memory store`,
    owner: 'Build Module',
    productOwner: 'Platform',
    businessPurpose: `Memory persistence using ${memory.strategy} strategy`,
    status: memory.status === 'active' ? 'production' : 'development',
    scopeLevel: 1,
    securityClassification: 'confidential',
    framework: memory.strategy,
    model: 'n/a',
    version: 'v1.0.0',
    firstDeployed: date,
    lastUpdated: (memory.updated_at || memory.created_at || new Date().toISOString()).split('T')[0],
    rateLimit: { rpm: 1000, tpm: 100000 },
    approvalState: memory.status === 'active' ? 'approved' : 'pending',
    tools: [],
    invokesAgents: [],
    dataAccess: ['Agent Context', 'Session History'],
    guardrailId: undefined,
    metrics: { invocations30d: 0, errorRate: 0, p95LatencyMs: 0, avgCostPerDay: 0 },
    incidents: { count90d: 0, openCount: 0 },
    versionHistory: [{ version: 'v1.0.0', date, change: 'Memory store registered' }],
  };
}

/**
 * Maps a Build Harness to an AgentRegistryEntry
 */
function buildHarnessToEntry(harness: BuildHarness): AgentRegistryEntry {
  const date = (harness.created_at || new Date().toISOString()).split('T')[0];
  return {
    id: `build-harness-${harness.harness_id}`,
    name: `Harness: ${harness.name}`,
    description: harness.description || `${harness.harness_type} harness`,
    owner: 'Build Module',
    productOwner: 'Platform',
    businessPurpose: `Agent harness using ${harness.foundation_model || 'default'} foundation model`,
    status: harness.status === 'active' ? 'production' : 'development',
    scopeLevel: 3,
    securityClassification: 'confidential',
    framework: harness.harness_type,
    model: harness.foundation_model || 'bedrock',
    version: 'v1.0.0',
    firstDeployed: date,
    lastUpdated: (harness.updated_at || harness.created_at || new Date().toISOString()).split('T')[0],
    rateLimit: { rpm: 100, tpm: 50000 },
    approvalState: harness.status === 'active' ? 'approved' : 'pending',
    tools: [],
    invokesAgents: [],
    dataAccess: [],
    guardrailId: undefined,
    metrics: { invocations30d: 0, errorRate: 0, p95LatencyMs: 0, avgCostPerDay: 0 },
    incidents: { count90d: 0, openCount: 0 },
    versionHistory: [{ version: 'v1.0.0', date, change: 'Harness registered' }],
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
  const [discoveredRegions, setDiscoveredRegions] = useState<AwsRegionProvenance | null>(null);
  const [buildAgents, setBuildAgents] = useState<BuildRegistryAgent[]>([]);
  const [buildMcpServers, setBuildMcpServers] = useState<BuildMcpServer[]>([]);
  const [buildSkills, setBuildSkills] = useState<BuildSkill[]>([]);
  const [buildMemory, setBuildMemory] = useState<BuildMemory[]>([]);
  const [buildHarnesses, setBuildHarnesses] = useState<BuildHarness[]>([]);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      setError(null);

      try {
        const [
          deploymentsRes,
          frontierRes,
          discoveredRes,
          buildAgentsRes,
          buildMcpRes,
          buildSkillsRes,
          buildMemoryRes,
          buildHarnessRes,
        ] = await Promise.allSettled([
          deploymentsApi.list(),
          frontierAgentsApi.listCatalog(),
          governAgentCoreApi.agents(),
          buildAgentsApi.list(),
          buildMcpApi.list(),
          buildSkillsApi.list(),
          buildMemoryApi.list(),
          buildHarnessApi.list(),
        ]);

        if (deploymentsRes.status === 'fulfilled') {
          setDeployments(deploymentsRes.value);
        }
        if (frontierRes.status === 'fulfilled') {
          setFrontierAgents(frontierRes.value);
        }
        if (discoveredRes.status === 'fulfilled' && discoveredRes.value.live) {
          setDiscovered(discoveredRes.value.agents);
          setDiscoveredRegions(discoveredRes.value.regions ?? null);
        }
        if (buildAgentsRes.status === 'fulfilled') {
          setBuildAgents(buildAgentsRes.value.agents || []);
        }
        if (buildMcpRes.status === 'fulfilled') {
          setBuildMcpServers(buildMcpRes.value.servers || []);
        }
        if (buildSkillsRes.status === 'fulfilled') {
          setBuildSkills(buildSkillsRes.value.skills || []);
        }
        if (buildMemoryRes.status === 'fulfilled') {
          setBuildMemory(buildMemoryRes.value.memories || []);
        }
        if (buildHarnessRes.status === 'fulfilled') {
          setBuildHarnesses(buildHarnessRes.value.harnesses || []);
        }

        // Only set error if core sources all failed
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

    // Build module registries — unified inventory from Build
    const buildAgentEntries = buildAgents.map(buildAgentToEntry);
    const buildMcpEntries = buildMcpServers.map(buildMcpToEntry);
    const buildSkillEntries = buildSkills.map(buildSkillToEntry);
    const buildMemoryEntries = buildMemory.map(buildMemoryToEntry);
    const buildHarnessEntries = buildHarnesses.map(buildHarnessToEntry);

    // Live agents = AVA deployments + AWS-discovered + Build registries
    const liveAgents = [
      ...discoveredAgents,
      ...deploymentAgents,
      ...buildAgentEntries,
      ...buildMcpEntries,
      ...buildSkillEntries,
      ...buildMemoryEntries,
      ...buildHarnessEntries,
    ];

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

    // Live-only inventory (no demo agents). Exposed separately so a view that
    // badges itself "Live" can aggregate over real agents only, instead of
    // rolling demo agents into a live number.
    const liveOnlyAgents = [...liveAgents, ...catalogAgents];

    // If no live data, use only mock
    // If live data exists, combine live + mock (mock shows what's possible)
    const agents = hasLiveData
      ? [...liveOnlyAgents, ...mockAgents]
      : mockAgents;

    const liveCount = liveOnlyAgents.length;
    const demoCount = mockAgents.length;

    const source: 'live' | 'demo' | 'mixed' =
      liveCount === 0 ? 'demo' :
      demoCount === 0 ? 'live' : 'mixed';

    return {
      loading,
      error,
      agents,
      liveAgents: liveOnlyAgents,
      liveCount,
      demoCount,
      source,
      discoveredRegions,
      deployments,
      frontierAgents,
      buildAgents,
      buildMcpServers,
      buildSkills,
      buildMemory,
      buildHarnesses,
      refresh: () => setRefreshKey(k => k + 1),
    };
  }, [loading, error, deployments, frontierAgents, discovered, discoveredRegions, buildAgents, buildMcpServers, buildSkills, buildMemory, buildHarnesses]);

  return result;
}

/**
 * Get the source type for an agent ID
 *
 * NOTE: there is deliberately no `isLiveAgent(id)` helper here. A "Live" badge must
 * mean an actual running AWS runtime, i.e. only the `live-` prefix — `frontier-`
 * (model catalog) and `build-` (definition/registry) entries have no runtime and
 * zero metrics. Callers should compare against `live-` (or `getAgentSource(id) === 'aws'`)
 * at the point of use rather than reintroducing a loose multi-prefix helper.
 */
export function getAgentSource(agentId: string): 'aws' | 'frontier' | 'build-agent' | 'build-mcp' | 'build-skill' | 'build-memory' | 'build-harness' | 'demo' {
  if (agentId.startsWith('live-')) return 'aws';
  if (agentId.startsWith('frontier-')) return 'frontier';
  if (agentId.startsWith('build-agent-')) return 'build-agent';
  if (agentId.startsWith('build-mcp-')) return 'build-mcp';
  if (agentId.startsWith('build-skill-')) return 'build-skill';
  if (agentId.startsWith('build-memory-')) return 'build-memory';
  if (agentId.startsWith('build-harness-')) return 'build-harness';
  return 'demo';
}

export default useAgentRegistry;
