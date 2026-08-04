/**
 * ConnectionWizard — Compact connection status bar with expandable details.
 *
 * Uses the unified /api/v1/govern/data-sources/status endpoint for fast,
 * consistent status across all data sources. Shows sync status and timestamps.
 */

import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { governDataSourcesApi, type DataSourceInfo } from '../../api/client';

interface SourceMeta {
  id: string;
  name: string;
  description: string;
  setupSteps: string[];
  docsUrl?: string;
}

const SOURCE_META: Record<string, SourceMeta> = {
  guardrails: {
    id: 'guardrails',
    name: 'Bedrock Guardrails',
    description: 'Content filters, PII detection, and topic denial policies',
    setupSteps: [
      'Create guardrails in the Bedrock console or via AVA',
      'Guardrails are auto-synced every 5 minutes',
    ],
    docsUrl: 'https://docs.aws.amazon.com/bedrock/latest/userguide/guardrails.html',
  },
  bedrock_models: {
    id: 'bedrock_models',
    name: 'Bedrock Model Catalog',
    description: 'Foundation models available in your account',
    setupSteps: [
      'Enable Bedrock in your AWS account',
      'Request access to foundation models via the Bedrock console',
    ],
    docsUrl: 'https://docs.aws.amazon.com/bedrock/latest/userguide/model-access.html',
  },
  bedrock_agents: {
    id: 'bedrock_agents',
    name: 'Bedrock Agents',
    description: 'Deployed agents and knowledge bases',
    setupSteps: [
      'Deploy Bedrock Agents in the console',
      'Ensure bedrock-agent:ListAgents permission',
    ],
    docsUrl: 'https://docs.aws.amazon.com/bedrock/latest/userguide/agents.html',
  },
  agentcore_posture: {
    id: 'agentcore_posture',
    name: 'AgentCore Posture',
    description: 'Gateways, memories, workload identities, policy engines',
    setupSteps: [
      'Deploy AgentCore runtimes',
      'Ensure bedrock-agentcore-control permissions',
    ],
    docsUrl: 'https://docs.aws.amazon.com/bedrock/latest/userguide/agents-agentcore.html',
  },
  cloudwatch_metrics: {
    id: 'cloudwatch_metrics',
    name: 'CloudWatch Metrics',
    description: 'Model invocations, latency, and errors',
    setupSteps: [
      'Invoke Bedrock models to generate CloudWatch metrics',
      'Ensure cloudwatch:GetMetricData permission',
    ],
    docsUrl: 'https://docs.aws.amazon.com/bedrock/latest/userguide/monitoring-cloudwatch.html',
  },
  cost_explorer: {
    id: 'cost_explorer',
    name: 'Cost Explorer',
    description: 'AI workload spend and forecasts',
    setupSteps: [
      'Enable Cost Explorer in AWS Billing console',
      'Ensure ce:GetCostAndUsage permission',
    ],
    docsUrl: 'https://docs.aws.amazon.com/cost-management/latest/userguide/ce-enable.html',
  },
  aws_config: {
    id: 'aws_config',
    name: 'AWS Config',
    description: 'Compliance rules and resource configuration',
    setupSteps: [
      'Enable AWS Config in your account',
      'Deploy Config rules (managed or custom)',
    ],
    docsUrl: 'https://docs.aws.amazon.com/config/latest/developerguide/gs-console.html',
  },
  security_services: {
    id: 'security_services',
    name: 'Security Services',
    description: 'GuardDuty, Macie, Inspector, Access Analyzer',
    setupSteps: [
      'Enable GuardDuty, Macie, Inspector, and IAM Access Analyzer',
      'Each service requires individual enablement',
    ],
    docsUrl: 'https://docs.aws.amazon.com/guardduty/latest/ug/guardduty_settingup.html',
  },
  security_hub_ai: {
    id: 'security_hub_ai',
    name: 'Security Hub AI Inventory',
    description: 'AI workload discovery and security posture from Security Hub',
    setupSteps: [
      'Enable Security Hub in your AWS account',
      'Enable AI security standards in Security Hub',
      'Configure cross-account aggregation for multi-account visibility',
    ],
    docsUrl: 'https://docs.aws.amazon.com/securityhub/latest/userguide/what-is-securityhub.html',
  },
  cloudtrail: {
    id: 'cloudtrail',
    name: 'CloudTrail',
    description: 'API activity audit trail',
    setupSteps: [
      'CloudTrail is usually enabled by default',
      'Ensure cloudtrail:LookupEvents permission',
    ],
    docsUrl: 'https://docs.aws.amazon.com/awscloudtrail/latest/userguide/cloudtrail-getting-started.html',
  },
  bedrock_evals: {
    id: 'bedrock_evals',
    name: 'Bedrock Evaluations',
    description: 'Model evaluation jobs and results',
    setupSteps: [
      'Run evaluation jobs in Bedrock console',
      'Ensure bedrock:ListEvaluationJobs permission',
    ],
    docsUrl: 'https://docs.aws.amazon.com/bedrock/latest/userguide/model-evaluation.html',
  },
  invocation_logs: {
    id: 'invocation_logs',
    name: 'Invocation Logs',
    description: 'Guardrail interventions and stop reasons',
    setupSteps: [
      'Enable model invocation logging in Bedrock',
      'Configure CloudWatch Logs destination',
    ],
    docsUrl: 'https://docs.aws.amazon.com/bedrock/latest/userguide/model-invocation-logging.html',
  },
};

const SOURCE_ORDER = [
  'guardrails', 'bedrock_models', 'bedrock_agents', 'agentcore_posture',
  'cloudwatch_metrics', 'cost_explorer', 'aws_config', 'security_services',
  'security_hub_ai', 'cloudtrail', 'bedrock_evals', 'invocation_logs',
];

function formatMetric(info: DataSourceInfo): string | null {
  if (!info.metrics) return null;
  const m = info.metrics;
  if (m.total_models) return `${m.total_models} models`;
  if (m.active_models) return `${m.active_models} active models`;
  if (m.total_agents) return `${m.total_agents} agents`;
  if (m.total) return `${m.total} items`;
  if (m.total_findings) return `${m.total_findings} findings`;
  if (m.total_calls) return `${m.total_calls.toLocaleString()} calls`;
  if (m.total_callers) return `${m.total_callers} callers`;
  return null;
}

export default function ConnectionWizard({ onDismiss }: { onDismiss?: () => void }) {
  const [sources, setSources] = useState<Record<string, DataSourceInfo>>({});
  const [summary, setSummary] = useState({ connected: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<number | null>(null);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    try {
      const data = await governDataSourcesApi.status();
      setSources(data.sources);
      setSummary({ connected: data.summary.connected, total: data.summary.total });
      setLastRefresh(Date.now());
    } catch (e) {
      console.error('Failed to fetch data sources status:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 60000); // Refresh every minute
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const handleRefresh = async () => {
    try {
      await governDataSourcesApi.refresh();
      await fetchStatus();
    } catch (e) {
      console.error('Refresh failed:', e);
    }
  };

  const statusIcon = (info?: DataSourceInfo) => {
    if (!info) return <span className="w-2.5 h-2.5 rounded-full bg-slate-300" />;
    if (info.live) return <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />;
    if (info.status === 'partial') return <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />;
    return <span className="w-2.5 h-2.5 rounded-full bg-slate-300" />;
  };

  // Build highlight metrics for the compact bar
  const highlights = SOURCE_ORDER
    .map(id => sources[id])
    .filter(s => s?.live)
    .map(s => formatMetric(s!))
    .filter(Boolean)
    .slice(0, 3);

  const notConnected = summary.total - summary.connected;

  return (
    <div className="rounded-xl border border-slate-200/60 overflow-hidden bg-white shadow-sm">
      {/* Compact header bar - always visible */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
            summary.connected >= summary.total - 1
              ? 'bg-gradient-to-br from-emerald-500 to-green-600'
              : summary.connected > 0
              ? 'bg-gradient-to-br from-blue-500 to-indigo-600'
              : 'bg-gradient-to-br from-slate-400 to-slate-500'
          }`}>
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>

          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-800 text-sm">Data Sources</span>
              {loading ? (
                <span className="text-xs text-blue-600">Checking...</span>
              ) : (
                <span className="text-xs text-emerald-600 font-medium">
                  {summary.connected}/{summary.total} connected
                </span>
              )}
              {summary.connected === summary.total && !loading && (
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
          {notConnected > 0 && !isOpen && (
            <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
              {notConnected} need setup
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

      {/* Expanded details */}
      {isOpen && (
        <>
          <div className="px-4 pb-4 pt-2 border-t border-slate-100 space-y-2">
            {SOURCE_ORDER.map(id => {
              const info = sources[id];
              const meta = SOURCE_META[id];
              if (!meta) return null;

              const metric = info ? formatMetric(info) : null;

              return (
                <div
                  key={id}
                  className={`rounded-lg border transition-all ${
                    info?.live
                      ? 'bg-emerald-50/50 border-emerald-200'
                      : info?.status === 'partial'
                      ? 'bg-amber-50/50 border-amber-200'
                      : 'bg-slate-50/50 border-slate-200'
                  }`}
                >
                  <button
                    onClick={() => setExpanded(expanded === id ? null : id)}
                    className="w-full flex items-center justify-between px-3 py-2 text-left"
                  >
                    <div className="flex items-center gap-2">
                      {statusIcon(info)}
                      <span className="font-medium text-slate-700 text-xs">{meta.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {metric && (
                        <span className="text-[10px] font-medium text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">
                          {metric}
                        </span>
                      )}
                      {info?.latency_ms && info.live && (
                        <span className="text-[9px] text-slate-400">{info.latency_ms}ms</span>
                      )}
                      <svg
                        className={`w-3 h-3 text-slate-400 transition-transform ${expanded === id ? 'rotate-180' : ''}`}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </button>

                  {expanded === id && (
                    <div className="px-3 pb-3 pt-1 border-t border-slate-100/50">
                      <p className="text-[10px] text-slate-500 mb-2">{meta.description}</p>
                      {info?.note && (
                        <p className="text-[10px] text-slate-600 mb-2">{info.note}</p>
                      )}
                      {info?.error && (
                        <p className="text-[10px] text-rose-600 mb-2">Error: {info.error}</p>
                      )}

                      {!info?.live && meta.setupSteps && (
                        <div className="mb-2">
                          <div className="text-[10px] font-semibold text-slate-700 mb-1">Setup Steps</div>
                          <ol className="space-y-1">
                            {meta.setupSteps.map((step, i) => (
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

                      {meta.docsUrl && (
                        <a
                          href={meta.docsUrl}
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

          {/* Footer */}
          <div className="px-4 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="text-[10px] text-slate-500">
                {summary.connected > 0 ? 'Live data · auto-sync every 5 min' : 'Connect data sources to see live governance'}
              </div>
              {lastRefresh && (
                <span className="text-[9px] text-slate-400">
                  Last checked: {new Date(lastRefresh).toLocaleTimeString()}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleRefresh}
                className="px-2 py-1 text-[10px] text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded transition-colors"
              >
                Refresh
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
