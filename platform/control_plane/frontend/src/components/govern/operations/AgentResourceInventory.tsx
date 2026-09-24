/**
 * AgentResourceInventory - Complete Agent Resource & Control Mapping
 *
 * Shows the full picture of what controls and resources are linked to each agent:
 * - AgentCore Policies (Cedar policies, policy packs)
 * - Bedrock Guardrails (topic filters, PII, content filters)
 * - Knowledge Bases (data sources, S3, OpenSearch)
 * - IAM (execution role, policies, permission boundaries)
 * - Action Groups (Lambda, API schemas)
 * - Model Access (foundation models, inference profiles)
 * - Network (VPC, security groups, endpoints)
 * - Observability (CloudWatch, X-Ray, Langfuse)
 *
 * Answers: "What exactly is governing this agent?"
 */

import { useState, useMemo, useEffect } from 'react';
import { Icon } from '../icons';
import StatCard from '../StatCard';
import { MockDataBadge, LiveDataBadge } from '../DataSourceIndicator';
import CoreBadge from '../CoreBadge';
import Drawer from '../Drawer';
import { useAgentResourceData, type AgentResourceSummary } from './useReportsLiveData';

// ============================================================================
// Types
// ============================================================================

type ControlCategory = 'platform' | 'policy' | 'guardrail' | 'data' | 'custom';
// 'unassessed' is a first-class state, not a missing value: a governance risk tier is a
// recorded human judgement. Discovered AWS agents arrive without one, and the live mapper
// used to guess it by substring-matching the agent NAME with a fall-through to 'low' - the
// most permissive tier - so an unreviewed production agent was badged Low next to a
// LiveDataBadge. Keeping it in the union (rather than making riskTier optional) keeps the
// RISK_TIER_CONFIG lookup total, so all four render sites report it without extra branches.
type RiskTier = 'critical' | 'high' | 'medium' | 'low' | 'unassessed';
type EnforcementMode = 'enforce' | 'monitor' | 'disabled';

interface AgentCorePolicy {
  id: string;
  name: string;
  version: string;
  enforcementMode: EnforcementMode;
  policyPack: string;
  cedarPolicies: string[];
  lastEvaluated: string;
  decisionsToday: number;
  denyRate: number;
}

interface GuardrailConfig {
  id: string;
  guardrailId: string;
  guardrailArn: string;
  name: string;
  version: string;
  status: 'READY' | 'CREATING' | 'FAILED';
  topicFilters: { name: string; type: 'DENY' | 'ALLOW'; examples: number }[];
  contentFilters: { type: string; strength: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' }[];
  piiConfig: { action: 'BLOCK' | 'ANONYMIZE'; types: string[] };
  wordFilters: { profanity: boolean; customWords: number };
  contextualGrounding: { enabled: boolean; threshold: number };
  invocationsToday: number;
  interventionRate: number;
}

interface KnowledgeBaseConfig {
  id: string;
  knowledgeBaseId: string;
  knowledgeBaseArn: string;
  name: string;
  description: string;
  status: 'ACTIVE' | 'CREATING' | 'FAILED';
  embeddingModel: string;
  dataSource: {
    type: 's3' | 'confluence' | 'sharepoint' | 'web-crawler';
    location: string;
    documentsIndexed: number;
    lastSync: string;
  };
  dataClassification: 'public' | 'internal' | 'confidential' | 'restricted';
  chunkingStrategy: string;
  vectorStore: {
    type: 'opensearch' | 'pinecone' | 'rds-postgres';
    endpoint?: string;
  };
}

interface IAMConfig {
  executionRole: {
    roleName: string;
    roleArn: string;
    trustPolicy: string[];
    permissionBoundary?: string;
    lastUsed: string;
  };
  attachedPolicies: {
    policyName: string;
    policyArn: string;
    type: 'AWS' | 'Customer';
    permissions: string[];
  }[];
  inlinePolicies: {
    name: string;
    permissions: string[];
  }[];
  resourcePolicies: {
    resource: string;
    allowedActions: string[];
  }[];
}

interface ActionGroupConfig {
  id: string;
  name: string;
  description: string;
  actionGroupExecutor: {
    type: 'lambda' | 'return-control';
    lambdaArn?: string;
  };
  apiSchema: {
    type: 's3' | 'inline';
    location?: string;
    operations: { name: string; method: string; path: string }[];
  };
  functionSchema?: {
    functions: { name: string; description: string; parameters: string[] }[];
  };
  parentActionSignature?: string;
}

interface ModelAccessConfig {
  primaryModel: {
    modelId: string;
    modelArn: string;
    provider: string;
    inferenceProfile?: string;
  };
  fallbackModels: {
    modelId: string;
    condition: string;
  }[];
  crossRegionInference: boolean;
  allowedRegions: string[];
  throughputConfig: {
    type: 'on-demand' | 'provisioned';
    provisionedUnits?: number;
  };
}

interface NetworkConfig {
  vpcEnabled: boolean;
  vpcId?: string;
  subnetIds?: string[];
  securityGroupIds?: string[];
  vpcEndpoints?: {
    service: string;
    endpointId: string;
    type: 'Interface' | 'Gateway';
  }[];
}

interface ObservabilityConfig {
  cloudwatch: {
    enabled: boolean;
    logGroup: string;
    metricsNamespace: string;
    retentionDays: number;
  };
  xray: {
    enabled: boolean;
    samplingRate: number;
  };
  langfuse: {
    enabled: boolean;
    projectId: string;
    publicKey: string;
  };
}

interface AgentResourceProfile {
  agentId: string;
  agentName: string;
  agentArn: string;
  aliasId: string;
  aliasName: string;
  description: string;
  status: 'ACTIVE' | 'CREATING' | 'FAILED' | 'DELETING';
  riskTier: RiskTier;
  businessUnit: string;
  owner: string;
  createdAt: string;
  lastInvoked: string;

  // Resource configurations
  agentCorePolicies: AgentCorePolicy[];
  guardrails: GuardrailConfig[];
  knowledgeBases: KnowledgeBaseConfig[];
  iam: IAMConfig;
  actionGroups: ActionGroupConfig[];
  modelAccess: ModelAccessConfig;
  network: NetworkConfig;
  observability: ObservabilityConfig;

  // Derived metrics
  totalControls: number;
  controlsByCategory: Record<ControlCategory, number>;
  complianceScore: number;
  lastAssessment: string;
}

// ============================================================================
// Inventory view model
// ----------------------------------------------------------------------------
// A single shape the selector, summary StatCards and top-level agent cards
// render from. It is populated either from live discovery (AgentResourceSummary
// = AgentCore/Bedrock agents + Guardrails + Deployments) or from the illustrative
// mock profiles. Deep per-agent configuration (Cedar policies, guardrail rules,
// KBs, IAM, action groups, network, observability) is only present for mock
// agents via `profile`; the live discovery APIs do not expose it.
// ============================================================================

interface InventoryAgent {
  agentId: string;
  agentName: string;
  description: string;
  riskTier: RiskTier;
  statusLabel: string;
  businessUnit: string;
  owner: string;
  lastInvoked?: string;
  region?: string;
  framework?: string;
  // Optional: the live discovery APIs do not report policy engines, knowledge bases or
  // action groups per agent. undefined means not retrieved and renders as an em-dash;
  // a 0 here would state the agent has none. `guardrailCount` joined this group because
  // deployment-sourced rows carry no guardrail data at all, so their previous 0 asserted
  // that the agent has no guardrails rather than that none was retrieved.
  policyCount?: number;
  guardrailCount?: number;
  knowledgeBaseCount?: number;
  actionGroupCount?: number;
  cedarRuleCount?: number;
  topicFilterCount?: number;
  documentCount?: number;
  operationCount?: number;
  iamPolicyCount?: number;
  vpcEnabled?: boolean;
  modelLabel?: string;
  complianceScore?: number;
  totalControls: number;
  invocations24h?: number;
  interventionRate?: number;
  isLive: boolean;
  profile?: AgentResourceProfile;
}

function mockProfileToInventory(p: AgentResourceProfile): InventoryAgent {
  return {
    agentId: p.agentId,
    agentName: p.agentName,
    description: p.description,
    riskTier: p.riskTier,
    statusLabel: p.status,
    businessUnit: p.businessUnit,
    owner: p.owner,
    lastInvoked: p.lastInvoked,
    policyCount: p.agentCorePolicies.length,
    guardrailCount: p.guardrails.length,
    knowledgeBaseCount: p.knowledgeBases.length,
    actionGroupCount: p.actionGroups.length,
    cedarRuleCount: p.agentCorePolicies.reduce((a, x) => a + x.cedarPolicies.length, 0),
    topicFilterCount: p.guardrails.reduce((a, g) => a + g.topicFilters.length, 0),
    documentCount: p.knowledgeBases.reduce((a, kb) => a + kb.dataSource.documentsIndexed, 0),
    operationCount: p.actionGroups.reduce((a, ag) => a + ag.apiSchema.operations.length, 0),
    iamPolicyCount: p.iam.attachedPolicies.length,
    vpcEnabled: p.network.vpcEnabled,
    modelLabel: p.modelAccess.primaryModel.modelId.split('.').pop(),
    complianceScore: p.complianceScore,
    totalControls: p.totalControls,
    isLive: false,
    profile: p,
  };
}

function liveSummaryToInventory(s: AgentResourceSummary): InventoryAgent {
  return {
    agentId: s.agentId,
    agentName: s.agentName,
    description: `${s.framework} agent${s.businessUnit ? ` · ${s.businessUnit}` : ''}`,
    riskTier: s.riskTier,
    statusLabel: s.status.toUpperCase(),
    businessUnit: s.businessUnit ?? 'General',
    owner: s.owner ?? 'Unassigned',
    lastInvoked: s.lastInvoked,
    region: s.region,
    framework: s.framework,
    policyCount: s.policyCount,
    guardrailCount: s.guardrailCount,
    knowledgeBaseCount: s.knowledgeBaseCount,
    actionGroupCount: s.actionGroupCount,
    modelLabel: s.framework,
    // Sum only the counts that were actually retrieved. Treating an unretrieved count as 0
    // silently understated the control total for every live agent.
    totalControls: (s.policyCount ?? 0) + (s.guardrailCount ?? 0) + (s.knowledgeBaseCount ?? 0) + (s.actionGroupCount ?? 0),
    invocations24h: s.invocations24h,
    interventionRate: s.interventionRate,
    // Carried from the summary, not hardcoded. `AgentResourceSummary.isLive` now reflects the
    // provenance of the response that produced the row (see useReportsLiveData), so asserting
    // `true` here would launder a seeded row into a live one - and this function is named for
    // its input, not for a guarantee about it.
    isLive: s.isLive,
  };
}

// ============================================================================
// Mock Data - Comprehensive Agent Resource Profiles
// ============================================================================

const MOCK_AGENT_PROFILES: AgentResourceProfile[] = [
  {
    agentId: 'AGENT001',
    agentName: 'Customer Service Agent',
    agentArn: 'arn:aws:bedrock:us-east-1:123456789012:agent/AGENT001',
    aliasId: 'ALIAS001',
    aliasName: 'production',
    description: 'Handles customer inquiries, account lookups, and basic troubleshooting',
    status: 'ACTIVE',
    riskTier: 'high',
    businessUnit: 'Customer Experience',
    owner: 'Sarah Chen',
    createdAt: '2026-03-15',
    lastInvoked: '2026-08-10T14:32:00Z',

    agentCorePolicies: [
      {
        id: 'acp-001',
        name: 'FSI Customer Data Policy',
        version: '2.1',
        enforcementMode: 'enforce',
        policyPack: 'fsi-standard',
        cedarPolicies: [
          'require-pii-masking',
          'deny-financial-advice',
          'require-human-escalation-high-value',
          'enforce-data-residency',
        ],
        lastEvaluated: '2026-08-10T14:32:00Z',
        decisionsToday: 1847,
        denyRate: 3.2,
      },
      {
        id: 'acp-002',
        name: 'Human Escalation Policy',
        version: '1.0',
        enforcementMode: 'enforce',
        policyPack: 'hitl-standard',
        cedarPolicies: [
          'escalate-complaint',
          'escalate-high-value-transaction',
          'escalate-regulatory-inquiry',
        ],
        lastEvaluated: '2026-08-10T13:15:00Z',
        decisionsToday: 234,
        denyRate: 18.5,
      },
    ],

    guardrails: [
      {
        id: 'gr-001',
        guardrailId: 'gr-fsi-customer-v2',
        guardrailArn: 'arn:aws:bedrock:us-east-1:123456789012:guardrail/gr-fsi-customer-v2',
        name: 'FSI Customer Service Guardrail',
        version: '2',
        status: 'READY',
        topicFilters: [
          { name: 'Financial Advice', type: 'DENY', examples: 45 },
          { name: 'Investment Recommendations', type: 'DENY', examples: 32 },
          { name: 'Competitor Discussion', type: 'DENY', examples: 18 },
          { name: 'Internal Processes', type: 'DENY', examples: 24 },
        ],
        contentFilters: [
          { type: 'HATE', strength: 'HIGH' },
          { type: 'INSULTS', strength: 'HIGH' },
          { type: 'SEXUAL', strength: 'HIGH' },
          { type: 'VIOLENCE', strength: 'HIGH' },
          { type: 'MISCONDUCT', strength: 'MEDIUM' },
          { type: 'PROMPT_ATTACK', strength: 'HIGH' },
        ],
        piiConfig: {
          action: 'ANONYMIZE',
          types: ['SSN', 'CREDIT_DEBIT_CARD_NUMBER', 'BANK_ACCOUNT_NUMBER', 'PHONE', 'EMAIL', 'ADDRESS'],
        },
        wordFilters: { profanity: true, customWords: 156 },
        contextualGrounding: { enabled: true, threshold: 0.7 },
        invocationsToday: 1847,
        interventionRate: 4.8,
      },
    ],

    knowledgeBases: [
      {
        id: 'kb-001',
        knowledgeBaseId: 'KB001',
        knowledgeBaseArn: 'arn:aws:bedrock:us-east-1:123456789012:knowledge-base/KB001',
        name: 'Product Documentation KB',
        description: 'Product manuals, FAQs, and troubleshooting guides',
        status: 'ACTIVE',
        embeddingModel: 'amazon.titan-embed-text-v2:0',
        dataSource: {
          type: 's3',
          location: 's3://acme-docs-prod/product-documentation/',
          documentsIndexed: 2847,
          lastSync: '2026-08-10T06:00:00Z',
        },
        dataClassification: 'internal',
        chunkingStrategy: 'SEMANTIC',
        vectorStore: {
          type: 'opensearch',
          endpoint: 'https://kb-prod.us-east-1.aoss.amazonaws.com',
        },
      },
      {
        id: 'kb-002',
        knowledgeBaseId: 'KB002',
        knowledgeBaseArn: 'arn:aws:bedrock:us-east-1:123456789012:knowledge-base/KB002',
        name: 'Customer Policy KB',
        description: 'Terms of service, privacy policy, and compliance documentation',
        status: 'ACTIVE',
        embeddingModel: 'amazon.titan-embed-text-v2:0',
        dataSource: {
          type: 's3',
          location: 's3://acme-docs-prod/policies/',
          documentsIndexed: 156,
          lastSync: '2026-08-09T06:00:00Z',
        },
        dataClassification: 'public',
        chunkingStrategy: 'FIXED_SIZE',
        vectorStore: {
          type: 'opensearch',
          endpoint: 'https://kb-prod.us-east-1.aoss.amazonaws.com',
        },
      },
    ],

    iam: {
      executionRole: {
        roleName: 'bedrock-agent-customer-service-role',
        roleArn: 'arn:aws:iam::123456789012:role/bedrock-agent-customer-service-role',
        trustPolicy: ['bedrock.amazonaws.com'],
        permissionBoundary: 'arn:aws:iam::123456789012:policy/AgentPermissionBoundary',
        lastUsed: '2026-08-10T14:32:00Z',
      },
      attachedPolicies: [
        {
          policyName: 'BedrockAgentKBAccess',
          policyArn: 'arn:aws:iam::123456789012:policy/BedrockAgentKBAccess',
          type: 'Customer',
          permissions: ['bedrock:Retrieve', 'bedrock:RetrieveAndGenerate'],
        },
        {
          policyName: 'BedrockModelInvoke',
          policyArn: 'arn:aws:iam::123456789012:policy/BedrockModelInvoke',
          type: 'Customer',
          permissions: ['bedrock:InvokeModel', 'bedrock:InvokeModelWithResponseStream'],
        },
        {
          policyName: 'CloudWatchLogsWrite',
          policyArn: 'arn:aws:iam::aws:policy/CloudWatchLogsFullAccess',
          type: 'AWS',
          permissions: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
        },
      ],
      inlinePolicies: [
        {
          name: 'CustomerDataAccess',
          permissions: ['dynamodb:GetItem', 'dynamodb:Query'],
        },
      ],
      resourcePolicies: [
        {
          resource: 's3://acme-docs-prod/*',
          allowedActions: ['s3:GetObject'],
        },
      ],
    },

    actionGroups: [
      {
        id: 'ag-001',
        name: 'CustomerAccountLookup',
        description: 'Look up customer account information and transaction history',
        actionGroupExecutor: {
          type: 'lambda',
          lambdaArn: 'arn:aws:lambda:us-east-1:123456789012:function:customer-account-lookup',
        },
        apiSchema: {
          type: 's3',
          location: 's3://acme-schemas/customer-api.yaml',
          operations: [
            { name: 'getCustomer', method: 'GET', path: '/customers/{customerId}' },
            { name: 'getTransactions', method: 'GET', path: '/customers/{customerId}/transactions' },
            { name: 'getAccountBalance', method: 'GET', path: '/accounts/{accountId}/balance' },
          ],
        },
      },
      {
        id: 'ag-002',
        name: 'TicketManagement',
        description: 'Create and update support tickets',
        actionGroupExecutor: {
          type: 'lambda',
          lambdaArn: 'arn:aws:lambda:us-east-1:123456789012:function:ticket-management',
        },
        apiSchema: {
          type: 'inline',
          operations: [
            { name: 'createTicket', method: 'POST', path: '/tickets' },
            { name: 'updateTicket', method: 'PUT', path: '/tickets/{ticketId}' },
            { name: 'escalateTicket', method: 'POST', path: '/tickets/{ticketId}/escalate' },
          ],
        },
      },
    ],

    modelAccess: {
      primaryModel: {
        modelId: 'anthropic.claude-sonnet-4-20250514',
        modelArn: 'arn:aws:bedrock:us-east-1::foundation-model/anthropic.claude-sonnet-4-20250514',
        provider: 'Anthropic',
        inferenceProfile: 'us.anthropic.claude-sonnet-4-20250514-v1:0',
      },
      fallbackModels: [
        { modelId: 'anthropic.claude-haiku-4-20250514', condition: 'rate-limit-exceeded' },
      ],
      crossRegionInference: true,
      allowedRegions: ['us-east-1', 'us-west-2'],
      throughputConfig: {
        type: 'on-demand',
      },
    },

    network: {
      vpcEnabled: true,
      vpcId: 'vpc-0abc123def456789',
      subnetIds: ['subnet-0abc123', 'subnet-0def456'],
      securityGroupIds: ['sg-0abc123'],
      vpcEndpoints: [
        { service: 'bedrock-runtime', endpointId: 'vpce-0abc123', type: 'Interface' },
        { service: 's3', endpointId: 'vpce-0def456', type: 'Gateway' },
        { service: 'dynamodb', endpointId: 'vpce-0ghi789', type: 'Gateway' },
      ],
    },

    observability: {
      cloudwatch: {
        enabled: true,
        logGroup: '/aws/bedrock/agents/customer-service',
        metricsNamespace: 'AVA/Agents/CustomerService',
        retentionDays: 90,
      },
      xray: {
        enabled: true,
        samplingRate: 0.1,
      },
      langfuse: {
        enabled: true,
        projectId: 'proj-customer-service',
        publicKey: 'pk-lf-****',
      },
    },

    totalControls: 18,
    controlsByCategory: {
      platform: 5,
      policy: 4,
      guardrail: 6,
      data: 2,
      custom: 1,
    },
    complianceScore: 94,
    lastAssessment: '2026-08-05',
  },
  {
    agentId: 'AGENT002',
    agentName: 'Underwriting Assistant',
    agentArn: 'arn:aws:bedrock:us-east-1:123456789012:agent/AGENT002',
    aliasId: 'ALIAS002',
    aliasName: 'production',
    description: 'Assists underwriters with risk assessment and policy recommendations',
    status: 'ACTIVE',
    riskTier: 'critical',
    businessUnit: 'Commercial Insurance',
    owner: 'Michael Torres',
    createdAt: '2026-02-20',
    lastInvoked: '2026-08-10T15:45:00Z',

    agentCorePolicies: [
      {
        id: 'acp-003',
        name: 'Underwriting Decision Policy',
        version: '3.0',
        enforcementMode: 'enforce',
        policyPack: 'fsi-underwriting',
        cedarPolicies: [
          'require-human-approval-all-decisions',
          'deny-automated-rejection',
          'require-bias-check',
          'enforce-fair-lending',
          'log-all-recommendations',
        ],
        lastEvaluated: '2026-08-10T15:45:00Z',
        decisionsToday: 423,
        denyRate: 0,
      },
      {
        id: 'acp-004',
        name: 'Model Risk Policy',
        version: '1.2',
        enforcementMode: 'enforce',
        policyPack: 'mrm-standard',
        cedarPolicies: [
          'require-model-validation',
          'enforce-drift-monitoring',
          'require-explainability',
        ],
        lastEvaluated: '2026-08-10T15:45:00Z',
        decisionsToday: 423,
        denyRate: 0,
      },
    ],

    guardrails: [
      {
        id: 'gr-002',
        guardrailId: 'gr-underwriting-v3',
        guardrailArn: 'arn:aws:bedrock:us-east-1:123456789012:guardrail/gr-underwriting-v3',
        name: 'Underwriting Guardrail',
        version: '3',
        status: 'READY',
        topicFilters: [
          { name: 'Discriminatory Factors', type: 'DENY', examples: 89 },
          { name: 'Protected Class Discussion', type: 'DENY', examples: 56 },
          { name: 'Rate Manipulation', type: 'DENY', examples: 23 },
        ],
        contentFilters: [
          { type: 'HATE', strength: 'HIGH' },
          { type: 'MISCONDUCT', strength: 'HIGH' },
          { type: 'PROMPT_ATTACK', strength: 'HIGH' },
        ],
        piiConfig: {
          action: 'BLOCK',
          types: ['SSN', 'DRIVER_LICENSE', 'PASSPORT_NUMBER', 'DATE_OF_BIRTH'],
        },
        wordFilters: { profanity: true, customWords: 234 },
        contextualGrounding: { enabled: true, threshold: 0.85 },
        invocationsToday: 423,
        interventionRate: 2.1,
      },
    ],

    knowledgeBases: [
      {
        id: 'kb-003',
        knowledgeBaseId: 'KB003',
        knowledgeBaseArn: 'arn:aws:bedrock:us-east-1:123456789012:knowledge-base/KB003',
        name: 'Underwriting Guidelines KB',
        description: 'Risk assessment criteria, pricing models, and regulatory requirements',
        status: 'ACTIVE',
        embeddingModel: 'amazon.titan-embed-text-v2:0',
        dataSource: {
          type: 's3',
          location: 's3://acme-underwriting/guidelines/',
          documentsIndexed: 1256,
          lastSync: '2026-08-10T04:00:00Z',
        },
        dataClassification: 'confidential',
        chunkingStrategy: 'SEMANTIC',
        vectorStore: {
          type: 'opensearch',
          endpoint: 'https://uw-prod.us-east-1.aoss.amazonaws.com',
        },
      },
      {
        id: 'kb-004',
        knowledgeBaseId: 'KB004',
        knowledgeBaseArn: 'arn:aws:bedrock:us-east-1:123456789012:knowledge-base/KB004',
        name: 'Claims History KB',
        description: 'Historical claims data and loss patterns',
        status: 'ACTIVE',
        embeddingModel: 'amazon.titan-embed-text-v2:0',
        dataSource: {
          type: 's3',
          location: 's3://acme-claims-data/aggregated/',
          documentsIndexed: 45678,
          lastSync: '2026-08-09T22:00:00Z',
        },
        dataClassification: 'restricted',
        chunkingStrategy: 'HIERARCHICAL',
        vectorStore: {
          type: 'opensearch',
          endpoint: 'https://claims-prod.us-east-1.aoss.amazonaws.com',
        },
      },
    ],

    iam: {
      executionRole: {
        roleName: 'bedrock-agent-underwriting-role',
        roleArn: 'arn:aws:iam::123456789012:role/bedrock-agent-underwriting-role',
        trustPolicy: ['bedrock.amazonaws.com'],
        permissionBoundary: 'arn:aws:iam::123456789012:policy/CriticalAgentPermissionBoundary',
        lastUsed: '2026-08-10T15:45:00Z',
      },
      attachedPolicies: [
        {
          policyName: 'UnderwritingKBAccess',
          policyArn: 'arn:aws:iam::123456789012:policy/UnderwritingKBAccess',
          type: 'Customer',
          permissions: ['bedrock:Retrieve', 'bedrock:RetrieveAndGenerate'],
        },
        {
          policyName: 'BedrockModelInvoke',
          policyArn: 'arn:aws:iam::123456789012:policy/BedrockModelInvoke',
          type: 'Customer',
          permissions: ['bedrock:InvokeModel'],
        },
        {
          policyName: 'SecretsReadOnly',
          policyArn: 'arn:aws:iam::123456789012:policy/SecretsReadOnly',
          type: 'Customer',
          permissions: ['secretsmanager:GetSecretValue'],
        },
      ],
      inlinePolicies: [
        {
          name: 'UnderwritingDataAccess',
          permissions: ['s3:GetObject', 'dynamodb:GetItem', 'dynamodb:Query'],
        },
      ],
      resourcePolicies: [
        {
          resource: 's3://acme-underwriting/*',
          allowedActions: ['s3:GetObject'],
        },
        {
          resource: 's3://acme-claims-data/*',
          allowedActions: ['s3:GetObject'],
        },
      ],
    },

    actionGroups: [
      {
        id: 'ag-003',
        name: 'RiskAssessment',
        description: 'Calculate risk scores and generate recommendations',
        actionGroupExecutor: {
          type: 'lambda',
          lambdaArn: 'arn:aws:lambda:us-east-1:123456789012:function:risk-assessment-engine',
        },
        apiSchema: {
          type: 's3',
          location: 's3://acme-schemas/risk-api.yaml',
          operations: [
            { name: 'calculateRiskScore', method: 'POST', path: '/risk/calculate' },
            { name: 'getHistoricalClaims', method: 'GET', path: '/claims/history/{policyId}' },
            { name: 'getLossRatio', method: 'GET', path: '/metrics/loss-ratio/{segment}' },
          ],
        },
      },
      {
        id: 'ag-004',
        name: 'PricingEngine',
        description: 'Generate premium quotes based on risk assessment',
        actionGroupExecutor: {
          type: 'lambda',
          lambdaArn: 'arn:aws:lambda:us-east-1:123456789012:function:pricing-engine',
        },
        apiSchema: {
          type: 's3',
          location: 's3://acme-schemas/pricing-api.yaml',
          operations: [
            { name: 'generateQuote', method: 'POST', path: '/quotes/generate' },
            { name: 'compareRates', method: 'POST', path: '/quotes/compare' },
          ],
        },
      },
    ],

    modelAccess: {
      primaryModel: {
        modelId: 'anthropic.claude-sonnet-4-20250514',
        modelArn: 'arn:aws:bedrock:us-east-1::foundation-model/anthropic.claude-sonnet-4-20250514',
        provider: 'Anthropic',
        inferenceProfile: 'us.anthropic.claude-sonnet-4-20250514-v1:0',
      },
      fallbackModels: [],
      crossRegionInference: false,
      allowedRegions: ['us-east-1'],
      throughputConfig: {
        type: 'provisioned',
        provisionedUnits: 2,
      },
    },

    network: {
      vpcEnabled: true,
      vpcId: 'vpc-0abc123def456789',
      subnetIds: ['subnet-0abc123', 'subnet-0def456'],
      securityGroupIds: ['sg-0critical123'],
      vpcEndpoints: [
        { service: 'bedrock-runtime', endpointId: 'vpce-0abc123', type: 'Interface' },
        { service: 's3', endpointId: 'vpce-0def456', type: 'Gateway' },
        { service: 'secretsmanager', endpointId: 'vpce-0jkl012', type: 'Interface' },
      ],
    },

    observability: {
      cloudwatch: {
        enabled: true,
        logGroup: '/aws/bedrock/agents/underwriting',
        metricsNamespace: 'AVA/Agents/Underwriting',
        retentionDays: 365,
      },
      xray: {
        enabled: true,
        samplingRate: 1.0,
      },
      langfuse: {
        enabled: true,
        projectId: 'proj-underwriting',
        publicKey: 'pk-lf-****',
      },
    },

    totalControls: 22,
    controlsByCategory: {
      platform: 6,
      policy: 5,
      guardrail: 5,
      data: 4,
      custom: 2,
    },
    complianceScore: 98,
    lastAssessment: '2026-08-08',
  },
  {
    agentId: 'AGENT003',
    agentName: 'Internal Knowledge Assistant',
    agentArn: 'arn:aws:bedrock:us-east-1:123456789012:agent/AGENT003',
    aliasId: 'ALIAS003',
    aliasName: 'production',
    description: 'Employee-facing assistant for HR, IT, and policy questions',
    status: 'ACTIVE',
    riskTier: 'medium',
    businessUnit: 'Corporate Services',
    owner: 'Lisa Park',
    createdAt: '2026-04-10',
    lastInvoked: '2026-08-10T16:00:00Z',

    agentCorePolicies: [
      {
        id: 'acp-005',
        name: 'Internal Use Policy',
        version: '1.0',
        enforcementMode: 'enforce',
        policyPack: 'internal-standard',
        cedarPolicies: [
          'require-employee-auth',
          'deny-external-data-share',
          'log-all-queries',
        ],
        lastEvaluated: '2026-08-10T16:00:00Z',
        decisionsToday: 3456,
        denyRate: 0.8,
      },
    ],

    guardrails: [
      {
        id: 'gr-003',
        guardrailId: 'gr-internal-v1',
        guardrailArn: 'arn:aws:bedrock:us-east-1:123456789012:guardrail/gr-internal-v1',
        name: 'Internal Assistant Guardrail',
        version: '1',
        status: 'READY',
        topicFilters: [
          { name: 'Salary Information', type: 'DENY', examples: 34 },
          { name: 'Performance Reviews', type: 'DENY', examples: 28 },
          { name: 'Termination Processes', type: 'DENY', examples: 15 },
        ],
        contentFilters: [
          { type: 'HATE', strength: 'HIGH' },
          { type: 'SEXUAL', strength: 'HIGH' },
          { type: 'PROMPT_ATTACK', strength: 'MEDIUM' },
        ],
        piiConfig: {
          action: 'ANONYMIZE',
          types: ['SSN', 'PHONE', 'EMAIL'],
        },
        wordFilters: { profanity: true, customWords: 45 },
        contextualGrounding: { enabled: true, threshold: 0.6 },
        invocationsToday: 3456,
        interventionRate: 1.2,
      },
    ],

    knowledgeBases: [
      {
        id: 'kb-005',
        knowledgeBaseId: 'KB005',
        knowledgeBaseArn: 'arn:aws:bedrock:us-east-1:123456789012:knowledge-base/KB005',
        name: 'Employee Handbook KB',
        description: 'HR policies, benefits, and procedures',
        status: 'ACTIVE',
        embeddingModel: 'amazon.titan-embed-text-v2:0',
        dataSource: {
          type: 'confluence',
          location: 'https://acme.atlassian.net/wiki/spaces/HR',
          documentsIndexed: 567,
          lastSync: '2026-08-10T02:00:00Z',
        },
        dataClassification: 'internal',
        chunkingStrategy: 'SEMANTIC',
        vectorStore: {
          type: 'opensearch',
          endpoint: 'https://internal-prod.us-east-1.aoss.amazonaws.com',
        },
      },
    ],

    iam: {
      executionRole: {
        roleName: 'bedrock-agent-internal-kb-role',
        roleArn: 'arn:aws:iam::123456789012:role/bedrock-agent-internal-kb-role',
        trustPolicy: ['bedrock.amazonaws.com'],
        lastUsed: '2026-08-10T16:00:00Z',
      },
      attachedPolicies: [
        {
          policyName: 'InternalKBAccess',
          policyArn: 'arn:aws:iam::123456789012:policy/InternalKBAccess',
          type: 'Customer',
          permissions: ['bedrock:Retrieve'],
        },
        {
          policyName: 'BedrockModelInvoke',
          policyArn: 'arn:aws:iam::123456789012:policy/BedrockModelInvoke',
          type: 'Customer',
          permissions: ['bedrock:InvokeModel'],
        },
      ],
      inlinePolicies: [],
      resourcePolicies: [],
    },

    actionGroups: [],

    modelAccess: {
      primaryModel: {
        modelId: 'anthropic.claude-haiku-4-20250514',
        modelArn: 'arn:aws:bedrock:us-east-1::foundation-model/anthropic.claude-haiku-4-20250514',
        provider: 'Anthropic',
      },
      fallbackModels: [],
      crossRegionInference: true,
      allowedRegions: ['us-east-1', 'us-west-2', 'eu-west-1'],
      throughputConfig: {
        type: 'on-demand',
      },
    },

    network: {
      vpcEnabled: false,
    },

    observability: {
      cloudwatch: {
        enabled: true,
        logGroup: '/aws/bedrock/agents/internal-kb',
        metricsNamespace: 'AVA/Agents/InternalKB',
        retentionDays: 30,
      },
      xray: {
        enabled: false,
        samplingRate: 0,
      },
      langfuse: {
        enabled: false,
        projectId: '',
        publicKey: '',
      },
    },

    totalControls: 8,
    controlsByCategory: {
      platform: 2,
      policy: 2,
      guardrail: 3,
      data: 1,
      custom: 0,
    },
    complianceScore: 87,
    lastAssessment: '2026-08-01',
  },
];

// ============================================================================
// Styling Constants
// ============================================================================

const RISK_TIER_CONFIG: Record<RiskTier, { bg: string; text: string; label: string }> = {
  critical: { bg: 'bg-rose-100', text: 'text-rose-700', label: 'Critical' },
  high: { bg: 'bg-orange-100', text: 'text-orange-700', label: 'High' },
  medium: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Medium' },
  low: { bg: 'bg-slate-100', text: 'text-slate-600', label: 'Low' },
  // Deliberately dimmer than `low` - an absent assessment must not read as a passing one.
  unassessed: { bg: 'bg-slate-50', text: 'text-slate-400', label: 'Not assessed' },
};

const CONTROL_CATEGORY_CONFIG: Record<ControlCategory, { bg: string; text: string; icon: string; label: string }> = {
  platform: { bg: 'bg-slate-100', text: 'text-slate-700', icon: 'server-stack', label: 'Platform' },
  policy: { bg: 'bg-indigo-100', text: 'text-indigo-700', icon: 'document-text', label: 'Policy' },
  guardrail: { bg: 'bg-blue-100', text: 'text-blue-700', icon: 'shield-check', label: 'Guardrail' },
  data: { bg: 'bg-emerald-100', text: 'text-emerald-700', icon: 'circle-stack', label: 'Data' },
  custom: { bg: 'bg-violet-100', text: 'text-violet-700', icon: 'puzzle-piece', label: 'Custom' },
};

const ENFORCEMENT_CONFIG: Record<EnforcementMode, { bg: string; text: string }> = {
  enforce: { bg: 'bg-emerald-100', text: 'text-emerald-700' },
  monitor: { bg: 'bg-amber-100', text: 'text-amber-700' },
  disabled: { bg: 'bg-slate-100', text: 'text-slate-500' },
};

const DATA_CLASSIFICATION_CONFIG: Record<string, { bg: string; text: string }> = {
  public: { bg: 'bg-slate-100', text: 'text-slate-600' },
  internal: { bg: 'bg-blue-100', text: 'text-blue-700' },
  confidential: { bg: 'bg-amber-100', text: 'text-amber-700' },
  restricted: { bg: 'bg-rose-100', text: 'text-rose-700' },
};

// ============================================================================
// Sub-Components
// ============================================================================

function AgentSelector({
  agents,
  selectedIds,
  onSelectionChange,
}: {
  agents: InventoryAgent[];
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
}) {
  const toggleAgent = (id: string) => {
    if (selectedIds.includes(id)) {
      onSelectionChange(selectedIds.filter(i => i !== id));
    } else {
      onSelectionChange([...selectedIds, id]);
    }
  };

  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-slate-900">Select Agents</h3>
        <div className="flex gap-2">
          <button
            onClick={() => onSelectionChange(agents.map(a => a.agentId))}
            className="text-xs text-indigo-600 hover:text-indigo-700"
          >
            Select All
          </button>
          <span className="text-slate-300">|</span>
          <button
            onClick={() => onSelectionChange([])}
            className="text-xs text-slate-500 hover:text-slate-700"
          >
            Clear
          </button>
        </div>
      </div>
      <div className="space-y-2">
        {agents.map(agent => {
          const riskConfig = RISK_TIER_CONFIG[agent.riskTier];
          const isSelected = selectedIds.includes(agent.agentId);
          return (
            <button
              key={agent.agentId}
              onClick={() => toggleAgent(agent.agentId)}
              className={`w-full flex items-center gap-3 p-3 rounded-lg border transition ${
                isSelected
                  ? 'bg-indigo-50 border-indigo-200'
                  : 'bg-white border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                isSelected ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300'
              }`}>
                {isSelected && <Icon name="check" className="w-3 h-3 text-white" />}
              </div>
              <div className="flex-1 text-left">
                <div className="text-sm font-medium text-slate-900">{agent.agentName}</div>
                <div className="text-[10px] text-slate-500">{agent.businessUnit} · {agent.owner}</div>
              </div>
              <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${riskConfig.bg} ${riskConfig.text}`}>
                {riskConfig.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ResourceSection({
  title,
  icon,
  count,
  children,
  defaultExpanded = true,
}: {
  title: string;
  icon: string;
  count: number;
  children: React.ReactNode;
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-4 hover:bg-slate-50 transition"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center">
            <Icon name={icon as any} className="w-4 h-4 text-slate-600" />
          </div>
          <div className="text-left">
            <div className="text-sm font-semibold text-slate-900">{title}</div>
            <div className="text-[10px] text-slate-500">{count} configured</div>
          </div>
        </div>
        <Icon
          name={expanded ? 'chevron-up' : 'chevron-down'}
          className="w-5 h-5 text-slate-400"
        />
      </button>
      {expanded && (
        <div className="px-4 pb-4 border-t border-slate-100">
          {children}
        </div>
      )}
    </div>
  );
}

function PolicyCard({ policy }: { policy: AgentCorePolicy }) {
  const enfConfig = ENFORCEMENT_CONFIG[policy.enforcementMode];

  return (
    <div className="mt-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
      <div className="flex items-start justify-between mb-2">
        <div>
          <div className="text-sm font-medium text-slate-900">{policy.name}</div>
          <div className="text-[10px] text-slate-500">
            Pack: {policy.policyPack} · v{policy.version}
          </div>
        </div>
        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${enfConfig.bg} ${enfConfig.text}`}>
          {policy.enforcementMode}
        </span>
      </div>
      <div className="flex flex-wrap gap-1 mb-2">
        {policy.cedarPolicies.map((cp, i) => (
          <span key={i} className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 text-[10px] font-mono">
            {cp}
          </span>
        ))}
      </div>
      <div className="flex items-center gap-4 text-[10px] text-slate-500">
        <span>{policy.decisionsToday.toLocaleString()} decisions today</span>
        <span>{policy.denyRate}% deny rate</span>
      </div>
    </div>
  );
}

function GuardrailCard({ guardrail }: { guardrail: GuardrailConfig }) {
  return (
    <div className="mt-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
      <div className="flex items-start justify-between mb-2">
        <div>
          <div className="text-sm font-medium text-slate-900">{guardrail.name}</div>
          <div className="text-[10px] text-slate-500 font-mono">{guardrail.guardrailId} · v{guardrail.version}</div>
        </div>
        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
          guardrail.status === 'READY' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
        }`}>
          {guardrail.status}
        </span>
      </div>

      {/* Topic Filters */}
      <div className="mb-2">
        <div className="text-[10px] font-medium text-slate-600 mb-1">Topic Filters ({guardrail.topicFilters.length})</div>
        <div className="flex flex-wrap gap-1">
          {guardrail.topicFilters.map((tf, i) => (
            <span key={i} className={`px-2 py-0.5 rounded text-[10px] ${
              tf.type === 'DENY' ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'
            }`}>
              {tf.name}
            </span>
          ))}
        </div>
      </div>

      {/* Content Filters */}
      <div className="mb-2">
        <div className="text-[10px] font-medium text-slate-600 mb-1">Content Filters</div>
        <div className="flex flex-wrap gap-1">
          {guardrail.contentFilters.filter(cf => cf.strength !== 'NONE').map((cf, i) => (
            <span key={i} className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 text-[10px]">
              {cf.type}: {cf.strength}
            </span>
          ))}
        </div>
      </div>

      {/* PII Config */}
      <div className="mb-2">
        <div className="text-[10px] font-medium text-slate-600 mb-1">PII Protection ({guardrail.piiConfig.action})</div>
        <div className="flex flex-wrap gap-1">
          {guardrail.piiConfig.types.map((type, i) => (
            <span key={i} className="px-2 py-0.5 rounded bg-amber-50 text-amber-700 text-[10px]">
              {type}
            </span>
          ))}
        </div>
      </div>

      {/* Metrics */}
      <div className="flex items-center gap-4 text-[10px] text-slate-500 pt-2 border-t border-slate-200">
        <span>{guardrail.invocationsToday.toLocaleString()} invocations today</span>
        <span>{guardrail.interventionRate}% intervention rate</span>
        {guardrail.contextualGrounding.enabled && (
          <span>Grounding: {(guardrail.contextualGrounding.threshold * 100).toFixed(0)}%</span>
        )}
      </div>
    </div>
  );
}

function KnowledgeBaseCard({ kb }: { kb: KnowledgeBaseConfig }) {
  const classConfig = DATA_CLASSIFICATION_CONFIG[kb.dataClassification];

  return (
    <div className="mt-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
      <div className="flex items-start justify-between mb-2">
        <div>
          <div className="text-sm font-medium text-slate-900">{kb.name}</div>
          <div className="text-[10px] text-slate-500 font-mono">{kb.knowledgeBaseId}</div>
        </div>
        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${classConfig.bg} ${classConfig.text}`}>
          {kb.dataClassification}
        </span>
      </div>
      <p className="text-xs text-slate-600 mb-2">{kb.description}</p>

      <div className="grid grid-cols-2 gap-2 text-[10px]">
        <div className="p-2 bg-white rounded border border-slate-200">
          <div className="text-slate-500">Data Source</div>
          <div className="font-medium text-slate-800">{kb.dataSource.type.toUpperCase()}</div>
          <div className="text-slate-500 truncate">{kb.dataSource.location}</div>
        </div>
        <div className="p-2 bg-white rounded border border-slate-200">
          <div className="text-slate-500">Documents</div>
          <div className="font-medium text-slate-800">{kb.dataSource.documentsIndexed.toLocaleString()}</div>
          <div className="text-slate-500">Last sync: {new Date(kb.dataSource.lastSync).toLocaleDateString()}</div>
        </div>
        <div className="p-2 bg-white rounded border border-slate-200">
          <div className="text-slate-500">Embedding Model</div>
          <div className="font-medium text-slate-800 truncate">{kb.embeddingModel}</div>
        </div>
        <div className="p-2 bg-white rounded border border-slate-200">
          <div className="text-slate-500">Vector Store</div>
          <div className="font-medium text-slate-800">{kb.vectorStore.type}</div>
        </div>
      </div>
    </div>
  );
}

function IAMCard({ iam }: { iam: IAMConfig }) {
  return (
    <div className="mt-3 space-y-3">
      {/* Execution Role */}
      <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
        <div className="text-[10px] font-medium text-slate-600 mb-2">Execution Role</div>
        <div className="text-sm font-medium text-slate-900">{iam.executionRole.roleName}</div>
        <div className="text-[10px] text-slate-500 font-mono truncate">{iam.executionRole.roleArn}</div>
        {iam.executionRole.permissionBoundary && (
          <div className="mt-2 flex items-center gap-1 text-[10px] text-amber-700">
            <Icon name="shield-check" className="w-3 h-3" />
            Permission Boundary: {iam.executionRole.permissionBoundary.split('/').pop()}
          </div>
        )}
        <div className="mt-2 text-[10px] text-slate-500">
          Trust: {iam.executionRole.trustPolicy.join(', ')}
        </div>
      </div>

      {/* Attached Policies */}
      <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
        <div className="text-[10px] font-medium text-slate-600 mb-2">Attached Policies ({iam.attachedPolicies.length})</div>
        <div className="space-y-2">
          {iam.attachedPolicies.map((policy, i) => (
            <div key={i} className="p-2 bg-white rounded border border-slate-200">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-800">{policy.policyName}</span>
                <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${
                  policy.type === 'AWS' ? 'bg-orange-100 text-orange-700' : 'bg-slate-100 text-slate-600'
                }`}>
                  {policy.type}
                </span>
              </div>
              <div className="flex flex-wrap gap-1 mt-1">
                {policy.permissions.slice(0, 3).map((perm, j) => (
                  <span key={j} className="text-[9px] text-slate-500 font-mono">{perm}</span>
                ))}
                {policy.permissions.length > 3 && (
                  <span className="text-[9px] text-slate-400">+{policy.permissions.length - 3} more</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Resource Policies */}
      {iam.resourcePolicies.length > 0 && (
        <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
          <div className="text-[10px] font-medium text-slate-600 mb-2">Resource Access</div>
          {iam.resourcePolicies.map((rp, i) => (
            <div key={i} className="text-[10px] text-slate-600">
              <span className="font-mono text-slate-800">{rp.resource}</span>
              <span className="text-slate-400"> → </span>
              <span className="text-emerald-700">{rp.allowedActions.join(', ')}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ActionGroupCard({ actionGroup }: { actionGroup: ActionGroupConfig }) {
  return (
    <div className="mt-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
      <div className="flex items-start justify-between mb-2">
        <div>
          <div className="text-sm font-medium text-slate-900">{actionGroup.name}</div>
          <div className="text-[10px] text-slate-500">{actionGroup.description}</div>
        </div>
        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
          actionGroup.actionGroupExecutor.type === 'lambda'
            ? 'bg-orange-100 text-orange-700'
            : 'bg-slate-100 text-slate-600'
        }`}>
          {actionGroup.actionGroupExecutor.type}
        </span>
      </div>

      {actionGroup.actionGroupExecutor.lambdaArn && (
        <div className="text-[10px] text-slate-500 font-mono mb-2 truncate">
          {actionGroup.actionGroupExecutor.lambdaArn}
        </div>
      )}

      <div className="text-[10px] font-medium text-slate-600 mb-1">API Operations</div>
      <div className="space-y-1">
        {actionGroup.apiSchema.operations.map((op, i) => (
          <div key={i} className="flex items-center gap-2 text-[10px]">
            <span className={`px-1.5 py-0.5 rounded font-mono font-semibold ${
              op.method === 'GET' ? 'bg-emerald-100 text-emerald-700' :
              op.method === 'POST' ? 'bg-blue-100 text-blue-700' :
              'bg-amber-100 text-amber-700'
            }`}>
              {op.method}
            </span>
            <span className="text-slate-700 font-mono">{op.path}</span>
            <span className="text-slate-500">{op.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ModelAccessCard({ modelAccess }: { modelAccess: ModelAccessConfig }) {
  return (
    <div className="mt-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
      <div className="text-[10px] font-medium text-slate-600 mb-2">Primary Model</div>
      <div className="p-2 bg-white rounded border border-slate-200 mb-3">
        <div className="text-sm font-medium text-slate-900">{modelAccess.primaryModel.modelId}</div>
        <div className="text-[10px] text-slate-500">{modelAccess.primaryModel.provider}</div>
        {modelAccess.primaryModel.inferenceProfile && (
          <div className="text-[10px] text-indigo-600 mt-1">
            Inference Profile: {modelAccess.primaryModel.inferenceProfile}
          </div>
        )}
      </div>

      {modelAccess.fallbackModels.length > 0 && (
        <>
          <div className="text-[10px] font-medium text-slate-600 mb-2">Fallback Models</div>
          <div className="space-y-2 mb-3">
            {modelAccess.fallbackModels.map((fm, i) => (
              <div key={i} className="p-2 bg-white rounded border border-slate-200 text-[10px]">
                <span className="font-medium text-slate-800">{fm.modelId}</span>
                <span className="text-slate-400"> when </span>
                <span className="text-amber-700">{fm.condition}</span>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="grid grid-cols-2 gap-2 text-[10px]">
        <div className="p-2 bg-white rounded border border-slate-200">
          <div className="text-slate-500">Cross-Region</div>
          <div className={`font-semibold ${modelAccess.crossRegionInference ? 'text-emerald-700' : 'text-slate-500'}`}>
            {modelAccess.crossRegionInference ? 'Enabled' : 'Disabled'}
          </div>
        </div>
        <div className="p-2 bg-white rounded border border-slate-200">
          <div className="text-slate-500">Throughput</div>
          <div className="font-semibold text-slate-800">
            {modelAccess.throughputConfig.type}
            {modelAccess.throughputConfig.provisionedUnits && ` (${modelAccess.throughputConfig.provisionedUnits} units)`}
          </div>
        </div>
      </div>

      <div className="mt-2 text-[10px] text-slate-500">
        Allowed regions: {modelAccess.allowedRegions.join(', ')}
      </div>
    </div>
  );
}

function NetworkCard({ network }: { network: NetworkConfig }) {
  if (!network.vpcEnabled) {
    return (
      <div className="mt-3 p-3 bg-slate-50 rounded-lg border border-slate-200 text-center">
        <Icon name="globe-alt" className="w-8 h-8 text-slate-400 mx-auto mb-2" />
        <div className="text-sm text-slate-600">VPC not enabled</div>
        <div className="text-[10px] text-slate-400">Agent uses public endpoints</div>
      </div>
    );
  }

  return (
    <div className="mt-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
      <div className="grid grid-cols-2 gap-3 text-[10px] mb-3">
        <div>
          <div className="text-slate-500">VPC</div>
          <div className="font-mono text-slate-800">{network.vpcId}</div>
        </div>
        <div>
          <div className="text-slate-500">Subnets</div>
          <div className="font-mono text-slate-800">{network.subnetIds?.length || 0}</div>
        </div>
      </div>

      {network.vpcEndpoints && network.vpcEndpoints.length > 0 && (
        <>
          <div className="text-[10px] font-medium text-slate-600 mb-2">VPC Endpoints</div>
          <div className="space-y-1">
            {network.vpcEndpoints.map((ep, i) => (
              <div key={i} className="flex items-center justify-between p-2 bg-white rounded border border-slate-200 text-[10px]">
                <span className="text-slate-800">{ep.service}</span>
                <span className={`px-1.5 py-0.5 rounded ${
                  ep.type === 'Interface' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'
                }`}>
                  {ep.type}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function ObservabilityCard({ observability }: { observability: ObservabilityConfig }) {
  return (
    <div className="mt-3 space-y-2">
      {/* CloudWatch */}
      <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-slate-800">CloudWatch</span>
          <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold ${
            observability.cloudwatch.enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
          }`}>
            {observability.cloudwatch.enabled ? 'Enabled' : 'Disabled'}
          </span>
        </div>
        {observability.cloudwatch.enabled && (
          <div className="text-[10px] text-slate-600 space-y-1">
            <div>Log Group: <span className="font-mono">{observability.cloudwatch.logGroup}</span></div>
            <div>Namespace: <span className="font-mono">{observability.cloudwatch.metricsNamespace}</span></div>
            <div>Retention: {observability.cloudwatch.retentionDays} days</div>
          </div>
        )}
      </div>

      {/* X-Ray */}
      <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-slate-800">X-Ray Tracing</span>
          <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold ${
            observability.xray.enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
          }`}>
            {observability.xray.enabled ? 'Enabled' : 'Disabled'}
          </span>
        </div>
        {observability.xray.enabled && (
          <div className="text-[10px] text-slate-600">
            Sampling Rate: {(observability.xray.samplingRate * 100).toFixed(0)}%
          </div>
        )}
      </div>

      {/* Langfuse */}
      <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-slate-800">Langfuse</span>
          <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold ${
            observability.langfuse.enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
          }`}>
            {observability.langfuse.enabled ? 'Enabled' : 'Disabled'}
          </span>
        </div>
        {observability.langfuse.enabled && (
          <div className="text-[10px] text-slate-600">
            Project: <span className="font-mono">{observability.langfuse.projectId}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function AgentDetailView({ agent }: { agent: AgentResourceProfile }) {
  const riskConfig = RISK_TIER_CONFIG[agent.riskTier];

  return (
    <div className="space-y-4">
      {/* Agent Header */}
      <div className="bg-gradient-to-r from-slate-50 to-indigo-50 rounded-xl p-4 border border-slate-200">
        <div className="flex items-start justify-between mb-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${riskConfig.bg} ${riskConfig.text}`}>
                {riskConfig.label} Risk
              </span>
              <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                agent.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
              }`}>
                {agent.status}
              </span>
            </div>
            <h2 className="text-lg font-semibold text-slate-900">{agent.agentName}</h2>
            <p className="text-xs text-slate-500">{agent.description}</p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-indigo-600">{agent.complianceScore}%</div>
            <div className="text-[10px] text-slate-500">Compliance Score</div>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-4 text-[10px]">
          <div>
            <div className="text-slate-500">Agent ID</div>
            <div className="font-mono text-slate-800">{agent.agentId}</div>
          </div>
          <div>
            <div className="text-slate-500">Business Unit</div>
            <div className="text-slate-800">{agent.businessUnit}</div>
          </div>
          <div>
            <div className="text-slate-500">Owner</div>
            <div className="text-slate-800">{agent.owner}</div>
          </div>
          <div>
            <div className="text-slate-500">Total Controls</div>
            <div className="text-slate-800">{agent.totalControls}</div>
          </div>
        </div>

        {/* Control Summary by Category */}
        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-200">
          {Object.entries(agent.controlsByCategory).map(([cat, count]) => {
            const config = CONTROL_CATEGORY_CONFIG[cat as ControlCategory];
            return (
              <div
                key={cat}
                className={`flex items-center gap-1 px-2 py-1 rounded ${config.bg}`}
              >
                <Icon name={config.icon as any} className={`w-3 h-3 ${config.text}`} />
                <span className={`text-[10px] font-medium ${config.text}`}>
                  {config.label}: {count}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Resource Sections */}
      <ResourceSection
        title="AgentCore Policies"
        icon="document-text"
        count={agent.agentCorePolicies.length}
      >
        {agent.agentCorePolicies.map(policy => (
          <PolicyCard key={policy.id} policy={policy} />
        ))}
      </ResourceSection>

      <ResourceSection
        title="Bedrock Guardrails"
        icon="shield-check"
        count={agent.guardrails.length}
      >
        {agent.guardrails.map(gr => (
          <GuardrailCard key={gr.id} guardrail={gr} />
        ))}
      </ResourceSection>

      <ResourceSection
        title="Knowledge Bases"
        icon="circle-stack"
        count={agent.knowledgeBases.length}
      >
        {agent.knowledgeBases.map(kb => (
          <KnowledgeBaseCard key={kb.id} kb={kb} />
        ))}
      </ResourceSection>

      <ResourceSection title="IAM Configuration" icon="key" count={agent.iam.attachedPolicies.length + agent.iam.inlinePolicies.length}>
        <IAMCard iam={agent.iam} />
      </ResourceSection>

      <ResourceSection
        title="Action Groups"
        icon="bolt"
        count={agent.actionGroups.length}
        defaultExpanded={agent.actionGroups.length > 0}
      >
        {agent.actionGroups.length === 0 ? (
          <div className="mt-3 p-3 bg-slate-50 rounded-lg border border-slate-200 text-center text-sm text-slate-500">
            No action groups configured
          </div>
        ) : (
          agent.actionGroups.map(ag => (
            <ActionGroupCard key={ag.id} actionGroup={ag} />
          ))
        )}
      </ResourceSection>

      <ResourceSection title="Model Access" icon="cpu-chip" count={1}>
        <ModelAccessCard modelAccess={agent.modelAccess} />
      </ResourceSection>

      <ResourceSection title="Network Configuration" icon="globe-alt" count={agent.network.vpcEndpoints?.length || 0}>
        <NetworkCard network={agent.network} />
      </ResourceSection>

      <ResourceSection title="Observability" icon="chart-bar" count={3}>
        <ObservabilityCard observability={agent.observability} />
      </ResourceSection>
    </div>
  );
}

// Detail view for a LIVE agent. Live discovery gives us identity, status, risk
// tier and resource/telemetry counts, but not the deep control configuration, so
// this view shows the real live figures and is explicit that the deep config
// reference (shown for demo agents) is illustrative only.
function LiveAgentDetail({ agent }: { agent: InventoryAgent }) {
  const riskConfig = RISK_TIER_CONFIG[agent.riskTier];

  return (
    <div className="space-y-4">
      <div className="bg-gradient-to-r from-slate-50 to-indigo-50 rounded-xl p-4 border border-slate-200">
        <div className="flex items-center gap-2 mb-1">
          <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${riskConfig.bg} ${riskConfig.text}`}>
            {riskConfig.label} Risk
          </span>
          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-700">
            {agent.statusLabel}
          </span>
          <LiveDataBadge source="Bedrock / AgentCore" />
        </div>
        <h2 className="text-lg font-semibold text-slate-900">{agent.agentName}</h2>
        <p className="text-xs text-slate-500">{agent.description}</p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-3 text-[10px]">
          <div>
            <div className="text-slate-500">Agent ID</div>
            <div className="font-mono text-slate-800 truncate">{agent.agentId}</div>
          </div>
          <div>
            <div className="text-slate-500">Framework</div>
            <div className="text-slate-800">{agent.framework ?? '—'}</div>
          </div>
          <div>
            <div className="text-slate-500">Region</div>
            <div className="text-slate-800">{agent.region ?? '—'}</div>
          </div>
          <div>
            <div className="text-slate-500">Business Unit</div>
            <div className="text-slate-800">{agent.businessUnit}</div>
          </div>
        </div>
      </div>

      {/* Live counts & telemetry */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="p-3 bg-slate-50 rounded-lg">
          <div className="text-[10px] text-slate-500">Guardrails</div>
          <div className="text-lg font-bold text-slate-900" title={agent.guardrailCount == null ? 'This row came from a deployment record, which carries no guardrail binding - this is not a measured zero.' : undefined}>{agent.guardrailCount ?? '—'}</div>
        </div>
        <div className="p-3 bg-slate-50 rounded-lg">
          <div className="text-[10px] text-slate-500">Policies</div>
          <div className="text-lg font-bold text-slate-900" title={agent.policyCount == null ? 'Policy engines are not reported per agent by the discovery APIs.' : undefined}>{agent.policyCount ?? '—'}</div>
        </div>
        <div className="p-3 bg-slate-50 rounded-lg">
          <div className="text-[10px] text-slate-500">Invocations 24h</div>
          <div className="text-lg font-bold text-slate-900" title={agent.invocations24h == null ? 'No guardrail is linked to this agent, so there is no invocation figure to report - this is not a measured zero.' : undefined}>{agent.invocations24h == null ? '—' : agent.invocations24h.toLocaleString()}</div>
        </div>
        <div className="p-3 bg-slate-50 rounded-lg">
          <div className="text-[10px] text-slate-500">Intervention Rate</div>
          <div className="text-lg font-bold text-slate-900" title={agent.interventionRate == null ? 'No guardrail is linked to this agent, so no intervention rate exists - this is not a measured zero.' : undefined}>{agent.interventionRate == null ? '—' : `${agent.interventionRate.toFixed(1)}%`}</div>
        </div>
      </div>

      {/* Honest scope note */}
      <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-dashed border-amber-300">
        <Icon name="information-circle" className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
        <div className="text-[11px] text-amber-700">
          Detailed control configuration (Cedar policies, guardrail filter rules, knowledge-base data sources,
          IAM, action groups, network and observability) is not exposed by the live discovery APIs. The deep
          configuration reference shown for demo agents is illustrative only.
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export default function AgentResourceInventory() {
  const { agents: liveAgents, dataSources, loading } = useAgentResourceData();

  // "Live mode" only when an underlying discovery source reported live AND we
  // actually received agents. Otherwise fall back to the illustrative profiles.
  const anyLive = dataSources.some(s => s.status === 'live');
  const useLive = anyLive && liveAgents.length > 0;

  const inventoryAgents = useMemo<InventoryAgent[]>(() => {
    if (useLive) return liveAgents.map(liveSummaryToInventory);
    return MOCK_AGENT_PROFILES.map(mockProfileToInventory);
  }, [useLive, liveAgents]);

  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);
  const [detailAgent, setDetailAgent] = useState<InventoryAgent | null>(null);
  const [showDetailDrawer, setShowDetailDrawer] = useState(false);

  // Default-select the first agent whenever the underlying dataset changes
  // (e.g. when live discovery replaces the mock fallback once it loads).
  useEffect(() => {
    setSelectedAgentIds(inventoryAgents.length > 0 ? [inventoryAgents[0].agentId] : []);
  }, [inventoryAgents]);

  const selectedAgents = useMemo(
    () => inventoryAgents.filter(a => selectedAgentIds.includes(a.agentId)),
    [inventoryAgents, selectedAgentIds]
  );

  const aggregateStats = useMemo(() => {
    const total = selectedAgents.reduce((acc, a) => acc + a.totalControls, 0);
    const scored = selectedAgents.filter(a => a.complianceScore != null);
    const avgCompliance = scored.length > 0
      ? Math.round(scored.reduce((acc, a) => acc + (a.complianceScore ?? 0), 0) / scored.length)
      : 0;
    // Sum only agents that actually reported each count, and carry the coverage so the
    // tiles can say so. Counting an unreported agent as 0 understated every total while
    // looking like a complete census of the selection.
    const sumKnown = (pick: (a: InventoryAgent) => number | undefined) => {
      const known = selectedAgents.filter(a => pick(a) != null);
      return { value: known.reduce((acc, a) => acc + (pick(a) ?? 0), 0), known: known.length };
    };
    const policies = sumKnown(a => a.policyCount);
    const kbs = sumKnown(a => a.knowledgeBaseCount);
    const actionGroups = sumKnown(a => a.actionGroupCount);
    const totalGuardrails = sumKnown(a => a.guardrailCount);

    return {
      total,
      avgCompliance,
      hasCompliance: scored.length > 0,
      selectedCount: selectedAgents.length,
      policies,
      kbs,
      actionGroups,
      totalGuardrails,
    };
  }, [selectedAgents]);

  const handleViewDetail = (agent: InventoryAgent) => {
    setDetailAgent(agent);
    setShowDetailDrawer(true);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CoreBadge pillar="govern" compact />
          {useLive ? (
            <LiveDataBadge source="Bedrock / AgentCore + Guardrails + Deployments" />
          ) : (
            <MockDataBadge integration="Connect to Bedrock APIs for live agent inventory" />
          )}
        </div>
        <button className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition">
          <Icon name="arrow-down-tray" className="w-4 h-4" />
          Export Inventory
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
        <StatCard label="Selected Agents" value={selectedAgents.length.toString()} sub={`of ${inventoryAgents.length}`} />
        <StatCard label="Total Controls" value={aggregateStats.total.toString()} sub="across selected" />
        <StatCard
          label="Avg Compliance"
          value={aggregateStats.hasCompliance ? `${aggregateStats.avgCompliance}%` : '—'}
          sub={aggregateStats.hasCompliance ? 'score' : 'not scored live'}
          variant={aggregateStats.hasCompliance ? (aggregateStats.avgCompliance >= 90 ? 'success' : 'warning') : 'muted'}
        />
        {/* Each tile states how many of the selected agents actually reported the count.
            "0 of 12 reported" is a very different claim from "0 policies". */}
        <StatCard
          label="Policies"
          value={aggregateStats.policies.known === 0 ? '—' : aggregateStats.policies.value.toString()}
          sub={aggregateStats.policies.known === aggregateStats.selectedCount
            ? 'AgentCore'
            : `AgentCore · ${aggregateStats.policies.known} of ${aggregateStats.selectedCount} reported`}
          variant={aggregateStats.policies.known === 0 ? 'muted' : 'default'}
        />
        {/* Same treatment as Policies above: a sum over rows that reported nothing is not 0. */}
        <StatCard
          label="Guardrails"
          value={aggregateStats.totalGuardrails.known === 0 ? '—' : aggregateStats.totalGuardrails.value.toString()}
          sub={aggregateStats.totalGuardrails.known === aggregateStats.selectedCount
            ? 'Bedrock'
            : `Bedrock · ${aggregateStats.totalGuardrails.known} of ${aggregateStats.selectedCount} reported`}
          variant={aggregateStats.totalGuardrails.known === 0 ? 'muted' : 'default'}
        />
        <StatCard
          label="Knowledge Bases"
          value={aggregateStats.kbs.known === 0 ? '—' : aggregateStats.kbs.value.toString()}
          sub={aggregateStats.kbs.known === aggregateStats.selectedCount
            ? 'data sources'
            : `data sources · ${aggregateStats.kbs.known} of ${aggregateStats.selectedCount} reported`}
          variant={aggregateStats.kbs.known === 0 ? 'muted' : 'default'}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
        {/* Agent Selector */}
        <AgentSelector
          agents={inventoryAgents}
          selectedIds={selectedAgentIds}
          onSelectionChange={setSelectedAgentIds}
        />

        {/* Agent Cards */}
        <div className="space-y-4">
          {inventoryAgents.length === 0 ? (
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-8 text-center">
              <Icon name="cube-transparent" className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <h3 className="text-lg font-semibold text-slate-700 mb-1">No Agents Discovered</h3>
              <p className="text-sm text-slate-500">
                {useLive
                  ? 'Bedrock / AgentCore returned no agents for this account and region.'
                  : loading
                    ? 'Loading agent inventory…'
                    : 'No agents available.'}
              </p>
            </div>
          ) : selectedAgents.length === 0 ? (
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-8 text-center">
              <Icon name="cube-transparent" className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <h3 className="text-lg font-semibold text-slate-700 mb-1">No Agents Selected</h3>
              <p className="text-sm text-slate-500">Select one or more agents to view their resource inventory</p>
            </div>
          ) : (
            selectedAgents.map(agent => {
              const riskConfig = RISK_TIER_CONFIG[agent.riskTier];
              return (
                <div
                  key={agent.agentId}
                  className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${riskConfig.bg} ${riskConfig.text}`}>
                          {riskConfig.label}
                        </span>
                        <span className="text-[10px] text-slate-400">{agent.agentId}</span>
                        {agent.isLive && <LiveDataBadge source="Bedrock / AgentCore" />}
                      </div>
                      <h3 className="text-base font-semibold text-slate-900">{agent.agentName}</h3>
                      <p className="text-xs text-slate-500">{agent.description}</p>
                    </div>
                    <button
                      onClick={() => handleViewDetail(agent)}
                      className="px-3 py-1.5 text-xs font-medium text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition"
                    >
                      View Full Inventory
                    </button>
                  </div>

                  {/* Resource Summary Grid */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                    <div className="p-3 bg-slate-50 rounded-lg">
                      <div className="flex items-center gap-2 mb-1">
                        <Icon name="document-text" className="w-4 h-4 text-indigo-500" />
                        <span className="text-xs font-medium text-slate-700">Policies</span>
                      </div>
                      <div className="text-lg font-bold text-slate-900" title={agent.policyCount == null ? 'Policy engines are not reported per agent by the discovery APIs.' : undefined}>{agent.policyCount ?? '—'}</div>
                      {agent.cedarRuleCount != null && (
                        <div className="text-[10px] text-slate-500">{agent.cedarRuleCount} Cedar rules</div>
                      )}
                    </div>
                    <div className="p-3 bg-slate-50 rounded-lg">
                      <div className="flex items-center gap-2 mb-1">
                        <Icon name="shield-check" className="w-4 h-4 text-blue-500" />
                        <span className="text-xs font-medium text-slate-700">Guardrails</span>
                      </div>
                      <div className="text-lg font-bold text-slate-900" title={agent.guardrailCount == null ? 'This row came from a deployment record, which carries no guardrail binding - this is not a measured zero.' : undefined}>{agent.guardrailCount ?? '—'}</div>
                      {agent.topicFilterCount != null && (
                        <div className="text-[10px] text-slate-500">{agent.topicFilterCount} topic filters</div>
                      )}
                    </div>
                    <div className="p-3 bg-slate-50 rounded-lg">
                      <div className="flex items-center gap-2 mb-1">
                        <Icon name="circle-stack" className="w-4 h-4 text-emerald-500" />
                        <span className="text-xs font-medium text-slate-700">Knowledge Bases</span>
                      </div>
                      <div className="text-lg font-bold text-slate-900" title={agent.knowledgeBaseCount == null ? 'Knowledge bases are not listed per agent by the discovery APIs - not retrieved, not zero.' : undefined}>{agent.knowledgeBaseCount ?? '—'}</div>
                      {agent.documentCount != null && (
                        <div className="text-[10px] text-slate-500">{agent.documentCount.toLocaleString()} docs</div>
                      )}
                    </div>
                    <div className="p-3 bg-slate-50 rounded-lg">
                      <div className="flex items-center gap-2 mb-1">
                        <Icon name="bolt" className="w-4 h-4 text-amber-500" />
                        <span className="text-xs font-medium text-slate-700">Action Groups</span>
                      </div>
                      <div className="text-lg font-bold text-slate-900" title={agent.actionGroupCount == null ? 'Action groups need a per-agent call the discovery APIs do not make - not retrieved, not zero.' : undefined}>{agent.actionGroupCount ?? '—'}</div>
                      {agent.operationCount != null && (
                        <div className="text-[10px] text-slate-500">{agent.operationCount} operations</div>
                      )}
                    </div>
                  </div>

                  {/* Quick Info */}
                  <div className="flex flex-wrap items-center gap-4 text-[10px] text-slate-500 pt-3 border-t border-slate-100">
                    {agent.modelLabel && <span>Model: {agent.modelLabel}</span>}
                    {agent.iamPolicyCount != null && <span>IAM: {agent.iamPolicyCount} policies</span>}
                    {agent.vpcEnabled != null && <span>VPC: {agent.vpcEnabled ? 'Enabled' : 'Public'}</span>}
                    {agent.region && <span>Region: {agent.region}</span>}
                    {agent.invocations24h != null && <span>Invocations 24h: {agent.invocations24h.toLocaleString()}</span>}
                    {agent.lastInvoked && <span>Last invoked: {new Date(agent.lastInvoked).toLocaleString()}</span>}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Detail Drawer */}
      <Drawer
        open={showDetailDrawer}
        onClose={() => setShowDetailDrawer(false)}
        title={detailAgent?.agentName || 'Agent Details'}
        subtitle={`Full resource inventory and control mapping`}
        width="xl"
      >
        {detailAgent?.profile ? (
          <AgentDetailView agent={detailAgent.profile} />
        ) : detailAgent ? (
          <LiveAgentDetail agent={detailAgent} />
        ) : null}
      </Drawer>
    </div>
  );
}
