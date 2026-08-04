/**
 * useSecurityHubAIInventory — Hook for discovering AI assets via Security Hub
 *
 * Fetches AI resource inventory from AWS Security Hub and cross-references
 * against the Agent Registry to identify unregistered "shadow AI" assets.
 *
 * Discovered asset types:
 * - Bedrock Models (foundation models enabled in the account)
 * - Bedrock Agents (deployed conversational agents)
 * - Bedrock Guardrails (content safety controls)
 * - Bedrock Knowledge Bases (RAG data sources)
 * - SageMaker Endpoints (inference endpoints)
 * - SageMaker Models (deployed model artifacts)
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  governRiskPostureApi,
  governAgentCoreApi,
  governGuardrailsApi,
  governModelsApi,
  type AwsRiskPostureResponse,
  type AwsSecurityFinding,
  type AwsDiscoveredAgentsResponse,
  type AwsGuardrailTelemetryResponse,
  type AwsFoundationModelCatalog,
} from '../../api/client';
import { usePollingKey } from './usePollingKey';

// ─────────────────────────── Types ───────────────────────────

/** AI asset types discoverable via Security Hub and related AWS APIs */
export type AIAssetType =
  | 'bedrock-model'
  | 'bedrock-agent'
  | 'bedrock-guardrail'
  | 'bedrock-knowledge-base'
  | 'sagemaker-endpoint'
  | 'sagemaker-model';

/** Registration status relative to the Agent Registry */
export type RegistrationStatus =
  | 'registered'      // Asset exists in Agent Registry
  | 'unregistered'    // Shadow AI - not in registry
  | 'pending'         // Registration in progress
  | 'exempt';         // Explicitly marked as exempt from registration

/** A single discovered AI asset */
export interface SecurityHubAIAsset {
  /** Unique identifier for the asset */
  id: string;
  /** Asset type category */
  type: AIAssetType;
  /** AWS ARN if available */
  arn: string;
  /** Human-readable name */
  name: string;
  /** AWS account ID */
  account: string;
  /** AWS region */
  region: string;
  /** Last seen/updated timestamp */
  lastSeen: string;
  /** Registration status against Agent Registry */
  registrationStatus: RegistrationStatus;
  /** Status from AWS (e.g., ACTIVE, READY, InService) */
  awsStatus?: string;
  /** Associated Security Hub findings count */
  findingsCount: number;
  /** Severity of associated findings */
  highestSeverity?: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFORMATIONAL';
  /** Provider (e.g., Anthropic, Amazon, Custom) */
  provider?: string;
  /** Additional metadata */
  metadata?: Record<string, string | number | boolean>;
}

/** Summary statistics for discovered AI assets */
export interface AIInventorySummary {
  /** Total discovered assets */
  total: number;
  /** Count by asset type */
  byType: Record<AIAssetType, number>;
  /** Count of unregistered (shadow AI) assets */
  unregisteredCount: number;
  /** Count of registered assets */
  registeredCount: number;
  /** Compliance score (registered / total * 100) */
  complianceScore: number;
  /** Assets with security findings */
  withFindingsCount: number;
  /** Critical/high severity findings across all assets */
  criticalHighFindings: number;
}

/** Return type for the hook */
export interface SecurityHubAIInventoryResult {
  /** All discovered AI assets */
  discoveredAssets: SecurityHubAIAsset[];
  /** Summary statistics */
  summary: AIInventorySummary;
  /** Loading state */
  loading: boolean;
  /** Error message if any */
  error: string | null;
  /** Whether data is from live AWS APIs */
  isLive: boolean;
  /** Data source indicator */
  source: string;
  /** Last refresh timestamp */
  lastUpdated: Date | null;
  /** Manual refresh function */
  refresh: () => void;
}

// ─────────────────────────── Mock Data ───────────────────────────

const MOCK_ASSETS: SecurityHubAIAsset[] = [
  // Bedrock Models
  {
    id: 'bedrock-model-claude-3-sonnet',
    type: 'bedrock-model',
    arn: 'arn:aws:bedrock:us-east-1::foundation-model/anthropic.claude-3-sonnet-20240229-v1:0',
    name: 'Claude 3 Sonnet',
    account: '123456789012',
    region: 'us-east-1',
    lastSeen: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
    registrationStatus: 'registered',
    awsStatus: 'ACTIVE',
    findingsCount: 0,
    provider: 'Anthropic',
  },
  {
    id: 'bedrock-model-claude-3-haiku',
    type: 'bedrock-model',
    arn: 'arn:aws:bedrock:us-east-1::foundation-model/anthropic.claude-3-haiku-20240307-v1:0',
    name: 'Claude 3 Haiku',
    account: '123456789012',
    region: 'us-east-1',
    lastSeen: new Date(Date.now() - 1000 * 60 * 10).toISOString(),
    registrationStatus: 'registered',
    awsStatus: 'ACTIVE',
    findingsCount: 0,
    provider: 'Anthropic',
  },
  {
    id: 'bedrock-model-titan-embed',
    type: 'bedrock-model',
    arn: 'arn:aws:bedrock:us-east-1::foundation-model/amazon.titan-embed-text-v2:0',
    name: 'Titan Text Embeddings V2',
    account: '123456789012',
    region: 'us-east-1',
    lastSeen: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
    registrationStatus: 'unregistered',
    awsStatus: 'ACTIVE',
    findingsCount: 1,
    highestSeverity: 'LOW',
    provider: 'Amazon',
  },
  // Bedrock Agents
  {
    id: 'bedrock-agent-customer-service',
    type: 'bedrock-agent',
    arn: 'arn:aws:bedrock:us-east-1:123456789012:agent/CUST-SVC-001',
    name: 'Customer Service Agent',
    account: '123456789012',
    region: 'us-east-1',
    lastSeen: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
    registrationStatus: 'registered',
    awsStatus: 'PREPARED',
    findingsCount: 0,
    provider: 'Bedrock Agents',
    metadata: { aliasCount: 2, knowledgeBaseCount: 1 },
  },
  {
    id: 'bedrock-agent-fraud-detection',
    type: 'bedrock-agent',
    arn: 'arn:aws:bedrock:us-east-1:123456789012:agent/FRAUD-DET-002',
    name: 'Fraud Detection Agent',
    account: '123456789012',
    region: 'us-east-1',
    lastSeen: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
    registrationStatus: 'unregistered',
    awsStatus: 'PREPARED',
    findingsCount: 2,
    highestSeverity: 'MEDIUM',
    provider: 'Bedrock Agents',
    metadata: { aliasCount: 1, knowledgeBaseCount: 0 },
  },
  {
    id: 'bedrock-agent-shadow-assistant',
    type: 'bedrock-agent',
    arn: 'arn:aws:bedrock:us-west-2:123456789012:agent/SHADOW-001',
    name: 'Shadow AI Assistant',
    account: '123456789012',
    region: 'us-west-2',
    lastSeen: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
    registrationStatus: 'unregistered',
    awsStatus: 'PREPARED',
    findingsCount: 3,
    highestSeverity: 'HIGH',
    provider: 'Bedrock Agents',
  },
  // Bedrock Guardrails
  {
    id: 'bedrock-guardrail-fsi-standard',
    type: 'bedrock-guardrail',
    arn: 'arn:aws:bedrock:us-east-1:123456789012:guardrail/fsi-standard',
    name: 'FSI Standard Guardrail',
    account: '123456789012',
    region: 'us-east-1',
    lastSeen: new Date(Date.now() - 1000 * 60 * 20).toISOString(),
    registrationStatus: 'registered',
    awsStatus: 'READY',
    findingsCount: 0,
    provider: 'Bedrock',
    metadata: { version: '1', interventionRate: 2.3 },
  },
  {
    id: 'bedrock-guardrail-pii-filter',
    type: 'bedrock-guardrail',
    arn: 'arn:aws:bedrock:us-east-1:123456789012:guardrail/pii-filter',
    name: 'PII Filter Guardrail',
    account: '123456789012',
    region: 'us-east-1',
    lastSeen: new Date(Date.now() - 1000 * 60 * 25).toISOString(),
    registrationStatus: 'registered',
    awsStatus: 'READY',
    findingsCount: 0,
    provider: 'Bedrock',
  },
  // Bedrock Knowledge Bases
  {
    id: 'bedrock-kb-product-docs',
    type: 'bedrock-knowledge-base',
    arn: 'arn:aws:bedrock:us-east-1:123456789012:knowledge-base/PROD-DOCS-001',
    name: 'Product Documentation KB',
    account: '123456789012',
    region: 'us-east-1',
    lastSeen: new Date(Date.now() - 1000 * 60 * 35).toISOString(),
    registrationStatus: 'registered',
    awsStatus: 'ACTIVE',
    findingsCount: 0,
    provider: 'Bedrock',
    metadata: { dataSourceCount: 3, indexedDocuments: 1250 },
  },
  {
    id: 'bedrock-kb-customer-data',
    type: 'bedrock-knowledge-base',
    arn: 'arn:aws:bedrock:us-east-1:123456789012:knowledge-base/CUST-DATA-002',
    name: 'Customer Data KB (Unregistered)',
    account: '123456789012',
    region: 'us-east-1',
    lastSeen: new Date(Date.now() - 1000 * 60 * 50).toISOString(),
    registrationStatus: 'unregistered',
    awsStatus: 'ACTIVE',
    findingsCount: 1,
    highestSeverity: 'MEDIUM',
    provider: 'Bedrock',
    metadata: { dataSourceCount: 1 },
  },
  // SageMaker Endpoints
  {
    id: 'sagemaker-endpoint-fraud-scoring',
    type: 'sagemaker-endpoint',
    arn: 'arn:aws:sagemaker:us-east-1:123456789012:endpoint/fraud-scoring-v2',
    name: 'Fraud Scoring Endpoint v2',
    account: '123456789012',
    region: 'us-east-1',
    lastSeen: new Date(Date.now() - 1000 * 60 * 40).toISOString(),
    registrationStatus: 'registered',
    awsStatus: 'InService',
    findingsCount: 0,
    provider: 'SageMaker',
    metadata: { instanceType: 'ml.m5.large', instanceCount: 2 },
  },
  {
    id: 'sagemaker-endpoint-churn-prediction',
    type: 'sagemaker-endpoint',
    arn: 'arn:aws:sagemaker:us-east-1:123456789012:endpoint/churn-prediction',
    name: 'Churn Prediction Endpoint',
    account: '123456789012',
    region: 'us-east-1',
    lastSeen: new Date(Date.now() - 1000 * 60 * 55).toISOString(),
    registrationStatus: 'unregistered',
    awsStatus: 'InService',
    findingsCount: 1,
    highestSeverity: 'LOW',
    provider: 'SageMaker',
    metadata: { instanceType: 'ml.t2.medium', instanceCount: 1 },
  },
  {
    id: 'sagemaker-endpoint-shadow-ml',
    type: 'sagemaker-endpoint',
    arn: 'arn:aws:sagemaker:us-west-2:123456789012:endpoint/shadow-ml-endpoint',
    name: 'Shadow ML Endpoint',
    account: '123456789012',
    region: 'us-west-2',
    lastSeen: new Date(Date.now() - 1000 * 60 * 60 * 4).toISOString(),
    registrationStatus: 'unregistered',
    awsStatus: 'InService',
    findingsCount: 2,
    highestSeverity: 'HIGH',
    provider: 'SageMaker',
  },
  // SageMaker Models
  {
    id: 'sagemaker-model-custom-llm',
    type: 'sagemaker-model',
    arn: 'arn:aws:sagemaker:us-east-1:123456789012:model/custom-llm-fine-tuned',
    name: 'Custom LLM Fine-tuned',
    account: '123456789012',
    region: 'us-east-1',
    lastSeen: new Date(Date.now() - 1000 * 60 * 70).toISOString(),
    registrationStatus: 'registered',
    awsStatus: 'Created',
    findingsCount: 0,
    provider: 'SageMaker',
  },
  {
    id: 'sagemaker-model-sentiment',
    type: 'sagemaker-model',
    arn: 'arn:aws:sagemaker:us-east-1:123456789012:model/sentiment-analysis-v3',
    name: 'Sentiment Analysis v3',
    account: '123456789012',
    region: 'us-east-1',
    lastSeen: new Date(Date.now() - 1000 * 60 * 80).toISOString(),
    registrationStatus: 'unregistered',
    awsStatus: 'Created',
    findingsCount: 0,
    provider: 'SageMaker',
  },
];

// ─────────────────────────── Helpers ───────────────────────────

/** Extract asset type from ARN or resource type */
function parseAssetType(resourceType: string, arn?: string): AIAssetType | null {
  const lower = (resourceType + ' ' + (arn || '')).toLowerCase();

  if (lower.includes('bedrock') && lower.includes('guardrail')) return 'bedrock-guardrail';
  if (lower.includes('bedrock') && lower.includes('knowledge-base')) return 'bedrock-knowledge-base';
  if (lower.includes('bedrock') && lower.includes('agent')) return 'bedrock-agent';
  if (lower.includes('bedrock') && lower.includes('model')) return 'bedrock-model';
  if (lower.includes('sagemaker') && lower.includes('endpoint')) return 'sagemaker-endpoint';
  if (lower.includes('sagemaker') && lower.includes('model')) return 'sagemaker-model';

  return null;
}

/** Extract account ID from ARN */
function extractAccountFromArn(arn: string): string {
  const parts = arn.split(':');
  return parts[4] || 'unknown';
}

/** Extract region from ARN */
function extractRegionFromArn(arn: string): string {
  const parts = arn.split(':');
  return parts[3] || 'us-east-1';
}

/** Extract name from ARN or ID */
function extractNameFromArn(arn: string): string {
  const parts = arn.split('/');
  return parts[parts.length - 1] || arn;
}

/** Convert Security Hub finding to AI asset */
function findingToAsset(
  finding: AwsSecurityFinding,
  index: number,
  registeredArns: Set<string>
): SecurityHubAIAsset | null {
  const resourceType = finding.resource_type || '';
  const assetType = parseAssetType(resourceType, finding.id);

  if (!assetType) return null;

  const arn = finding.id;
  const isRegistered = registeredArns.has(arn) || registeredArns.has(extractNameFromArn(arn));

  return {
    id: `securityhub-${assetType}-${index}`,
    type: assetType,
    arn,
    name: finding.title || extractNameFromArn(arn),
    account: extractAccountFromArn(arn),
    region: extractRegionFromArn(arn),
    lastSeen: finding.updated_at || new Date().toISOString(),
    registrationStatus: isRegistered ? 'registered' : 'unregistered',
    awsStatus: finding.compliance_status || undefined,
    findingsCount: 1,
    highestSeverity: finding.severity as SecurityHubAIAsset['highestSeverity'],
    provider: assetType.startsWith('bedrock') ? 'Bedrock' : 'SageMaker',
  };
}

/** Calculate summary from assets */
function calculateSummary(assets: SecurityHubAIAsset[]): AIInventorySummary {
  const byType: Record<AIAssetType, number> = {
    'bedrock-model': 0,
    'bedrock-agent': 0,
    'bedrock-guardrail': 0,
    'bedrock-knowledge-base': 0,
    'sagemaker-endpoint': 0,
    'sagemaker-model': 0,
  };

  let unregisteredCount = 0;
  let registeredCount = 0;
  let withFindingsCount = 0;
  let criticalHighFindings = 0;

  for (const asset of assets) {
    byType[asset.type]++;

    if (asset.registrationStatus === 'unregistered') {
      unregisteredCount++;
    } else if (asset.registrationStatus === 'registered') {
      registeredCount++;
    }

    if (asset.findingsCount > 0) {
      withFindingsCount++;
      if (asset.highestSeverity === 'CRITICAL' || asset.highestSeverity === 'HIGH') {
        criticalHighFindings += asset.findingsCount;
      }
    }
  }

  const total = assets.length;
  const complianceScore = total > 0 ? Math.round((registeredCount / total) * 100) : 100;

  return {
    total,
    byType,
    unregisteredCount,
    registeredCount,
    complianceScore,
    withFindingsCount,
    criticalHighFindings,
  };
}

// ─────────────────────────── Hook ───────────────────────────

/**
 * Hook to discover AI assets from Security Hub and cross-reference with Agent Registry.
 *
 * @param pollIntervalMs - Polling interval in milliseconds (default: 60s)
 * @param registeredAgentIds - Set of agent IDs/ARNs already in the registry
 */
export function useSecurityHubAIInventory(
  pollIntervalMs = 60_000,
  registeredAgentIds?: Set<string>
): SecurityHubAIInventoryResult {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Raw API responses
  const [securityHubData, setSecurityHubData] = useState<AwsRiskPostureResponse | null>(null);
  const [agentsData, setAgentsData] = useState<AwsDiscoveredAgentsResponse | null>(null);
  const [guardrailsData, setGuardrailsData] = useState<AwsGuardrailTelemetryResponse | null>(null);
  const [modelsData, setModelsData] = useState<AwsFoundationModelCatalog | null>(null);

  const pollKey = usePollingKey(pollIntervalMs);

  // Fetch all data sources
  useEffect(() => {
    let cancelled = false;

    const fetchData = async () => {
      setLoading(true);
      setError(null);

      try {
        // Fetch from multiple APIs in parallel
        const [securityHub, agents, guardrails, models] = await Promise.allSettled([
          governRiskPostureApi.securityHub(200),
          governAgentCoreApi.agents(),
          governGuardrailsApi.telemetry(30),
          governModelsApi.catalog(),
        ]);

        if (!cancelled) {
          if (securityHub.status === 'fulfilled') {
            setSecurityHubData(securityHub.value);
          }
          if (agents.status === 'fulfilled') {
            setAgentsData(agents.value);
          }
          if (guardrails.status === 'fulfilled') {
            setGuardrailsData(guardrails.value);
          }
          if (models.status === 'fulfilled') {
            setModelsData(models.value);
          }

          setLastUpdated(new Date());

          // Only error if all sources failed
          const allFailed =
            securityHub.status === 'rejected' &&
            agents.status === 'rejected' &&
            guardrails.status === 'rejected' &&
            models.status === 'rejected';

          if (allFailed) {
            setError('Unable to fetch AI inventory from AWS APIs - using demo data');
          }
        }
      } catch (err) {
        if (!cancelled) {
          console.warn('Security Hub AI Inventory API unavailable:', err);
          setError('Unable to fetch AI inventory - using demo data');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetchData();
    return () => {
      cancelled = true;
    };
  }, [pollKey, refreshKey]);

  // Build the registered ARNs set from provided IDs or discovered agents
  const registeredArns = useMemo(() => {
    const arns = new Set<string>(registeredAgentIds || []);

    // Add discovered agents as registered
    if (agentsData?.agents) {
      for (const agent of agentsData.agents) {
        arns.add(agent.id);
        arns.add(agent.name);
      }
    }

    return arns;
  }, [registeredAgentIds, agentsData]);

  // Process and combine all data sources into unified asset list
  const processedData = useMemo(() => {
    const assets: SecurityHubAIAsset[] = [];
    let isLive = false;
    const sources: string[] = [];

    // Process Security Hub findings for AI resources
    if (securityHubData?.live && securityHubData.top_findings) {
      isLive = true;
      sources.push('SecurityHub');

      for (let i = 0; i < securityHubData.top_findings.length; i++) {
        const finding = securityHubData.top_findings[i];
        const asset = findingToAsset(finding, i, registeredArns);
        if (asset) {
          assets.push(asset);
        }
      }
    }

    // Process discovered Bedrock Agents
    if (agentsData?.live && agentsData.agents) {
      isLive = true;
      if (!sources.includes('AgentCore')) sources.push('AgentCore');

      for (const agent of agentsData.agents) {
        const existingIdx = assets.findIndex(
          (a) => a.name === agent.name || a.arn.includes(agent.id)
        );

        if (existingIdx >= 0) {
          // Update existing asset
          assets[existingIdx].registrationStatus = 'registered';
          assets[existingIdx].awsStatus = agent.status;
        } else {
          // Add new asset
          assets.push({
            id: `agentcore-${agent.platform}-${agent.id}`,
            type: 'bedrock-agent',
            arn: `arn:aws:bedrock:us-east-1:123456789012:agent/${agent.id}`,
            name: agent.name,
            account: '123456789012',
            region: 'us-east-1',
            lastSeen: agent.updated_at || new Date().toISOString(),
            registrationStatus: 'registered',
            awsStatus: agent.status,
            findingsCount: 0,
            provider: agent.platform === 'agentcore-runtime' ? 'AgentCore' : 'Bedrock Agents',
            metadata: agent.version ? { version: agent.version } : undefined,
          });
        }
      }
    }

    // Process discovered Guardrails
    if (guardrailsData?.live && guardrailsData.guardrails) {
      isLive = true;
      if (!sources.includes('Guardrails')) sources.push('Guardrails');

      for (const gr of guardrailsData.guardrails) {
        const existingIdx = assets.findIndex(
          (a) => a.type === 'bedrock-guardrail' && (a.name === gr.name || a.arn.includes(gr.guardrail_id))
        );

        if (existingIdx >= 0) {
          assets[existingIdx].registrationStatus = 'registered';
          assets[existingIdx].awsStatus = gr.status;
        } else {
          assets.push({
            id: `guardrail-${gr.guardrail_id}`,
            type: 'bedrock-guardrail',
            arn: `arn:aws:bedrock:us-east-1:123456789012:guardrail/${gr.guardrail_id}`,
            name: gr.name,
            account: '123456789012',
            region: 'us-east-1',
            lastSeen: gr.created_at || new Date().toISOString(),
            registrationStatus: 'registered',
            awsStatus: gr.status,
            findingsCount: 0,
            provider: 'Bedrock',
            metadata: {
              version: gr.version,
              invocations: gr.invocations,
              interventionRate: gr.intervention_rate_pct,
            },
          });
        }
      }
    }

    // Process foundation models catalog
    if (modelsData?.live && modelsData.models) {
      isLive = true;
      if (!sources.includes('Models')) sources.push('Models');

      for (const model of modelsData.models) {
        const existingIdx = assets.findIndex(
          (a) => a.type === 'bedrock-model' && (a.name === model.name || a.arn.includes(model.model_id))
        );

        if (existingIdx < 0) {
          // Check if model is registered
          const isRegistered = registeredArns.has(model.model_id) || registeredArns.has(model.name);

          assets.push({
            id: `model-${model.model_id}`,
            type: 'bedrock-model',
            arn: `arn:aws:bedrock:us-east-1::foundation-model/${model.model_id}`,
            name: model.name,
            account: '123456789012',
            region: 'us-east-1',
            lastSeen: new Date().toISOString(),
            registrationStatus: isRegistered ? 'registered' : 'unregistered',
            awsStatus: model.lifecycle || 'ACTIVE',
            findingsCount: 0,
            provider: model.provider,
            metadata: {
              streaming: model.streaming,
              inferenceTypes: model.inference_types.join(', '),
            },
          });
        }
      }
    }

    // If no live data, use mock data
    if (!isLive || assets.length === 0) {
      return {
        assets: MOCK_ASSETS,
        isLive: false,
        source: 'mock',
      };
    }

    return {
      assets,
      isLive,
      source: sources.join('+'),
    };
  }, [securityHubData, agentsData, guardrailsData, modelsData, registeredArns]);

  // Calculate summary
  const summary = useMemo(() => calculateSummary(processedData.assets), [processedData.assets]);

  // Refresh function
  const refresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  return {
    discoveredAssets: processedData.assets,
    summary,
    loading,
    error,
    isLive: processedData.isLive,
    source: processedData.source,
    lastUpdated,
    refresh,
  };
}

export default useSecurityHubAIInventory;
