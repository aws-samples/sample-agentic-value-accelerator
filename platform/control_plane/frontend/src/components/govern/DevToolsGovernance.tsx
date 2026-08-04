/**
 * AgenticCodingGovernance — Enterprise governance for agentic coding tools
 *
 * Provides visibility and control over AI-powered coding assistants:
 * - Dashboard: Usage metrics, API routing compliance, risk overview
 * - Inventory: Detected tools with status, routing, cost
 * - Policies: Allowed tools, routing requirements, context filters
 * - Detection: Shadow usage discovery, direct API alerts
 * - Analytics: Cost trends, token usage, compliance metrics
 */

import React, { useState, useMemo, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, AreaChart, Area, Legend,
} from 'recharts';
import {
  CODING_TOOL_CONFIG, CODING_TOOL_INSTANCES, API_ROUTING_CONFIG,
  type CodingToolStatus, type APIRoutingType,
  tooltipStyle,
} from './mockData';
import GovernPageLayout from './GovernPageLayout';
import UnifiedGuide, { DEV_TOOLS_GUIDE } from './UnifiedGuide';
import { MockDataBadge, LiveDataBadge } from './DataSourceIndicator';
import { Icon, type IconName } from './icons';
import { governDeveloperAiApi, type DeveloperAiUsageResponse } from '../../api/client';

type ViewTab = 'dashboard' | 'inventory' | 'policies' | 'detection' | 'analytics';

const TABS: { id: ViewTab; label: string; icon: IconName }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: 'squares-2x2' },
  { id: 'inventory', label: 'Inventory', icon: 'rectangle-stack' },
  { id: 'policies', label: 'Policies', icon: 'shield-check' },
  { id: 'detection', label: 'Detection', icon: 'magnifying-glass' },
  { id: 'analytics', label: 'Analytics', icon: 'chart-bar' },
];

function statusBadge(status: CodingToolStatus) {
  const styles: Record<CodingToolStatus, string> = {
    sanctioned: 'bg-emerald-100 text-emerald-700',
    'under-review': 'bg-amber-100 text-amber-700',
    unsanctioned: 'bg-rose-100 text-rose-700',
    blocked: 'bg-slate-200 text-slate-600',
  };
  const labels: Record<CodingToolStatus, string> = {
    sanctioned: 'Sanctioned',
    'under-review': 'Under Review',
    unsanctioned: 'Unsanctioned',
    blocked: 'Blocked',
  };
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}

function routingBadge(routing: APIRoutingType) {
  const config = API_ROUTING_CONFIG[routing];
  return (
    <span
      className={`inline-flex px-2 py-0.5 rounded text-[10px] font-semibold ${config.compliant ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}
      title={config.description}
    >
      {config.label}
    </span>
  );
}

function riskBadge(score: number) {
  if (score <= 25) return <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-700">Low</span>;
  if (score <= 50) return <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-700">Medium</span>;
  if (score <= 75) return <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-semibold bg-orange-100 text-orange-700">High</span>;
  return <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-100 text-rose-700">Critical</span>;
}

export default function DevToolsGovernance() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab') as ViewTab | null;
  const activeTab = tabParam && TABS.some(t => t.id === tabParam) ? tabParam : 'dashboard';

  const [statusFilter, setStatusFilter] = useState<'all' | CodingToolStatus>('all');
  const [selectedTool, setSelectedTool] = useState<string | null>(null);
  const [toolStatuses, setToolStatuses] = useState<Record<string, CodingToolStatus>>(
    Object.fromEntries(CODING_TOOL_INSTANCES.map(t => [t.id, t.status]))
  );
  const [showActionToast, setShowActionToast] = useState<string | null>(null);

  // Live data from API
  const [liveData, setLiveData] = useState<DeveloperAiUsageResponse | null>(null);
  const [liveDataLoading, setLiveDataLoading] = useState(true);

  // Fetch live usage data from API
  useEffect(() => {
    let cancelled = false;
    setLiveDataLoading(true);
    governDeveloperAiApi.usage()
      .then(d => { if (!cancelled) setLiveData(d); })
      .catch(() => { /* Fall back to mock data if API unavailable */ })
      .finally(() => { if (!cancelled) setLiveDataLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // Focus trap for tool detail drawer
  useEffect(() => {
    if (!selectedTool) return;

    const drawer = document.querySelector('[role="dialog"]');
    if (!drawer) return;

    const focusableEls = drawer.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const firstEl = focusableEls[0] as HTMLElement;
    const lastEl = focusableEls[focusableEls.length - 1] as HTMLElement;

    firstEl?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedTool(null);
        return;
      }
      if (e.key !== 'Tab') return;

      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl?.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl?.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [selectedTool]);

  const isLiveData = liveData?.live === true;

  const setActiveTab = (tab: ViewTab) => {
    setSearchParams({ tab });
  };

  // Computed stats - merges live data with mock tool inventory
  const stats = useMemo(() => {
    const tools = CODING_TOOL_INSTANCES;
    const activeTools = tools.filter(t => t.status !== 'blocked');
    const sanctioned = tools.filter(t => t.status === 'sanctioned');
    const compliantRouting = activeTools.filter(t => API_ROUTING_CONFIG[t.apiRouting].compliant);

    // Use live data for active users and cost when available (flat fields from backend)
    const liveActiveUsers = liveData?.active_users;
    const liveCost = liveData?.total_cost_usd;
    const liveTokens = liveData?.total_tokens;

    // Shadow AI count from live data — prefer total_shadow_events if available
    const liveShadowCount = liveData?.shadow_ai?.total_shadow_events
      ?? (liveData?.shadow_ai
        ? (liveData.shadow_ai.unapproved_users?.length || 0) +
          (liveData.shadow_ai.unknown_tools?.length || 0) +
          (liveData.shadow_ai.unapproved_models?.length || 0)
        : null);

    return {
      totalTools: tools.length,
      sanctioned: sanctioned.length,
      underReview: tools.filter(t => t.status === 'under-review').length,
      unsanctioned: tools.filter(t => t.status === 'unsanctioned').length,
      blocked: tools.filter(t => t.status === 'blocked').length,
      totalUsers: tools.reduce((sum, t) => sum + t.userCount, 0),
      activeUsers: liveActiveUsers ?? activeTools.reduce((sum, t) => sum + t.userCount, 0),
      routingCompliance: activeTools.length > 0 ? Math.round((compliantRouting.length / activeTools.length) * 100) : 0,
      totalCost: liveCost ?? tools.reduce((sum, t) => sum + t.costMonthly, 0), // total_cost_usd is already the total
      totalTokens: liveTokens ?? tools.reduce((sum, t) => sum + t.tokensConsumed30d, 0),
      totalLines: tools.reduce((sum, t) => sum + t.linesShared30d, 0),
      shadowCount: liveShadowCount ?? tools.filter(t => t.status === 'unsanctioned' || t.status === 'under-review').length,
      // Track which stats are from live data
      hasLiveUsers: liveActiveUsers != null,
      hasLiveCost: liveCost != null,
    };
  }, [liveData]);

  const filteredTools = useMemo(() => {
    if (statusFilter === 'all') return CODING_TOOL_INSTANCES;
    return CODING_TOOL_INSTANCES.filter(t => t.status === statusFilter);
  }, [statusFilter]);

  const toolDistribution = useMemo(() => {
    return CODING_TOOL_INSTANCES.filter(t => t.status !== 'blocked').map(t => ({
      name: CODING_TOOL_CONFIG[t.toolType].label,
      value: t.userCount,
      color: CODING_TOOL_CONFIG[t.toolType].color,
    }));
  }, []);

  const routingDistribution = useMemo(() => {
    const byRouting: Record<string, number> = {};
    CODING_TOOL_INSTANCES.filter(t => t.status !== 'blocked').forEach(t => {
      const label = API_ROUTING_CONFIG[t.apiRouting].label;
      byRouting[label] = (byRouting[label] || 0) + t.userCount;
    });
    return Object.entries(byRouting).map(([name, value]) => ({
      name,
      value,
      color: Object.values(API_ROUTING_CONFIG).find(c => c.label === name)?.color || '#6B7280',
      compliant: Object.values(API_ROUTING_CONFIG).find(c => c.label === name)?.compliant || false,
    }));
  }, []);

  const selectedToolData = selectedTool ? CODING_TOOL_INSTANCES.find(t => t.id === selectedTool) : null;

  return (
    <GovernPageLayout
      title="Agentic Coding Governance"
      description="Govern AI-powered coding assistants — track API routing, code context exposure, and enforce developer tool policies."
      iconName="code-bracket"
      badge={isLiveData
        ? <LiveDataBadge source={liveData?.source} detail="Live team breakdown and usage data" />
        : <MockDataBadge integration="Amazon Q Developer + Amazon Bedrock" />}
      primaryAction={{ label: 'Shadow AI', to: '/govern/shadow-ai' }}
    >
      {/* How to Use Guide */}
      <UnifiedGuide {...DEV_TOOLS_GUIDE} />

      {/* Tab Navigation */}
      <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl mb-6 overflow-x-auto" role="tablist">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
              activeTab === tab.id
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
            }`}
          >
            <Icon name={tab.icon} className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* ════════════════════════════════ DASHBOARD TAB ════════════════════════════════ */}
      {activeTab === 'dashboard' && (
        <div className="space-y-6">
          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-4">
              <div className="text-xs font-medium text-slate-500 mb-1">Tools Detected</div>
              <div className="text-2xl font-bold text-slate-900">{stats.totalTools}</div>
              <div className="text-[10px] text-slate-500 mt-1">{stats.sanctioned} sanctioned, {stats.unsanctioned + stats.underReview} shadow</div>
            </div>
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-4">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-xs font-medium text-slate-500">Active Users</span>
                {stats.hasLiveUsers && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" title="Live data" />}
              </div>
              <div className="text-2xl font-bold text-blue-600">{stats.activeUsers.toLocaleString()}</div>
              <div className="text-[10px] text-slate-500 mt-1">across all tools</div>
            </div>
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-4">
              <div className="text-xs font-medium text-slate-500 mb-1">API Compliance</div>
              <div className={`text-2xl font-bold ${stats.routingCompliance >= 80 ? 'text-emerald-600' : stats.routingCompliance >= 50 ? 'text-amber-600' : 'text-rose-600'}`}>
                {stats.routingCompliance}%
              </div>
              <div className="text-[10px] text-slate-500 mt-1">routed through governed APIs</div>
            </div>
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-4">
              <div className="text-xs font-medium text-slate-500 mb-1">Context Exposure</div>
              <div className="text-2xl font-bold text-rose-600">{(stats.totalLines / 1000000).toFixed(1)}M</div>
              <div className="text-[10px] text-slate-500 mt-1">lines of code shared (30d)</div>
            </div>
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-4">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-xs font-medium text-slate-500">Monthly Cost</span>
                {stats.hasLiveCost && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" title="Live data" />}
              </div>
              <div className="text-2xl font-bold text-emerald-600">${(stats.totalCost / 1000).toFixed(1)}K</div>
              <div className="text-[10px] text-slate-500 mt-1">all coding tools</div>
            </div>
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-4">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-xs font-medium text-slate-500">Shadow Usage</span>
                {isLiveData && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" title="Live data" />}
              </div>
              <div className={`text-2xl font-bold ${stats.shadowCount > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{stats.shadowCount}</div>
              <div className="text-[10px] text-slate-500 mt-1">ungoverned tools detected</div>
            </div>
          </div>

          {/* Loading skeleton for Live Activity */}
          {liveDataLoading && !liveData && (
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5 animate-pulse">
              <div className="flex items-center gap-2 mb-5">
                <div className="w-2 h-2 rounded-full bg-slate-300" />
                <div className="h-4 w-48 bg-slate-200 rounded" />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
                {[1, 2, 3, 4].map(i => (
                  <div key={i} className="text-center p-3 rounded-lg bg-slate-100 border border-slate-200">
                    <div className="h-6 w-8 bg-slate-200 rounded mx-auto mb-1" />
                    <div className="h-3 w-12 bg-slate-200 rounded mx-auto" />
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {[1, 2, 3].map(i => (
                  <div key={i} className="bg-slate-50 rounded-lg p-3 border border-slate-200">
                    <div className="h-4 w-24 bg-slate-200 rounded mb-2" />
                    <div className="space-y-2">
                      {[1, 2, 3].map(j => (
                        <div key={j} className="h-8 bg-slate-200 rounded" />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Live Agentic Coding Usage — from CloudTrail */}
          {liveData?.shadow_ai && (liveData.shadow_ai.unknown_tools?.length > 0 || liveData.shadow_ai.unapproved_users?.length > 0) && (
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-emerald-200/60 shadow-sm p-5">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-sm font-semibold text-slate-900">Live Agentic Coding Activity</span>
                </div>
                <LiveDataBadge source="CloudTrail" />
              </div>

              {/* Summary Stats */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
                <div className="text-center p-3 rounded-lg bg-amber-50 border border-amber-200">
                  <div className="text-xl font-bold text-slate-900">{liveData.shadow_ai.unknown_tools?.length || 0}</div>
                  <div className="text-[10px] text-amber-700">Tools</div>
                </div>
                <div className="text-center p-3 rounded-lg bg-blue-50 border border-blue-200">
                  <div className="text-xl font-bold text-slate-900">{liveData.shadow_ai.unapproved_users?.length || 0}</div>
                  <div className="text-[10px] text-blue-700">Users</div>
                </div>
                <div className="text-center p-3 rounded-lg bg-purple-50 border border-purple-200">
                  <div className="text-xl font-bold text-slate-900">{liveData.shadow_ai.unapproved_models?.length || 0}</div>
                  <div className="text-[10px] text-purple-700">Models</div>
                </div>
                <div className="text-center p-3 rounded-lg bg-emerald-50 border border-emerald-200">
                  <div className="text-xl font-bold text-slate-900">
                    {liveData.shadow_ai.unknown_tools?.reduce((sum, t) => sum + t.requests, 0) || 0}
                  </div>
                  <div className="text-[10px] text-emerald-700">API Calls</div>
                </div>
              </div>

              {/* Detailed Lists */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Tools */}
                <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
                  <div className="text-xs font-medium text-slate-600 mb-2 flex items-center gap-1.5">
                    <Icon name="command-line" className="w-3.5 h-3.5" />
                    Active Tools
                  </div>
                  <div className="space-y-2">
                    {liveData.shadow_ai.unknown_tools?.slice(0, 3).map((tool, i) => (
                      <div key={i} className="flex items-center justify-between p-2 rounded bg-white border border-slate-100">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <div className="w-2 h-2 rounded-full bg-amber-500 flex-shrink-0" />
                          <span className="text-xs font-medium text-slate-800 truncate" title={tool.tool_name}>{tool.tool_name}</span>
                        </div>
                        <span className="text-xs text-slate-500 ml-2 flex-shrink-0">{tool.requests} req</span>
                      </div>
                    ))}
                    {(!liveData.shadow_ai.unknown_tools || liveData.shadow_ai.unknown_tools.length === 0) && (
                      <div className="text-xs text-slate-400 text-center py-2">No tools detected</div>
                    )}
                  </div>
                </div>

                {/* Users */}
                <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
                  <div className="text-xs font-medium text-slate-600 mb-2 flex items-center gap-1.5">
                    <Icon name="users" className="w-3.5 h-3.5" />
                    Active Users
                  </div>
                  <div className="space-y-2">
                    {liveData.shadow_ai.unapproved_users?.slice(0, 3).map((user, i) => (
                      <div key={i} className="flex items-center justify-between p-2 rounded bg-white border border-slate-100">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <div className="w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center text-[10px] font-medium text-blue-700 flex-shrink-0">
                            {user.email.charAt(0).toUpperCase()}
                          </div>
                          <span className="text-xs font-medium text-slate-800 truncate" title={user.email}>{user.email}</span>
                        </div>
                        <span className="text-xs text-slate-500 ml-2 flex-shrink-0">{(user.tokens / 1000).toFixed(0)}k</span>
                      </div>
                    ))}
                    {(!liveData.shadow_ai.unapproved_users || liveData.shadow_ai.unapproved_users.length === 0) && (
                      <div className="text-xs text-slate-400 text-center py-2">No users detected</div>
                    )}
                  </div>
                </div>

                {/* Models */}
                <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
                  <div className="text-xs font-medium text-slate-600 mb-2 flex items-center gap-1.5">
                    <Icon name="cpu-chip" className="w-3.5 h-3.5" />
                    Models Used
                  </div>
                  <div className="space-y-2">
                    {liveData.shadow_ai.unapproved_models?.slice(0, 3).map((model, i) => {
                      const shortName = model.model_id.split('/').pop()?.replace(/v\d+:\d+$/, '').replace('us.anthropic.', '').replace('us.amazon.', '') || model.model_id;
                      return (
                        <div key={i} className="flex items-center justify-between p-2 rounded bg-white border border-slate-100">
                          <span className="text-xs font-medium text-slate-800 truncate flex-1 min-w-0" title={model.model_id}>
                            {shortName}
                          </span>
                          <span className="text-xs text-emerald-600 font-medium ml-2 flex-shrink-0">${model.cost.toFixed(2)}</span>
                        </div>
                      );
                    })}
                    {(!liveData.shadow_ai.unapproved_models || liveData.shadow_ai.unapproved_models.length === 0) && (
                      <div className="text-xs text-slate-400 text-center py-2">No models detected</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Tool Distribution */}
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
              <div className="text-sm font-semibold text-slate-900 mb-4">Users by Coding Tool</div>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie
                    data={toolDistribution}
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={70}
                    dataKey="value"
                    label={false}
                  >
                    {toolDistribution.map((entry, index) => (
                      <Cell key={index} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} formatter={(value: number, name: string) => [`${value} users`, name]} />
                  <Legend
                    layout="vertical"
                    align="right"
                    verticalAlign="middle"
                    iconType="circle"
                    iconSize={8}
                    wrapperStyle={{ fontSize: '11px', paddingLeft: '10px' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* API Routing Compliance */}
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
              <div className="text-sm font-semibold text-slate-900 mb-4">API Routing Compliance</div>
              <div className="space-y-3">
                {routingDistribution.map((entry, index) => (
                  <div key={index} className="flex items-center gap-3">
                    <div className="w-24 text-xs font-medium text-slate-700">{entry.name}</div>
                    <div className="flex-1 h-6 bg-slate-100 rounded-full overflow-hidden relative">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${Math.min((entry.value / stats.activeUsers) * 100, 100)}%`,
                          backgroundColor: entry.compliant ? '#10B981' : '#EF4444'
                        }}
                      />
                      <span className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold text-slate-700">
                        {entry.value} users
                      </span>
                    </div>
                    <span className={`w-20 text-right text-[10px] font-semibold ${entry.compliant ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {entry.compliant ? 'Governed' : 'Ungoverned'}
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-4 p-3 rounded-lg bg-slate-50 flex items-center justify-between">
                <div className="text-xs text-slate-600">
                  <span className="font-semibold text-slate-900">{stats.routingCompliance}%</span> of users on governed APIs
                </div>
                <div className="flex items-center gap-3 text-[10px]">
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Bedrock / Azure / Vertex</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-rose-500" /> Direct API</span>
                </div>
              </div>
            </div>
          </div>

          {/* Tool Capability Matrix */}
          <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="text-sm font-semibold text-slate-900">Tool Governance Capabilities</div>
              <div className="text-xs text-slate-500">Enterprise readiness comparison</div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50/50">
                    <th scope="col" className="text-left px-4 py-2 font-medium text-slate-600">Tool</th>
                    <th scope="col" className="text-center px-4 py-2 font-medium text-slate-600">Bedrock</th>
                    <th scope="col" className="text-center px-4 py-2 font-medium text-slate-600">Azure</th>
                    <th scope="col" className="text-center px-4 py-2 font-medium text-slate-600">Self-Host</th>
                    <th scope="col" className="text-center px-4 py-2 font-medium text-slate-600">Prompt Log</th>
                    <th scope="col" className="text-center px-4 py-2 font-medium text-slate-600">Enterprise</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(CODING_TOOL_CONFIG).filter(([key]) => key !== 'other').map(([key, config]) => (
                    <tr key={key} className="border-t border-slate-100 hover:bg-slate-50/50">
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: config.color }} />
                          <span className="font-medium text-slate-900">{config.label}</span>
                          <span className="text-[10px] text-slate-400">{config.vendor}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2 text-center">
                        {config.routingOptions.includes('bedrock') ? (
                          <span className="text-emerald-600">✓</span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-center">
                        {config.routingOptions.includes('azure-openai') ? (
                          <span className="text-emerald-600">✓</span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-center">
                        {config.selfHosted ? (
                          <span className="text-emerald-600">✓</span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-center">
                        {config.promptLogging ? (
                          <span className="text-emerald-600">✓</span>
                        ) : (
                          <span className="text-rose-500">✗</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-center">
                        {config.enterpriseTier ? (
                          <span className="text-emerald-600">✓</span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4 p-3 rounded-lg bg-amber-50 border border-amber-200">
              <div className="flex items-start gap-2">
                <Icon name="exclamation-triangle" className="w-4 h-4 text-amber-600 mt-0.5" />
                <div className="text-xs text-amber-800">
                  <strong>Governance Gap:</strong> GitHub Copilot and Cursor cannot be routed through AWS Bedrock or Azure OpenAI.
                  They use direct vendor APIs, bypassing enterprise guardrails and audit logging. Consider Claude Code, Kiro, Cody, or Tabnine for governed alternatives.
                </div>
              </div>
            </div>
          </div>

          {/* Risk Overview */}
          <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
            <div className="text-sm font-semibold text-slate-900 mb-4">Tool Risk Assessment</div>
            <div className="space-y-3">
              {CODING_TOOL_INSTANCES.sort((a, b) => b.riskScore - a.riskScore).map(tool => {
                const config = CODING_TOOL_CONFIG[tool.toolType];
                return (
                  <div key={tool.id} className="flex items-center gap-4 p-3 rounded-lg bg-slate-50 hover:bg-slate-100 transition-colors">
                    <div className="flex items-center gap-2 w-40">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: config.color }} />
                      <span className="text-sm font-medium text-slate-900">{config.label}</span>
                    </div>
                    <div className="flex-1">
                      <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            tool.riskScore <= 25 ? 'bg-emerald-500' :
                            tool.riskScore <= 50 ? 'bg-amber-500' :
                            tool.riskScore <= 75 ? 'bg-orange-500' : 'bg-rose-500'
                          }`}
                          style={{ width: `${tool.riskScore}%` }}
                        />
                      </div>
                    </div>
                    <div className="w-16 text-right">
                      {riskBadge(tool.riskScore)}
                    </div>
                    <div className="w-24">
                      {statusBadge(tool.status)}
                    </div>
                    <div className="w-24 text-right text-xs text-slate-600">
                      {tool.userCount} users
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════ INVENTORY TAB ════════════════════════════════ */}
      {activeTab === 'inventory' && (
        <div className="space-y-6">
          {/* Filter Bar */}
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-xs font-medium text-slate-600">Filter by Status:</span>
            <div className="flex gap-1 flex-wrap">
              {(['all', 'sanctioned', 'under-review', 'unsanctioned', 'blocked'] as const).map(status => (
                <button
                  key={status}
                  onClick={() => setStatusFilter(status)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    statusFilter === status
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {status === 'all' ? 'All' : status === 'under-review' ? 'Under Review' : status.charAt(0).toUpperCase() + status.slice(1)}
                  {status === 'all' && ` (${CODING_TOOL_INSTANCES.length})`}
                </button>
              ))}
            </div>
          </div>

          {/* Tools Table */}
          <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50/50">
                    <th scope="col" className="text-left px-4 py-3 font-medium text-slate-600">Tool</th>
                    <th scope="col" className="text-left px-4 py-3 font-medium text-slate-600">Vendor</th>
                    <th scope="col" className="text-center px-4 py-3 font-medium text-slate-600">Status</th>
                    <th scope="col" className="text-center px-4 py-3 font-medium text-slate-600">Routing</th>
                    <th scope="col" className="text-right px-4 py-3 font-medium text-slate-600">Users</th>
                    <th scope="col" className="text-right px-4 py-3 font-medium text-slate-600">Cost/Mo</th>
                    <th scope="col" className="text-center px-4 py-3 font-medium text-slate-600">Risk</th>
                    <th scope="col" className="text-center px-4 py-3 font-medium text-slate-600">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTools.map(tool => {
                    const config = CODING_TOOL_CONFIG[tool.toolType];
                    return (
                      <tr key={tool.id} className="border-t border-slate-100 hover:bg-slate-50/50">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: config.color }} />
                            <div>
                              <div className="font-medium text-slate-900">{config.label}</div>
                              <div className="text-[10px] text-slate-500">v{tool.version}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-600">{config.vendor}</td>
                        <td className="px-4 py-3 text-center">{statusBadge(tool.status)}</td>
                        <td className="px-4 py-3 text-center">{routingBadge(tool.apiRouting)}</td>
                        <td className="px-4 py-3 text-right text-slate-700">{tool.userCount}</td>
                        <td className="px-4 py-3 text-right text-slate-700">${tool.costMonthly.toLocaleString()}</td>
                        <td className="px-4 py-3 text-center">{riskBadge(tool.riskScore)}</td>
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={() => setSelectedTool(tool.id)}
                            className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                          >
                            View
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Tool Detail Drawer */}
          {selectedToolData && (
            <div
              className="fixed inset-y-0 right-0 w-full max-w-lg bg-white shadow-2xl border-l border-slate-200 z-50 overflow-y-auto"
              role="dialog"
              aria-modal="true"
            >
              <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: CODING_TOOL_CONFIG[selectedToolData.toolType].color }} />
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900">{CODING_TOOL_CONFIG[selectedToolData.toolType].label}</h3>
                    <div className="text-xs text-slate-500">v{selectedToolData.version} • {CODING_TOOL_CONFIG[selectedToolData.toolType].vendor}</div>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedTool(null)}
                  className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
                  aria-label="Close"
                >
                  <Icon name="x-mark" className="w-5 h-5 text-slate-500" />
                </button>
              </div>

              <div className="p-6 space-y-6">
                {/* Status & Routing */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 rounded-lg bg-slate-50">
                    <div className="text-[10px] font-medium text-slate-500 mb-1">Status</div>
                    {statusBadge(toolStatuses[selectedToolData.id])}
                  </div>
                  <div className="p-3 rounded-lg bg-slate-50">
                    <div className="text-[10px] font-medium text-slate-500 mb-1">API Routing</div>
                    {routingBadge(selectedToolData.apiRouting)}
                  </div>
                </div>

                {/* Usage Stats */}
                <div>
                  <div className="text-sm font-semibold text-slate-900 mb-3">Usage Statistics</div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 rounded-lg bg-slate-50">
                      <div className="text-lg font-bold text-slate-900">{selectedToolData.userCount}</div>
                      <div className="text-[10px] text-slate-500">Active Users</div>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-50">
                      <div className="text-lg font-bold text-slate-900">{selectedToolData.repoCount}</div>
                      <div className="text-[10px] text-slate-500">Repos Accessed</div>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-50">
                      <div className="text-lg font-bold text-slate-900">{(selectedToolData.invocations30d / 1000).toFixed(1)}K</div>
                      <div className="text-[10px] text-slate-500">Invocations (30d)</div>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-50">
                      <div className="text-lg font-bold text-slate-900">{(selectedToolData.tokensConsumed30d / 1000000).toFixed(0)}M</div>
                      <div className="text-[10px] text-slate-500">Tokens (30d)</div>
                    </div>
                  </div>
                </div>

                {/* Code Context Exposure */}
                <div>
                  <div className="text-sm font-semibold text-slate-900 mb-3">Code Context Exposure</div>
                  <div className="p-4 rounded-lg bg-rose-50 border border-rose-200">
                    <div className="flex items-center gap-2 mb-2">
                      <Icon name="eye" className="w-4 h-4 text-rose-600" />
                      <span className="text-sm font-semibold text-rose-800">{(selectedToolData.linesShared30d / 1000000).toFixed(1)}M lines shared</span>
                    </div>
                    <div className="text-xs text-rose-700">
                      Code from {selectedToolData.repoCount} repositories has been sent to external AI models in the last 30 days.
                    </div>
                  </div>
                </div>

                {/* Context Filters */}
                <div>
                  <div className="text-sm font-semibold text-slate-900 mb-3">Context Filters</div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between p-2 rounded bg-slate-50">
                      <span className="text-xs text-slate-700">PII Masking</span>
                      <span className={`text-xs font-semibold ${selectedToolData.contextFilters.piiMaskingEnabled ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {selectedToolData.contextFilters.piiMaskingEnabled ? 'Enabled' : 'Disabled'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between p-2 rounded bg-slate-50">
                      <span className="text-xs text-slate-700">Secrets Filter</span>
                      <span className={`text-xs font-semibold ${selectedToolData.contextFilters.secretsFilterEnabled ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {selectedToolData.contextFilters.secretsFilterEnabled ? 'Enabled' : 'Disabled'}
                      </span>
                    </div>
                    {selectedToolData.contextFilters.excludedRepos.length > 0 && (
                      <div className="p-2 rounded bg-slate-50">
                        <span className="text-xs text-slate-700">Excluded Repos:</span>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {selectedToolData.contextFilters.excludedRepos.map(repo => (
                            <span key={repo} className="px-2 py-0.5 rounded bg-slate-200 text-[10px] text-slate-700">{repo}</span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Risk Factors */}
                {selectedToolData.riskFactors.length > 0 && (
                  <div>
                    <div className="text-sm font-semibold text-slate-900 mb-3">Risk Factors</div>
                    <div className="space-y-2">
                      {selectedToolData.riskFactors.map((factor, i) => (
                        <div key={i} className="flex items-start gap-2 p-2 rounded bg-amber-50 border border-amber-200">
                          <Icon name="exclamation-triangle" className="w-4 h-4 text-amber-600 mt-0.5" />
                          <span className="text-xs text-amber-800">{factor}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Teams */}
                <div>
                  <div className="text-sm font-semibold text-slate-900 mb-3">Teams Using</div>
                  <div className="flex flex-wrap gap-2">
                    {selectedToolData.teams.map(team => (
                      <span key={team} className="px-3 py-1.5 rounded-lg bg-slate-100 text-xs font-medium text-slate-700">{team}</span>
                    ))}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-3 pt-4 border-t border-slate-200">
                  {toolStatuses[selectedToolData.id] === 'unsanctioned' && (
                    <>
                      <button
                        onClick={() => {
                          setToolStatuses(prev => ({ ...prev, [selectedToolData.id]: 'sanctioned' }));
                          setShowActionToast('Tool sanctioned successfully');
                          setTimeout(() => setShowActionToast(null), 3000);
                        }}
                        className="flex-1 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 transition-colors"
                      >
                        Sanction Tool
                      </button>
                      <button
                        onClick={() => {
                          setToolStatuses(prev => ({ ...prev, [selectedToolData.id]: 'blocked' }));
                          setShowActionToast('Tool blocked');
                          setTimeout(() => setShowActionToast(null), 3000);
                        }}
                        className="flex-1 px-4 py-2 rounded-lg bg-rose-600 text-white text-sm font-semibold hover:bg-rose-700 transition-colors"
                      >
                        Block Tool
                      </button>
                    </>
                  )}
                  {toolStatuses[selectedToolData.id] === 'under-review' && (
                    <>
                      <button
                        onClick={() => {
                          setToolStatuses(prev => ({ ...prev, [selectedToolData.id]: 'sanctioned' }));
                          setShowActionToast('Tool approved and sanctioned');
                          setTimeout(() => setShowActionToast(null), 3000);
                        }}
                        className="flex-1 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 transition-colors"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => {
                          setToolStatuses(prev => ({ ...prev, [selectedToolData.id]: 'blocked' }));
                          setShowActionToast('Tool rejected and blocked');
                          setTimeout(() => setShowActionToast(null), 3000);
                        }}
                        className="flex-1 px-4 py-2 rounded-lg bg-rose-600 text-white text-sm font-semibold hover:bg-rose-700 transition-colors"
                      >
                        Reject
                      </button>
                    </>
                  )}
                  {toolStatuses[selectedToolData.id] === 'sanctioned' && (
                    <button
                      onClick={() => {
                        setShowActionToast('Policy configuration coming soon');
                        setTimeout(() => setShowActionToast(null), 3000);
                      }}
                      className="flex-1 px-4 py-2 rounded-lg bg-slate-100 text-slate-700 text-sm font-semibold hover:bg-slate-200 transition-colors"
                    >
                      Configure Policies
                    </button>
                  )}
                  {toolStatuses[selectedToolData.id] === 'blocked' && (
                    <button
                      onClick={() => {
                        setToolStatuses(prev => ({ ...prev, [selectedToolData.id]: 'under-review' }));
                        setShowActionToast('Tool moved to review');
                        setTimeout(() => setShowActionToast(null), 3000);
                      }}
                      className="flex-1 px-4 py-2 rounded-lg bg-amber-100 text-amber-700 text-sm font-semibold hover:bg-amber-200 transition-colors"
                    >
                      Re-evaluate
                    </button>
                  )}
                </div>
                {showActionToast && (
                  <div
                    className="fixed bottom-4 right-4 z-[60] bg-slate-900 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 animate-in slide-in-from-bottom-4"
                    role="alert"
                    aria-live="polite"
                  >
                    <Icon name="check-circle" className="w-5 h-5 text-emerald-400" />
                    <span className="text-sm">{showActionToast}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ═══════════════ GOVERNANCE CONFIGURATION GUIDES ═══════════════ */}
          <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-sm font-semibold text-slate-900">How to Govern Each Tool</div>
                <div className="text-xs text-slate-500">Official configuration guides for enterprise governance</div>
              </div>
            </div>

            <div className="space-y-4">
              {/* Claude Code */}
              <details className="group border border-slate-200 rounded-lg overflow-hidden">
                <summary className="flex items-center gap-3 p-4 cursor-pointer bg-slate-50 hover:bg-slate-100 transition-colors">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center">
                    <span className="text-white text-xs font-bold">CC</span>
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-slate-900">Claude Code</div>
                    <div className="text-xs text-slate-500">Route through AWS Bedrock, Azure, or Vertex for full governance</div>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-700">Full Governance</span>
                  <Icon name="chevron-down" className="w-4 h-4 text-slate-400 group-open:rotate-180 transition-transform" />
                </summary>
                <div className="p-4 border-t border-slate-200 bg-white space-y-4">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div className="p-3 rounded-lg bg-slate-50">
                      <div className="text-xs font-semibold text-slate-700 mb-2">Enable Bedrock Routing</div>
                      <div className="bg-slate-900 rounded p-2 font-mono text-[10px] text-slate-100">
                        <div><span className="text-amber-400">export</span> CLAUDE_CODE_USE_BEDROCK=<span className="text-emerald-400">1</span></div>
                        <div><span className="text-amber-400">export</span> AWS_REGION=<span className="text-cyan-400">us-east-1</span></div>
                      </div>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-50">
                      <div className="text-xs font-semibold text-slate-700 mb-2">Attach Guardrails</div>
                      <div className="bg-slate-900 rounded p-2 font-mono text-[10px] text-slate-100">
                        <div><span className="text-amber-400">export</span> ANTHROPIC_CUSTOM_HEADERS=<span className="text-cyan-400">"X-Amzn-Bedrock-GuardrailIdentifier: gr-xxx"</span></div>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-xs">
                    <span className="flex items-center gap-1 text-emerald-600"><Icon name="check-circle" className="w-3.5 h-3.5" /> Bedrock Guardrails</span>
                    <span className="flex items-center gap-1 text-emerald-600"><Icon name="check-circle" className="w-3.5 h-3.5" /> CloudTrail Logging</span>
                    <span className="flex items-center gap-1 text-emerald-600"><Icon name="check-circle" className="w-3.5 h-3.5" /> IAM Access Control</span>
                    <a href="https://code.claude.com/docs/en/amazon-bedrock" target="_blank" rel="noopener noreferrer" className="ml-auto text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1">
                      Official Docs <Icon name="arrow-top-right-on-square" className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              </details>

              {/* Kiro */}
              <details className="group border border-slate-200 rounded-lg overflow-hidden">
                <summary className="flex items-center gap-3 p-4 cursor-pointer bg-slate-50 hover:bg-slate-100 transition-colors">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-orange-500 to-yellow-500 flex items-center justify-center">
                    <span className="text-white text-xs font-bold">K</span>
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-slate-900">Kiro (AWS)</div>
                    <div className="text-xs text-slate-500">Native AWS governance with IAM Identity Center and admin controls</div>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-700">Full Governance</span>
                  <Icon name="chevron-down" className="w-4 h-4 text-slate-400 group-open:rotate-180 transition-transform" />
                </summary>
                <div className="p-4 border-t border-slate-200 bg-white space-y-4">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div className="p-3 rounded-lg bg-slate-50">
                      <div className="text-xs font-semibold text-slate-700 mb-2">Admin Console Controls</div>
                      <div className="text-xs text-slate-600 space-y-1">
                        <div>• <strong>Settings → Model</strong>: Manage allowed models</div>
                        <div>• <strong>Settings → MCP</strong>: Control MCP server access</div>
                        <div>• <strong>Settings → API Keys</strong>: Enable/disable key generation</div>
                      </div>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-50">
                      <div className="text-xs font-semibold text-slate-700 mb-2">CI/CD Integration</div>
                      <div className="bg-slate-900 rounded p-2 font-mono text-[10px] text-slate-100">
                        <div><span className="text-amber-400">export</span> KIRO_API_KEY=<span className="text-cyan-400">$&#123;&#123; secrets.KIRO_API_KEY &#125;&#125;</span></div>
                        <div>kiro-cli chat --trust-tools=read,grep</div>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-xs">
                    <span className="flex items-center gap-1 text-emerald-600"><Icon name="check-circle" className="w-3.5 h-3.5" /> IAM Identity Center</span>
                    <span className="flex items-center gap-1 text-emerald-600"><Icon name="check-circle" className="w-3.5 h-3.5" /> Model Allowlisting</span>
                    <span className="flex items-center gap-1 text-emerald-600"><Icon name="check-circle" className="w-3.5 h-3.5" /> GovCloud Support</span>
                    <a href="https://kiro.dev/docs" target="_blank" rel="noopener noreferrer" className="ml-auto text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1">
                      Official Docs <Icon name="arrow-top-right-on-square" className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              </details>

              {/* GitHub Copilot */}
              <details className="group border border-slate-200 rounded-lg overflow-hidden">
                <summary className="flex items-center gap-3 p-4 cursor-pointer bg-slate-50 hover:bg-slate-100 transition-colors">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                    <span className="text-white text-xs font-bold">GH</span>
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-slate-900">GitHub Copilot</div>
                    <div className="text-xs text-slate-500">Content exclusions and enterprise policies (no cloud routing)</div>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-700">Limited Governance</span>
                  <Icon name="chevron-down" className="w-4 h-4 text-slate-400 group-open:rotate-180 transition-transform" />
                </summary>
                <div className="p-4 border-t border-slate-200 bg-white space-y-4">
                  <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
                    <div className="flex items-start gap-2">
                      <Icon name="exclamation-triangle" className="w-4 h-4 text-amber-600 mt-0.5" />
                      <div className="text-xs text-amber-800">
                        <strong>Governance Gap:</strong> Copilot cannot route through Bedrock/Azure OpenAI. All traffic goes to GitHub servers. No prompt/completion logging available.
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div className="p-3 rounded-lg bg-slate-50">
                      <div className="text-xs font-semibold text-slate-700 mb-2">Content Exclusions (Enterprise)</div>
                      <div className="bg-slate-900 rounded p-2 font-mono text-[10px] text-slate-100">
                        <div className="text-slate-400"># In enterprise settings</div>
                        <div><span className="text-cyan-400">"*"</span>:</div>
                        <div>  - <span className="text-emerald-400">"**/.env"</span></div>
                        <div>  - <span className="text-emerald-400">"/secrets/**"</span></div>
                      </div>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-50">
                      <div className="text-xs font-semibold text-slate-700 mb-2">What You CAN Control</div>
                      <div className="text-xs text-slate-600 space-y-1">
                        <div>• File/repo exclusion patterns (fnmatch)</div>
                        <div>• Feature enable/disable per org</div>
                        <div>• Audit logs for admin actions</div>
                        <div>• Privacy mode (no training on your code)</div>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-xs">
                    <span className="flex items-center gap-1 text-emerald-600"><Icon name="check-circle" className="w-3.5 h-3.5" /> Content Exclusions</span>
                    <span className="flex items-center gap-1 text-rose-600"><Icon name="x-circle" className="w-3.5 h-3.5" /> No Cloud Routing</span>
                    <span className="flex items-center gap-1 text-rose-600"><Icon name="x-circle" className="w-3.5 h-3.5" /> No Prompt Logging</span>
                    <a href="https://docs.github.com/en/copilot/managing-copilot/managing-github-copilot-in-your-organization" target="_blank" rel="noopener noreferrer" className="ml-auto text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1">
                      Official Docs <Icon name="arrow-top-right-on-square" className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              </details>

              {/* Cursor */}
              <details className="group border border-slate-200 rounded-lg overflow-hidden">
                <summary className="flex items-center gap-3 p-4 cursor-pointer bg-slate-50 hover:bg-slate-100 transition-colors">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
                    <span className="text-white text-xs font-bold">C</span>
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-slate-900">Cursor</div>
                    <div className="text-xs text-slate-500">SSO and budget controls only — no API routing or content inspection</div>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-100 text-rose-700">Minimal Governance</span>
                  <Icon name="chevron-down" className="w-4 h-4 text-slate-400 group-open:rotate-180 transition-transform" />
                </summary>
                <div className="p-4 border-t border-slate-200 bg-white space-y-4">
                  <div className="p-3 rounded-lg bg-rose-50 border border-rose-200">
                    <div className="flex items-start gap-2">
                      <Icon name="x-circle" className="w-4 h-4 text-rose-600 mt-0.5" />
                      <div className="text-xs text-rose-800">
                        <strong>Not Recommended for Strict Governance:</strong> Cursor has no BYOM/API routing option. All requests go through Cursor's infrastructure. No way to intercept or route traffic through enterprise-controlled systems.
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div className="p-3 rounded-lg bg-slate-50">
                      <div className="text-xs font-semibold text-slate-700 mb-2">What You CAN Control</div>
                      <div className="text-xs text-slate-600 space-y-1">
                        <div>• SAML/OIDC SSO + SCIM provisioning</div>
                        <div>• Team-level budget caps</div>
                        <div>• Model access per team</div>
                        <div>• Privacy mode (no training)</div>
                      </div>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-50">
                      <div className="text-xs font-semibold text-slate-700 mb-2">What You CANNOT Control</div>
                      <div className="text-xs text-slate-600 space-y-1">
                        <div className="text-rose-600">• API routing (no Bedrock/Azure)</div>
                        <div className="text-rose-600">• Prompt/response inspection</div>
                        <div className="text-rose-600">• Data residency selection</div>
                        <div className="text-rose-600">• SIEM log export</div>
                      </div>
                    </div>
                  </div>
                  <div className="p-3 rounded-lg bg-blue-50 border border-blue-200">
                    <div className="text-xs text-blue-800">
                      <strong>Recommendation:</strong> For enterprises requiring API-level governance, consider migrating to Claude Code (Bedrock), Kiro, or Tabnine with BYOM.
                    </div>
                  </div>
                </div>
              </details>

              {/* Tabnine */}
              <details className="group border border-slate-200 rounded-lg overflow-hidden">
                <summary className="flex items-center gap-3 p-4 cursor-pointer bg-slate-50 hover:bg-slate-100 transition-colors">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
                    <span className="text-white text-xs font-bold">T</span>
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-slate-900">Tabnine</div>
                    <div className="text-xs text-slate-500">Self-hosted, air-gapped, BYOM with Bedrock/Azure/Vertex</div>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-700">Full Governance</span>
                  <Icon name="chevron-down" className="w-4 h-4 text-slate-400 group-open:rotate-180 transition-transform" />
                </summary>
                <div className="p-4 border-t border-slate-200 bg-white space-y-4">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div className="p-3 rounded-lg bg-slate-50">
                      <div className="text-xs font-semibold text-slate-700 mb-2">Deployment Options</div>
                      <div className="text-xs text-slate-600 space-y-1">
                        <div>• <strong>VPC</strong>: K8s on your AWS/GCP/Azure</div>
                        <div>• <strong>On-Premises</strong>: K8s on your servers</div>
                        <div>• <strong>Air-Gapped</strong>: Fully network isolated</div>
                        <div>• <strong>Secure SaaS</strong>: Tabnine-hosted</div>
                      </div>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-50">
                      <div className="text-xs font-semibold text-slate-700 mb-2">BYOM Configuration</div>
                      <div className="text-xs text-slate-600 space-y-1">
                        <div>Admin Console → Settings → Models → Add AI Model</div>
                        <div className="mt-1">Supports: Bedrock, Azure AI, Vertex AI, OpenAI, self-hosted LLMs (vLLM)</div>
                      </div>
                    </div>
                  </div>
                  <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200">
                    <div className="text-xs text-emerald-800">
                      <strong>Zero Retention:</strong> Code context deleted immediately after inference. No training on your code. SOC 2, ISO 27001, HIPAA, PCI DSS compliant.
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-xs">
                    <span className="flex items-center gap-1 text-emerald-600"><Icon name="check-circle" className="w-3.5 h-3.5" /> Self-Hosted</span>
                    <span className="flex items-center gap-1 text-emerald-600"><Icon name="check-circle" className="w-3.5 h-3.5" /> BYOM</span>
                    <span className="flex items-center gap-1 text-emerald-600"><Icon name="check-circle" className="w-3.5 h-3.5" /> Air-Gapped</span>
                    <a href="https://docs.tabnine.com/main/getting-started/enterprise" target="_blank" rel="noopener noreferrer" className="ml-auto text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1">
                      Official Docs <Icon name="arrow-top-right-on-square" className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              </details>

              {/* Cody (Sourcegraph) */}
              <details className="group border border-slate-200 rounded-lg overflow-hidden">
                <summary className="flex items-center gap-3 p-4 cursor-pointer bg-slate-50 hover:bg-slate-100 transition-colors">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-pink-500 to-rose-600 flex items-center justify-center">
                    <span className="text-white text-xs font-bold">SG</span>
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-slate-900">Cody (Sourcegraph)</div>
                    <div className="text-xs text-slate-500">Self-hosted with Bedrock/Azure/Vertex routing, RBAC, and context filters</div>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-700">Full Governance</span>
                  <Icon name="chevron-down" className="w-4 h-4 text-slate-400 group-open:rotate-180 transition-transform" />
                </summary>
                <div className="p-4 border-t border-slate-200 bg-white space-y-4">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div className="p-3 rounded-lg bg-slate-50">
                      <div className="text-xs font-semibold text-slate-700 mb-2">Bedrock Configuration</div>
                      <div className="bg-slate-900 rounded p-2 font-mono text-[10px] text-slate-100">
                        <div><span className="text-cyan-400">"provider"</span>: <span className="text-emerald-400">"aws-bedrock"</span>,</div>
                        <div><span className="text-cyan-400">"chatModel"</span>: <span className="text-emerald-400">"anthropic.claude-3-opus"</span>,</div>
                        <div><span className="text-cyan-400">"endpoint"</span>: <span className="text-emerald-400">"us-east-1"</span></div>
                      </div>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-50">
                      <div className="text-xs font-semibold text-slate-700 mb-2">Context Filters (Enterprise)</div>
                      <div className="bg-slate-900 rounded p-2 font-mono text-[10px] text-slate-100">
                        <div><span className="text-cyan-400">"cody.contextFilters"</span>: &#123;</div>
                        <div>  <span className="text-cyan-400">"exclude"</span>: [&#123; <span className="text-emerald-400">"repoNamePattern"</span>: <span className="text-amber-400">".*secrets.*"</span> &#125;]</div>
                        <div>&#125;</div>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-xs">
                    <span className="flex items-center gap-1 text-emerald-600"><Icon name="check-circle" className="w-3.5 h-3.5" /> Self-Hosted</span>
                    <span className="flex items-center gap-1 text-emerald-600"><Icon name="check-circle" className="w-3.5 h-3.5" /> BYOM</span>
                    <span className="flex items-center gap-1 text-emerald-600"><Icon name="check-circle" className="w-3.5 h-3.5" /> RBAC + SAML</span>
                    <span className="flex items-center gap-1 text-emerald-600"><Icon name="check-circle" className="w-3.5 h-3.5" /> Audit Logs</span>
                    <a href="https://sourcegraph.com/docs/cody/enterprise" target="_blank" rel="noopener noreferrer" className="ml-auto text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1">
                      Official Docs <Icon name="arrow-top-right-on-square" className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              </details>

              {/* Amazon Q Developer */}
              <details className="group border border-slate-200 rounded-lg overflow-hidden">
                <summary className="flex items-center gap-3 p-4 cursor-pointer bg-slate-50 hover:bg-slate-100 transition-colors">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-orange-500 to-yellow-500 flex items-center justify-center">
                    <span className="text-white text-xs font-bold">Q</span>
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-slate-900">Amazon Q Developer</div>
                    <div className="text-xs text-slate-500">AWS-native with IAM — consider upgrading to Kiro for agentic features</div>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-100 text-blue-700">AWS Native</span>
                  <Icon name="chevron-down" className="w-4 h-4 text-slate-400 group-open:rotate-180 transition-transform" />
                </summary>
                <div className="p-4 border-t border-slate-200 bg-white space-y-4">
                  <div className="p-3 rounded-lg bg-blue-50 border border-blue-200">
                    <div className="flex items-start gap-2">
                      <Icon name="arrow-up-circle" className="w-4 h-4 text-blue-600 mt-0.5" />
                      <div className="text-xs text-blue-800">
                        <strong>Recommendation:</strong> For advanced agentic coding capabilities, consider upgrading to <strong>Kiro</strong> which provides enhanced agent features, steering files, and MCP server governance while maintaining AWS-native integration.
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div className="p-3 rounded-lg bg-slate-50">
                      <div className="text-xs font-semibold text-slate-700 mb-2">IAM Permissions Required</div>
                      <div className="text-xs text-slate-600 space-y-1">
                        <div>• <code className="bg-slate-200 px-1 rounded text-[10px]">q:StartConversation</code></div>
                        <div>• <code className="bg-slate-200 px-1 rounded text-[10px]">q:SendMessage</code></div>
                        <div>• <code className="bg-slate-200 px-1 rounded text-[10px]">q:PassRequest</code> (for AWS API access)</div>
                      </div>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-50">
                      <div className="text-xs font-semibold text-slate-700 mb-2">Governance Features</div>
                      <div className="text-xs text-slate-600 space-y-1">
                        <div>• IAM Identity Center SSO</div>
                        <div>• CloudTrail logging (q.amazonaws.com)</div>
                        <div>• VPC endpoints for IDE features</div>
                      </div>
                    </div>
                  </div>
                </div>
              </details>

            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════ POLICIES TAB ════════════════════════════════ */}
      {activeTab === 'policies' && (
        <div className="space-y-6">
          {/* Policy Overview */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center">
                  <Icon name="check-circle" className="w-5 h-5 text-emerald-600" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-slate-900">Allowed Tools</div>
                  <div className="text-xs text-slate-500">Sanctioned for enterprise use</div>
                </div>
              </div>
              <div className="space-y-2">
                {CODING_TOOL_INSTANCES.filter(t => t.status === 'sanctioned').map(tool => (
                  <div key={tool.id} className="flex items-center gap-2 p-2 rounded bg-emerald-50">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: CODING_TOOL_CONFIG[tool.toolType].color }} />
                    <span className="text-xs font-medium text-slate-700">{CODING_TOOL_CONFIG[tool.toolType].label}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                  <Icon name="arrow-path" className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-slate-900">Required Routing</div>
                  <div className="text-xs text-slate-500">API gateway requirements</div>
                </div>
              </div>
              <div className="space-y-2">
                <div className="p-2 rounded bg-blue-50">
                  <div className="text-xs font-medium text-slate-700 mb-1">Compliant Routes:</div>
                  <div className="flex flex-wrap gap-1">
                    {Object.entries(API_ROUTING_CONFIG).filter(([, c]) => c.compliant).map(([key, config]) => (
                      <span key={key} className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-700">
                        {config.label}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="p-2 rounded bg-rose-50">
                  <div className="text-xs font-medium text-slate-700 mb-1">Non-Compliant:</div>
                  <div className="flex flex-wrap gap-1">
                    {Object.entries(API_ROUTING_CONFIG).filter(([, c]) => !c.compliant).map(([key, config]) => (
                      <span key={key} className="px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-100 text-rose-700">
                        {config.label}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-lg bg-rose-100 flex items-center justify-center">
                  <Icon name="x-circle" className="w-5 h-5 text-rose-600" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-slate-900">Blocked Tools</div>
                  <div className="text-xs text-slate-500">Prohibited for security reasons</div>
                </div>
              </div>
              <div className="space-y-2">
                {CODING_TOOL_INSTANCES.filter(t => t.status === 'blocked').map(tool => (
                  <div key={tool.id} className="flex items-center gap-2 p-2 rounded bg-rose-50">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: CODING_TOOL_CONFIG[tool.toolType].color }} />
                    <span className="text-xs font-medium text-slate-700">{CODING_TOOL_CONFIG[tool.toolType].label}</span>
                    <span className="text-[10px] text-rose-600 ml-auto">No governance</span>
                  </div>
                ))}
                {CODING_TOOL_INSTANCES.filter(t => t.status === 'blocked').length === 0 && (
                  <div className="text-xs text-slate-500 italic">No tools currently blocked</div>
                )}
              </div>
            </div>
          </div>

          {/* Context Filter Policies */}
          <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="text-sm font-semibold text-slate-900">Code Context Exclusions</div>
              <button
                onClick={() => {
                  setShowActionToast('Exclusion configuration coming soon');
                  setTimeout(() => setShowActionToast(null), 3000);
                }}
                className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 transition-colors"
              >
                + Add Exclusion
              </button>
            </div>
            <div className="space-y-3">
              {[
                { pattern: '**/secrets/**', scope: 'All Tools', reason: 'Contains API keys and credentials' },
                { pattern: '**/compliance-data/**', scope: 'All Tools', reason: 'Regulatory sensitive data' },
                { pattern: '**/customer-pii/**', scope: 'All Tools', reason: 'Customer PII' },
                { pattern: '**/proprietary-algo/**', scope: 'Non-Bedrock', reason: 'Trade secret algorithms' },
              ].map((exclusion, i) => (
                <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-slate-50">
                  <div className="flex items-center gap-3">
                    <code className="px-2 py-1 rounded bg-slate-200 text-xs font-mono text-slate-700">{exclusion.pattern}</code>
                    <span className="text-xs text-slate-600">{exclusion.reason}</span>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-100 text-blue-700">{exclusion.scope}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Usage Quotas */}
          <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
            <div className="text-sm font-semibold text-slate-900 mb-4">Usage Quotas</div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-4 rounded-lg bg-slate-50">
                <div className="text-xs font-medium text-slate-500 mb-1">Daily Token Limit</div>
                <div className="text-xl font-bold text-slate-900">10M</div>
                <div className="text-[10px] text-slate-500">per user</div>
              </div>
              <div className="p-4 rounded-lg bg-slate-50">
                <div className="text-xs font-medium text-slate-500 mb-1">Session Token Limit</div>
                <div className="text-xl font-bold text-slate-900">500K</div>
                <div className="text-[10px] text-slate-500">per session</div>
              </div>
              <div className="p-4 rounded-lg bg-slate-50">
                <div className="text-xs font-medium text-slate-500 mb-1">Daily Invocations</div>
                <div className="text-xl font-bold text-slate-900">1,000</div>
                <div className="text-[10px] text-slate-500">per user</div>
              </div>
              <div className="p-4 rounded-lg bg-slate-50">
                <div className="text-xs font-medium text-slate-500 mb-1">Monthly Budget</div>
                <div className="text-xl font-bold text-slate-900">$50K</div>
                <div className="text-[10px] text-slate-500">org-wide</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════ DETECTION TAB ════════════════════════════════ */}
      {activeTab === 'detection' && (
        <div className="space-y-6">
          {/* Detection Sources */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { name: 'Network Egress', status: 'active', findings: 47, desc: 'API calls to ai vendor endpoints' },
              { name: 'Endpoint Telemetry', status: 'partial', findings: 23, desc: 'IDE plugin detection via EDR' },
              { name: 'API Gateway Logs', status: 'active', findings: 156, desc: 'Requests through approved gateways' },
              { name: 'CI/CD Pipeline', status: 'active', findings: 12, desc: 'AI tools in build processes' },
            ].map(source => (
              <div key={source.name} className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold text-slate-900">{source.name}</span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                    source.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                  }`}>
                    {source.status}
                  </span>
                </div>
                <div className="text-xs text-slate-500 mb-2">{source.desc}</div>
                <div className="text-lg font-bold text-slate-900">{source.findings} <span className="text-xs font-normal text-slate-500">findings (30d)</span></div>
              </div>
            ))}
          </div>

          {/* Shadow Usage Alerts */}
          <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="text-sm font-semibold text-slate-900">Shadow Usage Detected</div>
              <Link to="/govern/shadow-ai" className="text-xs text-blue-600 hover:text-blue-700 font-medium">
                View All in Shadow AI →
              </Link>
            </div>
            <div className="space-y-3">
              {[
                { tool: 'Cursor', severity: 'high', detected: '2026-06-12', team: 'Platform Eng', issue: 'Direct API calls - no cloud routing available' },
                { tool: 'Windsurf', severity: 'high', detected: '2026-06-15', team: 'Frontend', issue: 'No enterprise tier or audit logging' },
                { tool: 'Claude Code', severity: 'medium', detected: '2026-06-08', team: 'ML Eng', issue: 'Using native Anthropic API instead of Bedrock' },
                { tool: 'Copilot', severity: 'medium', detected: '2026-06-10', team: 'Multiple', issue: 'No prompt logging capability' },
              ].map((alert, i) => (
                <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-slate-50 hover:bg-slate-100 transition-colors">
                  <div className="flex items-center gap-3">
                    <span className={`w-2 h-2 rounded-full ${alert.severity === 'high' ? 'bg-rose-500' : 'bg-amber-500'}`} />
                    <div>
                      <div className="text-sm font-medium text-slate-900">{alert.tool}</div>
                      <div className="text-[10px] text-slate-500">{alert.team} • Detected {alert.detected}</div>
                    </div>
                  </div>
                  <div className="text-xs text-slate-600 max-w-xs text-right">{alert.issue}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Detection Coverage */}
          <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
            <div className="text-sm font-semibold text-slate-900 mb-4">Detection Coverage</div>
            <div className="space-y-3">
              {[
                { category: 'AWS-Native Tools', coverage: 95, desc: 'Kiro, Q Developer - full CloudTrail visibility' },
                { category: 'Bedrock-Routed', coverage: 90, desc: 'Claude Code via Bedrock - guardrails & logging' },
                { category: 'Azure-Routed', coverage: 85, desc: 'Tools via Azure OpenAI - APIM logging' },
                { category: 'Direct API', coverage: 45, desc: 'Copilot, Cursor - network egress only' },
                { category: 'Unknown', coverage: 20, desc: 'New/undetected tools - requires EDR' },
              ].map(item => (
                <div key={item.category} className="flex items-center gap-4">
                  <div className="w-32 text-xs font-medium text-slate-700">{item.category}</div>
                  <div className="flex-1">
                    <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          item.coverage >= 80 ? 'bg-emerald-500' :
                          item.coverage >= 50 ? 'bg-amber-500' : 'bg-rose-500'
                        }`}
                        style={{ width: `${item.coverage}%` }}
                      />
                    </div>
                  </div>
                  <div className="w-12 text-right text-xs font-semibold text-slate-700">{item.coverage}%</div>
                  <div className="w-48 text-[10px] text-slate-500">{item.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════ ANALYTICS TAB ════════════════════════════════ */}
      {activeTab === 'analytics' && (
        <div className="space-y-6">
          {/* ─────────────────────── LIVE USAGE DEEP DIVE ─────────────────────── */}
          <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-emerald-200/60 shadow-sm p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <h3 className="text-lg font-semibold text-slate-900">Real-Time Agentic Coding Intelligence</h3>
                </div>
                <p className="text-slate-500 text-xs mt-1">Live telemetry from CloudTrail InvokeModel events</p>
              </div>
              <LiveDataBadge source="CloudTrail" />
            </div>

            {/* Live Stats Row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <div className="text-amber-600 text-xs mb-1">Active Tools</div>
                <div className="text-2xl font-bold text-slate-900">{liveData?.shadow_ai?.unknown_tools?.length || 0}</div>
                <div className="text-emerald-600 text-xs mt-1 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Detected via userAgent
                </div>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="text-blue-600 text-xs mb-1">Active Users</div>
                <div className="text-2xl font-bold text-slate-900">{liveData?.shadow_ai?.unapproved_users?.length || 0}</div>
                <div className="text-blue-500 text-xs mt-1">IAM principals</div>
              </div>
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                <div className="text-purple-600 text-xs mb-1">Models Invoked</div>
                <div className="text-2xl font-bold text-slate-900">{liveData?.shadow_ai?.unapproved_models?.length || 0}</div>
                <div className="text-purple-500 text-xs mt-1">Bedrock foundation models</div>
              </div>
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
                <div className="text-emerald-600 text-xs mb-1">Total API Calls</div>
                <div className="text-2xl font-bold text-slate-900">
                  {(liveData?.shadow_ai?.unknown_tools?.reduce((sum, t) => sum + t.requests, 0) || 0).toLocaleString()}
                </div>
                <div className="text-emerald-500 text-xs mt-1">Last 7 days</div>
              </div>
            </div>

            {/* Detailed Breakdown */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Tools */}
              <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-medium text-slate-700">Tools by Request Volume</span>
                  <Icon name="command-line" className="w-4 h-4 text-slate-400" />
                </div>
                <div className="space-y-2">
                  {liveData?.shadow_ai?.unknown_tools && liveData.shadow_ai.unknown_tools.length > 0 ? (
                    liveData.shadow_ai.unknown_tools.map((tool, i) => {
                      const maxReq = Math.max(...(liveData.shadow_ai?.unknown_tools?.map(t => t.requests) || [1]));
                      return (
                        <div key={i} className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-medium text-slate-800">{tool.tool_name}</span>
                            <span className="text-slate-500">{tool.requests} req</span>
                          </div>
                          <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                            <div className="h-full bg-amber-500 rounded-full" style={{ width: `${(tool.requests / maxReq) * 100}%` }} />
                          </div>
                          <div className="text-[10px] text-slate-500">{tool.users} user{tool.users !== 1 ? 's' : ''} | {tool.evidence.split('|')[1]?.trim() || 'Multiple models'}</div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="text-xs text-slate-400 text-center py-4">No tool activity detected</div>
                  )}
                </div>
              </div>

              {/* Users */}
              <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-medium text-slate-700">Users by Token Consumption</span>
                  <Icon name="users" className="w-4 h-4 text-slate-400" />
                </div>
                <div className="space-y-2">
                  {liveData?.shadow_ai?.unapproved_users && liveData.shadow_ai.unapproved_users.length > 0 ? (
                    liveData.shadow_ai.unapproved_users.map((user, i) => {
                      const maxTok = Math.max(...(liveData.shadow_ai?.unapproved_users?.map(u => u.tokens) || [1]));
                      return (
                        <div key={i} className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-2">
                              <div className="w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center text-[10px] font-medium text-blue-700">
                                {user.email.charAt(0).toUpperCase()}
                              </div>
                              <span className="font-medium text-slate-800">{user.email}</span>
                            </div>
                            <span className="text-slate-500">{(user.tokens / 1000).toFixed(0)}k</span>
                          </div>
                          <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                            <div className="h-full bg-blue-500 rounded-full" style={{ width: `${(user.tokens / maxTok) * 100}%` }} />
                          </div>
                          <div className="text-[10px] text-slate-500">via {user.source} | since {user.first_seen.split('T')[0]}</div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="text-xs text-slate-500 text-center py-4">No user activity detected</div>
                  )}
                </div>
              </div>

              {/* Models */}
              <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-medium text-slate-700">Models by Cost</span>
                  <Icon name="cpu-chip" className="w-4 h-4 text-slate-400" />
                </div>
                <div className="space-y-2">
                  {liveData?.shadow_ai?.unapproved_models && liveData.shadow_ai.unapproved_models.length > 0 ? (
                    liveData.shadow_ai.unapproved_models.map((model, i) => {
                      const maxCost = Math.max(...(liveData.shadow_ai?.unapproved_models?.map(m => m.cost) || [1]));
                      const shortName = model.model_id.split('/').pop()?.replace(/v\d+:\d+$/, '').replace('us.anthropic.', '').replace('us.amazon.', '') || model.model_id;
                      return (
                        <div key={i} className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-medium text-slate-800 truncate max-w-[140px]" title={model.model_id}>{shortName}</span>
                            <span className="text-emerald-600">${model.cost.toFixed(2)}</span>
                          </div>
                          <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                            <div className="h-full bg-purple-500 rounded-full" style={{ width: `${(model.cost / maxCost) * 100}%` }} />
                          </div>
                          <div className="text-[10px] text-slate-500">{model.requests} requests | {model.users} user{model.users !== 1 ? 's' : ''}</div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="text-xs text-slate-400 text-center py-4">No model usage detected</div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* ─────────────────────── USAGE PATTERNS & TRENDS ─────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Hourly Activity Heatmap */}
            <div className="lg:col-span-2 bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="text-sm font-semibold text-slate-900">Usage Pattern by Hour (Last 7 Days)</div>
                <MockDataBadge integration="CloudWatch Metrics" />
              </div>
              <div className="overflow-x-auto">
                <div className="grid grid-cols-[auto_repeat(24,1fr)] gap-0.5 min-w-[600px]">
                  <div className="text-[9px] text-slate-400" />
                  {Array.from({ length: 24 }, (_, h) => (
                    <div key={h} className="text-[9px] text-slate-400 text-center">{h.toString().padStart(2, '0')}</div>
                  ))}
                  {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, dayIdx) => (
                    <React.Fragment key={day}>
                      <div className="text-[9px] text-slate-500 pr-2">{day}</div>
                      {Array.from({ length: 24 }, (_, hour) => {
                        const isWeekend = dayIdx >= 5;
                        const isWorkHour = hour >= 9 && hour <= 18;
                        const intensity = isWeekend ? Math.random() * 0.2 : (isWorkHour ? 0.4 + Math.random() * 0.6 : Math.random() * 0.3);
                        return (
                          <div
                            key={hour}
                            className="w-full aspect-square rounded-sm"
                            style={{ backgroundColor: `rgba(217, 119, 6, ${intensity})` }}
                            title={`${day} ${hour}:00 - ${Math.round(intensity * 100)} requests`}
                          />
                        );
                      })}
                    </React.Fragment>
                  ))}
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 mt-3 text-[10px] text-slate-500">
                <span>Low</span>
                <div className="flex gap-0.5">
                  {[0.1, 0.3, 0.5, 0.7, 0.9].map(o => (
                    <div key={o} className="w-3 h-3 rounded-sm" style={{ backgroundColor: `rgba(217, 119, 6, ${o})` }} />
                  ))}
                </div>
                <span>High</span>
              </div>
            </div>

            {/* Model Performance */}
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
              <div className="text-sm font-semibold text-slate-900 mb-4">Model Efficiency Metrics</div>
              <div className="space-y-4">
                {[
                  { model: 'Claude Opus 4.5', latency: 2.4, throughput: 45, costPer1k: 0.015 },
                  { model: 'Claude Sonnet 4', latency: 1.2, throughput: 78, costPer1k: 0.003 },
                  { model: 'Claude Haiku 3.5', latency: 0.4, throughput: 156, costPer1k: 0.00025 },
                ].map((m, i) => (
                  <div key={i} className="p-3 rounded-lg bg-slate-50">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium text-slate-800">{m.model}</span>
                      <span className="text-[10px] text-slate-500">${m.costPer1k}/1K tok</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-[10px]">
                      <div>
                        <div className="text-slate-400">Avg Latency</div>
                        <div className="font-semibold text-slate-700">{m.latency}s</div>
                      </div>
                      <div>
                        <div className="text-slate-400">Tok/sec</div>
                        <div className="font-semibold text-slate-700">{m.throughput}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ─────────────────────── COST ANALYSIS ─────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Cost Trends */}
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
              <div className="text-sm font-semibold text-slate-900 mb-4">Cost by Tool (6 Month Trend)</div>
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={[
                  { month: 'Jan', 'Claude Code': 8200, 'Copilot': 14500, 'Kiro': 2100, 'Q Developer': 3800, 'Cursor': 2800 },
                  { month: 'Feb', 'Claude Code': 9100, 'Copilot': 15200, 'Kiro': 2400, 'Q Developer': 4100, 'Cursor': 3200 },
                  { month: 'Mar', 'Claude Code': 10400, 'Copilot': 16100, 'Kiro': 2800, 'Q Developer': 4400, 'Cursor': 3600 },
                  { month: 'Apr', 'Claude Code': 11200, 'Copilot': 17200, 'Kiro': 3200, 'Q Developer': 4800, 'Cursor': 4100 },
                  { month: 'May', 'Claude Code': 11800, 'Copilot': 17800, 'Kiro': 3500, 'Q Developer': 5000, 'Cursor': 4500 },
                  { month: 'Jun', 'Claude Code': 12400, 'Copilot': 18200, 'Kiro': 3800, 'Q Developer': 5200, 'Cursor': 4800 },
                ]}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="month" tick={{ fill: '#64748b', fontSize: 10 }} />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 9 }} tickFormatter={v => `$${(v/1000).toFixed(0)}K`} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(value: number) => [`$${value.toLocaleString()}`, '']} />
                  <Legend wrapperStyle={{ fontSize: '10px' }} />
                  <Area type="monotone" dataKey="Claude Code" stackId="1" stroke="#D97706" fill="#D97706" fillOpacity={0.6} />
                  <Area type="monotone" dataKey="Copilot" stackId="1" stroke="#6366F1" fill="#6366F1" fillOpacity={0.6} />
                  <Area type="monotone" dataKey="Kiro" stackId="1" stroke="#FF9900" fill="#FF9900" fillOpacity={0.6} />
                  <Area type="monotone" dataKey="Q Developer" stackId="1" stroke="#10B981" fill="#10B981" fillOpacity={0.6} />
                  <Area type="monotone" dataKey="Cursor" stackId="1" stroke="#EF4444" fill="#EF4444" fillOpacity={0.6} />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Cost Breakdown */}
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
              <div className="text-sm font-semibold text-slate-900 mb-4">Cost Breakdown Analysis</div>
              <div className="space-y-3">
                <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Icon name="arrow-trending-down" className="w-4 h-4 text-emerald-600" />
                      <span className="text-xs font-medium text-emerald-800">Governed Tools</span>
                    </div>
                    <span className="text-sm font-bold text-emerald-700">$18,400</span>
                  </div>
                  <div className="text-[10px] text-emerald-600 mt-1">Claude Code + Kiro + Q Developer — routed through Bedrock</div>
                </div>
                <div className="p-3 rounded-lg bg-rose-50 border border-rose-200">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Icon name="exclamation-triangle" className="w-4 h-4 text-rose-600" />
                      <span className="text-xs font-medium text-rose-800">Ungoverned Tools</span>
                    </div>
                    <span className="text-sm font-bold text-rose-700">$23,000</span>
                  </div>
                  <div className="text-[10px] text-rose-600 mt-1">Copilot + Cursor — direct vendor API, no guardrails</div>
                </div>
                <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Icon name="light-bulb" className="w-4 h-4 text-amber-600" />
                      <span className="text-xs font-medium text-amber-800">Potential Savings</span>
                    </div>
                    <span className="text-sm font-bold text-amber-700">$8,200/mo</span>
                  </div>
                  <div className="text-[10px] text-amber-600 mt-1">If Copilot users migrated to Claude Code with Bedrock routing</div>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-slate-200">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-600">Governance Coverage</span>
                  <span className="font-semibold text-slate-900">44% of spend</span>
                </div>
                <div className="h-2 bg-slate-200 rounded-full overflow-hidden mt-2">
                  <div className="h-full bg-emerald-500 rounded-full" style={{ width: '44%' }} />
                </div>
              </div>
            </div>
          </div>

          {/* ─────────────────────── TEAM & USER ANALYTICS ─────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Usage by Team */}
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="text-sm font-semibold text-slate-900">Usage by Team</div>
                {isLiveData ? <LiveDataBadge source={liveData?.source} /> : <MockDataBadge integration="CloudWatch" />}
              </div>
              <div className="space-y-3">
                {[
                  { team: 'Frontend', users: 245, tokens: 1.8, cost: 8200, pct: 30.1, trend: 12 },
                  { team: 'Platform', users: 189, tokens: 1.4, cost: 6800, pct: 24.9, trend: 8 },
                  { team: 'Backend', users: 156, tokens: 1.1, cost: 5400, pct: 19.8, trend: -3 },
                  { team: 'ML Eng', users: 89, tokens: 0.9, cost: 4200, pct: 15.4, trend: 24 },
                  { team: 'DevOps', users: 67, tokens: 0.6, cost: 2800, pct: 10.3, trend: 5 },
                ].map(row => (
                  <div key={row.team} className="flex items-center justify-between p-2 rounded bg-slate-50">
                    <div>
                      <div className="text-xs font-medium text-slate-700">{row.team}</div>
                      <div className="text-[10px] text-slate-500">{row.users} users</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs font-semibold text-slate-900">${row.cost.toLocaleString()}</div>
                      <div className={`text-[10px] flex items-center justify-end gap-0.5 ${row.trend > 0 ? 'text-rose-500' : 'text-emerald-500'}`}>
                        <Icon name={row.trend > 0 ? 'arrow-up' : 'arrow-down'} className="w-3 h-3" />
                        {Math.abs(row.trend)}%
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Top Power Users */}
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
              <div className="text-sm font-semibold text-slate-900 mb-4">Top Power Users</div>
              <div className="space-y-3">
                {[
                  { name: 'Sarah Chen', team: 'ML Eng', tokens: 45.2, cost: 890, tool: 'Claude Code' },
                  { name: 'Mike Rodriguez', team: 'Frontend', tokens: 38.7, cost: 720, tool: 'Copilot' },
                  { name: 'Alex Kim', team: 'Platform', tokens: 34.1, cost: 650, tool: 'Claude Code' },
                  { name: 'Jordan Lee', team: 'Backend', tokens: 28.9, cost: 540, tool: 'Cursor' },
                  { name: 'Taylor Smith', team: 'DevOps', tokens: 24.3, cost: 480, tool: 'Q Developer' },
                ].map((user, i) => (
                  <div key={i} className="flex items-center gap-3 p-2 rounded bg-slate-50">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white text-xs font-medium">
                      {user.name.split(' ').map(n => n[0]).join('')}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-slate-800 truncate">{user.name}</div>
                      <div className="text-[10px] text-slate-500">{user.team} • {user.tool}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs font-semibold text-slate-900">{user.tokens}M tok</div>
                      <div className="text-[10px] text-slate-500">${user.cost}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Adoption Metrics */}
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
              <div className="text-sm font-semibold text-slate-900 mb-4">Adoption & Engagement</div>
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-slate-600">Daily Active Users</span>
                    <span className="font-semibold text-slate-900">412 / 746</span>
                  </div>
                  <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500 rounded-full" style={{ width: '55%' }} />
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-slate-600">Weekly Active Users</span>
                    <span className="font-semibold text-slate-900">623 / 746</span>
                  </div>
                  <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 rounded-full" style={{ width: '84%' }} />
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-slate-600">Avg Sessions / Day</span>
                    <span className="font-semibold text-slate-900">4.2</span>
                  </div>
                  <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                    <div className="h-full bg-purple-500 rounded-full" style={{ width: '70%' }} />
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-slate-600">Avg Tokens / Session</span>
                    <span className="font-semibold text-slate-900">12.4K</span>
                  </div>
                  <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                    <div className="h-full bg-amber-500 rounded-full" style={{ width: '62%' }} />
                  </div>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-slate-200 grid grid-cols-2 gap-3">
                <div className="text-center p-2 rounded bg-emerald-50">
                  <div className="text-lg font-bold text-emerald-700">+18%</div>
                  <div className="text-[10px] text-emerald-600">MoM Growth</div>
                </div>
                <div className="text-center p-2 rounded bg-blue-50">
                  <div className="text-lg font-bold text-blue-700">92%</div>
                  <div className="text-[10px] text-blue-600">Retention</div>
                </div>
              </div>
            </div>
          </div>

          {/* ─────────────────────── GOVERNANCE & COMPLIANCE ─────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Compliance Trends */}
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
              <div className="text-sm font-semibold text-slate-900 mb-4">Governance Compliance Trends</div>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={[
                  { week: 'W1', governed: 65, ungoverned: 35, blocked: 12 },
                  { week: 'W2', governed: 68, ungoverned: 32, blocked: 8 },
                  { week: 'W3', governed: 72, ungoverned: 28, blocked: 5 },
                  { week: 'W4', governed: 78, ungoverned: 22, blocked: 3 },
                ]}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="week" tick={{ fill: '#64748b', fontSize: 10 }} />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 9 }} tickFormatter={v => `${v}%`} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(value: number) => [`${value}%`, '']} />
                  <Legend wrapperStyle={{ fontSize: '10px' }} />
                  <Area type="monotone" dataKey="governed" name="Governed" stroke="#10B981" fill="#10B981" fillOpacity={0.6} />
                  <Area type="monotone" dataKey="ungoverned" name="Ungoverned" stroke="#F59E0B" fill="#F59E0B" fillOpacity={0.6} />
                  <Area type="monotone" dataKey="blocked" name="Blocked" stroke="#EF4444" fill="#EF4444" fillOpacity={0.6} />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Security Events */}
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
              <div className="text-sm font-semibold text-slate-900 mb-4">Security & Policy Events</div>
              <div className="space-y-2">
                {[
                  { type: 'guardrail', msg: 'PII detected in prompt, redacted', tool: 'Claude Code', user: 'jsmith', time: '2h ago', severity: 'medium' },
                  { type: 'policy', msg: 'Blocked access to unapproved model', tool: 'Cursor', user: 'mlee', time: '4h ago', severity: 'high' },
                  { type: 'guardrail', msg: 'Code injection attempt blocked', tool: 'Copilot', user: 'akumar', time: '6h ago', severity: 'critical' },
                  { type: 'audit', msg: 'Sensitive repo access logged', tool: 'Q Developer', user: 'tchen', time: '8h ago', severity: 'low' },
                  { type: 'policy', msg: 'Rate limit exceeded, throttled', tool: 'Claude Code', user: 'rgarcia', time: '12h ago', severity: 'medium' },
                ].map((evt, i) => (
                  <div key={i} className="flex items-start gap-3 p-2 rounded bg-slate-50">
                    <div className={`mt-0.5 w-2 h-2 rounded-full ${
                      evt.severity === 'critical' ? 'bg-rose-500' :
                      evt.severity === 'high' ? 'bg-orange-500' :
                      evt.severity === 'medium' ? 'bg-amber-500' : 'bg-slate-400'
                    }`} />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-slate-800">{evt.msg}</div>
                      <div className="text-[10px] text-slate-500">{evt.tool} • {evt.user} • {evt.time}</div>
                    </div>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded ${
                      evt.type === 'guardrail' ? 'bg-purple-100 text-purple-700' :
                      evt.type === 'policy' ? 'bg-blue-100 text-blue-700' : 'bg-slate-200 text-slate-600'
                    }`}>{evt.type}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ─────────────────────── TOKEN ECONOMICS ─────────────────────── */}
          <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="text-sm font-semibold text-slate-900">Token Economics Deep Dive</div>
              <div className="flex gap-2">
                {['Input', 'Output', 'Cache'].map(type => (
                  <span key={type} className="text-[10px] px-2 py-0.5 rounded bg-slate-100 text-slate-600">{type}</span>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="p-4 rounded-lg bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200">
                <div className="text-xs text-blue-600 mb-1">Input Tokens</div>
                <div className="text-2xl font-bold text-blue-900">4.2B</div>
                <div className="text-[10px] text-blue-500 mt-1">$12,600 @ $3/M</div>
              </div>
              <div className="p-4 rounded-lg bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200">
                <div className="text-xs text-emerald-600 mb-1">Output Tokens</div>
                <div className="text-2xl font-bold text-emerald-900">1.8B</div>
                <div className="text-[10px] text-emerald-500 mt-1">$27,000 @ $15/M</div>
              </div>
              <div className="p-4 rounded-lg bg-gradient-to-br from-purple-50 to-pink-50 border border-purple-200">
                <div className="text-xs text-purple-600 mb-1">Cache Hits</div>
                <div className="text-2xl font-bold text-purple-900">68%</div>
                <div className="text-[10px] text-purple-500 mt-1">$8,200 saved</div>
              </div>
              <div className="p-4 rounded-lg bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200">
                <div className="text-xs text-amber-600 mb-1">Effective Rate</div>
                <div className="text-2xl font-bold text-amber-900">$5.24</div>
                <div className="text-[10px] text-amber-500 mt-1">per 1M tokens (blended)</div>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-3 rounded-lg bg-slate-50">
                <div className="text-xs font-medium text-slate-700 mb-2">Token Distribution by Use Case</div>
                <div className="space-y-2">
                  {[
                    { use: 'Code Generation', pct: 42, color: '#6366F1' },
                    { use: 'Code Review', pct: 28, color: '#10B981' },
                    { use: 'Documentation', pct: 15, color: '#F59E0B' },
                    { use: 'Debugging', pct: 10, color: '#EF4444' },
                    { use: 'Other', pct: 5, color: '#94A3B8' },
                  ].map(item => (
                    <div key={item.use} className="flex items-center gap-2">
                      <div className="w-20 text-[10px] text-slate-600">{item.use}</div>
                      <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${item.pct}%`, backgroundColor: item.color }} />
                      </div>
                      <div className="w-8 text-[10px] text-slate-500 text-right">{item.pct}%</div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-slate-50">
                <div className="text-xs font-medium text-slate-700 mb-2">Context Window Utilization</div>
                <div className="space-y-2">
                  {[
                    { range: '0-25%', count: 1245, pct: 35 },
                    { range: '25-50%', count: 892, pct: 25 },
                    { range: '50-75%', count: 712, pct: 20 },
                    { range: '75-100%', count: 534, pct: 15 },
                    { range: '100% (truncated)', count: 178, pct: 5 },
                  ].map(item => (
                    <div key={item.range} className="flex items-center justify-between text-[10px]">
                      <span className="text-slate-600">{item.range}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-slate-500">{item.count.toLocaleString()} sessions</span>
                        <span className="font-medium text-slate-700">{item.pct}%</span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 p-2 rounded bg-amber-50 border border-amber-200">
                  <div className="text-[10px] text-amber-700">
                    <strong>Optimization tip:</strong> 5% of sessions hit context limits. Consider using Sonnet for long-context tasks.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Global toast for actions outside drawer */}
      {showActionToast && !selectedTool && (
        <div className="fixed bottom-4 right-4 z-[60] bg-slate-900 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 animate-in slide-in-from-bottom-4">
          <Icon name="information-circle" className="w-5 h-5 text-blue-400" />
          <span className="text-sm">{showActionToast}</span>
        </div>
      )}
    </GovernPageLayout>
  );
}
