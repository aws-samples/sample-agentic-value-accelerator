/**
 * useModelLineage — Fetch real SageMaker ML Lineage data
 *
 * Calls the backend GET /api/v1/govern/sagemaker/lineage route, which reads the
 * SageMaker ML Lineage list APIs (ListArtifacts / ListContexts / ListAssociations)
 * to build a model provenance graph:
 * - Training data artifacts
 * - Model artifacts
 * - Endpoint deployment contexts
 * - Associations (edges) between entities
 *
 * This hook shows only real data. When the account has no lineage entities
 * (the common case until models are registered / lineage tracking runs) it
 * returns an empty graph that is still honestly `live` — never fabricated demo
 * data. A non-live state (`live=false`) is reserved for genuine failures:
 * the API being unreachable or lineage list permissions not being granted.
 */

import { useState, useEffect, useMemo, useCallback } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || '';

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
  /** SPDX license identifier */
  licenseSpdx?: string;
  /** License URL */
  licenseUrl?: string;
  /** SHA-256 hash of the artifact for integrity */
  hash?: string;
  /** Supplier information */
  supplier?: {
    name: string;
    email?: string;
    url?: string;
  };
  /** Sensitivity level for data nodes */
  sensitivityLevel?: 'public' | 'internal' | 'confidential' | 'restricted';
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

export interface MLSBOMSupplier {
  name: string;
  url?: string;
  contact?: Array<{ email?: string; name?: string }>;
}

export interface MLSBOMComponent {
  type: string;
  name: string;
  version: string;
  description: string;
  licenses?: Array<{ license: { id: string; url?: string } }>;
  externalReferences?: Array<{ type: string; url: string }>;
  properties?: Array<{ name: string; value: string }>;
  supplier?: MLSBOMSupplier;
  hashes?: Array<{ alg: string; content: string }>;
  pedigree?: {
    ancestors?: Array<{ type: string; name: string; version?: string }>;
  };
}

export interface MLSBOMPrivacyInfo {
  differentialPrivacy?: {
    enabled: boolean;
    mechanism: string;
    epsilon: number;
    delta?: number;
    noiseMultiplier?: number;
    maxGradNorm?: number;
  };
  privacyRiskAssessment?: {
    membershipInferenceRisk: string;
    dataExtractionRisk: string;
    assessmentMethod?: string;
    mitigations?: string[];
  };
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
    supplier?: MLSBOMSupplier;
    licenses?: Array<{ license: { id: string; url?: string } }>;
    privacy?: MLSBOMPrivacyInfo;
  };
  components: MLSBOMComponent[];
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
  /** Honest note from the backend (e.g. "no lineage entities in this account"). */
  note: string | null;
  selectedNode: LineageNode | null;
  selectNode: (nodeId: string | null) => void;
  exportMLSBOM: () => MLSBOM;
  refresh: () => void;
}

// ─────────────────────────── API Fetch ───────────────────────────

interface LineageFetchResult {
  graph: LineageGraph;
  live: boolean;
  note: string | null;
}

/**
 * Fetch the real SageMaker ML Lineage graph from the backend.
 *
 * A 200 with empty arrays is a valid, honestly-live empty graph — NOT an error
 * and NOT a cue to fabricate demo data. Only a non-2xx response or a network
 * failure throws; the hook then renders an honest non-live / error state.
 */
async function fetchLineageFromAPI(): Promise<LineageFetchResult> {
  const response = await fetch(`${API_BASE}/api/v1/govern/sagemaker/lineage`);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const data = await response.json();

  // Transform the real API response into our graph format.
  const nodes: LineageNode[] = [];
  const edges: LineageEdge[] = [];

  // Artifacts (datasets, models, images)
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

  // Contexts (endpoints, model deployments, experiments)
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

  // Associations (edges)
  (data.associations || []).forEach((assoc: any) => {
    edges.push({
      sourceId: assoc.source_arn,
      targetId: assoc.destination_arn,
      associationType: assoc.association_type || 'AssociatedWith',
    });
  });

  return { graph: { nodes, edges }, live: data.live ?? true, note: data.note ?? null };
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

  // Find base model for fine-tuned primary model
  const baseModel = primaryModel?.baseModelId
    ? graph.nodes.find(n => n.id === primaryModel.baseModelId)
    : undefined;

  const components: MLSBOMComponent[] = graph.nodes.map(node => {
    const component: MLSBOMComponent = {
      type: mapNodeTypeToSBOMType(node.type),
      name: node.name,
      version: node.properties?.['Version'] || 'unknown',
      description: `${node.displayName} (${node.type})`,
      properties: [
        ...Object.entries(node.properties || {}).map(([name, value]) => ({
          name,
          value: String(value),
        })),
        // Add sensitivity level for data components
        ...(node.sensitivityLevel ? [{ name: 'sensitivityLevel', value: node.sensitivityLevel }] : []),
        // Add model type for ML models
        ...(node.modelType ? [{ name: 'modelType', value: node.modelType }] : []),
      ],
      externalReferences: node.arn ? [{ type: 'distribution', url: node.arn }] : undefined,
    };

    // Add license info if available
    if (node.licenseSpdx) {
      component.licenses = [{
        license: {
          id: node.licenseSpdx,
          ...(node.licenseUrl ? { url: node.licenseUrl } : {}),
        },
      }];
    }

    // Add supplier info if available
    if (node.supplier) {
      component.supplier = {
        name: node.supplier.name,
        ...(node.supplier.url ? { url: node.supplier.url } : {}),
        ...(node.supplier.email ? { contact: [{ email: node.supplier.email }] } : {}),
      };
    }

    // Add hash if available
    if (node.hash) {
      const [alg, content] = node.hash.includes(':') ? node.hash.split(':') : ['sha256', node.hash];
      component.hashes = [{ alg: alg.toUpperCase(), content }];
    }

    // Add pedigree for fine-tuned models
    if (node.modelType === 'fine-tuned' && node.baseModelId) {
      const baseNode = graph.nodes.find(n => n.id === node.baseModelId);
      if (baseNode) {
        component.pedigree = {
          ancestors: [{
            type: 'machine-learning-model',
            name: baseNode.name,
            version: baseNode.properties?.['Version'],
          }],
        };
      }
    }

    return component;
  });

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

  // Build metadata with supplier and license info from primary model
  const metadata: MLSBOM['metadata'] = {
    timestamp,
    tools: [
      { vendor: 'AVA Platform', name: 'Model Lineage Viewer', version: '1.0.0' },
    ],
    component: {
      type: 'machine-learning-model',
      name: primaryModel?.name || 'Unknown Model',
      version: primaryModel?.properties?.['Version'] || 'unknown',
    },
  };

  // Add supplier from primary model or base model
  const supplierSource = primaryModel?.supplier || baseModel?.supplier;
  if (supplierSource) {
    metadata.supplier = {
      name: supplierSource.name,
      ...(supplierSource.url ? { url: supplierSource.url } : {}),
      ...(supplierSource.email ? { contact: [{ email: supplierSource.email }] } : {}),
    };
  }

  // Add license from primary model
  if (primaryModel?.licenseSpdx) {
    metadata.licenses = [{
      license: {
        id: primaryModel.licenseSpdx,
        ...(primaryModel.licenseUrl ? { url: primaryModel.licenseUrl } : {}),
      },
    }];
  }

  // Privacy metadata (differential privacy, membership-inference risk, etc.) is
  // intentionally omitted: SageMaker ML Lineage does not expose these values, so
  // publishing them would be fabricated governance data. If a future lineage /
  // model-registry integration surfaces real privacy attributes, populate
  // `metadata.privacy` from those fields here — never from hardcoded defaults.

  return {
    specVersion: '1.5',
    serialNumber,
    version: 1,
    metadata,
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
  const [note, setNote] = useState<string | null>(null);
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
          setNote(result.note);
        }
      })
      .catch(err => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load lineage');
          // Honest failure: show an empty graph, never fabricated demo data.
          setGraph({ nodes: [], edges: [] });
          setLive(false);
          setNote(null);
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
    note,
    selectedNode,
    selectNode,
    exportMLSBOM,
    refresh,
  };
}

export default useModelLineage;
