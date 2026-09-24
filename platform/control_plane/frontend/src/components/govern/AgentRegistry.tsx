/**
 * AgentRegistry — Centralized inventory of agents, tools, and MCP servers.
 *
 * Closes the AWS agentic-governance gap "Agent, tool, and MCP registry management"
 * plus "Multi-level access and agent permissions" (permissions matrix tab).
 *
 * Tabs:
 *  - Agents:      registry with capabilities, scope, owner, rate limits, incidents, version history
 *  - Tools:       tool inventory with risk level, access type, MCP server, authorized agents
 *  - MCP Servers: server inventory with auth method, health, governed status
 *  - Permissions: agent→tool authorization grid + agent-to-agent (A2A) matrix + user-rights propagation
 */

import { useMemo, useState, useEffect, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import {
  TOOL_REGISTRY,
  MCP_SERVER_REGISTRY,
  AGENT_PROVIDER_CONFIG,
  EXTERNAL_AGENTS,
  type AgentRegistryEntry,
  type AgentStatus,
  type AgentProvider,
  type GovernanceStatus,
  type ToolRiskLevel,
  tooltipStyle,
} from './mockData';
import { AGENT_SCOPE_META, type AgentScopeLevel } from './autonomyLadder';
import { rowButtonProps } from './a11y';
import FleetScaleView from './FleetScaleView';
import AttackSurfaceView from './AttackSurfaceView';
import UnifiedGuide, { AGENT_REGISTRY_GUIDE } from './UnifiedGuide';
import AgentDrawer from './AgentDrawer';
import { useAgentPolicies, type AgentPolicySummary } from './useAgentPolicies';
import GovernTabs, { type GovernTab } from './GovernTabs';
import { useAgentRegistry } from './useAgentRegistry';
import { useGovernModels } from './useGovernModels';
import {
  governAgentCoreApi,
  governCostApi,
  governResourceTagsApi,
  type AwsGateway,
  type AwsGovernanceTaggedResource,
} from '../../api/client';
import InventoryConnectorsCard from './InventoryConnectorsCard';
import AgentCorePostureCard from './AgentCorePostureCard';
import { useAwsConnected } from './useAwsConnected';
import HumanOversight from './HumanOversight';
import A2AGovernance from './A2AGovernance';
import AgentCoreEvaluations from './AgentCoreEvaluations';
import { LiveDataBadge, MockDataBadge } from './DataSourceIndicator';
import CoreBadge from './CoreBadge';
import Drawer from './Drawer';
import GovernPageLayout from './GovernPageLayout';
import { Icon, type IconName } from './icons';
import { useSecurityHubAIInventory, type SecurityHubAIAsset, type AIAssetType } from './useSecurityHubAIInventory';
import { DataSourceInfo, getPageDataSources } from './DataSourceInfo';
import type { Formatter, ValueType, NameType } from 'recharts/types/component/DefaultTooltipContent';

type TabId = 'agents' | 'fleet-scale' | 'attack-surface' | 'tools' | 'mcp' | 'permissions' | 'human-oversight' | 'a2a' | 'evaluations' | 'providers';

const TABS: GovernTab[] = [
  { id: 'agents', label: 'Agents' },
  { id: 'fleet-scale', label: 'Registry at Scale' },
  { id: 'attack-surface', label: 'Attack Surface' },
  { id: 'tools', label: 'Tools' },
  { id: 'mcp', label: 'MCP Servers' },
  { id: 'permissions', label: 'Permissions' },
  { id: 'human-oversight', label: 'Human Oversight' },
  { id: 'a2a', label: 'A2A Governance' },
  { id: 'evaluations', label: 'Agentic Evals' },
  { id: 'providers', label: 'Providers' },
];

// Normalized MCP server card — unifies live AgentCore gateways, the Build MCP
// catalog, and the mock registry into one shape the card render can consume.
type McpCardStatus = 'operational' | 'degraded' | 'maintenance' | 'offline';
interface McpCard {
  id: string;
  name: string;
  endpoint: string;
  status: McpCardStatus;
  toolCount: number | null;
  authMethod: string;
  owner: string;
  checked: string;
  uptime30d: number | null;   // health metric — null when not available live
  avgLatencyMs: number | null; // health metric — null when not available live
}

/** Normalize AgentCore / Build / mock status vocabularies to the card status. */
function normMcpStatus(raw: string): McpCardStatus {
  const s = (raw || '').toLowerCase();
  if (s === 'operational' || s === 'ready' || s === 'active' || s === 'available') return 'operational';
  if (s === 'degraded' || s === 'deprecated') return 'degraded';
  if (s === 'maintenance' || s === 'creating' || s === 'updating' || s === 'pending') return 'maintenance';
  return 'offline';
}

const statusBg: Record<AgentStatus, string> = {
  production: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  pilot: 'bg-amber-50 text-amber-700 border-amber-200',
  development: 'bg-blue-50 text-blue-700 border-blue-200',
  retired: 'bg-slate-100 text-slate-500 border-slate-200',
};

const riskBg: Record<ToolRiskLevel, string> = {
  low: 'bg-emerald-50 text-emerald-700',
  medium: 'bg-amber-50 text-amber-700',
  high: 'bg-orange-50 text-orange-700',
  critical: 'bg-rose-50 text-rose-700',
};

function ScopeBadge({ level }: { level: AgentScopeLevel }) {
  const meta = AGENT_SCOPE_META[level];
  return (
    <span
      className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
      style={{ backgroundColor: `${meta.color}18`, color: meta.color }}
      title={meta.description}
    >
      L{level} {meta.name}
    </span>
  );
}

/**
 * A registry row with every honesty-relevant field resolved.
 *  - `isDemo`            — row came from seeded data (AGENT_REGISTRY / EXTERNAL_AGENTS)
 *  - `invocationsKnown`  — we actually measured invocations (vs. a placeholder 0)
 *  - `tagEvidence`       — the Resource Groups Tagging record this agent joined to
 */
type RegistryRow = AgentRegistryEntry & {
  provider: AgentProvider;
  governanceStatus: GovernanceStatus;
  riskScore: number;
  isDemo: boolean;
  invocationsKnown: boolean;
  tagEvidence?: AwsGovernanceTaggedResource;
};

/** Seeded rows keep their authored posture; they are simply flagged as demo. */
function normalizeDemoRow(a: AgentRegistryEntry): RegistryRow {
  return {
    ...a,
    provider: a.provider ?? ('aws' as AgentProvider),
    governanceStatus: a.governanceStatus ?? 'unknown',
    riskScore: a.riskScore ?? 0,
    isDemo: true,
    invocationsKnown: true,
  };
}

/**
 * Join a registry id back to its AWS resource-tag record.
 *
 * AWS-discovered agents are keyed `live-<platform>-<awsResourceId>` by
 * useAgentRegistry, and the tagging API returns ARNs whose resource tail is exactly
 * that `<awsResourceId>`. Try the raw id first (so an optional backend-supplied ARN or
 * a plain id both work), then the `live-…` tail. Verified against the live account for
 * both `bedrock:…/agent/<id>` and `bedrock-agentcore:…/runtime/<id>`.
 */
function tagEvidenceFor(
  agentId: string,
  byResourceId: Map<string, AwsGovernanceTaggedResource>,
): AwsGovernanceTaggedResource | undefined {
  const direct = byResourceId.get(agentId);
  if (direct) return direct;
  const m = /^live-(?:bedrock-agent|agentcore-runtime)-(.+)$/.exec(agentId);
  return m ? byResourceId.get(m[1]) : undefined;
}

/**
 * Derive a real governanceStatus from real evidence.
 *
 * Precedence (highest first), chosen so a negative signal is never masked by a positive one:
 *  1. An authored status on the entry — only seeded demo agents carry one, and they are
 *     the ONLY source of 'blocked'. No AWS API attests "blocked", so live agents can
 *     never reach it and we do not synthesize it.
 *  2. Open incidents > 0 → 'review_needed'. A real negative signal outranks good tags:
 *     an agent with an open incident is not "compliant" just because it is tagged.
 *  3. Joined to a tagged AI-estate resource:
 *       governed && has_owner → 'compliant'      (governance tag AND an accountable owner)
 *       otherwise             → 'review_needed'  (present in the estate, tags incomplete)
 *  4. No join to any tagged resource → 'unknown'. Genuinely unknown; do not guess.
 *
 * Source of truth for 3: ResourceGroupsTaggingAPI GetResources via
 * GET /govern/governance/resource-tags. `governed` = carries a governance tag;
 * `has_owner` = carries an owner tag.
 */
function deriveGovernanceStatus(
  a: AgentRegistryEntry,
  evidence: AwsGovernanceTaggedResource | undefined,
): GovernanceStatus {
  if (a.governanceStatus) return a.governanceStatus;
  if ((a.incidents?.openCount ?? 0) > 0) return 'review_needed';
  if (evidence) return evidence.governed && evidence.has_owner ? 'compliant' : 'review_needed';
  return 'unknown';
}

export default function AgentRegistry() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabFromUrl = searchParams.get('tab') as TabId | null;
  const agentFromUrl = searchParams.get('agent');
  const providerFromUrl = searchParams.get('provider') as AgentProvider | null;
  const [tab, setTab] = useState<TabId>(tabFromUrl && TABS.some(t => t.id === tabFromUrl) ? tabFromUrl : 'agents');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | AgentStatus>('all');
  const [attentionFilter, setAttentionFilter] = useState<'all' | 'needs-attention' | 'ownerless' | 'inactive' | 'high-risk'>('all');
  const [useRealFleetData, setUseRealFleetData] = useState(false);
  // Derive provider and agent from URL - URL is source of truth
  const providerFilter: 'all' | AgentProvider = providerFromUrl && Object.keys(AGENT_PROVIDER_CONFIG).includes(providerFromUrl)
    ? providerFromUrl as AgentProvider
    : 'all';
  const openAgent = agentFromUrl;

  // Sync tab with URL param - use useMemo to compute without effect
  const effectiveTab = useMemo(() => {
    if (tabFromUrl && TABS.some(t => t.id === tabFromUrl)) {
      return tabFromUrl as TabId;
    }
    return tab;
  }, [tabFromUrl, tab]);

  // Update local tab state when URL changes (one-way sync from URL)
  useEffect(() => {
    if (effectiveTab !== tab) {
      setTab(effectiveTab);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveTab]);

  const setProviderFilter = (provider: 'all' | AgentProvider) => {
    if (provider === 'all') {
      searchParams.delete('provider');
    } else {
      searchParams.set('provider', provider);
    }
    setSearchParams(searchParams, { replace: true });
  };

  const setOpenAgent = (agentId: string | null) => {
    if (agentId) {
      searchParams.set('agent', agentId);
    } else {
      searchParams.delete('agent');
    }
    setSearchParams(searchParams, { replace: true });
  };

  const handleTabChange = (newTab: TabId) => {
    setTab(newTab);
    if (newTab === 'agents') {
      searchParams.delete('tab');
    } else {
      searchParams.set('tab', newTab);
    }
    setSearchParams(searchParams, { replace: true });
  };

  // Live Cedar policy posture from Secure (/secure/policy). Read-only here.
  const policies = useAgentPolicies();

  // Live agent data from deployments + mock fallback, combined with external agents.
  const agentRegistry = useAgentRegistry();
  const { awsConnected } = useAwsConnected();

  // Ids of the genuinely live inventory (AWS-discovered runtimes, AVA deployments, Build
  // registries, AWS catalog). `agentRegistry.agents` deliberately appends the 6
  // AGENT_REGISTRY demo entries on top of this, so this set is the only way to tell a
  // real row from a seeded one — headline KPIs aggregate over the live subset only.
  const liveAgentIds = useMemo(
    () => new Set(agentRegistry.liveAgents.map(a => a.id)),
    [agentRegistry.liveAgents],
  );

  // Real governance evidence: Resource Groups Tagging coverage of the AI estate.
  // Every sampled resource carries its (account-masked) ARN plus the actual
  // owner/project/env/scope tag booleans, which lets an AWS-discovered agent be joined
  // to genuine tag evidence instead of being pinned to 'unknown' forever.
  // Join key (verified against the live account): the ARN's resource tail equals the
  // discovered agent id — e.g. `.../agent/I80VGPSASJ` and `.../runtime/<name>-<suffix>`.
  const [tagResources, setTagResources] = useState<AwsGovernanceTaggedResource[]>([]);
  const [tagsLive, setTagsLive] = useState(false);
  useEffect(() => {
    let cancelled = false;
    // max_samples is validated server-side as le=100 (govern_resource_tags.py) — asking for
    // more returns 422 and would silently kill every derived governance status. 100 covers
    // the whole AI estate today (59 resources).
    governResourceTagsApi.coverage(1000, 100)
      .then(r => {
        if (cancelled) return;
        setTagResources(r.sample_resources ?? []);
        setTagsLive(!!r.live);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const tagEvidenceByResourceId = useMemo(() => {
    const m = new Map<string, AwsGovernanceTaggedResource>();
    for (const r of tagResources) {
      const tail = (r.arn ?? '').split('/').pop();
      if (tail && !m.has(tail)) m.set(tail, r);
    }
    return m;
  }, [tagResources]);

  // Real AWS provider spend (Cost Explorer resource-level, GetCostAndUsageWithResources).
  // Deliberately PROVIDER-level only: per-agent attribution is not achievable from this
  // endpoint — its rows are inference-profile / guardrail resources that share no
  // identifier with any agent id, and AgentCore spend bills under a Cost Explorer service
  // value the endpoint's filter excludes. Dedupe on resource_arn, never resource_id:
  // resource_id is an ARN tail, so two distinct `...-v1:0` rows both collapse to "0".
  // The window is capped server-side at 14 days, so normalize with the response's own
  // window_days rather than assuming 30.
  const [awsCost, setAwsCost] = useState<
    { monthly: number; live: boolean; windowDays: number; periodStart: string; periodEnd: string } | null
  >(null);
  useEffect(() => {
    let cancelled = false;
    governCostApi.byResource(14)
      .then(r => {
        if (cancelled || !r.live) return;
        const seen = new Set<string>();
        let total = 0;
        for (const row of r.by_resource ?? []) {
          const key = row.resource_arn ?? row.resource_id;
          if (!key || seen.has(key)) continue;
          seen.add(key);
          total += row.amount ?? 0;
        }
        const windowDays = r.window_days > 0 ? r.window_days : 1;
        setAwsCost({
          monthly: (total / windowDays) * 30,
          live: true,
          windowDays,
          periodStart: r.period_start,
          periodEnd: r.period_end,
        });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Security Hub AI inventory - for importing discovered assets
  const securityHubRaw = useSecurityHubAIInventory();
  // Derive convenience properties from the hook result
  const securityHubInventory = useMemo(() => {
    const assets = securityHubRaw.discoveredAssets ?? [];
    const unregisteredAssets = assets.filter(a => a.registrationStatus === 'unregistered');
    const byType = (Object.entries(securityHubRaw.summary?.byType ?? {}) as [AIAssetType, number][])
      .filter(([, count]) => count > 0)
      .map(([type, count]) => ({
        type,
        count,
        icon: ASSET_TYPE_ICONS[type],
        label: ASSET_TYPE_LABELS[type],
        unregistered: unregisteredAssets.filter(a => a.type === type).length,
      }));
    return {
      ...securityHubRaw,
      assets,
      unregisteredAssets,
      byType,
      totalDiscovered: securityHubRaw.summary?.total ?? 0,
      unregisteredCount: securityHubRaw.summary?.unregisteredCount ?? 0,
      registeredCount: securityHubRaw.summary?.registeredCount ?? 0,
      criticalRiskCount: assets.filter(a => a.highestSeverity === 'CRITICAL').length,
      highRiskCount: assets.filter(a => a.highestSeverity === 'HIGH').length,
    };
  }, [securityHubRaw]);
  const [importDrawerOpen, setImportDrawerOpen] = useState(false);
  const [selectedForImport, setSelectedForImport] = useState<Set<string>>(new Set());
  const [importToast, setImportToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Clear toast after 4 seconds
  useEffect(() => {
    if (importToast) {
      const timer = setTimeout(() => setImportToast(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [importToast]);

  const handleToggleAssetSelection = (assetId: string) => {
    setSelectedForImport(prev => {
      const next = new Set(prev);
      if (next.has(assetId)) {
        next.delete(assetId);
      } else {
        next.add(assetId);
      }
      return next;
    });
  };

  const handleSelectAllUnregistered = () => {
    if (selectedForImport.size === securityHubInventory.unregisteredAssets.length) {
      setSelectedForImport(new Set());
    } else {
      setSelectedForImport(new Set(securityHubInventory.unregisteredAssets.map(a => a.id)));
    }
  };

  const handleImportSelected = () => {
    // In a real implementation, this would call an API to create registry entries
    // For now, simulate success and show toast
    const count = selectedForImport.size;
    setImportToast({ message: `Successfully imported ${count} asset${count !== 1 ? 's' : ''} to the registry`, type: 'success' });
    setSelectedForImport(new Set());
    setImportDrawerOpen(false);
    // Refresh the Security Hub inventory to update registration status
    securityHubInventory.refresh();
  };

  // Live CloudWatch AWS/Bedrock runtime metrics, joined to agents by their model.
  // agent.model is a keyword (opus/sonnet/haiku/nova/claude/bedrock); we match it
  // against canonical CloudWatch ModelIds by substring. This is MODEL-LEVEL data
  // (all agents on a model share its metrics) — honest, not per-agent telemetry.
  const { metrics: liveModelMetrics, metricsLive } = useGovernModels(30, 3);
  const modelMetricsByKeyword = useMemo(() => {
    const map = new Map<string, { invocations: number; latencyMs: number; errorPct: number }>();
    for (const m of liveModelMetrics?.by_model ?? []) {
      const id = m.model_id.toLowerCase();
      for (const kw of ['opus', 'sonnet', 'haiku', 'nova', 'claude']) {
        if (id.includes(kw)) {
          const prev = map.get(kw) ?? { invocations: 0, latencyMs: 0, errorPct: 0 };
          const totalInv = prev.invocations + m.invocations;
          map.set(kw, {
            invocations: totalInv,
            // Invocation-weight latency/error rate so multiple model ids matching
            // one keyword pool by traffic (Σ(metric·invocations)/Σinvocations)
            // rather than reporting the single worst model.
            latencyMs: totalInv > 0 ? (prev.latencyMs * prev.invocations + m.avg_latency_ms * m.invocations) / totalInv : 0,
            errorPct: totalInv > 0 ? (prev.errorPct * prev.invocations + m.error_rate_pct * m.invocations) / totalInv : 0,
          });
        }
      }
    }
    // There is deliberately NO 'bedrock' entry.
    //
    // This used to be `map.set('bedrock', { invocations: total_invocations, ... })` — the
    // whole account's fleet total — described as a "whole-fleet fallback for agents with no
    // specific model". But every live discovered agent is mapped with `model: 'bedrock'`
    // (see discoveredAgentToAgent in useAgentRegistry.ts), so that fallback put the ENTIRE
    // account's invocation count into the per-agent Invocations column of every one of them.
    // With 36 discovered agents and only 3 emitting real AgentCore telemetry, 33 rows all
    // showed the same number, which reads as a per-agent measurement repeated 33 times.
    // The tooltip mislabelled it a second way, calling a cross-model fleet total
    // "invocations for the bedrock model".
    //
    // Agents with no per-agent metric now fall through to the "not measured" marker that
    // already exists in the invocations cell, which is the honest state: classic Bedrock
    // Agents do not publish to AWS/Bedrock-AgentCore at all. The per-keyword entries above
    // stay — they are a real model-level figure for an agent pinned to a specific model,
    // and the cell labels those `~<model>` rather than as the agent's own.
    return map;
  }, [liveModelMetrics]);

  // Real PER-AGENT runtime metrics (CloudWatch AWS/Bedrock-AgentCore), keyed by
  // runtime name. Only agents with actual traffic emit these — the rest fall back
  // to the model-level number below. This is genuine per-agent telemetry.
  const [agentMetrics, setAgentMetrics] = useState<Record<string, { invocations: number; latencyMs: number; errors: number }>>({});
  useEffect(() => {
    let cancelled = false;
    governAgentCoreApi.agentMetrics(30)
      .then(r => {
        if (cancelled || !r.live) return;
        const m: Record<string, { invocations: number; latencyMs: number; errors: number }> = {};
        for (const a of r.by_agent) m[a.runtime_name.toLowerCase()] = { invocations: a.invocations, latencyMs: a.avg_latency_ms, errors: a.errors };
        setAgentMetrics(m);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Normalized registry row. `provider` / `governanceStatus` / `riskScore` are optional on
  // AgentRegistryEntry; we always resolve them here so every consumer sees one shape.
  // `isDemo` and `invocationsKnown` are the honesty flags the KPIs and table depend on.
  const awsAgents = useMemo<RegistryRow[]>(() => agentRegistry.agents.map(a => {
    // Derive a 0-100 risk score from the agent's actual scope and incident posture
    // (canonical scale: 0-24 Low / 25-49 Medium / 50-74 High / 75+ Critical) rather
    // than a flat constant, so agents don't all show an identical score.
    const scopeContribution = ((a.scopeLevel ?? 1) - 1) * 15; // 0,15,30,45
    const openIncidentContribution = (a.incidents?.openCount ?? 0) * 12;
    const recentIncidentContribution = Math.min((a.incidents?.count90d ?? 0) * 4, 16);
    const riskScore = Math.max(8, Math.min(100, scopeContribution + openIncidentContribution + recentIncidentContribution + 8));

    const isDemo = !liveAgentIds.has(a.id);
    const evidence = tagEvidenceFor(a.id, tagEvidenceByResourceId);
    const perAgentMetric = agentMetrics[(a.name ?? '').toLowerCase()];

    return {
      ...a,
      // The 6 AGENT_REGISTRY demo entries carry no `provider`, so this fallback is what
      // used to push them into the AWS bucket. They keep 'aws' for table display (they
      // model AWS-hosted agents) but `isDemo` keeps them out of every live rollup.
      provider: a.provider ?? ('aws' as AgentProvider),
      governanceStatus: deriveGovernanceStatus(a, evidence),
      riskScore,
      isDemo,
      tagEvidence: evidence,
      // Real CloudWatch AgentCore telemetry wins over the mapper's placeholder zero.
      // Only invocations are substituted: the endpoint reports avg_latency_ms, which is
      // not a p95, so p95LatencyMs is deliberately left alone rather than mislabelled.
      metrics: perAgentMetric && !isDemo
        ? { ...a.metrics, invocations30d: perAgentMetric.invocations }
        : a.metrics,
      // Honesty: every live mapper in useAgentRegistry hardcodes invocations30d: 0, so a
      // zero there means "not measured", not "idle". Only claim the count is known when
      // the entry is seeded demo data (where the number IS the data) or when real
      // per-agent CloudWatch AgentCore telemetry exists for it.
      invocationsKnown: isDemo || !!perAgentMetric,
    };
  }), [agentRegistry.agents, liveAgentIds, tagEvidenceByResourceId, agentMetrics]);

  const allAgents = useMemo<RegistryRow[]>(
    () => [...awsAgents, ...EXTERNAL_AGENTS.map(normalizeDemoRow)],
    [awsAgents],
  );

  // Live-only headline list. `agentRegistry.source` can never be 'live' in practice (the
  // hook always appends demo agents when any live data exists), so gate on !== 'demo' and
  // disclose the real live/demo split rather than claiming a fully live fleet.
  const kpiIsLiveOnly = agentRegistry.source !== 'demo';
  const liveOnlyAgents = useMemo<RegistryRow[]>(
    () => awsAgents.filter(a => !a.isDemo),
    [awsAgents],
  );
  const kpiAgents = kpiIsLiveOnly ? liveOnlyAgents : allAgents;

  // Live MCP servers: AgentCore gateways (MCP protocol) joined with the Build MCP
  // catalog (already fetched by useAgentRegistry). Gate the MCP tab on real data.
  const [mcpGateways, setMcpGateways] = useState<AwsGateway[]>([]);
  const [mcpGatewaysLive, setMcpGatewaysLive] = useState(false);
  useEffect(() => {
    let cancelled = false;
    governAgentCoreApi.gateways()
      .then(r => {
        if (cancelled) return;
        setMcpGateways(r.gateways || []);
        setMcpGatewaysLive(!!r.live);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const buildMcpServers = agentRegistry.buildMcpServers;
  // Live when AgentCore reports live gateways or the Build catalog returned servers.
  const mcpLive = mcpGatewaysLive || buildMcpServers.length > 0;
  const mcpCards = useMemo<McpCard[]>(() => {
    if (!mcpLive) {
      return MCP_SERVER_REGISTRY.map((s): McpCard => ({
        id: s.id,
        name: s.name,
        endpoint: s.endpoint,
        status: normMcpStatus(s.status),
        toolCount: s.toolCount,
        authMethod: s.authMethod,
        owner: s.owner,
        checked: s.lastHealthCheck,
        uptime30d: s.uptime30d,
        avgLatencyMs: s.avgLatencyMs,
      }));
    }
    const fromGateways = mcpGateways.map((g): McpCard => ({
      id: g.gateway_id,
      name: g.name,
      endpoint: g.protocol_type ? `${g.protocol_type} gateway` : g.gateway_id,
      status: normMcpStatus(g.status),
      toolCount: null,
      authMethod: g.authorization_type ?? 'IAM',
      owner: 'AgentCore Gateway',
      checked: (g.updated_at ?? g.created_at ?? '').slice(0, 10),
      uptime30d: null,
      avgLatencyMs: null,
    }));
    const fromBuild = buildMcpServers.map((s): McpCard => ({
      id: `build-${s.server_id}`,
      name: s.name,
      endpoint: s.url ?? s.transport,
      status: normMcpStatus(s.status),
      toolCount: (s.capabilities ?? []).length,
      authMethod: s.transport,
      owner: 'Build Catalog',
      checked: (s.updated_at ?? s.created_at ?? '').slice(0, 10),
      uptime30d: null,
      avgLatencyMs: null,
    }));
    return [...fromGateways, ...fromBuild];
  }, [mcpLive, mcpGateways, buildMcpServers]);

  // Prefer real per-agent metrics (matched by name); else model-level fallback.
  const liveMetricsFor = (a: { provider?: AgentProvider; model?: string; name?: string }) => {
    if (a.provider !== 'aws') return undefined;
    const pa = a.name ? agentMetrics[a.name.toLowerCase()] : undefined;
    if (pa) return { invocations: pa.invocations, latencyMs: pa.latencyMs, errorPct: pa.invocations > 0 ? +(pa.errors / pa.invocations * 100).toFixed(2) : 0, perAgent: true };
    const ml = metricsLive ? modelMetricsByKeyword.get((a.model || '').toLowerCase()) : undefined;
    return ml ? { ...ml, perAgent: false } : undefined;
  };

  // Helper to determine if an agent needs attention
  const agentNeedsAttention = (a: RegistryRow) => {
    const isOwnerless = !a.owner || a.owner === 'Unknown' || a.owner === 'Unassigned' || a.owner === '';
    // Honesty: invocations30d is a hardcoded 0 for every live-mapped agent, so treating
    // that zero as "idle" would mark the whole discovered fleet inactive. Only assert
    // inactivity when the invocation count was actually measured.
    const isInactive = a.invocationsKnown && a.metrics.invocations30d === 0 && a.status === 'production';
    const isHighRisk = (a.riskScore ?? 0) >= 75 || a.incidents.openCount > 0;
    const needsReview = a.governanceStatus === 'review_needed' || a.governanceStatus === 'blocked';
    return { isOwnerless, isInactive, isHighRisk, needsReview, needsAttention: isOwnerless || isInactive || isHighRisk || needsReview };
  };

  const filteredAgents = useMemo(() => allAgents.filter(a => {
    const statusOk = statusFilter === 'all' || a.status === statusFilter;
    const providerOk = providerFilter === 'all' || a.provider === providerFilter;
    const q = search.toLowerCase();
    const searchOk = !q || a.name.toLowerCase().includes(q) || a.owner.toLowerCase().includes(q) || a.businessPurpose.toLowerCase().includes(q);

    // Attention filter
    const attention = agentNeedsAttention(a);
    const attentionOk = attentionFilter === 'all' ||
      (attentionFilter === 'needs-attention' && attention.needsAttention) ||
      (attentionFilter === 'ownerless' && attention.isOwnerless) ||
      (attentionFilter === 'inactive' && attention.isInactive) ||
      (attentionFilter === 'high-risk' && attention.isHighRisk);

    return statusOk && providerOk && searchOk && attentionOk;
  }), [allAgents, search, statusFilter, providerFilter, attentionFilter]);

  // Attention counts, twice over — deliberately, because they answer two questions:
  //  • kpiAttention   — headline KPI card, live-only so demo rows can't inflate it
  //  • tableAttention — the filter chips, which must match the rows the table renders
  //                     (the table intentionally shows live + demo)
  const countAttention = (list: RegistryRow[]) => {
    let ownerless = 0, inactive = 0, highRisk = 0, total = 0;
    list.forEach(a => {
      const attn = agentNeedsAttention(a);
      if (attn.isOwnerless) ownerless++;
      if (attn.isInactive) inactive++;
      if (attn.isHighRisk) highRisk++;
      if (attn.needsAttention) total++;
    });
    return { ownerless, inactive, highRisk, total };
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const kpiAttention = useMemo(() => countAttention(kpiAgents), [kpiAgents]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const tableAttention = useMemo(() => countAttention(allAgents), [allAgents]);

  // ── Headline KPIs — computed over the LIVE-ONLY list whenever live data exists, so the
  // 6 AGENT_REGISTRY + 11 EXTERNAL_AGENTS demo entries can no longer inflate them. The
  // agent table below still renders every row (live + demo, demo rows badged), and
  // `registryTotal` is what those table-scoped counters use.
  const registryTotal = allAgents.length;
  const registryExternalCount = EXTERNAL_AGENTS.length;
  const totalAgents = kpiAgents.length;
  const awsAgentCount = kpiAgents.filter(a => a.provider === 'aws').length;
  const externalAgentCount = kpiAgents.filter(a => a.provider !== 'aws').length;
  // Number of seeded rows kept out of the KPIs above (real numbers from the hook).
  const kpiExcludedDemoCount = kpiIsLiveOnly ? agentRegistry.demoCount + registryExternalCount : 0;
  const inProduction = kpiAgents.filter(a => a.status === 'production').length;
  const openIncidents = kpiAgents.reduce((s, a) => s + a.incidents.openCount, 0);
  const highScope = kpiAgents.filter(a => a.scopeLevel >= 3).length;
  // Agents whose invocation count was never measured — surfaced so an "0 inactive"
  // reading is not mistaken for "everything is busy".
  const invocationsUnmeasured = kpiAgents.filter(a => !a.invocationsKnown).length;
  // Cedar policy coverage from Secure (live when bound, demo fallback otherwise).
  const policyKnown = policies.loaded; // data available (live or demo)
  const policyIsLive = policies.source === 'live';
  const agentDataSource = agentRegistry.source;
  // Governance posture is real for any agent that joined a tagged AI-estate resource.
  const governanceEvidenceLive = tagsLive && kpiAgents.some(a => a.tagEvidence);

  // Provider breakdown — live-only for the headline number, plus the full-registry counts
  // so the provider filter chips stay usable for demo-only providers (annotated as demo).
  const emptyProviderCounts = (): Record<AgentProvider, number> =>
    ({ aws: 0, azure: 0, gcp: 0, servicenow: 0, salesforce: 0, copilot_studio: 0, custom: 0 });
  const providerCounts = useMemo(() => {
    const counts = emptyProviderCounts();
    kpiAgents.forEach(a => { counts[a.provider]++; });
    return counts;
  }, [kpiAgents]);
  const providerCountsAll = useMemo(() => {
    const counts = emptyProviderCounts();
    allAgents.forEach(a => { counts[a.provider]++; });
    return counts;
  }, [allAgents]);

  // Governance status breakdown (live-only when live data exists).
  const governanceBreakdown = useMemo(() => {
    const compliant = kpiAgents.filter(a => a.governanceStatus === 'compliant').length;
    const reviewNeeded = kpiAgents.filter(a => a.governanceStatus === 'review_needed').length;
    const blocked = kpiAgents.filter(a => a.governanceStatus === 'blocked').length;
    const unknown = kpiAgents.filter(a => a.governanceStatus === 'unknown').length;
    return { compliant, reviewNeeded, blocked, unknown };
  }, [kpiAgents]);

  return (
    <GovernPageLayout
      title="Agent Registry"
      description="One inventory for every agent — AWS, Azure, GCP, ServiceNow, Salesforce, and more, with identity, ownership, and governance status."
      badge={
        <>
          <CoreBadge pillar="see" />
          {agentDataSource === 'live' ? <LiveDataBadge /> : agentDataSource === 'mixed' ? (
            <span className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded bg-sky-50 text-sky-600 border border-sky-200">
              <span className="w-1 h-1 rounded-full bg-sky-400" />
              Hybrid
            </span>
          ) : <MockDataBadge integration="AWS Bedrock AgentCore" />}
        </>
      }
      actions={
        <>
          {/* Registry-wide counts (these describe the table, which shows live + demo rows).
              The headline KPI cards below are live-only — see kpiAgents. */}
          <span
            className="text-xs px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-medium"
            title={`${agentRegistry.liveCount} live-discovered + ${agentRegistry.demoCount + registryExternalCount} demo rows in the registry table`}
          >
            {registryTotal} agents
          </span>
          {agentRegistry.liveCount > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium">
              {agentRegistry.liveCount} live
            </span>
          )}
          {registryExternalCount > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 font-medium">
              {registryExternalCount} external
            </span>
          )}
          <Link to="/govern/fleet" className="text-xs text-purple-600 hover:text-purple-700 font-medium">
            Fleet Overview →
          </Link>
          <button
            onClick={() => setImportDrawerOpen(true)}
            className="relative inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-white bg-amber-600 hover:bg-amber-700 rounded-lg transition-colors shadow-sm"
          >
            <Icon name="shield-check" className="w-4 h-4" />
            Import from Security Hub
            {securityHubInventory.unregisteredCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 inline-flex items-center justify-center w-5 h-5 text-[10px] font-bold text-white bg-rose-500 rounded-full">
                {securityHubInventory.unregisteredCount}
              </span>
            )}
          </button>
        </>
      }
    >

        {/* How to Use + Go Live — only for tabs whose embedded component does NOT
            render its own guides (human-oversight, a2a, evaluations are
            standalone components that bring their own). */}
        {!['human-oversight', 'a2a', 'evaluations', 'fleet-scale'].includes(tab) && (
          <UnifiedGuide {...AGENT_REGISTRY_GUIDE} />
        )}

        {/* KPIs - hide when on tabs with their own metrics */}
        {!['human-oversight', 'a2a', 'evaluations', 'fleet-scale'].includes(tab) && (
          <>
            {/* Provider summary bar — the bold number is the LIVE count for that provider;
                any seeded rows are shown separately as "+N demo" so the pill never passes
                demo agents off as discovered inventory. Pills are still rendered for
                demo-only providers so the table's provider filter stays usable. */}
            <div className="flex items-center gap-2 mb-4 flex-wrap">
              <span className="text-xs font-medium text-slate-500 uppercase">Providers:</span>
              {(Object.keys(providerCountsAll) as AgentProvider[])
                .filter(p => providerCountsAll[p] > 0)
                .map(provider => {
                  const config = AGENT_PROVIDER_CONFIG[provider];
                  const live = providerCounts[provider];
                  const demo = providerCountsAll[provider] - live;
                  return (
                    <button
                      key={provider}
                      onClick={() => setProviderFilter(providerFilter === provider ? 'all' : provider)}
                      title={`${live} live-discovered${demo > 0 ? ` · ${demo} demo` : ''} ${config.label} agent(s)`}
                      className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium transition-all ${
                        providerFilter === provider
                          ? 'ring-2 ring-offset-1'
                          : 'hover:opacity-80'
                      }`}
                      style={{
                        backgroundColor: `${config.color}15`,
                        color: config.color,
                        ...(providerFilter === provider ? { ringColor: config.color } : {}),
                      }}
                    >
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: config.color }} />
                      {config.label}
                      <span className="font-bold">{live}</span>
                      {demo > 0 && (
                        <span className="text-[10px] font-medium text-amber-600 bg-amber-50 border border-dashed border-amber-300 rounded px-1">
                          +{demo} demo
                        </span>
                      )}
                    </button>
                  );
                })}
              {providerFilter !== 'all' && (
                <button
                  onClick={() => setProviderFilter('all')}
                  className="text-xs text-slate-500 hover:text-slate-700 underline"
                >
                  Clear filter
                </button>
              )}
            </div>

            {/* Scope disclosure for every KPI card below. */}
            <div className="flex items-center gap-2 mb-2 text-[11px] text-slate-500">
              {kpiIsLiveOnly ? (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span>
                    KPIs below cover the <span className="font-semibold text-slate-700">{agentRegistry.liveCount}</span> live-discovered
                    agents only. {kpiExcludedDemoCount} demo agent{kpiExcludedDemoCount !== 1 ? 's' : ''} (seeded AWS + other-provider
                    examples) are excluded from every number, but still appear in the table below marked
                    <span className="mx-1 text-[9px] px-1 py-0.5 rounded bg-amber-50 text-amber-600 border border-dashed border-amber-300">Demo</span>.
                  </span>
                </>
              ) : (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 border border-dashed border-amber-500" />
                  <span>No live agents discovered — every KPI below is seeded demo data.</span>
                </>
              )}
            </div>

            {/* Seven KPIs, so lg:grid-cols-6 left a single orphan card wrapping onto a second
                row. Seven columns keeps the hero on one line; the provenance badge moved to
                the foot of each card (see below) because sharing the label row with it forced
                "Total Agents", "In Production" and "Review Needed" to wrap mid-label. */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2.5 mb-6">
              {([
                {
                  label: 'Total Agents',
                  value: totalAgents,
                  sub: kpiIsLiveOnly
                    ? `${awsAgentCount} AWS discovered · ${kpiExcludedDemoCount} demo excluded`
                    : `${awsAgentCount} AWS · ${externalAgentCount} external`,
                  badge: kpiIsLiveOnly
                    ? <LiveDataBadge source="Bedrock + AgentCore" detail="Live agent inventory from bedrock-agent:ListAgents + bedrock-agentcore:ListAgentRuntimes" />
                    : <MockDataBadge integration="AWS Bedrock AgentCore" />,
                },
                {
                  label: 'In Production',
                  value: inProduction,
                  sub: totalAgents > 0 ? `${Math.round((inProduction / totalAgents) * 100)}% of ${kpiIsLiveOnly ? 'live fleet' : 'fleet'}` : 'no agents',
                  badge: kpiIsLiveOnly
                    ? <LiveDataBadge source="Bedrock + AgentCore" detail="Derived from each agent's real AWS status (PREPARED / READY / ACTIVE)" />
                    : <MockDataBadge integration="AWS Bedrock AgentCore" />,
                },
                {
                  label: 'Compliant',
                  value: governanceBreakdown.compliant,
                  sub: totalAgents > 0 ? `${Math.round((governanceBreakdown.compliant / totalAgents) * 100)}% governed · ${governanceBreakdown.unknown} unknown` : 'no agents',
                  color: 'emerald',
                  // Now REAL for any agent that joins a tagged AI-estate resource: compliant =
                  // ResourceGroupsTaggingAPI says the resource carries a governance tag AND an
                  // owner tag. Gate the badge on the resource-tags call's own `live` flag, and
                  // only claim Live when at least one agent actually joined evidence.
                  badge: governanceEvidenceLive
                    ? <LiveDataBadge source="Resource Groups Tagging" detail="Real governance-tag evidence (GetResources): governance tag + owner tag present on the agent's own AWS resource" />
                    : <MockDataBadge integration="AWS Resource Groups Tagging (GetResources)" />,
                },
                {
                  label: 'Review Needed',
                  value: governanceBreakdown.reviewNeeded,
                  sub: governanceBreakdown.reviewNeeded > 0 ? 'missing owner/scope tags or open incident' : 'all reviewed',
                  color: governanceBreakdown.reviewNeeded > 0 ? 'amber' : undefined,
                  badge: governanceEvidenceLive
                    ? <LiveDataBadge source="Resource Groups Tagging" detail="Agent is present in the tagged AI estate but its governance tags are incomplete, or it has an open incident" />
                    : <MockDataBadge integration="AWS Resource Groups Tagging (GetResources)" />,
                },
                {
                  label: 'High-Scope (L3+)',
                  value: highScope,
                  sub: `${openIncidents} open incident${openIncidents !== 1 ? 's' : ''}`,
                  // No AWS API exposes an agent's autonomy scope or its incident history, so
                  // useAgentRegistry's live mapper hardcodes scopeLevel: 3 and zero incidents.
                  // On a live-only fleet that makes this card a constant, not a measurement.
                  badge: <MockDataBadge integration="No AWS API exposes agent autonomy scope or incident history — live agents default to L3 with zero incidents" />,
                },
                {
                  label: 'Blocked',
                  value: governanceBreakdown.blocked,
                  sub: governanceBreakdown.blocked > 0 ? 'governance violations' : 'no live source',
                  color: governanceBreakdown.blocked > 0 ? 'rose' : undefined,
                  // 'blocked' is the one governance state with NO real AWS source. Seeded demo
                  // agents are its only origin, so on a live-only fleet this is always 0 — say so
                  // rather than letting a zero read as "nothing is blocked" evidence.
                  badge: <MockDataBadge integration="No AWS API attests a blocked agent — demo agents are the only source" />,
                },
                {
                  label: 'Needs Attention',
                  value: kpiAttention.total,
                  sub: `${kpiAttention.ownerless} ownerless · ${kpiAttention.inactive} inactive${invocationsUnmeasured > 0 ? ` · ${invocationsUnmeasured} unmeasured` : ''}`,
                  color: kpiAttention.total > 0 ? 'orange' : undefined,
                  // Mixed derivation: the review-needed component is real (resource tags) and
                  // 'inactive' is real for the agents CloudWatch actually measured, but the
                  // live mapper stamps every discovered agent with owner 'AWS Account', so
                  // "0 ownerless" is an absent signal rather than a clean bill of health.
                  badge: <MockDataBadge integration="Ownership is not discoverable from the agent APIs — live agents are stamped 'AWS Account', so the ownerless count is not measured" />,
                  onClick: () => setAttentionFilter(attentionFilter === 'needs-attention' ? 'all' : 'needs-attention'),
                },
              ] as Array<{
                label: string;
                value: number;
                sub: string;
                color?: string;
                badge?: ReactNode;
                onClick?: () => void;
              }>).map(k => {
                const isClickable = !!k.onClick;
                const CardWrapper = isClickable ? 'button' : 'div';
                return (
                  <CardWrapper
                    key={k.label}
                    onClick={k.onClick}
                    className={`bg-white/80 backdrop-blur-sm rounded-xl border shadow-sm p-3.5 border-slate-200/60 text-left flex flex-col ${
                      isClickable ? 'cursor-pointer hover:border-slate-300 hover:shadow-md transition-all' : ''
                    } ${
                      isClickable && attentionFilter === 'needs-attention' ? 'ring-2 ring-orange-400 border-orange-300' : ''
                    }`}
                  >
                    <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">
                      {k.label}
                    </div>
                    <div className={`text-2xl font-semibold mt-1 ${
                      k.color === 'emerald' ? 'text-emerald-600' :
                      k.color === 'amber' ? 'text-amber-600' :
                      k.color === 'rose' ? 'text-rose-600' :
                      k.color === 'orange' ? 'text-orange-600' :
                      'text-slate-900'
                    }`}>{k.value}</div>
                    <div className="text-[11px] text-slate-400 mt-0.5">{k.sub}</div>
                    {/* Provenance sits at the foot of the card. `mt-auto` pins it to the
                        bottom so the badges line up across the row even though the `sub`
                        strings wrap to different heights. */}
                    {k.badge && <div className="mt-auto pt-2">{k.badge}</div>}
                  </CardWrapper>
                );
              })}
            </div>
          </>
        )}

        {/* Tab switcher */}
        <GovernTabs
          tabs={TABS}
          activeTab={tab}
          onTabChange={(tabId) => handleTabChange(tabId as TabId)}
          ariaLabel="Agent Registry sections"
        />

        {/* ─────────── Agents tab ─────────── */}
        {tab === 'agents' && (
          <>
            {/* Inventory connectors — one registry, every provider (governance/inventory step 1) */}
            <InventoryConnectorsCard agents={allAgents} awsLive={awsConnected || agentRegistry.source !== 'demo'} />

            {/* Live AgentCore control-plane posture — gateways/memories/identities/policy/KBs */}
            <AgentCorePostureCard />

            <div className="flex flex-wrap items-center gap-3 mb-4">
              <input
                type="text"
                aria-label="Search agents, owners, purpose"
                placeholder="Search agents, owners, purpose..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="flex-1 min-w-[240px] py-2 px-3 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:border-slate-400"
              />
              {/* Attention filters — these counts are TABLE-scoped (live + demo) so a chip
                  count always equals the number of rows the chip will show. The headline
                  "Needs Attention" KPI above is live-only; the two are meant to differ. */}
              <div className="flex gap-1">
                {([
                  { id: 'all', label: 'All', count: null, color: undefined },
                  { id: 'needs-attention', label: 'Needs Attention', count: tableAttention.total, color: 'orange' },
                  { id: 'ownerless', label: 'Ownerless', count: tableAttention.ownerless, color: 'rose' },
                  { id: 'inactive', label: 'Inactive', count: tableAttention.inactive, color: 'amber' },
                  { id: 'high-risk', label: 'High Risk', count: tableAttention.highRisk, color: 'red' },
                ] as const).map(f => (
                  <button
                    key={f.id}
                    onClick={() => setAttentionFilter(f.id)}
                    className={`px-2 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1 ${
                      attentionFilter === f.id
                        ? f.color === 'orange' ? 'bg-orange-600 text-white'
                          : f.color === 'rose' ? 'bg-rose-600 text-white'
                          : f.color === 'amber' ? 'bg-amber-600 text-white'
                          : f.color === 'red' ? 'bg-red-600 text-white'
                          : 'bg-slate-900 text-white'
                        : 'bg-white text-slate-500 border border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    {f.label}
                    {f.count !== null && f.count > 0 && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                        attentionFilter === f.id ? 'bg-white/20' : 'bg-slate-100'
                      }`}>
                        {f.count}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {/* Status filters */}
              <div className="flex gap-1">
                {(['all', 'production', 'pilot', 'development'] as const).map(s => (
                  <button
                    key={s}
                    onClick={() => setStatusFilter(s)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition capitalize ${
                      statusFilter === s ? 'bg-slate-900 text-white' : 'bg-white text-slate-500 border border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    {s === 'all' ? 'All statuses' : s}
                  </button>
                ))}
              </div>
            </div>

            {metricsLive && (
              <div className="flex items-center gap-2 mb-2 text-[11px] text-slate-500">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Invocations marked <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 align-middle" /> are live model-level counts from CloudWatch AWS/Bedrock (shared by all agents on that model) — not yet per-agent telemetry.
              </div>
            )}
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden mb-6">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[11px] text-slate-400 uppercase tracking-wide bg-slate-50/50">
                    <th scope="col" className="text-left py-2.5 px-4 font-medium">Agent</th>
                    <th scope="col" className="text-center py-2.5 px-2 font-medium">Provider</th>
                    <th scope="col" className="text-left py-2.5 px-2 font-medium">Owner</th>
                    <th scope="col" className="text-center py-2.5 px-2 font-medium">Scope</th>
                    <th scope="col" className="text-center py-2.5 px-2 font-medium">Governance</th>
                    <th scope="col" className="text-right py-2.5 px-2 font-medium">Invocations</th>
                    <th scope="col" className="text-center py-2.5 px-2 font-medium">Incidents</th>
                    <th scope="col" className="text-left py-2.5 px-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAgents.map(a => {
                    // Honesty gate: only genuine running runtimes (real AVA deployments
                    // + AWS-discovered agents, id prefix 'live-') earn the pulsing "Live"
                    // badge. Frontier-catalog ('frontier-') and Build-definition ('build-')
                    // rows are non-runtime with zeroed metrics, so they must not claim Live.
                    const isLive = a.id.startsWith('live-');
                    const providerConfig = a.provider ? AGENT_PROVIDER_CONFIG[a.provider] : null;
                    const govStatus = a.governanceStatus || 'unknown';
                    return (
                    <tr key={a.id} {...rowButtonProps(() => setOpenAgent(a.id), `View ${a.name} details`)} className="border-t border-slate-100 hover:bg-slate-50/60 cursor-pointer transition-colors focus:outline-none focus:bg-blue-50/50">
                      <td className="py-2.5 px-4">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-900">{a.name}</span>
                          {isLive && (
                            <span className="inline-flex items-center gap-0.5 text-[8px] px-1 py-0.5 rounded bg-emerald-50 text-emerald-600 border border-emerald-200">
                              <span className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" />
                              Live
                            </span>
                          )}
                          {a.externalId && (
                            <span className="text-[8px] px-1 py-0.5 rounded bg-purple-50 text-purple-600 border border-purple-200">
                              External
                            </span>
                          )}
                          {/* Per-row demo indicator. Previously the 6 seeded AGENT_REGISTRY
                              rows carried NO marker at all (no 'live-' prefix, no externalId),
                              so they were indistinguishable from discovered agents. */}
                          {a.isDemo && (
                            <span
                              className="text-[8px] px-1 py-0.5 rounded bg-amber-50 text-amber-600 border border-dashed border-amber-300 cursor-help"
                              title="Seeded demo agent — excluded from every headline KPI above"
                            >
                              Demo
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-400">{a.framework} · {a.version}</div>
                      </td>
                      <td className="py-2.5 px-2 text-center">
                        {providerConfig && (
                          <span
                            className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full"
                            style={{ backgroundColor: `${providerConfig.color}15`, color: providerConfig.color }}
                          >
                            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: providerConfig.color }} />
                            {providerConfig.label}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-2 text-xs">
                        {agentNeedsAttention(a).isOwnerless ? (
                          <span className="inline-flex items-center gap-1 text-rose-600">
                            <Icon name="exclamation-triangle" className="w-3.5 h-3.5" />
                            <span className="font-medium">Ownerless</span>
                          </span>
                        ) : (
                          <span className="text-slate-700">{a.owner}</span>
                        )}
                      </td>
                      <td className="py-2.5 px-2 text-center"><ScopeBadge level={a.scopeLevel} /></td>
                      <td className="py-2.5 px-2 text-center">
                        <span
                          className={`text-[10px] font-semibold px-2 py-0.5 rounded capitalize ${
                            govStatus === 'compliant' ? 'bg-emerald-50 text-emerald-700' :
                            govStatus === 'review_needed' ? 'bg-amber-50 text-amber-700' :
                            govStatus === 'blocked' ? 'bg-rose-50 text-rose-700' :
                            'bg-slate-100 text-slate-500'
                          } ${a.tagEvidence || a.isDemo ? 'cursor-help' : ''}`}
                          title={
                            a.isDemo
                              ? 'Seeded demo agent — governance status is authored, not measured.'
                              : a.tagEvidence
                                ? `Derived from real AWS tags (ResourceGroupsTaggingAPI GetResources) on ${a.tagEvidence.service}/${a.tagEvidence.resource_type ?? 'resource'}: governance tag ${a.tagEvidence.governed ? 'present' : 'missing'}, owner tag ${a.tagEvidence.has_owner ? 'present' : 'missing'}, scope tag ${a.tagEvidence.has_scope ? 'present' : 'missing'}.`
                                : 'Not joinable to any tagged AI-estate resource — governance posture genuinely unknown.'
                          }
                        >
                          {govStatus === 'review_needed' ? 'Review' : govStatus}
                        </span>
                      </td>
                      <td className="py-2.5 px-2 text-right text-slate-700 tabular-nums text-xs">
                        {(() => {
                          const lm = liveMetricsFor(a);
                          if (lm && lm.invocations > 0) {
                            const lat = lm.latencyMs >= 1000 ? (lm.latencyMs / 1000).toFixed(1) + 's' : Math.round(lm.latencyMs) + 'ms';
                            const title = lm.perAgent
                              ? `Live per-agent (CloudWatch AgentCore): ${lm.invocations.toLocaleString()} invocations, ${lat} avg latency, ${lm.errorPct}% errors — this agent specifically.`
                              : `NOT this agent's own figure. This is the model-level total for ${a.model} from CloudWatch: ${lm.invocations.toLocaleString()} invocations, ${lat} avg latency, ${lm.errorPct}% errors, summed across every caller of that model. Every agent pinned to ${a.model} shows the same number — no AWS metric attributes model invocations to an individual agent.`;
                            return (
                              <span className="inline-flex items-center gap-1" title={title}>
                                <span className={`w-1 h-1 rounded-full ${lm.perAgent ? 'bg-emerald-500' : 'bg-emerald-400'}`} />
                                {lm.invocations.toLocaleString()}
                                <span className="text-[8px] text-slate-400">{lm.perAgent ? 'per-agent' : `~${a.model}`}</span>
                              </span>
                            );
                          }
                          // No measurement for this agent. A bare "0" would read as
                          // "idle"; it actually means "never measured", so say that.
                          if (!a.invocationsKnown) {
                            return (
                              <span
                                className="text-slate-300 cursor-help"
                                title="No CloudWatch AgentCore invocation metric exists for this agent (classic Bedrock Agents do not publish to AWS/Bedrock-AgentCore at all). Not measured, not necessarily idle."
                              >
                                —
                              </span>
                            );
                          }
                          return a.metrics.invocations30d.toLocaleString();
                        })()}
                      </td>
                      <td className="py-2.5 px-2 text-center">
                        {a.incidents.openCount > 0 ? (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-rose-100 text-rose-700">{a.incidents.openCount} open</span>
                        ) : (
                          <span className="text-[10px] text-slate-400">{a.incidents.count90d} / 90d</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border capitalize ${statusBg[a.status]}`}>{a.status}</span>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Results summary */}
            <div className="text-xs text-slate-500 mb-6">
              Showing {filteredAgents.length} of {registryTotal} agents
              {providerFilter !== 'all' && ` (filtered by ${AGENT_PROVIDER_CONFIG[providerFilter].label})`}
              {statusFilter !== 'all' && ` · ${statusFilter} only`}
            </div>
          </>
        )}

        {/* ─────────── Registry at Scale tab ─────────── */}
        {tab === 'fleet-scale' && (
          <div className="space-y-4">
            <div className="flex items-center gap-4 text-xs">
              <label className="flex items-center gap-2 text-slate-600">
                <input
                  type="checkbox"
                  checked={useRealFleetData}
                  onChange={e => setUseRealFleetData(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                Use real registry data
              </label>
              {registryTotal > 50 && !useRealFleetData && (
                <span className="text-amber-600">
                  Your registry has {registryTotal} agents — consider enabling real data mode
                </span>
              )}
            </div>
            <FleetScaleView variant="registry" useRealData={useRealFleetData} />
          </div>
        )}

        {/* ─────────── Attack Surface tab ─────────── */}
        {tab === 'attack-surface' && <AttackSurfaceView agents={allAgents} />}

        {/* ─────────── Tools tab ─────────── */}
        {tab === 'tools' && (
          <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden mb-6">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] text-slate-400 uppercase tracking-wide bg-slate-50/50">
                  <th scope="col" className="text-left py-2.5 px-5 font-medium">Tool</th>
                  <th scope="col" className="text-center py-2.5 px-3 font-medium">Access</th>
                  <th scope="col" className="text-center py-2.5 px-3 font-medium">Risk</th>
                  <th scope="col" className="text-left py-2.5 px-3 font-medium">Owner</th>
                  <th scope="col" className="text-left py-2.5 px-3 font-medium">MCP Server</th>
                  <th scope="col" className="text-center py-2.5 px-3 font-medium">Authorized Agents</th>
                  <th scope="col" className="text-center py-2.5 px-3 font-medium">Human Approval</th>
                  <th scope="col" className="text-left py-2.5 px-5 font-medium">Data Domains</th>
                </tr>
              </thead>
              <tbody>
                {TOOL_REGISTRY.map(t => {
                  const server = MCP_SERVER_REGISTRY.find(s => s.id === t.mcpServer);
                  return (
                    <tr key={t.id} className="border-t border-slate-100 hover:bg-slate-50/60 transition-colors">
                      <td className="py-2.5 px-5">
                        <div className="font-semibold text-slate-900">{t.name}</div>
                        <div className="text-[11px] text-slate-400">{t.description}</div>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded capitalize ${
                          t.type === 'write' ? 'bg-amber-50 text-amber-700' : t.type === 'execute' ? 'bg-rose-50 text-rose-700' : 'bg-blue-50 text-blue-700'
                        }`}>{t.type}</span>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded capitalize ${riskBg[t.riskLevel]}`}>{t.riskLevel}</span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-700">{t.owner}</td>
                      <td className="py-2.5 px-3 text-slate-600">{server?.name ?? t.mcpServer}</td>
                      <td className="py-2.5 px-3 text-center text-slate-700 tabular-nums">{t.authorizedAgents}</td>
                      <td className="py-2.5 px-3 text-center">
                        {t.requiresHumanApproval
                          ? <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-amber-100 text-amber-700">Required</span>
                          : <span className="text-[10px] text-slate-400">—</span>}
                      </td>
                      <td className="py-2.5 px-5">
                        <div className="flex flex-wrap gap-1">
                          {t.dataDomains.map(d => (
                            <span key={d} className="text-[9px] px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded">{d}</span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* ─────────── MCP Servers tab ─────────── */}
        {tab === 'mcp' && (
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-sm font-semibold text-slate-900">MCP Servers</span>
              {mcpLive
                ? <LiveDataBadge source={mcpGatewaysLive ? 'AgentCore Gateways' : 'Build Catalog'} detail="Live MCP servers from AgentCore gateways + Build registry" />
                : <MockDataBadge integration="MCP server registry" />}
            </div>
            {mcpCards.length === 0 ? (
              <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-8 text-center text-sm text-slate-400">
                No MCP servers registered.
              </div>
            ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {mcpCards.map(s => (
                <div key={s.id} className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${
                          s.status === 'operational' ? 'bg-emerald-500' : s.status === 'degraded' ? 'bg-amber-500' : s.status === 'maintenance' ? 'bg-blue-500' : 'bg-rose-500'
                        }`} />
                        <span className="text-sm font-semibold text-slate-900">{s.name}</span>
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono mt-1">{s.endpoint}</div>
                    </div>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border capitalize ${
                      s.status === 'operational' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                      s.status === 'degraded' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                      s.status === 'maintenance' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-rose-50 text-rose-700 border-rose-200'
                    }`}>{s.status}</span>
                  </div>
                  <div className="grid grid-cols-4 gap-3 mt-4">
                    <div>
                      <div className="text-[9px] text-slate-400 uppercase tracking-wide">Tools</div>
                      <div className="text-lg font-semibold text-slate-900">{s.toolCount ?? '—'}</div>
                    </div>
                    <div>
                      <div className="text-[9px] text-slate-400 uppercase tracking-wide">Uptime 30d</div>
                      <div className={`text-lg font-semibold ${s.uptime30d == null ? 'text-slate-400' : s.uptime30d >= 99.9 ? 'text-emerald-600' : s.uptime30d >= 99 ? 'text-amber-600' : 'text-rose-600'}`}>{s.uptime30d == null ? '—' : `${s.uptime30d}%`}</div>
                    </div>
                    <div>
                      <div className="text-[9px] text-slate-400 uppercase tracking-wide">Latency</div>
                      <div className="text-lg font-semibold text-slate-900">{s.avgLatencyMs == null ? '—' : <>{s.avgLatencyMs}<span className="text-[10px] text-slate-400">ms</span></>}</div>
                    </div>
                    <div>
                      <div className="text-[9px] text-slate-400 uppercase tracking-wide">Auth</div>
                      <div className="text-[11px] font-medium text-slate-700 mt-1">{s.authMethod}</div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-100">
                    <span className="text-[11px] text-slate-500">Owner: <span className="text-slate-700 font-medium">{s.owner}</span></span>
                    <span className="text-[10px] text-slate-400">{s.checked ? `Checked ${s.checked}` : ''}</span>
                  </div>
                </div>
              ))}
            </div>
            )}
          </div>
        )}

        {/* ─────────── Permissions tab ─────────── */}
        {tab === 'permissions' && (
          <PermissionsMatrix
            agents={allAgents}
            policyMap={policies.byResourceId}
            policyKnown={policyKnown}
            policyIsLive={policyIsLive}
            agentDataSource={agentDataSource}
          />
        )}

        {/* ─────────── Human Oversight tab ─────────── */}
        {tab === 'human-oversight' && <HumanOversight />}

        {/* ─────────── A2A Governance tab ─────────── */}
        {tab === 'a2a' && <A2AGovernance />}

        {tab === 'evaluations' && <AgentCoreEvaluations />}

        {/* ─────────── Providers tab ─────────── */}
        {tab === 'providers' && (
          <ProvidersTab
            agents={allAgents}
            providerCounts={providerCounts}
            providerCountsAll={providerCountsAll}
            kpiIsLiveOnly={kpiIsLiveOnly}
            excludedDemoCount={kpiExcludedDemoCount}
            awsCost={awsCost}
            governanceEvidenceLive={governanceEvidenceLive}
          />
        )}

      {/* Resolve the row here and hand it over. The drawer used to re-look-up by id via
          getAgentById, which searches the seeded AGENT_REGISTRY only — so every live row,
          whose id is `live-`/`frontier-` prefixed, resolved to undefined and the drawer
          silently refused to open. `allAgents` is the same list the table renders, so
          anything clickable resolves, and the honesty flags (isDemo, invocationsKnown) come
          along with it. */}
      <AgentDrawer
        agentId={openAgent}
        agent={openAgent ? allAgents.find(a => a.id === openAgent) ?? null : null}
        onClose={() => setOpenAgent(null)}
        policy={openAgent ? policies.byResourceId[openAgent] : undefined}
        policyLive={policyKnown}
      />

      {/* Import from Security Hub Drawer */}
      <Drawer
        open={importDrawerOpen}
        onClose={() => {
          setImportDrawerOpen(false);
          setSelectedForImport(new Set());
        }}
        title="Import from Security Hub"
        subtitle={`${securityHubInventory.unregisteredCount} AI assets discovered that are not yet registered`}
        width="lg"
      >
        <div className="space-y-4">
          {/* Summary stats */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
              <div className="text-[10px] text-slate-500 uppercase tracking-wide">Discovered</div>
              <div className="text-xl font-semibold text-slate-900">{securityHubInventory.totalDiscovered}</div>
            </div>
            <div className="bg-amber-50 rounded-lg p-3 border border-amber-100">
              <div className="text-[10px] text-amber-600 uppercase tracking-wide">Unregistered</div>
              <div className="text-xl font-semibold text-amber-700">{securityHubInventory.unregisteredCount}</div>
            </div>
            <div className="bg-rose-50 rounded-lg p-3 border border-rose-100">
              <div className="text-[10px] text-rose-600 uppercase tracking-wide">High/Critical Risk</div>
              <div className="text-xl font-semibold text-rose-700">{securityHubInventory.criticalRiskCount + securityHubInventory.highRiskCount}</div>
            </div>
          </div>

          {/* Data source indicator */}
          <div className="flex items-center gap-2 text-[11px] text-slate-500">
            <span className={`w-1.5 h-1.5 rounded-full ${securityHubInventory.isLive ? 'bg-emerald-500' : 'bg-amber-400'}`} />
            {securityHubInventory.isLive ? 'Live from AWS Security Hub' : 'Demo data (connect Security Hub for live discovery)'}
            {securityHubInventory.loading && <span className="text-slate-400">(refreshing...)</span>}
          </div>

          {/* Type breakdown */}
          {securityHubInventory.byType.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {securityHubInventory.byType.map(typeInfo => (
                <div
                  key={typeInfo.type}
                  className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-slate-100 text-xs text-slate-700"
                >
                  <Icon name={typeInfo.icon} className="w-3.5 h-3.5" />
                  {typeInfo.label}
                  <span className="font-semibold">{typeInfo.unregistered}</span>
                </div>
              ))}
            </div>
          )}

          {/* Selection controls */}
          {securityHubInventory.unregisteredAssets.length > 0 && (
            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
              <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedForImport.size === securityHubInventory.unregisteredAssets.length}
                  onChange={handleSelectAllUnregistered}
                  className="rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                />
                Select all ({securityHubInventory.unregisteredAssets.length})
              </label>
              {selectedForImport.size > 0 && (
                <span className="text-xs font-medium text-amber-600">
                  {selectedForImport.size} selected
                </span>
              )}
            </div>
          )}

          {/* Assets list */}
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {securityHubInventory.unregisteredAssets.length === 0 ? (
              <div className="text-center py-8 text-slate-500 text-sm">
                <Icon name="check-circle" className="w-8 h-8 mx-auto mb-2 text-emerald-500" />
                All discovered AI assets are registered
              </div>
            ) : (
              securityHubInventory.unregisteredAssets.map(asset => (
                <AssetImportRow
                  key={asset.id}
                  asset={asset}
                  selected={selectedForImport.has(asset.id)}
                  onToggle={() => handleToggleAssetSelection(asset.id)}
                />
              ))
            )}
          </div>

          {/* Import button */}
          {selectedForImport.size > 0 && (
            <div className="pt-4 border-t border-slate-200">
              <button
                onClick={handleImportSelected}
                className="w-full py-2.5 px-4 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <Icon name="plus" className="w-4 h-4" />
                Import {selectedForImport.size} Asset{selectedForImport.size !== 1 ? 's' : ''} to Registry
              </button>
            </div>
          )}
        </div>
      </Drawer>

      {/* Toast notification */}
      {importToast && (
        <div className={`fixed bottom-6 right-6 px-4 py-3 rounded-lg shadow-lg text-sm font-medium z-50 transition-all ${
          importToast.type === 'success' ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'
        }`}>
          {importToast.message}
        </div>
      )}

      {/* Data Source Info Panel */}
      <DataSourceInfo
        pageId="agent-registry"
        pageTitle="Agent Registry"
        sources={getPageDataSources('agent-registry')}
      />
    </GovernPageLayout>
  );
}

// ═══════════════════════════ Asset Import Row ═══════════════════════════

interface AssetImportRowProps {
  asset: SecurityHubAIAsset;
  selected: boolean;
  onToggle: () => void;
}

const ASSET_TYPE_ICONS: Record<AIAssetType, IconName> = {
  'bedrock-model': 'cube',
  'bedrock-agent': 'cpu-chip',
  'bedrock-guardrail': 'shield-check',
  'bedrock-knowledge-base': 'book-open',
  'sagemaker-endpoint': 'server-stack',
  'sagemaker-model': 'circle-stack',
};

const ASSET_TYPE_LABELS: Record<AIAssetType, string> = {
  'bedrock-model': 'Bedrock Model',
  'bedrock-agent': 'Bedrock Agent',
  'bedrock-guardrail': 'Guardrail',
  'bedrock-knowledge-base': 'Knowledge Base',
  'sagemaker-endpoint': 'SageMaker Endpoint',
  'sagemaker-model': 'SageMaker Model',
};

function AssetImportRow({ asset, selected, onToggle }: AssetImportRowProps) {
  const riskColors = {
    low: 'bg-emerald-50 text-emerald-700',
    medium: 'bg-amber-50 text-amber-700',
    high: 'bg-orange-50 text-orange-700',
    critical: 'bg-rose-50 text-rose-700',
  };

  // SecurityHubAIAsset exposes highestSeverity (CRITICAL/HIGH/MEDIUM/LOW/INFORMATIONAL),
  // not a pre-bucketed riskLevel — normalize to the 4 risk buckets, defaulting to low.
  const severityToRisk: Record<string, keyof typeof riskColors> = {
    CRITICAL: 'critical', HIGH: 'high', MEDIUM: 'medium', LOW: 'low', INFORMATIONAL: 'low',
  };
  const risk = asset.highestSeverity ? (severityToRisk[asset.highestSeverity] ?? 'low') : 'low';

  const lastSeenDate = new Date(asset.lastSeen);
  const lastSeenStr = lastSeenDate.toLocaleDateString() + ' ' + lastSeenDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <div
      className={`flex items-start gap-3 p-3 rounded-lg border transition-colors cursor-pointer ${
        selected ? 'bg-amber-50 border-amber-300' : 'bg-white border-slate-200 hover:border-slate-300'
      }`}
      onClick={onToggle}
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={onToggle}
        onClick={e => e.stopPropagation()}
        className="mt-1 rounded border-slate-300 text-amber-600 focus:ring-amber-500"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <Icon name={ASSET_TYPE_ICONS[asset.type]} className="w-4 h-4 text-slate-500" />
          <span className="font-medium text-slate-900 truncate">{asset.name}</span>
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded capitalize ${riskColors[risk]}`}>
            {risk}
          </span>
        </div>
        <div className="text-[11px] text-slate-500 mt-0.5">
          <span className="font-mono">{asset.arn.length > 60 ? asset.arn.slice(0, 60) + '...' : asset.arn}</span>
        </div>
        <div className="flex items-center gap-3 mt-1 text-[10px] text-slate-400">
          <span>{ASSET_TYPE_LABELS[asset.type]}</span>
          <span>|</span>
          <span>{asset.region}</span>
          <span>|</span>
          <span>Account: {asset.account}</span>
          <span>|</span>
          <span>Last seen: {lastSeenStr}</span>
        </div>
        {asset.findingsCount > 0 && (
          <div className="flex items-center gap-1 mt-1 text-[10px] text-rose-600">
            <Icon name="exclamation-triangle" className="w-3 h-3" />
            {asset.findingsCount} Security Hub finding{asset.findingsCount !== 1 ? 's' : ''}
          </div>
        )}
      </div>
      {/* SecurityHubAIAsset has no consoleUrl field — deep-link to the region's AWS console home. */}
      <a
        href={`https://${asset.region}.console.aws.amazon.com/`}
        target="_blank"
        rel="noopener noreferrer"
        onClick={e => e.stopPropagation()}
        className="text-slate-400 hover:text-slate-600 transition-colors"
        title="Open in AWS Console"
      >
        <Icon name="arrow-top-right-on-square" className="w-4 h-4" />
      </a>
    </div>
  );
}

// ═══════════════════════════ Providers Tab ═══════════════════════════

interface ProvidersTabProps {
  agents: RegistryRow[];
  /** Live-only provider counts (falls back to the full registry when there is no live data). */
  providerCounts: Record<AgentProvider, number>;
  /** Full-registry provider counts (live + seeded) — drives the demo annotations. */
  providerCountsAll: Record<AgentProvider, number>;
  kpiIsLiveOnly: boolean;
  excludedDemoCount: number;
  awsCost: { monthly: number; live: boolean; windowDays: number; periodStart: string; periodEnd: string } | null;
  governanceEvidenceLive: boolean;
}

function ProvidersTab({
  agents,
  providerCounts,
  providerCountsAll,
  kpiIsLiveOnly,
  excludedDemoCount,
  awsCost,
  governanceEvidenceLive,
}: ProvidersTabProps) {
  const awsCostLive = !!awsCost?.live;
  const awsCostDetail = awsCost
    ? `Cost Explorer GetCostAndUsageWithResources, ${awsCost.periodStart} to ${awsCost.periodEnd} (${awsCost.windowDays}d) normalized to 30 days`
    : undefined;

  // Calculate provider stats
  const providerStats = useMemo(() => {
    const stats: Record<AgentProvider, {
      count: number;
      demo: number;
      compliant: number;
      reviewNeeded: number;
      blocked: number;
      totalCost: number;
      costLive: boolean;
      production: number;
      pilot: number;
      development: number;
    }> = {
      aws: { count: 0, demo: 0, compliant: 0, reviewNeeded: 0, blocked: 0, totalCost: 0, costLive: false, production: 0, pilot: 0, development: 0 },
      azure: { count: 0, demo: 0, compliant: 0, reviewNeeded: 0, blocked: 0, totalCost: 0, costLive: false, production: 0, pilot: 0, development: 0 },
      gcp: { count: 0, demo: 0, compliant: 0, reviewNeeded: 0, blocked: 0, totalCost: 0, costLive: false, production: 0, pilot: 0, development: 0 },
      servicenow: { count: 0, demo: 0, compliant: 0, reviewNeeded: 0, blocked: 0, totalCost: 0, costLive: false, production: 0, pilot: 0, development: 0 },
      salesforce: { count: 0, demo: 0, compliant: 0, reviewNeeded: 0, blocked: 0, totalCost: 0, costLive: false, production: 0, pilot: 0, development: 0 },
      copilot_studio: { count: 0, demo: 0, compliant: 0, reviewNeeded: 0, blocked: 0, totalCost: 0, costLive: false, production: 0, pilot: 0, development: 0 },
      custom: { count: 0, demo: 0, compliant: 0, reviewNeeded: 0, blocked: 0, totalCost: 0, costLive: false, production: 0, pilot: 0, development: 0 },
    };

    agents.forEach(agent => {
      const provider = agent.provider || 'aws';
      stats[provider].count++;
      if (agent.isDemo) stats[provider].demo++;
      stats[provider].totalCost += agent.metrics.avgCostPerDay * 30; // Monthly cost

      // Governance status
      if (agent.governanceStatus === 'compliant') stats[provider].compliant++;
      else if (agent.governanceStatus === 'review_needed') stats[provider].reviewNeeded++;
      else if (agent.governanceStatus === 'blocked') stats[provider].blocked++;

      // Deployment status
      if (agent.status === 'production') stats[provider].production++;
      else if (agent.status === 'pilot') stats[provider].pilot++;
      else if (agent.status === 'development') stats[provider].development++;
    });

    // Real AWS spend replaces the summed per-agent estimate. Every live AWS agent
    // carries avgCostPerDay: 0 (no AWS API attributes Bedrock or AgentCore spend to an
    // individual agent id), so the sum above was funded ENTIRELY by the seeded demo
    // rows. Substitute the one figure we can actually measure: Cost Explorer
    // GetCostAndUsageWithResources over the AI estate, normalized to 30 days. This is
    // provider-level only, by design — no per-agent number is invented from it.
    if (awsCost?.live) {
      stats.aws.totalCost = awsCost.monthly;
      stats.aws.costLive = true;
    }

    return stats;
  }, [agents, awsCost]);

  // Prepare chart data
  const pieChartData = useMemo(() => {
    return Object.entries(providerCounts)
      .filter(([, count]) => count > 0)
      .map(([provider, count]) => ({
        name: AGENT_PROVIDER_CONFIG[provider as AgentProvider].label,
        value: count,
        color: AGENT_PROVIDER_CONFIG[provider as AgentProvider].color,
      }));
  }, [providerCounts]);

  const costChartData = useMemo(() => {
    return Object.entries(providerStats)
      .filter(([, stats]) => stats.count > 0)
      .map(([provider, stats]) => ({
        name: AGENT_PROVIDER_CONFIG[provider as AgentProvider].label,
        cost: Math.round(stats.totalCost),
        color: AGENT_PROVIDER_CONFIG[provider as AgentProvider].color,
        live: stats.costLive,
      }))
      .sort((a, b) => b.cost - a.cost);
  }, [providerStats]);

  const governanceChartData = useMemo(() => {
    return Object.entries(providerStats)
      .filter(([, stats]) => stats.count > 0)
      .map(([provider, stats]) => ({
        name: AGENT_PROVIDER_CONFIG[provider as AgentProvider].label,
        compliant: stats.compliant,
        reviewNeeded: stats.reviewNeeded,
        blocked: stats.blocked,
        color: AGENT_PROVIDER_CONFIG[provider as AgentProvider].color,
      }));
  }, [providerStats]);

  // Total stats
  const totalAgents = agents.length;
  const totalDemo = Object.values(providerStats).reduce((sum, s) => sum + s.demo, 0);
  // Split the cost total so the one measured figure is never blended into a seeded one
  // under a single label.
  const measuredCost = Object.values(providerStats).reduce((sum, s) => sum + (s.costLive ? s.totalCost : 0), 0);
  const seededCost = Object.values(providerStats).reduce((sum, s) => sum + (s.costLive ? 0 : s.totalCost), 0);
  const seededCostProviders = Object.values(providerStats).filter(s => !s.costLive && s.totalCost > 0).length;
  const totalCost = measuredCost + seededCost;
  const totalCompliant = Object.values(providerStats).reduce((sum, s) => sum + s.compliant, 0);
  const totalReviewNeeded = Object.values(providerStats).reduce((sum, s) => sum + s.reviewNeeded, 0);
  // Agents whose governanceStatus is 'unknown' are counted in none of the three
  // chart series, so a short/absent bar must not be read as "not compliant".
  const totalUnassessed = totalAgents
    - totalCompliant
    - totalReviewNeeded
    - Object.values(providerStats).reduce((sum, s) => sum + s.blocked, 0);
  const overallComplianceRate = totalAgents > 0 ? Math.round((totalCompliant / totalAgents) * 100) : 0;
  const registryProviderCount = Object.values(providerCountsAll).filter(c => c > 0).length;

  return (
    <div className="space-y-6 mb-6">
      {/* Summary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-4">
          <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">Active Providers</div>
          <div className="text-2xl font-semibold text-slate-900 mt-1">{pieChartData.length}</div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            {kpiIsLiveOnly && registryProviderCount > pieChartData.length
              ? `live-discovered · ${registryProviderCount} of 7 present in the registry`
              : 'of 7 supported'}
          </div>
        </div>
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-4">
          <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">Total Agents</div>
          <div className="text-2xl font-semibold text-slate-900 mt-1">{totalAgents}</div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            {totalDemo > 0
              ? `across all providers · ${totalAgents - totalDemo} live-discovered, ${totalDemo} seeded`
              : 'across all providers'}
          </div>
        </div>
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-4 flex flex-col">
          {/* Honesty gate: only the AWS figure is measured (Cost Explorer). The other
              providers have no cost connector, so their spend stays seeded and is shown
              separately instead of being blended into one "total" under a live badge.
              The badge sits at the foot of the card - inline it pushed "AWS Monthly Cost"
              onto two lines. */}
          <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">
            {awsCostLive ? 'AWS Monthly Cost' : 'Monthly Cost'}
          </div>
          <div className="text-2xl font-semibold text-slate-900 mt-1">
            ${Math.round(awsCostLive ? measuredCost : totalCost).toLocaleString()}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            {awsCostLive
              ? seededCost > 0
                ? `measured AI-estate spend · +$${Math.round(seededCost).toLocaleString()} seeded across ${seededCostProviders} demo provider${seededCostProviders === 1 ? '' : 's'}`
                : 'measured AI-estate spend'
              : 'estimated total'}
          </div>
          <div className="mt-auto pt-2">
            {awsCostLive
              ? <LiveDataBadge source="Cost Explorer" detail={awsCostDetail} />
              : <MockDataBadge integration="AWS Cost Explorer (GetCostAndUsageWithResources)" />}
          </div>
        </div>
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-4 flex flex-col">
          {/* Honesty gate: this rate is MIXED. The AWS slice is derived from real resource
              tags (ResourceGroupsTaggingAPI GetResources), but no connector exists for the
              non-AWS providers, so their posture is seeded. A blended rate therefore stays
              badged as demo rather than claiming a live cross-provider posture. */}
          <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">
            Compliance Rate
          </div>
          <div className={`text-2xl font-semibold mt-1 ${overallComplianceRate >= 90 ? 'text-emerald-600' : overallComplianceRate >= 70 ? 'text-amber-600' : 'text-rose-600'}`}>
            {overallComplianceRate}%
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            {totalReviewNeeded} need review{totalUnassessed > 0 ? ` · ${totalUnassessed} unassessed` : ''}
          </div>
          <div className="mt-auto pt-2">
            <MockDataBadge integration="Non-AWS provider posture (the AWS slice is derived from real resource tags)" />
          </div>
        </div>
      </div>

      {/* Provider Summary Cards */}
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
        <div className="text-sm font-semibold text-slate-900 mb-4">Provider Summary</div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {Object.entries(AGENT_PROVIDER_CONFIG).map(([provider, config]) => {
            const stats = providerStats[provider as AgentProvider];
            if (stats.count === 0) return null;
            const complianceRate = stats.count > 0 ? Math.round((stats.compliant / stats.count) * 100) : 0;
            return (
              <div
                key={provider}
                className="bg-slate-50 rounded-lg p-4 border border-slate-100 hover:border-slate-300 transition-colors"
              >
                <div className="flex items-center gap-2 mb-3">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: config.color }}
                  />
                  <span className="text-sm font-semibold text-slate-800">{config.label}</span>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-slate-500">Agents</span>
                    <span className="text-sm font-bold text-slate-900">
                      {stats.count}
                      {stats.demo > 0 && (
                        <span
                          className="ml-1 text-[9px] font-medium text-amber-600 cursor-help"
                          title={`${stats.demo} of these ${stats.count} rows are seeded demo agents`}
                        >
                          ({stats.demo} demo)
                        </span>
                      )}
                    </span>
                  </div>
                  {/* Honesty gate: the AWS slice of `compliant` is now derived from real
                      resource tags (ResourceGroupsTaggingAPI GetResources); the other
                      providers have no connector, so their posture is seeded. Badge each
                      provider for what it actually is. */}
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[10px] text-slate-500 flex items-center gap-1">
                      Compliant
                      {provider === 'aws' && governanceEvidenceLive
                        ? <LiveDataBadge source="Resource Groups Tagging" detail="Derived from real AWS tags (governance + owner) on each discovered agent's resource" />
                        : <MockDataBadge integration="No governance connector for this provider" />}
                    </span>
                    <span className={`text-xs font-semibold ${complianceRate >= 90 ? 'text-emerald-600' : complianceRate >= 70 ? 'text-amber-600' : 'text-rose-600'}`}>
                      {complianceRate}%
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[10px] text-slate-500 flex items-center gap-1">
                      Monthly Cost
                      {stats.costLive
                        ? <LiveDataBadge source="Cost Explorer" detail={awsCostDetail} />
                        : <MockDataBadge integration="No cost connector for this provider" />}
                    </span>
                    <span className="text-xs font-medium text-slate-700">${Math.round(stats.totalCost).toLocaleString()}</span>
                  </div>
                  <div className="flex gap-1 mt-2">
                    {stats.production > 0 && (
                      <span className="text-[8px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">{stats.production} prod</span>
                    )}
                    {stats.pilot > 0 && (
                      <span className="text-[8px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">{stats.pilot} pilot</span>
                    )}
                    {stats.development > 0 && (
                      <span className="text-[8px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">{stats.development} dev</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Provider Distribution Chart */}
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-semibold text-slate-900">Agent Distribution by Provider</span>
            {kpiIsLiveOnly
              ? <LiveDataBadge source="Bedrock + AgentCore" detail="Counts come from live AWS discovery only" />
              : <MockDataBadge integration="AWS Bedrock AgentCore" />}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5 mb-4">
            {kpiIsLiveOnly && excludedDemoCount > 0
              ? `Live-discovered agents only — ${excludedDemoCount} seeded demo rows (including every non-AWS provider) are excluded from this split but still appear in the tables below.`
              : 'Share of the registry held by each provider.'}
          </div>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie
                data={pieChartData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={90}
                paddingAngle={2}
                dataKey="value"
                label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                labelLine={{ stroke: '#94a3b8', strokeWidth: 1 }}
              >
                {pieChartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={((value: number) => [`${value} agents`, 'Count']) as Formatter<ValueType, NameType>}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Cost by Provider Chart */}
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
          <div className="text-sm font-semibold text-slate-900">Monthly Cost by Provider</div>
          <div className="text-[11px] text-slate-500 mt-0.5 mb-3">
            {awsCostLive
              ? 'The AWS bar is real measured spend for the whole AI estate; it is not the sum of per-agent costs, because no AWS API attributes Bedrock or AgentCore spend to an individual agent.'
              : 'Cost Explorer is unavailable, so every bar below is seeded.'}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-3">
            {costChartData.map(d => (
              <span key={d.name} className="inline-flex items-center gap-1 text-[10px] text-slate-500">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: d.color }} />
                {d.name}
                {d.live
                  ? <LiveDataBadge source="Cost Explorer" detail={awsCostDetail} />
                  : <MockDataBadge integration="No cost connector for this provider" />}
              </span>
            ))}
          </div>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={costChartData} layout="vertical" margin={{ left: 10, right: 30 }}>
              <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 10 }} tickFormatter={(value) => `$${value}`} />
              <YAxis type="category" dataKey="name" tick={{ fill: '#475569', fontSize: 11 }} width={90} />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={((value: number) => [`$${value.toLocaleString()}`, 'Monthly Cost']) as Formatter<ValueType, NameType>}
              />
              <Bar dataKey="cost" radius={[0, 6, 6, 0]}>
                {costChartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Governance Status by Provider */}
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-semibold text-slate-900">Governance Status by Provider</span>
          {governanceEvidenceLive
            ? <MockDataBadge integration="Non-AWS provider posture (the AWS bars are derived from real resource tags)" />
            : <MockDataBadge integration="AWS Resource Groups Tagging (GetResources)" />}
        </div>
        <div className="text-[11px] text-slate-500 mt-0.5 mb-4">
          {totalUnassessed > 0
            ? `${totalUnassessed} of ${totalAgents} agents have no derived governance evidence yet (status "unknown") and appear in none of the series below — a short bar is not the same as non-compliant.`
            : 'Series cover agents with an explicit compliant / review-needed / blocked status.'}
        </div>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={governanceChartData} margin={{ top: 10, right: 30, left: 10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="name" tick={{ fill: '#475569', fontSize: 11 }} />
            <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} />
            <Tooltip contentStyle={tooltipStyle} />
            <Legend wrapperStyle={{ fontSize: '11px' }} />
            <Bar dataKey="compliant" name="Compliant" fill="#10b981" stackId="stack" radius={[0, 0, 0, 0]} />
            <Bar dataKey="reviewNeeded" name="Review Needed" fill="#f59e0b" stackId="stack" radius={[0, 0, 0, 0]} />
            <Bar dataKey="blocked" name="Blocked" fill="#ef4444" stackId="stack" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Provider Details Table */}
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <div className="text-sm font-semibold text-slate-900">Provider Details</div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            Detailed breakdown of agents, governance, and costs per provider. Covers the full
            registry ({totalAgents} rows{totalDemo > 0 ? `, ${totalDemo} of them seeded` : ''}), so
            counts here are intentionally larger than the live-only distribution above.
          </div>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] text-slate-400 uppercase tracking-wide bg-slate-50/50">
              <th scope="col" className="text-left py-2.5 px-5 font-medium">Provider</th>
              <th scope="col" className="text-center py-2.5 px-3 font-medium">Agents</th>
              <th scope="col" className="text-center py-2.5 px-3 font-medium">Production</th>
              <th scope="col" className="text-center py-2.5 px-3 font-medium">
                <span className="inline-flex items-center gap-1">
                  Compliant
                  {governanceEvidenceLive
                    ? <MockDataBadge integration="Non-AWS provider posture (the AWS row is derived from real resource tags)" />
                    : <MockDataBadge integration="AWS Resource Groups Tagging (GetResources)" />}
                </span>
              </th>
              <th scope="col" className="text-center py-2.5 px-3 font-medium">Review</th>
              <th scope="col" className="text-center py-2.5 px-3 font-medium">Blocked</th>
              <th scope="col" className="text-right py-2.5 px-5 font-medium">
                <span className="inline-flex items-center gap-1">
                  Monthly Cost
                  {awsCostLive
                    ? <LiveDataBadge source="Cost Explorer" detail={`${awsCostDetail} — AWS row only; other providers are seeded`} />
                    : <MockDataBadge integration="AWS Cost Explorer (GetCostAndUsageWithResources)" />}
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(providerStats)
              .filter(([, stats]) => stats.count > 0)
              .sort((a, b) => b[1].count - a[1].count)
              .map(([provider, stats]) => {
                const config = AGENT_PROVIDER_CONFIG[provider as AgentProvider];
                return (
                  <tr key={provider} className="border-t border-slate-100 hover:bg-slate-50/60 transition-colors">
                    <td className="py-3 px-5">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: config.color }} />
                        <span className="font-semibold text-slate-900">{config.label}</span>
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 capitalize">{config.category}</span>
                      </div>
                    </td>
                    <td className="py-3 px-3 text-center font-semibold text-slate-800">
                      {stats.count}
                      {stats.demo > 0 && (
                        <span
                          className="ml-1 text-[9px] font-medium text-amber-600 cursor-help"
                          title={`${stats.demo} seeded demo row${stats.demo === 1 ? '' : 's'} included`}
                        >
                          ({stats.demo} demo)
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-center">
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-emerald-50 text-emerald-700">
                        {stats.production}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-center">
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-emerald-50 text-emerald-700">
                        {stats.compliant}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-center">
                      {stats.reviewNeeded > 0 ? (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-amber-50 text-amber-700">
                          {stats.reviewNeeded}
                        </span>
                      ) : (
                        <span className="text-slate-300">-</span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-center">
                      {stats.blocked > 0 ? (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-rose-50 text-rose-700">
                          {stats.blocked}
                        </span>
                      ) : (
                        <span className="text-slate-300">-</span>
                      )}
                    </td>
                    <td className="py-3 px-5 text-right font-semibold text-slate-700 tabular-nums">
                      <span className="inline-flex items-center gap-1 justify-end">
                        ${Math.round(stats.totalCost).toLocaleString()}
                        {stats.costLive
                          ? <LiveDataBadge source="Cost Explorer" detail={awsCostDetail} />
                          : <MockDataBadge integration="No cost connector for this provider" />}
                      </span>
                    </td>
                  </tr>
                );
              })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-200 bg-slate-50/50">
              <td className="py-3 px-5 font-semibold text-slate-900">Total</td>
              <td className="py-3 px-3 text-center font-bold text-slate-900">{totalAgents}</td>
              <td className="py-3 px-3 text-center font-semibold text-emerald-700">
                {Object.values(providerStats).reduce((sum, s) => sum + s.production, 0)}
              </td>
              <td className="py-3 px-3 text-center font-semibold text-emerald-700">{totalCompliant}</td>
              <td className="py-3 px-3 text-center font-semibold text-amber-700">{totalReviewNeeded}</td>
              <td className="py-3 px-3 text-center font-semibold text-rose-700">
                {Object.values(providerStats).reduce((sum, s) => sum + s.blocked, 0)}
              </td>
              <td
                className="py-3 px-5 text-right font-bold text-slate-900 tabular-nums cursor-help"
                title={awsCostLive
                  ? `$${Math.round(measuredCost).toLocaleString()} measured (AWS, Cost Explorer) + $${Math.round(seededCost).toLocaleString()} seeded (other providers)`
                  : 'Every figure in this column is seeded'}
              >
                ${Math.round(totalCost).toLocaleString()}
              </td>
            </tr>
          </tfoot>
        </table>
        {awsCostLive && (
          <div className="px-5 py-3 border-t border-slate-100 text-[11px] text-slate-500">
            AWS monthly cost is measured spend for the whole AI estate (Cost Explorer
            GetCostAndUsageWithResources over {awsCost?.windowDays} days, normalized to 30). Per-agent
            attribution is not available from any AWS API today, so no agent-level cost is derived
            from it. All other provider costs are seeded.
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════ Permissions Matrix (Area 6) ═══════════════════════════

interface PermissionsMatrixProps {
  agents: AgentRegistryEntry[];
  policyMap: Record<string, AgentPolicySummary>;
  policyKnown: boolean;
  policyIsLive: boolean;
  agentDataSource: 'live' | 'demo' | 'mixed';
}

function PermissionsMatrix({ agents, policyMap, policyKnown, policyIsLive, agentDataSource }: PermissionsMatrixProps) {
  const tools = TOOL_REGISTRY;
  const enforcedCount = agents.filter(a => policyMap[a.id]?.status === 'active').length;

  return (
    <div className="space-y-6 mb-6">
      <div className="bg-blue-50/60 border border-blue-200/60 rounded-xl p-4 text-xs text-slate-600">
        <span className="font-semibold text-blue-700">Why this matters:</span> Agents must only invoke tools and other agents they are explicitly authorized for, and tool calls must respect both the agent's identity <em>and</em> the invoking user's access rights. The grids below make those authorization boundaries auditable.
      </div>

      {/* Policy enforcement banner — ties the matrices to the Cedar policies authored in Secure */}
      <div className="flex items-center justify-between bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm px-4 py-3">
        <div className="flex items-center gap-2 text-xs">
          {!policyKnown ? (
            <span className="text-slate-400">Loading policy enforcement…</span>
          ) : (
            <>
              <span className={`w-2 h-2 rounded-full ${policyIsLive ? 'bg-emerald-500' : 'bg-amber-400 border border-dashed border-amber-500'}`} />
              <span className="text-slate-700">
                <span className="font-semibold">{enforcedCount}/{agents.length}</span> agents have an active Cedar policy enforcing these boundaries
                <span className="text-slate-400"> · Policies: {policyIsLive ? 'live' : 'demo'} · Agents: {agentDataSource}</span>
              </span>
            </>
          )}
        </div>
        <Link to="/secure/policy" className="text-xs text-blue-600 hover:text-blue-700 font-medium">Manage policies in Secure →</Link>
      </div>

      {/* Agent → Tool authorization grid */}
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
        <div className="text-sm font-semibold text-slate-900 mb-1">Agent → Tool Authorization</div>
        <div className="text-[11px] text-slate-500 mb-4">Which tools each agent is permitted to invoke. Authorized cells show the tool's risk level (L/M/H/C); blank = not authorized.</div>
        <div className="overflow-x-auto">
          <table className="text-xs border-collapse">
            <thead>
              <tr>
                <th scope="col" className="text-left py-2 px-3 font-medium text-slate-500 sticky left-0 bg-white">Agent</th>
                {tools.map(t => (
                  <th scope="col" key={t.id} className="px-2 py-2 font-medium text-slate-500 align-bottom">
                    <div className="h-24 flex items-end justify-center">
                      <span className="whitespace-nowrap" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }} title={t.description}>{t.name}</span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {agents.map(a => (
                <tr key={a.id} className="border-t border-slate-100">
                  <td className="py-2 px-3 font-medium text-slate-800 sticky left-0 bg-white whitespace-nowrap">
                    <span className="flex items-center gap-1.5">
                      {policyKnown && (
                        <span
                          className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${policyMap[a.id]?.status === 'active' ? 'bg-emerald-500' : 'bg-rose-400'}`}
                          title={policyMap[a.id]?.status === 'active' ? 'Cedar policy enforced' : 'No active policy'}
                        />
                      )}
                      {a.name}
                    </span>
                  </td>
                  {tools.map(t => {
                    const authorized = a.tools.includes(t.id);
                    const riskInitial = t.riskLevel === 'critical' ? 'C' : t.riskLevel === 'high' ? 'H' : t.riskLevel === 'medium' ? 'M' : 'L';
                    return (
                      <td key={t.id} className="text-center px-2 py-2">
                        {authorized ? (
                          <span
                            className="inline-flex items-center justify-center w-4 h-4 rounded-full text-[8px] font-bold text-white"
                            style={{ backgroundColor: t.riskLevel === 'critical' ? '#ef4444' : t.riskLevel === 'high' ? '#f97316' : t.riskLevel === 'medium' ? '#f59e0b' : '#10b981' }}
                            title={`${a.name} → ${t.name} (${t.riskLevel} risk)`}
                            aria-label={`${a.name} authorized for ${t.name}, ${t.riskLevel} risk`}
                          >{riskInitial}</span>
                        ) : (
                          <span className="text-slate-200" aria-label={`${a.name} not authorized for ${t.name}`}>·</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center gap-3 mt-3 text-[10px] text-slate-500">
          <span className="flex items-center gap-1"><span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-emerald-500 text-white text-[7px] font-bold">L</span> low</span>
          <span className="flex items-center gap-1"><span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-amber-500 text-white text-[7px] font-bold">M</span> medium</span>
          <span className="flex items-center gap-1"><span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-orange-500 text-white text-[7px] font-bold">H</span> high</span>
          <span className="flex items-center gap-1"><span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-rose-500 text-white text-[7px] font-bold">C</span> critical</span>
        </div>
      </div>

      {/* Agent → Agent (A2A) grid */}
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
        <div className="text-sm font-semibold text-slate-900 mb-1">Agent → Agent (A2A) Authorization</div>
        <div className="text-[11px] text-slate-500 mb-4">In multi-agent systems, an agent may only invoke other agents it is explicitly authorized to call. Rows are callers, columns are callees.</div>
        <div className="overflow-x-auto">
          <table className="text-xs border-collapse">
            <thead>
              <tr>
                <th scope="col" className="text-left py-2 px-3 font-medium text-slate-500">Caller \ Callee</th>
                {agents.map(a => (
                  <th scope="col" key={a.id} className="px-2 py-2 font-medium text-slate-500 text-center whitespace-nowrap">{a.name.replace(' Agent', '').replace(' Assistant', '')}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {agents.map(caller => (
                <tr key={caller.id} className="border-t border-slate-100">
                  <td className="py-2 px-3 font-medium text-slate-800 whitespace-nowrap">{caller.name.replace(' Agent', '').replace(' Assistant', '')}</td>
                  {agents.map(callee => {
                    if (caller.id === callee.id) {
                      return <td key={callee.id} className="text-center px-2 py-2 bg-slate-50 text-slate-300">—</td>;
                    }
                    const authorized = caller.invokesAgents.includes(callee.id);
                    return (
                      <td key={callee.id} className="text-center px-2 py-2">
                        {authorized ? (
                          <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-violet-100 text-violet-700 text-[10px] font-bold" title={`${caller.name} may invoke ${callee.name}`}><Icon name="check" className="w-3 h-3" strokeWidth={2.5} /></span>
                        ) : (
                          <span className="text-slate-200">·</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* User-rights propagation */}
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
        <div className="text-sm font-semibold text-slate-900 mb-1">User-Rights Propagation</div>
        <div className="text-[11px] text-slate-500 mb-4">When a user invokes an agent, tool calls are constrained by the intersection of the agent's identity and the user's own access rights — preventing agents from being used as a proxy to over-reach.</div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-indigo-50 border border-indigo-200">
            <span className="text-[10px] font-semibold text-indigo-700 uppercase">User</span>
            <span className="text-xs text-slate-700">Effective permissions</span>
          </div>
          <span className="text-slate-300">∩</span>
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-violet-50 border border-violet-200">
            <span className="text-[10px] font-semibold text-violet-700 uppercase">Agent</span>
            <span className="text-xs text-slate-700">Identity scope</span>
          </div>
          <span className="text-slate-300">→</span>
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200">
            <span className="text-[10px] font-semibold text-emerald-700 uppercase">Allowed</span>
            <span className="text-xs text-slate-700">Tool invocation</span>
          </div>
          <div className="ml-auto text-[11px] text-slate-500">
            Enforced via <span className="font-medium text-slate-700">Bedrock AgentCore Identity</span> + <span className="font-medium text-slate-700">Cedar</span>
          </div>
        </div>
      </div>
    </div>
  );
}
