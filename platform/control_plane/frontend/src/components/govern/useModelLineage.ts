/**
 * useModelLineage — Fetch SageMaker model lineage data
 *
 * Calls the SageMaker QueryLineage API to get model provenance information:
 * - Training data artifacts
 * - Model artifacts
 * - Endpoint deployments
 * - Associations between artifacts
 * - Base model identification (for fine-tuned models)
 *
 * Degrades gracefully with mock data fallback when the API is unavailable.
 */

import { useState, useEffect, useMemo, useCallback } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8001';

// ─────────────────────────── Types ───────────────────────────

export type LineageNodeType = 'dataset' | 'model' | 'endpoint' | 'artifact' | 'context' | 'action';

export interface LineageNode {
  id: string;
  arn?: string;
  type: LineageNodeType;
  name: string;
  displayName: string;
  createdAt?: string;
  lastModifiedAt?: string;
  properties?: Record<string, string>;
  /** For models: identifies if this is a base model vs fine-tuned */
  modelType?: 'base' | 'fine-tuned' | 'custom';
  /** For fine-tuned models: the base model ARN/ID */
  baseModelId?: string;
  /** Source of data: 'live' or 'mock' */
  source: 'live' | 'mock';
}

export interface LineageEdge {
  sourceId: string;
  targetId: string;
  associationType: 'Produced' | 'DerivedFrom' | 'AssociatedWith' | 'ContributedTo';
}

export interface LineageGraph {
  nodes: LineageNode[];
  edges: LineageEdge[];
}

export interface ModelLineageStats {
  totalNodes: number;
  datasets: number;
  models: number;
  endpoints: number;
  basesModels: number;
  fineTunedModels: number;
}

export interface MLSBOM {
  specVersion: string;
  serialNumber: string;
  version: number;
  metadata: {
    timestamp: string;
    tools: Array<{ vendor: string; name: string; version: string }>;
    component: {
      type: string;
      name: string;
      version: string;
    };
  };
  components: Array<{
    type: string;
    name: string;
    version: string;
    description: string;
    licenses?: Array<{ license: { id: string } }>;
    externalReferences?: Array<{ type: string; url: string }>;
    properties?: Array<{ name: string; value: string }>;
  }>;
  dependencies: Array<{
    ref: string;
    dependsOn: string[];
  }>;
}

export interface UseModelLineageResult {
  loading: boolean;
  error: string | null;
  graph: LineageGraph;
  stats: ModelLineageStats;
  live: boolean;
  selectedNode: LineageNode | null;
  selectNode: (nodeId: string | null) => void;
  exportMLSBOM: () => MLSBOM;
  refresh: () => void;
}

// ─────────────────────────── Mock Data ───────────────────────────

function generateMockLineageGraph(): LineageGraph {
  const nodes: LineageNode[] = [
    // Training datasets
    {
      id: 'ds-financial-corpus',
      type: 'dataset',
      name: 'financial-corpus-v2',
      displayName: 'Financial Corpus v2',
      createdAt: '2024-11-15T10:30:00Z',
      properties: {
        'Records': '2.4M',
        'Format': 'Parquet',
        'S3Location': 's3://data-lake/financial-corpus/',
        'Classification': 'Confidential',
      },
      source: 'mock',
    },
    {
      id: 'ds-customer-interactions',
      type: 'dataset',
      name: 'customer-interactions-q4',
      displayName: 'Customer Interactions Q4',
      createdAt: '2024-12-01T08:00:00Z',
      properties: {
        'Records': '850K',
        'Format': 'JSON',
        'S3Location': 's3://data-lake/customer-interactions/',
        'PII': 'Redacted',
      },
      source: 'mock',
    },
    {
      id: 'ds-compliance-docs',
      type: 'dataset',
      name: 'compliance-documents',
      displayName: 'Compliance Documents',
      createdAt: '2024-10-20T14:00:00Z',
      properties: {
        'Records': '125K',
        'Format': 'PDF/Text',
        'S3Location': 's3://data-lake/compliance-docs/',
        'Sensitivity': 'Internal',
      },
      source: 'mock',
    },

    // Base models
    {
      id: 'model-claude-3-haiku',
      type: 'model',
      name: 'anthropic.claude-3-haiku-20240307-v1:0',
      displayName: 'Claude 3 Haiku',
      modelType: 'base',
      createdAt: '2024-03-07T00:00:00Z',
      properties: {
        'Provider': 'Anthropic',
        'Version': '1.0',
        'Parameters': '20B',
        'Context': '200K tokens',
      },
      source: 'mock',
    },
    {
      id: 'model-titan-embed',
      type: 'model',
      name: 'amazon.titan-embed-text-v2:0',
      displayName: 'Titan Embeddings v2',
      modelType: 'base',
      createdAt: '2024-04-15T00:00:00Z',
      properties: {
        'Provider': 'Amazon',
        'Dimensions': '1024',
        'Max Tokens': '8192',
      },
      source: 'mock',
    },

    // Fine-tuned models
    {
      id: 'model-fsi-advisor',
      type: 'model',
      name: 'fsi-financial-advisor-v3',
      displayName: 'FSI Financial Advisor v3',
      modelType: 'fine-tuned',
      baseModelId: 'model-claude-3-haiku',
      createdAt: '2025-01-10T16:00:00Z',
      lastModifiedAt: '2025-01-15T09:30:00Z',
      properties: {
        'Provider': 'Custom',
        'Base Model': 'Claude 3 Haiku',
        'Training Jobs': '3',
        'Epochs': '5',
        'Loss': '0.0023',
      },
      source: 'mock',
    },
    {
      id: 'model-compliance-qa',
      type: 'model',
      name: 'compliance-qa-bot-v2',
      displayName: 'Compliance QA Bot v2',
      modelType: 'fine-tuned',
      baseModelId: 'model-claude-3-haiku',
      createdAt: '2025-01-05T11:00:00Z',
      properties: {
        'Provider': 'Custom',
        'Base Model': 'Claude 3 Haiku',
        'Training Jobs': '2',
        'Accuracy': '94.2%',
      },
      source: 'mock',
    },

    // Endpoints
    {
      id: 'endpoint-fsi-prod',
      type: 'endpoint',
      name: 'fsi-advisor-prod-endpoint',
      displayName: 'FSI Advisor (Prod)',
      createdAt: '2025-01-16T10:00:00Z',
      properties: {
        'Status': 'InService',
        'Instance Type': 'ml.g5.xlarge',
        'Invocations/Day': '45K',
        'Latency P99': '1.2s',
      },
      source: 'mock',
    },
    {
      id: 'endpoint-compliance-prod',
      type: 'endpoint',
      name: 'compliance-qa-prod-endpoint',
      displayName: 'Compliance QA (Prod)',
      createdAt: '2025-01-08T14:00:00Z',
      properties: {
        'Status': 'InService',
        'Instance Type': 'ml.g5.2xlarge',
        'Invocations/Day': '12K',
        'Latency P99': '0.8s',
      },
      source: 'mock',
    },
    {
      id: 'endpoint-embed-shared',
      type: 'endpoint',
      name: 'titan-embed-shared-endpoint',
      displayName: 'Titan Embed (Shared)',
      createdAt: '2024-12-01T00:00:00Z',
      properties: {
        'Status': 'InService',
        'Instance Type': 'ml.g4dn.xlarge',
        'Invocations/Day': '120K',
        'Latency P99': '0.15s',
      },
      source: 'mock',
    },
  ];

  const edges: LineageEdge[] = [
    // Datasets feed into fine-tuned models
    { sourceId: 'ds-financial-corpus', targetId: 'model-fsi-advisor', associationType: 'ContributedTo' },
    { sourceId: 'ds-customer-interactions', targetId: 'model-fsi-advisor', associationType: 'ContributedTo' },
    { sourceId: 'ds-compliance-docs', targetId: 'model-compliance-qa', associationType: 'ContributedTo' },

    // Fine-tuned models derive from base models
    { sourceId: 'model-claude-3-haiku', targetId: 'model-fsi-advisor', associationType: 'DerivedFrom' },
    { sourceId: 'model-claude-3-haiku', targetId: 'model-compliance-qa', associationType: 'DerivedFrom' },

    // Models produce endpoints
    { sourceId: 'model-fsi-advisor', targetId: 'endpoint-fsi-prod', associationType: 'Produced' },
    { sourceId: 'model-compliance-qa', targetId: 'endpoint-compliance-prod', associationType: 'Produced' },
    { sourceId: 'model-titan-embed', targetId: 'endpoint-embed-shared', associationType: 'Produced' },
  ];

  return { nodes, edges };
}

// ─────────────────────────── API Fetch ───────────────────────────

async function fetchLineageFromAPI(): Promise<{ graph: LineageGraph; live: boolean }> {
  try {
    const response = await fetch(`${API_BASE}/api/v1/govern/sagemaker/lineage`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json();

    // Transform API response to our graph format
    const nodes: LineageNode[] = [];
    const edges: LineageEdge[] = [];

    // Process artifacts (datasets, models)
    (data.artifacts || []).forEach((artifact: any) => {
      const type = inferNodeType(artifact.artifact_type);
      nodes.push({
        id: artifact.artifact_arn || artifact.artifact_name,
        arn: artifact.artifact_arn,
        type,
        name: artifact.artifact_name,
        displayName: artifact.artifact_name?.split('/').pop() || artifact.artifact_name,
        createdAt: artifact.creation_time,
        lastModifiedAt: artifact.last_modified_time,
        properties: artifact.properties || {},
        modelType: type === 'model' ? inferModelType(artifact) : undefined,
        baseModelId: artifact.properties?.['BaseModelArn'],
        source: 'live',
      });
    });

    // Process contexts (training jobs, experiments)
    (data.contexts || []).forEach((context: any) => {
      nodes.push({
        id: context.context_arn || context.context_name,
        arn: context.context_arn,
        type: 'context',
        name: context.context_name,
        displayName: context.context_name?.split('/').pop() || context.context_name,
        createdAt: context.creation_time,
        properties: context.properties || {},
        source: 'live',
      });
    });

    // Process associations (edges)
    (data.associations || []).forEach((assoc: any) => {
      edges.push({
        sourceId: assoc.source_arn,
        targetId: assoc.destination_arn,
        associationType: assoc.association_type || 'AssociatedWith',
      });
    });

    return { graph: { nodes, edges }, live: data.live ?? true };
  } catch (err) {
    console.warn('SageMaker lineage API unavailable, using mock data:', err);
    return { graph: generateMockLineageGraph(), live: false };
  }
}

function inferNodeType(artifactType: string): LineageNodeType {
  if (!artifactType) return 'artifact';
  const lower = artifactType.toLowerCase();
  if (lower.includes('dataset') || lower.includes('data')) return 'dataset';
  if (lower.includes('model')) return 'model';
  if (lower.includes('endpoint')) return 'endpoint';
  return 'artifact';
}

function inferModelType(artifact: any): 'base' | 'fine-tuned' | 'custom' {
  const props = artifact.properties || {};
  if (props['BaseModelArn'] || props['base_model']) return 'fine-tuned';
  if (props['provider']?.toLowerCase().includes('custom')) return 'custom';
  // Check if it looks like a foundation model
  const name = (artifact.artifact_name || '').toLowerCase();
  if (name.includes('claude') || name.includes('titan') || name.includes('llama') || name.includes('cohere')) {
    return 'base';
  }
  return 'custom';
}

// ─────────────────────────── ML-SBOM Export ───────────────────────────

function generateMLSBOM(graph: LineageGraph): MLSBOM {
  const timestamp = new Date().toISOString();
  const serialNumber = `urn:uuid:${crypto.randomUUID?.() || Math.random().toString(36).substring(2)}`;

  // Find the primary model (fine-tuned if available, otherwise first model)
  const models = graph.nodes.filter(n => n.type === 'model');
  const primaryModel = models.find(m => m.modelType === 'fine-tuned') || models[0];

  const components = graph.nodes.map(node => ({
    type: mapNodeTypeToSBOMType(node.type),
    name: node.name,
    version: node.properties?.['Version'] || '1.0.0',
    description: `${node.displayName} (${node.type})`,
    properties: Object.entries(node.properties || {}).map(([name, value]) => ({
      name,
      value: String(value),
    })),
    externalReferences: node.arn ? [{ type: 'distribution', url: node.arn }] : undefined,
  }));

  const dependencies = graph.edges.map(edge => ({
    ref: edge.targetId,
    dependsOn: [edge.sourceId],
  }));

  // Consolidate dependencies by target
  const consolidatedDeps: Array<{ ref: string; dependsOn: string[] }> = [];
  const depMap = new Map<string, Set<string>>();
  dependencies.forEach(dep => {
    if (!depMap.has(dep.ref)) {
      depMap.set(dep.ref, new Set());
    }
    dep.dependsOn.forEach(d => depMap.get(dep.ref)!.add(d));
  });
  depMap.forEach((sources, ref) => {
    consolidatedDeps.push({ ref, dependsOn: Array.from(sources) });
  });

  return {
    specVersion: '1.5',
    serialNumber,
    version: 1,
    metadata: {
      timestamp,
      tools: [
        { vendor: 'AVA Platform', name: 'Model Lineage Viewer', version: '1.0.0' },
      ],
      component: {
        type: 'machine-learning-model',
        name: primaryModel?.name || 'Unknown Model',
        version: primaryModel?.properties?.['Version'] || '1.0.0',
      },
    },
    components,
    dependencies: consolidatedDeps,
  };
}

function mapNodeTypeToSBOMType(type: LineageNodeType): string {
  switch (type) {
    case 'dataset': return 'data';
    case 'model': return 'machine-learning-model';
    case 'endpoint': return 'platform';
    default: return 'library';
  }
}

// ─────────────────────────── Hook ───────────────────────────

export function useModelLineage(): UseModelLineageResult {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [graph, setGraph] = useState<LineageGraph>({ nodes: [], edges: [] });
  const [live, setLive] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchLineageFromAPI()
      .then(result => {
        if (!cancelled) {
          setGraph(result.graph);
          setLive(result.live);
        }
      })
      .catch(err => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load lineage');
          // Still set mock data so UI has something to show
          setGraph(generateMockLineageGraph());
          setLive(false);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [refreshKey]);

  const stats = useMemo<ModelLineageStats>(() => {
    const datasets = graph.nodes.filter(n => n.type === 'dataset').length;
    const models = graph.nodes.filter(n => n.type === 'model').length;
    const endpoints = graph.nodes.filter(n => n.type === 'endpoint').length;
    const basesModels = graph.nodes.filter(n => n.type === 'model' && n.modelType === 'base').length;
    const fineTunedModels = graph.nodes.filter(n => n.type === 'model' && n.modelType === 'fine-tuned').length;

    return {
      totalNodes: graph.nodes.length,
      datasets,
      models,
      endpoints,
      basesModels,
      fineTunedModels,
    };
  }, [graph]);

  const selectedNode = useMemo(() => {
    if (!selectedNodeId) return null;
    return graph.nodes.find(n => n.id === selectedNodeId) || null;
  }, [graph, selectedNodeId]);

  const selectNode = useCallback((nodeId: string | null) => {
    setSelectedNodeId(nodeId);
  }, []);

  const exportMLSBOM = useCallback(() => {
    return generateMLSBOM(graph);
  }, [graph]);

  const refresh = useCallback(() => {
    setRefreshKey(k => k + 1);
  }, []);

  return {
    loading,
    error,
    graph,
    stats,
    live,
    selectedNode,
    selectNode,
    exportMLSBOM,
    refresh,
  };
}

export default useModelLineage;
