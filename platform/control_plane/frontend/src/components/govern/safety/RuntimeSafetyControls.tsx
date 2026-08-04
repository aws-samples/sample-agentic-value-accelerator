/**
 * RuntimeSafetyControls — Runtime safety monitoring for agentic AI.
 *
 * Three key controls based on pen-testing research findings:
 * 1. Forbidden Targets — blocklist of systems agents must not access
 * 2. Alignment Drift — real-time monitoring for goal deviation
 * 3. Reliability Metrics — multi-run consistency tracking
 */

import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, BarChart, Bar, Cell } from 'recharts';
import GovernPageLayout from '../GovernPageLayout';
import { MockDataBadge } from '../DataSourceIndicator';
import StatCard from '../StatCard';
import { Icon } from '../icons';
import {
  FORBIDDEN_TARGETS,
  TARGET_TYPE_META,
  ALIGNMENT_DRIFT_EVENTS,
  DRIFT_TYPE_META,
  AGENT_RELIABILITY,
  getUnresolvedDriftEvents,
  getRecentlyTriggeredTargets,
  computeFleetReliability,
  type ForbiddenTarget,
  type AlignmentDriftEvent,
  type ReliabilityMetrics,
} from './agentSafetyControls';

const tooltipStyle = {
  background: 'rgba(255,255,255,0.98)', border: '1px solid #e2e8f0',
  borderRadius: 8, fontSize: 11, color: '#0f172a', boxShadow: '0 4px 12px rgba(15,23,42,0.08)',
};

const card = 'bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 shadow-sm';

type Tab = 'overview' | 'forbidden' | 'drift' | 'reliability';

export default function RuntimeSafetyControls() {
  const [tab, setTab] = useState<Tab>('overview');

  const unresolvedDrift = useMemo(() => getUnresolvedDriftEvents(), []);
  const recentlyTriggered = useMemo(() => getRecentlyTriggeredTargets(), []);
  const fleetReliability = useMemo(() => computeFleetReliability(), []);

  const enforced = FORBIDDEN_TARGETS.filter(t => t.enforced).length;
  const totalTriggers = FORBIDDEN_TARGETS.reduce((s, t) => s + t.triggerCount, 0);

  return (
    <GovernPageLayout
      title="Runtime Safety Controls"
      description="Real-time safety monitoring: forbidden targets (blocklist), alignment drift detection, and reliability metrics. Based on findings from LLM penetration-testing research."
      badge={<MockDataBadge integration="Happe & Cito 2025 · Google CaMeL · OWASP Agentic" />}
      backPath="/govern/safety"
      backLabel="AI Safety"
    >
      {/* Tab nav */}
      <div className="flex gap-1 p-1 bg-slate-100/80 rounded-xl mb-6 w-fit">
        {([
          ['overview', 'Overview'],
          ['forbidden', 'Forbidden Targets'],
          ['drift', 'Alignment Drift'],
          ['reliability', 'Reliability'],
        ] as [Tab, string][]).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Overview */}
      {tab === 'overview' && (
        <div className="space-y-6">
          {/* KPI strip */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            <StatCard label="Forbidden Targets" value={FORBIDDEN_TARGETS.length} sub={`${enforced} enforced`} />
            <StatCard label="Blocklist Triggers" value={totalTriggers} sub="all time" variant={totalTriggers > 10 ? 'warning' : 'info'} />
            <StatCard label="Unresolved Drift" value={unresolvedDrift.length} variant={unresolvedDrift.length > 0 ? 'danger' : 'success'} />
            <StatCard label="Fleet Success Rate" value={`${fleetReliability.avgSuccessRate.toFixed(1)}%`} variant={fleetReliability.avgSuccessRate >= 95 ? 'success' : 'warning'} />
            <StatCard label="Goal Adherence" value={`${fleetReliability.avgGoalAdherence.toFixed(1)}%`} variant={fleetReliability.avgGoalAdherence >= 95 ? 'success' : 'warning'} />
            <StatCard label="Below Threshold" value={fleetReliability.agentsBelowThreshold} sub="agents" variant={fleetReliability.agentsBelowThreshold > 0 ? 'danger' : 'success'} />
          </div>

          {/* Recently triggered + unresolved drift */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Recently triggered targets */}
            <div className={card}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-slate-900">Recently Triggered Blocklist</h3>
                <button onClick={() => setTab('forbidden')} className="text-xs text-blue-600 hover:text-blue-700">View all</button>
              </div>
              {recentlyTriggered.length === 0 ? (
                <div className="text-sm text-slate-500 text-center py-4">No recent triggers</div>
              ) : (
                <div className="space-y-2">
                  {recentlyTriggered.slice(0, 4).map(t => (
                    <div key={t.id} className="flex items-center gap-3 p-2 rounded-lg bg-slate-50">
                      <span className={`w-2 h-2 rounded-full ${t.severity === 'critical' ? 'bg-rose-500' : t.severity === 'high' ? 'bg-orange-500' : 'bg-amber-500'}`} />
                      <span className="text-sm font-medium text-slate-700 flex-1">{t.name}</span>
                      <span className="text-[10px] text-slate-400">{t.lastTriggered}</span>
                      <span className="text-xs text-slate-500">{t.triggerCount}×</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Unresolved drift events */}
            <div className={card}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-slate-900">Unresolved Alignment Drift</h3>
                <button onClick={() => setTab('drift')} className="text-xs text-blue-600 hover:text-blue-700">View all</button>
              </div>
              {unresolvedDrift.length === 0 ? (
                <div className="text-sm text-emerald-600 text-center py-4 flex items-center justify-center gap-2">
                  <Icon name="check-circle" className="w-4 h-4" />
                  All drift events resolved
                </div>
              ) : (
                <div className="space-y-2">
                  {unresolvedDrift.map(e => (
                    <div key={e.id} className={`p-3 rounded-lg border ${e.severity === 'critical' ? 'bg-rose-50 border-rose-200' : 'bg-amber-50 border-amber-200'}`}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${e.severity === 'critical' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>
                          {e.severity.toUpperCase()}
                        </span>
                        <span className="text-sm font-medium text-slate-800">{e.agentName}</span>
                        <span className="text-[10px] text-slate-400 ml-auto">{e.timestamp.split('T')[0]}</span>
                      </div>
                      <div className="text-xs text-slate-600">{DRIFT_TYPE_META[e.driftType].label}: {e.actualBehavior}</div>
                      <div className="text-[10px] text-slate-500 mt-1">Goal deviation: {(e.goalDeviation * 100).toFixed(0)}%</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Fleet reliability overview */}
          <div className={card}>
            <h3 className="text-sm font-semibold text-slate-900 mb-3">Fleet Reliability by Agent</h3>
            <div className="space-y-2">
              {AGENT_RELIABILITY.sort((a, b) => a.successRate - b.successRate).map(r => {
                const isLow = r.successRate < 95 || r.goalAdherenceRate < 95;
                return (
                  <div key={r.agentId} className={`flex items-center gap-3 p-2 rounded-lg ${isLow ? 'bg-rose-50' : 'bg-slate-50'}`}>
                    <span className={`w-2 h-2 rounded-full ${r.successRate >= 98 ? 'bg-emerald-500' : r.successRate >= 95 ? 'bg-amber-500' : 'bg-rose-500'}`} />
                    <span className="text-sm font-medium text-slate-700 flex-1 truncate">{r.agentName}</span>
                    <div className="flex items-center gap-4 text-xs">
                      <span className={r.successRate < 95 ? 'text-rose-600 font-semibold' : 'text-slate-600'}>
                        {r.successRate.toFixed(1)}% success
                      </span>
                      <span className={r.goalAdherenceRate < 95 ? 'text-rose-600 font-semibold' : 'text-slate-500'}>
                        {r.goalAdherenceRate.toFixed(1)}% goal adherence
                      </span>
                      <span className="text-slate-400">{r.totalRuns.toLocaleString()} runs</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Forbidden Targets */}
      {tab === 'forbidden' && <ForbiddenTargetsView />}

      {/* Alignment Drift */}
      {tab === 'drift' && <AlignmentDriftView />}

      {/* Reliability */}
      {tab === 'reliability' && <ReliabilityView />}
    </GovernPageLayout>
  );
}

function ForbiddenTargetsView() {
  const [filter, setFilter] = useState<'all' | 'enforced' | 'triggered'>('all');

  const filtered = useMemo(() => {
    if (filter === 'enforced') return FORBIDDEN_TARGETS.filter(t => t.enforced);
    if (filter === 'triggered') return FORBIDDEN_TARGETS.filter(t => t.triggerCount > 0);
    return FORBIDDEN_TARGETS;
  }, [filter]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-600">
          Explicit blocklist of systems, APIs, actions, and data that agents are forbidden from accessing.
          Based on research showing LLMs sometimes attack explicitly forbidden targets.
        </p>
        <select
          value={filter}
          onChange={e => setFilter(e.target.value as typeof filter)}
          className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg"
        >
          <option value="all">All targets</option>
          <option value="enforced">Enforced only</option>
          <option value="triggered">Triggered</option>
        </select>
      </div>

      <div className="space-y-3">
        {filtered.map(t => {
          const meta = TARGET_TYPE_META[t.type];
          return (
            <div
              key={t.id}
              className={`${card} ${!t.enforced ? 'opacity-60' : ''}`}
            >
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${meta.color}20` }}>
                  <Icon name={meta.icon as any} className="w-5 h-5" style={{ color: meta.color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-slate-900">{t.name}</span>
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                      t.severity === 'critical' ? 'bg-rose-100 text-rose-700' :
                      t.severity === 'high' ? 'bg-orange-100 text-orange-700' : 'bg-amber-100 text-amber-700'
                    }`}>{t.severity.toUpperCase()}</span>
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">{meta.label}</span>
                    {t.enforced ? (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 font-semibold">ENFORCED</span>
                    ) : (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-400">AUDIT ONLY</span>
                    )}
                  </div>
                  <div className="text-xs text-slate-600 mt-1">{t.description}</div>
                  <div className="text-[10px] text-slate-400 mt-1.5 font-mono">{t.pattern}</div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className={`text-lg font-bold ${t.triggerCount > 0 ? 'text-rose-600' : 'text-slate-300'}`}>
                    {t.triggerCount}
                  </div>
                  <div className="text-[10px] text-slate-400">triggers</div>
                  {t.lastTriggered && (
                    <div className="text-[10px] text-slate-500 mt-1">Last: {t.lastTriggered}</div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AlignmentDriftView() {
  const [filter, setFilter] = useState<'all' | 'unresolved' | 'critical'>('all');

  const filtered = useMemo(() => {
    if (filter === 'unresolved') return ALIGNMENT_DRIFT_EVENTS.filter(e => !e.resolved);
    if (filter === 'critical') return ALIGNMENT_DRIFT_EVENTS.filter(e => e.severity === 'critical');
    return ALIGNMENT_DRIFT_EVENTS;
  }, [filter]);

  const driftByType = useMemo(() => {
    const counts: Record<string, number> = {};
    ALIGNMENT_DRIFT_EVENTS.forEach(e => {
      counts[e.driftType] = (counts[e.driftType] || 0) + 1;
    });
    return Object.entries(counts).map(([type, count]) => ({
      type,
      count,
      ...DRIFT_TYPE_META[type as keyof typeof DRIFT_TYPE_META],
    }));
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-600">
          Real-time detection of alignment drift — when agents deviate from their assigned goals or operate outside boundaries.
          Critical for catching the "LLM discards assigned task" failure mode.
        </p>
        <select
          value={filter}
          onChange={e => setFilter(e.target.value as typeof filter)}
          className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg"
        >
          <option value="all">All events</option>
          <option value="unresolved">Unresolved</option>
          <option value="critical">Critical only</option>
        </select>
      </div>

      {/* Drift by type chart */}
      <div className={card}>
        <h3 className="text-sm font-semibold text-slate-900 mb-3">Drift Events by Type</h3>
        <div className="h-32">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={driftByType} layout="vertical">
              <XAxis type="number" tick={{ fontSize: 10 }} />
              <YAxis dataKey="label" type="category" tick={{ fontSize: 10 }} width={100} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                {driftByType.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Event list */}
      <div className="space-y-3">
        {filtered.map(e => {
          const meta = DRIFT_TYPE_META[e.driftType];
          return (
            <div
              key={e.id}
              className={`${card} ${e.resolved ? 'opacity-70' : ''} ${!e.resolved && e.severity === 'critical' ? 'border-rose-300 bg-rose-50/50' : ''}`}
            >
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${meta.color}20` }}>
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: meta.color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-slate-900">{e.agentName}</span>
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                      e.severity === 'critical' ? 'bg-rose-100 text-rose-700' :
                      e.severity === 'warning' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'
                    }`}>{e.severity.toUpperCase()}</span>
                    <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ backgroundColor: `${meta.color}20`, color: meta.color }}>
                      {meta.label}
                    </span>
                    {e.resolved ? (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 font-semibold">RESOLVED</span>
                    ) : (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 font-semibold animate-pulse">ACTIVE</span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-4 mt-2 text-xs">
                    <div>
                      <div className="text-slate-400 text-[10px] uppercase">Expected</div>
                      <div className="text-slate-600">{e.expectedBehavior}</div>
                    </div>
                    <div>
                      <div className="text-slate-400 text-[10px] uppercase">Actual</div>
                      <div className="text-slate-700 font-medium">{e.actualBehavior}</div>
                    </div>
                  </div>
                  {e.resolution && (
                    <div className="mt-2 text-xs text-emerald-700 bg-emerald-50 px-2 py-1 rounded">
                      Resolution: {e.resolution}
                    </div>
                  )}
                </div>
                <div className="text-right flex-shrink-0">
                  <div className={`text-lg font-bold ${e.goalDeviation > 0.5 ? 'text-rose-600' : e.goalDeviation > 0.25 ? 'text-amber-600' : 'text-slate-600'}`}>
                    {(e.goalDeviation * 100).toFixed(0)}%
                  </div>
                  <div className="text-[10px] text-slate-400">deviation</div>
                  <div className="text-[10px] text-slate-500 mt-1">{e.timestamp.split('T')[0]}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ReliabilityView() {
  const [selected, setSelected] = useState<string | null>(null);
  const selectedAgent = selected ? AGENT_RELIABILITY.find(r => r.agentId === selected) : null;

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        Multi-run reliability tracking — because capability ≠ reliability. An agent that CAN complete a task
        must CONSISTENTLY complete it to be production-ready.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Agent list */}
        <div className={`${card} lg:col-span-1`}>
          <h3 className="text-sm font-semibold text-slate-900 mb-3">Agents by Reliability</h3>
          <div className="space-y-2">
            {AGENT_RELIABILITY.sort((a, b) => a.successRate - b.successRate).map(r => {
              const isLow = r.successRate < 95;
              return (
                <button
                  key={r.agentId}
                  onClick={() => setSelected(r.agentId)}
                  className={`w-full text-left p-3 rounded-lg border transition-all ${
                    selected === r.agentId
                      ? 'border-blue-500 bg-blue-50'
                      : isLow
                      ? 'border-rose-200 bg-rose-50 hover:border-rose-300'
                      : 'border-slate-200 bg-slate-50 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-800">{r.agentName}</span>
                    <span className={`text-sm font-bold ${isLow ? 'text-rose-600' : 'text-emerald-600'}`}>
                      {r.successRate.toFixed(1)}%
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-[10px] text-slate-500">
                    <span>{r.totalRuns.toLocaleString()} runs</span>
                    <span>·</span>
                    <span>{r.consistencyScore.toFixed(0)}% consistent</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Detail view */}
        <div className={`${card} lg:col-span-2`}>
          {selectedAgent ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-900">{selectedAgent.agentName}</h3>
                <span className="text-xs text-slate-400">Last {selectedAgent.period}</span>
              </div>

              {/* Metrics grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-slate-50 rounded-lg p-3">
                  <div className="text-[10px] text-slate-400 uppercase">Success Rate</div>
                  <div className={`text-xl font-bold ${selectedAgent.successRate >= 95 ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {selectedAgent.successRate.toFixed(1)}%
                  </div>
                </div>
                <div className="bg-slate-50 rounded-lg p-3">
                  <div className="text-[10px] text-slate-400 uppercase">Consistency</div>
                  <div className="text-xl font-bold text-slate-800">{selectedAgent.consistencyScore.toFixed(1)}%</div>
                </div>
                <div className="bg-slate-50 rounded-lg p-3">
                  <div className="text-[10px] text-slate-400 uppercase">Goal Adherence</div>
                  <div className={`text-xl font-bold ${selectedAgent.goalAdherenceRate >= 95 ? 'text-emerald-600' : 'text-amber-600'}`}>
                    {selectedAgent.goalAdherenceRate.toFixed(1)}%
                  </div>
                </div>
                <div className="bg-slate-50 rounded-lg p-3">
                  <div className="text-[10px] text-slate-400 uppercase">Response Variance</div>
                  <div className="text-xl font-bold text-slate-800">{selectedAgent.avgResponseVariance.toFixed(2)}</div>
                </div>
              </div>

              {/* Trend chart */}
              <div>
                <div className="text-xs font-medium text-slate-500 mb-2">Reliability Trend</div>
                <div className="h-32">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={selectedAgent.reliabilityTrend}>
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={d => d.split('-').slice(1).join('/')} />
                      <YAxis domain={[85, 100]} tick={{ fontSize: 10 }} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Line
                        type="monotone"
                        dataKey="rate"
                        stroke={selectedAgent.successRate >= 95 ? '#10b981' : '#ef4444'}
                        strokeWidth={2}
                        dot={{ r: 3 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Error breakdown */}
              <div>
                <div className="text-xs font-medium text-slate-500 mb-2">Error Categories</div>
                <div className="space-y-1.5">
                  {selectedAgent.errorCategories.map(cat => (
                    <div key={cat.category} className="flex items-center gap-2">
                      <span className="text-xs text-slate-600 w-28 truncate">{cat.category}</span>
                      <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-rose-500 rounded-full"
                          style={{ width: `${cat.pct}%` }}
                        />
                      </div>
                      <span className="text-xs text-slate-500 w-12 text-right">{cat.count}</span>
                      <span className="text-[10px] text-slate-400 w-8 text-right">{cat.pct}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center text-slate-500 py-12">
              Select an agent to view reliability details
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
