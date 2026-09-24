/**
 * AgentDrawer — Agent 360 slide-over.
 * Full governance detail for a single agent: identity, scope, capabilities,
 * rate limits, data access, metrics, incidents, and version history.
 *
 * The drawer takes the already-resolved registry row rather than looking the agent up by
 * id. It used to call getAgentById(agentId), which searches AGENT_REGISTRY — the seeded
 * array only. Live agents carry `live-`/`frontier-` prefixed ids that exist in no seeded
 * array, so the lookup returned undefined, `open={!!agent}` was false, and clicking any
 * live row did nothing at all: no drawer, no error, no explanation.
 *
 * Half of what this panel shows cannot be measured for a live agent. AWS exposes an
 * agent's identity, framework, version and status, but nothing attributes invocations,
 * latency, cost, incidents, rate limits, tool inventory, or an autonomy level to an
 * individual agent id. The live mappers in useAgentRegistry fill those with placeholder
 * constants (`scopeLevel: 3`, `rateLimit: { rpm: 100, tpm: 50000 }`, all-zero metrics), so
 * every one of them is gated here. Sections stay in place with an explicit unmeasured
 * state rather than being hidden: a hidden Incident History reads as a clean record, and a
 * hidden Reliability panel reads as an agent nobody has had trouble with.
 */

import { Link } from 'react-router-dom';
import Drawer from './Drawer';
import { Icon } from './icons';
import {
  getAgentById,
  getToolById,
  MODELS,
} from './mockData';
import type { AgentRegistryEntry } from './mockData';
import { AGENT_SCOPE_META } from './autonomyLadder';
import { LiveDataBadge, MockDataBadge } from './DataSourceIndicator';
import type { AgentPolicySummary } from './useAgentPolicies';
import { deriveAgentThreatProfile, CONTROLS } from './agentThreatProfile';
import { getAgentReliability, getAgentDriftEvents } from './safety/agentSafetyControls';

/**
 * A registry row as the Agent Registry assembles it. Declared structurally rather than
 * imported from AgentRegistry.tsx, which imports this file — the honesty flags are the
 * only additions this panel needs, and they are optional so a caller that has not computed
 * them is treated as seeded (never as live).
 */
export type AgentDrawerRow = AgentRegistryEntry & {
  isDemo?: boolean;
  invocationsKnown?: boolean;
};

interface Props {
  /** The id in the URL. Drives whether the drawer is open, independent of resolution. */
  agentId: string | null;
  /** The resolved row for `agentId`, or null when the id matches no known agent. */
  agent: AgentDrawerRow | null;
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

/**
 * A stat whose value was never measured. Slate `—`, never 0 and never a green figure: an
 * unmeasured metric is an absence of data, not a pass. `why` is surfaced on hover so the
 * dash is explained rather than merely blank.
 */
function UnmeasuredStat({ label, why }: { label: string; why: string }) {
  return (
    <div className="bg-slate-50 rounded-lg p-3 border border-slate-100" title={why}>
      <div className="text-[10px] text-slate-400 uppercase tracking-wide">{label}</div>
      <div className="text-lg font-semibold mt-0.5 text-slate-400">—</div>
    </div>
  );
}

/** Inline "this section has no measured data, and here is why" note. */
function UnmeasuredNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 text-xs text-slate-500 flex items-start gap-2">
      <Icon name="information-circle" className="w-4 h-4 flex-shrink-0 mt-px text-slate-400" />
      <span>{children}</span>
    </div>
  );
}

export default function AgentDrawer({ agentId, agent, onClose, policy, policyLive }: Props) {
  // Only a row explicitly flagged isDemo=false is live. A row with the flag absent is
  // treated as seeded, so a caller that forgets to compute it cannot produce a live claim.
  const isLive = agent?.isDemo === false;
  const scope = agent ? AGENT_SCOPE_META[agent.scopeLevel] : null;
  const model = agent ? MODELS.find(m => m.id === agent.model) : null;
  // Every input to the threat derivation (autonomy scope, tool inventory, data access, A2A
  // edges, guardrail binding) is a placeholder constant or an empty array for a live agent,
  // so the derived profile is not evidence about that agent. Skip it rather than render it.
  const threatProfile = agent && !isLive ? deriveAgentThreatProfile(agent) : null;
  const reliability = agent ? getAgentReliability(agent.id) : undefined;
  const driftEvents = agent ? getAgentDriftEvents(agent.id) : [];

  return (
    <Drawer
      open={!!agentId}
      onClose={onClose}
      title={agent?.name ?? 'Agent not found'}
      subtitle={agent ? `${agent.framework} · ${agent.version} · ${agent.owner}` : (agentId ?? '')}
      width="lg"
    >
      {agentId && !agent && (
        <UnmeasuredNote>
          No agent in the registry matches <span className="font-mono text-slate-600">{agentId}</span>.
          The link or bookmark may be stale, or the agent may have been removed from the account
          since the registry was last loaded.
        </UnmeasuredNote>
      )}

      {agent && scope && (
        <div className="space-y-6">
          {/* Provenance for the panel as a whole. Individual sections below state their own
              status where it differs, because for a live agent it usually does. */}
          <div className="flex items-center justify-end">
            {isLive
              ? <LiveDataBadge
                  source="Bedrock Agents / AgentCore discovery"
                  detail="Identity, framework, version and status are read live from AWS. AWS attributes no per-agent metrics, rate limits, tool inventory or autonomy level to an individual agent id — those are marked not measured below rather than filled in."
                />
              : <MockDataBadge integration="Seeded registry entry — illustrative governance posture" />}
          </div>
          {/* Identity & classification.

              For a live agent the first three chips are fabricated: discoveredAgentToAgent
              hardcodes scopeLevel 3, securityClassification 'confidential' and
              approvalState 'approved' for every agent it finds. Rendered as-is that put an
              "L3 Supervised" autonomy classification and an emerald "approved" governance
              state on 36 production agents nobody had classified or approved. `status` is
              the one chip that is real - it comes from the AWS agent status. */}
          <div className="flex flex-wrap items-center gap-2">
            {isLive ? (
              <>
                <span
                  className="text-[11px] font-medium px-2.5 py-1 rounded-full bg-slate-100 text-slate-500 border border-slate-200"
                  title="Autonomy scope is a governance judgement recorded by a human. AWS exposes no autonomy level for a discovered agent, and this agent has not been classified in the registry."
                >
                  Autonomy not classified
                </span>
                <span
                  className="text-[11px] font-medium px-2.5 py-1 rounded-full bg-slate-100 text-slate-500 border border-slate-200"
                  title="Data classification is assigned during onboarding. Nothing in the AWS agent description carries one, so none is claimed here."
                >
                  Classification not set
                </span>
                <span
                  className="text-[11px] font-medium px-2.5 py-1 rounded-full bg-slate-100 text-slate-500 border border-slate-200"
                  title="No approval record exists for this agent. It was discovered running in the account, which is not the same as having been approved to run."
                >
                  No approval record
                </span>
              </>
            ) : (
              <>
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
              </>
            )}
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

          {/* Ownership. The live mappers set productOwner to a literal 'Platform' /
              'Unknown', which reads as a named accountable owner when it is a placeholder. */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
              <div className="text-[10px] text-slate-400 uppercase tracking-wide">Product Owner</div>
              {isLive ? (
                <div
                  className="text-sm font-medium text-slate-400 mt-0.5"
                  title="No owner is recorded for this agent. AWS carries no owner attribute for an agent, and no owner tag was resolved - assigning one is an onboarding step."
                >
                  Not recorded
                </div>
              ) : (
                <div className="text-sm font-medium text-slate-800 mt-0.5">{agent.productOwner}</div>
              )}
            </div>
            <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
              <div className="text-[10px] text-slate-400 uppercase tracking-wide">Runs On</div>
              <div
                className="text-sm font-medium text-slate-800 mt-0.5"
                title={isLive ? 'The hosting service. Which foundation model this agent invokes is not resolved per agent.' : undefined}
              >
                {model?.name ?? agent.model}
              </div>
            </div>
          </div>

          {/* Operational metrics.

              Every live mapper hardcodes all four of these to 0, so rendering them straight
              produced "0 invocations / 0% errors / 0ms / $0" for real production agents -
              indistinguishable from a genuinely idle, error-free, free agent. `errorRate: 0`
              was the worst of the four because the tone rule below paints anything under 2%
              emerald, so an unmeasured agent got a green error rate.

              invocationsKnown is the registry's existing flag: true for seeded rows (where
              the number IS the data) and for live rows with real CloudWatch AgentCore
              telemetry. The other three have no per-agent source at all. */}
          <div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Operational Metrics (30d)</div>
            <div className="grid grid-cols-4 gap-3">
              {agent.invocationsKnown === false
                ? <UnmeasuredStat label="Invocations" why="No CloudWatch AgentCore telemetry was found for this agent. A zero here would mean 'not measured', not 'never invoked'." />
                : <Stat label="Invocations" value={agent.metrics.invocations30d.toLocaleString()} />}
              {isLive
                ? <>
                    <UnmeasuredStat label="Error Rate" why="No AWS metric attributes errors to an individual agent id. Not measured - not zero." />
                    <UnmeasuredStat label="p95 Latency" why="The AgentCore telemetry endpoint reports an average latency, not a p95, and only for agents it has data for. Nothing is claimed rather than mislabelling an average as a p95." />
                    <UnmeasuredStat label="Cost / Day" why="No AWS API attributes Bedrock or AgentCore spend to an individual agent id. Per-agent cost would require every agent to invoke through its own tagged application inference profile." />
                  </>
                : <>
                    <Stat label="Error Rate" value={`${agent.metrics.errorRate}%`} tone={agent.metrics.errorRate > 2 ? 'text-rose-600' : 'text-emerald-600'} />
                    <Stat label="p95 Latency" value={`${agent.metrics.p95LatencyMs}ms`} />
                    <Stat label="Cost / Day" value={`$${agent.metrics.avgCostPerDay}`} />
                  </>}
            </div>
          </div>

          {/* Rate limits. `{ rpm: 100, tpm: 50000 }` is a literal in every live mapper, not
              a throttle read from anywhere - shown as configuration it is an invented limit. */}
          <div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Rate Limits</div>
            <div className="grid grid-cols-2 gap-3">
              {isLive ? (
                <>
                  <UnmeasuredStat label="Requests / min" why="Not read from AWS. Bedrock and AgentCore throttling is applied at the account and model level, not as a per-agent limit this panel can report." />
                  <UnmeasuredStat label="Tokens / min" why="Not read from AWS. Bedrock and AgentCore throttling is applied at the account and model level, not as a per-agent limit this panel can report." />
                </>
              ) : (
                <>
                  <Stat label="Requests / min" value={agent.rateLimit.rpm.toLocaleString()} />
                  <Stat label="Tokens / min" value={agent.rateLimit.tpm.toLocaleString()} />
                </>
              )}
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

          {/* Capabilities — tools. discoveredAgentToAgent returns `tools: []`, so the count
              in the heading read "Authorized Tools (0)" for live agents - a claim that the
              agent has no tools, when in fact its action groups were never queried. */}
          <div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
              Authorized Tools {isLive && agent.tools.length === 0 ? '' : `(${agent.tools.length})`}
            </div>
            {isLive && agent.tools.length === 0 && (
              <UnmeasuredNote>
                Tool inventory not discovered. Reading an agent's action groups needs a per-agent
                call AWS does not include in the list response, so this panel does not know whether
                this agent has tools. An empty list here is not the same as no tools.
              </UnmeasuredNote>
            )}
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

          {/* A2A. `invokesAgents: []` for every live agent, and this section was hidden when
              empty - so a live agent silently showed no agent-to-agent surface at all. The
              callee name lookup is seeded-only, so it is skipped for live rows. */}
          {(agent.invokesAgents.length > 0 || isLive) && (
            <div>
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">May Invoke Agents (A2A)</div>
              {agent.invokesAgents.length === 0 ? (
                <UnmeasuredNote>
                  Agent-to-agent call edges not discovered. Nothing in the AWS agent description
                  declares which other agents an agent may invoke, so this panel cannot say whether
                  this one has an A2A surface.
                </UnmeasuredNote>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {agent.invokesAgents.map(aid => {
                    // Seeded-only lookup, which is all this branch ever needs: live agents
                    // carry no A2A edges, so they take the note above instead.
                    const callee = getAgentById(aid);
                    return <span key={aid} className="text-xs px-2.5 py-1 rounded-lg bg-violet-50 text-violet-700 border border-violet-200">{callee?.name ?? aid}</span>;
                  })}
                </div>
              )}
            </div>
          )}

          {/* Data access. Empty for live agents; an empty chip row reads as "touches no data". */}
          <div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Data Access Patterns</div>
            {agent.dataAccess.length === 0 ? (
              <UnmeasuredNote>
                Data access not discovered. Which knowledge bases, memories or data stores this agent
                reaches is not resolved per agent, so no access pattern is claimed either way.
              </UnmeasuredNote>
            ) : (
              <div className="flex flex-wrap gap-2">
                {agent.dataAccess.map(d => (
                  <span key={d} className="text-xs px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600">{d}</span>
                ))}
              </div>
            )}
          </div>

          {/* Incidents. `{ count90d: 0, openCount: 0 }` is a mapper literal. "0 in last 90
              days" is the single most misleading string this panel produced for a live agent:
              it reads as a verified clean record for an agent no incident source covers. */}
          <div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Incident History</div>
            {isLive ? (
              <UnmeasuredNote>
                Not measured. No incident source is joined to individual agent ids, so this panel
                cannot report whether this agent has had incidents — a zero here would be an absence
                of data, not a clean record.
              </UnmeasuredNote>
            ) : (
              <div className="flex items-center gap-4 text-sm">
                <span className="text-slate-700">{agent.incidents.count90d} in last 90 days</span>
                {agent.incidents.openCount > 0 && <span className="text-rose-600 font-medium">{agent.incidents.openCount} open</span>}
                {agent.incidents.lastIncident && <span className="text-slate-400 text-xs">Last: {agent.incidents.lastIncident}</span>}
              </div>
            )}
          </div>

          {/* Reliability, drift and threats for a live agent: all three sections were hidden
              entirely, which is the quiet version of the same problem the zeros above had. An
              absent Reliability panel reads as an agent nobody has had trouble with, and an
              absent threat list reads as an agent with no threats. Say so instead. */}
          {isLive && (
            <div>
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Reliability, Drift & Threat Profile</div>
              <UnmeasuredNote>
                None of the three are measured for a discovered agent. Reliability and alignment
                drift come from the harness run history, which is keyed to agents registered through
                AVA rather than to agents found in the account. The OWASP Agentic threat profile is
                derived from autonomy scope, tool inventory, data access and A2A edges — all of which
                are unset above, so a derived profile would be an assessment of placeholder values
                rather than of this agent.
              </UnmeasuredNote>
            </div>
          )}

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

          {/* Version history. Real for live agents as far as it goes - the single entry is
              built from the agent's actual version and last-updated date - but it is one point,
              not a history: AWS does not return prior revisions in the list response. */}
          <div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
              Version History
            </div>
            {isLive && (
              <div className="text-[11px] text-slate-400 mb-2">
                Current version and last-updated date only. Prior revisions are not retrieved.
              </div>
            )}
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
