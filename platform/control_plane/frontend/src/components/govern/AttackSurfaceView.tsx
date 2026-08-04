/**
 * AttackSurfaceView — Threat-focused inventory of AI attack surface.
 *
 * Aggregates agents, tools, MCP servers, data domains, and A2A trust into
 * a unified view for security assessment. Maps to OWASP LLM Top 10 categories.
 */

import { useMemo } from 'react';
import {
  ALL_AGENTS,
  TOOL_REGISTRY,
  MCP_SERVER_REGISTRY,
  type AgentRegistryEntry,
  type ToolRegistryEntry,
  type McpServerEntry,
} from './mockData';
import { AGENT_SCOPE_META, type AgentScopeLevel } from './autonomyLadder';
import StatCard from './StatCard';
import { MockDataBadge } from './DataSourceIndicator';

const card = 'bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 shadow-sm';

const OWASP_MAPPING: Record<string, { id: string; name: string; color: string }> = {
  'prompt-injection': { id: 'LLM01', name: 'Prompt Injection', color: '#dc2626' },
  'sensitive-data': { id: 'LLM02', name: 'Sensitive Info Disclosure', color: '#ea580c' },
  'supply-chain': { id: 'LLM03', name: 'Supply Chain', color: '#d97706' },
  'data-poisoning': { id: 'LLM04', name: 'Data/Model Poisoning', color: '#ca8a04' },
  'output-handling': { id: 'LLM05', name: 'Improper Output Handling', color: '#65a30d' },
  'excessive-agency': { id: 'LLM06', name: 'Excessive Agency', color: '#16a34a' },
  'system-prompt': { id: 'LLM07', name: 'System Prompt Leakage', color: '#0d9488' },
  'vector-embedding': { id: 'LLM08', name: 'Vector/Embedding Weaknesses', color: '#0891b2' },
  'misinformation': { id: 'LLM09', name: 'Misinformation', color: '#2563eb' },
  'unbounded-consumption': { id: 'LLM10', name: 'Unbounded Consumption', color: '#7c3aed' },
};

interface AttackSurfaceViewProps {
  agents?: AgentRegistryEntry[];
  tools?: ToolRegistryEntry[];
  mcpServers?: McpServerEntry[];
}

export default function AttackSurfaceView({
  agents = ALL_AGENTS,
  tools = TOOL_REGISTRY,
  mcpServers = MCP_SERVER_REGISTRY,
}: AttackSurfaceViewProps) {
  const stats = useMemo(() => {
    const scopeCounts = { 1: 0, 2: 0, 3: 0, 4: 0 } as Record<AgentScopeLevel, number>;
    const dataDomains = new Set<string>();
    const a2aEdges: Array<{ from: string; to: string }> = [];
    let unguardrailed = 0;

    for (const agent of agents) {
      scopeCounts[agent.scopeLevel]++;
      if (!agent.guardrailId) unguardrailed++;
      agent.dataAccess?.forEach(d => dataDomains.add(d));
      agent.invokesAgents?.forEach(target => a2aEdges.push({ from: agent.id, to: target }));
    }

    const toolRiskCounts = { low: 0, medium: 0, high: 0, critical: 0 };
    let toolsRequiringApproval = 0;
    for (const tool of tools) {
      toolRiskCounts[tool.riskLevel]++;
      if (tool.requiresHumanApproval) toolsRequiringApproval++;
    }

    const serverStatusCounts = { operational: 0, degraded: 0, maintenance: 0, unregistered: 0 };
    let ungoverned = 0;
    for (const server of mcpServers) {
      serverStatusCounts[server.status]++;
      if (!server.governed) ungoverned++;
    }

    return {
      agents: {
        total: agents.length,
        scopeCounts,
        unguardrailed,
        highAutonomy: scopeCounts[3] + scopeCounts[4],
      },
      tools: {
        total: tools.length,
        riskCounts: toolRiskCounts,
        highRisk: toolRiskCounts.high + toolRiskCounts.critical,
        requiresApproval: toolsRequiringApproval,
      },
      mcpServers: {
        total: mcpServers.length,
        statusCounts: serverStatusCounts,
        ungoverned,
        unhealthy: serverStatusCounts.degraded + serverStatusCounts.maintenance + serverStatusCounts.unregistered,
      },
      dataDomains: Array.from(dataDomains).sort(),
      a2aEdges,
    };
  }, [agents, tools, mcpServers]);

  const owaspExposure = useMemo(() => {
    const exposure: Array<{ key: string; meta: typeof OWASP_MAPPING[string]; surfaces: string[]; severity: 'high' | 'medium' | 'low' }> = [];

    if (stats.agents.highAutonomy > 0) {
      exposure.push({
        key: 'excessive-agency',
        meta: OWASP_MAPPING['excessive-agency'],
        surfaces: [`${stats.agents.highAutonomy} agents at L3+ autonomy`],
        severity: stats.agents.scopeCounts[4] > 0 ? 'high' : 'medium',
      });
    }

    if (stats.tools.highRisk > 0) {
      exposure.push({
        key: 'output-handling',
        meta: OWASP_MAPPING['output-handling'],
        surfaces: [`${stats.tools.highRisk} high/critical risk tools`],
        severity: stats.tools.riskCounts.critical > 0 ? 'high' : 'medium',
      });
    }

    if (stats.agents.unguardrailed > 0) {
      exposure.push({
        key: 'prompt-injection',
        meta: OWASP_MAPPING['prompt-injection'],
        surfaces: [`${stats.agents.unguardrailed} agents without guardrails`],
        severity: 'high',
      });
    }

    if (stats.dataDomains.some(d => d.toLowerCase().includes('pii') || d.toLowerCase().includes('customer'))) {
      exposure.push({
        key: 'sensitive-data',
        meta: OWASP_MAPPING['sensitive-data'],
        surfaces: [`${stats.dataDomains.filter(d => d.toLowerCase().includes('pii') || d.toLowerCase().includes('customer')).length} PII data domains`],
        severity: 'high',
      });
    }

    if (stats.mcpServers.ungoverned > 0) {
      exposure.push({
        key: 'supply-chain',
        meta: OWASP_MAPPING['supply-chain'],
        surfaces: [`${stats.mcpServers.ungoverned} ungoverned MCP servers`],
        severity: 'high',
      });
    }

    if (stats.a2aEdges.length > 0) {
      exposure.push({
        key: 'excessive-agency',
        meta: OWASP_MAPPING['excessive-agency'],
        surfaces: [`${stats.a2aEdges.length} A2A trust relationships`],
        severity: 'medium',
      });
    }

    return exposure;
  }, [stats]);

  const severityColor = { high: 'text-rose-700 bg-rose-100', medium: 'text-amber-700 bg-amber-100', low: 'text-slate-600 bg-slate-100' };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-slate-900">AI Attack Surface</h2>
            <MockDataBadge integration="Agent Registry + Tool Registry + MCP Servers" />
          </div>
          <p className="text-[11px] text-slate-500">
            Threat-focused inventory of AI components: agents, tools, data access, and integration points mapped to OWASP LLM Top 10.
          </p>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <StatCard label="Agents" value={stats.agents.total} sub={`${stats.agents.highAutonomy} at L3+`} />
        <StatCard label="Tools" value={stats.tools.total} sub={`${stats.tools.highRisk} high/crit risk`} variant={stats.tools.highRisk > 0 ? 'warning' : 'info'} />
        <StatCard label="MCP Servers" value={stats.mcpServers.total} sub={`${stats.mcpServers.unhealthy} unhealthy`} variant={stats.mcpServers.unhealthy > 0 ? 'warning' : 'success'} />
        <StatCard label="Data Domains" value={stats.dataDomains.length} sub="accessed by agents" variant="info" />
        <StatCard label="A2A Trust Edges" value={stats.a2aEdges.length} sub="agent-to-agent" variant={stats.a2aEdges.length > 5 ? 'warning' : 'info'} />
        <StatCard label="Unguardrailed" value={stats.agents.unguardrailed} sub="agents" variant={stats.agents.unguardrailed > 0 ? 'danger' : 'success'} />
      </div>

      {/* OWASP Exposure */}
      {owaspExposure.length > 0 && (
        <div className={card}>
          <h3 className="text-sm font-semibold text-slate-900 mb-3">OWASP LLM Top 10 Exposure</h3>
          <div className="space-y-2">
            {owaspExposure.map(e => (
              <div key={e.key + e.surfaces.join()} className="flex items-center gap-3 p-2 rounded-lg bg-slate-50/50">
                <span className="text-[10px] font-bold px-2 py-0.5 rounded" style={{ background: e.meta.color, color: 'white' }}>
                  {e.meta.id}
                </span>
                <span className="text-xs font-medium text-slate-700 flex-1">{e.meta.name}</span>
                <span className="text-[11px] text-slate-500">{e.surfaces.join(', ')}</span>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${severityColor[e.severity]}`}>
                  {e.severity.toUpperCase()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Agents by Scope */}
        <div className={card}>
          <h3 className="text-sm font-semibold text-slate-900 mb-3">Agents by Autonomy Scope</h3>
          <div className="space-y-2">
            {([4, 3, 2, 1] as AgentScopeLevel[]).map(level => {
              const count = stats.agents.scopeCounts[level];
              const pct = stats.agents.total > 0 ? Math.round((count / stats.agents.total) * 100) : 0;
              const meta = AGENT_SCOPE_META[level];
              return (
                <div key={level} className="flex items-center gap-3">
                  <span className="w-6 text-xs font-semibold text-slate-500">L{level}</span>
                  <div className="flex-1 h-3 rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: meta.color }} />
                  </div>
                  <span className="w-8 text-right text-xs tabular-nums text-slate-600">{count}</span>
                  <span className="w-20 text-[10px] text-slate-400 truncate">{meta.name}</span>
                </div>
              );
            })}
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100 text-[10px] text-slate-500">
            L3+ agents have elevated blast radius — {stats.agents.highAutonomy} of {stats.agents.total} ({stats.agents.total > 0 ? Math.round((stats.agents.highAutonomy / stats.agents.total) * 100) : 0}%)
          </div>
        </div>

        {/* Tools by Risk */}
        <div className={card}>
          <h3 className="text-sm font-semibold text-slate-900 mb-3">Tools by Risk Level</h3>
          <div className="grid grid-cols-4 gap-2">
            {(['critical', 'high', 'medium', 'low'] as const).map(level => {
              const count = stats.tools.riskCounts[level];
              const colors = {
                critical: 'bg-rose-100 text-rose-700',
                high: 'bg-orange-100 text-orange-700',
                medium: 'bg-amber-100 text-amber-700',
                low: 'bg-emerald-100 text-emerald-700',
              };
              return (
                <div key={level} className={`rounded-lg p-3 text-center ${colors[level]}`}>
                  <div className="text-lg font-bold tabular-nums">{count}</div>
                  <div className="text-[10px] font-semibold uppercase">{level}</div>
                </div>
              );
            })}
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100 text-[10px] text-slate-500">
            {stats.tools.requiresApproval} tools require human approval before invocation
          </div>
        </div>

        {/* Data Domains */}
        <div className={card}>
          <h3 className="text-sm font-semibold text-slate-900 mb-3">Data Domains Accessed</h3>
          <div className="flex flex-wrap gap-1.5">
            {stats.dataDomains.map(domain => {
              const isPii = domain.toLowerCase().includes('pii') || domain.toLowerCase().includes('customer') || domain.toLowerCase().includes('identity');
              return (
                <span
                  key={domain}
                  className={`text-[10px] px-2 py-1 rounded-full ${isPii ? 'bg-rose-100 text-rose-700 font-semibold' : 'bg-slate-100 text-slate-600'}`}
                >
                  {domain}
                </span>
              );
            })}
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100 text-[10px] text-slate-500">
            {stats.dataDomains.filter(d => d.toLowerCase().includes('pii') || d.toLowerCase().includes('customer')).length} domains contain PII or customer data
          </div>
        </div>

        {/* MCP Servers */}
        <div className={card}>
          <h3 className="text-sm font-semibold text-slate-900 mb-3">MCP Server Status</h3>
          <div className="space-y-1.5">
            {mcpServers.map(server => {
              const statusColor = {
                operational: 'bg-emerald-500',
                degraded: 'bg-amber-500',
                maintenance: 'bg-blue-500',
                unregistered: 'bg-rose-500',
              };
              return (
                <div key={server.id} className="flex items-center gap-2 text-xs">
                  <span className={`w-2 h-2 rounded-full ${statusColor[server.status]}`} />
                  <span className="flex-1 truncate text-slate-700">{server.name}</span>
                  <span className="text-slate-400">{server.toolCount} tools</span>
                  {!server.governed && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 font-semibold">SHADOW</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* A2A Trust Graph (simple list view) */}
      {stats.a2aEdges.length > 0 && (
        <div className={card}>
          <h3 className="text-sm font-semibold text-slate-900 mb-3">Agent-to-Agent Trust Relationships</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {stats.a2aEdges.map((edge, i) => {
              const fromAgent = agents.find(a => a.id === edge.from);
              const toAgent = agents.find(a => a.id === edge.to);
              return (
                <div key={i} className="flex items-center gap-2 text-xs p-2 rounded bg-slate-50">
                  <span className="font-medium text-slate-700 truncate">{fromAgent?.name || edge.from}</span>
                  <span className="text-slate-400">→</span>
                  <span className="text-slate-600 truncate">{toAgent?.name || edge.to}</span>
                </div>
              );
            })}
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100 text-[10px] text-slate-500">
            Each edge represents an agent authorized to invoke another agent — potential lateral movement path
          </div>
        </div>
      )}
    </div>
  );
}
