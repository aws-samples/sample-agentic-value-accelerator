/**
 * useDataGovernance — Aggregates data governance info from AVA platform
 *
 * Integrates real data from:
 * - deploymentsApi: Which agents are deployed and their data configurations
 * - prioritizationApi: Use cases with data requirements
 * - guardrailsApi: PII/PHI/PCI protection configurations and metrics
 * - serviceApprovalApi: Data access approval workflows
 *
 * This hook answers:
 * - What agents are consuming what data sources?
 * - What data protection controls are in place?
 * - What data was blocked/anonymized/allowed?
 * - What is the audit trail for data access?
 */

import { useState, useEffect, useMemo } from 'react';
import {
  guardrailsApi,
  deploymentsApi,
  prioritizationApi,
  serviceApprovalApi,
  maturityApi,
  getTemplates,
} from '../../../api/client';
import type { UseCase, MaturityAssessment } from '../../../api/client';
import type {
  GuardrailTemplate,
  Deployment,
  ServiceApprovalRun,
  GuardrailMetrics,
  Template,
} from '../../../types';

// ─────────────────────────── Types ───────────────────────────

export interface AgentDataProfile {
  deploymentId: string;
  deploymentName: string;
  templateId: string;
  status: string;
  createdBy: string;
  createdAt: string;
  awsAccount: string;
  awsRegion: string;
  dataSources: DataSourceLink[];
  guardrails: GuardrailLink[];
  dataProtectionSummary: {
    piiEntitiesProtected: string[];
    sensitiveRegexes: string[];
    contentFiltersActive: string[];
  };
}

export interface DataSourceLink {
  type: 'knowledge_base' | 's3_bucket' | 'use_case_data' | 'parameter';
  name: string;
  path: string;
  sensitivity?: 'restricted' | 'confidential' | 'internal' | 'public';
}

export interface GuardrailLink {
  templateId: string;
  name: string;
  status: string;
  guardrailId?: string;
  piiCount: number;
  metrics?: GuardrailMetrics;
}

export interface DataProtectionEvent {
  timestamp: string;
  agentName: string;
  guardrailName: string;
  action: 'block' | 'anonymize' | 'allow' | 'flag';
  filterType: string;
  details?: string;
  inputSnippet?: string;
}

export interface UseCaseDataRequirement {
  useCaseId: string;
  useCaseName: string;
  businessDomain: string;
  status: string;
  dataReadinessScore?: number;
  technicalOwner?: string;
  businessOwner?: string;
}

export interface DataGovernanceSummary {
  totalAgents: number;
  agentsWithGuardrails: number;
  agentsWithoutGuardrails: number;
  totalGuardrails: number;
  activeGuardrails: number;
  totalPiiTypesProtected: number;
  uniquePiiTypes: string[];
  last24hEvents: {
    total: number;
    blocked: number;
    anonymized: number;
    allowed: number;
  };
  useCasesWithDataRequirements: number;
  pendingApprovals: number;
}

// AI Readiness - computed from maturity assessments and use case scores
export interface DataReadinessMetrics {
  overallScore: number;
  dimensions: {
    name: string;
    score: number;
    maxScore: number;
    sources: string[];
  }[];
  useCaseReadiness: {
    useCaseId: string;
    name: string;
    dataReadiness: number;
    status: string;
  }[];
  maturityDataScore: number | null;
  assessmentCompletion: number;
}

// Data Lineage - computed from deployments and templates
export interface DataLineageNode {
  id: string;
  type: 'source' | 'transform' | 'agent' | 'guardrail' | 'output';
  label: string;
  details: string;
  status: 'active' | 'pending' | 'error';
  metadata?: Record<string, string>;
}

export interface DataLineageFlow {
  agentId: string;
  agentName: string;
  templateId: string;
  nodes: DataLineageNode[];
  protectionStatus: {
    hasGuardrails: boolean;
    piiProtected: boolean;
    contentFiltered: boolean;
  };
}

// Access Control - computed from approvals and deployments
export interface AccessControlEntry {
  resourceType: 'deployment' | 'guardrail' | 'service' | 'data';
  resourceId: string;
  resourceName: string;
  owner: string;
  createdAt: string;
  accessLevel: 'read' | 'write' | 'admin';
  awsAccount: string;
  awsRegion: string;
}

export interface PendingApproval {
  slug: string;
  service: string;
  framework: string;
  status: string;
  requestedBy: string;
  requestedAt: string;
  phases: { key: string; status: string }[];
}

export interface DataGovernanceResult {
  loading: boolean;
  error: string | null;

  summary: DataGovernanceSummary;
  agentProfiles: AgentDataProfile[];
  useCaseRequirements: UseCaseDataRequirement[];
  recentDataEvents: DataProtectionEvent[];
  guardrailsWithMetrics: GuardrailLink[];
  serviceApprovals: ServiceApprovalRun[];

  // New: AI Readiness data
  readinessMetrics: DataReadinessMetrics;

  // New: Data Lineage flows
  lineageFlows: DataLineageFlow[];

  // New: Access Control data
  accessEntries: AccessControlEntry[];
  pendingApprovals: PendingApproval[];

  // Raw data for components that need it
  templates: Template[];
  maturityAssessments: MaturityAssessment[];

  refresh: () => void;
}

// ─────────────────────────── Hook ───────────────────────────

export function useDataGovernance(): DataGovernanceResult {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Raw data from APIs
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [guardrails, setGuardrails] = useState<GuardrailTemplate[]>([]);
  const [guardrailMetricsMap, setGuardrailMetricsMap] = useState<Map<string, GuardrailMetrics>>(new Map());
  const [useCases, setUseCases] = useState<UseCase[]>([]);
  const [serviceApprovals, setServiceApprovals] = useState<ServiceApprovalRun[]>([]);
  const [maturityAssessments, setMaturityAssessments] = useState<MaturityAssessment[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);

  // Load data from APIs
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      setError(null);

      try {
        const [deploymentsRes, guardrailsRes, useCasesRes, approvalsRes, maturityRes, templatesRes] = await Promise.allSettled([
          deploymentsApi.list(),
          guardrailsApi.list(),
          prioritizationApi.list(),
          serviceApprovalApi.list(),
          maturityApi.list(),
          getTemplates(),
        ]);

        if (deploymentsRes.status === 'fulfilled') {
          setDeployments(deploymentsRes.value);
        }

        let activeGuardrails: GuardrailTemplate[] = [];
        if (guardrailsRes.status === 'fulfilled') {
          activeGuardrails = guardrailsRes.value.filter(g => g.status !== 'deleted');
          setGuardrails(activeGuardrails);
        }

        if (useCasesRes.status === 'fulfilled') {
          setUseCases(useCasesRes.value);
        }

        if (approvalsRes.status === 'fulfilled') {
          setServiceApprovals(approvalsRes.value);
        }

        if (maturityRes.status === 'fulfilled') {
          setMaturityAssessments(maturityRes.value);
        }

        if (templatesRes.status === 'fulfilled') {
          setTemplates(templatesRes.value);
        }

        // Fetch metrics for active guardrails
        const guardrailsWithIds = activeGuardrails.filter(g => g.guardrail_id && g.status === 'active');
        if (guardrailsWithIds.length > 0) {
          const metricsPromises = guardrailsWithIds.map(g =>
            guardrailsApi.getMetrics(g.template_id, 24).catch(() => null)
          );
          const metricsResults = await Promise.all(metricsPromises);
          const metricsMap = new Map<string, GuardrailMetrics>();
          metricsResults.forEach((m, i) => {
            if (m) metricsMap.set(guardrailsWithIds[i].template_id, m);
          });
          setGuardrailMetricsMap(metricsMap);
        }

      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load data governance data');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [refreshKey]);

  // Transform deployments into agent data profiles
  const agentProfiles = useMemo<AgentDataProfile[]>(() => {
    return deployments.map(d => {
      // Extract data sources from deployment parameters
      const dataSources: DataSourceLink[] = [];

      if (d.parameters) {
        // Look for knowledge base references
        if (d.parameters.knowledge_base_id) {
          dataSources.push({
            type: 'knowledge_base',
            name: 'Knowledge Base',
            path: d.parameters.knowledge_base_id,
            sensitivity: 'internal',
          });
        }

        // Look for S3 data paths
        Object.entries(d.parameters).forEach(([key, value]) => {
          if (key.includes('s3') || key.includes('bucket') || key.includes('data_path')) {
            dataSources.push({
              type: 's3_bucket',
              name: key,
              path: value,
              sensitivity: 'confidential',
            });
          }
        });
      }

      // Find guardrails that might be associated with this deployment
      // (In a real system, this would be a direct link in the deployment config)
      const associatedGuardrails: GuardrailLink[] = guardrails
        .filter(g => g.status === 'active')
        .map(g => ({
          templateId: g.template_id,
          name: g.name,
          status: g.status,
          guardrailId: g.guardrail_id,
          piiCount: g.pii_entities?.length || 0,
          metrics: guardrailMetricsMap.get(g.template_id),
        }));

      // Aggregate PII protection info
      const allPiiEntities = guardrails.flatMap(g => g.pii_entities || []);
      const allRegexes = guardrails.flatMap(g => g.sensitive_regexes || []);
      const allFilters = guardrails.flatMap(g => g.content_filters || []);

      return {
        deploymentId: d.deployment_id,
        deploymentName: d.deployment_name,
        templateId: d.template_id,
        status: d.status,
        createdBy: d.created_by,
        createdAt: d.created_at,
        awsAccount: d.aws_account,
        awsRegion: d.aws_region,
        dataSources,
        guardrails: associatedGuardrails,
        dataProtectionSummary: {
          piiEntitiesProtected: [...new Set(allPiiEntities.map(p => p.type))],
          sensitiveRegexes: allRegexes.map(r => r.name),
          contentFiltersActive: allFilters.map(f => f.type),
        },
      };
    });
  }, [deployments, guardrails, guardrailMetricsMap]);

  // Transform use cases into data requirements
  const useCaseRequirements = useMemo<UseCaseDataRequirement[]>(() => {
    return useCases.map(uc => ({
      useCaseId: uc.use_case_id,
      useCaseName: uc.name,
      businessDomain: uc.business_domain,
      status: uc.status,
      dataReadinessScore: uc.scores?.technical_feasibility?.data_readiness,
      technicalOwner: uc.technical_owner,
      businessOwner: uc.business_owner,
    }));
  }, [useCases]);

  // Aggregate recent data protection events
  const recentDataEvents = useMemo<DataProtectionEvent[]>(() => {
    const events: DataProtectionEvent[] = [];

    guardrailMetricsMap.forEach((metrics, templateId) => {
      const guardrail = guardrails.find(g => g.template_id === templateId);
      if (!guardrail || !metrics.recent_events) return;

      metrics.recent_events.forEach(e => {
        events.push({
          timestamp: e.timestamp,
          agentName: guardrail.name,
          guardrailName: e.guardrail_name || guardrail.name,
          action: e.action as 'block' | 'anonymize' | 'allow' | 'flag',
          filterType: e.filter_type || 'unknown',
          details: e.details ? JSON.stringify(e.details) : undefined,
          inputSnippet: e.input_snippet,
        });
      });
    });

    // Sort by timestamp descending
    return events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [guardrails, guardrailMetricsMap]);

  // Compute summary statistics
  const summary = useMemo<DataGovernanceSummary>(() => {
    const activeGuardrailsList = guardrails.filter(g => g.status === 'active');
    const allPiiTypes = guardrails.flatMap(g => (g.pii_entities || []).map(p => p.type));
    const uniquePiiTypes = [...new Set(allPiiTypes)];

    // Aggregate metrics
    let totalInvocations = 0;
    let totalBlocked = 0;
    let totalAnonymized = 0;
    let totalAllowed = 0;

    guardrailMetricsMap.forEach(m => {
      totalInvocations += m.total_invocations;
      totalBlocked += m.blocked_count;
      totalAnonymized += m.anonymized_count;
      totalAllowed += m.allowed_count;
    });

    // Count agents (Bedrock Agents from agentProfiles, not just deployments)
    // For now, use deployments as proxy for agents
    const agentCount = deployments.length;

    // Count agents that have guardrail parameters configured
    const agentsWithGuardrailParams = deployments.filter(d =>
      d.parameters && Object.keys(d.parameters).some(k => k.includes('guardrail'))
    ).length;

    return {
      totalAgents: agentCount,
      agentsWithGuardrails: agentsWithGuardrailParams,
      agentsWithoutGuardrails: Math.max(0, agentCount - agentsWithGuardrailParams),
      totalGuardrails: guardrails.length,
      activeGuardrails: activeGuardrailsList.length,
      totalPiiTypesProtected: allPiiTypes.length,
      uniquePiiTypes,
      last24hEvents: {
        total: totalInvocations,
        blocked: totalBlocked,
        anonymized: totalAnonymized,
        allowed: totalAllowed,
      },
      useCasesWithDataRequirements: useCases.filter(uc =>
        uc.scores?.technical_feasibility?.data_readiness !== undefined
      ).length,
      pendingApprovals: serviceApprovals.filter(sa => sa.status === 'pending' || sa.status === 'running').length,
    };
  }, [deployments, guardrails, guardrailMetricsMap, useCases, serviceApprovals]);

  // Guardrails with metrics for detailed view
  const guardrailsWithMetrics = useMemo<GuardrailLink[]>(() => {
    return guardrails.map(g => ({
      templateId: g.template_id,
      name: g.name,
      status: g.status,
      guardrailId: g.guardrail_id,
      piiCount: g.pii_entities?.length || 0,
      metrics: guardrailMetricsMap.get(g.template_id),
    }));
  }, [guardrails, guardrailMetricsMap]);

  // Compute AI Readiness metrics from maturity assessments and use cases
  const readinessMetrics = useMemo<DataReadinessMetrics>(() => {
    // Get data dimension score from most recent maturity assessment
    const latestMaturity = maturityAssessments
      .filter(a => a.status === 'Complete' || a.status === 'In Progress')
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())[0];

    const maturityDataScore = latestMaturity?.computed?.dimensions?.data?.average ?? null;
    const assessmentCompletion = latestMaturity?.computed?.completion ?? 0;

    // Get use case data readiness scores
    const useCaseReadiness = useCases
      .filter(uc => uc.scores?.technical_feasibility?.data_readiness !== undefined)
      .map(uc => ({
        useCaseId: uc.use_case_id,
        name: uc.name,
        dataReadiness: uc.scores.technical_feasibility.data_readiness,
        status: uc.status,
      }));

    // Compute dimension scores from real data
    const dimensions = [
      {
        name: 'Data Protection',
        score: guardrails.filter(g => g.status === 'active').length > 0 ? 4 : 1,
        maxScore: 5,
        sources: ['Guardrails API', `${guardrails.filter(g => g.status === 'active').length} active guardrails`],
      },
      {
        name: 'PII Coverage',
        score: Math.min(5, Math.ceil((summary.uniquePiiTypes.length / 10) * 5)),
        maxScore: 5,
        sources: ['Guardrails API', `${summary.uniquePiiTypes.length} PII types protected`],
      },
      {
        name: 'Data Maturity',
        score: maturityDataScore ? Math.round(maturityDataScore) : 0,
        maxScore: 5,
        sources: latestMaturity ? ['Maturity Assessment', latestMaturity.name] : ['No assessment'],
      },
      {
        name: 'Use Case Readiness',
        score: useCaseReadiness.length > 0
          ? Math.round(useCaseReadiness.reduce((sum, uc) => sum + uc.dataReadiness, 0) / useCaseReadiness.length)
          : 0,
        maxScore: 5,
        sources: ['Use Case Prioritization', `${useCaseReadiness.length} use cases scored`],
      },
      {
        name: 'Agent Data Integration',
        score: deployments.length > 0 ? Math.min(5, Math.ceil((deployments.length / 5) * 5)) : 0,
        maxScore: 5,
        sources: ['Deployments API', `${deployments.length} agents deployed`],
      },
      {
        name: 'Access Governance',
        score: serviceApprovals.filter(sa => sa.status === 'completed').length > 0 ? 4 : 2,
        maxScore: 5,
        sources: ['Service Approval API', `${serviceApprovals.filter(sa => sa.status === 'completed').length} completed approvals`],
      },
      {
        name: 'Audit Trail',
        score: summary.last24hEvents.total > 0 ? 5 : 2,
        maxScore: 5,
        sources: ['Guardrail Metrics', `${summary.last24hEvents.total} events tracked`],
      },
    ];

    const totalScore = dimensions.reduce((sum, d) => sum + d.score, 0);
    const maxTotalScore = dimensions.reduce((sum, d) => sum + d.maxScore, 0);
    const overallScore = Math.round((totalScore / maxTotalScore) * 100);

    return {
      overallScore,
      dimensions,
      useCaseReadiness,
      maturityDataScore,
      assessmentCompletion,
    };
  }, [maturityAssessments, useCases, guardrails, deployments, serviceApprovals, summary]);

  // Compute data lineage flows from deployments and templates
  const lineageFlows = useMemo<DataLineageFlow[]>(() => {
    return deployments.map(d => {
      const template = templates.find(t => t.id === d.template_id);
      const nodes: DataLineageNode[] = [];

      // Source nodes from parameters
      if (d.parameters) {
        if (d.parameters.knowledge_base_id) {
          nodes.push({
            id: `${d.deployment_id}-kb`,
            type: 'source',
            label: 'Knowledge Base',
            details: d.parameters.knowledge_base_id,
            status: 'active',
            metadata: { type: 'Bedrock KB', id: d.parameters.knowledge_base_id },
          });
        }

        Object.entries(d.parameters).forEach(([key, value]) => {
          if (key.includes('s3') || key.includes('bucket') || key.includes('data')) {
            nodes.push({
              id: `${d.deployment_id}-${key}`,
              type: 'source',
              label: key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
              details: value,
              status: 'active',
              metadata: { type: 'S3', path: value },
            });
          }
        });
      }

      // Add template as transform node
      if (template) {
        nodes.push({
          id: `${d.deployment_id}-template`,
          type: 'transform',
          label: template.name,
          details: template.description || 'Agent template',
          status: 'active',
          metadata: {
            category: template.category,
            tier: template.tier,
            version: template.version,
          },
        });
      }

      // Agent node
      nodes.push({
        id: `${d.deployment_id}-agent`,
        type: 'agent',
        label: d.deployment_name,
        details: `Deployed ${new Date(d.created_at).toLocaleDateString()}`,
        status: d.status === 'deployed' ? 'active' : d.status === 'failed' ? 'error' : 'pending',
        metadata: {
          status: d.status,
          region: d.aws_region,
          account: d.aws_account,
        },
      });

      // Guardrail nodes
      const activeGuardrails = guardrails.filter(g => g.status === 'active');
      activeGuardrails.forEach(g => {
        nodes.push({
          id: `${d.deployment_id}-guardrail-${g.template_id}`,
          type: 'guardrail',
          label: g.name,
          details: `${g.pii_entities?.length || 0} PII types, ${g.content_filters?.length || 0} content filters`,
          status: 'active',
          metadata: {
            piiCount: String(g.pii_entities?.length || 0),
            filterCount: String(g.content_filters?.length || 0),
          },
        });
      });

      // Output node
      if (d.outputs && Object.keys(d.outputs).length > 0) {
        nodes.push({
          id: `${d.deployment_id}-output`,
          type: 'output',
          label: 'API Endpoint',
          details: d.outputs.agent_endpoint || d.outputs.api_endpoint || 'Agent Output',
          status: 'active',
          metadata: d.outputs,
        });
      }

      return {
        agentId: d.deployment_id,
        agentName: d.deployment_name,
        templateId: d.template_id,
        nodes,
        protectionStatus: {
          hasGuardrails: activeGuardrails.length > 0,
          piiProtected: activeGuardrails.some(g => (g.pii_entities?.length || 0) > 0),
          contentFiltered: activeGuardrails.some(g => (g.content_filters?.length || 0) > 0),
        },
      };
    });
  }, [deployments, templates, guardrails]);

  // Compute access control entries from deployments and approvals
  const accessEntries = useMemo<AccessControlEntry[]>(() => {
    const entries: AccessControlEntry[] = [];

    // Deployment access entries
    deployments.forEach(d => {
      entries.push({
        resourceType: 'deployment',
        resourceId: d.deployment_id,
        resourceName: d.deployment_name,
        owner: d.created_by,
        createdAt: d.created_at,
        accessLevel: 'admin',
        awsAccount: d.aws_account,
        awsRegion: d.aws_region,
      });
    });

    // Guardrail access entries
    guardrails.forEach(g => {
      entries.push({
        resourceType: 'guardrail',
        resourceId: g.template_id,
        resourceName: g.name,
        owner: g.created_by || 'system',
        createdAt: g.created_at,
        accessLevel: 'admin',
        awsAccount: 'shared',
        awsRegion: 'us-east-1',
      });
    });

    return entries.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [deployments, guardrails]);

  // Transform service approvals into pending approvals format
  const pendingApprovalsList = useMemo<PendingApproval[]>(() => {
    return serviceApprovals.map(sa => ({
      slug: sa.slug,
      service: sa.service,
      framework: sa.framework,
      status: sa.status,
      requestedBy: sa.created_by || 'unknown',
      requestedAt: sa.created_at,
      phases: sa.phases.map(p => ({ key: p.key, status: p.status })),
    }));
  }, [serviceApprovals]);

  return {
    loading,
    error,
    summary,
    agentProfiles,
    useCaseRequirements,
    recentDataEvents,
    guardrailsWithMetrics,
    serviceApprovals,
    readinessMetrics,
    lineageFlows,
    accessEntries,
    pendingApprovals: pendingApprovalsList,
    templates,
    maturityAssessments,
    refresh: () => setRefreshKey(k => k + 1),
  };
}
