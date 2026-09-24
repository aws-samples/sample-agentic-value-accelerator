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
  governGuardrailsApi,
  deploymentsApi,
  prioritizationApi,
  serviceApprovalApi,
  maturityApi,
  getTemplates,
} from '../../../api/client';
import type { UseCase, MaturityAssessment } from '../../../api/client';
import { anonymizedFromPolicies, metricsByTemplateId } from '../guardrailTelemetryMetrics';

/** The window the "Events (24h)" cards claim. Keep the label and this value in step. */
const DATA_GOVERNANCE_WINDOW_DAYS = 1;
import type {
  GuardrailTemplate,
  Deployment,
  ServiceApprovalRun,
  GuardrailMetrics,
  Template,
} from '../../../types';
import { computeAdoptionMaturity, type AdoptionMaturityResult } from './dataReadinessEngine';

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

/**
 * ADOPTION MATURITY (0-5 levels per dimension) — how far along the organisation is,
 * from maturity self-assessment, human use-case scoring, and platform inventory.
 *
 * This is NOT a readiness score. Control readiness ("are the controls in place and
 * effective?") is a separate 0-100 ladder owned by `useDataReadiness`, built from AWS
 * control-plane signals. This slice previously also carried Data Protection, PII
 * Coverage, Access Governance and Audit Trail dimensions on a 0-5 scale, which
 * duplicated the readiness ladder and contradicted it on identical inputs (e.g. one
 * active guardrail scored 4/5 = 80% here and 70/100 there). Those four dimensions now
 * exist only on the readiness ladder; the three genuinely-different adoption signals
 * stay here.
 */
export interface AdoptionMaturityMetrics extends AdoptionMaturityResult {
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

  // Adoption maturity (0-5 levels) — NOT control readiness (see useDataReadiness)
  adoptionMaturity: AdoptionMaturityMetrics;

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
  // Account-wide PII masking/redaction interventions. Not per-guardrail: CloudWatch
  // reports it by policy type (SensitiveInformationPolicy), not by guardrail.
  const [anonymizedCount, setAnonymizedCount] = useState(0);
  const [useCases, setUseCases] = useState<UseCase[]>([]);
  const [serviceApprovals, setServiceApprovals] = useState<ServiceApprovalRun[]>([]);
  const [maturityAssessments, setMaturityAssessments] = useState<MaturityAssessment[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  // Which feeds actually resolved. Lets the adoption-maturity ladder tell "genuinely
  // zero" apart from "signal unavailable" instead of scoring both as level 0.
  const [sourcesLoaded, setSourcesLoaded] = useState({ deployments: false, useCases: false, maturity: false });

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

        setSourcesLoaded({
          deployments: deploymentsRes.status === 'fulfilled',
          useCases: useCasesRes.status === 'fulfilled',
          maturity: maturityRes.status === 'fulfilled',
        });

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

        // Per-guardrail metrics in ONE request, over a 1-day window because the cards
        // that render these are labelled "Events (24h)". This replaced a loop over
        // guardrailsApi.getMetrics(template_id, 24) — N requests, all 404 when the
        // template store is unreadable — with the fleet-wide telemetry endpoint.
        const activeWithBedrock = activeGuardrails.filter(g => g.status === 'active');
        if (activeWithBedrock.length > 0) {
          const telemetry = await governGuardrailsApi
            .telemetry(DATA_GOVERNANCE_WINDOW_DAYS)
            .catch(() => null);
          setGuardrailMetricsMap(metricsByTemplateId(activeWithBedrock, telemetry));
          // Masking/redaction is only measurable per policy type, not per guardrail,
          // so it is tracked account-wide alongside the per-template map.
          setAnonymizedCount(anonymizedFromPolicies(telemetry));
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

      // ILLUSTRATIVE APPROXIMATION — not a real binding. The platform does not yet resolve
      // real Bedrock agent guardrail associations, so we attach EVERY active guardrail to
      // EVERY deployment. Consequently per-agent protection coverage is identical across
      // agents and must be surfaced in the UI as illustrative, never as live measured coverage.
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

      // Aggregate PII protection info across ALL guardrails (same illustrative approximation
      // as above — these totals are not scoped to this specific agent/deployment).
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
    let totalAllowed = 0;

    guardrailMetricsMap.forEach(m => {
      totalInvocations += m.total_invocations;
      totalBlocked += m.blocked_count;
      totalAllowed += m.allowed_count;
    });
    // Account-wide, from the SensitiveInformationPolicy dimension — the only place
    // AWS reports masking. Summing per-guardrail anonymized_count gave a constant 0,
    // because no per-guardrail masking metric exists to populate it.
    const totalAnonymized = anonymizedCount;

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
  }, [deployments, guardrails, guardrailMetricsMap, anonymizedCount, useCases, serviceApprovals]);

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

  // Compute ADOPTION MATURITY (0-5 levels) from maturity assessments, human use-case
  // scoring, and platform deployment inventory. Control readiness is NOT computed here —
  // it is the 0-100 ladder in useDataReadiness, built from AWS control-plane signals.
  const adoptionMaturity = useMemo<AdoptionMaturityMetrics>(() => {
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

    // The 0-5 maturity ladder lives in the shared engine so both of the module's
    // scales are declared in one place and cannot be rescaled into each other.
    const maturity = computeAdoptionMaturity({
      maturityDataScore,
      assessmentName: latestMaturity?.name ?? null,
      maturityLoaded: sourcesLoaded.maturity,
      useCaseDataReadinessScores: useCaseReadiness.map(uc => uc.dataReadiness),
      useCasesLoaded: sourcesLoaded.useCases,
      deploymentCount: deployments.length,
      deploymentsLoaded: sourcesLoaded.deployments,
    });

    return {
      ...maturity,
      useCaseReadiness,
      maturityDataScore,
      assessmentCompletion,
    };
  }, [maturityAssessments, useCases, deployments, sourcesLoaded]);

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
    adoptionMaturity,
    lineageFlows,
    accessEntries,
    pendingApprovals: pendingApprovalsList,
    templates,
    maturityAssessments,
    refresh: () => setRefreshKey(k => k + 1),
  };
}
