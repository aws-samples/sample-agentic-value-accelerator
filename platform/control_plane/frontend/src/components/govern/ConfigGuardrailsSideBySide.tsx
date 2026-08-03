/**
 * ConfigGuardrailsSideBySide — Side-by-side view of AWS Config Rules and Bedrock Guardrails.
 *
 * Shows two live data sources in a unified panel:
 * - Left: AWS Config rule compliance (failing rules, resource types)
 * - Right: Bedrock Guardrails coverage (invocations, interventions, policy breakdown)
 *
 * Both are live from AWS APIs with honest badges and graceful fallbacks.
 */
import { useEffect, useState, useMemo } from 'react';
import { governPostureApi, governGuardrailsApi, type AwsConfigRuleDetail, type AwsGuardrailTelemetryResponse } from '../../api/client';
import { LiveDataBadge, MockDataBadge } from './DataSourceIndicator';

interface PolicyBreakdown {
  policy_type: string;
  display_name: string;
  description: string;
  interventions: number;
}

export default function ConfigGuardrailsSideBySide() {
  const [configLoading, setConfigLoading] = useState(true);
  const [configData, setConfigData] = useState<AwsConfigRuleDetail | null>(null);
  const [guardrailsLoading, setGuardrailsLoading] = useState(true);
  const [guardrailsData, setGuardrailsData] = useState<AwsGuardrailTelemetryResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    setConfigLoading(true);
    governPostureApi.configRuleDetail()
      .then(d => { if (!cancelled) setConfigData(d); })
      .catch(() => { if (!cancelled) setConfigData(null); })
      .finally(() => { if (!cancelled) setConfigLoading(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setGuardrailsLoading(true);
    governGuardrailsApi.telemetry(30)
      .then(d => { if (!cancelled) setGuardrailsData(d); })
      .catch(() => { if (!cancelled) setGuardrailsData(null); })
      .finally(() => { if (!cancelled) setGuardrailsLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const configRules = configData?.failing_rules ?? [];
  const guardrails = guardrailsData?.guardrails ?? [];
  const byPolicy = (guardrailsData?.by_policy ?? []) as PolicyBreakdown[];

  const configStats = useMemo(() => {
    if (!configData?.live) return null;
    const totalFailing = configData.total_failing ?? 0;
    const resourceTypes = new Set<string>();
    configRules.forEach(r => r.resource_types?.forEach(rt => resourceTypes.add(rt)));
    return { totalFailing, resourceTypes: Array.from(resourceTypes).slice(0, 5) };
  }, [configData, configRules]);

  const guardrailStats = useMemo(() => {
    if (!guardrailsData?.live) return null;
    return {
      total: guardrailsData.total_guardrails ?? 0,
      invocations: guardrailsData.total_invocations ?? 0,
      interventions: guardrailsData.total_interventions ?? 0,
      interventionRate: guardrailsData.intervention_rate_pct ?? 0,
      withMetrics: guardrailsData.guardrails_with_metrics ?? 0,
    };
  }, [guardrailsData]);

  return (
    <div className="rounded-xl border border-slate-200/60 bg-white/80 backdrop-blur-sm shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-slate-100/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-900">AWS Config Rules vs Bedrock Guardrails</h3>
            <span className="text-[10px] text-slate-500">Live compliance posture from AWS APIs</span>
          </div>
          <div className="flex items-center gap-2">
            {(configData?.live || guardrailsData?.live) && <LiveDataBadge />}
            {(!configData?.live && !guardrailsData?.live && !configLoading && !guardrailsLoading) && (
              <MockDataBadge integration="AWS Config + Bedrock Guardrails" />
            )}
          </div>
        </div>
      </div>

      {/* Side-by-side panels */}
      <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-slate-100">
        {/* Left: AWS Config Rules */}
        <div className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center">
              <svg className="w-4 h-4 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-900">AWS Config Rules</div>
              <div className="text-[10px] text-slate-500">Infrastructure compliance evaluation</div>
            </div>
            {configData?.live && <LiveDataBadge />}
          </div>

          {configLoading ? (
            <div className="h-32 flex items-center justify-center text-xs text-slate-400">Loading from AWS Config...</div>
          ) : configData?.live && configStats ? (
            <div className="space-y-4">
              {/* Stats row */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-rose-50 rounded-lg p-3 border border-rose-100">
                  <div className="text-2xl font-bold text-rose-600 tabular-nums">{configStats.totalFailing}</div>
                  <div className="text-[10px] text-rose-700">Failing Rules</div>
                </div>
                <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
                  <div className="text-2xl font-bold text-slate-700 tabular-nums">{configStats.resourceTypes.length}+</div>
                  <div className="text-[10px] text-slate-600">Resource Types</div>
                </div>
              </div>

              {/* Top failing rules */}
              {configRules.length > 0 && (
                <div>
                  <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-2">Top Failing Rules</div>
                  <div className="space-y-1.5">
                    {configRules.slice(0, 5).map(r => (
                      <div key={r.rule_name} className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2">
                        <div className="flex-1 min-w-0">
                          <div className="text-[11px] font-medium text-slate-800 truncate" title={r.rule_name}>
                            {r.rule_name}
                          </div>
                          {r.resource_types && r.resource_types.length > 0 && (
                            <div className="text-[9px] text-slate-500 truncate">
                              {r.resource_types.slice(0, 2).join(', ')}
                            </div>
                          )}
                        </div>
                        <div className="text-[11px] font-semibold text-rose-600 tabular-nums ml-2">
                          {r.failing_resource_count} failing
                        </div>
                      </div>
                    ))}
                  </div>
                  {configRules.length > 5 && (
                    <div className="text-[10px] text-slate-400 mt-2">
                      +{configRules.length - 5} more failing rules
                    </div>
                  )}
                </div>
              )}

              {configRules.length === 0 && (
                <div className="bg-emerald-50 rounded-lg p-3 border border-emerald-200">
                  <div className="text-[11px] text-emerald-700 font-medium">All Config rules compliant</div>
                  <div className="text-[10px] text-emerald-600">No failing rules detected</div>
                </div>
              )}

              {configData.note && (
                <div className="text-[10px] text-slate-400">{configData.note}</div>
              )}
            </div>
          ) : (
            <div className="bg-amber-50 rounded-lg p-4 border border-amber-200">
              <div className="text-[11px] font-medium text-amber-700">Config data unavailable</div>
              <div className="text-[10px] text-amber-600 mt-1">
                {configData?.note ?? 'AWS Config API unreachable or permissions not granted.'}
              </div>
            </div>
          )}
        </div>

        {/* Right: Bedrock Guardrails */}
        <div className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center">
              <svg className="w-4 h-4 text-violet-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-900">Bedrock Guardrails</div>
              <div className="text-[10px] text-slate-500">LLM content & safety controls</div>
            </div>
            {guardrailsData?.live && <LiveDataBadge />}
          </div>

          {guardrailsLoading ? (
            <div className="h-32 flex items-center justify-center text-xs text-slate-400">Loading from Bedrock...</div>
          ) : guardrailsData?.live && guardrailStats ? (
            <div className="space-y-4">
              {/* Stats row */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-violet-50 rounded-lg p-3 border border-violet-100">
                  <div className="text-2xl font-bold text-violet-600 tabular-nums">{guardrailStats.total}</div>
                  <div className="text-[10px] text-violet-700">Active Guardrails</div>
                </div>
                <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
                  <div className="text-2xl font-bold text-slate-700 tabular-nums">
                    {guardrailStats.interventionRate.toFixed(1)}%
                  </div>
                  <div className="text-[10px] text-slate-600">Intervention Rate</div>
                </div>
              </div>

              {/* Invocations breakdown */}
              {guardrailStats.invocations > 0 && (
                <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-[10px] text-slate-500 uppercase tracking-wide">30-Day Activity</div>
                    <div className="text-[11px] font-semibold text-slate-700 tabular-nums">
                      {guardrailStats.invocations.toLocaleString()} invocations
                    </div>
                  </div>
                  <div className="flex h-2 rounded-full overflow-hidden bg-slate-200">
                    <div
                      className="bg-rose-500"
                      style={{ width: `${guardrailStats.interventionRate}%` }}
                      title={`${guardrailStats.interventions.toLocaleString()} interventions`}
                    />
                    <div
                      className="bg-emerald-400"
                      style={{ width: `${100 - guardrailStats.interventionRate}%` }}
                      title="Allowed"
                    />
                  </div>
                  <div className="flex items-center gap-3 mt-1.5 text-[10px] text-slate-500">
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-rose-500" />
                      {guardrailStats.interventions.toLocaleString()} blocked
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-emerald-400" />
                      {(guardrailStats.invocations - guardrailStats.interventions).toLocaleString()} allowed
                    </span>
                  </div>
                </div>
              )}

              {/* Policy type breakdown */}
              {byPolicy.length > 0 && (
                <div>
                  <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-2">Interventions by Policy</div>
                  <div className="space-y-1.5">
                    {byPolicy.filter(p => p.interventions > 0).slice(0, 5).map(p => (
                      <div key={p.policy_type} className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2">
                        <div className="flex-1 min-w-0">
                          <div className="text-[11px] font-medium text-slate-800">{p.display_name}</div>
                          <div className="text-[9px] text-slate-500 truncate">{p.description}</div>
                        </div>
                        <div className="text-[11px] font-semibold text-rose-600 tabular-nums ml-2">
                          {p.interventions.toLocaleString()}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {guardrailStats.invocations === 0 && (
                <div className="bg-amber-50 rounded-lg p-3 border border-amber-200">
                  <div className="text-[11px] text-amber-700 font-medium">No invocations recorded</div>
                  <div className="text-[10px] text-amber-600">Guardrails configured but not yet invoked</div>
                </div>
              )}

              {guardrailsData.note && (
                <div className="text-[10px] text-slate-400">{guardrailsData.note}</div>
              )}
            </div>
          ) : (
            <div className="bg-amber-50 rounded-lg p-4 border border-amber-200">
              <div className="text-[11px] font-medium text-amber-700">Guardrails data unavailable</div>
              <div className="text-[10px] text-amber-600 mt-1">
                {guardrailsData?.note ?? 'Bedrock API unreachable or no guardrails configured.'}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer: Coverage mapping hint */}
      <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/50">
        <div className="flex items-center gap-2 text-[10px] text-slate-500">
          <svg className="w-3.5 h-3.5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>
            <strong>Config Rules</strong> enforce infrastructure compliance (IAM, S3, networking).{' '}
            <strong>Guardrails</strong> enforce LLM content safety (PII, topics, grounding).
            Both auto-detect control satisfaction for compliance frameworks.
          </span>
        </div>
      </div>
    </div>
  );
}
