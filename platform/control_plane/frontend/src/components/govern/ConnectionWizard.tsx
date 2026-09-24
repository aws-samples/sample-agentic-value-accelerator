/**
 * ConnectionWizard — connection status bar with per-source setup guidance.
 *
 * Reads `GET /api/v1/govern/data-sources/status`, which reports measured
 * reachability from one real AWS call per source. See DataSourceIndicator for the
 * counting rules; this component follows the same ones so the two can never
 * disagree:
 *   - numerator   = connected + connected_empty
 *   - denominator = probed (total - not_probed)
 *   - emerald only when every probed source is connected and none are unprobeable
 *
 * The previous version got all three wrong. It read `info.live` (a "has data"
 * flag the backend coerced to true when unknown), painted the header emerald
 * unconditionally, and treated `connected >= total - 1` as fully connected — a
 * built-in one-source fudge factor that hid exactly the kind of gap this panel
 * exists to surface.
 *
 * The service catalog is imported from DataSourceIndicator rather than restated.
 * This file used to carry its own 22-entry id list and 7-category grouping, which
 * silently drifted out of sync with the 50-source catalog next door; the only
 * thing kept local is the setup guidance, which has no other home.
 */

import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { governDataSourcesApi, type DataSourceInfo, type DataSourceProbeStatus } from '../../api/client';
import { AWS_SERVICE_GROUPS, PROBE_STATUS_CONFIG } from './DataSourceIndicator';
import { Icon } from './icons';

interface SetupHelp {
  setupSteps: string[];
  docsUrl?: string;
}

/** Remediation guidance, keyed by catalog source id. Sources without an entry
 *  simply show their probe detail — an absent entry is not an error. */
const SETUP_HELP: Record<string, SetupHelp> = {
  'bedrock-models': {
    setupSteps: ['Enable Bedrock in your AWS account', 'Request access to foundation models via the Bedrock console'],
    docsUrl: 'https://docs.aws.amazon.com/bedrock/latest/userguide/model-access.html',
  },
  'bedrock-guardrails': {
    setupSteps: ['Create guardrails in the Bedrock console or via AVA', 'Guardrails are auto-synced every 5 minutes'],
    docsUrl: 'https://docs.aws.amazon.com/bedrock/latest/userguide/guardrails.html',
  },
  'bedrock-agents': {
    setupSteps: ['Deploy Bedrock Agents in the console', 'Grant bedrock-agent:ListAgents'],
    docsUrl: 'https://docs.aws.amazon.com/bedrock/latest/userguide/agents.html',
  },
  'bedrock-kbs': {
    setupSteps: ['Create knowledge bases in the Bedrock console', 'Configure data sources (S3, Confluence, etc.)'],
    docsUrl: 'https://docs.aws.amazon.com/bedrock/latest/userguide/knowledge-base.html',
  },
  'bedrock-flows': {
    setupSteps: ['Create flows in the Bedrock console', 'Grant bedrock-agent:ListFlows'],
    docsUrl: 'https://docs.aws.amazon.com/bedrock/latest/userguide/flows.html',
  },
  'bedrock-prompts': {
    setupSteps: ['Create prompts in the Bedrock console', 'Grant bedrock-agent:ListPrompts'],
    docsUrl: 'https://docs.aws.amazon.com/bedrock/latest/userguide/prompt-management.html',
  },
  'bedrock-evals': {
    setupSteps: ['Run evaluation jobs in the Bedrock console', 'Grant bedrock:ListEvaluationJobs'],
    docsUrl: 'https://docs.aws.amazon.com/bedrock/latest/userguide/model-evaluation.html',
  },
  'bedrock-invocation-logs': {
    setupSteps: ['Enable model invocation logging in Bedrock', 'Configure a CloudWatch Logs destination'],
    docsUrl: 'https://docs.aws.amazon.com/bedrock/latest/userguide/model-invocation-logging.html',
  },
  'agentcore-runtimes': {
    setupSteps: ['Deploy AgentCore runtimes', 'Grant bedrock-agentcore-control permissions'],
    docsUrl: 'https://docs.aws.amazon.com/bedrock/latest/userguide/agents-agentcore.html',
  },
  'agentcore-gateways': {
    setupSteps: ['Deploy AgentCore gateways', 'Configure gateway targets'],
    docsUrl: 'https://docs.aws.amazon.com/bedrock/latest/userguide/agents-agentcore-gateway.html',
  },
  'agentcore-policies': {
    setupSteps: ['Create policy engines', 'Define Cedar policies'],
  },
  'sagemaker-registry': {
    setupSteps: ['Register models in the SageMaker Model Registry', 'Grant sagemaker:ListModelPackages'],
    docsUrl: 'https://docs.aws.amazon.com/sagemaker/latest/dg/model-registry.html',
  },
  'sagemaker-cards': {
    setupSteps: ['Create model cards in SageMaker', 'Grant sagemaker:ListModelCards'],
    docsUrl: 'https://docs.aws.amazon.com/sagemaker/latest/dg/model-cards.html',
  },
  securityhub: {
    setupSteps: ['Enable Security Hub in your AWS account', 'Configure cross-account aggregation for multi-account visibility'],
    docsUrl: 'https://docs.aws.amazon.com/securityhub/latest/userguide/what-is-securityhub.html',
  },
  guardduty: {
    setupSteps: ['Enable GuardDuty in the target region'],
    docsUrl: 'https://docs.aws.amazon.com/guardduty/latest/ug/guardduty_settingup.html',
  },
  inspector: {
    setupSteps: ['Enable Inspector for this account'],
    docsUrl: 'https://docs.aws.amazon.com/inspector/latest/user/getting_started_tutorial.html',
  },
  macie: {
    setupSteps: ['Enable Macie in the target region'],
    docsUrl: 'https://docs.aws.amazon.com/macie/latest/user/getting-started.html',
  },
  'access-analyzer': {
    setupSteps: ['Create an IAM Access Analyzer analyzer in the target region'],
    docsUrl: 'https://docs.aws.amazon.com/IAM/latest/UserGuide/what-is-access-analyzer.html',
  },
  detective: {
    setupSteps: ['Enable Detective and create a behavior graph'],
    docsUrl: 'https://docs.aws.amazon.com/detective/latest/adminguide/detective-setup.html',
  },
  'security-lake': {
    setupSteps: ['Enable Security Lake in your account', 'Grant securitylake:ListDataLakes to the control-plane role'],
    docsUrl: 'https://docs.aws.amazon.com/security-lake/latest/userguide/what-is-security-lake.html',
  },
  'cloudwatch-metrics': {
    setupSteps: ['Invoke Bedrock models to generate CloudWatch metrics', 'Grant cloudwatch:GetMetricData'],
    docsUrl: 'https://docs.aws.amazon.com/bedrock/latest/userguide/monitoring-cloudwatch.html',
  },
  xray: {
    setupSteps: ['Enable X-Ray tracing for your agents', 'Grant xray:GetTraceSummaries'],
    docsUrl: 'https://docs.aws.amazon.com/xray/latest/devguide/aws-xray.html',
  },
  cloudtrail: {
    setupSteps: ['CloudTrail is usually enabled by default', 'Grant cloudtrail:LookupEvents'],
    docsUrl: 'https://docs.aws.amazon.com/awscloudtrail/latest/userguide/cloudtrail-getting-started.html',
  },
  'cloudtrail-lake': {
    setupSteps: ['Create a CloudTrail Lake event data store', 'Grant cloudtrail:StartQuery'],
    docsUrl: 'https://docs.aws.amazon.com/awscloudtrail/latest/userguide/cloudtrail-lake.html',
  },
  'trusted-advisor': {
    setupSteps: ['Trusted Advisor checks require Business or Enterprise Support'],
    docsUrl: 'https://docs.aws.amazon.com/awssupport/latest/user/trusted-advisor.html',
  },
  config: {
    setupSteps: ['Enable AWS Config in the target region', 'Deploy Config rules (managed or custom)'],
    docsUrl: 'https://docs.aws.amazon.com/config/latest/developerguide/gs-console.html',
  },
  'cost-explorer': {
    setupSteps: ['Enable Cost Explorer in the AWS Billing console', 'Grant ce:GetCostAndUsage'],
    docsUrl: 'https://docs.aws.amazon.com/cost-management/latest/userguide/ce-enable.html',
  },
  'compute-optimizer': {
    setupSteps: ['Opt in to Compute Optimizer for this account'],
    docsUrl: 'https://docs.aws.amazon.com/compute-optimizer/latest/ug/getting-started.html',
  },
};

const CATEGORY_COLORS: Record<string, { bg: string; border: string; text: string; iconBg: string }> = {
  violet: { bg: 'bg-violet-50', border: 'border-violet-200', text: 'text-violet-700', iconBg: 'bg-violet-100' },
  indigo: { bg: 'bg-indigo-50', border: 'border-indigo-200', text: 'text-indigo-700', iconBg: 'bg-indigo-100' },
  orange: { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700', iconBg: 'bg-orange-100' },
  sky: { bg: 'bg-sky-50', border: 'border-sky-200', text: 'text-sky-700', iconBg: 'bg-sky-100' },
  rose: { bg: 'bg-rose-50', border: 'border-rose-200', text: 'text-rose-700', iconBg: 'bg-rose-100' },
  emerald: { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', iconBg: 'bg-emerald-100' },
  amber: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', iconBg: 'bg-amber-100' },
  slate: { bg: 'bg-slate-50', border: 'border-slate-200', text: 'text-slate-700', iconBg: 'bg-slate-100' },
};

/** Row tint by measured status. Only the two connected statuses get a positive
 *  tint; everything else is neutral or negative. */
const ROW_TINT: Record<DataSourceProbeStatus, string> = {
  connected: 'bg-emerald-50/50 border-emerald-200',
  connected_empty: 'bg-teal-50/50 border-teal-200',
  degraded: 'bg-amber-50/50 border-amber-200',
  access_denied: 'bg-rose-50/50 border-rose-200',
  not_enabled: 'bg-slate-50/50 border-slate-200',
  error: 'bg-rose-50/50 border-rose-200',
  not_probed: 'bg-slate-50/50 border-dashed border-slate-300',
};

const ALL_SOURCE_IDS = AWS_SERVICE_GROUPS.flatMap(g => g.sources.map(s => s.id));

export default function ConnectionWizard({ onDismiss }: { onDismiss?: () => void }) {
  // null, not {} — an empty object is indistinguishable from "50 sources, none
  // connected", and rendering that before the first response is its own false claim.
  const [sources, setSources] = useState<Record<string, DataSourceInfo> | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    try {
      const data = await governDataSourcesApi.status();
      setSources(data.sources ?? {});
      setFailed(false);
      setLastRefresh(Date.now());
    } catch (e) {
      // Clear the previous result. The old version logged and returned, leaving
      // the last successful counts on screen as if they were current.
      console.error('Failed to fetch data sources status:', e);
      setSources(null);
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchStatus();
    const interval = setInterval(() => void fetchStatus(), 60000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await governDataSourcesApi.refresh();
      await fetchStatus();
    } catch (e) {
      console.error('Refresh failed:', e);
      setFailed(true);
    } finally {
      setRefreshing(false);
    }
  };

  const statusOf = (id: string): DataSourceProbeStatus | null =>
    sources == null ? null : (sources[id]?.status ?? 'not_probed');

  const countIn = (ids: string[]) => {
    if (sources == null) return null;
    let connected = 0;
    let notProbed = 0;
    for (const id of ids) {
      const status = sources[id]?.status ?? 'not_probed';
      if (status === 'not_probed') notProbed += 1;
      else if (PROBE_STATUS_CONFIG[status].counts) connected += 1;
    }
    return { connected, notProbed, probed: ids.length - notProbed };
  };

  const overall = countIn(ALL_SOURCE_IDS);
  const allConnected = overall != null && overall.probed > 0 && overall.connected === overall.probed && overall.notProbed === 0;
  const needsAttention = overall == null ? 0 : overall.probed - overall.connected;

  /** Up to three real observations, drawn only from sources with an exact count.
   *  A page length is not a total, so unbounded list responses are not summarised
   *  as numbers here. */
  const highlights = ALL_SOURCE_IDS
    .map(id => sources?.[id])
    .filter((s): s is DataSourceInfo => s != null && s.exact_count != null && s.exact_count > 0)
    .slice(0, 3)
    .map(s => `${s.label}: ${s.detail ?? s.exact_count}`);

  return (
    <div className="rounded-xl border border-slate-200/60 overflow-hidden bg-white shadow-sm">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
            allConnected
              ? 'bg-gradient-to-br from-emerald-500 to-green-600'
              : overall != null && overall.connected > 0
              ? 'bg-gradient-to-br from-blue-500 to-indigo-600'
              : 'bg-gradient-to-br from-slate-400 to-slate-500'
          }`}>
            <Icon name="database" className="w-4 h-4 text-white" />
          </div>

          <div className="text-left">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-800 text-sm">Data Sources</span>
              {failed ? (
                <span className="text-xs text-slate-500">status unavailable</span>
              ) : overall == null ? (
                <span className="text-xs text-slate-400">—/— checking</span>
              ) : (
                <span className={`text-xs font-medium ${allConnected ? 'text-emerald-600' : 'text-slate-600'}`}>
                  {overall.connected}/{overall.probed} verified
                  {overall.notProbed > 0 && (
                    <span className="text-slate-400 font-normal"> · {overall.notProbed} not probed</span>
                  )}
                </span>
              )}
              {allConnected && (
                <span className="text-[9px] text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">auto-sync</span>
              )}
            </div>
            {highlights.length > 0 && (
              <div className="text-xs text-slate-500 flex items-center gap-2">
                {highlights.map((h, i) => (
                  <span key={i} className="flex items-center gap-1">
                    {i > 0 && <span className="text-slate-300">·</span>}
                    {h}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {needsAttention > 0 && !isOpen && (
            <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
              {needsAttention} need attention
            </span>
          )}
          <svg
            className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
          {onDismiss && (
            <button
              onClick={(e) => { e.stopPropagation(); onDismiss(); }}
              className="text-slate-400 hover:text-slate-600 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </button>

      {isOpen && (
        <>
          <div className="px-4 pb-4 pt-2 border-t border-slate-100 space-y-4">
            {failed && (
              <p className="text-[11px] text-slate-600">
                Could not reach the data-source status endpoint, so no source is shown as connected.
              </p>
            )}
            {AWS_SERVICE_GROUPS.map(group => {
              const colors = CATEGORY_COLORS[group.color] ?? CATEGORY_COLORS.slate;
              const counts = countIn(group.sources.map(s => s.id));

              return (
                <div key={group.id} className="space-y-1.5">
                  <div className={`flex items-center gap-2 px-2 py-1.5 rounded-lg ${colors.bg} ${colors.border} border`}>
                    <div className={`w-6 h-6 rounded flex items-center justify-center ${colors.iconBg}`}>
                      <Icon name={group.icon as any} className={`w-3.5 h-3.5 ${colors.text}`} />
                    </div>
                    <span className={`text-xs font-semibold ${colors.text}`}>{group.name}</span>
                    <span className="text-[9px] text-slate-500 ml-auto">
                      {counts == null ? '—/—' : `${counts.connected}/${counts.probed}`} verified
                    </span>
                  </div>

                  <div className="space-y-1 pl-2">
                    {group.sources.map(source => {
                      const info = sources?.[source.id];
                      const status = statusOf(source.id);
                      const help = SETUP_HELP[source.id];
                      const cfg = status == null ? null : PROBE_STATUS_CONFIG[status];
                      const isConnected = cfg?.counts === true;

                      return (
                        <div
                          key={source.id}
                          className={`rounded-lg border transition-all ${
                            status == null ? 'bg-slate-50/50 border-slate-200' : ROW_TINT[status]
                          }`}
                        >
                          <button
                            onClick={() => setExpanded(expanded === source.id ? null : source.id)}
                            className="w-full flex items-center justify-between px-3 py-2 text-left"
                          >
                            <div className="flex items-center gap-2">
                              <span
                                className={`w-2.5 h-2.5 rounded-full ${
                                  cfg ? cfg.bgColor : 'bg-slate-200 border border-slate-300'
                                }`}
                              />
                              <span className="font-medium text-slate-700 text-xs">{source.name}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className={`text-[10px] font-medium ${cfg ? cfg.color : 'text-slate-400'}`}>
                                {cfg ? cfg.label : failed ? 'Unknown' : 'Checking'}
                              </span>
                              {info != null && info.latency_ms > 0 && (
                                <span className="text-[9px] text-slate-400">{info.latency_ms}ms</span>
                              )}
                              <svg
                                className={`w-3 h-3 text-slate-400 transition-transform ${expanded === source.id ? 'rotate-180' : ''}`}
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                              </svg>
                            </div>
                          </button>

                          {expanded === source.id && (
                            <div className="px-3 pb-3 pt-1 border-t border-slate-100/50">
                              <p className="text-[10px] text-slate-500 mb-2">{source.description}</p>
                              {info && (
                                <p className="text-[10px] text-slate-500 mb-2">
                                  Probe: <span className="font-mono">{info.api}</span> @ {info.region}
                                  {info.from_cache && ` · cached ${info.cache_age_s}s`}
                                </p>
                              )}
                              {info?.detail && <p className="text-[10px] text-slate-600 mb-2">{info.detail}</p>}
                              {info?.error && (
                                <p className="text-[10px] text-rose-600 mb-2">
                                  {info.error_code ? `${info.error_code}: ` : 'Error: '}{info.error}
                                </p>
                              )}
                              {status === 'not_probed' && (
                                <p className="text-[10px] text-slate-500 mb-2">
                                  No reachability check is registered for this source, so it is excluded from the
                                  verified count rather than assumed working.
                                </p>
                              )}

                              {/* Setup steps only when the probe says something is
                                  actually wrong — not while status is still unknown. */}
                              {cfg != null && !isConnected && help && (
                                <div className="mb-2">
                                  <div className="text-[10px] font-semibold text-slate-700 mb-1">Setup Steps</div>
                                  <ol className="space-y-1">
                                    {help.setupSteps.map((step, i) => (
                                      <li key={i} className="flex items-start gap-1.5 text-[10px] text-slate-600">
                                        <span className="w-3.5 h-3.5 rounded-full bg-blue-500 text-white text-[8px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                                          {i + 1}
                                        </span>
                                        {step}
                                      </li>
                                    ))}
                                  </ol>
                                </div>
                              )}

                              {help?.docsUrl && (
                                <a
                                  href={help.docsUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-[10px] text-blue-600 hover:text-blue-800"
                                >
                                  AWS Docs
                                  <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                  </svg>
                                </a>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="px-4 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="text-[10px] text-slate-500">
                Each row is one real AWS call, cached for 5 minutes.
              </div>
              {lastRefresh && (
                <span className="text-[9px] text-slate-400">
                  Last checked: {new Date(lastRefresh).toLocaleTimeString()}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => void handleRefresh()}
                disabled={loading || refreshing}
                className="px-2 py-1 text-[10px] text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded transition-colors disabled:opacity-50"
                title="Clears the probe cache and re-runs every check, including the four billed Cost Explorer calls ($0.04)."
              >
                {refreshing ? 'Refreshing…' : 'Force refresh ($0.04)'}
              </button>
              <Link
                to="/govern/command-center"
                className="px-3 py-1.5 bg-indigo-600 text-white text-xs font-medium rounded-lg hover:bg-indigo-700 transition-colors"
              >
                Command Center
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
