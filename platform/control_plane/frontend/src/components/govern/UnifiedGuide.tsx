/**
 * UnifiedGuide — Compact status bar with expandable "How to Use" and "Make Live in AWS" tabs.
 *
 * Mirrors the ConnectionWizard pattern from GovernLanding: a collapsed header bar
 * that shows key metrics, and expands to reveal structured guidance. Combines the
 * ShadowAIGuide + GoLiveGuide into a single unified component per module.
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';

interface Step {
  title: string;
  desc: string;
}

interface AwsService {
  name: string;
  enabled?: boolean;
  required?: boolean;
}

interface DocLink {
  label: string;
  url: string;
}

interface UnifiedGuideProps {
  module: string;
  title: string;
  summary: string;
  howToUse: {
    steps: Step[];
    quickLinks?: { label: string; path: string }[];
  };
  goLive: {
    services: AwsService[];
    steps: string[];
    docs?: DocLink[];
  };
  status?: {
    live?: number;
    mock?: number;
    partial?: number;
  };
}

export default function UnifiedGuide({ module, title, summary, howToUse, goLive, status }: UnifiedGuideProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'howto' | 'golive'>('howto');

  const totalServices = goLive.services.length;
  const enabledServices = goLive.services.filter(s => s.enabled).length;
  const hasAnyEnabled = enabledServices > 0;

  return (
    <div className="rounded-xl border border-slate-200/60 overflow-hidden bg-white shadow-sm mb-6">
      {/* Compact header bar - always visible */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
            hasAnyEnabled
              ? 'bg-gradient-to-br from-emerald-500 to-green-600'
              : 'bg-gradient-to-br from-indigo-500 to-violet-600'
          }`}>
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
          </div>

          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-800 text-sm">{title} Guide</span>
              {hasAnyEnabled ? (
                <span className="text-xs text-emerald-600 font-medium">
                  {enabledServices}/{totalServices} AWS services enabled
                </span>
              ) : (
                <span className="text-xs text-slate-500">
                  {howToUse.steps.length} steps · {totalServices} AWS services
                </span>
              )}
            </div>
            <div className="text-xs text-slate-500 text-left">{summary}</div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {status && !isOpen && (
            <div className="flex items-center gap-2">
              {status.live !== undefined && status.live > 0 && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium">
                  {status.live} live
                </span>
              )}
              {status.mock !== undefined && status.mock > 0 && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">
                  {status.mock} mock
                </span>
              )}
            </div>
          )}
          <svg
            className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* Expanded details */}
      {isOpen && (
        <div className="border-t border-slate-100">
          {/* Tab bar */}
          <div className="flex border-b border-slate-100 bg-slate-50/50">
            <button
              onClick={() => setActiveTab('howto')}
              className={`flex-1 px-4 py-2.5 text-xs font-medium transition-colors ${
                activeTab === 'howto'
                  ? 'text-indigo-700 border-b-2 border-indigo-500 bg-white'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <span className="flex items-center justify-center gap-1.5">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
                How to Use
              </span>
            </button>
            <button
              onClick={() => setActiveTab('golive')}
              className={`flex-1 px-4 py-2.5 text-xs font-medium transition-colors ${
                activeTab === 'golive'
                  ? 'text-amber-700 border-b-2 border-amber-500 bg-gradient-to-r from-amber-50 to-orange-50'
                  : 'text-amber-600 hover:text-amber-700 bg-amber-50/50 hover:bg-amber-100/50'
              }`}
            >
              <span className="flex items-center justify-center gap-1.5">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15a4.5 4.5 0 004.5 4.5H18a3.75 3.75 0 001.332-7.257 3 3 0 00-3.758-3.848 5.25 5.25 0 00-10.233 2.33A4.502 4.502 0 002.25 15z" />
                </svg>
                Make Live in AWS
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-200 text-amber-800 font-semibold">AWS</span>
              </span>
            </button>
          </div>

          {/* Tab content */}
          <div className="p-4">
            {activeTab === 'howto' && (
              <div className="space-y-4">
                {/* Steps grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                  {howToUse.steps.map((step, i) => (
                    <div key={i} className="bg-gradient-to-br from-slate-50 to-indigo-50/30 rounded-lg border border-slate-200/80 p-3">
                      <div className="flex items-start gap-2">
                        <div className="w-6 h-6 rounded-full bg-indigo-500 text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                          {i + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-semibold text-slate-800">{step.title}</div>
                          <div className="text-[10px] text-slate-500 mt-0.5 leading-relaxed">{step.desc}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Quick links */}
                {howToUse.quickLinks && howToUse.quickLinks.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-100">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wide py-1">Quick links:</span>
                    {howToUse.quickLinks.map((link, i) => (
                      <Link
                        key={i}
                        to={link.path}
                        className="text-[10px] px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 font-medium hover:bg-indigo-100 transition-colors"
                      >
                        {link.label} →
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'golive' && (
              <div className="space-y-4">
                {/* AWS Services */}
                <div>
                  <div className="text-xs font-semibold text-slate-700 mb-2 flex items-center gap-2">
                    <svg className="w-4 h-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                    </svg>
                    AWS Services Required
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {goLive.services.map((svc, i) => (
                      <div
                        key={i}
                        className={`text-[10px] px-2.5 py-1 rounded-lg font-medium flex items-center gap-1.5 ${
                          svc.enabled
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : svc.required
                            ? 'bg-amber-50 text-amber-700 border border-amber-200'
                            : 'bg-slate-100 text-slate-600 border border-slate-200'
                        }`}
                      >
                        {svc.enabled && (
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                        {svc.name}
                        {svc.required && !svc.enabled && (
                          <span className="text-[8px] text-amber-600 font-semibold">REQUIRED</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Implementation steps */}
                <div>
                  <div className="text-xs font-semibold text-slate-700 mb-2 flex items-center gap-2">
                    <svg className="w-4 h-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                    </svg>
                    Implementation Steps
                  </div>
                  <div className="space-y-2">
                    {goLive.steps.map((step, i) => (
                      <div key={i} className="flex items-start gap-2 text-[11px] text-slate-600">
                        <span className="w-5 h-5 rounded bg-blue-100 text-blue-700 text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                          {i + 1}
                        </span>
                        <span className="leading-relaxed">{step}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Documentation links */}
                {goLive.docs && goLive.docs.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-100">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wide py-1">AWS Docs:</span>
                    {goLive.docs.map((doc, i) => (
                      <a
                        key={i}
                        href={doc.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 font-medium hover:bg-blue-100 transition-colors flex items-center gap-1"
                      >
                        {doc.label}
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </a>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────── Pre-configured guides per module ───────────────────────────

export const TRUST_STACK_GUIDE = {
  module: 'trust-stack',
  title: 'Trust Stack',
  summary: 'Build AI governance maturity across Foundation → Production → Scale layers',
  howToUse: {
    steps: [
      { title: 'Decide', desc: 'Choose Build vs Buy, select your operating model (Centralized/Federated/Hybrid), and classify use cases by GenAI Scoping Matrix (S1-S5).' },
      { title: 'Build', desc: 'Follow the Trust Journey from L1 Foundation (guardrails, policies) through L2 Production (agents, evals) to L3 Scale (fleet governance).' },
      { title: 'Prove', desc: 'Link to Audit module for evidence collection, compliance reports, and regulatory attestation.' },
      { title: 'Track Progress', desc: 'Monitor layer readiness scores and control implementation percentage across all three layers.' },
    ],
    quickLinks: [
      { label: 'Command Center', path: '/govern/command-center' },
      { label: 'Compliance Center', path: '/govern/compliance' },
      { label: 'Audit & Evidence', path: '/govern/audit' },
    ],
  },
  goLive: {
    services: [
      { name: 'Bedrock Guardrails', required: true },
      { name: 'Verified Permissions (Cedar)', required: true },
      { name: 'AWS Config' },
      { name: 'Audit Manager' },
      { name: 'Security Hub' },
      { name: 'CloudTrail' },
    ],
    steps: [
      'Deploy Bedrock Guardrails for L1 Foundation content filtering and PII protection.',
      'Configure Cedar policies in Verified Permissions for agent authorization boundaries.',
      'Enable AWS Config conformance packs for continuous compliance monitoring.',
      'Map framework controls to Audit Manager assessments for evidence collection.',
      'Aggregate Security Hub findings for control gap detection.',
      'Centralize CloudTrail logs for audit trail and incident investigation.',
    ],
    docs: [
      { label: 'Bedrock Guardrails', url: 'https://docs.aws.amazon.com/bedrock/latest/userguide/guardrails.html' },
      { label: 'Verified Permissions', url: 'https://aws.amazon.com/verified-permissions/' },
      { label: 'AWS Audit Manager', url: 'https://aws.amazon.com/audit-manager/' },
    ],
  },
};

export const FLEET_GUIDE = {
  module: 'fleet',
  title: 'Fleet Overview',
  summary: 'Control plane for agent fleet posture, chains, risks, and emergency controls',
  howToUse: {
    steps: [
      { title: 'View Fleet Posture', desc: 'See 5-pillar control plane status, OWASP alignment, and emergency control readiness.' },
      { title: 'Analyze Agent Chains', desc: 'Visualize agent execution paths with tools, MCP servers, IAM roles, network flows, and risk metrics (cascade, blast radius, human gates).' },
      { title: 'Review Risk Heatmap', desc: 'Identify high-risk use cases across 5 dimensions with GO/NO GO decisions.' },
      { title: 'Monitor Guardrails', desc: 'Track real-time guardrail metrics: blocked content, PII detections, grounding checks.' },
    ],
    quickLinks: [
      { label: 'Agent Registry', path: '/govern/agents' },
      { label: 'Risk Dashboard', path: '/govern/risk' },
      { label: 'Guardrails', path: '/govern/guardrails' },
    ],
  },
  goLive: {
    services: [
      { name: 'Bedrock AgentCore', required: true },
      { name: 'CloudWatch' },
      { name: 'EventBridge' },
      { name: 'AWS Config' },
      { name: 'Systems Manager' },
    ],
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
};

export const SHADOW_AI_GUIDE = {
  module: 'shadow-ai',
  title: 'Shadow AI Detection',
  summary: 'Discover ungoverned AI assets and route them to the governed path',
  howToUse: {
    steps: [
      { title: 'Review Findings', desc: 'Check the detected shadow assets list — critical items need immediate attention.' },
      { title: 'Investigate', desc: 'Click an asset to see detection source, owner, and risk context.' },
      { title: 'Decide', desc: 'Onboard to bring under governance, or Block to prevent continued use.' },
      { title: 'Track Coverage', desc: 'Monitor the coverage bars — goal is 90%+ governed across all asset types.' },
    ],
    quickLinks: [
      { label: 'Agent Registry', path: '/govern/agents' },
      { label: 'Prompt Governance', path: '/govern/prompt-governance' },
      { label: 'Compliance Center', path: '/govern/compliance' },
    ],
  },
  goLive: {
    services: [
      { name: 'CloudTrail', required: true },
      { name: 'GuardDuty AI Protection', required: true },
      { name: 'EventBridge' },
      { name: 'AWS Config' },
      { name: 'Amazon Macie' },
      { name: 'VPC Flow Logs' },
      { name: 'Cost Explorer' },
    ],
    steps: [
      'Enable CloudTrail + Bedrock model-invocation logging across all accounts.',
      'Enable GuardDuty AI Protection for AI-specific threat detection.',
      'Add EventBridge rules that flag InvokeModel calls from principals not in the Agent Registry.',
      'Deploy AWS Config rules for untagged AI workloads.',
      'Enable Macie for sensitive-data and secret scanning.',
      'Route correlated findings into the control plane and diff against the registry.',
    ],
    docs: [
      { label: 'CloudTrail', url: 'https://docs.aws.amazon.com/awscloudtrail/' },
      { label: 'GuardDuty AI Protection', url: 'https://aws.amazon.com/guardduty/' },
      { label: 'Amazon Macie', url: 'https://aws.amazon.com/macie/' },
    ],
  },
};

export const AGENT_REGISTRY_GUIDE = {
  module: 'agent-registry',
  title: 'Agent Registry',
  summary: 'Inventory agents, review providers, and audit permissions across your AI fleet',
  howToUse: {
    steps: [
      { title: 'Inventory Agents', desc: 'Every deployed agent with its scope level, owner, business purpose, rate limits, and incident history. Click a row for the full Agent 360.' },
      { title: 'Review Providers', desc: 'See agent distribution across AWS, Azure, GCP, and SaaS platforms. Track governance status and costs by provider.' },
      { title: 'Audit Permissions', desc: 'Use the matrix to verify agent-to-tool and agent-to-agent (A2A) authorization, plus user-rights propagation.' },
      { title: 'Close Gaps', desc: 'Spot pending approvals, high-scope agents, and open incidents — then route shadow assets here to register them.' },
    ],
    quickLinks: [
      { label: 'Shadow AI Detection', path: '/govern/shadow-ai' },
      { label: 'Fleet Overview', path: '/govern/fleet' },
      { label: 'Compliance Center', path: '/govern/compliance' },
    ],
  },
  goLive: {
    services: [
      { name: 'Bedrock AgentCore Gateway', required: true },
      { name: 'AgentCore Identity', required: true },
      { name: 'Cedar / Verified Permissions' },
      { name: 'DynamoDB' },
      { name: 'EventBridge' },
    ],
    steps: [
      'Expose agents, tools, and MCP servers through AgentCore Gateway and tag each on deploy.',
      'Maintain the asset inventory in your control plane (e.g. DynamoDB), kept current via EventBridge as Gateway targets change.',
      'Ensure agent ids match the resource_id used by Secure\'s Cedar policies — the Policy column and matrices already read policiesApi live.',
      'Swap the mock AGENT_REGISTRY / TOOL_REGISTRY for your control-plane inventory backed by AgentCore Gateway target listings.',
    ],
    docs: [
      { label: 'Bedrock AgentCore', url: 'https://aws.amazon.com/bedrock/agentcore/' },
      { label: 'Verified Permissions (Cedar)', url: 'https://aws.amazon.com/verified-permissions/' },
    ],
  },
};

export const FINOPS_GUIDE = {
  module: 'finops',
  title: 'Cost & FinOps',
  summary: 'Drive budgets and spend analytics from real AWS cost data',
  howToUse: {
    steps: [
      { title: 'View Spend', desc: 'See total AI spend, daily trends, and per-model cost breakdown.' },
      { title: 'Analyze Unit Costs', desc: 'Understand cost per decision, per token, and per use case.' },
      { title: 'Find Savings', desc: 'Review optimization recommendations: model substitution, caching, batching.' },
      { title: 'Allocate & Budget', desc: 'Set budgets, track utilization, enable showback/chargeback by team.' },
    ],
    quickLinks: [
      { label: 'Model Management', path: '/govern/models' },
      { label: 'Fleet Overview', path: '/govern/fleet' },
      { label: 'Agent Registry', path: '/govern/agents' },
    ],
  },
  goLive: {
    services: [
      { name: 'AWS Cost Explorer API', required: true },
      { name: 'Cost Allocation Tags', required: true },
      { name: 'AWS Budgets' },
    ],
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
};

export const COMPLIANCE_GUIDE = {
  module: 'compliance',
  title: 'Compliance Center',
  summary: 'Pull control status and evidence from automated compliance services',
  howToUse: {
    steps: [
      { title: 'Select Frameworks', desc: 'Choose applicable frameworks: SR 26-2, OSFI E-23, NIST AI RMF, EU AI Act, ISO 42001.' },
      { title: 'Assess Controls', desc: 'Review control status across domains. Identify gaps and remediation priorities.' },
      { title: 'Collect Evidence', desc: 'Upload documentation, screenshots, and test results for each control.' },
      { title: 'Generate Reports', desc: 'Export compliance reports and evidence packages for auditors.' },
    ],
    quickLinks: [
      { label: 'Risk Management', path: '/govern/risk' },
      { label: 'Audit & Incidents', path: '/govern/audit' },
      { label: 'Model Management', path: '/govern/models' },
    ],
  },
  goLive: {
    services: [
      { name: 'AWS Audit Manager', required: true },
      { name: 'AWS Config', required: true },
      { name: 'Security Hub' },
    ],
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
};

export const MODELS_GUIDE = {
  module: 'models',
  title: 'Model Management',
  summary: 'Populate the model registry and evaluations from Bedrock + a metadata store',
  howToUse: {
    steps: [
      { title: 'Register', desc: 'Browse the model catalog with risk tiers, compliance status, and ownership in the Registry.' },
      { title: 'Evaluate', desc: 'Pick a model, then run the evaluation suite: Evaluations (LLM-as-judge), RAG Evaluation, and Explainability & Fairness — the selected model carries across all three.' },
      { title: 'Gate', desc: 'The Deployment Gate aggregates eval, safety, RAG, and fairness into a cleared / conditional / blocked verdict mapped to SageMaker ModelApprovalStatus.' },
      { title: 'Operate', desc: 'Track drift in Monitoring, attestations in Governance, and versions/sunset in Lifecycle. (Evaluating an agent? See Agentic Evals in Agent Registry.)' },
    ],
    quickLinks: [
      { label: 'Agent Registry', path: '/govern/agents' },
      { label: 'Compliance Center', path: '/govern/compliance' },
      { label: 'FinOps', path: '/govern/finops' },
    ],
  },
  goLive: {
    services: [
      { name: 'Bedrock ListFoundationModels', required: true },
      { name: 'Bedrock Model Evaluation', required: true },
      { name: 'Langfuse' },
      { name: 'Metadata DB' },
    ],
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
};

export const RISK_GUIDE = {
  module: 'risk',
  title: 'Risk Management',
  summary: 'Wire real-time risk signals, OWASP agentic risks, and policy enforcement to AWS services',
  howToUse: {
    steps: [
      { title: 'Review Dashboard', desc: 'See risk heatmap, OWASP Agentic AI threat coverage, and control effectiveness trends.' },
      { title: 'Real-Time Monitoring', desc: 'Monitor live risk signals with 5-tier alerts (CRITICAL to INFO), cascade scores, and blast radius metrics.' },
      { title: 'Third-Party Risk', desc: 'Track AI vendors (Anthropic, OpenAI, AWS Bedrock) with DDQ status, risk scores, and contract expiry.' },
      { title: 'Policy as Code', desc: 'Deploy OPA/Rego policies for tool permissions, MCP allowlists, data classification, and human oversight.' },
    ],
    quickLinks: [
      { label: 'Compliance Center', path: '/govern/compliance' },
      { label: 'AI Safety', path: '/govern/safety' },
      { label: 'Fleet Overview', path: '/govern/fleet' },
    ],
  },
  goLive: {
    services: [
      { name: 'CloudWatch Logs Insights', required: true },
      { name: 'CloudWatch Alarms', required: true },
      { name: 'Security Hub' },
      { name: 'EventBridge' },
      { name: 'DynamoDB' },
      { name: 'Bedrock Guardrails' },
      { name: 'OPA/Rego' },
    ],
    steps: [
      'Deploy CloudWatch custom metrics for agent risk scores (capability, autonomy, behavior, context) using PutMetricData.',
      'Create CloudWatch Alarms for the 5-tier alert thresholds (CRITICAL>=90, HIGH>=70, MEDIUM>=40, LOW>=10, INFO<10).',
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
};

export const AUDIT_GUIDE = {
  module: 'audit',
  title: 'Audit & Incidents',
  summary: 'Build the activity feed and evidence bundles from real audit events',
  howToUse: {
    steps: [
      { title: 'Review Audit Trail', desc: 'See all governance events: approvals, policy changes, model updates, access logs.' },
      { title: 'Investigate Incidents', desc: 'Drill into security incidents, policy violations, and anomalies.' },
      { title: 'Track Risk Trends', desc: 'Monitor 30-day risk trends across compliance, security, and operational domains.' },
      { title: 'Export Evidence', desc: 'Generate audit reports and incident timelines for regulatory review.' },
    ],
    quickLinks: [
      { label: 'Compliance Center', path: '/govern/compliance' },
      { label: 'Risk Management', path: '/govern/risk' },
      { label: 'AI Safety', path: '/govern/safety' },
    ],
  },
  goLive: {
    services: [
      { name: 'AWS CloudTrail', required: true },
      { name: 'Amazon EventBridge', required: true },
      { name: 'CloudWatch Logs' },
      { name: 'S3' },
      { name: 'Athena' },
    ],
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
};

export const DATA_GOVERNANCE_GUIDE = {
  module: 'data-governance',
  title: 'Data Governance Hub',
  summary: 'Aggregate the governance views from catalog, quality, and lineage services',
  howToUse: {
    steps: [
      { title: 'Assess Readiness', desc: 'Complete the 7-dimension AI Data Readiness assessment and maturity self-assessment.' },
      { title: 'Map Lineage', desc: 'Trace data from source systems through transformations to AI model consumption.' },
      { title: 'Verify Provenance', desc: 'Ensure cryptographic integrity verification and chain of custody for all AI-feeding datasets.' },
      { title: 'Assign Ownership', desc: 'Define domain stewards, data product SLAs, and cross-domain sharing agreements.' },
    ],
    quickLinks: [
      { label: 'Model Management', path: '/govern/models' },
      { label: 'Compliance Center', path: '/govern/compliance' },
      { label: 'Agent Registry', path: '/govern/agents' },
    ],
  },
  goLive: {
    services: [
      { name: 'AWS Glue Data Catalog', required: true },
      { name: 'Glue Data Quality', required: true },
      { name: 'Amazon DataZone' },
      { name: 'Amazon Macie' },
    ],
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
};

export const SAFETY_GUIDE = {
  module: 'safety',
  title: 'AI Safety',
  summary: 'Back the coverage rubric, frontier thresholds, safety cases, evals, and incident clocks with real capability-eval and attestation sources',
  howToUse: {
    steps: [
      { title: 'Assess', desc: 'Read the RAI Coverage Rubric across AWS\'s 8 Responsible-AI dimensions, then decompose exposure with MAESTRO threat modeling.' },
      { title: 'Prevent', desc: 'Gate deployment on the Frontier Capability Thresholds register — per-model CBRN/cyber/autonomy attestation (FMSF, RSP, Preparedness).' },
      { title: 'Assure', desc: 'Evidence safety with GSN/CAE Safety Cases and continuous Red-Team & Safety Evals (HarmBench, WMDP, AILuminate, Cybench).' },
      { title: 'Respond', desc: 'Manage incidents and near-misses with EU AI Act Article 73 reporting clocks (2/10/15-day).' },
    ],
    quickLinks: [
      { label: 'Risk Management', path: '/govern/risk' },
      { label: 'Compliance Center', path: '/govern/compliance' },
      { label: 'Model Management', path: '/govern/models' },
    ],
  },
  goLive: {
    services: [
      { name: 'Bedrock Model Evaluation', required: true },
      { name: 'Amazon A2I' },
      { name: 'S3 (evidence)' },
      { name: 'DynamoDB' },
      { name: 'EventBridge' },
      { name: 'Amazon SNS' },
    ],
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

export const A2A_GUIDE = {
  module: 'a2a',
  title: 'A2A Governance',
  summary: 'Enforce trust policies and communication protocols for agent-to-agent interactions',
  howToUse: {
    steps: [
      { title: 'Register Agents', desc: 'Add all agents to the trust network with type (orchestrator, supervisor, specialist, worker) and trust level.' },
      { title: 'Define Trust Policies', desc: 'Create policies specifying which agents can invoke which, allowed actions, data classifications, and rate limits.' },
      { title: 'Configure Protocols', desc: 'Set up message schemas, validation rules, and AWS service integrations (EventBridge, Step Functions, IAM).' },
      { title: 'Monitor A2A Traffic', desc: 'Review audit trail for all inter-agent communications. Identify denied requests and policy violations.' },
    ],
    quickLinks: [
      { label: 'Agent Registry', path: '/govern/agents' },
      { label: 'Human Oversight', path: '/govern/agents?tab=human-oversight' },
      { label: 'Fleet Overview', path: '/govern/fleet' },
    ],
  },
  goLive: {
    services: [
      { name: 'Amazon Bedrock Multi-Agent', required: true },
      { name: 'AWS Step Functions', required: true },
      { name: 'Amazon EventBridge' },
      { name: 'AWS IAM' },
      { name: 'Amazon SQS' },
      { name: 'API Gateway' },
    ],
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
};

export const HUMAN_OVERSIGHT_GUIDE = {
  module: 'human-oversight',
  title: 'Human Oversight (HITL)',
  summary: 'Wire human-in-the-loop gates to AWS approval and workflow services',
  howToUse: {
    steps: [
      { title: 'Define HITL Gates', desc: 'Create gates that pause agent execution when risk thresholds, data sensitivity, or compliance requirements trigger.' },
      { title: 'Configure Approvers', desc: 'Assign primary approvers and escalation paths. Set timeout actions (auto-deny, escalate, or auto-approve).' },
      { title: 'Integrate AWS Services', desc: 'Connect gates to Bedrock RETURN_CONTROL, A2I workflows, Step Functions callbacks, or SNS notifications.' },
      { title: 'Monitor & Audit', desc: 'Track approval queue, response times, and decision history. Export audit trails for compliance evidence.' },
    ],
    quickLinks: [
      { label: 'Agent Registry', path: '/govern/agents' },
      { label: 'Risk Management', path: '/govern/risk' },
      { label: 'A2A Governance', path: '/govern/agents?tab=a2a' },
    ],
  },
  goLive: {
    services: [
      { name: 'Amazon Bedrock Agents (RETURN_CONTROL)', required: true },
      { name: 'Amazon A2I', required: true },
      { name: 'AWS Step Functions' },
      { name: 'Amazon SNS' },
      { name: 'DynamoDB' },
    ],
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
};

export const MULTI_CLOUD_GUIDE = {
  module: 'multi-cloud',
  title: 'Multi-Cloud Agent Governance',
  summary: 'Connect and govern AI agents across AWS, Azure, and GCP from a unified control plane',
  howToUse: {
    steps: [
      { title: 'View Overview', desc: 'See all providers (AWS, Azure, GCP, SaaS) with agent counts, costs, and compliance status at a glance.' },
      { title: 'Compare Features', desc: 'Use the radar chart and matrix to compare guardrails, tracing, policy, and cost controls across providers.' },
      { title: 'Plan Migrations', desc: 'Review migration scenarios with complexity assessments, considerations, and benefits for consolidation.' },
      { title: 'Optimize Costs', desc: 'Identify consolidation savings, model optimization opportunities, and reserved capacity discounts.' },
    ],
    quickLinks: [
      { label: 'Agent Registry', path: '/govern/agents' },
      { label: 'Cost & FinOps', path: '/govern/finops' },
      { label: 'Policies', path: '/secure/policy' },
    ],
  },
  goLive: {
    services: [
      { name: 'AWS Bedrock', required: true },
      { name: 'Azure AI Foundry' },
      { name: 'Google Vertex AI' },
      { name: 'AWS Secrets Manager' },
      { name: 'Lambda' },
      { name: 'EventBridge' },
    ],
    steps: [
      'Store Azure and GCP credentials securely in AWS Secrets Manager with rotation policies.',
      'Deploy Lambda functions to query Azure AI Agent Service and Vertex AI Agent Builder APIs.',
      'Create EventBridge scheduled rules to periodically sync agent inventories from all providers.',
      'Normalize agent metadata into a common schema stored in DynamoDB for unified queries.',
      'Implement cross-cloud guardrail mapping: Bedrock Guardrails <-> Content Safety <-> Responsible AI Toolkit.',
      'Set up CloudWatch dashboards aggregating metrics from all three providers.',
      'Configure SNS alerts for cross-cloud policy violations or agent drift detection.',
    ],
    docs: [
      { label: 'Azure AI Agent Service', url: 'https://learn.microsoft.com/en-us/azure/ai-services/agents/' },
      { label: 'Vertex AI Agent Builder', url: 'https://cloud.google.com/products/agent-builder' },
      { label: 'AWS Secrets Manager', url: 'https://docs.aws.amazon.com/secretsmanager/latest/userguide/intro.html' },
    ],
  },
};

export const DATA_MATURITY_GUIDE = {
  module: 'data-maturity',
  title: 'Data Maturity',
  summary: 'Initial to Optimizing maturity model with AWS implementation guidance',
  howToUse: {
    steps: [
      { title: 'Self-Assess', desc: 'Complete the maturity questionnaire across 7 dimensions to identify your current level and gaps.' },
      { title: 'View Radar', desc: 'See your scores visualized in the radar chart to spot weak areas versus target state.' },
      { title: 'Follow Roadmap', desc: 'Use the phased roadmap with tasks, owners, and timelines to progress from Initial to Optimizing.' },
      { title: 'Assign RACI', desc: 'Define Responsible, Accountable, Consulted, Informed roles for each governance activity.' },
    ],
    quickLinks: [
      { label: 'Data Governance Hub', path: '/govern/data' },
      { label: 'Data Quality', path: '/govern/data/quality' },
      { label: 'Compliance Center', path: '/govern/compliance' },
    ],
  },
  goLive: {
    services: [
      { name: 'AWS Glue Data Catalog', required: true },
      { name: 'Glue Data Quality', required: true },
      { name: 'Amazon DataZone' },
      { name: 'DynamoDB' },
    ],
    steps: [
      'Store maturity assessment results and historical scores in DynamoDB for trend tracking.',
      'Integrate Glue Data Catalog metrics (tables, schemas, freshness) to auto-populate dimension scores.',
      'Pull Glue Data Quality rule pass rates to feed the Quality dimension automatically.',
      'Use DataZone governance metrics (domain ownership, glossary coverage) for Stewardship dimension.',
      'Replace mock MATURITY_QUESTIONS scoring with aggregated service metrics where applicable.',
    ],
    docs: [
      { label: 'AWS Glue Data Catalog', url: 'https://docs.aws.amazon.com/glue/latest/dg/catalog-and-crawler.html' },
      { label: 'Amazon DataZone', url: 'https://aws.amazon.com/datazone/' },
    ],
  },
};

export const DATA_METADATA_GUIDE = {
  module: 'data-metadata',
  title: 'Metadata Management',
  summary: 'RAG metadata schemas for knowledge base ingestion with extraction statistics',
  howToUse: {
    steps: [
      { title: 'Browse Schemas', desc: 'Review cataloged metadata schemas with attributes, types, and filter configurations.' },
      { title: 'Check Coverage', desc: 'Monitor extraction coverage and identify documents missing required metadata.' },
      { title: 'Use Filters', desc: 'Apply pre-built RAG filters in your Bedrock Knowledge Base queries for targeted retrieval.' },
      { title: 'Track Extractions', desc: 'Review recent extractions with confidence scores and attribute counts.' },
    ],
    quickLinks: [
      { label: 'Data Governance Hub', path: '/govern/data' },
      { label: 'Data Lineage', path: '/govern/data/lineage' },
      { label: 'Model Management', path: '/govern/models' },
    ],
  },
  goLive: {
    services: [
      { name: 'Amazon Bedrock Knowledge Bases', required: true },
      { name: 'Amazon S3', required: true },
      { name: 'AWS Glue Data Catalog' },
      { name: 'Amazon Comprehend' },
    ],
    steps: [
      'Configure Bedrock Knowledge Base with metadata extraction enabled during ingestion.',
      'Define metadata schemas in the Knowledge Base data source configuration.',
      'Use Amazon Comprehend for automated entity and attribute extraction from documents.',
      'Store schema definitions in Glue Data Catalog for centralized governance.',
      'Replace mock METADATA_SCHEMAS with Knowledge Base listDataSources and getDataSource APIs.',
      'Pull METADATA_EXTRACTION_STATS from Knowledge Base ingestion job metrics.',
    ],
    docs: [
      { label: 'Bedrock Knowledge Bases', url: 'https://docs.aws.amazon.com/bedrock/latest/userguide/knowledge-base.html' },
      { label: 'KB Metadata Filtering', url: 'https://docs.aws.amazon.com/bedrock/latest/userguide/kb-test-config.html' },
    ],
  },
};

export const WORKFLOWS_GUIDE = {
  module: 'workflows',
  title: 'Service Approval Workflows',
  summary: 'Track approval runs for AI services with stage-gate governance',
  howToUse: {
    steps: [
      { title: 'View Runs', desc: 'Browse active and completed approval workflow runs with status and stage progress.' },
      { title: 'Check Stages', desc: 'Review each stage gate: requirements, approvers, evidence, and completion status.' },
      { title: 'Review Approvals', desc: 'Examine approval decisions, comments, and audit trail for compliance evidence.' },
      { title: 'Track Compliance', desc: 'Monitor workflow SLAs, bottlenecks, and compliance metrics across all runs.' },
    ],
    quickLinks: [
      { label: 'Compliance Center', path: '/govern/compliance' },
      { label: 'Agent Registry', path: '/govern/agents' },
      { label: 'Audit & Incidents', path: '/govern/audit' },
    ],
  },
  goLive: {
    services: [
      { name: 'AWS Step Functions', required: true },
      { name: 'Amazon EventBridge', required: true },
      { name: 'DynamoDB' },
      { name: 'Amazon SNS' },
      { name: 'AWS Lambda' },
    ],
    steps: [
      'Model approval workflows as Step Functions state machines with human approval tasks.',
      'Use EventBridge to trigger workflows on service registration or deployment requests.',
      'Store workflow state, approvals, and audit history in DynamoDB with TTL for retention.',
      'Configure SNS topics for approval notifications to stakeholders via email or Slack.',
      'Deploy Lambda functions for custom validation logic at each stage gate.',
      'Replace mock workflow runs with Step Functions execution history and DynamoDB records.',
    ],
    docs: [
      { label: 'Step Functions', url: 'https://docs.aws.amazon.com/step-functions/latest/dg/welcome.html' },
      { label: 'EventBridge', url: 'https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-what-is.html' },
      { label: 'Step Functions Human Approval', url: 'https://docs.aws.amazon.com/step-functions/latest/dg/tutorial-human-approval.html' },
    ],
  },
};

export const PLAYBOOK_GUIDE = {
  module: 'playbook',
  title: 'Agentic Governance Playbook',
  summary: 'Step-by-step governance patterns for human oversight, A2A trust, and fleet management',
  howToUse: {
    steps: [
      { title: 'Review HITL Patterns', desc: 'Explore human-in-the-loop gate designs, approval workflows, and escalation paths for agent decisions.' },
      { title: 'Configure A2A Trust', desc: 'Define agent-to-agent trust policies, communication protocols, and data classification boundaries.' },
      { title: 'Set Fleet Policies', desc: 'Establish autonomy levels, guardrail requirements, and circuit breaker thresholds for your agent fleet.' },
      { title: 'Monitor Compliance', desc: 'Track policy enforcement, approval SLAs, and audit trails across all governance controls.' },
    ],
    quickLinks: [
      { label: 'Human Oversight', path: '/govern/agents?tab=human-oversight' },
      { label: 'A2A Governance', path: '/govern/agents?tab=a2a' },
      { label: 'Fleet Overview', path: '/govern/fleet' },
      { label: 'Risk Management', path: '/govern/risk' },
    ],
  },
  goLive: {
    services: [
      { name: 'Step Functions', required: true },
      { name: 'EventBridge', required: true },
      { name: 'SNS' },
      { name: 'DynamoDB' },
      { name: 'Bedrock Agents (RETURN_CONTROL)' },
      { name: 'Amazon A2I' },
    ],
    steps: [
      'Deploy Step Functions state machines for approval workflows with wait-for-callback patterns.',
      'Configure EventBridge rules for agent-to-agent communication and policy enforcement events.',
      'Set up SNS topics for approval notifications across email, Slack, and PagerDuty channels.',
      'Store policy definitions, approval records, and audit trails in DynamoDB with TTL for retention.',
      'Configure Bedrock Agents with RETURN_CONTROL for high-risk decisions requiring human confirmation.',
      'Deploy A2I workflows for structured human review tasks with custom worker templates.',
    ],
    docs: [
      { label: 'Step Functions Callbacks', url: 'https://docs.aws.amazon.com/step-functions/latest/dg/connect-to-resource.html#connect-wait-token' },
      { label: 'EventBridge Schema Registry', url: 'https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-schema.html' },
      { label: 'Bedrock RETURN_CONTROL', url: 'https://docs.aws.amazon.com/bedrock/latest/userguide/agents-returncontrol.html' },
      { label: 'Amazon A2I', url: 'https://aws.amazon.com/augmented-ai/' },
    ],
  },
};

export const DEV_TOOLS_GUIDE = {
  module: 'dev-tools',
  title: 'Developer AI Governance',
  summary: 'Govern agentic coding tools like Claude Code, Cursor, Copilot across your organization',
  howToUse: {
    steps: [
      { title: 'Inventory Tools', desc: 'Discover all coding assistants in use — Claude Code, Kiro, Copilot, Cursor, Q Developer. Check sanctioned vs shadow usage.' },
      { title: 'Set Policies', desc: 'Ensure tools route through governed APIs (Bedrock, Azure OpenAI). Direct API calls bypass guardrails and audit logging.' },
      { title: 'Monitor Usage', desc: 'Exclude sensitive repos from AI context. Enable PII masking and secrets filtering to protect proprietary code.' },
      { title: 'Track Compliance', desc: 'Block unsanctioned tools, require enterprise tiers, set usage quotas. Route Claude Code through Bedrock for full governance.' },
    ],
    quickLinks: [
      { label: 'Shadow AI Detection', path: '/govern/shadow-ai' },
      { label: 'Multi-Cloud Governance', path: '/govern/multi-cloud' },
      { label: 'Guardrails', path: '/secure/guardrails' },
    ],
  },
  goLive: {
    services: [
      { name: 'CloudTrail', required: true },
      { name: 'AWS Config', required: true },
      { name: 'IAM Identity Center', required: true },
      { name: 'Amazon Bedrock' },
      { name: 'Cost Explorer' },
    ],
    steps: [
      'Enable CloudTrail logging for all Bedrock and Q Developer API calls to capture developer AI usage.',
      'Deploy AWS Config rules to detect ungoverned AI tool usage and enforce routing policies.',
      'Configure IAM Identity Center for SSO into sanctioned coding tools (Kiro, Q Developer, Claude Code).',
      'Route Claude Code and compatible tools through Amazon Bedrock for guardrail enforcement.',
      'Set up Cost Explorer tags to track AI coding tool spend by team and project.',
      'Replace mock tool inventory with CloudTrail + Config query results for live shadow detection.',
    ],
    docs: [
      { label: 'Claude Code + Bedrock', url: 'https://docs.anthropic.com/en/docs/claude-code/bedrock' },
      { label: 'Amazon Q Developer', url: 'https://docs.aws.amazon.com/amazonq/latest/qdeveloper-ug/' },
      { label: 'IAM Identity Center', url: 'https://docs.aws.amazon.com/singlesignon/latest/userguide/' },
    ],
  },
};

export const COMMAND_CENTER_GUIDE = {
  module: 'command-center',
  title: 'Command Center',
  summary: 'Executive AI GRC dashboard with real-time trust scores and compliance posture',
  howToUse: {
    steps: [
      { title: 'Health Zone', desc: 'Live AWS tiles showing system health, model availability, guardrail status, and fleet uptime across your AI estate.' },
      { title: 'Risk Zone', desc: 'Security findings from Security Hub, compliance posture from AWS Config, and active incidents requiring attention.' },
      { title: 'Operations Zone', desc: 'Fleet status, agent activity metrics, deployment pipelines, and operational KPIs from your control plane.' },
      { title: 'Cost Zone', desc: 'FinOps dashboard with spend trends, budget utilization, cost anomalies, and optimization recommendations.' },
    ],
    quickLinks: [
      { label: 'Fleet Overview', path: '/govern/fleet' },
      { label: 'Risk Management', path: '/govern/risk' },
      { label: 'Cost & FinOps', path: '/govern/finops' },
      { label: 'Compliance Center', path: '/govern/compliance' },
    ],
  },
  goLive: {
    services: [
      { name: 'CloudWatch', required: true },
      { name: 'Cost Explorer', required: true },
      { name: 'Security Hub', required: true },
      { name: 'AWS Config', required: true },
      { name: 'Amazon Bedrock' },
    ],
    steps: [
      'Configure CloudWatch dashboards and alarms for real-time health metrics and fleet status monitoring.',
      'Enable Cost Explorer API access and set up cost allocation tags for AI workloads by team and model.',
      'Aggregate Security Hub findings for the Risk Zone with custom severity mappings.',
      'Deploy AWS Config conformance packs to power the compliance posture indicators.',
      'Enable Bedrock model invocation logging for usage analytics and availability tracking.',
      'Replace mock dashboard tiles with CloudWatch metrics, Cost Explorer data, and Security Hub findings.',
    ],
    docs: [
      { label: 'CloudWatch Dashboards', url: 'https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch_Dashboards.html' },
      { label: 'Cost Explorer API', url: 'https://docs.aws.amazon.com/aws-cost-management/latest/APIReference/' },
      { label: 'Security Hub', url: 'https://docs.aws.amazon.com/securityhub/latest/userguide/what-is-securityhub.html' },
      { label: 'AWS Config', url: 'https://docs.aws.amazon.com/config/latest/developerguide/WhatIsConfig.html' },
      { label: 'Bedrock Logging', url: 'https://docs.aws.amazon.com/bedrock/latest/userguide/model-invocation-logging.html' },
    ],
  },
};

export const AGENT_EVAL_GUIDE = {
  module: 'agent-eval',
  title: 'Agentic Evaluation',
  summary: 'Evaluate agent behavior with AgentCore evaluators across session, trace, and tool scopes',
  howToUse: {
    steps: [
      { title: 'Choose Evaluators', desc: 'Select from session-level (goal success), trace-level (response quality), and tool-level (selection accuracy) evaluators.' },
      { title: 'Run on Runtime', desc: 'Execute evaluations against deployed AgentCore runtimes using on-demand, online, or batch modes.' },
      { title: 'Inspect Scenarios', desc: 'Drill into per-scenario results with trajectory visualization, assertions, and judge reasoning.' },
      { title: 'Track Drift', desc: 'Compare against locked baselines to detect regressions and trigger quality-monitor alerts.' },
    ],
    quickLinks: [
      { label: 'Agent Registry', path: '/govern/agents' },
      { label: 'Model Evaluations', path: '/govern/models?tab=evaluations' },
      { label: 'Fleet Overview', path: '/govern/fleet' },
    ],
  },
  goLive: {
    services: [
      { name: 'Bedrock AgentCore', required: true },
      { name: 'CloudWatch', required: true },
      { name: 'OpenTelemetry' },
    ],
    steps: [
      'Deploy agents to Bedrock AgentCore with OpenTelemetry/OpenInference tracing enabled.',
      'Configure CloudWatch Logs as the trace destination for AgentCore evaluations.',
      'Run AgentCore Evaluate API jobs with your evaluator set and test scenarios.',
      'Store baseline evaluation results and configure drift thresholds for regression detection.',
      'Replace mock AGENT_EVAL_JOBS with AgentCore evaluation job results and CloudWatch trace queries.',
    ],
    docs: [
      { label: 'AgentCore Evaluations', url: 'https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/evaluations.html' },
      { label: 'OpenTelemetry Tracing', url: 'https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/tracing.html' },
    ],
  },
};
