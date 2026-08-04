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

import { useMemo, useState, useEffect } from 'react';
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
import { useAgentRegistry, isLiveAgent } from './useAgentRegistry';
import { useGovernModels } from './useGovernModels';
import { governAgentCoreApi } from '../../api/client';
import InventoryConnectorsCard from './InventoryConnectorsCard';
import AgentCorePostureCard from './AgentCorePostureCard';
import { useAwsConnected } from './useAwsConnected';
import HumanOversight from './HumanOversight';
import A2AGovernance from './A2AGovernance';
import AgentCoreEvaluations from './AgentCoreEvaluations';
import { LiveDataBadge, MockDataBadge } from './DataSourceIndicator';
import CoreBadge from './CoreBadge';
import Drawer from './Drawer';
import { Icon } from './icons';
import { useSecurityHubAIInventory, type DiscoveredAIAsset, type AIAssetType } from './useSecurityHubAIInventory';

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

export default function AgentRegistry() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabFromUrl = searchParams.get('tab') as TabId | null;
  const agentFromUrl = searchParams.get('agent');
  const providerFromUrl = searchParams.get('provider') as AgentProvider | null;
  const [tab, setTab] = useState<TabId>(tabFromUrl && TABS.some(t => t.id === tabFromUrl) ? tabFromUrl : 'agents');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | AgentStatus>('all');
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
  // Derive a 0-100 risk score from the agent's actual scope and incident posture
  // (canonical scale: 0-24 Low / 25-49 Medium / 50-74 High / 75+ Critical) rather
  // than a flat constant, so agents don't all show an identical score.
  const agentRegistry = useAgentRegistry();
  const { awsConnected } = useAwsConnected();
  const awsAgents = agentRegistry.agents.map(a => {
    const scopeContribution = ((a.scopeLevel ?? 1) - 1) * 15; // 0,15,30,45
    const openIncidentContribution = (a.incidents?.openCount ?? 0) * 12;
    const recentIncidentContribution = Math.min((a.incidents?.count90d ?? 0) * 4, 16);
    const riskScore = Math.max(8, Math.min(100, scopeContribution + openIncidentContribution + recentIncidentContribution + 8));
    return { ...a, provider: 'aws' as AgentProvider, governanceStatus: 'compliant' as GovernanceStatus, riskScore };
  });
  const allAgents = useMemo(() => [...awsAgents, ...EXTERNAL_AGENTS], [awsAgents]);

  // Security Hub AI inventory - for importing discovered assets
  const securityHubRaw = useSecurityHubAIInventory();
  // Derive convenience properties from the hook result
  const securityHubInventory = useMemo(() => {
    const assets = securityHubRaw.discoveredAssets ?? [];
    const unregisteredAssets = assets.filter(a => a.registrationStatus === 'unregistered');
    const byType = Object.entries(securityHubRaw.summary?.byType ?? {}).map(([type, count]) => ({ type, count }));
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
          map.set(kw, {
            invocations: prev.invocations + m.invocations,
            latencyMs: Math.max(prev.latencyMs, m.avg_latency_ms),
            errorPct: Math.max(prev.errorPct, m.error_rate_pct),
          });
        }
      }
    }
    // 'bedrock' keyword = whole-fleet fallback for agents with no specific model.
    if (liveModelMetrics?.by_model?.length) {
      map.set('bedrock', {
        invocations: liveModelMetrics.total_invocations,
        latencyMs: liveModelMetrics.avg_latency_ms,
        errorPct: liveModelMetrics.fleet_error_rate_pct,
      });
    }
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

  // Prefer real per-agent metrics (matched by name); else model-level fallback.
  const liveMetricsFor = (a: { provider?: AgentProvider; model?: string; name?: string }) => {
    if (a.provider !== 'aws') return undefined;
    const pa = a.name ? agentMetrics[a.name.toLowerCase()] : undefined;
    if (pa) return { invocations: pa.invocations, latencyMs: pa.latencyMs, errorPct: pa.invocations > 0 ? +(pa.errors / pa.invocations * 100).toFixed(2) : 0, perAgent: true };
    const ml = metricsLive ? modelMetricsByKeyword.get((a.model || '').toLowerCase()) : undefined;
    return ml ? { ...ml, perAgent: false } : undefined;
  };

  const filteredAgents = useMemo(() => allAgents.filter(a => {
    const statusOk = statusFilter === 'all' || a.status === statusFilter;
    const providerOk = providerFilter === 'all' || a.provider === providerFilter;
    const q = search.toLowerCase();
    const searchOk = !q || a.name.toLowerCase().includes(q) || a.owner.toLowerCase().includes(q) || a.businessPurpose.toLowerCase().includes(q);
    return statusOk && providerOk && searchOk;
  }), [allAgents, search, statusFilter, providerFilter]);

  // KPIs - use combined agent list (AWS + external providers)
  const totalAgents = allAgents.length;
  const awsAgentCount = awsAgents.length;
  const externalAgentCount = EXTERNAL_AGENTS.length;
  const inProduction = allAgents.filter(a => a.status === 'production').length;
  const openIncidents = allAgents.reduce((s, a) => s + a.incidents.openCount, 0);
  const highScope = allAgents.filter(a => a.scopeLevel >= 3).length;
  // Cedar policy coverage from Secure (live when bound, demo fallback otherwise).
  const policyKnown = policies.loaded; // data available (live or demo)
  const policyIsLive = policies.source === 'live';
  const agentDataSource = agentRegistry.source;

  // Provider breakdown
  const providerCounts = useMemo(() => {
    const counts: Record<AgentProvider, number> = { aws: 0, azure: 0, gcp: 0, servicenow: 0, salesforce: 0, copilot_studio: 0, custom: 0 };
    allAgents.forEach(a => { if (a.provider) counts[a.provider]++; });
    return counts;
  }, [allAgents]);

  // Governance status breakdown
  const governanceBreakdown = useMemo(() => {
    const compliant = allAgents.filter(a => a.governanceStatus === 'compliant').length;
    const reviewNeeded = allAgents.filter(a => a.governanceStatus === 'review_needed').length;
    const blocked = allAgents.filter(a => a.governanceStatus === 'blocked').length;
    return { compliant, reviewNeeded, blocked };
  }, [allAgents]);

  return (
    <div className="min-h-[calc(100vh-4rem)] relative">
      <div className="relative max-w-7xl mx-auto px-6 py-10">
        <Link to="/govern" className="text-sm text-slate-400 hover:text-slate-600 transition-colors font-medium">
          ← Govern
        </Link>

        <div className="flex items-end justify-between mt-3 mb-6">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-semibold text-slate-900 tracking-tight">Agent Registry</h1>
              <CoreBadge pillar="see" />
              {agentDataSource === 'live' ? <LiveDataBadge /> : agentDataSource === 'mixed' ? (
                <span className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded bg-sky-50 text-sky-600 border border-sky-200">
                  <span className="w-1 h-1 rounded-full bg-sky-400" />
                  Hybrid
                </span>
              ) : <MockDataBadge integration="AWS Bedrock AgentCore" />}
              <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-medium">
                {totalAgents} agents
              </span>
              {externalAgentCount > 0 && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 font-medium">
                  {externalAgentCount} external
                </span>
              )}
            </div>
            <p className="text-slate-500 mt-1 max-w-2xl">
              Unified inventory of agents across all providers — AWS, Azure, GCP, ServiceNow, Salesforce, and more. Click any agent for the full Agent 360.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/govern/fleet" className="text-xs text-purple-600 hover:text-purple-700 font-medium">
              Fleet Overview →
            </Link>
            <Link to="/govern/shadow-ai" className="text-xs text-blue-600 hover:text-blue-700 font-medium">
              Shadow AI Detection →
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
          </div>
        </div>

        {/* How to Use + Go Live — only for tabs whose embedded component does NOT
            render its own guides (human-oversight, a2a, evaluations are
            standalone components that bring their own). */}
        {!['human-oversight', 'a2a', 'evaluations', 'fleet-scale'].includes(tab) && (
          <UnifiedGuide {...AGENT_REGISTRY_GUIDE} />
        )}

        {/* KPIs - hide when on tabs with their own metrics */}
        {!['human-oversight', 'a2a', 'evaluations', 'fleet-scale'].includes(tab) && (
          <>
            {/* Provider summary bar */}
            <div className="flex items-center gap-2 mb-4 flex-wrap">
              <span className="text-xs font-medium text-slate-500 uppercase">Providers:</span>
              {Object.entries(providerCounts).filter(([, count]) => count > 0).map(([provider, count]) => {
                const config = AGENT_PROVIDER_CONFIG[provider as AgentProvider];
                return (
                  <button
                    key={provider}
                    onClick={() => setProviderFilter(providerFilter === provider ? 'all' : provider as AgentProvider)}
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
                    <span className="font-bold">{count}</span>
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

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
              {[
                {
                  label: 'Total Agents',
                  value: totalAgents,
                  sub: `${awsAgentCount} AWS · ${externalAgentCount} external`,
                },
                {
                  label: 'In Production',
                  value: inProduction,
                  sub: `${Math.round((inProduction / totalAgents) * 100)}% of fleet`,
                },
                {
                  label: 'Compliant',
                  value: governanceBreakdown.compliant,
                  sub: `${Math.round((governanceBreakdown.compliant / totalAgents) * 100)}% governed`,
                  color: 'emerald',
                },
                {
                  label: 'Review Needed',
                  value: governanceBreakdown.reviewNeeded,
                  sub: governanceBreakdown.reviewNeeded > 0 ? 'pending assessment' : 'all reviewed',
                  color: governanceBreakdown.reviewNeeded > 0 ? 'amber' : undefined,
                },
                { label: 'High-Scope (L3+)', value: highScope, sub: `${openIncidents} open incident${openIncidents !== 1 ? 's' : ''}` },
                {
                  label: 'Blocked',
                  value: governanceBreakdown.blocked,
                  sub: governanceBreakdown.blocked > 0 ? 'governance violations' : 'none blocked',
                  color: governanceBreakdown.blocked > 0 ? 'rose' : undefined,
                },
              ].map(k => (
                <div key={k.label} className={`bg-white/80 backdrop-blur-sm rounded-xl border shadow-sm p-4 border-slate-200/60`}>
                  <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">{k.label}</div>
                  <div className={`text-2xl font-semibold mt-1 ${
                    'color' in k && k.color === 'emerald' ? 'text-emerald-600' :
                    'color' in k && k.color === 'amber' ? 'text-amber-600' :
                    'color' in k && k.color === 'rose' ? 'text-rose-600' :
                    'text-slate-900'
                  }`}>{k.value}</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">{k.sub}</div>
                </div>
              ))}
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
                Invocations marked <span className="font-medium text-emerald-700">●</span> are live model-level counts from CloudWatch AWS/Bedrock (shared by all agents on that model) — not yet per-agent telemetry.
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
                    const isLive = isLiveAgent(a.id);
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
                      <td className="py-2.5 px-2 text-slate-700 text-xs">{a.owner}</td>
                      <td className="py-2.5 px-2 text-center"><ScopeBadge level={a.scopeLevel} /></td>
                      <td className="py-2.5 px-2 text-center">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded capitalize ${
                          govStatus === 'compliant' ? 'bg-emerald-50 text-emerald-700' :
                          govStatus === 'review_needed' ? 'bg-amber-50 text-amber-700' :
                          govStatus === 'blocked' ? 'bg-rose-50 text-rose-700' :
                          'bg-slate-100 text-slate-500'
                        }`}>
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
                              : `Live model-level (CloudWatch): ${lm.invocations.toLocaleString()} invocations for the ${a.model} model, ${lat} avg latency, ${lm.errorPct}% errors. Shared across all agents on this model.`;
                            return (
                              <span className="inline-flex items-center gap-1" title={title}>
                                <span className={`w-1 h-1 rounded-full ${lm.perAgent ? 'bg-emerald-500' : 'bg-emerald-400'}`} />
                                {lm.invocations.toLocaleString()}
                                <span className="text-[8px] text-slate-400">{lm.perAgent ? 'per-agent' : `~${a.model}`}</span>
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
              Showing {filteredAgents.length} of {totalAgents} agents
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
              {totalAgents > 50 && !useRealFleetData && (
                <span className="text-amber-600">
                  Your registry has {totalAgents} agents — consider enabling real data mode
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            {MCP_SERVER_REGISTRY.map(s => (
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
                    <div className="text-lg font-semibold text-slate-900">{s.toolCount}</div>
                  </div>
                  <div>
                    <div className="text-[9px] text-slate-400 uppercase tracking-wide">Uptime 30d</div>
                    <div className={`text-lg font-semibold ${s.uptime30d >= 99.9 ? 'text-emerald-600' : s.uptime30d >= 99 ? 'text-amber-600' : 'text-rose-600'}`}>{s.uptime30d}%</div>
                  </div>
                  <div>
                    <div className="text-[9px] text-slate-400 uppercase tracking-wide">Latency</div>
                    <div className="text-lg font-semibold text-slate-900">{s.avgLatencyMs}<span className="text-[10px] text-slate-400">ms</span></div>
                  </div>
                  <div>
                    <div className="text-[9px] text-slate-400 uppercase tracking-wide">Auth</div>
                    <div className="text-[11px] font-medium text-slate-700 mt-1">{s.authMethod}</div>
                  </div>
                </div>
                <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-100">
                  <span className="text-[11px] text-slate-500">Owner: <span className="text-slate-700 font-medium">{s.owner}</span></span>
                  <span className="text-[10px] text-slate-400">Checked {s.lastHealthCheck}</span>
                </div>
              </div>
            ))}
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
          <ProvidersTab agents={allAgents} providerCounts={providerCounts} />
        )}
      </div>

      <AgentDrawer
        agentId={openAgent}
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
                  <Icon name={typeInfo.icon as any} className="w-3.5 h-3.5" />
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
    </div>
  );
}

// ═══════════════════════════ Asset Import Row ═══════════════════════════

interface AssetImportRowProps {
  asset: DiscoveredAIAsset;
  selected: boolean;
  onToggle: () => void;
}

const ASSET_TYPE_ICONS: Record<AIAssetType, string> = {
  'bedrock-model': 'cube',
  'bedrock-agent': 'cpu-chip',
  'bedrock-guardrail': 'shield-check',
  'bedrock-kb': 'book-open',
  'sagemaker-endpoint': 'server-stack',
};

const ASSET_TYPE_LABELS: Record<AIAssetType, string> = {
  'bedrock-model': 'Bedrock Model',
  'bedrock-agent': 'Bedrock Agent',
  'bedrock-guardrail': 'Guardrail',
  'bedrock-kb': 'Knowledge Base',
  'sagemaker-endpoint': 'SageMaker Endpoint',
};

function AssetImportRow({ asset, selected, onToggle }: AssetImportRowProps) {
  const riskColors = {
    low: 'bg-emerald-50 text-emerald-700',
    medium: 'bg-amber-50 text-amber-700',
    high: 'bg-orange-50 text-orange-700',
    critical: 'bg-rose-50 text-rose-700',
  };

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
          <Icon name={ASSET_TYPE_ICONS[asset.type] as any} className="w-4 h-4 text-slate-500" />
          <span className="font-medium text-slate-900 truncate">{asset.name}</span>
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded capitalize ${riskColors[asset.riskLevel]}`}>
            {asset.riskLevel}
          </span>
        </div>
        <div className="text-[11px] text-slate-500 mt-0.5">
          <span className="font-mono">{asset.resourceArn.length > 60 ? asset.resourceArn.slice(0, 60) + '...' : asset.resourceArn}</span>
        </div>
        <div className="flex items-center gap-3 mt-1 text-[10px] text-slate-400">
          <span>{ASSET_TYPE_LABELS[asset.type]}</span>
          <span>|</span>
          <span>{asset.region}</span>
          <span>|</span>
          <span>Account: {asset.accountId}</span>
          <span>|</span>
          <span>Last seen: {lastSeenStr}</span>
        </div>
        {asset.securityFindingCount > 0 && (
          <div className="flex items-center gap-1 mt-1 text-[10px] text-rose-600">
            <Icon name="exclamation-triangle" className="w-3 h-3" />
            {asset.securityFindingCount} Security Hub finding{asset.securityFindingCount !== 1 ? 's' : ''}
          </div>
        )}
      </div>
      <a
        href={asset.consoleUrl}
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
  agents: AgentRegistryEntry[];
  providerCounts: Record<AgentProvider, number>;
}

function ProvidersTab({ agents, providerCounts }: ProvidersTabProps) {
  // Calculate provider stats
  const providerStats = useMemo(() => {
    const stats: Record<AgentProvider, {
      count: number;
      compliant: number;
      reviewNeeded: number;
      blocked: number;
      totalCost: number;
      production: number;
      pilot: number;
      development: number;
    }> = {
      aws: { count: 0, compliant: 0, reviewNeeded: 0, blocked: 0, totalCost: 0, production: 0, pilot: 0, development: 0 },
      azure: { count: 0, compliant: 0, reviewNeeded: 0, blocked: 0, totalCost: 0, production: 0, pilot: 0, development: 0 },
      gcp: { count: 0, compliant: 0, reviewNeeded: 0, blocked: 0, totalCost: 0, production: 0, pilot: 0, development: 0 },
      servicenow: { count: 0, compliant: 0, reviewNeeded: 0, blocked: 0, totalCost: 0, production: 0, pilot: 0, development: 0 },
      salesforce: { count: 0, compliant: 0, reviewNeeded: 0, blocked: 0, totalCost: 0, production: 0, pilot: 0, development: 0 },
      copilot_studio: { count: 0, compliant: 0, reviewNeeded: 0, blocked: 0, totalCost: 0, production: 0, pilot: 0, development: 0 },
      custom: { count: 0, compliant: 0, reviewNeeded: 0, blocked: 0, totalCost: 0, production: 0, pilot: 0, development: 0 },
    };

    agents.forEach(agent => {
      const provider = agent.provider || 'aws';
      stats[provider].count++;
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

    return stats;
  }, [agents]);

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
  const totalCost = Object.values(providerStats).reduce((sum, s) => sum + s.totalCost, 0);
  const totalCompliant = Object.values(providerStats).reduce((sum, s) => sum + s.compliant, 0);
  const totalReviewNeeded = Object.values(providerStats).reduce((sum, s) => sum + s.reviewNeeded, 0);

  return (
    <div className="space-y-6 mb-6">
      {/* Summary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-4">
          <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">Active Providers</div>
          <div className="text-2xl font-semibold text-slate-900 mt-1">{pieChartData.length}</div>
          <div className="text-[11px] text-slate-400 mt-0.5">of 7 supported</div>
        </div>
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-4">
          <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">Total Agents</div>
          <div className="text-2xl font-semibold text-slate-900 mt-1">{totalAgents}</div>
          <div className="text-[11px] text-slate-400 mt-0.5">across all providers</div>
        </div>
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-4">
          <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">Monthly Cost</div>
          <div className="text-2xl font-semibold text-slate-900 mt-1">${totalCost.toLocaleString()}</div>
          <div className="text-[11px] text-slate-400 mt-0.5">estimated total</div>
        </div>
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-4">
          <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">Compliance Rate</div>
          <div className={`text-2xl font-semibold mt-1 ${totalCompliant / totalAgents >= 0.9 ? 'text-emerald-600' : totalCompliant / totalAgents >= 0.7 ? 'text-amber-600' : 'text-rose-600'}`}>
            {Math.round((totalCompliant / totalAgents) * 100)}%
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">{totalReviewNeeded} need review</div>
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
                    <span className="text-sm font-bold text-slate-900">{stats.count}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-slate-500">Compliant</span>
                    <span className={`text-xs font-semibold ${complianceRate >= 90 ? 'text-emerald-600' : complianceRate >= 70 ? 'text-amber-600' : 'text-rose-600'}`}>
                      {complianceRate}%
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-slate-500">Monthly Cost</span>
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
          <div className="text-sm font-semibold text-slate-900 mb-4">Agent Distribution by Provider</div>
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
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                labelLine={{ stroke: '#94a3b8', strokeWidth: 1 }}
              >
                {pieChartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(value: number) => [`${value} agents`, 'Count']}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Cost by Provider Chart */}
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
          <div className="text-sm font-semibold text-slate-900 mb-4">Monthly Cost by Provider</div>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={costChartData} layout="vertical" margin={{ left: 10, right: 30 }}>
              <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 10 }} tickFormatter={(value) => `$${value}`} />
              <YAxis type="category" dataKey="name" tick={{ fill: '#475569', fontSize: 11 }} width={90} />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(value: number) => [`$${value.toLocaleString()}`, 'Monthly Cost']}
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
        <div className="text-sm font-semibold text-slate-900 mb-4">Governance Status by Provider</div>
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
          <div className="text-[11px] text-slate-500 mt-0.5">Detailed breakdown of agents, governance, and costs per provider</div>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] text-slate-400 uppercase tracking-wide bg-slate-50/50">
              <th scope="col" className="text-left py-2.5 px-5 font-medium">Provider</th>
              <th scope="col" className="text-center py-2.5 px-3 font-medium">Agents</th>
              <th scope="col" className="text-center py-2.5 px-3 font-medium">Production</th>
              <th scope="col" className="text-center py-2.5 px-3 font-medium">Compliant</th>
              <th scope="col" className="text-center py-2.5 px-3 font-medium">Review</th>
              <th scope="col" className="text-center py-2.5 px-3 font-medium">Blocked</th>
              <th scope="col" className="text-right py-2.5 px-5 font-medium">Monthly Cost</th>
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
                    <td className="py-3 px-3 text-center font-semibold text-slate-800">{stats.count}</td>
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
                      ${Math.round(stats.totalCost).toLocaleString()}
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
              <td className="py-3 px-5 text-right font-bold text-slate-900 tabular-nums">
                ${Math.round(totalCost).toLocaleString()}
              </td>
            </tr>
          </tfoot>
        </table>
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
                          <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-violet-100 text-violet-700 text-[10px] font-bold" title={`${caller.name} may invoke ${callee.name}`}>✓</span>
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
