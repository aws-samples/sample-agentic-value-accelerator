/**
 * PolicyObservability — Metrics, enforcement events, and alerting for Cedar policies.
 *
 * Mirrors the Guardrails observability features:
 * - Enforcement metrics (allows, denies, errors)
 * - Real-time enforcement feed
 * - Policy coverage by agent/resource
 * - Alert configuration
 */

import { useState, useMemo } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';

type ObservabilityTab = 'metrics' | 'feed' | 'coverage' | 'alerts';

// Mock data for policy enforcement
const ENFORCEMENT_TREND = Array.from({ length: 24 }, (_, i) => ({
  hour: `${String(i).padStart(2, '0')}:00`,
  allowed: Math.floor(150 + Math.random() * 100),
  denied: Math.floor(10 + Math.random() * 20),
  errors: Math.floor(Math.random() * 5),
}));

const POLICY_METRICS = [
  { id: 'total-evals', label: 'Total Evaluations', value: '48,291', change: '+12%', color: '#3b82f6' },
  { id: 'allow-rate', label: 'Allow Rate', value: '94.2%', change: '+0.8%', color: '#10b981' },
  { id: 'deny-rate', label: 'Deny Rate', value: '5.6%', change: '-0.8%', color: '#f59e0b' },
  { id: 'error-rate', label: 'Error Rate', value: '0.2%', change: '-0.1%', color: '#ef4444' },
  { id: 'avg-latency', label: 'Avg Latency', value: '2.3ms', change: '-0.4ms', color: '#8b5cf6' },
];

const ENFORCEMENT_FEED = [
  { id: 1, ts: '12:04:32', policy: 'restricted-ops', principal: 'agent:fraud-detector', action: 'tools:bash_execute', resource: 'shell:*', decision: 'DENY', reason: 'Explicit deny rule', latency: '1.8ms' },
  { id: 2, ts: '12:04:28', policy: 'data-boundary', principal: 'agent:kyc-agent', action: 's3:GetObject', resource: 's3:customer-data-prod/*', decision: 'ALLOW', reason: 'Prefix match', latency: '2.1ms' },
  { id: 3, ts: '12:04:15', policy: 'cost-control', principal: 'agent:trading-assistant', action: 'bedrock:InvokeModel', resource: 'model:claude-opus-4', decision: 'DENY', reason: 'Model tier restriction', latency: '1.5ms' },
  { id: 4, ts: '12:03:58', policy: 'audit-everything', principal: 'agent:compliance-bot', action: 'logs:PutLogEvents', resource: 'log-group:agent-traces', decision: 'ALLOW', reason: 'Logging required', latency: '2.8ms' },
  { id: 5, ts: '12:03:42', policy: 'restricted-ops', principal: 'agent:customer-service', action: 'network:egress', resource: 'external:api.stripe.com', decision: 'DENY', reason: 'External egress blocked', latency: '1.2ms' },
  { id: 6, ts: '12:03:31', policy: 'data-boundary', principal: 'agent:fraud-detector', action: 'dynamodb:Query', resource: 'table:transactions', decision: 'ALLOW', reason: 'In allowlist', latency: '3.1ms' },
  { id: 7, ts: '12:03:18', policy: 'cost-control', principal: 'agent:kyc-agent', action: 'bedrock:InvokeModel', resource: 'model:claude-haiku-4', decision: 'ALLOW', reason: 'Haiku allowed', latency: '1.9ms' },
  { id: 8, ts: '12:03:05', policy: 'restricted-ops', principal: 'agent:trading-assistant', action: 'tools:file_write', resource: 'fs:/tmp/report.csv', decision: 'DENY', reason: 'File write blocked', latency: '1.4ms' },
];

const COVERAGE_BY_AGENT = [
  { agent: 'fraud-detector', policies: 3, evaluations: 12400, denyRate: 8.2 },
  { agent: 'kyc-agent', policies: 2, evaluations: 8900, denyRate: 3.1 },
  { agent: 'trading-assistant', policies: 4, evaluations: 15200, denyRate: 12.5 },
  { agent: 'customer-service', policies: 2, evaluations: 6800, denyRate: 4.8 },
  { agent: 'compliance-bot', policies: 3, evaluations: 4991, denyRate: 1.2 },
];

const DECISION_BREAKDOWN = [
  { name: 'Allow', value: 45412, color: '#10b981' },
  { name: 'Deny', value: 2701, color: '#f59e0b' },
  { name: 'Error', value: 178, color: '#ef4444' },
];

const ALERTS = [
  { id: 1, name: 'High Deny Rate', condition: 'deny_rate > 10%', window: '5 min', severity: 'warning', status: 'active', lastTriggered: '2 hours ago' },
  { id: 2, name: 'Policy Error Spike', condition: 'error_count > 10', window: '1 min', severity: 'critical', status: 'active', lastTriggered: 'Never' },
  { id: 3, name: 'Slow Evaluation', condition: 'avg_latency > 10ms', window: '5 min', severity: 'warning', status: 'disabled', lastTriggered: '3 days ago' },
  { id: 4, name: 'Unauthorized Access Attempt', condition: 'deny_reason contains "unauthorized"', window: '1 min', severity: 'critical', status: 'active', lastTriggered: '45 min ago' },
];

const tooltipStyle = {
  backgroundColor: 'rgba(255,255,255,0.95)',
  border: '1px solid #e2e8f0',
  borderRadius: '8px',
  boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
};

export default function PolicyObservability() {
  const [activeTab, setActiveTab] = useState<ObservabilityTab>('metrics');
  const [timeRange, setTimeRange] = useState<'1h' | '6h' | '24h' | '7d'>('24h');

  const totals = useMemo(() => {
    return ENFORCEMENT_TREND.reduce(
      (acc, h) => ({
        allowed: acc.allowed + h.allowed,
        denied: acc.denied + h.denied,
        errors: acc.errors + h.errors,
      }),
      { allowed: 0, denied: 0, errors: 0 }
    );
  }, []);

  const tabs: { id: ObservabilityTab; label: string }[] = [
    { id: 'metrics', label: 'Metrics' },
    { id: 'feed', label: 'Live Feed' },
    { id: 'coverage', label: 'Coverage' },
    { id: 'alerts', label: 'Alerts' },
  ];

  return (
    <div className="space-y-6">
      {/* Tab Navigation */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1 p-1 bg-slate-100 rounded-lg">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${
                activeTab === tab.id
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="flex gap-1 p-1 bg-slate-100 rounded-lg">
          {(['1h', '6h', '24h', '7d'] as const).map(range => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                timeRange === range
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {range}
            </button>
          ))}
        </div>
      </div>

      {/* Metrics Tab */}
      {activeTab === 'metrics' && (
        <div className="space-y-6">
          {/* KPI Cards */}
          <div className="grid grid-cols-5 gap-4">
            {POLICY_METRICS.map(m => (
              <div key={m.id} className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                <div className="text-xs text-slate-500 uppercase tracking-wide">{m.label}</div>
                <div className="text-2xl font-bold mt-1" style={{ color: m.color }}>{m.value}</div>
                <div className={`text-xs mt-1 ${m.change.startsWith('+') ? 'text-emerald-600' : m.change.startsWith('-') ? 'text-rose-600' : 'text-slate-500'}`}>
                  {m.change} vs yesterday
                </div>
              </div>
            ))}
          </div>

          {/* Charts Grid */}
          <div className="grid grid-cols-3 gap-6">
            {/* Enforcement Trend */}
            <div className="col-span-2 bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
              <div className="text-sm font-semibold text-slate-900 mb-4">Enforcement Trend (24h)</div>
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={ENFORCEMENT_TREND}>
                  <defs>
                    <linearGradient id="allowGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="denyGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="hour" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Area type="monotone" dataKey="allowed" stroke="#10b981" fill="url(#allowGrad)" strokeWidth={2} />
                  <Area type="monotone" dataKey="denied" stroke="#f59e0b" fill="url(#denyGrad)" strokeWidth={2} />
                  <Area type="monotone" dataKey="errors" stroke="#ef4444" fill="none" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
              <div className="flex justify-center gap-6 mt-2 text-xs">
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-emerald-500" /> Allowed ({totals.allowed.toLocaleString()})</span>
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-amber-500" /> Denied ({totals.denied.toLocaleString()})</span>
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-rose-500" /> Errors ({totals.errors})</span>
              </div>
            </div>

            {/* Decision Breakdown */}
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
              <div className="text-sm font-semibold text-slate-900 mb-4">Decision Breakdown</div>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={DECISION_BREAKDOWN}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    dataKey="value"
                    label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(1)}%`}
                  >
                    {DECISION_BREAKDOWN.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2 mt-4">
                {DECISION_BREAKDOWN.map(d => (
                  <div key={d.name} className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: d.color }} />
                      {d.name}
                    </span>
                    <span className="font-medium text-slate-700">{d.value.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Live Feed Tab */}
      {activeTab === 'feed' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-sm font-semibold text-slate-900">Real-time Enforcement Feed</span>
            </div>
            <span className="text-xs text-slate-500">Auto-refreshing every 5s</span>
          </div>
          <div className="divide-y divide-slate-100 max-h-[500px] overflow-y-auto">
            {ENFORCEMENT_FEED.map(event => (
              <div key={event.id} className="p-4 hover:bg-slate-50 transition-colors">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                      event.decision === 'ALLOW' ? 'bg-emerald-500' :
                      event.decision === 'DENY' ? 'bg-amber-500' : 'bg-rose-500'
                    }`} />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-slate-400">{event.ts}</span>
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded ${
                          event.decision === 'ALLOW' ? 'bg-emerald-100 text-emerald-700' :
                          event.decision === 'DENY' ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'
                        }`}>
                          {event.decision}
                        </span>
                        <span className="text-xs text-slate-500">{event.latency}</span>
                      </div>
                      <div className="text-sm text-slate-800 mt-1">
                        <span className="font-medium">{event.principal}</span>
                        <span className="text-slate-400 mx-1">→</span>
                        <span className="font-mono text-xs text-blue-600">{event.action}</span>
                        <span className="text-slate-400 mx-1">on</span>
                        <span className="font-mono text-xs">{event.resource}</span>
                      </div>
                      <div className="text-xs text-slate-500 mt-1">
                        Policy: <span className="font-medium">{event.policy}</span> · {event.reason}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Coverage Tab */}
      {activeTab === 'coverage' && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <div className="text-sm font-semibold text-slate-900 mb-4">Policy Coverage by Agent</div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-500 border-b border-slate-100">
                    <th className="pb-3 font-medium">Agent</th>
                    <th className="pb-3 font-medium text-center">Policies Attached</th>
                    <th className="pb-3 font-medium text-center">Evaluations (24h)</th>
                    <th className="pb-3 font-medium text-center">Deny Rate</th>
                    <th className="pb-3 font-medium">Coverage</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {COVERAGE_BY_AGENT.map(agent => (
                    <tr key={agent.agent} className="hover:bg-slate-50">
                      <td className="py-3">
                        <span className="font-medium text-slate-800">{agent.agent}</span>
                      </td>
                      <td className="py-3 text-center">
                        <span className="px-2 py-1 rounded bg-blue-100 text-blue-700 text-xs font-medium">{agent.policies}</span>
                      </td>
                      <td className="py-3 text-center text-slate-600">{agent.evaluations.toLocaleString()}</td>
                      <td className="py-3 text-center">
                        <span className={`font-medium ${agent.denyRate > 10 ? 'text-rose-600' : agent.denyRate > 5 ? 'text-amber-600' : 'text-emerald-600'}`}>
                          {agent.denyRate}%
                        </span>
                      </td>
                      <td className="py-3">
                        <div className="w-24 h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full bg-blue-500"
                            style={{ width: `${Math.min(100, agent.policies * 25)}%` }}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Coverage Summary */}
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
              <div className="text-xs text-slate-500 uppercase">Agents with Policies</div>
              <div className="text-2xl font-bold text-blue-600 mt-1">5/5</div>
              <div className="text-xs text-emerald-600 mt-1">100% coverage</div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
              <div className="text-xs text-slate-500 uppercase">Active Policies</div>
              <div className="text-2xl font-bold text-violet-600 mt-1">4</div>
              <div className="text-xs text-slate-500 mt-1">across all agents</div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
              <div className="text-xs text-slate-500 uppercase">Total Rules</div>
              <div className="text-2xl font-bold text-emerald-600 mt-1">14</div>
              <div className="text-xs text-slate-500 mt-1">enforced</div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
              <div className="text-xs text-slate-500 uppercase">Unprotected Resources</div>
              <div className="text-2xl font-bold text-slate-400 mt-1">0</div>
              <div className="text-xs text-emerald-600 mt-1">all covered</div>
            </div>
          </div>
        </div>
      )}

      {/* Alerts Tab */}
      {activeTab === 'alerts' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <div className="text-sm text-slate-600">{ALERTS.filter(a => a.status === 'active').length} active alerts</div>
            <button
              onClick={() => window.alert('Create Alert functionality coming soon')}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              + Create Alert
            </button>
          </div>

          <div className="space-y-3">
            {ALERTS.map(alertItem => (
              <div key={alertItem.id} className={`bg-white rounded-xl border p-4 shadow-sm ${
                alertItem.status === 'active' ? 'border-slate-200' : 'border-slate-100 opacity-60'
              }`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className={`w-2 h-2 rounded-full ${
                      alertItem.status === 'active' ? 'bg-emerald-500' : 'bg-slate-300'
                    }`} />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-800">{alertItem.name}</span>
                        <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                          alertItem.severity === 'critical' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'
                        }`}>
                          {alertItem.severity}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 mt-1">
                        <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded">{alertItem.condition}</span>
                        <span className="mx-2">·</span>
                        <span>Window: {alertItem.window}</span>
                        <span className="mx-2">·</span>
                        <span>Last triggered: {alertItem.lastTriggered}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => window.alert(`Edit alert: ${alertItem.name}`)}
                      className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => window.alert(`${alertItem.status === 'active' ? 'Disable' : 'Enable'} alert: ${alertItem.name}`)}
                      className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
                        alertItem.status === 'active'
                          ? 'text-amber-600 hover:bg-amber-50'
                          : 'text-emerald-600 hover:bg-emerald-50'
                      }`}
                    >
                      {alertItem.status === 'active' ? 'Disable' : 'Enable'}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
