/**
 * DataSourceInfo — Collapsible panel showing how data is collected for a Govern page.
 *
 * Displays:
 * - AWS APIs called
 * - Required IAM permissions
 * - Troubleshooting tips
 * - Refresh interval
 */
import { useState } from 'react';
import { Icon } from './icons';

// ─────────────────────────── Types ───────────────────────────

export interface DataSourceDefinition {
  /** Human-readable name of the data source */
  name: string;
  /** AWS service (e.g., "Bedrock", "CloudWatch", "Cost Explorer") */
  service: string;
  /** API actions called (e.g., "bedrock:ListGuardrails") */
  apiActions: string[];
  /** Required IAM permissions */
  iamPermissions: string[];
  /** What the data shows */
  description: string;
  /** How often data refreshes */
  refreshInterval?: string;
  /** Troubleshooting tips if data is missing */
  troubleshooting?: string[];
}

export interface DataSourceInfoProps {
  /** Page/module identifier */
  pageId: string;
  /** Page title for display */
  pageTitle: string;
  /** Data sources used by this page */
  sources: DataSourceDefinition[];
  /** Optional: override default collapsed state */
  defaultExpanded?: boolean;
}

// ─────────────────────────── Component ───────────────────────────

export function DataSourceInfo({
  pageTitle,
  sources,
  defaultExpanded = false,
}: DataSourceInfoProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [expandedSources, setExpandedSources] = useState<Set<string>>(new Set());

  const toggleSource = (name: string) => {
    setExpandedSources(prev => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  };

  const allPermissions = [...new Set(sources.flatMap(s => s.iamPermissions))].sort();

  return (
    <div className="mt-6 rounded-xl border border-slate-200/60 bg-white/80 backdrop-blur-sm shadow-sm overflow-hidden">
      {/* Header - always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-5 py-3 flex items-center justify-between hover:bg-slate-50/50 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <Icon name="information-circle" className="w-5 h-5 text-blue-500" />
          <span className="text-sm font-medium text-slate-700">
            How This Data is Collected
          </span>
          <span className="text-xs text-slate-400">
            {sources.length} data source{sources.length !== 1 ? 's' : ''}
          </span>
        </div>
        <Icon
          name="chevron-down"
          className={`w-5 h-5 text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="px-5 pb-5 border-t border-slate-100">
          {/* Summary */}
          <div className="mt-4 mb-5 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg">
            <div className="text-sm text-slate-700">
              <strong>{pageTitle}</strong> displays live data from your AWS account.
              The backend calls AWS APIs using credentials from your configured profile or IAM role.
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {[...new Set(sources.map(s => s.service))].map(svc => (
                <span
                  key={svc}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-white/80 text-slate-600 border border-slate-200"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  {svc}
                </span>
              ))}
            </div>
          </div>

          {/* Data Sources */}
          <div className="space-y-3">
            {sources.map(source => {
              const isExpanded = expandedSources.has(source.name);
              return (
                <div
                  key={source.name}
                  className="border border-slate-200 rounded-lg overflow-hidden"
                >
                  <button
                    onClick={() => toggleSource(source.name)}
                    className="w-full px-4 py-3 flex items-center justify-between hover:bg-slate-50/50 transition-colors text-left"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-slate-100 to-slate-50 flex items-center justify-center">
                        <Icon name="server-stack" className="w-4 h-4 text-slate-500" />
                      </div>
                      <div>
                        <div className="text-sm font-medium text-slate-800">{source.name}</div>
                        <div className="text-xs text-slate-500">{source.service}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {source.refreshInterval && (
                        <span className="text-xs text-slate-400 flex items-center gap-1">
                          <Icon name="arrow-path" className="w-3.5 h-3.5" />
                          {source.refreshInterval}
                        </span>
                      )}
                      <Icon
                        name="chevron-down"
                        className={`w-4 h-4 text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                      />
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="px-4 pb-4 border-t border-slate-100 bg-slate-50/30">
                      {/* Description */}
                      <div className="mt-3">
                        <div className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">
                          What it shows
                        </div>
                        <div className="text-sm text-slate-600">{source.description}</div>
                      </div>

                      {/* API Actions */}
                      <div className="mt-3">
                        <div className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">
                          AWS API Actions
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {source.apiActions.map(action => (
                            <code
                              key={action}
                              className="px-2 py-0.5 text-xs bg-slate-100 text-slate-700 rounded font-mono"
                            >
                              {action}
                            </code>
                          ))}
                        </div>
                      </div>

                      {/* IAM Permissions */}
                      <div className="mt-3">
                        <div className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">
                          Required IAM Permissions
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {source.iamPermissions.map(perm => (
                            <code
                              key={perm}
                              className="px-2 py-0.5 text-xs bg-amber-50 text-amber-700 rounded font-mono"
                            >
                              {perm}
                            </code>
                          ))}
                        </div>
                      </div>

                      {/* Troubleshooting */}
                      {source.troubleshooting && source.troubleshooting.length > 0 && (
                        <div className="mt-3">
                          <div className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">
                            If data is missing
                          </div>
                          <ul className="text-xs text-slate-600 space-y-1">
                            {source.troubleshooting.map((tip, i) => (
                              <li key={i} className="flex items-start gap-2">
                                <span className="text-amber-500 mt-0.5">•</span>
                                <span>{tip}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* All Permissions Summary */}
          <div className="mt-5 p-4 bg-slate-50 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                All Required IAM Permissions for This Page
              </div>
              <button
                onClick={() => navigator.clipboard.writeText(allPermissions.join('\n'))}
                className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1"
              >
                <Icon name="clipboard" className="w-3.5 h-3.5" />
                Copy
              </button>
            </div>
            <div className="flex flex-wrap gap-1">
              {allPermissions.map(perm => (
                <code
                  key={perm}
                  className="px-1.5 py-0.5 text-[10px] bg-white text-slate-600 rounded border border-slate-200 font-mono"
                >
                  {perm}
                </code>
              ))}
            </div>
          </div>

          {/* Link to full docs */}
          <div className="mt-4 text-center">
            <a
              href="/docs#govern-overview"
              className="text-xs text-blue-600 hover:text-blue-700 font-medium"
            >
              View full IAM permissions documentation →
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────── Data Source Registry ───────────────────────────

/**
 * Centralized registry of data sources used by each Govern page.
 * Import this and use getPageDataSources(pageId) to get sources for a page.
 */
export const DATA_SOURCE_REGISTRY: Record<string, DataSourceDefinition[]> = {
  'command-center': [
    {
      name: 'Agent Discovery',
      service: 'Bedrock AgentCore',
      apiActions: ['bedrock-agent:ListAgents', 'bedrock-agentcore-control:ListAgentRuntimes'],
      iamPermissions: ['bedrock-agent:ListAgents', 'bedrock-agentcore-control:ListAgentRuntimes'],
      description: 'Discovers all Bedrock Agents and AgentCore runtimes in your account to show total agent count and fleet composition.',
      refreshInterval: '60s',
      troubleshooting: [
        'Ensure Bedrock Agents are deployed in the same region',
        'Check that your IAM role has bedrock-agent:ListAgents permission',
        'AgentCore runtimes require bedrock-agentcore-control:ListAgentRuntimes',
      ],
    },
    {
      name: 'Guardrail Telemetry',
      service: 'Bedrock',
      apiActions: ['bedrock:ListGuardrails', 'bedrock:GetGuardrail'],
      iamPermissions: ['bedrock:ListGuardrails', 'bedrock:GetGuardrail'],
      description: 'Lists all Bedrock Guardrails and their intervention metrics to show guardrail coverage and block rates.',
      refreshInterval: '60s',
      troubleshooting: [
        'Create at least one Bedrock Guardrail in the console',
        'Guardrails must be in READY state to appear',
      ],
    },
    {
      name: 'Config Compliance',
      service: 'AWS Config',
      apiActions: ['config:DescribeComplianceByConfigRule', 'config:GetComplianceDetailsByConfigRule'],
      iamPermissions: ['config:DescribeComplianceByConfigRule', 'config:GetComplianceDetailsByConfigRule'],
      description: 'Retrieves AWS Config rule compliance status to show overall compliance percentage.',
      refreshInterval: '5m',
      troubleshooting: [
        'Enable AWS Config in your account',
        'Deploy Config rules (managed or custom)',
        'Wait for Config to evaluate resources (can take several minutes)',
      ],
    },
    {
      name: 'Security Findings',
      service: 'Security Hub',
      apiActions: ['securityhub:GetFindings'],
      iamPermissions: ['securityhub:GetFindings', 'securityhub:DescribeHub'],
      description: 'Pulls Security Hub findings filtered to AI-relevant resources to show critical/high finding counts.',
      refreshInterval: '5m',
      troubleshooting: [
        'Enable Security Hub in your account',
        'Enable the AWS Foundational Security Best Practices standard',
        'Findings may take 24-48 hours to populate initially',
      ],
    },
    {
      name: 'Cost Summary',
      service: 'Cost Explorer',
      apiActions: ['ce:GetCostAndUsage'],
      iamPermissions: ['ce:GetCostAndUsage', 'ce:GetCostForecast'],
      description: 'Fetches aggregated AI/ML spend from Cost Explorer to show total cost and trends.',
      refreshInterval: '1h',
      troubleshooting: [
        'Enable Cost Explorer in the Billing console (takes 24h to activate)',
        'Ensure your IAM role has ce:GetCostAndUsage permission',
        'Cost data has a ~24h delay from actual usage',
      ],
    },
    {
      name: 'AI Activity Trail',
      service: 'CloudTrail',
      apiActions: ['cloudtrail:LookupEvents'],
      iamPermissions: ['cloudtrail:LookupEvents'],
      description: 'Queries CloudTrail for Bedrock API calls to show recent AI activity and caller analysis.',
      refreshInterval: '60s',
      troubleshooting: [
        'Ensure CloudTrail is enabled for management events',
        'Bedrock data events require a trail with data event logging',
        'Events appear within 15 minutes of API calls',
      ],
    },
    {
      name: 'AgentCore Observability',
      service: 'CloudWatch / X-Ray',
      apiActions: ['logs:StartQuery', 'logs:GetQueryResults', 'logs:FilterLogEvents'],
      iamPermissions: ['logs:StartQuery', 'logs:GetQueryResults', 'logs:FilterLogEvents', 'logs:DescribeDeliverySources'],
      description: 'Queries CloudWatch Logs Insights for AgentCore runtime traces, spans, and observability data from the aws/spans log group.',
      refreshInterval: '60s',
      troubleshooting: [
        'Enable CloudWatch Transaction Search in your account',
        'Configure delivery sources for each AgentCore runtime (logs + traces)',
        'Invoke agents to generate trace data - traces only appear after invocations',
        'Check that aws/spans log group exists and has data',
      ],
    },
  ],

  'agent-registry': [
    {
      name: 'Bedrock Agents',
      service: 'Bedrock',
      apiActions: ['bedrock-agent:ListAgents', 'bedrock-agent:GetAgent'],
      iamPermissions: ['bedrock-agent:ListAgents', 'bedrock-agent:GetAgent', 'bedrock-agent:ListAgentVersions'],
      description: 'Lists all Bedrock Agents with their status, version, and configuration details.',
      refreshInterval: '60s',
      troubleshooting: [
        'Create Bedrock Agents in the Bedrock console',
        'Agents must be in PREPARED or READY state to appear',
      ],
    },
    {
      name: 'AgentCore Runtimes',
      service: 'Bedrock AgentCore',
      apiActions: ['bedrock-agentcore-control:ListAgentRuntimes', 'bedrock-agentcore-control:GetAgentRuntime'],
      iamPermissions: ['bedrock-agentcore-control:ListAgentRuntimes', 'bedrock-agentcore-control:GetAgentRuntime'],
      description: 'Lists AgentCore runtime deployments with their status and configuration.',
      refreshInterval: '60s',
      troubleshooting: [
        'Deploy agents via AgentCore (requires AgentCore setup)',
        'Runtimes must be in READY state to appear',
      ],
    },
    {
      name: 'Agent Metrics',
      service: 'CloudWatch',
      apiActions: ['cloudwatch:GetMetricData'],
      iamPermissions: ['cloudwatch:GetMetricData', 'cloudwatch:ListMetrics'],
      description: 'Retrieves invocation counts, latency, and error rates per agent from CloudWatch metrics.',
      refreshInterval: '60s',
      troubleshooting: [
        'Metrics appear after agents receive invocations',
        'Check the AWS/Bedrock namespace in CloudWatch',
      ],
    },
  ],

  'fleet': [
    {
      name: 'Fleet Inventory',
      service: 'Bedrock AgentCore',
      apiActions: ['bedrock-agent:ListAgents', 'bedrock-agentcore-control:ListAgentRuntimes'],
      iamPermissions: ['bedrock-agent:ListAgents', 'bedrock-agentcore-control:ListAgentRuntimes'],
      description: 'Aggregates all agents across Bedrock and AgentCore for fleet-wide KPIs.',
      refreshInterval: '60s',
      troubleshooting: [
        'Deploy agents to see fleet metrics',
        'Both Bedrock Agents and AgentCore runtimes are included',
      ],
    },
    {
      name: 'Fleet Health Metrics',
      service: 'CloudWatch',
      apiActions: ['cloudwatch:GetMetricData'],
      iamPermissions: ['cloudwatch:GetMetricData', 'cloudwatch:ListMetrics'],
      description: 'Calculates fleet-wide error rates, latency percentiles, and throughput from CloudWatch.',
      refreshInterval: '60s',
      troubleshooting: [
        'Requires agent invocations to generate metrics',
        'Check AWS/Bedrock and AWS/AgentCore namespaces',
      ],
    },
  ],

  'fleet-observability': [
    {
      name: 'Runtime Metrics',
      service: 'CloudWatch',
      apiActions: ['cloudwatch:GetMetricData', 'cloudwatch:ListMetrics'],
      iamPermissions: ['cloudwatch:GetMetricData', 'cloudwatch:ListMetrics'],
      description: 'Per-agent invocations, latency, errors, sessions, throttles, and active session counts from AWS/Bedrock-AgentCore namespace.',
      refreshInterval: '60s',
      troubleshooting: [
        'Only agents with traffic emit metrics',
        'Check AWS/Bedrock-AgentCore namespace in CloudWatch',
      ],
    },
    {
      name: 'Resource Usage',
      service: 'CloudWatch',
      apiActions: ['cloudwatch:GetMetricData', 'cloudwatch:ListMetrics'],
      iamPermissions: ['cloudwatch:GetMetricData', 'cloudwatch:ListMetrics'],
      description: 'CPU (vCPU-Hours) and Memory (GB-Hours) consumption per agent runtime from CPUUsed-vCPUHours and MemoryUsed-GBHours metrics.',
      refreshInterval: '60s',
      troubleshooting: [
        'Resource usage metrics appear after agent execution',
        'Dimensions: Service, Resource, Name',
      ],
    },
    {
      name: 'Gateway Metrics',
      service: 'CloudWatch',
      apiActions: ['cloudwatch:GetMetricData', 'cloudwatch:ListMetrics'],
      iamPermissions: ['cloudwatch:GetMetricData', 'cloudwatch:ListMetrics'],
      description: 'MCP gateway invocations, throttles, errors, latency, duration, and target execution time from AWS/Bedrock-AgentCore namespace.',
      refreshInterval: '60s',
      troubleshooting: [
        'Gateway metrics require gateway resources to be deployed',
        'Dimensions: Operation, Protocol, Method, Resource, Name',
      ],
    },
    {
      name: 'Memory Store Metrics',
      service: 'CloudWatch',
      apiActions: ['cloudwatch:GetMetricData', 'cloudwatch:ListMetrics'],
      iamPermissions: ['cloudwatch:GetMetricData', 'cloudwatch:ListMetrics'],
      description: 'Memory resource invocations, latency, errors, and creation counts for agent memory stores.',
      refreshInterval: '60s',
      troubleshooting: [
        'Memory metrics appear after CreateEvent/GetEvent operations',
        'Check Operations: CreateEvent, GetEvent, ListEvents, RetrieveMemoryRecords',
      ],
    },
    {
      name: 'Agent Traces',
      service: 'CloudWatch Logs',
      apiActions: ['logs:StartQuery', 'logs:GetQueryResults'],
      iamPermissions: ['logs:StartQuery', 'logs:GetQueryResults', 'logs:DescribeLogGroups'],
      description: 'OTEL-compatible spans from aws/spans log group showing InvokeAgentRuntime and InvokeGateway operations with trace IDs, latency, and error details.',
      refreshInterval: 'On-demand',
      troubleshooting: [
        'Enable observability on your AgentCore resources',
        'Traces appear in aws/spans or /aws/bedrock-agentcore/runtimes log groups',
      ],
    },
  ],

  'models': [
    {
      name: 'Model Catalog',
      service: 'Bedrock',
      apiActions: ['bedrock:ListFoundationModels', 'bedrock:GetFoundationModel'],
      iamPermissions: ['bedrock:ListFoundationModels', 'bedrock:GetFoundationModel'],
      description: 'Lists all available Bedrock foundation models with their capabilities and pricing.',
      refreshInterval: '1h',
      troubleshooting: [
        'Request model access in the Bedrock console',
        'Some models require approval before appearing',
      ],
    },
    {
      name: 'Model Runtime Metrics',
      service: 'CloudWatch',
      apiActions: ['cloudwatch:GetMetricData', 'cloudwatch:GetMetricStatistics'],
      iamPermissions: ['cloudwatch:GetMetricData', 'cloudwatch:GetMetricStatistics', 'cloudwatch:ListMetrics'],
      description: 'Retrieves per-model invocation counts, latency, and token usage from CloudWatch.',
      refreshInterval: '60s',
      troubleshooting: [
        'Invoke models to generate metrics',
        'Check AWS/Bedrock namespace with ModelId dimension',
      ],
    },
    {
      name: 'Model Cost',
      service: 'Cost Explorer',
      apiActions: ['ce:GetCostAndUsage'],
      iamPermissions: ['ce:GetCostAndUsage'],
      description: 'Breaks down Bedrock costs by model using Cost Explorer usage types.',
      refreshInterval: '1h',
      troubleshooting: [
        'Cost data has ~24h delay',
        'Filter by SERVICE=Amazon Bedrock in Cost Explorer',
      ],
    },
    {
      name: 'Guardrails (for LLM Monitoring)',
      service: 'Bedrock',
      apiActions: ['bedrock:ListGuardrails', 'bedrock:GetGuardrail'],
      iamPermissions: ['bedrock:ListGuardrails', 'bedrock:GetGuardrail'],
      description: 'Lists guardrails that provide quality signals for LLM monitoring (groundedness, relevance, harmful content).',
      refreshInterval: '5m',
      troubleshooting: [
        'Create guardrails with content filters and grounding checks',
        'Enable guardrail logging for detailed metrics',
      ],
    },
  ],

  'finops': [
    {
      name: 'AWS Spend',
      service: 'Cost Explorer',
      apiActions: ['ce:GetCostAndUsage', 'ce:GetCostForecast', 'ce:GetDimensionValues'],
      iamPermissions: ['ce:GetCostAndUsage', 'ce:GetCostForecast', 'ce:GetDimensionValues', 'ce:GetTags'],
      description: 'Retrieves aggregated and itemized AWS spend with filtering by service, tag, and time period.',
      refreshInterval: '1h',
      troubleshooting: [
        'Enable Cost Explorer in Billing console (24h activation)',
        'Cost data is delayed by ~24 hours',
        'Activate cost allocation tags for tag-based breakdowns',
      ],
    },
    {
      name: 'Cost Anomalies',
      service: 'Cost Explorer',
      apiActions: ['ce:GetAnomalies', 'ce:GetAnomalyMonitors'],
      iamPermissions: ['ce:GetAnomalies', 'ce:GetAnomalyMonitors'],
      description: 'Detects unusual spend patterns using AWS Cost Anomaly Detection.',
      refreshInterval: '1h',
      troubleshooting: [
        'Create a Cost Anomaly Monitor in the Billing console',
        'Monitors need ~2 weeks of data to establish baselines',
      ],
    },
    {
      name: 'AWS Budgets',
      service: 'Budgets',
      apiActions: ['budgets:DescribeBudgets'],
      iamPermissions: ['budgets:ViewBudget', 'budgets:DescribeBudgets'],
      description: 'Shows budget vs actual spend from AWS Budgets.',
      refreshInterval: '1h',
      troubleshooting: [
        'Create budgets in the Billing console',
        'Set budget filters for AI/ML services',
      ],
    },
    {
      name: 'Cost by Tag',
      service: 'Cost Explorer',
      apiActions: ['ce:GetCostAndUsage', 'ce:GetTags'],
      iamPermissions: ['ce:GetCostAndUsage', 'ce:GetTags'],
      description: 'Breaks down costs by cost allocation tags for chargeback analysis.',
      refreshInterval: '1h',
      troubleshooting: [
        'Activate cost allocation tags in Billing console',
        'Tag your resources with business-unit, agent, owner tags',
        'Tags take 24h to appear in Cost Explorer after activation',
      ],
    },
  ],

  'capacity': [
    {
      name: 'Service Quotas',
      service: 'Service Quotas',
      apiActions: ['servicequotas:ListServiceQuotas', 'servicequotas:GetServiceQuota'],
      iamPermissions: ['servicequotas:ListServiceQuotas', 'servicequotas:GetServiceQuota', 'servicequotas:ListAWSDefaultServiceQuotas'],
      description: 'Lists current quotas and usage for AI-relevant services (Bedrock, SageMaker, Lambda, CloudWatch, IAM).',
      refreshInterval: '5m',
      troubleshooting: [
        'Some quotas require usage to show current values',
        'Default quotas are shown if no custom quota is set',
      ],
    },
    {
      name: 'Quota Usage History',
      service: 'CloudWatch',
      apiActions: ['cloudwatch:GetMetricData'],
      iamPermissions: ['cloudwatch:GetMetricData', 'cloudwatch:ListMetrics'],
      description: 'Retrieves historical quota usage trends from CloudWatch for capacity planning.',
      refreshInterval: '5m',
      troubleshooting: [
        'Usage metrics are in the AWS/Usage namespace',
        'Not all quotas have usage metrics',
      ],
    },
  ],

  'compliance': [
    {
      name: 'Config Rule Compliance',
      service: 'AWS Config',
      apiActions: ['config:DescribeConfigRules', 'config:GetComplianceDetailsByConfigRule'],
      iamPermissions: ['config:DescribeConfigRules', 'config:GetComplianceDetailsByConfigRule', 'config:DescribeComplianceByConfigRule'],
      description: 'Shows compliance status of AWS Config rules for governance controls.',
      refreshInterval: '5m',
      troubleshooting: [
        'Enable AWS Config and deploy managed rules',
        'Rules evaluate resources on change or schedule',
        'Initial evaluation can take several minutes',
      ],
    },
  ],

  'audit': [
    {
      name: 'AI Activity Events',
      service: 'CloudTrail',
      apiActions: ['cloudtrail:LookupEvents'],
      iamPermissions: ['cloudtrail:LookupEvents'],
      description: 'Queries CloudTrail for Bedrock and AI-related API calls to build the audit trail.',
      refreshInterval: '60s',
      troubleshooting: [
        'Enable CloudTrail for management events',
        'For Bedrock model invocations, enable data event logging',
        'Events appear within 15 minutes of API calls',
      ],
    },
    {
      name: 'AI Caller Analysis',
      service: 'CloudTrail',
      apiActions: ['cloudtrail:LookupEvents'],
      iamPermissions: ['cloudtrail:LookupEvents'],
      description: 'Analyzes CloudTrail to identify unique AI callers and detect unrecognized/shadow usage.',
      refreshInterval: '60s',
      troubleshooting: [
        'Caller identity comes from CloudTrail userIdentity field',
        'IAM roles and users are identified separately',
      ],
    },
  ],

  'data': [
    {
      name: 'Glue Data Catalog',
      service: 'Glue',
      apiActions: ['glue:GetDatabases', 'glue:GetTables'],
      iamPermissions: ['glue:GetDatabases', 'glue:GetDatabase', 'glue:GetTables', 'glue:GetTable'],
      description: 'Lists Glue databases and tables to show data catalog coverage.',
      refreshInterval: '5m',
      troubleshooting: [
        'Create Glue databases and run crawlers to populate catalog',
        'Tables must be registered in the Glue Data Catalog',
      ],
    },
    {
      name: 'Knowledge Bases',
      service: 'Bedrock',
      apiActions: ['bedrock-agent:ListKnowledgeBases', 'bedrock-agent:GetKnowledgeBase'],
      iamPermissions: ['bedrock-agent:ListKnowledgeBases', 'bedrock-agent:GetKnowledgeBase'],
      description: 'Lists Bedrock Knowledge Bases for RAG data governance.',
      refreshInterval: '5m',
      troubleshooting: [
        'Create Knowledge Bases in the Bedrock console',
        'Knowledge Bases must be in ACTIVE state',
      ],
    },
  ],

  'security': [
    {
      name: 'Security Hub Findings',
      service: 'Security Hub',
      apiActions: ['securityhub:GetFindings'],
      iamPermissions: ['securityhub:GetFindings', 'securityhub:DescribeHub'],
      description: 'Retrieves Security Hub findings filtered to AI-relevant resources and controls.',
      refreshInterval: '5m',
      troubleshooting: [
        'Enable Security Hub in your account',
        'Enable AWS Foundational Security Best Practices standard',
        'Findings aggregate from multiple sources (GuardDuty, Inspector, Config)',
      ],
    },
    {
      name: 'GuardDuty Findings',
      service: 'GuardDuty',
      apiActions: ['guardduty:ListFindings', 'guardduty:GetFindings'],
      iamPermissions: ['guardduty:ListDetectors', 'guardduty:ListFindings', 'guardduty:GetFindings'],
      description: 'Shows GuardDuty threat detection findings for AI workloads.',
      refreshInterval: '5m',
      troubleshooting: [
        'Enable GuardDuty in your account',
        'Create a detector in the GuardDuty console',
      ],
    },
  ],

  'dev-tools': [
    {
      name: 'Developer AI Usage',
      service: 'CloudWatch',
      apiActions: ['cloudwatch:GetMetricData'],
      iamPermissions: ['cloudwatch:GetMetricData', 'cloudwatch:ListMetrics'],
      description: 'Retrieves developer AI tool usage metrics from the AVA namespace.',
      refreshInterval: '60s',
      troubleshooting: [
        'Configure OpenTelemetry to publish to CloudWatch',
        'Check the claude_code namespace for metrics',
      ],
    },
    {
      name: 'CloudTrail AI Events',
      service: 'CloudTrail',
      apiActions: ['cloudtrail:LookupEvents'],
      iamPermissions: ['cloudtrail:LookupEvents'],
      description: 'Detects AI coding tool API calls via CloudTrail for policy drift detection.',
      refreshInterval: '60s',
      troubleshooting: [
        'Enable CloudTrail for management events',
        'AI tool calls route through AWS APIs',
      ],
    },
  ],

  'path-jail': [
    {
      name: 'Path Jail Rules',
      service: 'AVA Backend',
      apiActions: ['AVA API: GET /govern/path-jail/rules'],
      iamPermissions: [],
      description: 'Retrieves path jailing rules from the AVA backend database.',
      refreshInterval: 'On demand',
      troubleshooting: [
        'Rules are stored in the AVA backend, not AWS',
        'Check backend connectivity if rules are not loading',
      ],
    },
    {
      name: 'Violation History',
      service: 'AVA Backend',
      apiActions: ['AVA API: GET /govern/path-jail/violations'],
      iamPermissions: [],
      description: 'Shows recent path access violations logged by AI coding tools.',
      refreshInterval: '60s',
      troubleshooting: [
        'Violations are logged when AI tools attempt blocked paths',
        'Ensure AI tools are configured to report to AVA',
      ],
    },
  ],

  'policy-drift': [
    {
      name: 'Drift Analysis',
      service: 'CloudTrail + AVA',
      apiActions: ['cloudtrail:LookupEvents', 'AVA API: GET /govern/policy-drift/analyze'],
      iamPermissions: ['cloudtrail:LookupEvents'],
      description: 'Compares declared policies with actual CloudTrail events to detect drift.',
      refreshInterval: '5m',
      troubleshooting: [
        'Enable CloudTrail for Bedrock and AI service events',
        'Drift detection requires defined policies in AVA',
      ],
    },
    {
      name: 'Worst Offenders',
      service: 'CloudTrail + AVA',
      apiActions: ['AVA API: GET /govern/policy-drift/offenders'],
      iamPermissions: ['cloudtrail:LookupEvents'],
      description: 'Aggregates drift findings by user/harness to identify top offenders.',
      refreshInterval: '5m',
      troubleshooting: [
        'Offender analysis requires drift findings to exist',
        'Check CloudTrail for user identity information',
      ],
    },
  ],

  'guardrails': [
    {
      name: 'Bedrock Guardrails',
      service: 'Bedrock',
      apiActions: ['bedrock:ListGuardrails', 'bedrock:GetGuardrail'],
      iamPermissions: ['bedrock:ListGuardrails', 'bedrock:GetGuardrail'],
      description: 'Lists all Bedrock Guardrails with their content filter configurations.',
      refreshInterval: '5m',
      troubleshooting: [
        'Create guardrails in the Bedrock console',
        'Guardrails must be in READY state',
      ],
    },
    {
      name: 'Guardrail Metrics',
      service: 'CloudWatch',
      apiActions: ['cloudwatch:GetMetricData'],
      iamPermissions: ['cloudwatch:GetMetricData', 'cloudwatch:ListMetrics'],
      description: 'Retrieves guardrail intervention metrics (invocations, blocks) from CloudWatch.',
      refreshInterval: '60s',
      troubleshooting: [
        'Metrics appear after guardrails process requests',
        'Check AWS/Bedrock namespace with GuardrailId dimension',
      ],
    },
  ],
};

/**
 * Get data sources for a specific page.
 * Returns empty array if page is not in registry.
 */
export function getPageDataSources(pageId: string): DataSourceDefinition[] {
  return DATA_SOURCE_REGISTRY[pageId] || [];
}

export default DataSourceInfo;
