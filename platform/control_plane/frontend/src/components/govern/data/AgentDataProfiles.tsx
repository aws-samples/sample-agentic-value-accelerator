/**
 * AgentDataProfiles — Data sources and protection status per deployed agent
 */

import { Link } from 'react-router-dom';
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { useDataGovernance } from './useDataGovernance';
import { LiveDataBadge } from '../DataSourceIndicator';
import EmptyState from '../EmptyState';
import StatCard from '../StatCard';
import { tooltipStyle } from './dataGovernanceData';

export default function AgentDataProfiles() {
  const dg = useDataGovernance();

  if (dg.loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-slate-200 border-t-blue-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (dg.error) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-10">
        <div className="bg-rose-50 rounded-xl border border-rose-200 p-8 text-center">
          <p className="text-rose-700 mb-4">{dg.error}</p>
          <button
            onClick={dg.refresh}
            className="px-4 py-2 bg-rose-600 text-white rounded-lg text-sm font-medium hover:bg-rose-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const profiles = dg.agentProfiles;
  const protectedAgents = profiles.filter(a => a.guardrails.length > 0).length;
  const protectedPct = profiles.length ? Math.round((protectedAgents / profiles.length) * 100) : 0;

  // Data-class exposure across all agents (PII / content filters / sensitive regexes)
  const totalPii = profiles.reduce((sum, a) => sum + a.dataProtectionSummary.piiEntitiesProtected.length, 0);
  const totalFilters = profiles.reduce((sum, a) => sum + a.dataProtectionSummary.contentFiltersActive.length, 0);
  const totalRegexes = profiles.reduce((sum, a) => sum + a.dataProtectionSummary.sensitiveRegexes.length, 0);

  // Donut: protected vs unprotected agents
  const protectionData = [
    { name: 'Protected', value: protectedAgents, color: '#10b981' },
    { name: 'Unprotected', value: Math.max(0, profiles.length - protectedAgents), color: '#ef4444' },
  ];

  // Bar chart: data-class control coverage per agent (PII types, content filters, sensitive regexes)
  const coverageData = profiles.map(a => ({
    name: a.deploymentName.length > 14 ? `${a.deploymentName.slice(0, 13)}…` : a.deploymentName,
    pii: a.dataProtectionSummary.piiEntitiesProtected.length,
    filters: a.dataProtectionSummary.contentFiltersActive.length,
    regexes: a.dataProtectionSummary.sensitiveRegexes.length,
  }));

  return (
    <div className="min-h-[calc(100vh-4rem)] relative">
      <div className="relative max-w-7xl mx-auto px-6 py-10">
        <Link to="/govern/data" className="text-sm text-slate-400 hover:text-slate-600 transition-colors font-medium">
          ← Data Governance
        </Link>

        <div className="flex items-end justify-between mt-3 mb-6">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-semibold text-slate-900 tracking-tight">Agent Data Profiles</h1>
              <LiveDataBadge />
            </div>
            <p className="text-slate-500 mt-1 max-w-2xl">
              Data sources, protection status, and guardrail configuration for each deployed agent.
            </p>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <StatCard label="Agents Deployed" value={profiles.length} variant="info" sub="across all accounts" />
          <StatCard label="Protected Agents" value={protectedAgents} variant={protectedAgents ? 'success' : 'muted'} sub={`${protectedPct}% with guardrails`} />
          <StatCard label="PII Types Protected" value={dg.summary.uniquePiiTypes.length} variant="default" sub="unique classes" />
          <StatCard label="Events (24h)" value={dg.summary.last24hEvents.total} variant={dg.summary.last24hEvents.blocked ? 'warning' : 'muted'} sub={`${dg.summary.last24hEvents.blocked} blocked`} />
        </div>

        {profiles.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-4 mb-6">
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h3 className="text-sm font-semibold text-slate-900 mb-3">Guardrail Coverage</h3>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={protectionData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={2}>
                    {protectionData.map((d) => <Cell key={d.name} fill={d.color} />)}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex items-center justify-center gap-4 -mt-2">
                {protectionData.map(d => (
                  <span key={d.name} className="flex items-center gap-1.5 text-[11px] text-slate-600">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: d.color }} />{d.name} ({d.value})
                  </span>
                ))}
              </div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h3 className="text-sm font-semibold text-slate-900 mb-3">Data-Class Control Coverage per Agent</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={coverageData} margin={{ left: 4, right: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 10 }} interval={0} />
                  <YAxis allowDecimals={false} tick={{ fill: '#94a3b8', fontSize: 10 }} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="pii" stackId="a" fill="#8b5cf6" name="PII Types" />
                  <Bar dataKey="filters" stackId="a" fill="#3b82f6" name="Content Filters" />
                  <Bar dataKey="regexes" stackId="a" fill="#f59e0b" radius={[4, 4, 0, 0]} name="Sensitive Regexes" />
                </BarChart>
              </ResponsiveContainer>
              <div className="flex items-center justify-center gap-4 mt-1 text-[11px] text-slate-600">
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ background: '#8b5cf6' }} />PII ({totalPii})</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ background: '#3b82f6' }} />Filters ({totalFilters})</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ background: '#f59e0b' }} />Regexes ({totalRegexes})</span>
              </div>
            </div>
          </div>
        )}

        {profiles.length === 0 ? (
          <div className="bg-slate-50 rounded-xl border border-slate-200 py-6">
            <EmptyState
              icon="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
              title="No agents deployed"
              description="Deploy agents from the Applications catalog to see their data governance profiles, guardrails, and PII detection settings."
              actionLabel="Browse Applications"
              actionLink="/applications"
              tips={['Each deployed agent shows its data sources and protection status', 'Track PII entities protected per guardrail']}
            />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            {dg.agentProfiles.map(agent => (
              <div key={agent.deploymentId} className="bg-white rounded-xl border border-slate-200 p-5">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h4 className="text-sm font-semibold text-slate-900">{agent.deploymentName}</h4>
                    <p className="text-xs text-slate-500 mt-0.5">{agent.templateId}</p>
                  </div>
                  <span className={`text-[10px] px-2 py-1 rounded font-medium ${
                    agent.status === 'deployed' ? 'bg-emerald-100 text-emerald-700' :
                    agent.status === 'failed' ? 'bg-rose-100 text-rose-700' :
                    'bg-amber-100 text-amber-700'
                  }`}>
                    {agent.status}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <div className="text-[10px] text-slate-500 mb-1">AWS Account</div>
                    <div className="text-xs font-mono text-slate-700">{agent.awsAccount}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-500 mb-1">Region</div>
                    <div className="text-xs text-slate-700">{agent.awsRegion}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-500 mb-1">Created By</div>
                    <div className="text-xs text-slate-700">{agent.createdBy}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-500 mb-1">Created</div>
                    <div className="text-xs text-slate-700">{new Date(agent.createdAt).toLocaleDateString()}</div>
                  </div>
                </div>

                <div className="p-3 bg-slate-50 rounded-lg">
                  <div className="text-[10px] font-semibold text-slate-600 mb-2">Data Protection</div>
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2 text-[10px]">
                      <span className="text-slate-500">Guardrails:</span>
                      <span className="text-emerald-600 font-medium">{agent.guardrails.length}</span>
                    </div>
                    <div className="flex items-center gap-2 text-[10px]">
                      <span className="text-slate-500">PII Types:</span>
                      <span className="text-violet-600 font-medium">
                        {agent.dataProtectionSummary.piiEntitiesProtected.join(', ') || 'None configured'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-[10px]">
                      <span className="text-slate-500">Content Filters:</span>
                      <span className="text-blue-600 font-medium">
                        {agent.dataProtectionSummary.contentFiltersActive.length || 0}
                      </span>
                    </div>
                  </div>
                </div>

                {agent.guardrails.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-slate-100">
                    <div className="text-[10px] text-slate-500 mb-2">Guardrails Applied</div>
                    <div className="flex flex-wrap gap-1">
                      {agent.guardrails.map((g, i) => (
                        <span key={i} className="text-[9px] px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded">
                          {g.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
