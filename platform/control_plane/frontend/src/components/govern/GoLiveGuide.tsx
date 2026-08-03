/**
 * GoLiveGuide — "Make This Live in AWS" collapsible panel.
 *
 * Every Govern demo section renders mock data tagged with <MockDataBadge>. This
 * component gives the user a concrete, per-section recipe for replacing that
 * demo data with real AWS integrations: the services involved and the wiring
 * steps in order. Blue/cloud themed to distinguish it from the violet
 * "How to Use" ModuleGuide.
 */

import { useState } from 'react';

export interface GoLiveRecipe {
  title: string;       // section name shown in the panel
  summary: string;     // one-line framing
  services: string[];  // AWS services / mechanisms involved
  steps: string[];     // ordered wiring steps
  docs?: { label: string; url: string }[];
}

// Keyed by section slug. One recipe per demo section across the Govern module.
export const GO_LIVE_RECIPES: Record<string, GoLiveRecipe> = {
  'agent-registry': {
    title: 'Agent Registry',
    summary: 'Replace the demo inventory with your live agent, tool, and MCP registry. The Cedar Policy column is already live — wired to Secure’s policy API.',
    services: ['Bedrock AgentCore Gateway', 'AgentCore Identity', 'Cedar / Verified Permissions', 'DynamoDB'],
    steps: [
      'Expose agents, tools, and MCP servers through AgentCore Gateway and tag each on deploy.',
      'Maintain the asset inventory in your control plane (e.g. DynamoDB), kept current via EventBridge as Gateway targets change.',
      'Ensure agent ids match the resource_id used by Secure’s Cedar policies — the Policy column and matrices already read policiesApi live.',
      'Swap the mock AGENT_REGISTRY / TOOL_REGISTRY for your control-plane inventory backed by AgentCore Gateway target listings.',
    ],
    docs: [
      { label: 'Bedrock AgentCore', url: 'https://aws.amazon.com/bedrock/agentcore/' },
      { label: 'Verified Permissions (Cedar)', url: 'https://aws.amazon.com/verified-permissions/' },
    ],
  },
  'shadow-ai': {
    title: 'Shadow AI Detection',
    summary: 'Feed real detection signals into the findings list and coverage metrics.',
    services: ['CloudTrail', 'EventBridge', 'AWS Config', 'Amazon Macie', 'VPC Flow Logs'],
    steps: [
      'Enable CloudTrail + Bedrock model-invocation logging across all accounts.',
      'Add an EventBridge rule that flags InvokeModel calls from principals not in the Agent Registry.',
      'Deploy AWS Config rules for untagged AI workloads and Macie for sensitive-data / secret scans.',
      'Route correlated findings into the control plane; diff against the registry to surface shadow assets.',
    ],
    docs: [
      { label: 'CloudTrail', url: 'https://docs.aws.amazon.com/awscloudtrail/' },
      { label: 'Amazon Macie', url: 'https://aws.amazon.com/macie/' },
    ],
  },
  'compliance': {
    title: 'Compliance Center',
    summary: 'Pull control status and evidence from automated compliance services.',
    services: ['AWS Audit Manager', 'AWS Config', 'Security Hub'],
    steps: [
      'Map framework controls (SR 26-2, NIST AI RMF, ISO 42001, etc.) to Audit Manager assessments.',
      'Deploy AWS Config conformance packs for continuous, evidence-backed control evaluation.',
      'Aggregate Security Hub findings to flag control gaps automatically.',
      'Replace the mock framework data with Audit Manager evidence and Config compliance status.',
    ],
    docs: [
      { label: 'AWS Audit Manager', url: 'https://aws.amazon.com/audit-manager/' },
      { label: 'AWS Config Conformance Packs', url: 'https://docs.aws.amazon.com/config/latest/developerguide/conformance-packs.html' },
    ],
  },
  'finops': {
    title: 'Cost & FinOps',
    summary: 'Drive budgets and spend analytics from real AWS cost data.',
    services: ['AWS Cost Explorer API', 'Cost Allocation Tags', 'AWS Budgets'],
    steps: [
      'Apply cost allocation tags (model, agent, business unit) to all AI resources.',
      'Pull spend and forecasts from the Cost Explorer API on a schedule.',
      'Configure AWS Budgets with alerts for per-BU and per-model thresholds.',
      'Replace mock COST/BUDGET data with Cost Explorer results keyed by tag.',
    ],
    docs: [
      { label: 'Cost Explorer API', url: 'https://docs.aws.amazon.com/aws-cost-management/latest/APIReference/' },
      { label: 'AWS Budgets', url: 'https://aws.amazon.com/aws-cost-management/aws-budgets/' },
    ],
  },
  'audit': {
    title: 'Audit & Incidents',
    summary: 'Build the activity feed and evidence bundles from real audit events.',
    services: ['AWS CloudTrail', 'Amazon EventBridge', 'CloudWatch Logs'],
    steps: [
      'Centralize CloudTrail across accounts into a logging account / S3 + Athena.',
      'Route governance-relevant events through EventBridge into the activity feed.',
      'Generate signed evidence bundles (SHA-256) from CloudTrail records on demand.',
      'Replace mock AUDIT_EVENTS with the queried CloudTrail / EventBridge stream.',
    ],
    docs: [
      { label: 'CloudTrail Lake', url: 'https://docs.aws.amazon.com/awscloudtrail/latest/userguide/cloudtrail-lake.html' },
      { label: 'Amazon EventBridge', url: 'https://aws.amazon.com/eventbridge/' },
    ],
  },
  'risk': {
    title: 'Risk Management',
    summary: 'Wire real-time risk signals, OWASP agentic risks, and policy enforcement to AWS services.',
    services: ['CloudWatch Logs Insights', 'CloudWatch Alarms', 'Security Hub', 'EventBridge', 'DynamoDB', 'Bedrock Guardrails', 'OPA/Rego'],
    steps: [
      'Deploy CloudWatch custom metrics for agent risk scores (capability, autonomy, behavior, context) using PutMetricData.',
      'Create CloudWatch Alarms for the 5-tier alert thresholds (CRITICAL≥90, HIGH≥70, MEDIUM≥40, LOW≥10, INFO<10).',
      'Route alarm state changes through EventBridge to trigger circuit breakers and incident response.',
      'Publish high-severity findings to Security Hub using BatchImportFindings for SOC integration.',
      'Store risk register, OWASP agentic AI threats, and chain risk metrics in DynamoDB.',
      'Integrate Bedrock Guardrails events (blocked/allowed) into cascade risk calculations.',
      'Deploy OPA/Rego policies via AWS Lambda authorizers for CI/CD policy enforcement.',
    ],
    docs: [
      { label: 'CloudWatch PutMetricData', url: 'https://docs.aws.amazon.com/AmazonCloudWatch/latest/APIReference/API_PutMetricData.html' },
      { label: 'Security Hub BatchImportFindings', url: 'https://docs.aws.amazon.com/securityhub/latest/userguide/securityhub-custom-providers.html' },
      { label: 'OPA on AWS', url: 'https://aws.amazon.com/blogs/opensource/open-policy-agent-opa-on-amazon-eks/' },
    ],
  },
  'risk-monitoring': {
    title: 'Real-Time Risk Monitoring',
    summary: 'Stream live runtime signals from agents to the monitoring dashboard.',
    services: ['CloudWatch Logs Insights', 'CloudWatch Metrics', 'EventBridge', 'Kinesis Data Streams', 'Lambda'],
    steps: [
      'Enable Bedrock model invocation logging to CloudWatch Logs for all agents.',
      'Create CloudWatch Logs Insights queries for anomaly detection (tool rate spikes, latency outliers).',
      'Stream agent telemetry through Kinesis Data Streams for real-time aggregation.',
      'Deploy Lambda functions to calculate cascade risk (base_risk × 1.15^chain_depth) and blast radius metrics.',
      'Route threshold breaches through EventBridge to trigger circuit breaker actions.',
      'Replace mock RuntimeSignals with CloudWatch Logs Insights query results.',
    ],
    docs: [
      { label: 'CloudWatch Logs Insights', url: 'https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/AnalyzingLogData.html' },
      { label: 'Kinesis Data Streams', url: 'https://aws.amazon.com/kinesis/data-streams/' },
    ],
  },
  'policy-as-code': {
    title: 'Policy as Code',
    summary: 'Enforce OPA/Rego governance policies at deployment time via CI/CD integration.',
    services: ['AWS Lambda', 'API Gateway', 'CodePipeline', 'EventBridge', 'DynamoDB', 'ECR'],
    steps: [
      'Deploy OPA as a Lambda function or ECS service for policy evaluation.',
      'Store Rego policies in DynamoDB or S3 with version control.',
      'Create API Gateway endpoint for policy evaluation: POST /policy/evaluate.',
      'Add CodePipeline stage that calls the policy API before agent deployment.',
      'Configure EventBridge rules to block deployments on hard-mandatory violations.',
      'Log all policy decisions to CloudWatch for audit trail and compliance reporting.',
      'Use ECR to version and distribute OPA bundles with your governance policies.',
    ],
    docs: [
      { label: 'OPA Documentation', url: 'https://www.openpolicyagent.org/docs/latest/' },
      { label: 'OPA Lambda', url: 'https://github.com/open-policy-agent/contrib/tree/main/lambda' },
      { label: 'CodePipeline Actions', url: 'https://docs.aws.amazon.com/codepipeline/latest/userguide/actions.html' },
    ],
  },
  'models': {
    title: 'Model Management',
    summary: 'Populate the model registry and evaluations from Bedrock + a metadata store.',
    services: ['Bedrock ListFoundationModels', 'Bedrock Model Evaluation', 'Langfuse', 'Metadata DB'],
    steps: [
      'Sync available models via Bedrock ListFoundationModels and enrich with a metadata DB (tier, owner, attestation).',
      'Run Bedrock Model Evaluation jobs for safety/quality/latency scores.',
      'Stream production telemetry from Langfuse for drift and monitoring.',
      'Replace mock MODELS / MODEL_DETAILS with the registry + evaluation results.',
    ],
    docs: [
      { label: 'Bedrock Model Evaluation', url: 'https://docs.aws.amazon.com/bedrock/latest/userguide/model-evaluation.html' },
    ],
  },
  'data-quality': {
    title: 'Data Quality',
    summary: 'Source quality scores from automated data-quality checks.',
    services: ['AWS Glue Data Quality', 'AWS Glue Data Catalog'],
    steps: [
      'Define Glue Data Quality rulesets for the datasets feeding your AI workloads.',
      'Schedule rule evaluations and capture results per dataset.',
      'Surface scores and failed rules in the control plane.',
      'Replace mock quality metrics with Glue Data Quality results.',
    ],
    docs: [
      { label: 'AWS Glue Data Quality', url: 'https://docs.aws.amazon.com/glue/latest/dg/glue-data-quality.html' },
    ],
  },
  'data-metadata': {
    title: 'Data Metadata & Catalog',
    summary: 'Drive the catalog from your governed knowledge sources.',
    services: ['Amazon Bedrock Knowledge Bases', 'AWS Glue Data Catalog'],
    steps: [
      'Register data sources in Bedrock Knowledge Bases and the Glue Data Catalog.',
      'Sync table/collection metadata, owners, and classifications.',
      'Expose catalog search to the control plane.',
      'Replace mock metadata with the catalog API.',
    ],
    docs: [
      { label: 'Bedrock Knowledge Bases', url: 'https://aws.amazon.com/bedrock/knowledge-bases/' },
    ],
  },
  'data-lineage': {
    title: 'Data Lineage & Provenance',
    summary: 'Trace lineage and chain-of-custody from catalog + pipeline metadata.',
    services: ['Amazon SageMaker / DataZone Catalog', 'AWS Glue', 'S3 (evidence)'],
    steps: [
      'Capture lineage from Glue jobs and SageMaker/DataZone catalog metadata.',
      'Record provenance with integrity hashes for AI-feeding datasets.',
      'Expose the source→transform→consumption graph to the control plane.',
      'Replace mock lineage records with catalog-derived lineage.',
    ],
    docs: [
      { label: 'Amazon DataZone', url: 'https://aws.amazon.com/datazone/' },
    ],
  },
  'data-readiness': {
    title: 'Data Readiness Assessment',
    summary: 'Persist the AI-readiness assessment and compute scores from real inputs.',
    services: ['Amazon DynamoDB', 'AWS Lambda'],
    steps: [
      'Store assessment responses in DynamoDB keyed by domain / data product.',
      'Compute the 7-dimension readiness score in Lambda.',
      'Track score history for trend reporting.',
      'Replace the mock assessment framework with the persisted results.',
    ],
  },
  'data-maturity': {
    title: 'Data Maturity Self-Assessment',
    summary: 'Persist maturity self-assessments and track progression over time.',
    services: ['Amazon DynamoDB', 'AWS Lambda'],
    steps: [
      'Store maturity self-assessment responses in DynamoDB.',
      'Compute the maturity stage per dimension in Lambda.',
      'Track stage progression across assessment cycles.',
      'Replace the mock maturity data with the persisted results.',
    ],
  },
  'data-governance': {
    title: 'Data Governance Hub',
    summary: 'Aggregate the governance views from catalog, quality, and lineage services.',
    services: ['AWS Glue Data Catalog', 'Glue Data Quality', 'Amazon DataZone', 'Amazon Macie'],
    steps: [
      'Stand up the Glue Data Catalog as the system of record for data assets.',
      'Layer Glue Data Quality, DataZone lineage, and Macie classification on top.',
      'Aggregate domain ownership, access agreements, and SLAs in the control plane.',
      'Replace mock governance data with the aggregated service outputs.',
    ],
    docs: [
      { label: 'Amazon DataZone', url: 'https://aws.amazon.com/datazone/' },
    ],
  },
  'human-oversight': {
    title: 'Human Oversight (HITL)',
    summary: 'Wire human-in-the-loop gates to AWS approval and workflow services.',
    services: ['Amazon Bedrock Agents (RETURN_CONTROL)', 'Amazon A2I', 'AWS Step Functions', 'Amazon SNS', 'DynamoDB'],
    steps: [
      'Configure Bedrock Agents with RETURN_CONTROL action groups for high-risk decisions requiring human confirmation.',
      'Set up Amazon A2I (Augmented AI) workflows for structured human review tasks with custom worker templates.',
      'Deploy Step Functions with wait-for-callback patterns for approval workflows with timeout handling.',
      'Configure SNS topics for approval notifications to Slack, email, or PagerDuty.',
      'Store approval records and audit trails in DynamoDB with TTL for compliance retention.',
      'Replace mock HITL_GATES and APPROVAL_RECORDS with DynamoDB + Step Functions execution history.',
    ],
    docs: [
      { label: 'Bedrock RETURN_CONTROL', url: 'https://docs.aws.amazon.com/bedrock/latest/userguide/agents-returncontrol.html' },
      { label: 'Amazon A2I', url: 'https://aws.amazon.com/augmented-ai/' },
      { label: 'Step Functions Callbacks', url: 'https://docs.aws.amazon.com/step-functions/latest/dg/connect-to-resource.html#connect-wait-token' },
    ],
  },
  'a2a': {
    title: 'A2A Governance',
    summary: 'Enforce trust policies and communication protocols for agent-to-agent interactions.',
    services: ['Amazon Bedrock Multi-Agent', 'AWS Step Functions', 'Amazon EventBridge', 'AWS IAM', 'Amazon SQS', 'API Gateway'],
    steps: [
      'Deploy Bedrock multi-agent collaboration with supervisor patterns for orchestrated agent workflows.',
      'Use Step Functions for agent orchestration with parallel/choice states and error handling.',
      'Configure EventBridge schemas for typed agent-to-agent message contracts.',
      'Set up IAM roles with cross-agent assume-role policies for least-privilege A2A authorization.',
      'Deploy SQS dead letter queues for failed A2A messages with redrive policies.',
      'Use API Gateway request validation for synchronous agent-to-agent API calls.',
      'Replace mock A2A_TRUST_POLICIES and AGENT_NODES with IAM policy analysis + EventBridge schema registry.',
    ],
    docs: [
      { label: 'Bedrock Multi-Agent', url: 'https://docs.aws.amazon.com/bedrock/latest/userguide/agents-multi-agent-collaboration.html' },
      { label: 'EventBridge Schema Registry', url: 'https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-schema.html' },
      { label: 'IAM AssumeRole', url: 'https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_use.html' },
    ],
  },
  'fleet': {
    title: 'Fleet Overview',
    summary: 'Aggregate fleet posture, agent chains, and emergency controls from live AWS data.',
    services: ['Bedrock AgentCore', 'CloudWatch', 'EventBridge', 'AWS Config', 'Systems Manager'],
    steps: [
      'Source live agent inventory from your control plane (AgentCore Gateway targets + runtime status) with health metrics.',
      'Stream agent execution traces to CloudWatch for chain visualization and blast radius analysis.',
      'Deploy AWS Config rules to detect agents without guardrails or missing emergency controls.',
      'Configure Systems Manager Automation for kill switch and circuit breaker runbooks.',
      'Route critical alerts through EventBridge for real-time fleet posture updates.',
      'Replace mock AGENTS, CHAINS, and POSTURE_METRICS with AgentCore + CloudWatch queries.',
    ],
    docs: [
      { label: 'Bedrock AgentCore', url: 'https://aws.amazon.com/bedrock/agentcore/' },
      { label: 'Systems Manager Automation', url: 'https://docs.aws.amazon.com/systems-manager/latest/userguide/systems-manager-automation.html' },
    ],
  },
  'command-center': {
    title: 'Command Center',
    summary: 'Aggregate executive dashboard metrics from across AWS governance services.',
    services: ['CloudWatch Dashboards', 'AWS Cost Explorer', 'Security Hub', 'Bedrock AgentCore', 'QuickSight'],
    steps: [
      'Create CloudWatch dashboard with embedded metrics for fleet health, risk scores, and alerts.',
      'Pull spend summaries from Cost Explorer API with cost allocation tags for AI workloads.',
      'Aggregate Security Hub findings counts by severity for the security posture widget.',
      'Query AgentCore for active agent counts and recent deployment activity.',
      'Optionally embed QuickSight dashboards for interactive drill-down analytics.',
      'Replace mock EXECUTIVE_METRICS with aggregated CloudWatch + Cost Explorer + Security Hub data.',
    ],
    docs: [
      { label: 'CloudWatch Dashboards', url: 'https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch_Dashboards.html' },
      { label: 'Security Hub Insights', url: 'https://docs.aws.amazon.com/securityhub/latest/userguide/securityhub-insights.html' },
    ],
  },
  'agentic-playbook': {
    title: 'Agentic Governance Playbook',
    summary: 'Implement the playbook decision framework with live AWS governance services.',
    services: ['Bedrock Agents', 'Amazon A2I', 'Step Functions', 'EventBridge', 'IAM', 'DynamoDB'],
    steps: [
      'Map autonomy levels to Bedrock agent configurations with appropriate RETURN_CONTROL settings.',
      'Configure HITL gates using A2I workflows for structured review or Step Functions for approval workflows.',
      'Implement A2A trust policies via IAM cross-account roles and EventBridge schema validation.',
      'Store governance decisions and audit trails in DynamoDB with TTL for compliance retention.',
      'Deploy circuit breakers via Step Functions with CloudWatch Alarms triggering emergency controls.',
      'Use EventBridge rules to route governance events to appropriate approval workflows.',
      'Integrate policy decisions with CI/CD via CodePipeline approval actions.',
    ],
    docs: [
      { label: 'Bedrock Agents', url: 'https://docs.aws.amazon.com/bedrock/latest/userguide/agents.html' },
      { label: 'Amazon A2I', url: 'https://aws.amazon.com/augmented-ai/' },
      { label: 'Step Functions Patterns', url: 'https://docs.aws.amazon.com/step-functions/latest/dg/concepts-service-integrations.html' },
    ],
  },
  'multi-cloud': {
    title: 'Multi-Cloud Agent Governance',
    summary: 'Connect and govern AI agents across AWS, Azure, and GCP from a unified control plane.',
    services: ['AWS Bedrock', 'Azure AI Foundry', 'Google Vertex AI', 'AWS Secrets Manager', 'Lambda', 'EventBridge'],
    steps: [
      'Store Azure and GCP credentials securely in AWS Secrets Manager with rotation policies.',
      'Deploy Lambda functions to query Azure AI Agent Service and Vertex AI Agent Builder APIs.',
      'Create EventBridge scheduled rules to periodically sync agent inventories from all providers.',
      'Normalize agent metadata into a common schema stored in DynamoDB for unified queries.',
      'Implement cross-cloud guardrail mapping: Bedrock Guardrails ↔ Content Safety ↔ Responsible AI Toolkit.',
      'Set up CloudWatch dashboards aggregating metrics from all three providers.',
      'Configure SNS alerts for cross-cloud policy violations or agent drift detection.',
    ],
    docs: [
      { label: 'Azure AI Agent Service', url: 'https://learn.microsoft.com/en-us/azure/ai-services/agents/' },
      { label: 'Vertex AI Agent Builder', url: 'https://cloud.google.com/products/agent-builder' },
      { label: 'AWS Secrets Manager', url: 'https://docs.aws.amazon.com/secretsmanager/latest/userguide/intro.html' },
    ],
  },
  'vendors': {
    title: 'Vendor Governance (TPRM)',
    summary: 'Manage third-party AI vendor risk with due diligence, contract tracking, and exit strategies.',
    services: ['DynamoDB', 'Lambda', 'S3', 'EventBridge', 'QuickSight'],
    steps: [
      'Store vendor records in DynamoDB with attributes for DDQ scores, certifications, and contract dates.',
      'Create S3 bucket for vendor evidence documents (SOC reports, certifications, contracts).',
      'Deploy Lambda function to check contract expiry dates and send SNS alerts 90/60/30 days before.',
      'Set up EventBridge rules to trigger vendor reassessment workflows on schedule.',
      'Calculate concentration risk by aggregating Bedrock model invocation counts per vendor.',
      'Build QuickSight dashboard for executive vendor risk reporting.',
      'Implement vendor offboarding workflow with exit strategy execution tracking.',
    ],
    docs: [
      { label: 'DynamoDB Best Practices', url: 'https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/best-practices.html' },
      { label: 'EventBridge Scheduler', url: 'https://docs.aws.amazon.com/scheduler/latest/UserGuide/what-is-scheduler.html' },
    ],
  },
  'safety': {
    title: 'AI Safety',
    summary: 'Back the coverage rubric, frontier thresholds, safety cases, evals, and incident clocks with real capability-eval and attestation sources. The RAI rubric already reads live agent signals (guardrails, incidents); the assurance surfaces are illustrative until wired.',
    services: ['Bedrock Model Evaluation', 'Amazon A2I', 'S3 (evidence)', 'DynamoDB', 'EventBridge', 'Amazon SNS'],
    steps: [
      'Ingest per-model dangerous-capability attestations (FMSF / RSP-ASL / OpenAI Preparedness / DeepMind FSF) into DynamoDB, keyed by model id — the Frontier Thresholds register reads these, it does not auto-judge capability.',
      'Run red-team campaigns and safety benchmarks (HarmBench, WMDP, AILuminate, Cybench) via Bedrock Model Evaluation + a harness (e.g. Inspect); store scores with polarity so pass/fail is computed correctly.',
      'Persist safety cases (GSN/CAE claims-arguments-evidence) in DynamoDB with evidence artifacts in S3; link each claim to the eval or control that discharges it.',
      'Wire incident intake through EventBridge; start EU AI Act Article 73 reporting clocks (2/10/15-day) on classification and fan out reminders via SNS.',
      'Let the RAI Coverage Rubric keep aggregating live agent signals (guardrail coverage, open incidents) — replace only the illustrative surface data with the sources above.',
    ],
    docs: [
      { label: 'Bedrock Model Evaluation', url: 'https://docs.aws.amazon.com/bedrock/latest/userguide/model-evaluation.html' },
      { label: 'AWS Responsible AI', url: 'https://aws.amazon.com/machine-learning/responsible-ai/' },
      { label: 'EU AI Act Article 73', url: 'https://artificialintelligenceact.eu/article/73/' },
    ],
  },
};

interface Props {
  section: keyof typeof GO_LIVE_RECIPES;
}

export default function GoLiveGuide({ section }: Props) {
  const [collapsed, setCollapsed] = useState(true);
  const recipe = GO_LIVE_RECIPES[section];
  if (!recipe) return null;

  return (
    <div className="rounded-xl border shadow-sm mb-4 overflow-hidden bg-gradient-to-r from-sky-50 via-blue-50 to-cyan-50 border-blue-200/60">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center justify-between px-4 py-3 transition-colors hover:bg-blue-100/30"
      >
        <div className="flex items-center gap-3">
          {/* cloud icon — distinct from the violet lightbulb of How-to-Use */}
          <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-gradient-to-br from-sky-500 via-blue-500 to-cyan-500 shadow-md shadow-blue-200">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15a4.5 4.5 0 004.5 4.5H18a3.75 3.75 0 001.332-7.257 3 3 0 00-3.758-3.848 5.25 5.25 0 00-10.233 2.33A4.502 4.502 0 002.25 15z" />
            </svg>
          </div>
          <div className="text-left">
            <span className="text-xs font-semibold text-blue-700">Make This Live in AWS</span>
            <div className="text-[10px] text-blue-500">{collapsed ? 'Click to expand' : 'Click to collapse'}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {collapsed && (
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
              {recipe.services.length} services
            </span>
          )}
          <div className="w-6 h-6 rounded-full flex items-center justify-center bg-blue-100">
            <svg className={`w-4 h-4 transition-transform text-blue-600 ${collapsed ? '' : 'rotate-180'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
      </button>

      {!collapsed && (
        <div className="px-4 pb-4 pt-1 bg-white/50">
          <p className="text-[11px] text-slate-600 mb-3">{recipe.summary}</p>

          {/* Services */}
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <span className="text-[10px] font-semibold text-blue-700 uppercase tracking-wide">AWS Services</span>
            {recipe.services.map(s => (
              <span key={s} className="text-[10px] px-2 py-0.5 rounded-md bg-blue-100 text-blue-700 font-medium">{s}</span>
            ))}
          </div>

          {/* Steps */}
          <ol className="space-y-1.5">
            {recipe.steps.map((step, i) => (
              <li key={i} className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-blue-500 text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{i + 1}</span>
                <span className="text-[11px] text-slate-700 leading-relaxed">{step}</span>
              </li>
            ))}
          </ol>

          {/* Docs */}
          {recipe.docs && recipe.docs.length > 0 && (
            <div className="flex items-center gap-2 mt-3 pt-3 border-t border-blue-100 flex-wrap">
              <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Docs</span>
              {recipe.docs.map(d => (
                <a
                  key={d.url}
                  href={d.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] px-2 py-0.5 rounded-md bg-white border border-blue-200 text-blue-600 hover:bg-blue-50 transition-colors"
                >
                  {d.label} ↗
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
