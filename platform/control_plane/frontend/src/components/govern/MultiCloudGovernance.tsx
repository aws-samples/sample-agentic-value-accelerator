/**
 * MultiCloudGovernance — Comprehensive multi-provider governance hub
 *
 * Provides unified governance across AWS, Azure, GCP, and SaaS platforms:
 * - Dashboard: Fleet risk overview, KPIs, emergency controls, posture
 * - Inventory: Unified agent list with filtering by provider/status
 * - Providers: Cloud and SaaS provider cards with connectors and setup
 * - Analytics: Cost trends, performance metrics, migration planning
 * - Policies: Cross-provider policy enforcement and compliance
 */

import { useState, useMemo, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, Legend, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  AreaChart, Area,
} from 'recharts';
import type { Formatter, ValueType, NameType } from 'recharts/types/component/DefaultTooltipContent';
import {
  ALL_AGENTS,
  AGENT_PROVIDER_CONFIG,
  TOOL_REGISTRY,
  MCP_SERVER_REGISTRY,
  type AgentProvider,
  type AgentRegistryEntry,
  tooltipStyle,
} from './mockData';
import UnifiedGuide, { MULTI_CLOUD_GUIDE } from './UnifiedGuide';
import GovernPageLayout from './GovernPageLayout';
import { MockDataBadge, LiveDataBadge } from './DataSourceIndicator';
import {
  governCostApi,
  multicloudApi,
  type AwsProviderConnectorsResponse,
  type MultiCloudConnectorsResponse,
  type MultiCloudConnectorStatus,
  type MultiCloudAllCosts,
  type MultiCloudAllAgents,
} from '../../api/client';
import { Icon, type IconName } from './icons';
import { rowButtonProps } from './a11y';
import { useAgentRegistry } from './useAgentRegistry';
import { useAwsConnected } from './useAwsConnected';
import { connectivityState } from './providerConnectivity';

type ViewTab = 'dashboard' | 'inventory' | 'registry' | 'providers' | 'analytics' | 'policies';
type RegistrySubTab = 'tools' | 'mcp' | 'permissions' | 'human-oversight' | 'a2a';
type AnalyticsSubTab = 'cost' | 'performance' | 'migration';

const TABS: { id: ViewTab; label: string; icon: IconName }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: 'squares-2x2' },
  { id: 'inventory', label: 'Inventory', icon: 'rectangle-stack' },
  { id: 'registry', label: 'Registry', icon: 'clipboard-list' },
  { id: 'providers', label: 'Providers', icon: 'cloud' },
  { id: 'analytics', label: 'Analytics', icon: 'chart-bar' },
  { id: 'policies', label: 'Policies', icon: 'shield-check' },
];

const REGISTRY_SUB_TABS: { id: RegistrySubTab; label: string }[] = [
  { id: 'tools', label: 'Tools' },
  { id: 'mcp', label: 'MCP Servers' },
  { id: 'permissions', label: 'Permissions' },
  { id: 'human-oversight', label: 'Human Oversight' },
  { id: 'a2a', label: 'A2A' },
];

const ANALYTICS_SUB_TABS: { id: AnalyticsSubTab; label: string }[] = [
  { id: 'cost', label: 'Cost Trends' },
  { id: 'performance', label: 'Performance' },
  { id: 'migration', label: 'Migration Planning' },
];

const PROVIDER_FEATURES = {
  aws: {
    name: 'AWS Bedrock',
    fullName: 'Amazon Bedrock + AgentCore',
    color: '#FF9900',
    description: 'Enterprise AI with Bedrock Guardrails, Cedar policies, and AgentCore orchestration.',
    features: {
      guardrails: { score: 95, label: 'Bedrock Guardrails', detail: 'Content filters, topic denial, word blocking, PII redaction' },
      tracing: { score: 90, label: 'CloudWatch + X-Ray', detail: 'Distributed tracing, custom metrics, log insights' },
      memory: { score: 85, label: 'Session Memory', detail: 'DynamoDB-backed conversation state' },
      tools: { score: 90, label: 'Action Groups + MCP', detail: 'Native tools, MCP server ecosystem' },
      policy: { score: 95, label: 'Cedar + AVP', detail: 'Fine-grained authorization with Verified Permissions' },
      monitoring: { score: 95, label: 'CloudWatch', detail: 'Real-time metrics, alarms, dashboards' },
      costControl: { score: 90, label: 'Quotas + Budgets', detail: 'Service quotas, budget alerts, cost allocation' },
      compliance: { score: 95, label: 'Artifact + Config', detail: 'Compliance reports, configuration rules' },
    },
    connectorStatus: 'connected',
    models: ['Claude 3.5 Sonnet', 'Claude 3 Opus', 'Claude 3 Haiku', 'Amazon Nova Pro', 'Amazon Nova Lite'],
  },
  azure: {
    name: 'Azure AI Foundry',
    fullName: 'Azure OpenAI + AI Foundry',
    color: '#0078D4',
    description: 'Microsoft AI services with Azure Content Safety and enterprise integration.',
    features: {
      guardrails: { score: 85, label: 'Content Safety', detail: 'Hate speech, violence, self-harm detection' },
      tracing: { score: 80, label: 'App Insights', detail: 'Application performance monitoring' },
      memory: { score: 75, label: 'Cosmos DB', detail: 'NoSQL state management' },
      tools: { score: 80, label: 'Function Calling', detail: 'Azure Functions integration' },
      policy: { score: 75, label: 'Azure Policy', detail: 'Subscription-level governance' },
      monitoring: { score: 85, label: 'Azure Monitor', detail: 'Metrics, logs, workbooks' },
      costControl: { score: 85, label: 'Cost Management', detail: 'Budgets, recommendations' },
      compliance: { score: 90, label: 'Compliance Manager', detail: 'Regulatory compliance assessments' },
    },
    connectorStatus: 'connected',
    models: ['GPT-4o', 'GPT-4 Turbo', 'GPT-3.5 Turbo'],
  },
  gcp: {
    name: 'Google Vertex AI',
    fullName: 'Vertex AI + Gemini',
    color: '#4285F4',
    description: 'Google Cloud AI platform with Gemini models and enterprise tooling.',
    features: {
      guardrails: { score: 80, label: 'Safety Filters', detail: 'Built-in safety settings' },
      tracing: { score: 85, label: 'Cloud Trace', detail: 'Distributed request tracing' },
      memory: { score: 70, label: 'Firestore', detail: 'Document-based state' },
      tools: { score: 85, label: 'Extensions + Tools', detail: 'Vertex AI Extensions' },
      policy: { score: 70, label: 'IAM Conditions', detail: 'Context-aware access' },
      monitoring: { score: 90, label: 'Cloud Monitoring', detail: 'Metrics, uptime, alerting' },
      costControl: { score: 80, label: 'Budgets API', detail: 'Budget alerts, exports' },
      compliance: { score: 85, label: 'Security Command', detail: 'Security posture management' },
    },
    connectorStatus: 'configured',
    models: ['Gemini 1.5 Pro', 'Gemini 1.5 Flash', 'Gemini 1.0 Pro'],
  },
  servicenow: {
    name: 'ServiceNow',
    fullName: 'ServiceNow Now Assist',
    color: '#81B53A',
    description: 'ITSM-integrated AI agents for service management workflows.',
    features: {
      guardrails: { score: 70, label: 'Content Policy', detail: 'Platform content filtering' },
      tracing: { score: 65, label: 'Event Management', detail: 'ServiceNow events' },
      memory: { score: 80, label: 'CMDB', detail: 'Configuration management database' },
      tools: { score: 85, label: 'Flow Designer', detail: 'Visual workflow automation' },
      policy: { score: 70, label: 'ACLs', detail: 'Table and field-level access' },
      monitoring: { score: 75, label: 'Performance Analytics', detail: 'Dashboards, KPIs' },
      costControl: { score: 60, label: 'License Management', detail: 'Subscription tracking' },
      compliance: { score: 80, label: 'GRC Module', detail: 'Governance risk compliance' },
    },
    connectorStatus: 'connected',
    models: ['Now Assist LLM', 'ServiceNow AI'],
  },
  salesforce: {
    name: 'Salesforce',
    fullName: 'Salesforce Einstein + Agentforce',
    color: '#00A1E0',
    description: 'CRM-native AI agents with Einstein Trust Layer protection.',
    features: {
      guardrails: { score: 75, label: 'Einstein Trust Layer', detail: 'Data masking, toxicity filtering' },
      tracing: { score: 70, label: 'Event Monitoring', detail: 'Shield event monitoring' },
      memory: { score: 85, label: 'Data Cloud', detail: 'Customer 360 state' },
      tools: { score: 80, label: 'Apex + Flows', detail: 'Custom code and flows' },
      policy: { score: 75, label: 'Permission Sets', detail: 'Profile-based access' },
      monitoring: { score: 70, label: 'App Analytics', detail: 'Usage dashboards' },
      costControl: { score: 65, label: 'License Tracking', detail: 'User and feature licenses' },
      compliance: { score: 80, label: 'Shield', detail: 'Encryption, audit trail' },
    },
    connectorStatus: 'connected',
    models: ['Einstein GPT', 'Agentforce'],
  },
  copilot_studio: {
    name: 'Copilot Studio',
    fullName: 'Microsoft Copilot Studio',
    color: '#5C2D91',
    description: 'Low-code AI agent builder with Microsoft 365 integration.',
    features: {
      guardrails: { score: 70, label: 'Content Moderation', detail: 'Azure AI content safety' },
      tracing: { score: 60, label: 'Analytics', detail: 'Built-in analytics dashboard' },
      memory: { score: 65, label: 'Dataverse', detail: 'Power Platform state' },
      tools: { score: 75, label: 'Power Automate', detail: 'Flow-based actions' },
      policy: { score: 65, label: 'DLP Policies', detail: 'Data loss prevention' },
      monitoring: { score: 65, label: 'Power Platform Admin', detail: 'Admin center monitoring' },
      costControl: { score: 70, label: 'Capacity', detail: 'Message capacity tracking' },
      compliance: { score: 75, label: 'Microsoft Purview', detail: 'Data governance' },
    },
    connectorStatus: 'pending',
    models: ['GPT-4o via Azure', 'Custom models'],
  },
};

const FEATURE_LABELS: Record<string, string> = {
  guardrails: 'Guardrails',
  tracing: 'Tracing',
  memory: 'Memory/State',
  tools: 'Tool Calling',
  policy: 'Policy Enforcement',
  monitoring: 'Monitoring',
  costControl: 'Cost Controls',
  compliance: 'Compliance',
};

const MIGRATION_SCENARIOS = [
  {
    id: 'azure-to-aws',
    from: 'azure',
    to: 'aws',
    title: 'Azure AI → AWS Bedrock',
    complexity: 'medium',
    effort: '4-6 weeks',
    agents: 2,
    estimatedSavings: 2400,
    riskReduction: 15,
    considerations: [
      'GPT-4o → Claude model mapping requires prompt tuning',
      'Azure Functions → Lambda for tool implementations',
      'Content Safety → Bedrock Guardrails migration',
      'App Insights → CloudWatch observability',
    ],
    benefits: [
      'Stronger guardrail controls with Cedar policies',
      'MCP server ecosystem for tool standardization',
      'Unified AWS security posture',
      'Better FSI compliance alignment',
    ],
    steps: [
      { phase: 'Assessment', duration: '1 week', tasks: ['Inventory agents', 'Map dependencies', 'Risk assessment'] },
      { phase: 'Design', duration: '1 week', tasks: ['Architecture review', 'Model selection', 'Guardrail mapping'] },
      { phase: 'Migration', duration: '2-3 weeks', tasks: ['Prompt conversion', 'Tool migration', 'Testing'] },
      { phase: 'Validation', duration: '1 week', tasks: ['Parallel run', 'Performance comparison', 'Cutover'] },
    ],
  },
  {
    id: 'gcp-to-aws',
    from: 'gcp',
    to: 'aws',
    title: 'Vertex AI → AWS Bedrock',
    complexity: 'medium',
    effort: '3-5 weeks',
    agents: 2,
    estimatedSavings: 1800,
    riskReduction: 12,
    considerations: [
      'Gemini → Claude model migration',
      'Dialogflow CX state → Bedrock session memory',
      'Cloud Functions → Lambda conversion',
      'BigQuery integrations may need redesign',
    ],
    benefits: [
      'Consolidated cloud governance',
      'Better FSI compliance tooling',
      'Unified agent identity with AgentCore',
      'Single pane of glass for observability',
    ],
    steps: [
      { phase: 'Assessment', duration: '1 week', tasks: ['Agent inventory', 'Integration mapping', 'Cost analysis'] },
      { phase: 'Design', duration: '1 week', tasks: ['Target architecture', 'Data migration plan'] },
      { phase: 'Migration', duration: '1-2 weeks', tasks: ['Agent rebuild', 'Integration testing'] },
      { phase: 'Validation', duration: '1 week', tasks: ['UAT', 'Performance tuning', 'Go-live'] },
    ],
  },
  {
    id: 'consolidate-saas',
    from: 'saas',
    to: 'aws',
    title: 'SaaS Agents → AWS Bedrock',
    complexity: 'high',
    effort: '6-10 weeks',
    agents: 7,
    estimatedSavings: 4200,
    riskReduction: 25,
    considerations: [
      'ServiceNow/Salesforce agents are tightly integrated with their platforms',
      'May need hybrid approach: keep SaaS agents but add governance layer',
      'Data residency and compliance requirements',
      'User training and change management',
    ],
    benefits: [
      'Full visibility and control',
      'Consistent guardrails across all agents',
      'Reduced vendor lock-in',
      'Centralized cost management',
    ],
    steps: [
      { phase: 'Discovery', duration: '2 weeks', tasks: ['Deep dive on integrations', 'Stakeholder interviews', 'Risk assessment'] },
      { phase: 'Architecture', duration: '2 weeks', tasks: ['Hybrid vs full migration decision', 'Governance layer design'] },
      { phase: 'Build', duration: '4-5 weeks', tasks: ['Agent development', 'Integration build', 'Guardrail config'] },
      { phase: 'Rollout', duration: '2 weeks', tasks: ['Phased deployment', 'User training', 'Support transition'] },
    ],
  },
];

// Cross-cloud deployment status (from AI Trust)
// All 6 migration paths (from AI Trust)
const MIGRATION_MATRIX = [
  { from: 'AWS', to: 'Azure', complexity: 'Medium', risk: 'Medium', effort: '3-4 weeks', guardrails: 'Remap Bedrock Guardrails → Azure AI Content Safety', models: 'Nova Pro → GPT-4o, Claude → Claude (via Azure)', tools: 'Lambda → Azure Functions, S3 → Blob Storage' },
  { from: 'AWS', to: 'GCP', complexity: 'Medium', risk: 'Medium', effort: '3-4 weeks', guardrails: 'Remap Bedrock Guardrails → Vertex AI Safety Filters', models: 'Nova Pro → Gemini 2.0, Claude → Claude (via Vertex)', tools: 'Lambda → Cloud Functions, S3 → GCS' },
  { from: 'Azure', to: 'AWS', complexity: 'Medium', risk: 'Low', effort: '2-3 weeks', guardrails: 'Remap Content Safety → Bedrock Guardrails', models: 'GPT-4o → Nova Pro/Claude, Phi-4 → Nova Lite', tools: 'Azure Functions → Lambda, Blob → S3' },
  { from: 'Azure', to: 'GCP', complexity: 'High', risk: 'High', effort: '4-6 weeks', guardrails: 'Remap Content Safety → Vertex Safety Filters', models: 'GPT-4o → Gemini 2.0, Phi-4 → Gemma 2', tools: 'Azure Functions → Cloud Functions, Cosmos → Firestore' },
  { from: 'GCP', to: 'AWS', complexity: 'Medium', risk: 'Low', effort: '2-3 weeks', guardrails: 'Remap Vertex Safety → Bedrock Guardrails', models: 'Gemini 2.0 → Nova Pro, Claude → Claude (native)', tools: 'Cloud Functions → Lambda, GCS → S3' },
  { from: 'GCP', to: 'Azure', complexity: 'High', risk: 'Medium', effort: '4-5 weeks', guardrails: 'Remap Vertex Safety → Azure Content Safety', models: 'Gemini 2.0 → GPT-4o, Gemma 2 → Phi-4', tools: 'Cloud Functions → Azure Functions, GCS → Blob' },
];

// Cost per invocation type (from AI Trust)
const COST_PER_INVOCATION = [
  { name: 'Simple Query', aws: 0.0012, azure: 0.0015, gcp: 0.0013 },
  { name: 'RAG Retrieval', aws: 0.0035, azure: 0.0042, gcp: 0.0038 },
  { name: 'Multi-Tool', aws: 0.0085, azure: 0.0098, gcp: 0.0091 },
  { name: 'Complex Chain', aws: 0.0150, azure: 0.0175, gcp: 0.0162 },
  { name: 'Code Generation', aws: 0.0120, azure: 0.0140, gcp: 0.0130 },
];

// Mock cost trend data
const COST_TREND_DATA = [
  { month: 'Jan', aws: 4200, azure: 2800, gcp: 1200, saas: 3500 },
  { month: 'Feb', aws: 4500, azure: 2900, gcp: 1300, saas: 3600 },
  { month: 'Mar', aws: 4800, azure: 2700, gcp: 1400, saas: 3700 },
  { month: 'Apr', aws: 5200, azure: 2600, gcp: 1350, saas: 3800 },
  { month: 'May', aws: 5800, azure: 2500, gcp: 1300, saas: 3900 },
  { month: 'Jun', aws: 6100, azure: 2400, gcp: 1250, saas: 4000 },
];

// Mock performance data
const PERFORMANCE_DATA = [
  { provider: 'AWS Bedrock', latency: 245, throughput: 12500, errorRate: 0.12, uptime: 99.98 },
  { provider: 'Azure AI', latency: 312, throughput: 9800, errorRate: 0.18, uptime: 99.95 },
  { provider: 'Vertex AI', latency: 289, throughput: 8200, errorRate: 0.15, uptime: 99.92 },
  { provider: 'ServiceNow', latency: 420, throughput: 5400, errorRate: 0.25, uptime: 99.85 },
  { provider: 'Salesforce', latency: 385, throughput: 6100, errorRate: 0.22, uptime: 99.88 },
  { provider: 'Copilot Studio', latency: 395, throughput: 4800, errorRate: 0.20, uptime: 99.90 },
];

function complexityColor(complexity: string): string {
  switch (complexity) {
    case 'low': return 'bg-emerald-100 text-emerald-700';
    case 'medium': return 'bg-amber-100 text-amber-700';
    case 'high': return 'bg-rose-100 text-rose-700';
    default: return 'bg-slate-100 text-slate-700';
  }
}

// Connector badge derives from live API data when available, falling back to
// the SHARED honest truth (providerConnectivity) for consistency with Inventory + cost cards.
function connectorStatusBadge(status: { connected: boolean; isLive: boolean; detail?: string }) {
  if (status.connected) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-semibold" title={status.detail}>
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Connected
        {status.isLive && <span className="ml-0.5 w-1 h-1 rounded-full bg-emerald-400 animate-pulse" />}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-semibold" title={status.detail}>
      <span className="w-1.5 h-1.5 rounded-full bg-slate-400" /> Not Connected
    </span>
  );
}

/**
 * Badge for one connector card in the Connector Configuration panel.
 *
 * `configured` only means the secret was read and the required fields are non-empty. It
 * does NOT mean the provider accepted them. Every one of these cards used to fall through
 * to an amber "Configured" whenever `configured && !connected`, so a connector the
 * provider had explicitly REJECTED was labelled with the opposite fact - and rejected is
 * exactly the case the amber branch is reached most often. `auth_state` carries the
 * measured verdict from the last token exchange, so read that before choosing the label.
 *
 * Rejected/incomplete are rose (a problem to fix now); unavailable is amber (transient,
 * retried automatically); a genuinely unmeasured `unknown` stays amber and says so rather
 * than claiming a verdict. `detail` is the backend's own honest sentence, so it becomes
 * the tooltip instead of being dropped.
 */
function multicloudConnectorBadge(conn: MultiCloudConnectorStatus | undefined) {
  const dot = (color: string) => <span className={`w-1.5 h-1.5 rounded-full ${color}`} />;
  const pill = (tone: string, dotColor: string, label: string, title?: string) => (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${tone}`}
      title={title}
    >
      {dot(dotColor)} {label}
    </span>
  );

  if (conn?.connected) {
    return pill('bg-emerald-100 text-emerald-700', 'bg-emerald-500', 'Connected', conn.detail);
  }

  if (conn?.configured) {
    // Treat a missing auth_state as 'unknown' - older backend builds omit the field.
    const authTitle = conn.auth_detail ? `${conn.detail} (${conn.auth_detail})` : conn.detail;
    switch (conn.auth_state ?? 'unknown') {
      case 'rejected':
        return pill('bg-rose-100 text-rose-700', 'bg-rose-500', 'Credentials rejected', authTitle);
      case 'incomplete':
        return pill('bg-rose-100 text-rose-700', 'bg-rose-500', 'Credentials incomplete', authTitle);
      case 'unavailable':
        return pill('bg-amber-100 text-amber-700', 'bg-amber-500', 'Provider unreachable', authTitle);
      default:
        return pill('bg-amber-100 text-amber-700', 'bg-amber-500', 'Configured, not verified', authTitle);
    }
  }

  return pill('bg-slate-100 text-slate-600', 'bg-slate-400', 'Not Connected', conn?.detail);
}

type ConfigureProvider = 'azure' | 'gcp' | 'servicenow' | 'salesforce' | 'copilot_studio' | null;

export default function MultiCloudGovernance() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = (searchParams.get('tab') as ViewTab) || 'dashboard';
  const [analyticsSubTab, setAnalyticsSubTab] = useState<AnalyticsSubTab>('cost');
  const [registrySubTab, setRegistrySubTab] = useState<RegistrySubTab>('tools');
  const [selectedMigration, setSelectedMigration] = useState<string | null>(null);
  const [inventoryFilter, setInventoryFilter] = useState<string>('all');
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  // 'warning' is for an outcome that succeeded but is not what the operator asked for -
  // today, a connector stored with a URL we could not reach. It renders in amber and does
  // not auto-dismiss, because the whole point is that it gets read.
  const [toastVariant, setToastVariant] = useState<'success' | 'warning'>('success');

  // Configuration modal state
  const [configureModal, setConfigureModal] = useState<ConfigureProvider>(null);
  const [configSaving, setConfigSaving] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);
  const [testingConnection, setTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; latency_ms?: number } | null>(null);

  // Form state for each provider
  const [azureForm, setAzureForm] = useState({ tenant_id: '', client_id: '', client_secret: '', subscription_id: '' });
  const [gcpForm, setGcpForm] = useState({ project_id: '', service_account_json: '', billing_export_table: '', location: 'us-central1' });
  const [servicenowForm, setServicenowForm] = useState({ instance_url: '', client_id: '', client_secret: '', monthly_license_cost: 0 });
  const [salesforceForm, setSalesforceForm] = useState({ client_id: '', client_secret: '', login_url: 'https://login.salesforce.com', monthly_license_cost: 0 });
  const [copilotForm, setCopilotForm] = useState({ tenant_id: '', client_id: '', client_secret: '', environment_id: '', monthly_capacity_cost: 0 });

  // Live provider connector data from governCostApi
  const [providerConnectorsData, setProviderConnectorsData] = useState<AwsProviderConnectorsResponse | null>(null);
  // Multi-cloud connector status, costs, and agents from multicloudApi
  const [multicloudStatus, setMulticloudStatus] = useState<MultiCloudConnectorsResponse | null>(null);
  const [multicloudCosts, setMulticloudCosts] = useState<MultiCloudAllCosts | null>(null);
  const [multicloudAgents, setMulticloudAgents] = useState<MultiCloudAllAgents | null>(null);

  const refreshConnectorData = () => {
    multicloudApi.status().then(setMulticloudStatus).catch(() => setMulticloudStatus(null));
    multicloudApi.allCosts(30).then(setMulticloudCosts).catch(() => setMulticloudCosts(null));
    multicloudApi.allAgents().then(setMulticloudAgents).catch(() => setMulticloudAgents(null));
  };

  useEffect(() => {
    let cancelled = false;
    governCostApi.providerConnectors()
      .then(d => { if (!cancelled) setProviderConnectorsData(d); })
      .catch(() => { if (!cancelled) setProviderConnectorsData(null); });
    // Fetch multi-cloud connector status, costs, agents in parallel
    multicloudApi.status()
      .then(d => { if (!cancelled) setMulticloudStatus(d); })
      .catch(() => { if (!cancelled) setMulticloudStatus(null); });
    multicloudApi.allCosts(30)
      .then(d => { if (!cancelled) setMulticloudCosts(d); })
      .catch(() => { if (!cancelled) setMulticloudCosts(null); });
    multicloudApi.allAgents()
      .then(d => { if (!cancelled) setMulticloudAgents(d); })
      .catch(() => { if (!cancelled) setMulticloudAgents(null); });
    return () => { cancelled = true; };
  }, []);

  const setActiveTab = (tab: ViewTab) => {
    setSearchParams({ tab });
  };

  // Save connector configuration
  const handleSaveConfig = async () => {
    setConfigSaving(true);
    setConfigError(null);
    // A plain local, not state: the `finally` below decides whether to schedule the
    // dismiss, and a setTimeout closure reading `toastVariant` would read the value from
    // before this render.
    let autoDismiss = true;
    try {
      let result;
      switch (configureModal) {
        case 'azure':
          result = await multicloudApi.configureAzure(azureForm);
          break;
        case 'gcp':
          result = await multicloudApi.configureGcp(gcpForm);
          break;
        case 'servicenow':
          result = await multicloudApi.configureServicenow(servicenowForm);
          break;
        case 'salesforce':
          result = await multicloudApi.configureSalesforce(salesforceForm);
          break;
        case 'copilot_studio':
          result = await multicloudApi.configureCopilotStudio(copilotForm);
          break;
      }
      if (result?.success) {
        // The backend distinguishes "stored and the URL checks out" from "stored, and we
        // could not check the URL", and says which in `message`. This used to hardcode
        // "configured successfully" for both, so an unverified write was reported in the
        // verified write's words - the same defect as a derived number under a live badge.
        // `success` only means the write landed: a write that did not land is a 500, so it
        // is always true here and cannot carry the distinction.
        const unverified = result.url_verified === false;
        setToast(result.message || `${configureModal} connector configured successfully`);
        // An unverified write does not auto-dismiss. A 3.5s toast is the right weight for
        // "done" and the wrong weight for "we stored something we could not reach"; that
        // one has to wait to be read.
        setToastVariant(unverified ? 'warning' : 'success');
        autoDismiss = !unverified;
        setConfigureModal(null);
        refreshConnectorData();
      } else {
        // Unreachable against the current backend, which raises a 500 rather than
        // returning success=false. Kept as defence rather than relied on.
        setConfigError(result?.message || 'Configuration failed');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to save configuration';
      setConfigError(message);
    } finally {
      setConfigSaving(false);
      if (autoDismiss) setTimeout(() => setToast(null), 3500);
    }
  };

  // Delete connector configuration
  const handleDeleteConfig = async (provider: ConfigureProvider) => {
    if (!provider || !confirm(`Are you sure you want to delete the ${provider} connector configuration?`)) return;
    try {
      let result;
      switch (provider) {
        case 'azure': result = await multicloudApi.deleteAzure(); break;
        case 'gcp': result = await multicloudApi.deleteGcp(); break;
        case 'servicenow': result = await multicloudApi.deleteServicenow(); break;
        case 'salesforce': result = await multicloudApi.deleteSalesforce(); break;
        case 'copilot_studio': result = await multicloudApi.deleteCopilotStudio(); break;
      }
      if (result?.success) {
        setToast(`${provider} connector removed`);
        refreshConnectorData();
      }
    } catch {
      setToast(`Failed to delete ${provider} configuration`);
    }
    setTimeout(() => setToast(null), 3500);
  };

  // Test connection
  const handleTestConnection = async () => {
    if (!configureModal) return;
    setTestingConnection(true);
    setTestResult(null);
    try {
      const result = await multicloudApi.testConnection(configureModal);
      setTestResult({ success: result.success, message: result.message, latency_ms: result.latency_ms });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Test failed';
      setTestResult({ success: false, message });
    } finally {
      setTestingConnection(false);
    }
  };

  // AWS connector is "connected" when the account is reachable (live AWS APIs),
  // NOT only when agents are deployed — a linked account with cost/models/security
  // data is connected even before its first deployment. Registry-live is an
  // additional positive signal.
  const { source: registrySource } = useAgentRegistry();
  const { awsConnected } = useAwsConnected();
  const awsLive = awsConnected || registrySource !== 'demo';

  // Helper to get connector status from live data or fallback to local logic
  const getConnectorStatus = (provider: AgentProvider): { connected: boolean; isLive: boolean; detail?: string } => {
    // Check multicloud status for azure/gcp first (dedicated connectors)
    if ((provider === 'azure' || provider === 'gcp') && multicloudStatus?.connectors) {
      const connector = multicloudStatus.connectors.find(c => c.provider.toLowerCase() === provider.toLowerCase());
      if (connector) {
        return { connected: connector.connected, isLive: multicloudStatus.live, detail: connector.detail };
      }
    }
    // Fallback to providerConnectorsData for AWS and others
    if (providerConnectorsData?.connectors) {
      const connector = providerConnectorsData.connectors.find(c => c.provider.toLowerCase() === provider.toLowerCase());
      if (connector) {
        return { connected: connector.connected, isLive: providerConnectorsData.live, detail: connector.detail };
      }
    }
    // Fallback to existing local logic
    return { connected: connectivityState(provider, awsLive) === 'connected', isLive: false };
  };

  // Compute provider stats from ALL_AGENTS
  const providerStats = useMemo(() => {
    const stats: Record<string, { count: number; production: number; compliant: number; reviewNeeded: number; blocked: number; cost: number; avgLatency: number }> = {};

    ALL_AGENTS.forEach((agent: AgentRegistryEntry) => {
      const provider = agent.provider || 'aws';
      if (!stats[provider]) {
        stats[provider] = { count: 0, production: 0, compliant: 0, reviewNeeded: 0, blocked: 0, cost: 0, avgLatency: 0 };
      }
      stats[provider].count++;
      if (agent.status === 'production') stats[provider].production++;
      if (agent.governanceStatus === 'compliant') stats[provider].compliant++;
      if (agent.governanceStatus === 'review_needed') stats[provider].reviewNeeded++;
      if (agent.governanceStatus === 'blocked') stats[provider].blocked++;
      stats[provider].cost += agent.metrics.avgCostPerDay * 30;
      stats[provider].avgLatency += agent.metrics.p95LatencyMs;
    });

    // Calculate average latency
    Object.keys(stats).forEach(provider => {
      if (stats[provider].count > 0) {
        stats[provider].avgLatency = Math.round(stats[provider].avgLatency / stats[provider].count);
      }
    });

    return stats;
  }, []);

  // Filtered agents for inventory
  const filteredAgents = useMemo(() => {
    if (inventoryFilter === 'all') return ALL_AGENTS;
    return ALL_AGENTS.filter(agent => agent.provider === inventoryFilter);
  }, [inventoryFilter]);

  // Chart data
  const providerDistribution = useMemo(() => {
    return Object.entries(providerStats).map(([provider, stats]) => ({
      name: AGENT_PROVIDER_CONFIG[provider as AgentProvider]?.label || provider,
      value: stats.count,
      color: AGENT_PROVIDER_CONFIG[provider as AgentProvider]?.color || '#6366f1',
    }));
  }, [providerStats]);

  // Radar chart data for feature comparison
  const radarData = useMemo(() => {
    const features = Object.keys(FEATURE_LABELS);
    return features.map(feature => ({
      feature: FEATURE_LABELS[feature],
      aws: PROVIDER_FEATURES.aws.features[feature as keyof typeof PROVIDER_FEATURES.aws.features]?.score || 0,
      azure: PROVIDER_FEATURES.azure.features[feature as keyof typeof PROVIDER_FEATURES.azure.features]?.score || 0,
      gcp: PROVIDER_FEATURES.gcp.features[feature as keyof typeof PROVIDER_FEATURES.gcp.features]?.score || 0,
    }));
  }, []);

  const totalAgents = ALL_AGENTS.length;
  const totalCost = Object.values(providerStats).reduce((sum, s) => sum + s.cost, 0);
  const cloudProviders = Object.keys(providerStats).filter(p => ['aws', 'azure', 'gcp'].includes(p)).length;
  const saasProviders = Object.keys(providerStats).filter(p => !['aws', 'azure', 'gcp', 'custom'].includes(p)).length;
  const compliantAgents = Object.values(providerStats).reduce((sum, s) => sum + s.compliant, 0);
  const complianceRate = totalAgents > 0 ? Math.round((compliantAgents / totalAgents) * 100) : 0;

  return (
    <GovernPageLayout
      title="Multi-Cloud Governance"
      description="Unified governance across AWS, Azure, GCP, and SaaS agent platforms."
      badge={
        // The headline KPIs, dashboard charts, and Agent Inventory on this page are
        // illustrative (ALL_AGENTS / TOOL_REGISTRY mock constants), so the PAGE badge is
        // honestly Demo — a single connector being configured does NOT make the fleet
        // totals live. Genuinely-live connector cost/agent data is badged per-section below.
        <MockDataBadge integration="Fleet totals & inventory are illustrative — connector cost/agent data is live only where a provider is connected" />
      }
    >
      {/* Multi-Cloud Governance Guide */}
      <UnifiedGuide {...MULTI_CLOUD_GUIDE} />

      {/* KPI Summary — illustrative fleet totals from the mock agent/tool registry */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Fleet Summary</span>
        <MockDataBadge integration="Illustrative fleet — Total Agents, Monthly Cost, Compliance & Tools+MCP come from the demo agent registry, not live connectors" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-4">
          <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">Total Agents</div>
          <div className="text-2xl font-bold text-slate-900 mt-1">{totalAgents}</div>
          <div className="text-[11px] text-slate-400 mt-0.5">across all providers</div>
        </div>
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-4">
          <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">Cloud Providers</div>
          <div className="text-2xl font-bold text-blue-600 mt-1">{cloudProviders}</div>
          <div className="text-[11px] text-slate-400 mt-0.5">AWS, Azure, GCP</div>
        </div>
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-4">
          <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">SaaS Platforms</div>
          <div className="text-2xl font-bold text-violet-600 mt-1">{saasProviders}</div>
          <div className="text-[11px] text-slate-400 mt-0.5">ServiceNow, Salesforce</div>
        </div>
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-4">
          <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">Compliance</div>
          <div className={`text-2xl font-bold mt-1 ${complianceRate >= 90 ? 'text-emerald-600' : complianceRate >= 70 ? 'text-amber-600' : 'text-rose-600'}`}>{complianceRate}%</div>
          <div className="text-[11px] text-slate-400 mt-0.5">{compliantAgents}/{totalAgents} compliant</div>
        </div>
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-4">
          <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">Monthly Cost</div>
          <div className="text-2xl font-bold text-emerald-600 mt-1">${totalCost.toLocaleString()}</div>
          <div className="text-[11px] text-slate-400 mt-0.5">all providers</div>
        </div>
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-4">
          <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">Tools + MCP</div>
          <div className="text-2xl font-bold text-indigo-600 mt-1">{TOOL_REGISTRY.length + MCP_SERVER_REGISTRY.length}</div>
          <div className="text-[11px] text-slate-400 mt-0.5">registered capabilities</div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-1 p-1 bg-slate-100/80 rounded-xl mb-6 w-fit" role="tablist">
        {TABS.map(tab => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === tab.id
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
            }`}
          >
            <Icon name={tab.icon} className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* ════════════════════════════════ DASHBOARD TAB ════════════════════════════════ */}
      {activeTab === 'dashboard' && (
        <div className="space-y-6">
          {/* Provider Cards Row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {(['aws', 'azure', 'gcp'] as const).map(provider => {
              const config = AGENT_PROVIDER_CONFIG[provider];
              const pf = PROVIDER_FEATURES[provider];
              const stats = providerStats[provider] || { count: 0, production: 0, compliant: 0, reviewNeeded: 0, blocked: 0, cost: 0, avgLatency: 0 };
              const compRate = stats.count > 0 ? Math.round((stats.compliant / stats.count) * 100) : 0;

              return (
                <div key={provider} className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
                  <div className="p-4 border-b border-slate-100" style={{ borderLeftWidth: 4, borderLeftColor: config.color }}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${config.color}15` }}>
                          <Icon name="cloud" className="w-5 h-5" style={{ color: config.color }} />
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-slate-900">{config.label}</div>
                          <div className="text-xs text-slate-500">{pf.name}</div>
                        </div>
                      </div>
                      {connectorStatusBadge(getConnectorStatus(provider))}
                    </div>
                  </div>
                  <div className="p-4 space-y-3">
                    <div className="grid grid-cols-4 gap-2 text-center">
                      <div>
                        <div className="text-lg font-bold text-slate-900">{stats.count}</div>
                        <div className="text-[9px] text-slate-500">Agents</div>
                      </div>
                      <div>
                        <div className="text-lg font-bold text-emerald-600">{stats.production}</div>
                        <div className="text-[9px] text-slate-500">Prod</div>
                      </div>
                      <div>
                        <div className={`text-lg font-bold ${compRate >= 90 ? 'text-emerald-600' : compRate >= 70 ? 'text-amber-600' : 'text-rose-600'}`}>{compRate}%</div>
                        <div className="text-[9px] text-slate-500">Compliant</div>
                      </div>
                      <div>
                        <div className="text-lg font-bold text-slate-700">{stats.avgLatency}ms</div>
                        <div className="text-[9px] text-slate-500">Latency</div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                      <span className="text-xs text-slate-500">Monthly Cost</span>
                      <span className="text-sm font-semibold text-slate-900">${Math.round(stats.cost).toLocaleString()}</span>
                    </div>
                    <Link
                      to={`/govern/agents?provider=${provider}`}
                      className="block w-full text-center text-xs text-blue-600 hover:text-blue-700 font-medium py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 transition-colors"
                    >
                      View Agents →
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>

          {/* SaaS Platforms + Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* SaaS Platforms */}
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="text-sm font-semibold text-slate-900">SaaS Agent Platforms</div>
                <Link to="/govern/agents?tab=providers" className="text-xs text-blue-600 hover:text-blue-700 font-medium">
                  View All →
                </Link>
              </div>
              <div className="space-y-3">
                {(['servicenow', 'salesforce', 'copilot_studio'] as const).map(provider => {
                  const config = AGENT_PROVIDER_CONFIG[provider];
                  const stats = providerStats[provider] || { count: 0, production: 0, compliant: 0, cost: 0 };

                  return (
                    <div
                      key={provider}
                      className="flex items-center justify-between p-3 rounded-lg bg-slate-50 hover:bg-slate-100 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${config.color}15` }}>
                          <Icon name="building-office" className="w-4 h-4" style={{ color: config.color }} />
                        </div>
                        <div>
                          <div className="text-xs font-semibold text-slate-900">{config.label}</div>
                          <div className="text-[10px] text-slate-500">{stats.count} agents • ${Math.round(stats.cost).toLocaleString()}/mo</div>
                        </div>
                      </div>
                      {connectorStatusBadge(getConnectorStatus(provider))}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Distribution Pie */}
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
              <div className="text-sm font-semibold text-slate-900 mb-4">Agent Distribution</div>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={providerDistribution}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={75}
                    dataKey="value"
                    label={({ name, value }) => `${name}: ${value}`}
                    labelLine={{ stroke: '#94a3b8', strokeWidth: 1 }}
                  >
                    {providerDistribution.map((entry, index) => (
                      <Cell key={index} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Governance Posture Summary */}
          <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="text-sm font-semibold text-slate-900">Governance Posture by Provider</div>
              <Link to="/govern/risk" className="text-xs text-blue-600 hover:text-blue-700 font-medium">
                View Risk Dashboard →
              </Link>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50/50">
                    <th scope="col" className="text-left px-4 py-2 font-medium text-slate-600">Provider</th>
                    <th scope="col" className="text-center px-4 py-2 font-medium text-slate-600">Agents</th>
                    <th scope="col" className="text-center px-4 py-2 font-medium text-slate-600">Compliant</th>
                    <th scope="col" className="text-center px-4 py-2 font-medium text-slate-600">Review</th>
                    <th scope="col" className="text-center px-4 py-2 font-medium text-slate-600">Blocked</th>
                    <th scope="col" className="text-center px-4 py-2 font-medium text-slate-600">Coverage</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(providerStats).map(([provider, stats]) => {
                    const config = AGENT_PROVIDER_CONFIG[provider as AgentProvider];
                    if (!config || stats.count === 0) return null;
                    const coverage = Math.round((stats.compliant / stats.count) * 100);

                    return (
                      <tr key={provider} className="border-t border-slate-100 hover:bg-slate-50/50">
                        <td className="px-4 py-2">
                          <div className="flex items-center gap-2">
                            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: config.color }} />
                            <span className="font-medium text-slate-900">{config.label}</span>
                          </div>
                        </td>
                        <td className="px-4 py-2 text-center font-medium text-slate-900">{stats.count}</td>
                        <td className="px-4 py-2 text-center"><span className="text-emerald-600 font-semibold">{stats.compliant}</span></td>
                        <td className="px-4 py-2 text-center"><span className={stats.reviewNeeded > 0 ? 'text-amber-600 font-semibold' : 'text-slate-400'}>{stats.reviewNeeded}</span></td>
                        <td className="px-4 py-2 text-center"><span className={stats.blocked > 0 ? 'text-rose-600 font-semibold' : 'text-slate-400'}>{stats.blocked}</span></td>
                        <td className="px-4 py-2 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <div className="w-12 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full ${coverage >= 90 ? 'bg-emerald-500' : coverage >= 70 ? 'bg-amber-500' : 'bg-rose-500'}`} style={{ width: `${coverage}%` }} />
                            </div>
                            <span className={`text-[10px] font-semibold ${coverage >= 90 ? 'text-emerald-600' : coverage >= 70 ? 'text-amber-600' : 'text-rose-600'}`}>{coverage}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Real-Time Invocation Metrics */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="text-sm font-semibold text-slate-900">Invocations by Hour (Last 24h)</div>
                <MockDataBadge integration="CloudWatch AWS/Bedrock + Azure Monitor + GCP Cloud Monitoring invocation metrics" />
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={[
                  { hour: '00:00', aws: 1240, azure: 890, gcp: 450, saas: 320 },
                  { hour: '04:00', aws: 680, azure: 520, gcp: 280, saas: 180 },
                  { hour: '08:00', aws: 2890, azure: 1850, gcp: 920, saas: 680 },
                  { hour: '12:00', aws: 4120, azure: 2680, gcp: 1340, saas: 940 },
                  { hour: '16:00', aws: 3850, azure: 2420, gcp: 1180, saas: 820 },
                  { hour: '20:00', aws: 2340, azure: 1560, gcp: 780, saas: 520 },
                ]}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="hour" tick={{ fill: '#64748b', fontSize: 10 }} />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} tickFormatter={v => `${(v/1000).toFixed(1)}k`} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Area type="monotone" dataKey="aws" name="AWS" stackId="1" stroke="#FF9900" fill="#FF9900" fillOpacity={0.6} />
                  <Area type="monotone" dataKey="azure" name="Azure" stackId="1" stroke="#0078D4" fill="#0078D4" fillOpacity={0.6} />
                  <Area type="monotone" dataKey="gcp" name="GCP" stackId="1" stroke="#4285F4" fill="#4285F4" fillOpacity={0.6} />
                  <Area type="monotone" dataKey="saas" name="SaaS" stackId="1" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.6} />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="text-sm font-semibold text-slate-900">Error Rate Trends (7 Day)</div>
                <MockDataBadge integration="CloudWatch InvocationClientErrors/ServerErrors + Azure Monitor + GCP error metrics" />
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={[
                  { day: 'Mon', aws: 0.12, azure: 0.18, gcp: 0.15 },
                  { day: 'Tue', aws: 0.14, azure: 0.16, gcp: 0.13 },
                  { day: 'Wed', aws: 0.11, azure: 0.22, gcp: 0.14 },
                  { day: 'Thu', aws: 0.09, azure: 0.19, gcp: 0.12 },
                  { day: 'Fri', aws: 0.13, azure: 0.17, gcp: 0.16 },
                  { day: 'Sat', aws: 0.08, azure: 0.14, gcp: 0.11 },
                  { day: 'Sun', aws: 0.07, azure: 0.12, gcp: 0.09 },
                ]}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="day" tick={{ fill: '#64748b', fontSize: 10 }} />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} tickFormatter={v => `${v}%`} />
                  <Tooltip contentStyle={tooltipStyle} formatter={((value: number) => [`${value}%`, '']) as Formatter<ValueType, NameType>} />
                  <Area type="monotone" dataKey="aws" name="AWS" stroke="#FF9900" fill="#FF9900" fillOpacity={0.3} />
                  <Area type="monotone" dataKey="azure" name="Azure" stroke="#0078D4" fill="#0078D4" fillOpacity={0.3} />
                  <Area type="monotone" dataKey="gcp" name="GCP" stroke="#4285F4" fill="#4285F4" fillOpacity={0.3} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Token Usage & Model Performance */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm font-semibold text-slate-900">Token Usage (MTD)</div>
                <MockDataBadge integration="Bedrock model-invocation logs + Azure OpenAI / GCP Vertex token metrics" />
              </div>
              <div className="space-y-3">
                {[
                  { provider: 'AWS', input: 847.2, output: 312.4, color: '#FF9900' },
                  { provider: 'Azure', input: 523.8, output: 198.6, color: '#0078D4' },
                  { provider: 'GCP', input: 289.4, output: 108.2, color: '#4285F4' },
                  { provider: 'SaaS', input: 156.8, output: 62.4, color: '#8b5cf6' },
                ].map(row => (
                  <div key={row.provider} className="flex items-center gap-3">
                    <div className="w-16 text-xs font-medium text-slate-700">{row.provider}</div>
                    <div className="flex-1">
                      <div className="flex gap-1 h-4">
                        <div className="rounded-l" style={{ width: `${(row.input / 12) * 100}%`, backgroundColor: row.color, opacity: 0.8 }} title={`Input: ${row.input}M`} />
                        <div className="rounded-r" style={{ width: `${(row.output / 12) * 100}%`, backgroundColor: row.color, opacity: 0.5 }} title={`Output: ${row.output}M`} />
                      </div>
                    </div>
                    <div className="text-[10px] text-slate-500 w-20 text-right">{row.input + row.output}M tokens</div>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-4 mt-3 pt-3 border-t border-slate-100 text-[10px] text-slate-500">
                <span className="flex items-center gap-1"><span className="w-3 h-2 rounded bg-slate-400 opacity-80" /> Input</span>
                <span className="flex items-center gap-1"><span className="w-3 h-2 rounded bg-slate-400 opacity-50" /> Output</span>
              </div>
            </div>

            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm font-semibold text-slate-900">Model Distribution</div>
                <MockDataBadge integration="Per-model invocation counts from Bedrock invocation logs + Azure/GCP model telemetry" />
              </div>
              <div className="space-y-2">
                {[
                  { model: 'Claude 3.5 Sonnet', pct: 42, count: 847, color: '#f97316' },
                  { model: 'GPT-4 Turbo', pct: 28, count: 564, color: '#10b981' },
                  { model: 'Gemini Pro', pct: 15, count: 302, color: '#3b82f6' },
                  { model: 'Claude 3 Haiku', pct: 10, count: 201, color: '#8b5cf6' },
                  { model: 'Other', pct: 5, count: 101, color: '#94a3b8' },
                ].map(row => (
                  <div key={row.model} className="flex items-center gap-2">
                    <div className="w-24 text-[10px] font-medium text-slate-700 truncate">{row.model}</div>
                    <div className="flex-1 h-3 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${row.pct}%`, backgroundColor: row.color }} />
                    </div>
                    <div className="text-[10px] text-slate-500 w-8 text-right">{row.pct}%</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm font-semibold text-slate-900">Latency Percentiles (p50/p95/p99)</div>
                <MockDataBadge integration="CloudWatch InvocationLatency percentile statistics + Azure/GCP latency metrics" />
              </div>
              <div className="space-y-3">
                {[
                  { provider: 'AWS Bedrock', p50: 180, p95: 420, p99: 680, color: '#FF9900' },
                  { provider: 'Azure AI', p50: 210, p95: 490, p99: 780, color: '#0078D4' },
                  { provider: 'GCP Vertex', p50: 195, p95: 460, p99: 720, color: '#4285F4' },
                  { provider: 'ServiceNow', p50: 340, p95: 680, p99: 1100, color: '#81B53A' },
                ].map(row => (
                  <div key={row.provider} className="flex items-center gap-2">
                    <div className="w-20 text-[10px] font-medium text-slate-700">{row.provider}</div>
                    <div className="flex-1 flex items-center gap-1">
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-emerald-100 text-emerald-700">{row.p50}ms</span>
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-amber-100 text-amber-700">{row.p95}ms</span>
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-rose-100 text-rose-700">{row.p99}ms</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Security & Compliance Metrics */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="text-sm font-semibold text-slate-900">Guardrail Interventions (7 Day)</div>
                <MockDataBadge integration="Bedrock Guardrails CloudWatch intervention metrics + Azure Content Safety + GCP Model Armor" />
              </div>
              <div className="space-y-2">
                {[
                  { type: 'PII Detection', count: 1247, trend: -12, severity: 'medium' },
                  { type: 'Content Filter', count: 892, trend: +8, severity: 'low' },
                  { type: 'Rate Limiting', count: 456, trend: -23, severity: 'low' },
                  { type: 'Prompt Injection', count: 89, trend: +15, severity: 'high' },
                  { type: 'Token Budget', count: 234, trend: -5, severity: 'medium' },
                ].map(row => (
                  <div key={row.type} className="flex items-center justify-between p-2 rounded-lg bg-slate-50 hover:bg-slate-100">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${
                        row.severity === 'high' ? 'bg-rose-500' :
                        row.severity === 'medium' ? 'bg-amber-500' : 'bg-emerald-500'
                      }`} />
                      <span className="text-xs font-medium text-slate-700">{row.type}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-bold text-slate-900">{row.count.toLocaleString()}</span>
                      <span className={`text-[10px] font-semibold ${row.trend < 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {row.trend > 0 ? '+' : ''}{row.trend}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="text-sm font-semibold text-slate-900">Compliance Coverage by Framework</div>
                <MockDataBadge integration="AWS Audit Manager / Security Hub standards + Azure Policy compliance + GCP Assured Workloads" />
              </div>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={[
                  { framework: 'SOC 2', aws: 98, azure: 96, gcp: 94 },
                  { framework: 'ISO 27001', aws: 100, azure: 100, gcp: 98 },
                  { framework: 'GDPR', aws: 95, azure: 97, gcp: 92 },
                  { framework: 'HIPAA', aws: 92, azure: 94, gcp: 88 },
                  { framework: 'PCI DSS', aws: 96, azure: 95, gcp: 90 },
                ]} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis type="number" domain={[0, 100]} tick={{ fill: '#94a3b8', fontSize: 10 }} tickFormatter={v => `${v}%`} />
                  <YAxis dataKey="framework" type="category" tick={{ fill: '#475569', fontSize: 10 }} width={70} />
                  <Tooltip contentStyle={tooltipStyle} formatter={((value: number) => [`${value}%`, '']) as Formatter<ValueType, NameType>} />
                  <Bar dataKey="aws" name="AWS" fill="#FF9900" />
                  <Bar dataKey="azure" name="Azure" fill="#0078D4" />
                  <Bar dataKey="gcp" name="GCP" fill="#4285F4" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Cost Analytics Summary */}
          <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="text-sm font-semibold text-slate-900">Cost Breakdown (MTD)</div>
                <MockDataBadge integration="AWS Cost Explorer + Azure Cost Management + GCP Billing Export + SaaS vendor billing APIs" />
              </div>
              <Link to="/govern/finops" className="text-xs text-blue-600 hover:text-blue-700 font-medium">View FinOps →</Link>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {[
                { label: 'AWS Bedrock', value: 28420, change: +8.2, color: '#FF9900' },
                { label: 'Azure AI', value: 18650, change: +12.4, color: '#0078D4' },
                { label: 'GCP Vertex', value: 9840, change: -3.1, color: '#4285F4' },
                { label: 'ServiceNow', value: 4200, change: +2.8, color: '#81B53A' },
                { label: 'Salesforce', value: 3180, change: +5.6, color: '#00A1E0' },
                { label: 'Copilot Studio', value: 2450, change: +18.2, color: '#5C2D91' },
              ].map(item => (
                <div key={item.label} className="p-3 rounded-lg bg-slate-50">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                    <span className="text-[10px] font-medium text-slate-600">{item.label}</span>
                  </div>
                  <div className="text-lg font-bold text-slate-900">${(item.value / 1000).toFixed(1)}k</div>
                  <div className={`text-[10px] font-semibold ${item.change < 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {item.change > 0 ? '+' : ''}{item.change}% vs last month
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════ INVENTORY TAB ════════════════════════════════ */}
      {activeTab === 'inventory' && (
        <div className="space-y-6">
          {/* Illustrative agent inventory — sourced from the demo registry (ALL_AGENTS), not live connectors */}
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-900">Agent Inventory</span>
            <MockDataBadge integration="Illustrative agent inventory from the demo registry — not live connector data" />
          </div>
          {/* Filter Bar */}
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-xs font-medium text-slate-600">Filter by Provider:</span>
            <div className="flex gap-1 flex-wrap">
              <button
                onClick={() => setInventoryFilter('all')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${inventoryFilter === 'all' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
              >
                All ({ALL_AGENTS.length})
              </button>
              {Object.entries(providerStats).map(([provider, stats]) => {
                const config = AGENT_PROVIDER_CONFIG[provider as AgentProvider];
                if (!config || stats.count === 0) return null;
                return (
                  <button
                    key={provider}
                    onClick={() => setInventoryFilter(provider)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${inventoryFilter === provider ? 'text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                    style={inventoryFilter === provider ? { backgroundColor: config.color } : undefined}
                  >
                    {config.label} ({stats.count})
                  </button>
                );
              })}
            </div>
          </div>

          {/* Agent Table */}
          <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50/50">
                    <th scope="col" className="text-left px-4 py-3 font-medium text-slate-600">Agent</th>
                    <th scope="col" className="text-left px-4 py-3 font-medium text-slate-600">Provider</th>
                    <th scope="col" className="text-left px-4 py-3 font-medium text-slate-600">Model</th>
                    <th scope="col" className="text-center px-4 py-3 font-medium text-slate-600">Status</th>
                    <th scope="col" className="text-center px-4 py-3 font-medium text-slate-600">Governance</th>
                    <th scope="col" className="text-right px-4 py-3 font-medium text-slate-600">Cost/Day</th>
                    <th scope="col" className="text-right px-4 py-3 font-medium text-slate-600">Latency</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAgents.map((agent) => {
                    const config = AGENT_PROVIDER_CONFIG[agent.provider || 'aws'];
                    return (
                      <tr key={agent.id} className="border-t border-slate-100 hover:bg-slate-50/50">
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-900">{agent.name}</div>
                          <div className="text-[10px] text-slate-500">{agent.id}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: config?.color }} />
                            <span className="text-slate-700">{config?.label}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-600">{agent.model}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            agent.status === 'production' ? 'bg-emerald-100 text-emerald-700' :
                            agent.status === 'pilot' ? 'bg-blue-100 text-blue-700' :
                            agent.status === 'development' ? 'bg-amber-100 text-amber-700' :
                            'bg-slate-100 text-slate-600'
                          }`}>
                            {agent.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            agent.governanceStatus === 'compliant' ? 'bg-emerald-100 text-emerald-700' :
                            agent.governanceStatus === 'review_needed' ? 'bg-amber-100 text-amber-700' :
                            'bg-rose-100 text-rose-700'
                          }`}>
                            {(agent.governanceStatus ?? 'unknown').replace('_', ' ')}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-slate-900 font-medium">${agent.metrics.avgCostPerDay.toFixed(2)}</td>
                        <td className="px-4 py-3 text-right text-slate-600">{agent.metrics.p95LatencyMs}ms</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════ REGISTRY TAB ════════════════════════════════ */}
      {activeTab === 'registry' && (
        <div className="space-y-6">
          {/* Registry Sub-tabs */}
          <div className="flex gap-1 p-1 bg-slate-100/80 rounded-lg w-fit">
            {REGISTRY_SUB_TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setRegistrySubTab(tab.id)}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  registrySubTab === tab.id
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tools Sub-tab */}
          {registrySubTab === 'tools' && (
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-slate-900">Tool Registry</div>
                  <div className="text-xs text-slate-500 mt-0.5">{TOOL_REGISTRY.length} tools registered across all providers</div>
                </div>
                <Link to="/govern/agents?tab=tools" className="text-xs text-blue-600 hover:text-blue-700 font-medium">
                  Full Registry →
                </Link>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50/50">
                      <th scope="col" className="text-left px-4 py-3 font-medium text-slate-600">Tool</th>
                      <th scope="col" className="text-left px-4 py-3 font-medium text-slate-600">Category</th>
                      <th scope="col" className="text-center px-4 py-3 font-medium text-slate-600">Risk Level</th>
                      <th scope="col" className="text-center px-4 py-3 font-medium text-slate-600">Agents</th>
                      <th scope="col" className="text-center px-4 py-3 font-medium text-slate-600">HITL Required</th>
                    </tr>
                  </thead>
                  <tbody>
                    {TOOL_REGISTRY.slice(0, 8).map(tool => (
                      <tr key={tool.id} className="border-t border-slate-100 hover:bg-slate-50/50">
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-900">{tool.name}</div>
                          <div className="text-[10px] text-slate-500">{tool.id}</div>
                        </td>
                        <td className="px-4 py-3 text-slate-600">{tool.type}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            tool.riskLevel === 'low' ? 'bg-emerald-100 text-emerald-700' :
                            tool.riskLevel === 'medium' ? 'bg-amber-100 text-amber-700' :
                            tool.riskLevel === 'high' ? 'bg-orange-100 text-orange-700' :
                            'bg-rose-100 text-rose-700'
                          }`}>
                            {tool.riskLevel}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center text-slate-700">{tool.authorizedAgents}</td>
                        <td className="px-4 py-3 text-center">
                          {tool.requiresHumanApproval ? (
                            <Icon name="check-circle" className="w-4 h-4 text-amber-500 mx-auto" />
                          ) : (
                            <Icon name="x-mark" className="w-4 h-4 text-slate-300 mx-auto" />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* MCP Servers Sub-tab */}
          {registrySubTab === 'mcp' && (
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-slate-900">MCP Server Registry</div>
                  <div className="text-xs text-slate-500 mt-0.5">{MCP_SERVER_REGISTRY.length} MCP servers providing tools to agents</div>
                </div>
                <Link to="/govern/agents?tab=mcp" className="text-xs text-blue-600 hover:text-blue-700 font-medium">
                  Full Registry →
                </Link>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50/50">
                      <th scope="col" className="text-left px-4 py-3 font-medium text-slate-600">Server</th>
                      <th scope="col" className="text-left px-4 py-3 font-medium text-slate-600">Auth Method</th>
                      <th scope="col" className="text-center px-4 py-3 font-medium text-slate-600">Tools</th>
                      <th scope="col" className="text-center px-4 py-3 font-medium text-slate-600">Agents</th>
                      <th scope="col" className="text-center px-4 py-3 font-medium text-slate-600">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {MCP_SERVER_REGISTRY.map(server => (
                      <tr key={server.id} className="border-t border-slate-100 hover:bg-slate-50/50">
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-900">{server.name}</div>
                          <div className="text-[10px] text-slate-500">{server.id}</div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-600">{server.authMethod}</span>
                        </td>
                        <td className="px-4 py-3 text-center text-slate-700">{server.toolCount}</td>
                        <td className="px-4 py-3 text-center text-slate-700">{TOOL_REGISTRY.filter(t => t.mcpServer === server.id).reduce((sum, t) => sum + t.authorizedAgents, 0)}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            server.status === 'operational' ? 'bg-emerald-100 text-emerald-700' :
                            server.status === 'degraded' ? 'bg-amber-100 text-amber-700' :
                            'bg-slate-100 text-slate-600'
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${
                              server.status === 'operational' ? 'bg-emerald-500' :
                              server.status === 'degraded' ? 'bg-amber-500' : 'bg-slate-400'
                            }`} />
                            {server.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Permissions Sub-tab */}
          {registrySubTab === 'permissions' && (
            <div className="space-y-4">
              <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">Permission Scope Summary</div>
                    <div className="text-xs text-slate-500 mt-0.5">Agent permissions across all providers</div>
                  </div>
                  <Link to="/govern/agents?tab=permissions" className="text-xs text-blue-600 hover:text-blue-700 font-medium">
                    Manage Permissions →
                  </Link>
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  {[
                    { scope: 'read-only', count: 8, color: 'emerald', desc: 'Read access only' },
                    { scope: 'read-write', count: 12, color: 'blue', desc: 'Read and write access' },
                    { scope: 'execute', count: 6, color: 'amber', desc: 'Can execute actions' },
                    { scope: 'admin', count: 2, color: 'rose', desc: 'Full administrative access' },
                  ].map(perm => (
                    <div key={perm.scope} className={`p-4 rounded-lg bg-${perm.color}-50 border border-${perm.color}-200`}>
                      <div className={`text-2xl font-bold text-${perm.color}-700`}>{perm.count}</div>
                      <div className="text-xs font-semibold text-slate-700 capitalize">{perm.scope}</div>
                      <div className="text-[10px] text-slate-500">{perm.desc}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-gradient-to-r from-indigo-50 to-violet-50 rounded-xl border border-indigo-200/60 p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">Cedar Policy Engine</div>
                    <div className="text-xs text-slate-600 mt-1">Fine-grained permissions enforced via AWS Verified Permissions</div>
                  </div>
                  <Link to="/secure/policy" className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors">
                    Configure Policies
                  </Link>
                </div>
              </div>
            </div>
          )}

          {/* Human Oversight Sub-tab */}
          {registrySubTab === 'human-oversight' && (
            <div className="space-y-4">
              <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">Human-in-the-Loop Configuration</div>
                    <div className="text-xs text-slate-500 mt-0.5">Approval gates and oversight requirements by agent</div>
                  </div>
                  <Link to="/govern/agents?tab=human-oversight" className="text-xs text-blue-600 hover:text-blue-700 font-medium">
                    Full Configuration →
                  </Link>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <div className="p-4 rounded-lg bg-emerald-50 border border-emerald-200">
                    <div className="flex items-center gap-2 mb-2">
                      <Icon name="check-circle" className="w-5 h-5 text-emerald-600" />
                      <span className="text-sm font-semibold text-emerald-800">Autonomous</span>
                    </div>
                    <div className="text-2xl font-bold text-emerald-700">8</div>
                    <div className="text-xs text-emerald-600">agents with full autonomy</div>
                  </div>
                  <div className="p-4 rounded-lg bg-amber-50 border border-amber-200">
                    <div className="flex items-center gap-2 mb-2">
                      <Icon name="hand-raised" className="w-5 h-5 text-amber-600" />
                      <span className="text-sm font-semibold text-amber-800">HITL Required</span>
                    </div>
                    <div className="text-2xl font-bold text-amber-700">12</div>
                    <div className="text-xs text-amber-600">agents requiring approval</div>
                  </div>
                  <div className="p-4 rounded-lg bg-rose-50 border border-rose-200">
                    <div className="flex items-center gap-2 mb-2">
                      <Icon name="shield-exclamation" className="w-5 h-5 text-rose-600" />
                      <span className="text-sm font-semibold text-rose-800">Restricted</span>
                    </div>
                    <div className="text-2xl font-bold text-rose-700">4</div>
                    <div className="text-xs text-rose-600">agents with strict oversight</div>
                  </div>
                </div>
              </div>

              <div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-xl border border-amber-200/60 p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">Governance Playbook</div>
                    <div className="text-xs text-slate-600 mt-1">Configure autonomy levels and HITL gates across your fleet</div>
                  </div>
                  <Link to="/govern/playbook" className="px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 transition-colors">
                    Open Playbook
                  </Link>
                </div>
              </div>
            </div>
          )}

          {/* A2A Sub-tab */}
          {registrySubTab === 'a2a' && (
            <div className="space-y-4">
              <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">Agent-to-Agent Communication</div>
                    <div className="text-xs text-slate-500 mt-0.5">Trust relationships and delegation policies</div>
                  </div>
                  <Link to="/govern/agents?tab=a2a" className="text-xs text-blue-600 hover:text-blue-700 font-medium">
                    Full A2A Config →
                  </Link>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="p-4 rounded-lg bg-blue-50 border border-blue-200">
                    <div className="flex items-center gap-2 mb-3">
                      <Icon name="arrows-right-left" className="w-5 h-5 text-blue-600" />
                      <span className="text-sm font-semibold text-blue-800">Trust Relationships</span>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-600">Bidirectional Trust</span>
                        <span className="font-semibold text-blue-700">14 pairs</span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-600">Delegation Chains</span>
                        <span className="font-semibold text-blue-700">6 active</span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-600">Cross-Provider A2A</span>
                        <span className="font-semibold text-blue-700">4 links</span>
                      </div>
                    </div>
                  </div>
                  <div className="p-4 rounded-lg bg-violet-50 border border-violet-200">
                    <div className="flex items-center gap-2 mb-3">
                      <Icon name="shield-check" className="w-5 h-5 text-violet-600" />
                      <span className="text-sm font-semibold text-violet-800">A2A Policies</span>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-600">Allow-list Rules</span>
                        <span className="font-semibold text-violet-700">23 rules</span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-600">Deny-list Rules</span>
                        <span className="font-semibold text-violet-700">8 rules</span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-600">Scope Inheritance</span>
                        <span className="font-semibold text-emerald-600">Enabled</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-gradient-to-r from-violet-50 to-purple-50 rounded-xl border border-violet-200/60 p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">A2A Protocol: Google A2A + MCP</div>
                    <div className="text-xs text-slate-600 mt-1">Industry-standard agent communication with AVA governance layer</div>
                  </div>
                  <Link to="/govern/workflows" className="px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 transition-colors">
                    View Workflows
                  </Link>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════ PROVIDERS TAB ════════════════════════════════ */}
      {activeTab === 'providers' && (
        <div className="space-y-6">
          {/* Cloud Providers */}
          <div>
            <div className="text-sm font-semibold text-slate-900 mb-4">Cloud Providers</div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {(['aws', 'azure', 'gcp'] as const).map(provider => {
                const pf = PROVIDER_FEATURES[provider];
                const config = AGENT_PROVIDER_CONFIG[provider];
                const stats = providerStats[provider] || { count: 0, compliant: 0, cost: 0 };
                const isSelected = selectedProvider === provider;

                return (
                  <div
                    key={provider}
                    {...rowButtonProps(() => setSelectedProvider(isSelected ? null : provider), `Select provider ${pf.fullName}`)}
                    aria-pressed={isSelected}
                    className={`bg-white/80 backdrop-blur-sm rounded-xl border shadow-sm overflow-hidden cursor-pointer transition-all focus-visible:ring-2 focus-visible:ring-blue-400 focus:outline-none ${
                      isSelected ? 'border-blue-300 ring-2 ring-blue-100' : 'border-slate-200/60 hover:border-slate-300'
                    }`}
                  >
                    <div className="p-4" style={{ borderLeftWidth: 4, borderLeftColor: config.color }}>
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${config.color}15` }}>
                            <Icon name="cloud" className="w-5 h-5" style={{ color: config.color }} />
                          </div>
                          <div>
                            <div className="text-sm font-semibold text-slate-900">{pf.fullName}</div>
                            <div className="text-[10px] text-slate-500">{stats.count} agents</div>
                          </div>
                        </div>
                        {connectorStatusBadge(getConnectorStatus(provider))}
                      </div>
                      <p className="text-xs text-slate-600 mb-3">{pf.description}</p>
                      <div className="flex flex-wrap gap-1">
                        {pf.models.slice(0, 3).map(model => (
                          <span key={model} className="text-[9px] px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded">{model}</span>
                        ))}
                        {pf.models.length > 3 && (
                          <span className="text-[9px] px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded">+{pf.models.length - 3}</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* SaaS Platforms */}
          <div>
            <div className="text-sm font-semibold text-slate-900 mb-4">SaaS Platforms</div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {(['servicenow', 'salesforce', 'copilot_studio'] as const).map(provider => {
                const pf = PROVIDER_FEATURES[provider];
                const config = AGENT_PROVIDER_CONFIG[provider];
                const stats = providerStats[provider] || { count: 0, compliant: 0, cost: 0 };
                const isSelected = selectedProvider === provider;

                return (
                  <div
                    key={provider}
                    {...rowButtonProps(() => setSelectedProvider(isSelected ? null : provider), `Select provider ${pf.fullName}`)}
                    aria-pressed={isSelected}
                    className={`bg-white/80 backdrop-blur-sm rounded-xl border shadow-sm overflow-hidden cursor-pointer transition-all focus-visible:ring-2 focus-visible:ring-blue-400 focus:outline-none ${
                      isSelected ? 'border-blue-300 ring-2 ring-blue-100' : 'border-slate-200/60 hover:border-slate-300'
                    }`}
                  >
                    <div className="p-4" style={{ borderLeftWidth: 4, borderLeftColor: config.color }}>
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${config.color}15` }}>
                            <Icon name="building-office" className="w-5 h-5" style={{ color: config.color }} />
                          </div>
                          <div>
                            <div className="text-sm font-semibold text-slate-900">{pf.fullName}</div>
                            <div className="text-[10px] text-slate-500">{stats.count} agents</div>
                          </div>
                        </div>
                        {connectorStatusBadge(getConnectorStatus(provider))}
                      </div>
                      <p className="text-xs text-slate-600 mb-3">{pf.description}</p>
                      <div className="flex flex-wrap gap-1">
                        {pf.models.map(model => (
                          <span key={model} className="text-[9px] px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded">{model}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Connector Configuration */}
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-200/60 p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-sm font-semibold text-slate-900">Multi-Cloud Connector Configuration</div>
                <div className="text-xs text-slate-600 mt-1">
                  Connect cloud providers and SaaS platforms to pull live cost and agent data. Credentials are securely stored in AWS Secrets Manager.
                </div>
              </div>
              {multicloudStatus?.live && (
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 text-xs font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Live
                </span>
              )}
            </div>
            {/* Cloud Service Providers */}
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mt-2 mb-2">Cloud Service Providers</div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Azure Connector */}
              <div className="p-4 rounded-lg bg-white border border-slate-200">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-blue-100">
                      <Icon name="cloud" className="w-4 h-4 text-blue-600" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-slate-900">Azure</div>
                      <div className="text-[10px] text-slate-500">Cost Management + AI Foundry</div>
                    </div>
                  </div>
                  {multicloudConnectorBadge(multicloudStatus?.connectors?.find(c => c.provider === 'azure'))}
                </div>
                {multicloudCosts?.azure?.live ? (
                  <div className="space-y-2">
                    <div className="flex justify-end">
                      <LiveDataBadge source="Azure Cost Management" detail="Live 30-day cost from Azure Cost Management" />
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-600">30-Day Cost</span>
                      <span className="font-semibold text-slate-900">${multicloudCosts.azure.total.toLocaleString()}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-600">Agents</span>
                      <span className="font-semibold text-slate-900">{multicloudAgents?.azure?.total || 0}</span>
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-slate-500 italic">
                    Configure connector to see live Azure data
                  </div>
                )}
                <button
                  onClick={() => setConfigureModal('azure')}
                  className="mt-3 w-full px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
                >
                  Configure Azure
                </button>
              </div>

              {/* GCP Connector */}
              <div className="p-4 rounded-lg bg-white border border-slate-200">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-blue-100">
                      <Icon name="cloud" className="w-4 h-4 text-blue-500" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-slate-900">Google Cloud</div>
                      <div className="text-[10px] text-slate-500">BigQuery Billing + Vertex AI</div>
                    </div>
                  </div>
                  {multicloudConnectorBadge(multicloudStatus?.connectors?.find(c => c.provider === 'gcp'))}
                </div>
                {multicloudCosts?.gcp?.live ? (
                  <div className="space-y-2">
                    <div className="flex justify-end">
                      <LiveDataBadge source="BigQuery Billing" detail="Live 30-day cost from GCP BigQuery billing export" />
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-600">30-Day Cost</span>
                      <span className="font-semibold text-slate-900">${multicloudCosts.gcp.total.toLocaleString()}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-600">Agents</span>
                      <span className="font-semibold text-slate-900">{multicloudAgents?.gcp?.total || 0}</span>
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-slate-500 italic">
                    Configure connector to see live GCP data
                  </div>
                )}
                <button
                  onClick={() => setConfigureModal('gcp')}
                  className="mt-3 w-full px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
                >
                  Configure GCP
                </button>
              </div>
            </div>

            {/* SaaS Platforms */}
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mt-6 mb-2">SaaS Platforms</div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* ServiceNow Connector */}
              <div className="p-4 rounded-lg bg-white border border-slate-200">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#81B53A20' }}>
                      <Icon name="building-office" className="w-4 h-4" style={{ color: '#81B53A' }} />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-slate-900">ServiceNow</div>
                      <div className="text-[10px] text-slate-500">Now Assist + AI Agent Studio</div>
                    </div>
                  </div>
                  {multicloudConnectorBadge(multicloudStatus?.connectors?.find(c => c.provider === 'servicenow'))}
                </div>
                {multicloudCosts?.servicenow?.live ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-600">Monthly License</span>
                      <span className="font-semibold text-slate-900">${multicloudCosts.servicenow.total.toLocaleString()}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-600">Agents</span>
                      <span className="font-semibold text-slate-900">{multicloudAgents?.servicenow?.total || 0}</span>
                    </div>
                    <div className="text-[9px] text-slate-400 italic">License cost is user-entered, not live billing telemetry.</div>
                  </div>
                ) : (
                  <div className="text-xs text-slate-500 italic">
                    Configure connector to see live ServiceNow data
                  </div>
                )}
                <button
                  onClick={() => setConfigureModal('servicenow')}
                  className="mt-3 w-full px-3 py-1.5 text-xs font-medium text-green-700 bg-green-50 rounded-lg hover:bg-green-100 transition-colors"
                >
                  Configure ServiceNow
                </button>
              </div>

              {/* Salesforce Connector */}
              <div className="p-4 rounded-lg bg-white border border-slate-200">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#00A1E020' }}>
                      <Icon name="building-office" className="w-4 h-4" style={{ color: '#00A1E0' }} />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-slate-900">Salesforce</div>
                      <div className="text-[10px] text-slate-500">Einstein + Agentforce</div>
                    </div>
                  </div>
                  {multicloudConnectorBadge(multicloudStatus?.connectors?.find(c => c.provider === 'salesforce'))}
                </div>
                {multicloudCosts?.salesforce?.live ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-600">Monthly License</span>
                      <span className="font-semibold text-slate-900">${multicloudCosts.salesforce.total.toLocaleString()}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-600">Agents</span>
                      <span className="font-semibold text-slate-900">{multicloudAgents?.salesforce?.total || 0}</span>
                    </div>
                    <div className="text-[9px] text-slate-400 italic">License cost is user-entered, not live billing telemetry.</div>
                  </div>
                ) : (
                  <div className="text-xs text-slate-500 italic">
                    Configure connector to see live Salesforce data
                  </div>
                )}
                <button
                  onClick={() => setConfigureModal('salesforce')}
                  className="mt-3 w-full px-3 py-1.5 text-xs font-medium text-cyan-700 bg-cyan-50 rounded-lg hover:bg-cyan-100 transition-colors"
                >
                  Configure Salesforce
                </button>
              </div>

              {/* Copilot Studio Connector */}
              <div className="p-4 rounded-lg bg-white border border-slate-200">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#5C2D9120' }}>
                      <Icon name="building-office" className="w-4 h-4" style={{ color: '#5C2D91' }} />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-slate-900">Copilot Studio</div>
                      <div className="text-[10px] text-slate-500">Microsoft Power Platform</div>
                    </div>
                  </div>
                  {multicloudConnectorBadge(multicloudStatus?.connectors?.find(c => c.provider === 'copilot_studio'))}
                </div>
                {multicloudCosts?.copilot_studio?.live ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-600">Monthly Capacity</span>
                      <span className="font-semibold text-slate-900">${multicloudCosts.copilot_studio.total.toLocaleString()}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-600">Agents</span>
                      <span className="font-semibold text-slate-900">{multicloudAgents?.copilot_studio?.total || 0}</span>
                    </div>
                    <div className="text-[9px] text-slate-400 italic">Capacity cost is user-entered, not live billing telemetry.</div>
                  </div>
                ) : (
                  <div className="text-xs text-slate-500 italic">
                    Configure connector to see live Copilot Studio data
                  </div>
                )}
                <button
                  onClick={() => setConfigureModal('copilot_studio')}
                  className="mt-3 w-full px-3 py-1.5 text-xs font-medium text-purple-700 bg-purple-50 rounded-lg hover:bg-purple-100 transition-colors"
                >
                  Configure Copilot Studio
                </button>
              </div>
            </div>
          </div>

          {/* Provider Detail Panel */}
          {selectedProvider && PROVIDER_FEATURES[selectedProvider as keyof typeof PROVIDER_FEATURES] && (
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="text-sm font-semibold text-slate-900">
                  {PROVIDER_FEATURES[selectedProvider as keyof typeof PROVIDER_FEATURES].fullName} — Capability Details
                </div>
                <button onClick={() => setSelectedProvider(null)} className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg p-1 transition-colors">
                  <Icon name="x-mark" className="w-5 h-5" />
                </button>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {Object.entries(PROVIDER_FEATURES[selectedProvider as keyof typeof PROVIDER_FEATURES].features).map(([key, feat]) => (
                  <div key={key} className="p-3 rounded-lg bg-slate-50">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-slate-700">{FEATURE_LABELS[key]}</span>
                      <span className={`text-sm font-bold ${feat.score >= 90 ? 'text-emerald-600' : feat.score >= 75 ? 'text-blue-600' : feat.score >= 60 ? 'text-amber-600' : 'text-rose-600'}`}>
                        {feat.score}%
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-500">{feat.label}</div>
                    <div className="text-[9px] text-slate-400 mt-1">{feat.detail}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Feature Comparison Radar */}
          <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
            <div className="text-sm font-semibold text-slate-900 mb-4">Cloud Provider Feature Comparison</div>
            <ResponsiveContainer width="100%" height={350}>
              <RadarChart data={radarData}>
                <PolarGrid stroke="#e2e8f0" />
                <PolarAngleAxis dataKey="feature" tick={{ fill: '#475569', fontSize: 10 }} />
                <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fill: '#94a3b8', fontSize: 9 }} />
                <Radar name="AWS Bedrock" dataKey="aws" stroke="#FF9900" fill="#FF9900" fillOpacity={0.3} />
                <Radar name="Azure AI Foundry" dataKey="azure" stroke="#0078D4" fill="#0078D4" fillOpacity={0.3} />
                <Radar name="Google Vertex AI" dataKey="gcp" stroke="#4285F4" fill="#4285F4" fillOpacity={0.3} />
                <Legend />
                <Tooltip contentStyle={tooltipStyle} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ════════════════════════════════ ANALYTICS TAB ════════════════════════════════ */}
      {activeTab === 'analytics' && (
        <div className="space-y-6">
          {/* Sub-tabs */}
          <div className="flex gap-1 p-1 bg-slate-100/80 rounded-lg w-fit">
            {ANALYTICS_SUB_TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setAnalyticsSubTab(tab.id)}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  analyticsSubTab === tab.id
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Cost Trends */}
          {analyticsSubTab === 'cost' && (
            <div className="space-y-6">
              <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
                <div className="text-sm font-semibold text-slate-900 mb-4">Cost Trends by Provider (6 Month)</div>
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={COST_TREND_DATA}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="month" tick={{ fill: '#475569', fontSize: 11 }} />
                    <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} tickFormatter={v => `$${v.toLocaleString()}`} />
                    <Tooltip contentStyle={tooltipStyle} formatter={((value: number) => [`$${value.toLocaleString()}`, '']) as Formatter<ValueType, NameType>} />
                    <Legend />
                    <Area type="monotone" dataKey="aws" name="AWS" stackId="1" stroke="#FF9900" fill="#FF9900" fillOpacity={0.6} />
                    <Area type="monotone" dataKey="azure" name="Azure" stackId="1" stroke="#0078D4" fill="#0078D4" fillOpacity={0.6} />
                    <Area type="monotone" dataKey="gcp" name="GCP" stackId="1" stroke="#4285F4" fill="#4285F4" fillOpacity={0.6} />
                    <Area type="monotone" dataKey="saas" name="SaaS" stackId="1" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.6} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
                <div className="text-sm font-semibold text-slate-900 mb-4">Cost Optimization Opportunities</div>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <div className="p-4 rounded-lg bg-emerald-50 border border-emerald-200">
                    <div className="flex items-center gap-2 mb-2">
                      <Icon name="arrow-trending-down" className="w-5 h-5 text-emerald-600" />
                      <span className="text-sm font-semibold text-emerald-800">Consolidation</span>
                    </div>
                    <div className="text-2xl font-bold text-emerald-700">$2,400/mo</div>
                    <div className="text-xs text-emerald-600 mt-1">Migrate Azure → AWS</div>
                  </div>
                  <div className="p-4 rounded-lg bg-blue-50 border border-blue-200">
                    <div className="flex items-center gap-2 mb-2">
                      <Icon name="cpu-chip" className="w-5 h-5 text-blue-600" />
                      <span className="text-sm font-semibold text-blue-800">Model Optimization</span>
                    </div>
                    <div className="text-2xl font-bold text-blue-700">$1,800/mo</div>
                    <div className="text-xs text-blue-600 mt-1">Use Haiku for simple tasks</div>
                  </div>
                  <div className="p-4 rounded-lg bg-violet-50 border border-violet-200">
                    <div className="flex items-center gap-2 mb-2">
                      <Icon name="clock" className="w-5 h-5 text-violet-600" />
                      <span className="text-sm font-semibold text-violet-800">Reserved Capacity</span>
                    </div>
                    <div className="text-2xl font-bold text-violet-700">$3,200/mo</div>
                    <div className="text-xs text-violet-600 mt-1">1-year commitment savings</div>
                  </div>
                </div>
              </div>

              {/* Cost Per Invocation Type */}
              <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
                <div className="text-sm font-semibold text-slate-900 mb-4">Cost Per Invocation Type</div>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={COST_PER_INVOCATION} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 10 }} tickFormatter={v => `$${v.toFixed(3)}`} />
                    <YAxis dataKey="type" type="category" tick={{ fill: '#475569', fontSize: 11 }} width={110} />
                    <Tooltip contentStyle={tooltipStyle} formatter={((value: number) => [`$${value.toFixed(4)}`, '']) as Formatter<ValueType, NameType>} />
                    <Legend />
                    <Bar dataKey="aws" name="AWS" fill="#FF9900" />
                    <Bar dataKey="azure" name="Azure" fill="#0078D4" />
                    <Bar dataKey="gcp" name="GCP" fill="#4285F4" />
                  </BarChart>
                </ResponsiveContainer>
                <div className="mt-3 text-xs text-slate-500 italic">
                  Cost includes model inference, input/output tokens, and orchestration overhead per invocation type.
                </div>
              </div>
            </div>
          )}

          {/* Performance */}
          {analyticsSubTab === 'performance' && (
            <div className="space-y-6">
              <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
                <div className="text-sm font-semibold text-slate-900 mb-4">Performance Comparison</div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50/50">
                        <th scope="col" className="text-left px-4 py-3 font-medium text-slate-600">Provider</th>
                        <th scope="col" className="text-center px-4 py-3 font-medium text-slate-600">Avg Latency</th>
                        <th scope="col" className="text-center px-4 py-3 font-medium text-slate-600">Throughput</th>
                        <th scope="col" className="text-center px-4 py-3 font-medium text-slate-600">Error Rate</th>
                        <th scope="col" className="text-center px-4 py-3 font-medium text-slate-600">Uptime</th>
                      </tr>
                    </thead>
                    <tbody>
                      {PERFORMANCE_DATA.map(row => (
                        <tr key={row.provider} className="border-t border-slate-100 hover:bg-slate-50/50">
                          <td className="px-4 py-3 font-medium text-slate-900">{row.provider}</td>
                          <td className="px-4 py-3 text-center">
                            <span className={`font-semibold ${row.latency < 300 ? 'text-emerald-600' : row.latency < 400 ? 'text-amber-600' : 'text-rose-600'}`}>
                              {row.latency}ms
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center text-slate-700">{row.throughput.toLocaleString()} req/day</td>
                          <td className="px-4 py-3 text-center">
                            <span className={`font-semibold ${row.errorRate < 0.15 ? 'text-emerald-600' : row.errorRate < 0.2 ? 'text-amber-600' : 'text-rose-600'}`}>
                              {row.errorRate}%
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={`font-semibold ${row.uptime >= 99.95 ? 'text-emerald-600' : row.uptime >= 99.9 ? 'text-amber-600' : 'text-rose-600'}`}>
                              {row.uptime}%
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
                <div className="text-sm font-semibold text-slate-900 mb-4">Latency Comparison</div>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={PERFORMANCE_DATA} layout="vertical" margin={{ left: 10, right: 30 }}>
                    <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 10 }} tickFormatter={v => `${v}ms`} />
                    <YAxis type="category" dataKey="provider" tick={{ fill: '#475569', fontSize: 11 }} width={100} />
                    <Tooltip contentStyle={tooltipStyle} formatter={((value: number) => [`${value}ms`, 'Avg Latency']) as Formatter<ValueType, NameType>} />
                    <Bar dataKey="latency" fill="#6366f1" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Migration Planning */}
          {analyticsSubTab === 'migration' && (
            <div className="space-y-6">
              <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
                <div className="text-sm font-semibold text-slate-900 mb-4">Migration Scenarios</div>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  {MIGRATION_SCENARIOS.map(scenario => (
                    <div
                      key={scenario.id}
                      {...rowButtonProps(() => setSelectedMigration(selectedMigration === scenario.id ? null : scenario.id), `Select migration scenario ${scenario.title}`)}
                      aria-pressed={selectedMigration === scenario.id}
                      className={`p-4 rounded-lg border cursor-pointer transition-all focus-visible:ring-2 focus-visible:ring-blue-400 focus:outline-none ${
                        selectedMigration === scenario.id
                          ? 'border-blue-300 bg-blue-50/50 shadow-sm'
                          : 'border-slate-200 hover:border-slate-300 hover:shadow-sm'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{ backgroundColor: AGENT_PROVIDER_CONFIG[scenario.from as AgentProvider]?.color || '#6366f1' }}>
                            <Icon name="arrow-right" className="w-3 h-3 text-white" />
                          </div>
                          <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{ backgroundColor: AGENT_PROVIDER_CONFIG[scenario.to as AgentProvider]?.color || '#6366f1' }}>
                            <Icon name="check" className="w-3 h-3 text-white" />
                          </div>
                        </div>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${complexityColor(scenario.complexity)}`}>
                          {scenario.complexity.toUpperCase()}
                        </span>
                      </div>
                      <div className="text-sm font-semibold text-slate-900 mb-1">{scenario.title}</div>
                      <div className="flex items-center gap-3 text-xs text-slate-500 mb-2">
                        <span>{scenario.agents} agents</span>
                        <span>•</span>
                        <span>{scenario.effort}</span>
                      </div>
                      <div className="flex items-center gap-4 text-xs">
                        <div className="text-emerald-600 font-medium">${scenario.estimatedSavings}/mo savings</div>
                        <div className="text-blue-600 font-medium">-{scenario.riskReduction}% risk</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {selectedMigration && (
                <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
                  {(() => {
                    const scenario = MIGRATION_SCENARIOS.find(s => s.id === selectedMigration);
                    if (!scenario) return null;

                    return (
                      <div className="space-y-5">
                        <div className="flex items-center justify-between">
                          <div className="text-sm font-semibold text-slate-900">{scenario.title} — Detailed Plan</div>
                          <button onClick={() => setSelectedMigration(null)} className="text-slate-400 hover:text-slate-600">
                            <Icon name="x-mark" className="w-5 h-5" />
                          </button>
                        </div>

                        {/* Timeline */}
                        <div>
                          <div className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-3">Migration Timeline</div>
                          <div className="flex gap-2">
                            {scenario.steps.map((step, i) => (
                              <div key={i} className="flex-1 p-3 rounded-lg bg-slate-50 border border-slate-200">
                                <div className="text-xs font-semibold text-slate-900 mb-1">{step.phase}</div>
                                <div className="text-[10px] text-slate-500 mb-2">{step.duration}</div>
                                <ul className="space-y-1">
                                  {step.tasks.map((task, j) => (
                                    <li key={j} className="text-[10px] text-slate-600 flex items-start gap-1">
                                      <span className="text-slate-400">•</span>{task}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                          <div>
                            <div className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2">Considerations</div>
                            <ul className="space-y-2">
                              {scenario.considerations.map((item, i) => (
                                <li key={i} className="flex items-start gap-2 text-sm text-slate-600">
                                  <Icon name="exclamation-triangle" className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                                  {item}
                                </li>
                              ))}
                            </ul>
                          </div>
                          <div>
                            <div className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2">Benefits</div>
                            <ul className="space-y-2">
                              {scenario.benefits.map((item, i) => (
                                <li key={i} className="flex items-start gap-2 text-sm text-slate-600">
                                  <Icon name="check-circle" className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                                  {item}
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>

                        <div className="flex gap-3 pt-4 border-t border-slate-200">
                          <button
                            onClick={() => {
                              setToast('Migration assessment started — analysis will be ready shortly');
                              setTimeout(() => setToast(null), 2800);
                            }}
                            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
                          >
                            Start Migration Assessment
                          </button>
                          <button
                            onClick={() => {
                              setToast('Exporting migration plan to CSV...');
                              setTimeout(() => setToast(null), 2800);
                            }}
                            className="px-4 py-2 border border-slate-200 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors"
                          >
                            Export Plan
                          </button>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* Full Migration Matrix - All 6 Paths */}
              <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
                <div className="text-sm font-semibold text-slate-900 mb-4">Complete Migration Matrix (All Paths)</div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50/50">
                        <th scope="col" className="text-left px-3 py-2 font-medium text-slate-600">Path</th>
                        <th scope="col" className="text-center px-3 py-2 font-medium text-slate-600">Complexity</th>
                        <th scope="col" className="text-center px-3 py-2 font-medium text-slate-600">Risk</th>
                        <th scope="col" className="text-center px-3 py-2 font-medium text-slate-600">Effort</th>
                        <th scope="col" className="text-left px-3 py-2 font-medium text-slate-600">Guardrail Mapping</th>
                        <th scope="col" className="text-left px-3 py-2 font-medium text-slate-600">Model Mapping</th>
                      </tr>
                    </thead>
                    <tbody>
                      {MIGRATION_MATRIX.map((row, i) => (
                        <tr key={i} className="border-t border-slate-100 hover:bg-slate-50/50">
                          <td className="px-3 py-2 font-medium text-slate-900">{row.from} → {row.to}</td>
                          <td className="px-3 py-2 text-center">
                            <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-semibold ${
                              row.complexity === 'Low' ? 'bg-emerald-100 text-emerald-700' :
                              row.complexity === 'Medium' ? 'bg-amber-100 text-amber-700' :
                              'bg-rose-100 text-rose-700'
                            }`}>{row.complexity}</span>
                          </td>
                          <td className="px-3 py-2 text-center">
                            <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-semibold ${
                              row.risk === 'Low' ? 'bg-emerald-100 text-emerald-700' :
                              row.risk === 'Medium' ? 'bg-amber-100 text-amber-700' :
                              'bg-rose-100 text-rose-700'
                            }`}>{row.risk}</span>
                          </td>
                          <td className="px-3 py-2 text-center text-slate-700">{row.effort}</td>
                          <td className="px-3 py-2 text-xs text-slate-600">{row.guardrails}</td>
                          <td className="px-3 py-2 text-xs text-slate-600">{row.models}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════ POLICIES TAB ════════════════════════════════ */}
      {activeTab === 'policies' && (
        <div className="space-y-6">
          <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
            <div className="text-sm font-semibold text-slate-900 mb-4">Policy Enforcement Status by Provider</div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50/50">
                    <th scope="col" className="text-left px-4 py-3 font-medium text-slate-600">Provider</th>
                    <th scope="col" className="text-center px-4 py-3 font-medium text-slate-600">Agents</th>
                    <th scope="col" className="text-center px-4 py-3 font-medium text-slate-600">Compliant</th>
                    <th scope="col" className="text-center px-4 py-3 font-medium text-slate-600">Review Needed</th>
                    <th scope="col" className="text-center px-4 py-3 font-medium text-slate-600">Blocked</th>
                    <th scope="col" className="text-center px-4 py-3 font-medium text-slate-600">Coverage</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(providerStats).map(([provider, stats]) => {
                    const config = AGENT_PROVIDER_CONFIG[provider as AgentProvider];
                    if (!config || stats.count === 0) return null;
                    const coverage = Math.round((stats.compliant / stats.count) * 100);

                    return (
                      <tr key={provider} className="border-t border-slate-100 hover:bg-slate-50/50">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: config.color }} />
                            <span className="font-medium text-slate-900">{config.label}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center font-medium text-slate-900">{stats.count}</td>
                        <td className="px-4 py-3 text-center">
                          <span className="text-emerald-600 font-semibold">{stats.compliant}</span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={stats.reviewNeeded > 0 ? 'text-amber-600 font-semibold' : 'text-slate-400'}>{stats.reviewNeeded}</span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={stats.blocked > 0 ? 'text-rose-600 font-semibold' : 'text-slate-400'}>{stats.blocked}</span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <div className="w-16 h-2 bg-slate-100 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full ${coverage >= 90 ? 'bg-emerald-500' : coverage >= 70 ? 'bg-amber-500' : 'bg-rose-500'}`} style={{ width: `${coverage}%` }} />
                            </div>
                            <span className={`text-xs font-semibold ${coverage >= 90 ? 'text-emerald-600' : coverage >= 70 ? 'text-amber-600' : 'text-rose-600'}`}>{coverage}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
              <div className="text-sm font-semibold text-slate-900 mb-4">Policy Framework Support</div>
              <div className="space-y-3">
                {[
                  { name: 'Cedar (AWS)', providers: ['aws'], color: '#FF9900' },
                  { name: 'Azure Policy', providers: ['azure'], color: '#0078D4' },
                  { name: 'OPA/Rego', providers: ['aws', 'gcp'], color: '#6366f1' },
                  { name: 'Bedrock Guardrails', providers: ['aws'], color: '#FF9900' },
                  { name: 'Content Safety', providers: ['azure', 'copilot_studio'], color: '#0078D4' },
                ].map(fw => (
                  <div key={fw.name} className="flex items-center justify-between p-2 rounded-lg bg-slate-50">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: fw.color }} />
                      <span className="text-sm text-slate-700">{fw.name}</span>
                    </div>
                    <div className="flex gap-1">
                      {fw.providers.map(p => {
                        const config = AGENT_PROVIDER_CONFIG[p as AgentProvider];
                        return config ? (
                          <span key={p} className="text-[9px] px-1.5 py-0.5 rounded" style={{ backgroundColor: `${config.color}20`, color: config.color }}>
                            {config.label}
                          </span>
                        ) : null;
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl border border-blue-200/60 p-5">
              <div className="text-sm font-semibold text-slate-900 mb-2">Unified Policy Enforcement</div>
              <p className="text-xs text-slate-600 mb-4">
                Apply consistent Cedar policies across all providers from a single control plane.
                AVA's AgentCore Gateway evaluates policies at runtime regardless of underlying provider.
              </p>
              <div className="flex gap-3">
                <Link
                  to="/secure/policy"
                  className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Manage Policies
                </Link>
                <Link
                  to="/secure/guardrails"
                  className="px-4 py-2 border border-blue-200 text-blue-700 text-sm font-medium rounded-lg hover:bg-blue-50 transition-colors"
                >
                  Configure Guardrails
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Toast notification. The warning variant carries a full sentence from the backend
          rather than a three-word confirmation, so it needs a width and a dismiss control;
          the success variant keeps its original single-line shape. */}
      {toast && (
        <div
          className={
            toastVariant === 'warning'
              ? 'fixed bottom-4 right-4 max-w-md bg-amber-50 border border-amber-300 text-amber-900 px-4 py-3 rounded-lg shadow-lg z-50 animate-fade-in flex items-start gap-3'
              : 'fixed bottom-4 right-4 bg-slate-800 text-white px-4 py-3 rounded-lg shadow-lg z-50 animate-fade-in'
          }
          role={toastVariant === 'warning' ? 'alert' : 'status'}
        >
          {toastVariant === 'warning' && (
            <Icon name="exclamation-triangle" className="w-5 h-5 flex-shrink-0 mt-0.5 text-amber-600" />
          )}
          <span className="flex-1">{toast}</span>
          {toastVariant === 'warning' && (
            <button
              onClick={() => setToast(null)}
              className="text-amber-700 hover:text-amber-900 flex-shrink-0"
              aria-label="Dismiss"
            >
              <Icon name="x-mark" className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      {/* Configuration Modal */}
      {configureModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">
                Configure {configureModal === 'copilot_studio' ? 'Copilot Studio' : configureModal.charAt(0).toUpperCase() + configureModal.slice(1)} Connector
              </h2>
              <button onClick={() => setConfigureModal(null)} className="text-slate-400 hover:text-slate-600">
                <Icon name="x-mark" className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {configError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-sm text-rose-700">
                  {configError}
                </div>
              )}

              {/* Azure Form */}
              {configureModal === 'azure' && (
                <>
                  <p className="text-sm text-slate-600 mb-4">
                    Enter your Azure AD service principal credentials. These will be stored securely in AWS Secrets Manager.
                  </p>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Tenant ID</label>
                    <input
                      type="text"
                      value={azureForm.tenant_id}
                      onChange={e => setAzureForm({ ...azureForm, tenant_id: e.target.value })}
                      placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Client ID (Application ID)</label>
                    <input
                      type="text"
                      value={azureForm.client_id}
                      onChange={e => setAzureForm({ ...azureForm, client_id: e.target.value })}
                      placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Client Secret</label>
                    <input
                      type="password"
                      value={azureForm.client_secret}
                      onChange={e => setAzureForm({ ...azureForm, client_secret: e.target.value })}
                      placeholder="Enter client secret"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Subscription ID</label>
                    <input
                      type="text"
                      value={azureForm.subscription_id}
                      onChange={e => setAzureForm({ ...azureForm, subscription_id: e.target.value })}
                      placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                    />
                  </div>
                </>
              )}

              {/* GCP Form */}
              {configureModal === 'gcp' && (
                <>
                  <p className="text-sm text-slate-600 mb-4">
                    Enter your GCP service account credentials. These will be stored securely in AWS Secrets Manager.
                  </p>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Project ID</label>
                    <input
                      type="text"
                      value={gcpForm.project_id}
                      onChange={e => setGcpForm({ ...gcpForm, project_id: e.target.value })}
                      placeholder="my-gcp-project"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Service Account JSON Key</label>
                    <textarea
                      value={gcpForm.service_account_json}
                      onChange={e => setGcpForm({ ...gcpForm, service_account_json: e.target.value })}
                      placeholder='{"type": "service_account", "project_id": "...", ...}'
                      rows={4}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">BigQuery Billing Export Table (optional)</label>
                    <input
                      type="text"
                      value={gcpForm.billing_export_table}
                      onChange={e => setGcpForm({ ...gcpForm, billing_export_table: e.target.value })}
                      placeholder="project.dataset.table"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Vertex AI Location</label>
                    <input
                      type="text"
                      value={gcpForm.location}
                      onChange={e => setGcpForm({ ...gcpForm, location: e.target.value })}
                      placeholder="us-central1"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                    />
                  </div>
                </>
              )}

              {/* ServiceNow Form */}
              {configureModal === 'servicenow' && (
                <>
                  <p className="text-sm text-slate-600 mb-4">
                    Enter your ServiceNow OAuth credentials. Create an OAuth Application in ServiceNow with AI Agent Studio access.
                  </p>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Instance URL</label>
                    <input
                      type="text"
                      value={servicenowForm.instance_url}
                      onChange={e => setServicenowForm({ ...servicenowForm, instance_url: e.target.value })}
                      placeholder="https://dev12345.service-now.com"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">OAuth Client ID</label>
                    <input
                      type="text"
                      value={servicenowForm.client_id}
                      onChange={e => setServicenowForm({ ...servicenowForm, client_id: e.target.value })}
                      placeholder="Enter Client ID"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">OAuth Client Secret</label>
                    <input
                      type="password"
                      value={servicenowForm.client_secret}
                      onChange={e => setServicenowForm({ ...servicenowForm, client_secret: e.target.value })}
                      placeholder="Enter Client Secret"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Monthly License Cost ($)</label>
                    <input
                      type="number"
                      value={servicenowForm.monthly_license_cost}
                      onChange={e => setServicenowForm({ ...servicenowForm, monthly_license_cost: parseFloat(e.target.value) || 0 })}
                      placeholder="0"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                    />
                    <p className="text-xs text-slate-500 mt-1">Used for cost tracking (ServiceNow uses license-based pricing)</p>
                  </div>
                </>
              )}

              {/* Salesforce Form */}
              {configureModal === 'salesforce' && (
                <>
                  <p className="text-sm text-slate-600 mb-4">
                    Enter your Salesforce Connected App credentials. Enable OAuth with Client Credentials flow.
                  </p>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Client ID (Consumer Key)</label>
                    <input
                      type="text"
                      value={salesforceForm.client_id}
                      onChange={e => setSalesforceForm({ ...salesforceForm, client_id: e.target.value })}
                      placeholder="Enter Consumer Key"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Client Secret (Consumer Secret)</label>
                    <input
                      type="password"
                      value={salesforceForm.client_secret}
                      onChange={e => setSalesforceForm({ ...salesforceForm, client_secret: e.target.value })}
                      placeholder="Enter Consumer Secret"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Login URL</label>
                    <select
                      value={salesforceForm.login_url}
                      onChange={e => setSalesforceForm({ ...salesforceForm, login_url: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                    >
                      <option value="https://login.salesforce.com">Production (login.salesforce.com)</option>
                      <option value="https://test.salesforce.com">Sandbox (test.salesforce.com)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Monthly License Cost ($)</label>
                    <input
                      type="number"
                      value={salesforceForm.monthly_license_cost}
                      onChange={e => setSalesforceForm({ ...salesforceForm, monthly_license_cost: parseFloat(e.target.value) || 0 })}
                      placeholder="0"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                    />
                    <p className="text-xs text-slate-500 mt-1">Used for cost tracking (Salesforce uses license-based pricing)</p>
                  </div>
                </>
              )}

              {/* Copilot Studio Form */}
              {configureModal === 'copilot_studio' && (
                <>
                  <p className="text-sm text-slate-600 mb-4">
                    Enter your Azure AD credentials for Power Platform access. Requires Power Platform Admin permissions.
                  </p>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Azure AD Tenant ID</label>
                    <input
                      type="text"
                      value={copilotForm.tenant_id}
                      onChange={e => setCopilotForm({ ...copilotForm, tenant_id: e.target.value })}
                      placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Client ID (Application ID)</label>
                    <input
                      type="text"
                      value={copilotForm.client_id}
                      onChange={e => setCopilotForm({ ...copilotForm, client_id: e.target.value })}
                      placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Client Secret</label>
                    <input
                      type="password"
                      value={copilotForm.client_secret}
                      onChange={e => setCopilotForm({ ...copilotForm, client_secret: e.target.value })}
                      placeholder="Enter client secret"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Power Platform Environment ID</label>
                    <input
                      type="text"
                      value={copilotForm.environment_id}
                      onChange={e => setCopilotForm({ ...copilotForm, environment_id: e.target.value })}
                      placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                    />
                    <p className="text-xs text-slate-500 mt-1">Find in Power Platform Admin Center → Environments</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Monthly Capacity Cost ($)</label>
                    <input
                      type="number"
                      value={copilotForm.monthly_capacity_cost}
                      onChange={e => setCopilotForm({ ...copilotForm, monthly_capacity_cost: parseFloat(e.target.value) || 0 })}
                      placeholder="0"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                    />
                    <p className="text-xs text-slate-500 mt-1">Used for cost tracking (Copilot Studio uses capacity-based pricing)</p>
                  </div>
                </>
              )}
            </div>
            {/* Test Result Display */}
            {testResult && (
              <div className={`mx-6 mb-4 p-3 rounded-lg border ${testResult.success ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'}`}>
                <div className="flex items-center gap-2">
                  <Icon name={testResult.success ? 'check-circle' : 'x-circle'} className={`w-5 h-5 ${testResult.success ? 'text-emerald-600' : 'text-rose-600'}`} />
                  <span className={`text-sm font-medium ${testResult.success ? 'text-emerald-700' : 'text-rose-700'}`}>
                    {testResult.message}
                  </span>
                  {testResult.latency_ms && (
                    <span className="text-xs text-slate-500 ml-auto">{testResult.latency_ms}ms</span>
                  )}
                </div>
              </div>
            )}

            <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between">
              <button
                onClick={() => handleDeleteConfig(configureModal)}
                className="text-sm text-rose-600 hover:text-rose-700 font-medium"
              >
                Remove Connector
              </button>
              <div className="flex gap-3">
                <button
                  onClick={handleTestConnection}
                  disabled={testingConnection}
                  className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 disabled:opacity-50"
                >
                  {testingConnection ? 'Testing...' : 'Test Connection'}
                </button>
                <button
                  onClick={() => { setConfigureModal(null); setTestResult(null); }}
                  className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveConfig}
                  disabled={configSaving}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {configSaving ? 'Saving...' : 'Save Configuration'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </GovernPageLayout>
  );
}
