/**
 * AgentDrawer — Agent 360 slide-over.
 * Full governance detail for a single agent: identity, scope, capabilities,
 * rate limits, data access, metrics, incidents, and version history.
 */

import { Link } from 'react-router-dom';
import Drawer from './Drawer';
import { Icon } from './icons';
import {
  getAgentById,
  getToolById,
  MODELS,
} from './mockData';
import { AGENT_SCOPE_META } from './autonomyLadder';
import type { AgentPolicySummary } from './useAgentPolicies';
import { deriveAgentThreatProfile, CONTROLS } from './agentThreatProfile';
import { getAgentReliability, getAgentDriftEvents } from './safety/agentSafetyControls';

interface Props {
  agentId: string | null;
  onClose: () => void;
  /** Live Cedar policy bound to this agent (from Secure), if any. */
  policy?: AgentPolicySummary;
  /** Whether the policy service responded — distinguishes "no policy" from "offline". */
  policyLive?: boolean;
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
      <div className="text-[10px] text-slate-400 uppercase tracking-wide">{label}</div>
      <div className={`text-lg font-semibold mt-0.5 ${tone ?? 'text-slate-900'}`}>{value}</div>
    </div>
  );
}

export default function AgentDrawer({ agentId, onClose, policy, policyLive }: Props) {
  const agent = agentId ? getAgentById(agentId) : null;
  const scope = agent ? AGENT_SCOPE_META[agent.scopeLevel] : null;
  const model = agent ? MODELS.find(m => m.id === agent.model) : null;
  const threatProfile = agent ? deriveAgentThreatProfile(agent) : null;
  const reliability = agent ? getAgentReliability(agent.id) : undefined;
  const driftEvents = agent ? getAgentDriftEvents(agent.id) : [];

  return (
    <Drawer
      open={!!agent}
      onClose={onClose}
      title={agent?.name ?? ''}
      subtitle={agent ? `${agent.framework} · ${agent.version} · ${agent.owner}` : ''}
      width="lg"
    >
      {agent && scope && (
        <div className="space-y-6">
          {/* Identity & classification */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full" style={{ backgroundColor: `${scope.color}18`, color: scope.color }}>
              L{agent.scopeLevel} {scope.name}
            </span>
            <span className={`text-[11px] font-medium px-2.5 py-1 rounded-full capitalize ${
              agent.securityClassification === 'restricted' ? 'bg-rose-50 text-rose-700' :
              agent.securityClassification === 'confidential' ? 'bg-amber-50 text-amber-700' :
              agent.securityClassification === 'internal' ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-600'
            }`}>{agent.securityClassification}</span>
            <span className={`text-[11px] font-medium px-2.5 py-1 rounded-full border capitalize ${
              agent.approvalState === 'approved' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
              agent.approvalState === 'pending' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-slate-100 text-slate-500 border-slate-200'
            }`}>{agent.approvalState.replace('-', ' ')}</span>
            <span className={`text-[11px] font-medium px-2.5 py-1 rounded-full capitalize ${
              agent.status === 'production' ? 'bg-emerald-50 text-emerald-700' : agent.status === 'pilot' ? 'bg-amber-50 text-amber-700' : 'bg-blue-50 text-blue-700'
            }`}>{agent.status}</span>
          </div>

          {/* Purpose */}
          <div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Business Purpose</div>
            <p className="text-sm text-slate-700">{agent.businessPurpose}</p>
            <p className="text-xs text-slate-500 mt-1">{agent.description}</p>
          </div>

          {/* Ownership */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
              <div className="text-[10px] text-slate-400 uppercase tracking-wide">Product Owner</div>
              <div className="text-sm font-medium text-slate-800 mt-0.5">{agent.productOwner}</div>
            </div>
            <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
              <div className="text-[10px] text-slate-400 uppercase tracking-wide">Runs On</div>
              <div className="text-sm font-medium text-slate-800 mt-0.5">{model?.name ?? agent.model}</div>
            </div>
          </div>

          {/* Operational metrics */}
          <div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Operational Metrics (30d)</div>
            <div className="grid grid-cols-4 gap-3">
              <Stat label="Invocations" value={agent.metrics.invocations30d.toLocaleString()} />
              <Stat label="Error Rate" value={`${agent.metrics.errorRate}%`} tone={agent.metrics.errorRate > 2 ? 'text-rose-600' : 'text-emerald-600'} />
              <Stat label="p95 Latency" value={`${agent.metrics.p95LatencyMs}ms`} />
              <Stat label="Cost / Day" value={`$${agent.metrics.avgCostPerDay}`} />
            </div>
          </div>

          {/* Rate limits */}
          <div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Rate Limits</div>
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Requests / min" value={agent.rateLimit.rpm.toLocaleString()} />
              <Stat label="Tokens / min" value={agent.rateLimit.tpm.toLocaleString()} />
            </div>
          </div>

          {/* Cedar policy enforcement (live from Secure) */}
          <div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Cedar Policy Enforcement</div>
            {policy ? (
              <div className="rounded-lg border border-slate-200 p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${policy.status === 'active' ? 'bg-emerald-500' : policy.status === 'draft' ? 'bg-amber-400' : 'bg-slate-400'}`} />
                    <span className="text-sm font-medium text-slate-800">{policy.name}</span>
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 capitalize">{policy.status}</span>
                  </div>
                  <Link to="/secure/policy" className="text-[11px] text-blue-600 hover:text-blue-700 font-medium">Edit in Secure →</Link>
                </div>
                <div className="grid grid-cols-3 gap-3 mt-3">
                  <div><div className="text-[10px] text-slate-400 uppercase">Rules</div><div className="text-sm font-semibold text-slate-900">{policy.rulesCount}</div></div>
                  <div><div className="text-[10px] text-slate-400 uppercase">Blocking</div><div className="text-sm font-semibold text-slate-900">{policy.blockingRules}</div></div>
                  <div><div className="text-[10px] text-slate-400 uppercase">Triggers</div><div className="text-sm font-semibold text-slate-900">{policy.triggeredCount}</div></div>
                </div>
                {policy.lastTriggered && (
                  <div className="text-[10px] text-slate-400 mt-2">Last triggered {policy.lastTriggered}</div>
                )}
              </div>
            ) : policyLive ? (
              <div className="rounded-lg border border-rose-200 bg-rose-50/60 p-3 flex items-center justify-between">
                <span className="text-xs text-rose-700 flex items-center gap-1"><Icon name="exclamation-triangle" className="w-4 h-4" /> No active Cedar policy bound to this agent.</span>
                <Link to="/secure/policy/create" className="text-[11px] text-blue-600 hover:text-blue-700 font-medium">Create policy →</Link>
              </div>
            ) : (
              <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 text-xs text-slate-500">
                Policy service offline — enforcement status unavailable.
              </div>
            )}
          </div>

          {/* Capabilities — tools */}
          <div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Authorized Tools ({agent.tools.length})</div>
            <div className="space-y-2">
              {agent.tools.map(tid => {
                const tool = getToolById(tid);
                if (!tool) return null;
                return (
                  <div key={tid} className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 border border-slate-100">
                    <div>
                      <div className="text-sm font-medium text-slate-800">{tool.name}</div>
                      <div className="text-[10px] text-slate-500">{tool.description}</div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded capitalize ${
                        tool.riskLevel === 'critical' ? 'bg-rose-100 text-rose-700' : tool.riskLevel === 'high' ? 'bg-orange-100 text-orange-700' : tool.riskLevel === 'medium' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
                      }`}>{tool.riskLevel}</span>
                      {tool.requiresHumanApproval && <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">HITL</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* A2A */}
          {agent.invokesAgents.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">May Invoke Agents (A2A)</div>
              <div className="flex flex-wrap gap-2">
                {agent.invokesAgents.map(aid => {
                  const callee = getAgentById(aid);
                  return <span key={aid} className="text-xs px-2.5 py-1 rounded-lg bg-violet-50 text-violet-700 border border-violet-200">{callee?.name ?? aid}</span>;
                })}
              </div>
            </div>
          )}

          {/* Data access */}
          <div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Data Access Patterns</div>
            <div className="flex flex-wrap gap-2">
              {agent.dataAccess.map(d => (
                <span key={d} className="text-xs px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600">{d}</span>
              ))}
            </div>
          </div>

          {/* Incidents */}
          <div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Incident History</div>
            <div className="flex items-center gap-4 text-sm">
              <span className="text-slate-700">{agent.incidents.count90d} in last 90 days</span>
              {agent.incidents.openCount > 0 && <span className="text-rose-600 font-medium">{agent.incidents.openCount} open</span>}
              {agent.incidents.lastIncident && <span className="text-slate-400 text-xs">Last: {agent.incidents.lastIncident}</span>}
            </div>
          </div>

          {/* Reliability Metrics */}
          {reliability && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Reliability Metrics (30d)</div>
                <Link to={`/govern/safety/runtime?tab=reliability`} className="text-[10px] text-blue-600 hover:text-blue-700 font-medium">View details →</Link>
              </div>
              <div className="grid grid-cols-4 gap-2">
                <div className="bg-slate-50 rounded-lg p-2 border border-slate-100">
                  <div className="text-[9px] text-slate-400 uppercase">Success Rate</div>
                  <div className={`text-sm font-bold ${reliability.successRate >= 95 ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {reliability.successRate.toFixed(1)}%
                  </div>
                </div>
                <div className="bg-slate-50 rounded-lg p-2 border border-slate-100">
                  <div className="text-[9px] text-slate-400 uppercase">Consistency</div>
                  <div className="text-sm font-bold text-slate-800">{reliability.consistencyScore.toFixed(0)}%</div>
                </div>
                <div className="bg-slate-50 rounded-lg p-2 border border-slate-100">
                  <div className="text-[9px] text-slate-400 uppercase">Goal Adherence</div>
                  <div className={`text-sm font-bold ${reliability.goalAdherenceRate >= 95 ? 'text-emerald-600' : 'text-amber-600'}`}>
                    {reliability.goalAdherenceRate.toFixed(1)}%
                  </div>
                </div>
                <div className="bg-slate-50 rounded-lg p-2 border border-slate-100">
                  <div className="text-[9px] text-slate-400 uppercase">Runs</div>
                  <div className="text-sm font-bold text-slate-800">{reliability.totalRuns.toLocaleString()}</div>
                </div>
              </div>
            </div>
          )}

          {/* Alignment Drift Events */}
          {driftEvents.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Alignment Drift Events</div>
                <Link to={`/govern/safety/runtime?tab=drift`} className="text-[10px] text-blue-600 hover:text-blue-700 font-medium">View all →</Link>
              </div>
              <div className="space-y-2">
                {driftEvents.slice(0, 3).map(e => (
                  <div key={e.id} className={`p-2 rounded-lg border ${e.resolved ? 'bg-slate-50 border-slate-100' : e.severity === 'critical' ? 'bg-rose-50 border-rose-200' : 'bg-amber-50 border-amber-200'}`}>
                    <div className="flex items-center gap-2">
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${e.severity === 'critical' ? 'bg-rose-100 text-rose-700' : e.severity === 'warning' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                        {e.severity.toUpperCase()}
                      </span>
                      <span className="text-[10px] text-slate-500">{e.driftType}</span>
                      {e.resolved ? (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 font-semibold ml-auto">RESOLVED</span>
                      ) : (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 font-semibold ml-auto">ACTIVE</span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-600 mt-1">{e.actualBehavior}</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">{e.timestamp.split('T')[0]} · {(e.goalDeviation * 100).toFixed(0)}% deviation</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Threat Profile */}
          {threatProfile && threatProfile.threats.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">OWASP Agentic Threats</div>
                <div className="flex items-center gap-2 text-[10px]">
                  {threatProfile.criticalCount > 0 && (
                    <span className="px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 font-semibold">
                      {threatProfile.criticalCount} critical
                    </span>
                  )}
                  {threatProfile.highCount > 0 && (
                    <span className="px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 font-semibold">
                      {threatProfile.highCount} high
                    </span>
                  )}
                  <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 font-semibold">
                    {threatProfile.mitigatedCount}/{threatProfile.threats.length} mitigated
                  </span>
                </div>
              </div>
              <div className="space-y-2">
                {threatProfile.threats.map(t => {
                  const severityColors = {
                    critical: 'bg-rose-100 text-rose-700 border-rose-200',
                    high: 'bg-orange-100 text-orange-700 border-orange-200',
                    medium: 'bg-amber-100 text-amber-700 border-amber-200',
                    low: 'bg-slate-100 text-slate-600 border-slate-200',
                  };
                  return (
                    <div
                      key={t.threatId}
                      className={`p-2.5 rounded-lg border ${t.mitigated ? 'bg-slate-50 border-slate-100' : severityColors[t.severity]}`}
                    >
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${t.mitigated ? 'bg-emerald-100 text-emerald-700' : severityColors[t.severity]}`}>
                          {t.threatId}
                        </span>
                        <span className={`text-sm font-medium ${t.mitigated ? 'text-slate-500' : 'text-slate-800'}`}>
                          {t.name}
                        </span>
                        {t.mitigated && (
                          <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 ml-auto">
                            MITIGATED
                          </span>
                        )}
                      </div>
                      <div className={`text-[11px] mt-1 ${t.mitigated ? 'text-slate-400' : 'text-slate-600'}`}>
                        {t.reason}
                      </div>
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {t.mitigatingControls.map(cid => {
                          const ctrl = CONTROLS[cid];
                          return (
                            <span
                              key={cid}
                              className={`text-[9px] px-1.5 py-0.5 rounded ${ctrl.built ? 'bg-blue-50 text-blue-600' : 'bg-slate-100 text-slate-400 line-through'}`}
                              title={ctrl.surface}
                            >
                              {ctrl.name}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Version history */}
          <div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Version History</div>
            <div className="space-y-2">
              {agent.versionHistory.map((v, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className="flex flex-col items-center flex-shrink-0">
                    <span className={`text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded ${i === 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{v.version}</span>
                  </div>
                  <div className="flex-1 pb-2 border-b border-slate-100">
                    <div className="text-xs text-slate-700">{v.change}</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">{v.date}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </Drawer>
  );
}
