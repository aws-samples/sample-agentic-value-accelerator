/**
 * DataSourceIndicator — measured reachability for every AWS data source the
 * Govern module names, grouped by service.
 *
 * WHY THE CATALOG NO LONGER CARRIES A STATUS
 * ------------------------------------------
 * This component used to define 50 sources with a hardcoded `status`, 47 of them
 * `'live'`, and render "47/50 connected" in emerald on the Govern landing page.
 * That was a connectivity claim about the reader's own AWS account made before
 * any AWS call — and it was wrong in both directions on a real account: Security
 * Lake is AccessDenied, four of the five AVA tables are not provisioned in the
 * configured region, and Detective was never enabled, while several sources
 * marked `'partial'`/`'pending'` are in fact reachable.
 *
 * So the catalog below now holds only facts that ARE static — the id, display
 * name, backing API, and description. Every status comes from
 * `GET /api/v1/govern/data-sources/status`, which runs one real AWS call per
 * source. A source in this catalog with no entry in that response renders as
 * "Not probed", never as connected: the UI has no code path that can turn a
 * missing measurement into a green dot.
 *
 * COUNTING RULES (must stay in sync with the backend's `summarize`)
 * ----------------------------------------------------------------
 * - Numerator   = connected + connected_empty. A successful call returning zero
 *   rows means the integration works and the estate is clean; showing that as
 *   disconnected would be the same class of lie in the other direction.
 * - Denominator = probed = total - not_probed. Unprobeable sources are excluded
 *   from BOTH sides and surfaced separately, so they are neither claimed as
 *   working nor counted as failures.
 * - Emerald only when `all_connected`. Any weaker rule (the old sibling
 *   ConnectionWizard used `connected >= total - 1`) lets an unverified source
 *   read as verified.
 * - While loading: "—/— checking". On fetch failure: "status unavailable". Never
 *   a number in either case, and never the last successful count.
 */

import { useCallback, useEffect, useState } from 'react';
import { Icon } from './icons';
import { governDataSourcesApi, type DataSourceInfo, type DataSourceProbeStatus } from '../../api/client';

/** Badge vocabulary, used by the Mock/Live/Pending badges below. Distinct from
 *  the probe vocabulary on purpose: these describe a rendered panel's data
 *  provenance, not a service's reachability. */
type DataSourceStatus = 'live' | 'partial' | 'pending' | 'mock';

/** A source the UI names. Notice there is no `status` — see the header comment. */
interface DataSource {
  id: string;
  name: string;
  api: string;
  description: string;
}

interface ServiceGroup {
  id: string;
  name: string;
  icon: string;
  color: string;
  sources: DataSource[];
}

const AWS_SERVICE_GROUPS: ServiceGroup[] = [
  {
    id: 'bedrock',
    name: 'Amazon Bedrock',
    icon: 'brain',
    color: 'violet',
    sources: [
      { id: 'bedrock-models', name: 'Foundation Models', api: 'ListFoundationModels', description: 'Model catalog with providers and capabilities' },
      { id: 'bedrock-runtime', name: 'Runtime Metrics', api: 'CloudWatch AWS/Bedrock', description: 'Invocations, latency, tokens, errors' },
      { id: 'bedrock-guardrails', name: 'Guardrails', api: 'ListGuardrails + CloudWatch', description: 'Guardrail configs and intervention metrics' },
      { id: 'bedrock-evals', name: 'Model Evaluations', api: 'ListEvaluationJobs', description: 'Eval jobs with scores from S3 results' },
      { id: 'bedrock-kbs', name: 'Knowledge Bases', api: 'ListKnowledgeBases', description: 'RAG data sources and sync status' },
      { id: 'bedrock-agents', name: 'Bedrock Agents', api: 'ListAgents', description: 'Classic Bedrock agent inventory' },
      { id: 'bedrock-flows', name: 'Flows', api: 'ListFlows', description: 'Multi-step workflow definitions' },
      { id: 'bedrock-prompts', name: 'Managed Prompts', api: 'ListPrompts', description: 'Prompt library and versions' },
      { id: 'bedrock-invocation-logs', name: 'Invocation Logging', api: 'GetModelInvocationLoggingConfiguration', description: 'Real per-model token totals + grounding/stop-reason aggregates' },
    ],
  },
  {
    id: 'agentcore',
    name: 'Bedrock AgentCore',
    icon: 'cpu',
    color: 'indigo',
    sources: [
      { id: 'agentcore-runtimes', name: 'Agent Runtimes', api: 'ListAgentRuntimes', description: 'AgentCore runtime instances' },
      { id: 'agentcore-memory', name: 'Memory Stores', api: 'ListMemories', description: 'Agent memory configurations' },
      { id: 'agentcore-gateways', name: 'Gateways', api: 'ListGateways', description: 'API gateways and tool targets' },
      { id: 'agentcore-policies', name: 'Policy Engines', api: 'ListPolicyEngines', description: 'Cedar policy definitions' },
      { id: 'agentcore-identities', name: 'Workload Identities', api: 'ListWorkloadIdentities', description: 'Agent identity configurations' },
      { id: 'agentcore-registry', name: 'Agent Registry', api: 'ListRegistries', description: 'Registered agents, MCP servers, skills' },
      { id: 'agentcore-metrics', name: 'Runtime Metrics', api: 'CloudWatch AWS/Bedrock-AgentCore', description: 'Per-agent invocations, latency' },
      { id: 'verified-permissions', name: 'Verified Permissions', api: 'ListPolicyStores + ListPolicies', description: 'Cedar authZ policy stores — permit/forbid policy counts, schema presence + identity sources' },
    ],
  },
  {
    id: 'sagemaker',
    name: 'Amazon SageMaker',
    icon: 'beaker',
    color: 'orange',
    sources: [
      { id: 'sagemaker-registry', name: 'Model Registry', api: 'ListModelPackages', description: 'Model versions and deployment status' },
      { id: 'sagemaker-cards', name: 'Model Cards', api: 'ListModelCards', description: 'Model documentation and risk ratings' },
      { id: 'sagemaker-endpoints', name: 'Endpoints', api: 'ListEndpoints', description: 'Deployed model endpoints' },
      { id: 'sagemaker-monitor', name: 'Model Monitor', api: 'ListMonitoringSchedules', description: 'Drift and quality monitoring' },
    ],
  },
  {
    id: 'security',
    name: 'Security Services',
    icon: 'shield',
    color: 'rose',
    sources: [
      { id: 'securityhub', name: 'Security Hub', api: 'GetFindings', description: 'Aggregated security findings' },
      { id: 'guardduty', name: 'GuardDuty', api: 'ListDetectors', description: 'Threat detection findings' },
      { id: 'inspector', name: 'Inspector', api: 'BatchGetAccountStatus', description: 'Vulnerability findings' },
      { id: 'macie', name: 'Macie', api: 'GetMacieSession', description: 'Sensitive data findings' },
      { id: 'access-analyzer', name: 'IAM Access Analyzer', api: 'ListAnalyzers', description: 'IAM access findings' },
      { id: 'detective', name: 'Detective', api: 'ListGraphs', description: 'Security investigations' },
    ],
  },
  {
    id: 'observability',
    name: 'Observability',
    icon: 'chart',
    color: 'sky',
    sources: [
      { id: 'cloudwatch-metrics', name: 'CloudWatch Metrics', api: 'ListMetrics + GetMetricData', description: 'AI service metrics and alarms' },
      { id: 'cloudwatch-logs', name: 'CloudWatch Logs', api: 'DescribeLogGroups + Logs Insights', description: 'Invocation logs (aggregates only)' },
      { id: 'cloudtrail', name: 'CloudTrail', api: 'LookupEvents', description: 'AI API activity audit trail' },
      { id: 'xray', name: 'X-Ray', api: 'GetTraceSummaries', description: 'Distributed tracing' },
      { id: 'cloudtrail-lake', name: 'CloudTrail Lake', api: 'ListEventDataStores + StartQuery', description: 'Long-window AI-service Management-event aggregates (real denominators) from a dedicated CloudTrail Lake store' },
      { id: 'aws-health', name: 'AWS Health', api: 'DescribeEventAggregates', description: 'Service/account health events (issues, notifications, scheduled changes) for availability + incident correlation' },
      { id: 'service-quotas-ai', name: 'AI Capacity Quotas', api: 'ServiceQuotas ListServiceQuotas', description: 'Throttle limits (TPM/RPM/RPS/concurrency) + provisioned throughput for Bedrock, SageMaker, and AgentCore — headroom for capacity planning' },
    ],
  },
  {
    id: 'compliance',
    name: 'Compliance & Config',
    icon: 'clipboard',
    color: 'emerald',
    sources: [
      { id: 'config', name: 'AWS Config', api: 'DescribeConfigurationRecorders', description: 'Resource compliance status' },
      { id: 'config-rules', name: 'Config Rule Details', api: 'DescribeConfigRules', description: 'Failing resources per rule' },
      { id: 'resource-tags', name: 'Resource Groups Tagging', api: 'GetResources', description: 'Governance-tag coverage + governed denominator across the AI estate' },
      { id: 'security-lake', name: 'Security Lake', api: 'ListDataLakes', description: 'Centralized security logs' },
      { id: 'trusted-advisor', name: 'Trusted Advisor', api: 'DescribeTrustedAdvisorChecks', description: 'Cost / security / fault-tolerance / performance / service-limit checks (Business/Enterprise Support)' },
    ],
  },
  {
    id: 'cost',
    name: 'Cost Management',
    icon: 'currency',
    color: 'amber',
    sources: [
      { id: 'cost-explorer', name: 'Cost Explorer', api: 'GetCostAndUsage', description: 'AI service spend by model/region' },
      { id: 'cost-resources', name: 'Resource-Level Cost', api: 'GetCostAndUsageWithResources', description: 'Per-agent / per-resource AI spend attribution' },
      { id: 'cost-forecast', name: 'Cost Forecast', api: 'GetCostForecast', description: 'Projected AI spend' },
      { id: 'cost-anomalies', name: 'Cost Anomalies', api: 'GetAnomalies', description: 'Unusual spend patterns' },
      { id: 'budgets', name: 'Budgets', api: 'DescribeBudgets', description: 'AI budget tracking' },
      { id: 'compute-optimizer', name: 'Compute Optimizer', api: 'GetEnrollmentStatus', description: 'Right-sizing recommendations + estimated savings (over/under-provisioned, idle)' },
    ],
  },
  {
    id: 'ava',
    name: 'AVA Platform',
    icon: 'cube',
    color: 'slate',
    sources: [
      { id: 'ava-deployments', name: 'Deployments', api: 'DynamoDB (deployments)', description: 'Build module deployments' },
      { id: 'ava-usecases', name: 'Use Cases', api: 'DynamoDB (prioritization)', description: 'Plan module prioritization' },
      { id: 'ava-businesscases', name: 'Business Cases', api: 'DynamoDB (business-cases)', description: 'Plan module business cases' },
      { id: 'ava-approvals', name: 'Service Approvals', api: 'DynamoDB (service-approval)', description: 'Secure module approvals' },
      { id: 'ava-guardrails', name: 'Guardrail Configs', api: 'DynamoDB (guardrails)', description: 'Secure module guardrails' },
    ],
  },
];

const STATUS_CONFIG: Record<DataSourceStatus, { label: string; color: string; bgColor: string; borderColor: string }> = {
  live: { label: 'Live', color: 'text-emerald-600', bgColor: 'bg-emerald-500', borderColor: 'border-emerald-200' },
  partial: { label: 'Partial', color: 'text-sky-600', bgColor: 'bg-sky-400', borderColor: 'border-sky-200' },
  pending: { label: 'Pending', color: 'text-purple-600', bgColor: 'bg-purple-400', borderColor: 'border-purple-200' },
  mock: { label: 'Demo', color: 'text-amber-600', bgColor: 'bg-amber-400', borderColor: 'border-amber-200' },
};

/** Presentation for each measured probe status.
 *
 *  `counts` marks the two statuses that make up the connected numerator.
 *  `connected_empty` gets its own teal so a clean estate is visually distinct
 *  from one with records, without implying anything is broken. Everything that
 *  is not measured-and-reachable is deliberately non-green.
 */
const PROBE_STATUS_CONFIG: Record<
  DataSourceProbeStatus,
  { label: string; color: string; bgColor: string; counts: boolean; pulse: boolean }
> = {
  connected: { label: 'Connected', color: 'text-emerald-600', bgColor: 'bg-emerald-500', counts: true, pulse: true },
  connected_empty: { label: 'Connected · empty', color: 'text-teal-600', bgColor: 'bg-teal-400', counts: true, pulse: false },
  degraded: { label: 'Degraded', color: 'text-amber-600', bgColor: 'bg-amber-400', counts: false, pulse: false },
  access_denied: { label: 'Access denied', color: 'text-rose-600', bgColor: 'bg-rose-500', counts: false, pulse: false },
  not_enabled: { label: 'Not enabled', color: 'text-slate-500', bgColor: 'bg-slate-400', counts: false, pulse: false },
  error: { label: 'Error', color: 'text-rose-600', bgColor: 'bg-rose-500', counts: false, pulse: false },
  not_probed: { label: 'Not probed', color: 'text-slate-400', bgColor: 'bg-slate-300', counts: false, pulse: false },
};

/** Order the status chips by how much attention each deserves. */
const PROBE_STATUS_ORDER: DataSourceProbeStatus[] = [
  'connected', 'connected_empty', 'degraded', 'access_denied', 'error', 'not_enabled', 'not_probed',
];

const REMEDIATION_HINTS: Record<string, string> = {
  'grant-iam': 'Grant the control-plane role permission for this API.',
  'enable-service': 'Enable or subscribe to this service in the target region.',
  'provision-resource': 'The named resource does not exist in the configured region.',
  'provision-table': 'The DynamoDB table is not provisioned in the configured region.',
  retry: 'Throttled or timed out — transient, retry.',
  investigate: 'Unexpected failure. See the error detail.',
  'upgrade-botocore': 'The installed AWS SDK has no model for this API yet.',
  'configure-credentials': 'No AWS credentials are available to the control plane.',
};

const COLOR_MAP: Record<string, { bg: string; text: string; border: string }> = {
  violet: { bg: 'bg-violet-100', text: 'text-violet-700', border: 'border-violet-200' },
  indigo: { bg: 'bg-indigo-100', text: 'text-indigo-700', border: 'border-indigo-200' },
  orange: { bg: 'bg-orange-100', text: 'text-orange-700', border: 'border-orange-200' },
  rose: { bg: 'bg-rose-100', text: 'text-rose-700', border: 'border-rose-200' },
  sky: { bg: 'bg-sky-100', text: 'text-sky-700', border: 'border-sky-200' },
  emerald: { bg: 'bg-emerald-100', text: 'text-emerald-700', border: 'border-emerald-200' },
  amber: { bg: 'bg-amber-100', text: 'text-amber-700', border: 'border-amber-200' },
  slate: { bg: 'bg-slate-100', text: 'text-slate-700', border: 'border-slate-200' },
};

function StatusDot({ status }: { status: DataSourceStatus }) {
  const config = STATUS_CONFIG[status];
  return (
    <span
      className={`w-1.5 h-1.5 rounded-full ${config.bgColor} ${status === 'live' ? 'animate-pulse' : ''} ${status === 'mock' ? 'border border-dashed border-amber-500' : ''}`}
    />
  );
}

function ProbeDot({ status }: { status: DataSourceProbeStatus }) {
  const config = PROBE_STATUS_CONFIG[status];
  return (
    <span
      className={`w-1.5 h-1.5 rounded-full shrink-0 ${config.bgColor} ${config.pulse ? 'animate-pulse' : ''} ${
        status === 'not_probed' ? 'border border-dashed border-slate-400' : ''
      }`}
    />
  );
}

/** Loading placeholder dot — visually distinct from every real status so an
 *  in-flight probe can never be mistaken for a measured one. */
function PendingProbeDot() {
  return <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-slate-200 border border-slate-300 animate-pulse" />;
}

function relativeAge(seconds: number): string {
  if (seconds < 60) return `${Math.max(0, Math.round(seconds))}s ago`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
  return `${Math.round(seconds / 3600)}h ago`;
}

/** Tooltip text for one source. Always states what was actually called, in which
 *  region, and when — a green dot with no provenance is what got us here. */
function sourceTooltip(source: DataSource, info: DataSourceInfo | undefined): string {
  const lines = [source.name, source.api, source.description];
  if (!info) {
    lines.push('', 'Not probed: no reachability check is registered for this source.');
    return lines.join('\n');
  }
  const cfg = PROBE_STATUS_CONFIG[info.status];
  lines.push('', `Status: ${cfg.label}`, `Probe: ${info.api} @ ${info.region}`);
  if (info.detail) lines.push(`Observed: ${info.detail}`);
  if (info.error) lines.push(`Error${info.error_code ? ` (${info.error_code})` : ''}: ${info.error}`);
  const hint = REMEDIATION_HINTS[info.remediation];
  if (hint) lines.push(`Next: ${hint}`);
  lines.push(
    `Measured: ${info.from_cache ? `cached, checked ${relativeAge(info.cache_age_s)}` : 'just now'} in ${info.latency_ms}ms`,
  );
  if (info.billed_usd > 0) lines.push(`Billed: $${info.billed_usd.toFixed(2)} for this call`);
  return lines.join('\n');
}

const ALL_SOURCE_IDS = AWS_SERVICE_GROUPS.flatMap(g => g.sources.map(s => s.id));

export function DataSourceIndicator({ compact = false }: { compact?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [sources, setSources] = useState<Record<string, DataSourceInfo> | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await governDataSourcesApi.status();
      setSources(data.sources ?? {});
      setFailed(false);
    } catch {
      // Drop any previous result. Keeping the last successful counts on screen
      // would present a stale measurement as a current one.
      setSources(null);
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** Status for one catalog id. A catalog entry the backend does not probe is
   *  `not_probed` — the only default, and it is never counted as connected. */
  const statusOf = (id: string): DataSourceProbeStatus | null => {
    if (sources == null) return null;
    return sources[id]?.status ?? 'not_probed';
  };

  const countIn = (ids: string[]) => {
    if (sources == null) return null;
    let connected = 0;
    let notProbed = 0;
    for (const id of ids) {
      const status = sources[id]?.status ?? 'not_probed';
      if (status === 'not_probed') notProbed += 1;
      else if (PROBE_STATUS_CONFIG[status].counts) connected += 1;
    }
    return { connected, notProbed, probed: ids.length - notProbed, total: ids.length };
  };

  const overall = countIn(ALL_SOURCE_IDS);
  const allConnected = overall != null && overall.probed > 0 && overall.connected === overall.probed && overall.notProbed === 0;

  const statusCounts = PROBE_STATUS_ORDER.map(status => ({
    status,
    count: sources == null ? 0 : ALL_SOURCE_IDS.filter(id => (sources[id]?.status ?? 'not_probed') === status).length,
  })).filter(entry => entry.count > 0);

  /** The headline. Never a number unless a probe actually produced one. */
  const headline = () => {
    if (failed) return <span className="text-slate-500">status unavailable</span>;
    if (overall == null) return <span className="text-slate-400">—/— checking</span>;
    return (
      <>
        <span className={allConnected ? 'text-emerald-600 font-medium' : 'text-slate-600 font-medium'}>
          {overall.connected}/{overall.probed} verified
        </span>
        {overall.notProbed > 0 && <span className="text-slate-400"> · {overall.notProbed} not probed</span>}
      </>
    );
  };

  if (compact) {
    if (failed) return <span className="text-[10px] text-slate-500">Data source status unavailable</span>;
    if (overall == null) return <span className="text-[10px] text-slate-400">Checking data sources…</span>;
    return (
      <div className="flex items-center gap-2 text-[10px]">
        {statusCounts.map(({ status, count }) => (
          <span key={status} className={`flex items-center gap-1 ${PROBE_STATUS_CONFIG[status].color}`}>
            <ProbeDot status={status} />
            {count} {PROBE_STATUS_CONFIG[status].label.toLowerCase()}
          </span>
        ))}
      </div>
    );
  }

  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden mb-4">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
            <Icon name="database" className="w-4 h-4 text-white" />
          </div>
          <div className="text-left">
            <div className="text-sm font-semibold text-slate-800">AWS Data Sources</div>
            <div className="text-[10px] text-slate-500 flex items-center gap-2">
              {headline()}
              <span className="text-slate-300">|</span>
              <span>{AWS_SERVICE_GROUPS.length} service groups</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            {statusCounts.map(({ status, count }) => (
              <span key={status} className={`text-[10px] ${PROBE_STATUS_CONFIG[status].color} flex items-center gap-1`}>
                <ProbeDot status={status} />
                {count}
              </span>
            ))}
          </div>
          <svg
            className={`w-4 h-4 text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-slate-200/60">
          {/* Provenance bar — what was measured, where, and how fresh. */}
          <div className="px-4 py-2 bg-white border-b border-slate-100 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-slate-500">
            {failed ? (
              <span className="text-slate-600">
                Could not reach the data-source status endpoint, so no source is shown as connected.
              </span>
            ) : (
              <>
                <span>
                  Each row below is one real AWS call. {overall == null ? 'Checking…' : `${overall.probed} of ${overall.total} sources have a probe.`}
                </span>
                {sources != null && (
                  <span className="text-slate-400">
                    Regions: {Array.from(new Set(Object.values(sources).map(s => s.region))).sort().join(', ')}
                  </span>
                )}
              </>
            )}
            <button
              onClick={() => void load()}
              disabled={loading}
              className="ml-auto px-2 py-0.5 rounded border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors"
            >
              {loading ? 'Checking…' : 'Re-check'}
            </button>
          </div>

          {/* Service Group Pills */}
          <div className="px-4 py-3 bg-slate-50/50 border-b border-slate-100 flex flex-wrap gap-2">
            <button
              onClick={() => setSelectedGroup(null)}
              className={`px-2.5 py-1 rounded-full text-[10px] font-medium transition-colors ${
                selectedGroup === null
                  ? 'bg-slate-700 text-white'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              All Services
            </button>
            {AWS_SERVICE_GROUPS.map(group => {
              const colors = COLOR_MAP[group.color];
              const counts = countIn(group.sources.map(s => s.id));
              const groupAllConnected = counts != null && counts.notProbed === 0 && counts.connected === counts.probed;
              return (
                <button
                  key={group.id}
                  onClick={() => setSelectedGroup(group.id === selectedGroup ? null : group.id)}
                  className={`px-2.5 py-1 rounded-full text-[10px] font-medium transition-colors flex items-center gap-1.5 ${
                    selectedGroup === group.id
                      ? `${colors.bg} ${colors.text} border ${colors.border}`
                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {group.name}
                  <span className={`text-[9px] ${groupAllConnected ? 'text-emerald-600' : 'text-slate-400'}`}>
                    {counts == null ? '—/—' : `${counts.connected}/${counts.probed}`}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Service Groups Grid */}
          <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {AWS_SERVICE_GROUPS.filter(g => selectedGroup === null || g.id === selectedGroup).map(group => {
              const colors = COLOR_MAP[group.color];
              const counts = countIn(group.sources.map(s => s.id));
              const groupAllConnected = counts != null && counts.notProbed === 0 && counts.connected === counts.probed;
              return (
                <div
                  key={group.id}
                  className={`rounded-lg border ${colors.border} ${colors.bg}/30 overflow-hidden`}
                >
                  <div className={`px-3 py-2 ${colors.bg} border-b ${colors.border} flex items-center justify-between`}>
                    <div className="flex items-center gap-2">
                      <Icon name={group.icon as any} className={`w-4 h-4 ${colors.text}`} />
                      <span className={`text-xs font-semibold ${colors.text}`}>{group.name}</span>
                    </div>
                    <span className={`text-[10px] ${groupAllConnected ? 'text-emerald-600' : colors.text}`}>
                      {counts == null ? '—/—' : `${counts.connected}/${counts.probed}`}
                    </span>
                  </div>
                  <div className="p-2 space-y-1">
                    {group.sources.map(source => {
                      const info = sources?.[source.id];
                      const status = statusOf(source.id);
                      return (
                        <div
                          key={source.id}
                          className="flex items-start gap-2 p-1.5 rounded hover:bg-white/50 transition-colors group"
                          title={sourceTooltip(source, info)}
                        >
                          {status == null ? <PendingProbeDot /> : <ProbeDot status={status} />}
                          <div className="flex-1 min-w-0">
                            <div className="text-[10px] font-medium text-slate-700 truncate">{source.name}</div>
                            <div className="text-[9px] text-slate-400 truncate">{info?.detail ?? source.api}</div>
                          </div>
                          <span
                            className={`text-[8px] px-1.5 py-0.5 rounded bg-white/80 whitespace-nowrap ${
                              status == null ? 'text-slate-400' : PROBE_STATUS_CONFIG[status].color
                            }`}
                          >
                            {status == null ? (failed ? 'Unknown' : 'Checking') : PROBE_STATUS_CONFIG[status].label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Legend */}
          <div className="px-4 py-3 bg-slate-50/50 border-t border-slate-100 flex flex-wrap items-center gap-4">
            <span className="text-[10px] text-slate-500">Status:</span>
            {PROBE_STATUS_ORDER.map(status => (
              <span key={status} className={`text-[10px] ${PROBE_STATUS_CONFIG[status].color} flex items-center gap-1`}>
                <ProbeDot status={status} />
                {PROBE_STATUS_CONFIG[status].label}
              </span>
            ))}
            <span className="text-[10px] text-slate-400 ml-auto">
              Connected · empty = the call succeeded and returned no records
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

/** Small badge to mark mock data sections */
export function MockDataBadge({ integration }: { integration?: string }) {
  return (
    <span
      className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 border border-dashed border-amber-300 cursor-help"
      title={integration ? `Integration needed: ${integration}` : 'Demo data for illustration'}
    >
      <StatusDot status="mock" />
      Demo
    </span>
  );
}

/** Small badge to mark live data sections */
export function LiveDataBadge({ source, detail, live }: { source?: string; detail?: string; live?: boolean } = {}) {
  // Honesty gate: when a caller passes an explicit live={false}, do NOT claim "Live" —
  // fall back to the Demo/derived badge so a green Live pill never sits over non-live data.
  // Callers that omit `live` keep the prior always-Live behavior (backward compatible).
  if (live === false) {
    return <MockDataBadge integration={source} />;
  }
  return (
    <span
      className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600 border border-emerald-200 cursor-help"
      title={detail || (source ? `Live data from ${source}` : 'Live AWS data')}
    >
      <StatusDot status="live" />
      Live{source ? ` (${source})` : ''}
    </span>
  );
}

/** Small badge to mark pending integration sections */
export function PendingDataBadge({ api }: { api?: string }) {
  return (
    <span
      className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded bg-purple-50 text-purple-600 border border-purple-200 cursor-help"
      title={api ? `Pending: ${api}` : 'Integration in progress'}
    >
      <StatusDot status="pending" />
      Pending
    </span>
  );
}

/** Export the service catalog for use in other components. Note it carries no
 *  status: reachability must be read from the data-sources status endpoint. */
export { AWS_SERVICE_GROUPS, STATUS_CONFIG, PROBE_STATUS_CONFIG };
export type { DataSource, ServiceGroup, DataSourceStatus };

export default DataSourceIndicator;
