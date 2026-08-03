/**
 * LivePromptTelemetry — Live AWS data for Prompt Governance.
 *
 * Pulls from:
 * - governGuardrailsApi.telemetry() — Guardrail intervention metrics
 * - governInvocationSafetyApi.telemetry() — Invocation logs (stop reasons, tokens)
 * - governAgentCoreApi.agentMetrics() — Agent runtime metrics
 *
 * These APIs hit real AWS services (CloudWatch, Bedrock, CloudTrail).
 */

import { useEffect, useState } from 'react';
import {
  governGuardrailsApi,
  governInvocationSafetyApi,
  governAgentCoreApi,
  type AwsGuardrailTelemetryResponse,
  type AwsInvocationSafetyResponse,
  type AwsAgentRuntimeMetricsResponse,
} from '../../api/client';
import { LiveDataBadge, MockDataBadge } from './DataSourceIndicator';
import { Icon } from './icons';
import { usePollingKey } from './usePollingKey';
import LiveHeader from './LiveHeader';

// ─────────────────────────── Live Guardrail Telemetry ───────────────────────────

export function LiveGuardrailTelemetry() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<AwsGuardrailTelemetryResponse | null>(null);
  const pollKey = usePollingKey(60_000);

  useEffect(() => {
    let cancelled = false;
    governGuardrailsApi.telemetry(30)
      .then(d => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setData(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [pollKey]);

  const live = !!data?.live;

  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5 mb-6">
      <LiveHeader
        live={live}
        label={live ? 'Live · Guardrail Telemetry' : 'Guardrail Telemetry'}
        caption="intervention metrics from AWS CloudWatch (last 30 days)"
        autoRefresh
      />

      {loading ? (
        <div className="h-20 flex items-center justify-center text-xs text-slate-400">Loading guardrail metrics...</div>
      ) : data ? (
        <div className="space-y-4">
          {/* Stats Row */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <StatTile label="Guardrails" value={data.total_guardrails} icon="shield-check" />
            <StatTile label="Invocations" value={formatNumber(data.total_invocations)} icon="bolt" />
            <StatTile label="Interventions" value={formatNumber(data.total_interventions)} icon="exclamation-triangle" color={data.total_interventions > 0 ? 'text-amber-600' : undefined} />
            <StatTile label="Intervention Rate" value={`${data.intervention_rate_pct.toFixed(1)}%`} icon="chart-bar" color={data.intervention_rate_pct > 5 ? 'text-rose-600' : undefined} />
            <StatTile label="Active" value={data.guardrails_with_metrics} icon="check-circle" sub="with metrics" />
          </div>

          {/* Guardrails Table */}
          {data.guardrails.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[11px] font-semibold text-slate-700">Guardrails by Intervention Rate</span>
                {live && <LiveDataBadge />}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="text-slate-400 text-[10px] uppercase tracking-wide text-left border-b border-slate-100">
                      <th className="font-medium pb-2">Guardrail</th>
                      <th className="font-medium pb-2 text-right">Invocations</th>
                      <th className="font-medium pb-2 text-right">Interventions</th>
                      <th className="font-medium pb-2 text-right">Rate</th>
                      <th className="font-medium pb-2 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.guardrails.slice(0, 8).map((gr, i) => (
                      <tr key={gr.guardrail_id} className={i > 0 ? 'border-t border-slate-50' : ''}>
                        <td className="py-2 pr-2">
                          <div className="font-medium text-slate-800">{gr.name}</div>
                          <div className="text-[10px] text-slate-400 font-mono">{gr.guardrail_id}</div>
                        </td>
                        <td className="py-2 text-right text-slate-600">{gr.invocations.toLocaleString()}</td>
                        <td className="py-2 text-right text-slate-600">{gr.interventions.toLocaleString()}</td>
                        <td className="py-2 text-right">
                          <span className={`font-medium ${gr.intervention_rate_pct > 10 ? 'text-rose-600' : gr.intervention_rate_pct > 5 ? 'text-amber-600' : 'text-slate-600'}`}>
                            {gr.intervention_rate_pct.toFixed(1)}%
                          </span>
                        </td>
                        <td className="py-2 text-right">
                          <span className={`text-[9px] px-1.5 py-0.5 rounded ${gr.status === 'READY' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                            {gr.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Policy Breakdown */}
          {data.by_policy.length > 0 && (
            <div>
              <div className="text-[11px] font-semibold text-slate-700 mb-2">Interventions by Policy Type</div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {data.by_policy.map(p => (
                  <div key={p.policy_type} className="bg-slate-50 rounded-lg p-2.5">
                    <div className="text-[10px] text-slate-500 uppercase tracking-wide">{p.label}</div>
                    <div className="text-lg font-semibold text-slate-800">{p.interventions.toLocaleString()}</div>
                    <div className="text-[9px] text-slate-400">{p.dimension}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {data.guardrails.length === 0 && (
            <div className="text-center py-6 text-slate-400">
              <Icon name="shield-check" className="w-8 h-8 mx-auto mb-2" />
              <div className="text-sm">No guardrails configured</div>
              <div className="text-xs">Create guardrails in the Bedrock console to see telemetry</div>
            </div>
          )}
        </div>
      ) : (
        <div className="text-center py-6 text-slate-400">
          <Icon name="exclamation-circle" className="w-8 h-8 mx-auto mb-2" />
          <div className="text-sm">Unable to load guardrail telemetry</div>
          <div className="text-xs">Check AWS credentials and CloudWatch permissions</div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────── Live Invocation Safety ───────────────────────────

export function LiveInvocationSafety() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<AwsInvocationSafetyResponse | null>(null);
  const pollKey = usePollingKey(60_000);

  useEffect(() => {
    let cancelled = false;
    governInvocationSafetyApi.telemetry(7)
      .then(d => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setData(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [pollKey]);

  const live = !!data?.live;

  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5 mb-6">
      <LiveHeader
        live={live}
        label={live ? 'Live · Invocation Safety' : 'Invocation Safety'}
        caption="from Bedrock model invocation logging (last 7 days)"
        autoRefresh
      />

      {loading ? (
        <div className="h-20 flex items-center justify-center text-xs text-slate-400">Loading invocation data...</div>
      ) : data ? (
        <div className="space-y-4">
          {/* Logging Status */}
          {!data.logging_enabled && (
            <div className="bg-amber-50 rounded-lg px-4 py-3 border border-amber-200 flex items-start gap-2">
              <Icon name="exclamation-triangle" className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
              <div>
                <div className="text-xs font-medium text-amber-800">Model Invocation Logging Not Enabled</div>
                <div className="text-[10px] text-amber-700">Enable logging in Bedrock console → Settings → Model invocation logging for detailed analytics</div>
              </div>
            </div>
          )}

          {/* Stats Row */}
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
            <StatTile label="Total Calls" value={formatNumber(data.total_calls)} icon="bolt" />
            <StatTile label="Completions" value={formatNumber(data.completion_calls)} icon="check-circle" />
            <StatTile label="Guardrail Blocked" value={formatNumber(data.guardrail_intervened)} icon="shield-check" color={data.guardrail_intervened > 0 ? 'text-amber-600' : undefined} />
            <StatTile label="Block Rate" value={`${data.intervention_rate_pct.toFixed(1)}%`} icon="chart-bar" />
            <StatTile label="Input Tokens" value={formatNumber(data.input_tokens)} icon="arrow-right" sub="consumed" />
            <StatTile label="Output Tokens" value={formatNumber(data.output_tokens)} icon="arrow-down" sub="generated" />
          </div>

          {/* By Model */}
          {data.by_model.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[11px] font-semibold text-slate-700">By Model</span>
                {live && <LiveDataBadge />}
              </div>
              <div className="space-y-1.5">
                {data.by_model.slice(0, 6).map(m => {
                  const rate = m.calls > 0 ? (m.guardrail_intervened / m.calls * 100) : 0;
                  return (
                    <div key={m.model_id} className="flex items-center gap-3 bg-slate-50 rounded-lg px-3 py-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-[11px] font-medium text-slate-800 truncate">{m.model_id.split('.').pop()?.split('-').slice(0, 3).join('-')}</div>
                        <div className="text-[9px] text-slate-400 font-mono truncate">{m.model_id}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs font-medium text-slate-700">{m.calls.toLocaleString()} calls</div>
                        <div className={`text-[10px] ${rate > 5 ? 'text-amber-600' : 'text-slate-500'}`}>
                          {m.guardrail_intervened} blocked ({rate.toFixed(1)}%)
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Stop Reasons */}
          {data.stop_reasons.length > 0 && (
            <div>
              <div className="text-[11px] font-semibold text-slate-700 mb-2">Stop Reasons</div>
              <div className="flex flex-wrap gap-2">
                {data.stop_reasons.map(sr => (
                  <div key={sr.reason} className={`px-2.5 py-1.5 rounded-lg text-[10px] ${
                    sr.reason.toLowerCase().includes('guardrail') ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                    sr.reason.toLowerCase().includes('error') ? 'bg-rose-50 text-rose-700 border border-rose-200' :
                    'bg-slate-50 text-slate-600 border border-slate-200'
                  }`}>
                    <span className="font-medium">{sr.reason}</span>
                    <span className="ml-1 text-[9px] opacity-70">{sr.count.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Trend Chart */}
          {data.trend.length > 0 && (
            <div>
              <div className="text-[11px] font-semibold text-slate-700 mb-2">Daily Trend</div>
              <div className="flex items-end gap-1 h-16">
                {data.trend.map((d, i) => {
                  const maxCalls = Math.max(...data.trend.map(t => t.calls), 1);
                  const height = (d.calls / maxCalls * 100);
                  const interventionHeight = d.calls > 0 ? (d.guardrail_intervened / d.calls * height) : 0;
                  return (
                    <div key={d.date} className="flex-1 flex flex-col items-center">
                      <div className="w-full bg-slate-100 rounded-t relative" style={{ height: `${height}%`, minHeight: '4px' }}>
                        {interventionHeight > 0 && (
                          <div className="absolute bottom-0 left-0 right-0 bg-amber-400 rounded-t" style={{ height: `${interventionHeight}%` }} />
                        )}
                      </div>
                      {i % 2 === 0 && (
                        <div className="text-[8px] text-slate-400 mt-1">{new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center gap-4 mt-2 text-[9px] text-slate-500">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-slate-200" /> Calls</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-amber-400" /> Guardrail blocked</span>
              </div>
            </div>
          )}

          {data.total_calls === 0 && (
            <div className="text-center py-6 text-slate-400">
              <Icon name="bolt" className="w-8 h-8 mx-auto mb-2" />
              <div className="text-sm">No invocation data</div>
              <div className="text-xs">Make Bedrock API calls to see telemetry</div>
            </div>
          )}
        </div>
      ) : (
        <div className="text-center py-6 text-slate-400">
          <Icon name="exclamation-circle" className="w-8 h-8 mx-auto mb-2" />
          <div className="text-sm">Unable to load invocation data</div>
          <div className="text-xs">Check AWS credentials and CloudWatch Logs permissions</div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────── Live Agent Metrics ───────────────────────────

export function LiveAgentMetrics() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<AwsAgentRuntimeMetricsResponse | null>(null);
  const pollKey = usePollingKey(60_000);

  useEffect(() => {
    let cancelled = false;
    governAgentCoreApi.agentMetrics(7)
      .then(d => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setData(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [pollKey]);

  const live = !!data?.live;
  const agents = data?.by_agent ?? [];

  const totals = {
    invocations: agents.reduce((sum, a) => sum + a.invocations, 0),
    errors: agents.reduce((sum, a) => sum + a.errors, 0),
    sessions: agents.reduce((sum, a) => sum + a.sessions, 0),
  };

  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
      <LiveHeader
        live={live}
        label={live ? 'Live · Agent Runtime Metrics' : 'Agent Runtime Metrics'}
        caption="from Bedrock Agents & AgentCore CloudWatch (last 7 days)"
        autoRefresh
      />

      {loading ? (
        <div className="h-20 flex items-center justify-center text-xs text-slate-400">Loading agent metrics...</div>
      ) : agents.length > 0 ? (
        <div className="space-y-4">
          {/* Stats Row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatTile label="Agents" value={agents.length} icon="cpu-chip" />
            <StatTile label="Invocations" value={formatNumber(totals.invocations)} icon="bolt" />
            <StatTile label="Sessions" value={formatNumber(totals.sessions)} icon="user" />
            <StatTile label="Errors" value={formatNumber(totals.errors)} icon="x-circle" color={totals.errors > 0 ? 'text-rose-600' : undefined} />
          </div>

          {/* Agent Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="text-slate-400 text-[10px] uppercase tracking-wide text-left border-b border-slate-100">
                  <th className="font-medium pb-2">Agent</th>
                  <th className="font-medium pb-2 text-right">Invocations</th>
                  <th className="font-medium pb-2 text-right">Avg Latency</th>
                  <th className="font-medium pb-2 text-right">Sessions</th>
                  <th className="font-medium pb-2 text-right">Errors</th>
                </tr>
              </thead>
              <tbody>
                {agents.slice(0, 10).map((agent, i) => (
                  <tr key={agent.runtime_name} className={i > 0 ? 'border-t border-slate-50' : ''}>
                    <td className="py-2 pr-2">
                      <div className="font-medium text-slate-800">{agent.runtime_name}</div>
                    </td>
                    <td className="py-2 text-right text-slate-600">{agent.invocations.toLocaleString()}</td>
                    <td className="py-2 text-right text-slate-600">{agent.avg_latency_ms.toFixed(0)}ms</td>
                    <td className="py-2 text-right text-slate-600">{agent.sessions.toLocaleString()}</td>
                    <td className="py-2 text-right">
                      <span className={agent.errors > 0 ? 'text-rose-600 font-medium' : 'text-slate-400'}>
                        {agent.errors.toLocaleString()}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="text-center py-6 text-slate-400">
          <Icon name="cpu-chip" className="w-8 h-8 mx-auto mb-2" />
          <div className="text-sm">No agent metrics</div>
          <div className="text-xs">Deploy Bedrock Agents or AgentCore runtimes to see metrics</div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────── Utilities ───────────────────────────

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function StatTile({ label, value, icon, color, sub }: { label: string; value: string | number; icon: Parameters<typeof Icon>[0]['name']; color?: string; sub?: string }) {
  return (
    <div className="bg-slate-50 rounded-lg p-3 text-center">
      <div className="flex justify-center mb-1">
        <Icon name={icon} className="w-4 h-4 text-slate-400" />
      </div>
      <div className={`text-lg font-bold ${color || 'text-slate-800'}`}>{value}</div>
      <div className="text-[10px] text-slate-500 uppercase tracking-wide">{label}</div>
      {sub && <div className="text-[9px] text-slate-400">{sub}</div>}
    </div>
  );
}
