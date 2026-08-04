import axios, { AxiosError } from "axios";
import type {
  ProjectCreate,
  ProjectResponse,
  LangfuseServer,
  LangfuseServerCreate,
  ApiError,
  Template,
  TemplateStats,
  BootstrapRequest,
  Deployment,
  DeploymentCreate,
  DeploymentStatusResponse,
  TestStartResponse,
  TestDeploymentResponse,
  GuardrailTemplate,
  GuardrailTemplateCreate,
  GuardrailPreset,
  GuardrailMetrics,
  ServiceApprovalRun,
  ServiceApprovalRunCreate,
  ServiceApprovalFileTree,
  ServiceApprovalFileContent,
  AwsService,
} from "../types";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

const client = axios.create({
  baseURL: API_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

// Request interceptor to add auth token and user email
client.interceptors.request.use((config) => {
  const token = localStorage.getItem("auth_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  // For dev mode: send x-user-email header to simulate different users
  const devUserEmail = localStorage.getItem("dev_user_email");
  if (devUserEmail) {
    config.headers["x-user-email"] = devUserEmail;
  }

  return config;
});

// Response interceptor for error handling
client.interceptors.response.use(
  (response) => response,
  (error: AxiosError<ApiError>) => {
    // Handle 401 Unauthorized - token expired or invalid
    if (error.response?.status === 401) {
      // Clear auth token and reload to trigger SignIn
      localStorage.removeItem("auth_token");
      window.location.reload();
      return Promise.reject(new Error("Session expired. Please log in again."));
    }
    const errorMessage = error.response?.data?.detail || error.message;
    return Promise.reject(new Error(errorMessage));
  },
);

// Projects API
export const projectsApi = {
  generate: async (data: ProjectCreate): Promise<ProjectResponse> => {
    const response = await client.post<ProjectResponse>("/api/v1/projects/generate", data);
    return response.data;
  },

  get: async (projectName: string): Promise<ProjectResponse> => {
    const response = await client.get<ProjectResponse>(`/api/v1/projects/${projectName}`);
    return response.data;
  },
};

// Langfuse Servers API
export const langfuseApi = {
  list: async (): Promise<LangfuseServer[]> => {
    const response = await client.get<LangfuseServer[]>("/api/v1/langfuse-servers");
    return response.data;
  },

  create: async (data: LangfuseServerCreate): Promise<LangfuseServer> => {
    const response = await client.post<LangfuseServer>("/api/v1/langfuse-servers", data);
    return response.data;
  },

  get: async (id: string): Promise<LangfuseServer> => {
    const response = await client.get<LangfuseServer>(`/api/v1/langfuse-servers/${id}`);
    return response.data;
  },

  delete: async (id: string): Promise<void> => {
    await client.delete(`/api/v1/langfuse-servers/${id}`);
  },
};

// Health API
export const healthApi = {
  check: async () => {
    const response = await client.get("/health");
    return response.data;
  },

  ping: async () => {
    const response = await client.get("/ping");
    return response.data;
  },
};

// Template Catalog API
export const getTemplates = async (
  patternType?: string,
  framework?: string,
  deploymentPattern?: string,
): Promise<Template[]> => {
  const params = new URLSearchParams();
  if (patternType) params.append("pattern_type", patternType);
  if (framework) params.append("framework", framework);
  if (deploymentPattern) params.append("deployment_pattern", deploymentPattern);

  const response = await client.get<{ templates: Template[]; total: number }>("/api/v1/templates", {
    params,
  });
  return response.data.templates; // Extract templates array from response
};

export const getTemplate = async (templateId: string): Promise<Template> => {
  const response = await client.get<{ metadata: Template; path: string }>(
    `/api/v1/templates/${templateId}`,
  );
  return response.data.metadata; // Extract metadata from response
};

export const getTemplateStats = async (): Promise<TemplateStats> => {
  const response = await client.get<TemplateStats>("/api/v1/templates/stats");
  return response.data;
};

export const bootstrapProject = async (request: BootstrapRequest): Promise<Blob> => {
  const response = await client.post("/api/v1/bootstrap", request, {
    responseType: "blob",
  });
  return response.data;
};

export const downloadTemplate = async (templateId: string, iac?: string): Promise<Blob> => {
  const params = iac ? { iac } : {};
  const response = await client.get(`/api/v1/templates/${templateId}/download`, {
    params,
    responseType: "blob",
  });
  return response.data;
};

// Deployments API
export const deploymentsApi = {
  list: async (status?: string, templateId?: string): Promise<Deployment[]> => {
    const params = new URLSearchParams();
    if (status) params.append("status", status);
    if (templateId) params.append("template_id", templateId);
    const response = await client.get<Deployment[]>("/api/v1/deployments", { params });
    return response.data;
  },

  get: async (id: string): Promise<Deployment> => {
    const response = await client.get<Deployment>(`/api/v1/deployments/${id}`);
    return response.data;
  },

  create: async (data: DeploymentCreate): Promise<Deployment> => {
    const response = await client.post<Deployment>("/api/v1/deployments", data);
    return response.data;
  },

  getDeploymentStatus: async (id: string): Promise<DeploymentStatusResponse> => {
    const response = await client.get<DeploymentStatusResponse>(`/api/v1/deployments/${id}/status`);
    return response.data;
  },

  destroyDeployment: async (id: string): Promise<Deployment> => {
    const response = await client.post<Deployment>(`/api/v1/deployments/${id}/destroy`);
    return response.data;
  },

  provisionGateway: async (id: string): Promise<{ status: string; gateway_id?: string; gateway_url?: string; gateway_name?: string }> => {
    const response = await client.post(`/api/v1/deployments/${id}/provision-gateway`);
    return response.data;
  },

  getTemplateDependencies: async (
    templateId: string,
  ): Promise<
    {
      template_id: string;
      name: string;
      has_active_deployment: boolean;
      outputs: Record<string, string>;
    }[]
  > => {
    const response = await client.get(`/api/v1/deployments/templates/${templateId}/dependencies`);
    return response.data;
  },

  redeployDeployment: async (id: string): Promise<Deployment> => {
    const response = await client.post<Deployment>(`/api/v1/deployments/${id}/redeploy`);
    return response.data;
  },

  getDeploymentLogs: async (
    id: string,
  ): Promise<{ deployment_id: string; build_id: string; logs: string }> => {
    const response = await client.get<{ deployment_id: string; build_id: string; logs: string }>(
      `/api/v1/deployments/${id}/logs`,
    );
    return response.data;
  },

  getRuntimeLogs: async (
    id: string,
  ): Promise<{
    deployment_id: string;
    log_group: string;
    fleet_dashboard_url: string;
    observability_console_url: string;
    logs: string;
  }> => {
    const response = await client.get(`/api/v1/deployments/${id}/runtime-logs`);
    return response.data;
  },

  getSourceZipUrl: async (
    id: string,
  ): Promise<{ download_url: string; s3_bucket: string; s3_key: string }> => {
    const response = await client.get<{ download_url: string; s3_bucket: string; s3_key: string }>(
      `/api/v1/deployments/${id}/source-zip`,
    );
    return response.data;
  },

  testDeployment: async (
    deploymentId: string,
    payload: Record<string, any>,
  ): Promise<TestStartResponse> => {
    const response = await client.post<TestStartResponse>(
      `/api/v1/deployments/${deploymentId}/test`,
      { payload },
    );
    return response.data;
  },

  getTestResult: async (deploymentId: string, testId: string): Promise<TestDeploymentResponse> => {
    const response = await client.get<TestDeploymentResponse>(
      `/api/v1/deployments/${deploymentId}/test/${testId}`,
    );
    return response.data;
  },

  uploadTestData: async (deploymentId: string, file: File): Promise<{ s3_key: string }> => {
    const formData = new FormData();
    formData.append("file", file);
    const response = await client.post<{ s3_key: string }>(
      `/api/v1/deployments/${deploymentId}/upload-test-data`,
      formData,
      { headers: { "Content-Type": "multipart/form-data" } },
    );
    return response.data;
  },

  runTestScript: async (deploymentId: string, scriptType: string): Promise<any> => {
    const response = await client.post(`/api/v1/deployments/${deploymentId}/run-script`, {
      script_type: scriptType,
    });
    return response.data;
  },

  getSampleData: async (deploymentId: string): Promise<any> => {
    const response = await client.get(`/api/v1/deployments/${deploymentId}/sample-data`);
    return response.data;
  },
};

// User API
export const userApi = {
  getCurrentUser: async (): Promise<{
    email: string;
    role: string;
    role_level: number;
    can_deploy: boolean;
  }> => {
    const response = await client.get("/api/v1/users/me");
    return response.data;
  },
};

export default client;

// App Factory API
export const appFactoryApi = {
  submit: async (data: Record<string, string>): Promise<{ submission_id: string }> => {
    const response = await client.post<{ submission_id: string }>(
      "/api/v1/app-factory/submissions",
      data,
    );
    return response.data;
  },

  deploy: async (submissionId: string): Promise<Deployment> => {
    const response = await client.post<Deployment>(
      `/api/v1/app-factory/submissions/${submissionId}/deploy`,
    );
    return response.data;
  },

  get: async (submissionId: string): Promise<Record<string, any>> => {
    const response = await client.get<Record<string, any>>(
      `/api/v1/app-factory/submissions/${submissionId}`,
    );
    return response.data;
  },

  list: async (): Promise<Record<string, any>[]> => {
    const response = await client.get<Record<string, any>[]>("/api/v1/app-factory/submissions");
    return response.data;
  },
};

// Applications API (FSI Foundry)
export const applicationsApi = {
  listFoundryUseCases: async () => {
    const response = await client.get("/api/v1/applications/foundry/use-cases");
    return response.data;
  },

  deployFoundry: async (data: {
    deployment_name: string;
    use_case_name: string;
    framework: string;
    deployment_pattern: string;
    aws_region: string;
    parameters?: Record<string, any>;
  }): Promise<Deployment> => {
    const response = await client.post<Deployment>("/api/v1/applications/foundry/deploy", data);
    return response.data;
  },

  deployFoundryFromGit: async (data: {
    deployment_name: string;
    codecommit_repo: string;
    codecommit_branch: string;
    use_case_name: string;
    framework: string;
    deployment_pattern: string;
    aws_region: string;
    parameters?: Record<string, any>;
  }): Promise<Deployment> => {
    const response = await client.post<Deployment>(
      "/api/v1/applications/foundry/deploy-from-git",
      data,
    );
    return response.data;
  },
};

// Frontier Agents API (Agent-as-a-Service)
export interface FrontierAgentParameter {
  name: string;
  label: string;
  type: string;
  required: boolean;
  default: string;
  description: string;
}

export interface FrontierAgentCatalogEntry {
  id: string;
  name: string;
  description: string;
  status: string;
  supported_iac_types: string[];
  coming_soon_iac_types: string[];
  parameters: FrontierAgentParameter[];
  advanced_parameters: FrontierAgentParameter[];
}

export const frontierAgentsApi = {
  listCatalog: async (): Promise<FrontierAgentCatalogEntry[]> => {
    const response = await client.get<FrontierAgentCatalogEntry[]>(
      "/api/v1/frontier-agents/catalog",
    );
    return response.data;
  },

  getAgent: async (agentId: string): Promise<FrontierAgentCatalogEntry> => {
    const response = await client.get<FrontierAgentCatalogEntry>(
      `/api/v1/frontier-agents/catalog/${agentId}`,
    );
    return response.data;
  },

  deploy: async (data: {
    deployment_name: string;
    agent_id: string;
    iac_type: string;
    aws_region: string;
    parameters?: Record<string, any>;
  }): Promise<Deployment> => {
    const response = await client.post<Deployment>("/api/v1/frontier-agents/deploy", data);
    return response.data;
  },

  federate: async (data: {
    agent_id: string;
    operator_app_url: string;
  }): Promise<{ signin_url: string; operator_app_url: string; expires_in_seconds: number }> => {
    const response = await client.post<{
      signin_url: string;
      operator_app_url: string;
      expires_in_seconds: number;
    }>("/api/v1/frontier-agents/federate", data);
    return response.data;
  },
};

// CodeCommit API
export interface CodeCommitRepo {
  repository_name: string;
  template_id: string;
  source: string;
  clone_url_http: string;
  default_branch: string;
  description: string;
}

export const codecommitApi = {
  listRepositories: async (): Promise<CodeCommitRepo[]> => {
    const response = await client.get<CodeCommitRepo[]>("/api/v1/codecommit/repositories");
    return response.data;
  },
};

// Guardrails API
export const guardrailsApi = {
  list: async (status?: string): Promise<GuardrailTemplate[]> => {
    const params = status ? { status } : {};
    const response = await client.get<GuardrailTemplate[]>("/api/v1/guardrails", { params });
    return response.data;
  },

  get: async (templateId: string): Promise<GuardrailTemplate> => {
    const response = await client.get<GuardrailTemplate>(`/api/v1/guardrails/${templateId}`);
    return response.data;
  },

  create: async (data: GuardrailTemplateCreate): Promise<GuardrailTemplate> => {
    const response = await client.post<GuardrailTemplate>("/api/v1/guardrails", data);
    return response.data;
  },

  update: async (
    templateId: string,
    data: Partial<GuardrailTemplateCreate>,
  ): Promise<GuardrailTemplate> => {
    const response = await client.put<GuardrailTemplate>(`/api/v1/guardrails/${templateId}`, data);
    return response.data;
  },

  delete: async (templateId: string): Promise<GuardrailTemplate> => {
    const response = await client.delete<GuardrailTemplate>(`/api/v1/guardrails/${templateId}`);
    return response.data;
  },

  publish: async (templateId: string): Promise<GuardrailTemplate> => {
    const response = await client.post<GuardrailTemplate>(
      `/api/v1/guardrails/${templateId}/publish`,
    );
    return response.data;
  },

  getMetrics: async (templateId: string, hours: number = 24): Promise<GuardrailMetrics> => {
    const response = await client.get<GuardrailMetrics>(
      `/api/v1/guardrails/${templateId}/metrics`,
      { params: { hours } },
    );
    return response.data;
  },

  getPresets: async (): Promise<GuardrailPreset[]> => {
    const response = await client.get<GuardrailPreset[]>("/api/v1/guardrails/presets");
    return response.data;
  },
};

// Policies API (AgentCore resource-level policies)
export interface PolicyRule {
  id: string;
  type: "deny" | "require";
  category: string;
  target: string;
  condition: string;
  value: string;
  action: "enforce" | "log";
}

export interface PolicyRecord {
  policy_id: string;
  name: string;
  description: string | null;
  resource_type: "gateway";
  resource_id: string | null;
  status: "draft" | "active" | "disabled";
  rules: PolicyRule[];
  rules_count: number;
  blocking_rules: number;
  triggered_count: number;
  last_triggered: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface PolicyCreatePayload {
  name: string;
  description?: string;
  resource_type?: "gateway";
  resource_id?: string;
  rules: PolicyRule[];
  cedar_code?: string;
  engine_id?: string;
}

export interface PolicyEngineRecord {
  engine_id: string;
  name: string;
  status: string;
  gateway_id: string | null;
  gateway_name: string | null;
  mode: string | null;
  policy_count: number;
  created_at: string;
}

export interface GatewayRecord {
  gateway_id: string;
  name: string;
  status: string;
  use_case?: string;
}

export interface PolicyPresetRecord {
  id: string;
  name: string;
  description: string;
  tags: string[];
  resource_type: "gateway";
  config: PolicyCreatePayload;
}

export interface PolicyAuditEvent {
  event_id: string;
  timestamp: string;
  policy_id: string;
  policy_name: string;
  resource_type: "gateway";
  resource_id: string;
  rule_type: "deny" | "require";
  action_taken: "enforced" | "logged";
  target: string;
  details: string;
  caller: string | null;
}

export interface PolicyMetrics {
  policy_id: string;
  total_events: number;
  blocked_count: number;
  warned_count: number;
  logged_count: number;
  block_rate: number;
  recent_events: PolicyAuditEvent[];
}

export interface PolicyObservabilityEvent {
  id: string;
  timestamp: string;
  decision: "ALLOW" | "DENY" | "UNKNOWN";
  reason: string;
  determining_policies: string;
  allowed_tools: string;
  denied_tools: string;
  gateway_id: string;
  span_name: string;
  source: string;
  count?: number;
  mode?: string;
}

export interface PolicyObservabilityResponse {
  events: PolicyObservabilityEvent[];
  metrics: {
    deny_count: number;
    allow_count: number;
    invocations: number;
    errors: number;
  };
  time_range_hours: number;
  gateway_id: string;
  policy_engine_id: string;
}

export const policiesApi = {
  list: async (status?: string, resourceType?: string, engineId?: string): Promise<PolicyRecord[]> => {
    const params: Record<string, string> = {};
    if (status) params.status = status;
    if (resourceType) params.resource_type = resourceType;
    if (engineId) params.engine_id = engineId;
    const response = await client.get<PolicyRecord[]>("/api/v1/policies", { params });
    return response.data;
  },

  get: async (policyId: string): Promise<PolicyRecord> => {
    const response = await client.get<PolicyRecord>(`/api/v1/policies/${policyId}`);
    return response.data;
  },

  create: async (data: PolicyCreatePayload): Promise<PolicyRecord> => {
    const response = await client.post<PolicyRecord>("/api/v1/policies", data);
    return response.data;
  },

  update: async (
    policyId: string,
    data: Partial<PolicyCreatePayload & { status: string }>,
  ): Promise<PolicyRecord> => {
    const response = await client.put<PolicyRecord>(`/api/v1/policies/${policyId}`, data);
    return response.data;
  },

  delete: async (policyId: string): Promise<PolicyRecord> => {
    const response = await client.delete<PolicyRecord>(`/api/v1/policies/${policyId}`);
    return response.data;
  },

  activate: async (policyId: string): Promise<PolicyRecord> => {
    const response = await client.post<PolicyRecord>(`/api/v1/policies/${policyId}/activate`);
    return response.data;
  },

  disable: async (policyId: string): Promise<PolicyRecord> => {
    const response = await client.post<PolicyRecord>(`/api/v1/policies/${policyId}/disable`);
    return response.data;
  },

  evaluate: async (
    policyId: string,
    context: Record<string, any>,
  ): Promise<{ allowed: boolean; blocked: boolean; warned: boolean; matched_rules: any[] }> => {
    const response = await client.post(`/api/v1/policies/${policyId}/evaluate`, context);
    return response.data;
  },

  getAudit: async (policyId: string, limit: number = 50): Promise<PolicyAuditEvent[]> => {
    const response = await client.get<PolicyAuditEvent[]>(`/api/v1/policies/${policyId}/audit`, {
      params: { limit },
    });
    return response.data;
  },

  getAllAudit: async (action?: string, limit: number = 50): Promise<PolicyAuditEvent[]> => {
    const params: Record<string, any> = { limit };
    if (action) params.action = action;
    const response = await client.get<PolicyAuditEvent[]>("/api/v1/policies/audit/all", { params });
    return response.data;
  },

  getMetrics: async (policyId: string): Promise<PolicyMetrics> => {
    const response = await client.get<PolicyMetrics>(`/api/v1/policies/${policyId}/metrics`);
    return response.data;
  },

  getPresets: async (): Promise<PolicyPresetRecord[]> => {
    const response = await client.get<PolicyPresetRecord[]>("/api/v1/policies/presets");
    return response.data;
  },

  getObservability: async (
    hours: number = 24,
    limit: number = 50,
  ): Promise<PolicyObservabilityResponse> => {
    const response = await client.get<PolicyObservabilityResponse>(
      "/api/v1/policies/observability/events",
      { params: { hours, limit } },
    );
    return response.data;
  },

  // Policy Engine management
  listEngines: async (): Promise<PolicyEngineRecord[]> => {
    const response = await client.get<PolicyEngineRecord[]>("/api/v1/policies/engines");
    return response.data;
  },

  createEngine: async (data: {
    name: string;
    gateway_id?: string;
  }): Promise<PolicyEngineRecord> => {
    const response = await client.post<PolicyEngineRecord>("/api/v1/policies/engines", data);
    return response.data;
  },

  deleteEngine: async (engineId: string): Promise<void> => {
    await client.delete(`/api/v1/policies/engines/${engineId}`);
  },

  attachGateway: async (engineId: string, gatewayId: string): Promise<void> => {
    await client.post(`/api/v1/policies/engines/${engineId}/attach-gateway`, {
      gateway_id: gatewayId,
    });
  },

  detachGateway: async (engineId: string, gatewayId: string): Promise<void> => {
    await client.post(`/api/v1/policies/engines/${engineId}/detach-gateway`, {
      gateway_id: gatewayId,
    });
  },

  setMode: async (
    engineId: string,
    gatewayId: string,
    mode: "ENFORCE" | "LOG_ONLY",
  ): Promise<void> => {
    await client.post(`/api/v1/policies/engines/${engineId}/set-mode`, {
      gateway_id: gatewayId,
      mode,
    });
  },

  // Gateway listing
  listGateways: async (): Promise<GatewayRecord[]> => {
    const response = await client.get<GatewayRecord[]>("/api/v1/policies/gateways");
    return response.data;
  },
};

// Prioritization API ---------------------------------------------------------

export type PrioritizationAIType = "Traditional ML" | "Generative AI" | "Agentic AI";
export type PrioritizationComplexity = "Low" | "Medium" | "High";
export type PrioritizationAutomationScope = "Augmentation" | "Co-pilot" | "Full Autonomy";
export type PrioritizationIntegrationDepth =
  | "Single-system batch"
  | "API-connected real-time"
  | "Multi-system orchestration";
export type UseCaseStatus = "Concept" | "Active" | "Pilot" | "Production" | "Paused" | "Archived";
export type GoNoGo = "GO" | "CONDITIONAL GO" | "NO GO";

export interface BusinessValueScores {
  revenue_impact: number;
  cost_savings: number;
  productivity_gains: number;
  customer_experience: number;
  scalability_potential: number;
}
export interface TechnicalFeasibilityScores {
  data_readiness: number;
  technical_complexity: number;
  integration_requirements: number;
  time_to_value: number;
  talent_availability: number;
}
export interface RiskGovernanceScores {
  regulatory_compliance: number;
  data_privacy_security: number;
  ethical_bias_risk: number;
  model_reliability: number;
  autonomous_decision_risk: number;
}
export interface OrgReadinessScores {
  data_infrastructure: number;
  process_maturity: number;
  change_management: number;
  executive_sponsorship: number;
  cross_functional_collab: number;
}
export interface StrategicAlignmentScores {
  mission_criticality: number;
  competitive_advantage: number;
  innovation_potential: number;
}
export interface CostEfficiencyScores {
  implementation_cost: number;
  ongoing_operational_cost: number;
  roi_timeline: number;
}
export interface PrioritizationScores {
  business_value: BusinessValueScores;
  technical_feasibility: TechnicalFeasibilityScores;
  risk_governance: RiskGovernanceScores;
  org_readiness: OrgReadinessScores;
  strategic_alignment: StrategicAlignmentScores;
  cost_efficiency: CostEfficiencyScores;
}
export interface DimensionWeights {
  business_value: number;
  technical_feasibility: number;
  risk_governance: number;
  org_readiness: number;
  strategic_alignment: number;
  cost_efficiency: number;
}
export interface ComputedScore {
  dimension_subtotals: DimensionWeights;
  composite: number;
  risk_score: number;
  readiness_score: number;
  go_no_go: GoNoGo;
}

export interface UseCase {
  use_case_id: string;
  name: string;
  description: string;
  ai_type: PrioritizationAIType;
  business_domain: string;
  complexity: PrioritizationComplexity;
  automation_scope: PrioritizationAutomationScope;
  integration_depth: PrioritizationIntegrationDepth;
  business_owner: string;
  technical_owner: string;
  target_go_live: string;
  status: UseCaseStatus;
  created_at: string;
  updated_at: string;
  created_by?: string | null;
  scores: PrioritizationScores;
  weights: DimensionWeights;
  computed?: ComputedScore | null;
}

export interface UseCaseCreate {
  name: string;
  description?: string;
  ai_type?: PrioritizationAIType;
  business_domain?: string;
  complexity?: PrioritizationComplexity;
  automation_scope?: PrioritizationAutomationScope;
  integration_depth?: PrioritizationIntegrationDepth;
  business_owner?: string;
  technical_owner?: string;
  target_go_live?: string;
  status?: UseCaseStatus;
  scores?: PrioritizationScores;
  weights?: DimensionWeights;
}

export interface PrioritizationFramework {
  dimension_weights: DimensionWeights;
  sub_weights: Record<string, Record<string, number>>;
  thresholds: Record<string, Record<string, string>>;
}

export const prioritizationApi = {
  framework: async (): Promise<PrioritizationFramework> => {
    const response = await client.get<PrioritizationFramework>("/api/v1/prioritization/framework");
    return response.data;
  },
  list: async (status?: UseCaseStatus): Promise<UseCase[]> => {
    const params = status ? { status } : {};
    const response = await client.get<UseCase[]>("/api/v1/prioritization", { params });
    return response.data;
  },
  get: async (id: string): Promise<UseCase> => {
    const response = await client.get<UseCase>(`/api/v1/prioritization/${id}`);
    return response.data;
  },
  create: async (data: UseCaseCreate): Promise<UseCase> => {
    const response = await client.post<UseCase>("/api/v1/prioritization", data);
    return response.data;
  },
  update: async (id: string, data: Partial<UseCaseCreate>): Promise<UseCase> => {
    const response = await client.put<UseCase>(`/api/v1/prioritization/${id}`, data);
    return response.data;
  },
  delete: async (id: string): Promise<UseCase> => {
    const response = await client.delete<UseCase>(`/api/v1/prioritization/${id}`);
    return response.data;
  },
};

// Maturity Assessment API ----------------------------------------------------

export type AssessmentStatus = "Draft" | "In Progress" | "Complete" | "Archived";

export interface MaturityWeights {
  people: number;
  process: number;
  technology: number;
  data: number;
  governance: number;
  strategy: number;
}

export interface DimensionResult {
  label: string;
  answered: number;
  total: number;
  average: number;
  weighted_contribution: number;
  maturity_level: number;
}

export interface ComputedMaturity {
  dimensions: Record<string, DimensionResult>;
  composite: number;
  maturity_level: number;
  answered: number;
  total: number;
  completion: number;
}

export interface MaturityAssessment {
  assessment_id: string;
  name: string;
  description: string;
  organization: string;
  assessor: string;
  status: AssessmentStatus;
  created_at: string;
  updated_at: string;
  created_by?: string | null;
  scores: Record<string, number>;
  weights: MaturityWeights;
  computed?: ComputedMaturity | null;
}

export interface MaturityAssessmentCreate {
  name: string;
  description?: string;
  organization?: string;
  assessor?: string;
  status?: AssessmentStatus;
  scores?: Record<string, number>;
  weights?: MaturityWeights;
}

export const maturityApi = {
  list: async (status?: AssessmentStatus): Promise<MaturityAssessment[]> => {
    const params = status ? { status } : {};
    const response = await client.get<MaturityAssessment[]>("/api/v1/maturity", { params });
    return response.data;
  },
  get: async (id: string): Promise<MaturityAssessment> => {
    const response = await client.get<MaturityAssessment>(`/api/v1/maturity/${id}`);
    return response.data;
  },
  create: async (data: MaturityAssessmentCreate): Promise<MaturityAssessment> => {
    const response = await client.post<MaturityAssessment>("/api/v1/maturity", data);
    return response.data;
  },
  update: async (
    id: string,
    data: Partial<MaturityAssessmentCreate>,
  ): Promise<MaturityAssessment> => {
    const response = await client.put<MaturityAssessment>(`/api/v1/maturity/${id}`, data);
    return response.data;
  },
  delete: async (id: string): Promise<MaturityAssessment> => {
    const response = await client.delete<MaturityAssessment>(`/api/v1/maturity/${id}`);
    return response.data;
  },
};

// Business Cases API --------------------------------------------------------

export type BusinessCaseStatus = "Draft" | "Review" | "Approved" | "Rejected" | "Archived";
export type IndustrySubSector = "Retail Banking" | "Insurance" | "Capital Markets" | "Other";
export type BCAITechnologyType = "Traditional ML" | "Generative AI" | "Agentic AI";
export type ProjectSize = "Small" | "Medium" | "Large";
export type NpvDecision = "POSITIVE NPV - Proceed" | "NEGATIVE NPV - Reject" | "BREAKEVEN - Review";

export interface ProjectInputs {
  sponsor: string;
  business_unit: string;
  evaluation_date?: string | null;
  industry: IndustrySubSector;
  ai_technology_type: BCAITechnologyType;
  project_size: ProjectSize;
  wacc_base: number;
  technology_risk_premium: number;
  hurdle_rate: number;
  tax_rate: number;
  inflation_rate: number;
  ramp_y1: number;
  ramp_y2: number;
  ramp_y3: number;
  compliance_adder_pct: number;
}

export interface CostLineItem {
  label: string;
  year_0: number;
  year_1: number;
  year_2: number;
  year_3: number;
}

export interface BenefitLineItem {
  label: string;
  year_1: number;
  year_2: number;
  year_3: number;
}

export interface CostModel {
  initial: CostLineItem[];
  operating: CostLineItem[];
  staffing: CostLineItem[];
}

export interface BenefitModel {
  tangible: BenefitLineItem[];
  intangible: BenefitLineItem[];
}

export interface RiskScorecard {
  technical: number;
  data: number;
  model: number;
  regulatory: number;
  organizational: number;
  vendor_lockin: number;
  change_management: number;
  cybersecurity: number;
}

export interface RiskWeights extends RiskScorecard {}

export interface CashFlowYear {
  year: number;
  benefits: number;
  costs: number;
  pre_tax: number;
  tax_impact: number;
  after_tax: number;
  cumulative: number;
  discount_factor: number;
  discounted: number;
}

export interface ComputedFinancials {
  discount_rate: number;
  cash_flow: CashFlowYear[];
  total_benefits: number;
  total_costs: number;
  npv: number;
  irr: number | null;
  roi: number;
  payback_years: number | null;
  benefit_cost_ratio: number;
  irr_passes_hurdle: boolean;
  npv_decision: NpvDecision;
}

export interface ComputedRisk {
  composite: number;
  level: string;
  by_category: Record<string, number>;
}

export interface ComputedBC {
  financials: ComputedFinancials;
  risk: ComputedRisk;
}

export interface BusinessCase {
  business_case_id: string;
  name: string;
  description: string;
  status: BusinessCaseStatus;
  created_at: string;
  updated_at: string;
  created_by?: string | null;
  inputs: ProjectInputs;
  costs: CostModel;
  benefits: BenefitModel;
  risk_scores: RiskScorecard;
  risk_weights: RiskWeights;
  computed?: ComputedBC | null;
}

export interface BusinessCaseCreate {
  name: string;
  description?: string;
  status?: BusinessCaseStatus;
  inputs?: ProjectInputs;
  costs?: CostModel;
  benefits?: BenefitModel;
  risk_scores?: RiskScorecard;
  risk_weights?: RiskWeights;
}

export const businessCasesApi = {
  list: async (status?: BusinessCaseStatus): Promise<BusinessCase[]> => {
    const params = status ? { status } : {};
    const response = await client.get<BusinessCase[]>("/api/v1/business-cases", { params });
    return response.data;
  },
  get: async (id: string): Promise<BusinessCase> => {
    const response = await client.get<BusinessCase>(`/api/v1/business-cases/${id}`);
    return response.data;
  },
  create: async (data: BusinessCaseCreate): Promise<BusinessCase> => {
    const response = await client.post<BusinessCase>("/api/v1/business-cases", data);
    return response.data;
  },
  update: async (id: string, data: Partial<BusinessCaseCreate>): Promise<BusinessCase> => {
    const response = await client.put<BusinessCase>(`/api/v1/business-cases/${id}`, data);
    return response.data;
  },
  delete: async (id: string): Promise<BusinessCase> => {
    const response = await client.delete<BusinessCase>(`/api/v1/business-cases/${id}`);
    return response.data;
  },
};

// --- Knowledge API ---

import type { GlueDatabase, AthenaWorkgroup, KnowledgeRegistration } from "../types";

export const knowledgeApi = {
  listDatabases: async (): Promise<{ databases: GlueDatabase[] }> => {
    const response = await client.get<{ databases: GlueDatabase[] }>(
      "/api/v1/knowledge/glue/databases",
    );
    return response.data;
  },
  listWorkgroups: async (): Promise<{ workgroups: AthenaWorkgroup[] }> => {
    const response = await client.get<{ workgroups: AthenaWorkgroup[] }>(
      "/api/v1/knowledge/athena/workgroups",
    );
    return response.data;
  },
  listKnowledgeBases: async (): Promise<{
    knowledge_bases: {
      id: string;
      name: string;
      description: string;
      status: string;
      updated_at: string;
    }[];
  }> => {
    const response = await client.get("/api/v1/knowledge/bedrock/knowledge-bases");
    return response.data;
  },
  register: async (data: {
    name: string;
    type: string;
    description?: string;
    config: Record<string, unknown>;
  }): Promise<KnowledgeRegistration> => {
    const response = await client.post<KnowledgeRegistration>("/api/v1/knowledge/register", data);
    return response.data;
  },
  list: async (): Promise<{ registrations: KnowledgeRegistration[]; total: number }> => {
    const response = await client.get<{ registrations: KnowledgeRegistration[]; total: number }>(
      "/api/v1/knowledge",
    );
    return response.data;
  },
  get: async (id: string): Promise<KnowledgeRegistration> => {
    const response = await client.get<KnowledgeRegistration>(`/api/v1/knowledge/${id}`);
    return response.data;
  },
  retry: async (id: string): Promise<KnowledgeRegistration> => {
    const response = await client.post<KnowledgeRegistration>(`/api/v1/knowledge/${id}/retry`);
    return response.data;
  },
  delete: async (id: string): Promise<void> => {
    await client.delete(`/api/v1/knowledge/${id}`);
  },
};
// Operating Model API ------------------------------------------------------

export type OperatingModelStatus = "Draft" | "In Progress" | "Complete" | "Archived";

export interface OperatingModelWeights {
  strategy: number;
  governance: number;
  organization: number;
  people: number;
  technology: number;
  process: number;
  ecosystem: number;
}

export interface OperatingModelDimensionResult {
  label: string;
  answered: number;
  total: number;
  average: number;
  weighted_contribution: number;
  level: number;
}

export interface ComputedOperatingModel {
  dimensions: Record<string, OperatingModelDimensionResult>;
  composite: number;
  maturity_level: number;
  recommended_pattern: string;
  recommended_governance: string;
  answered: number;
  total: number;
  completion: number;
  total_investment_m: number;
}

export interface OperatingModelCapabilityChoice {
  capability_id: number;
  placement: "Centralized" | "Hub-and-Spoke" | "Federated";
  ownership: string;
}

export interface OperatingModelInvestmentSplit {
  people_pct: number;
  technology_pct: number;
  algorithms_pct: number;
}

export interface OperatingModelRoadmapPhase {
  name: string;
  months: string;
  investment_m: number;
  enabled: boolean;
}

export interface OperatingModel {
  operating_model_id: string;
  name: string;
  description: string;
  organization: string;
  designer: string;
  status: OperatingModelStatus;
  created_at: string;
  updated_at: string;
  created_by?: string | null;
  scores: Record<string, number>;
  weights: OperatingModelWeights;
  pattern: string;
  governance: string;
  capability_choices: OperatingModelCapabilityChoice[];
  investment: OperatingModelInvestmentSplit;
  roadmap: OperatingModelRoadmapPhase[];
  computed?: ComputedOperatingModel | null;
}

export interface OperatingModelCreate {
  name: string;
  description?: string;
  organization?: string;
  designer?: string;
  status?: OperatingModelStatus;
  scores?: Record<string, number>;
  weights?: OperatingModelWeights;
  pattern?: string;
  governance?: string;
  capability_choices?: OperatingModelCapabilityChoice[];
  investment?: OperatingModelInvestmentSplit;
  roadmap?: OperatingModelRoadmapPhase[];
}

export const operatingModelApi = {
  list: async (status?: OperatingModelStatus): Promise<OperatingModel[]> => {
    const params = status ? { status } : {};
    const response = await client.get<OperatingModel[]>("/api/v1/operating-models", { params });
    return response.data;
  },
  get: async (id: string): Promise<OperatingModel> => {
    const response = await client.get<OperatingModel>(`/api/v1/operating-models/${id}`);
    return response.data;
  },
  create: async (data: OperatingModelCreate): Promise<OperatingModel> => {
    const response = await client.post<OperatingModel>("/api/v1/operating-models", data);
    return response.data;
  },
  update: async (id: string, data: Partial<OperatingModelCreate>): Promise<OperatingModel> => {
    const response = await client.put<OperatingModel>(`/api/v1/operating-models/${id}`, data);
    return response.data;
  },
  delete: async (id: string): Promise<OperatingModel> => {
    const response = await client.delete<OperatingModel>(`/api/v1/operating-models/${id}`);
    return response.data;
  },
};

// Service Approval API ------------------------------------------------------

export const serviceApprovalApi = {
  listAwsServices: async (): Promise<AwsService[]> => {
    const response = await client.get<AwsService[]>("/api/v1/service-approval/aws-services");
    return response.data;
  },

  list: async (): Promise<ServiceApprovalRun[]> => {
    const response = await client.get<ServiceApprovalRun[]>("/api/v1/service-approval/runs");
    return response.data;
  },

  get: async (slug: string): Promise<ServiceApprovalRun> => {
    const response = await client.get<ServiceApprovalRun>(`/api/v1/service-approval/runs/${slug}`);
    return response.data;
  },

  create: async (data: ServiceApprovalRunCreate): Promise<ServiceApprovalRun> => {
    const response = await client.post<ServiceApprovalRun>("/api/v1/service-approval/runs", data);
    return response.data;
  },

  cancel: async (slug: string): Promise<ServiceApprovalRun> => {
    const response = await client.post<ServiceApprovalRun>(
      `/api/v1/service-approval/runs/${slug}/cancel`,
    );
    return response.data;
  },

  delete: async (slug: string): Promise<void> => {
    await client.delete(`/api/v1/service-approval/runs/${slug}`);
  },

  listFiles: async (slug: string, phase: string): Promise<ServiceApprovalFileTree> => {
    const response = await client.get<ServiceApprovalFileTree>(
      `/api/v1/service-approval/runs/${slug}/files`,
      { params: { phase } },
    );
    return response.data;
  },

  getFile: async (slug: string, path: string): Promise<ServiceApprovalFileContent> => {
    const response = await client.get<ServiceApprovalFileContent>(
      `/api/v1/service-approval/runs/${slug}/file`,
      { params: { path } },
    );
    return response.data;
  },

  downloadAllUrl: (slug: string): string =>
    `${API_URL}/api/v1/service-approval/runs/${slug}/download`,

  downloadPhaseUrl: (slug: string, phase: string): string =>
    `${API_URL}/api/v1/service-approval/runs/${slug}/download?phase=${encodeURIComponent(phase)}`,

  downloadFileUrl: (slug: string, path: string): string =>
    `${API_URL}/api/v1/service-approval/runs/${slug}/file?path=${encodeURIComponent(path)}&download=1`,
};

// Guardrail Validation API (Mock for now - will connect to real API) --------
import type { GuardrailTestSuite, GuardrailTestRun, GuardrailValidationSummary } from "../types";

const MOCK_VALIDATION_SUMMARY: GuardrailValidationSummary = {
  totalSuites: 4,
  enabledSuites: 4,
  totalTestCases: 13,
  lastRunTimestamp: new Date(Date.now() - 1000 * 60 * 30).toISOString(), // 30 min ago
  passRate24h: 97.7,
  failedTests24h: 1,
  criticalFailures24h: 0,
  coverageByCategory: {
    pii: 4,
    "content-filter": 3,
    "denied-topics": 3,
    "prompt-injection": 3,
    grounding: 0,
    "word-filter": 0,
    regex: 0,
  },
  recentRuns: [
    {
      id: "run-001",
      suiteId: "suite-001",
      suiteName: "FSI PII Protection",
      guardrailId: "gr-001",
      guardrailName: "FSI Standard",
      timestamp: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
      duration: 2340,
      totalTests: 4,
      passed: 4,
      failed: 0,
      status: "success",
      results: [],
      triggeredBy: "scheduled",
    },
    {
      id: "run-002",
      suiteId: "suite-003",
      suiteName: "Prompt Injection Defense",
      guardrailId: "gr-001",
      guardrailName: "FSI Standard",
      timestamp: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
      duration: 1850,
      totalTests: 3,
      passed: 2,
      failed: 1,
      status: "partial",
      results: [],
      triggeredBy: "scheduled",
    },
    {
      id: "run-003",
      suiteId: "suite-002",
      suiteName: "Content Safety",
      guardrailId: "gr-001",
      guardrailName: "FSI Standard",
      timestamp: new Date(Date.now() - 1000 * 60 * 90).toISOString(),
      duration: 1560,
      totalTests: 3,
      passed: 3,
      failed: 0,
      status: "success",
      results: [],
      triggeredBy: "scheduled",
    },
  ],
  trendData7d: [
    { date: "2024-06-02", passed: 42, failed: 2 },
    { date: "2024-06-03", passed: 43, failed: 1 },
    { date: "2024-06-04", passed: 44, failed: 0 },
    { date: "2024-06-05", passed: 44, failed: 0 },
    { date: "2024-06-06", passed: 43, failed: 1 },
    { date: "2024-06-07", passed: 42, failed: 2 },
    { date: "2024-06-08", passed: 43, failed: 1 },
  ],
};

export const guardrailValidationApi = {
  getSummary: async (): Promise<GuardrailValidationSummary> => {
    // Mock - would call /api/v1/guardrails/validation/summary
    return Promise.resolve(MOCK_VALIDATION_SUMMARY);
  },

  listSuites: async (): Promise<GuardrailTestSuite[]> => {
    // Mock - would call /api/v1/guardrails/validation/suites
    return Promise.resolve([]);
  },

  listRuns: async (limit?: number): Promise<GuardrailTestRun[]> => {
    // Mock - would call /api/v1/guardrails/validation/runs
    return Promise.resolve(MOCK_VALIDATION_SUMMARY.recentRuns.slice(0, limit || 10));
  },

  getRun: async (runId: string): Promise<GuardrailTestRun | null> => {
    // Mock - would call /api/v1/guardrails/validation/runs/{runId}
    return Promise.resolve(MOCK_VALIDATION_SUMMARY.recentRuns.find((r) => r.id === runId) || null);
  },

  runSuite: async (suiteId: string): Promise<GuardrailTestRun> => {
    // Mock - would call POST /api/v1/guardrails/validation/suites/{suiteId}/run
    return Promise.resolve({
      id: `run-${Date.now()}`,
      suiteId,
      suiteName: "Test Suite",
      guardrailId: "gr-001",
      guardrailName: "FSI Standard",
      timestamp: new Date().toISOString(),
      duration: 0,
      totalTests: 0,
      passed: 0,
      failed: 0,
      status: "success",
      results: [],
      triggeredBy: "manual",
    });
  },
};

import type {
  AdvPOJob,
  AdvPOJobCreate,
  AdvPOJobSummary,
  AdvPODatasetUpload,
  AdvPODatasetUploadResult,
  AdvPODatasetList,
  AdvPOResults,
  AdvPOModelList,
  AdvPOJobList,
} from "../types";

// Advanced Prompt Optimization (AdvPO) API
// Bedrock job identifiers may be a full ARN or the bare 12-char job ID. ARNs
// contain slashes which break path routing, so we always use the bare ID.
const advpoJobId = (idOrArn: string) => idOrArn.split("/").pop() ?? idOrArn;

export const advpoApi = {
  createJob: async (data: AdvPOJobCreate): Promise<AdvPOJobSummary> => {
    const response = await client.post<AdvPOJobSummary>("/api/v1/advpo/jobs", data);
    return response.data;
  },

  getJob: async (jobIdentifier: string): Promise<AdvPOJob> => {
    const response = await client.get<AdvPOJob>(
      `/api/v1/advpo/jobs/${encodeURIComponent(advpoJobId(jobIdentifier))}`,
    );
    return response.data;
  },

  uploadDataset: async (data: AdvPODatasetUpload): Promise<AdvPODatasetUploadResult> => {
    const response = await client.post<AdvPODatasetUploadResult>("/api/v1/advpo/datasets", data);
    return response.data;
  },

  listDatasets: async (): Promise<AdvPODatasetList> => {
    const response = await client.get<AdvPODatasetList>("/api/v1/advpo/datasets");
    return response.data;
  },

  deleteDataset: async (key: string): Promise<void> => {
    await client.delete("/api/v1/advpo/datasets", { params: { key } });
  },

  getResults: async (jobIdentifier: string): Promise<AdvPOResults> => {
    const response = await client.get<AdvPOResults>(
      `/api/v1/advpo/jobs/${encodeURIComponent(advpoJobId(jobIdentifier))}/results`,
    );
    return response.data;
  },

  listModels: async (): Promise<AdvPOModelList> => {
    const response = await client.get<AdvPOModelList>("/api/v1/advpo/models");
    return response.data;
  },

  listJobs: async (maxResults = 50): Promise<AdvPOJobList> => {
    const response = await client.get<AdvPOJobList>("/api/v1/advpo/jobs", {
      params: { max_results: maxResults },
    });
    return response.data;
  },

  stopJob: async (jobIdentifier: string): Promise<void> => {
    await client.post(`/api/v1/advpo/jobs/${encodeURIComponent(advpoJobId(jobIdentifier))}/stop`);
  },

  deleteJob: async (jobIdentifier: string): Promise<void> => {
    await client.delete(`/api/v1/advpo/jobs/${encodeURIComponent(advpoJobId(jobIdentifier))}`);
  },
};

// Organization Design API ---------------------------------------------------

export type OrganizationDesignStatus = "Draft" | "In Progress" | "Complete" | "Archived";

export interface ODOrgProfile {
  company_name: string;
  company_size: number;
  industry: string;
  structure_type: string;
  scenario_pathway: string;
  current_phase: string;
  target_phase: string;
  annual_revenue_m: number;
  ai_budget_pct: number;
  num_departments: number;
  geographic_presence: string;
}

export interface ODValueChainActivity {
  key: string;
  label: string;
  kind: "primary" | "support";
  strategic_importance: number;
  ai_automation_potential: number;
  current_capability_gap: string;
}

export interface ODCriticalCapability {
  key: string;
  label: string;
  priority: number;
  current_maturity: number;
  source_strategy: string;
}

export interface ODStrategyInputs {
  business_model: string;
  competitive_positioning: string;
  primary_value_driver: string;
  market_dynamics: string;
  revenue_model: string;
  value_chain: ODValueChainActivity[];
  capabilities: ODCriticalCapability[];
}

export interface ODRapidDecision {
  key: string;
  label: string;
  recommend: string;
  agree: string;
  perform: string;
  input_role: string;
  decide: string;
}

export interface ODOperatingModelInputs {
  num_product_lines: number;
  num_geographies: number;
  num_customer_segments: number;
  coordination_mechanism: string;
  operating_archetype: string;
  rapid_decisions: ODRapidDecision[];
}

export interface ODMaturityScores {
  ai_maturity: number;
  skills_talent: number;
  resources_investment: number;
  coordination_complexity: number;
  industry_context: number;
  culture_change_readiness: number;
  governance_accountability: number;
  leadership_capability: number;
}

export interface ODFunctionConfig {
  key: string;
  label: string;
  type: "Shared Services" | "Specialized";
  headcount: number;
  automated_processes: number;
}

export interface ODAgentConfig {
  total_automated_processes: number;
  target_ratio_label: string;
  span_of_control: number;
  pct_subordinate: number;
  pct_peer: number;
  functions: ODFunctionConfig[];
}

export interface ODDimensionResult { label: string; score: number; weight: number; weighted: number; gap: number; }
export interface ODGateStatus { key: string; label: string; score: number; required: number; passed: boolean; detail: string; }
export interface ODFunctionAgentBreakdown {
  key: string; label: string; type: string;
  human_staff: number; total_agents: number;
  agents_subordinate: number; agents_peer: number;
  supervisors: number; teams: number;
  dominant_role: string; total_positions: number; ratio_label: string;
}
export interface ODHierarchyLayer {
  layer: number; level_name: string; human_roles: string;
  agent_functions: string; headcount: number; ratio: string; phase_active: string;
}
export interface ODTransitionEconomics {
  severance_cost: number; reskilling_investment: number; hiring_cost: number;
  productivity_dip_cost: number; total_transition_cost: number;
  expected_annual_savings: number; payback_years: number | null; three_year_roi: number;
}
export interface ODWorkforcePhase {
  phase: string; total_headcount: number; build: number; buy: number; borrow: number; bot: number; total_cost: number;
}
export interface ODWorkforcePlan { phases: ODWorkforcePhase[]; total_investment: number; reskill_vs_hire_savings: number; }
export interface ODScenarioSummary {
  scenario: string; timeline: string; productivity: string; investment_pct: string;
  headcount_reduction: string; severance_cost: number; reskilling: number;
  risk_level: string; success_probability: string; payback: string; ratio: string; layers_eliminated: string;
}
export interface ODInvestmentAllocation {
  total_budget_m: number; technology_m: number; data_infra_m: number; people_process_m: number;
}

export interface ComputedOrganizationDesign {
  dimensions: Record<string, ODDimensionResult>;
  weights: Record<string, number>;
  composite: number;
  simple_average: number;
  archetype: string;
  complexity_class: string;
  coordination_nodes: number;
  expanded_archetype: string;
  scale_class: string;
  strategic_ai_readiness: number;
  gates: ODGateStatus[];
  all_gates_passed: boolean;
  scenario_alignment: string;
  recommended_structure: string;
  current_layers: number;
  target_layers: number;
  layers_eliminated: number;
  span_current_min: number;
  span_current_max: number;
  span_ai_adjusted: number;
  governance_level: string;
  ratio_target: string;
  expected_productivity_gain: string;
  investment: ODInvestmentAllocation;
  functions: ODFunctionAgentBreakdown[];
  hierarchy: ODHierarchyLayer[];
  transition: ODTransitionEconomics;
  workforce: ODWorkforcePlan;
  scenarios: ODScenarioSummary[];
  total_ai_agents: number;
  total_agents_subordinate: number;
  total_agents_peer: number;
  total_human_supervisors: number;
  total_teams: number;
  pct_workforce_ai: number;
  effective_ratio: string;
}

export interface OrganizationDesign {
  organization_design_id: string;
  name: string;
  description: string;
  organization: string;
  designer: string;
  status: OrganizationDesignStatus;
  created_at: string;
  updated_at: string;
  created_by?: string | null;
  profile: ODOrgProfile;
  strategy: ODStrategyInputs;
  operating_model: ODOperatingModelInputs;
  scores: ODMaturityScores;
  weights?: Record<string, number> | null;
  agent_config: ODAgentConfig;
  computed?: ComputedOrganizationDesign | null;
}

export interface OrganizationDesignCreate {
  name: string;
  description?: string;
  organization?: string;
  designer?: string;
  status?: OrganizationDesignStatus;
  profile?: ODOrgProfile;
  strategy?: ODStrategyInputs;
  operating_model?: ODOperatingModelInputs;
  scores?: ODMaturityScores;
  weights?: Record<string, number> | null;
  agent_config?: ODAgentConfig;
}

export const organizationDesignApi = {
  list: async (status?: OrganizationDesignStatus): Promise<OrganizationDesign[]> => {
    const params = status ? { status } : {};
    const response = await client.get<OrganizationDesign[]>("/api/v1/organization-designs", { params });
    return response.data;
  },
  get: async (id: string): Promise<OrganizationDesign> => {
    const response = await client.get<OrganizationDesign>(`/api/v1/organization-designs/${id}`);
    return response.data;
  },
  create: async (data: OrganizationDesignCreate): Promise<OrganizationDesign> => {
    const response = await client.post<OrganizationDesign>("/api/v1/organization-designs", data);
    return response.data;
  },
  update: async (id: string, data: Partial<OrganizationDesignCreate>): Promise<OrganizationDesign> => {
    const response = await client.put<OrganizationDesign>(`/api/v1/organization-designs/${id}`, data);
    return response.data;
  },
  delete: async (id: string): Promise<OrganizationDesign> => {
    const response = await client.delete<OrganizationDesign>(`/api/v1/organization-designs/${id}`);
    return response.data;
  },
  framework: async (): Promise<Record<string, any>> => {
    const response = await client.get<Record<string, any>>("/api/v1/organization-designs/framework");
    return response.data;
  },
};

// ─────────────────────────── Govern Audit API ───────────────────────────
// Append-only governance audit / decision log. Backend uses snake_case
// (decision_context, ts as ISO datetime); the Govern module's AuditEvent shape
// is camelCase with a human-ish ts. These helpers map between the two so the
// backend is a drop-in for the frontend auditLog store.

export interface GovernAuditEventDto {
  id: string;
  ts: string;
  category: string;
  severity: string;
  actor: string;
  summary: string;
  action: string;
  agent?: string | null;
  evidence?: string | null;
  decision_context?: string | null;
  created_by?: string | null;
}

/** The frontend-facing shape (mirrors components/govern/mockData AuditEvent). */
export interface GovernAuditEvent {
  id: string;
  ts: string;
  category: 'guardrail' | 'incident' | 'approval' | 'deployment' | 'config' | 'enforcement' | 'a2a';
  severity: 'low' | 'medium' | 'high' | 'critical';
  actor: string;
  summary: string;
  action: string;
  agent?: string;
  evidence?: string;
  decisionContext?: string;
}

export interface GovernAuditEventCreate {
  category: GovernAuditEvent['category'];
  severity: GovernAuditEvent['severity'];
  actor: string;
  summary: string;
  action: string;
  agent?: string;
  evidence?: string;
  decisionContext?: string;
}

function fromAuditDto(d: GovernAuditEventDto): GovernAuditEvent {
  // Render ISO datetime as "YYYY-MM-DD HH:mm" to match the module's display style.
  const ts = typeof d.ts === 'string' && d.ts.includes('T')
    ? d.ts.slice(0, 16).replace('T', ' ')
    : d.ts;
  return {
    id: d.id,
    ts,
    category: d.category as GovernAuditEvent['category'],
    severity: d.severity as GovernAuditEvent['severity'],
    actor: d.actor,
    summary: d.summary,
    action: d.action,
    agent: d.agent ?? undefined,
    evidence: d.evidence ?? undefined,
    decisionContext: d.decision_context ?? undefined,
  };
}

export const governAuditApi = {
  list: async (category?: string, limit = 200): Promise<GovernAuditEvent[]> => {
    const params: Record<string, string | number> = { limit };
    if (category) params.category = category;
    const response = await client.get<GovernAuditEventDto[]>("/api/v1/govern/audit/events", { params });
    return response.data.map(fromAuditDto);
  },

  append: async (event: GovernAuditEventCreate): Promise<GovernAuditEvent> => {
    const payload = {
      category: event.category,
      severity: event.severity,
      actor: event.actor,
      summary: event.summary,
      action: event.action,
      agent: event.agent,
      evidence: event.evidence,
      decision_context: event.decisionContext,
    };
    const response = await client.post<GovernAuditEventDto>("/api/v1/govern/audit/events", payload);
    return fromAuditDto(response.data);
  },
};

// ─────────────────────────── Govern Graduation API ───────────────────────────
// Earned autonomy computed from the real audit log. The backend returns
// snake_case with a signals/ratchet shape; these helpers adapt to the frontend
// AgentGraduation shape (components/govern/graduationData) so EarnedAutonomyView
// renders backend data with no structural change.

interface BackendGraduation {
  agent_id: string;
  name: string;
  business_unit: string;
  current_level: number;
  target_level: number | null;
  verdict: string;
  readiness: number;
  summary: string;
  criteria: { label: string; requirement: string; value: string; status: string; blocking: boolean; detail?: string }[];
  signals: { agreement_rate: number; agreement_trend: string };
  ratchet: { step_down_triggered: boolean; step_down_reason?: string | null };
  reviewer_hours_per_month: number;
}

/** Adapt a backend graduation record to the frontend AgentGraduation shape. */
function fromGraduationDto(d: BackendGraduation): any {
  return {
    agentId: d.agent_id,
    name: d.name,
    businessUnit: d.business_unit,
    currentLevel: d.current_level,
    targetLevel: d.target_level,
    verdict: d.verdict,
    readiness: d.readiness,
    summary: d.summary,
    // Map backend "insufficient" -> "warning" so the existing statusMeta renders.
    criteria: (d.criteria || []).map(c => ({
      label: c.label, requirement: c.requirement, value: c.value,
      status: c.status === "insufficient" ? "warning" : c.status,
      blocking: c.blocking, detail: c.detail,
    })),
    agreementRate: d.signals?.agreement_rate ?? 0,
    agreementTrend: d.signals?.agreement_trend ?? "flat",
    reviewerHoursPerMonth: d.reviewer_hours_per_month,
    stepDown: { triggered: !!d.ratchet?.step_down_triggered, reason: d.ratchet?.step_down_reason ?? undefined },
    reclaimable: d.verdict === "ready" && !d.ratchet?.step_down_triggered,
  };
}

export const governGraduationApi = {
  list: async (): Promise<any[]> => {
    const response = await client.get<BackendGraduation[]>("/api/v1/govern/graduation");
    return response.data.map(fromGraduationDto);
  },

  seed: async (): Promise<{ seeded_agents: string[]; roster: number }> => {
    const response = await client.post("/api/v1/govern/graduation/seed", {});
    return response.data;
  },

  promote: async (agentId: string, probationDays?: number, overrideStepDown = false): Promise<any> => {
    const response = await client.post(`/api/v1/govern/graduation/${agentId}/promote`, {
      probation_days: probationDays ?? null,
      override_step_down: overrideStepDown,
    });
    return fromGraduationDto(response.data);
  },

  reportIncident: async (agentId: string): Promise<any> => {
    const response = await client.post(`/api/v1/govern/graduation/${agentId}/report-incident`, {});
    return fromGraduationDto(response.data);
  },
};

// ─────────────────────────── Govern Enforcement API ───────────────────────────
// Runtime allow/pause/deny PDP. The gate matrix + dry-run evaluate work with no
// table (pure logic), so this surface is fully live locally.

export type GateMatrix = Record<string, Record<string, Record<string, string>>>;

export interface EnforcementDecision {
  id: string;
  ts: string;
  agent_id: string;
  scope_level: number;
  action_type: string;
  tool: string;
  risk_tier: string;
  disposition: 'allow' | 'pause' | 'deny';
  reason: string;
  matched_by: string;
  enforcement_mode: 'advisory' | 'blocking';
  source_principal: string;
  args_fingerprint?: string | null;
  handoff_id?: string | null;
  resolved_decision_id?: string | null;
}

export interface EvaluateActionRequest {
  agent_id: string;
  scope_level: number;
  action_type: 'read' | 'write' | 'execute' | 'external' | 'admin';
  tool?: string;
  risk_tier: 'low' | 'medium' | 'high' | 'critical';
  source_principal?: string;
  args?: Record<string, unknown>;
}

export const governEnforcementApi = {
  gate: async (): Promise<{ gate: GateMatrix; legend: Record<string, string> }> => {
    const response = await client.get("/api/v1/govern/enforcement/gate");
    return response.data;
  },

  evaluate: async (req: EvaluateActionRequest, dryRun = true, mode: 'advisory' | 'blocking' = 'advisory'): Promise<EnforcementDecision> => {
    const response = await client.post<EnforcementDecision>(
      `/api/v1/govern/enforcement/evaluate?dry_run=${dryRun}&mode=${mode}`, req,
    );
    return response.data;
  },

  decisions: async (agentId?: string): Promise<EnforcementDecision[]> => {
    const params = agentId ? { agent_id: agentId } : {};
    const response = await client.get<EnforcementDecision[]>("/api/v1/govern/enforcement/decisions", { params });
    return response.data;
  },
};

// ─────────────────────────── Govern SR 26-2 API ───────────────────────────

export interface Sr26Control {
  id: string; label: string; agent_reframe: string;
  status: string; evaluated_value?: string | null; signal_source: string; iso42001_ref?: string | null;
}
export interface Sr26Pillar { key: string; name: string; controls: Sr26Control[]; }
export interface Sr26Computed {
  total_controls: number; passed: number; conformance_pct: number; evidence_backed_pct: number;
  warning?: number; failed?: number; not_started?: number; last_evaluated_at?: string | null;
}
export interface Sr26Mapping {
  sr26_id: string; name: string; standard: string; agent_id?: string | null;
  materiality_tier: string; pillars: Sr26Pillar[]; computed?: Sr26Computed | null;
}

export const governSr26Api = {
  list: async (): Promise<Sr26Mapping[]> => (await client.get("/api/v1/govern/sr26/mappings")).data,
  create: async (name: string, agent_id?: string): Promise<Sr26Mapping> =>
    (await client.post("/api/v1/govern/sr26/mappings", { name, agent_id })).data,
  evaluate: async (id: string, autonomy_level?: number, graduation_ready?: boolean): Promise<Sr26Mapping> =>
    (await client.post(`/api/v1/govern/sr26/mappings/${id}/evaluate`, { autonomy_level, graduation_ready })).data,
};

// ─────────────────────────── Govern A2A Trust API ───────────────────────────

export interface DelegationDecision {
  id: string; ts?: string; source_agent_id: string; target_agent_id: string; action: string;
  effect: 'permit' | 'deny'; denied_by?: string | null; reason: string; matched_policy_id?: string | null;
  effective_autonomy_ceiling: number; requested_autonomy: number; source_scope: number; target_scope: number;
}
export interface TrustPolicy {
  policy_id: string; name: string; source_pattern: string; target_pattern: string;
  allowed_actions: string[]; effect: string; max_delegated_autonomy: number; enabled: boolean;
}

export const governA2AApi = {
  listPolicies: async (): Promise<TrustPolicy[]> => (await client.get("/api/v1/govern/a2a-trust/policies")).data,
  evaluate: async (req: {
    source_agent_id: string; target_agent_id: string; action: string;
    requested_autonomy: number; chain_depth?: number;
  }): Promise<DelegationDecision> =>
    (await client.post("/api/v1/govern/a2a-trust/evaluate", req)).data,
  exportCedar: async (policyId: string): Promise<{ cedar: string }> =>
    (await client.get(`/api/v1/govern/a2a-trust/policies/${policyId}/cedar`)).data,
};

// ─────────────────────────── Govern Conformance API (ISO 42001) ───────────────────────────

export interface ClauseControl {
  id: string; section: string; label: string; status: string;
  evidence?: string | null; owner?: string | null; due_date?: string | null;
}
export interface ConformanceCategory { name: string; controls: ClauseControl[]; }
export interface ConformanceComputed {
  total_controls: number; passed: number; in_progress: number; failed: number;
  not_started: number; not_applicable: number; conformance_pct: number;
}
export interface ConformanceRecord {
  conformance_id: string; name: string; standard: string; organization?: string | null;
  next_audit?: string | null; categories: ConformanceCategory[]; computed?: ConformanceComputed | null;
}

// A starter ISO/IEC 42001 clause catalog (Cl. 4-9), used to create the first
// record so the surface has content in a fresh environment.
export const DEFAULT_ISO42001_CATEGORIES: ConformanceCategory[] = [
  { name: 'Clause 4-5: Context & Leadership', controls: [
    { id: 'ISO-4.1', section: 'Cl. 4.1', label: 'Organizational context determined', status: 'pass', owner: 'AI Governance Council' },
    { id: 'ISO-4.3', section: 'Cl. 4.3', label: 'AIMS scope defined', status: 'pass', owner: 'AI Governance Council' },
    { id: 'ISO-5.1', section: 'Cl. 5.1', label: 'Leadership commitment demonstrated', status: 'pass', owner: 'C-Suite' },
    { id: 'ISO-5.2', section: 'Cl. 5.2', label: 'AI policy established', status: 'pass', owner: 'AI Governance Council' },
  ]},
  { name: 'Clause 6: Planning', controls: [
    { id: 'ISO-6.1', section: 'Cl. 6.1', label: 'AI risks and opportunities addressed', status: 'pass', owner: 'Risk Management' },
    { id: 'ISO-6.2', section: 'Cl. 6.2', label: 'AIMS objectives set and tracked', status: 'in-progress', owner: 'AI Governance Council' },
  ]},
  { name: 'Clause 7: Support', controls: [
    { id: 'ISO-7.2', section: 'Cl. 7.2', label: 'Competence requirements defined', status: 'pass', owner: 'HR' },
    { id: 'ISO-7.3', section: 'Cl. 7.3', label: 'Awareness program implemented', status: 'in-progress', owner: 'L&D' },
    { id: 'ISO-7.5', section: 'Cl. 7.5', label: 'Documented information controlled', status: 'pass', owner: 'Compliance' },
  ]},
  { name: 'Clause 8: Operation', controls: [
    { id: 'ISO-8.2', section: 'Cl. 8.2', label: 'AI system impact assessment', status: 'pass', owner: 'RAI Council' },
    { id: 'ISO-8.3', section: 'Cl. 8.3', label: 'AI system lifecycle processes', status: 'pass', owner: 'ML Platform' },
    { id: 'ISO-8.4', section: 'Cl. 8.4', label: 'Third-party AI relationships managed', status: 'in-progress', owner: 'Vendor Management' },
  ]},
  { name: 'Clause 9: Performance Evaluation', controls: [
    { id: 'ISO-9.1', section: 'Cl. 9.1', label: 'Monitoring and measurement', status: 'pass', owner: 'AI Governance Council' },
    { id: 'ISO-9.2', section: 'Cl. 9.2', label: 'Internal audit conducted', status: 'not-started', owner: 'Internal Audit' },
  ]},
];

export const governConformanceApi = {
  list: async (): Promise<ConformanceRecord[]> => (await client.get("/api/v1/govern/conformance/records")).data,
  create: async (name: string, categories: ConformanceCategory[]): Promise<ConformanceRecord> =>
    (await client.post("/api/v1/govern/conformance/records", { name, categories })).data,
  update: async (id: string, categories: ConformanceCategory[]): Promise<ConformanceRecord> =>
    (await client.put(`/api/v1/govern/conformance/records/${id}`, { categories })).data,
};

// Govern Cost — real AWS spend from Cost Explorer (govern_cost slice).
export interface AwsCostByService { service: string; amount: number; }
export interface AwsCostByMonth { month: string; amount: number; }
export interface AwsCostSummary {
  total: number;
  currency: string;
  period_start: string;
  period_end: string;
  by_service: AwsCostByService[];
  by_month: AwsCostByMonth[];
  live: boolean;
  source: string;
  note?: string | null;
}

export interface AwsUseCaseSpend { use_case_id: string; total_cost_usd: number; input_tokens: number; output_tokens: number; request_count: number; top_model?: string | null; }
export interface AwsUseCaseSpendResponse { by_use_case: AwsUseCaseSpend[]; total_cost_usd: number; window_days: number; live: boolean; source: string; note?: string | null; }
export interface AwsBudget { name: string; limit: number; actual: number; forecast: number; time_unit: string; pct_used: number; }
export interface AwsBudgetsResponse { budgets: AwsBudget[]; total_limit: number; total_actual: number; live: boolean; source: string; note?: string | null; }
export interface AwsTagKeyOption { key: string; active: boolean; }
export interface AwsTagKeysResponse { keys: AwsTagKeyOption[]; discovered: boolean; source: string; note?: string | null; }
export interface AwsCostByTagValue { value: string; amount: number; }
export interface AwsCostTagBreakdown {
  tag_key: string; by_value: AwsCostByTagValue[]; tagged_total: number; untagged_total: number;
  period_start: string; period_end: string; live: boolean; source: string; note?: string | null;
}
export interface AwsCostByModel { model: string; amount: number; }
export interface AwsCostModelBreakdown {
  by_model: AwsCostByModel[]; total: number; period_start: string; period_end: string; live: boolean; source: string; note?: string | null;
}
export interface AwsCostByDay { date: string; amount: number; }
export interface AwsCostTrend {
  days: AwsCostByDay[]; total: number; avg_per_day: number; live: boolean; source: string; note?: string | null;
}
export interface AwsCostForecast {
  forecast_total: number; months: AwsCostByMonth[]; horizon_start: string; horizon_end: string; live: boolean; source: string; note?: string | null;
}
export interface AwsCostAnomaly { start: string; end: string; service?: string | null; impact: number; score: number; }
export interface AwsCostAnomalies { anomalies: AwsCostAnomaly[]; count: number; live: boolean; source: string; note?: string | null; }
export interface AwsProviderConnector { provider: string; label: string; connected: boolean; source: string; detail: string; }
export interface AwsProviderConnectorsResponse { connectors: AwsProviderConnector[]; connected_count: number; total_count: number; live: boolean; source: string; note?: string | null; }

// ─── Govern Models — live Bedrock catalog + CloudWatch runtime metrics ───
export interface AwsFoundationModel { model_id: string; name: string; provider: string; input_modalities: string[]; output_modalities: string[]; streaming: boolean; inference_types: string[]; lifecycle: string; }
export interface AwsFoundationModelCatalog { models: AwsFoundationModel[]; total: number; providers: string[]; active: number; live: boolean; source: string; note?: string | null; }
export interface AwsModelRuntimeMetrics { model_id: string; invocations: number; avg_latency_ms: number; client_errors: number; server_errors: number; input_tokens: number; output_tokens: number; cache_read_tokens: number; cache_write_tokens: number; error_rate_pct: number; }
export interface AwsModelMetricsResponse { by_model: AwsModelRuntimeMetrics[]; total_invocations: number; avg_latency_ms: number; fleet_error_rate_pct: number; window_days: number; live: boolean; source: string; note?: string | null; }

export const governModelsApi = {
  catalog: async (provider?: string): Promise<AwsFoundationModelCatalog> =>
    (await client.get("/api/v1/govern/models/catalog", { params: provider ? { provider } : {} })).data,
  runtimeMetrics: async (days = 7): Promise<AwsModelMetricsResponse> =>
    (await client.get("/api/v1/govern/models/runtime-metrics", { params: { days } })).data,
};

// ─── Govern Evals — live Bedrock evaluation jobs ───
export interface AwsEvaluationJob { job_arn: string; name: string; status: string; application_type: string; task_types: string[]; models: string[]; created_at?: string | null; }
export interface AwsEvaluationJobsResponse { jobs: AwsEvaluationJob[]; total: number; completed: number; in_progress: number; failed: number; model_evals: number; rag_evals: number; live: boolean; source: string; note?: string | null; }

export interface AwsMetricScore { metric: string; mean_score: number; count: number; }
export interface AwsEvalScoresResponse { job_arn: string; job_name: string; application_type: string; metrics: AwsMetricScore[]; records_scored: number; capped: boolean; live: boolean; source: string; note?: string | null; }

export const governEvalsApi = {
  jobs: async (maxJobs = 100): Promise<AwsEvaluationJobsResponse> =>
    (await client.get("/api/v1/govern/evals/jobs", { params: { max_jobs: maxJobs } })).data,
  // Use job_name for lookup (safer than passing full ARNs with account IDs).
  scores: async (jobName: string): Promise<AwsEvalScoresResponse> =>
    (await client.get("/api/v1/govern/evals/scores", { params: { job_name: jobName } })).data,
};

// ─── Govern Guardrails — live Bedrock guardrail intervention telemetry ───
export interface AwsGuardrailSummary { guardrail_id: string; name: string; status: string; version: string; description?: string | null; created_at?: string | null; invocations: number; interventions: number; intervention_rate_pct: number; has_metrics: boolean; }
export interface AwsGuardrailPolicyBreakdown { policy_type: string; label: string; interventions: number; dimension: string; }
export interface AwsGuardrailTelemetryResponse { guardrails: AwsGuardrailSummary[]; by_policy: AwsGuardrailPolicyBreakdown[]; total_guardrails: number; total_invocations: number; total_interventions: number; intervention_rate_pct: number; guardrails_with_metrics: number; window_days: number; live: boolean; source: string; note?: string | null; }

export const governGuardrailsApi = {
  telemetry: async (days = 30): Promise<AwsGuardrailTelemetryResponse> =>
    (await client.get("/api/v1/govern/guardrails/telemetry", { params: { days } })).data,
};

// ─── Govern Invocation Safety — live runtime telemetry from Bedrock invocation logs ───
export interface AwsStopReasonCount { reason: string; count: number; }
export interface AwsModelInvocationRollup { model_id: string; calls: number; guardrail_intervened: number; }
export interface AwsInvocationDailyPoint { date: string; calls: number; guardrail_intervened: number; }
export interface AwsInvocationSafetyResponse {
  window_days: number; total_calls: number; completion_calls: number; guardrail_intervened: number;
  intervention_rate_pct: number; stop_reasons: AwsStopReasonCount[]; by_model: AwsModelInvocationRollup[];
  trend: AwsInvocationDailyPoint[]; input_tokens: number; output_tokens: number;
  log_group?: string | null; logging_enabled: boolean; live: boolean; source: string; note?: string | null;
}

export const governInvocationSafetyApi = {
  telemetry: async (days = 7): Promise<AwsInvocationSafetyResponse> =>
    (await client.get("/api/v1/govern/invocation-safety/telemetry", { params: { days } })).data,
};

// ─── Govern Risk Posture — live Security Hub findings ───
export interface AwsSecurityFinding { id: string; title: string; severity: string; product: string; compliance_status?: string | null; resource_type?: string | null; updated_at?: string | null; }
export interface AwsSeverityCount { severity: string; count: number; }
export interface AwsRiskPostureResponse { by_severity: AwsSeverityCount[]; top_findings: AwsSecurityFinding[]; total: number; critical: number; high: number; live: boolean; source: string; note?: string | null; }

export const governRiskPostureApi = {
  securityHub: async (scan = 200): Promise<AwsRiskPostureResponse> =>
    (await client.get("/api/v1/govern/risk-posture/security-hub", { params: { scan } })).data,
};

// ─── Govern Trail — live CloudTrail AI-service activity ───
export interface AwsTrailEvent { event_id: string; event_name: string; event_source: string; event_time?: string | null; username?: string | null; error_code?: string | null; }
export interface AwsTrailResponse { events: AwsTrailEvent[]; total: number; by_source: Record<string, number>; errors: number; window_hours: number; live: boolean; source: string; note?: string | null; }

export interface AwsAiCaller { identity: string; event_count: number; sources: string[]; top_actions: string[]; last_seen?: string | null; recognized: boolean; }
export interface AwsAiCallersResponse { callers: AwsAiCaller[]; total_callers: number; unrecognized: number; window_hours: number; live: boolean; source: string; note?: string | null; }

export const governTrailApi = {
  aiActivity: async (hours = 24): Promise<AwsTrailResponse> =>
    (await client.get("/api/v1/govern/trail/ai-activity", { params: { hours } })).data,
  aiCallers: async (hours = 168): Promise<AwsAiCallersResponse> =>
    (await client.get("/api/v1/govern/trail/ai-callers", { params: { hours } })).data,
};

// ─── Govern AgentCore — real deployed agents (Bedrock + AgentCore) + posture ───
export interface AwsDiscoveredAgent { id: string; name: string; status: string; platform: string; version?: string | null; updated_at?: string | null; }
export interface AwsDiscoveredAgentsResponse { agents: AwsDiscoveredAgent[]; total: number; bedrock_agents: number; agentcore_runtimes: number; live: boolean; source: string; note?: string | null; }
export interface AwsPostureResource { name: string; status?: string | null; updated_at?: string | null; }
export interface AwsPostureCategory { key: string; label: string; total: number; ready: number; items: AwsPostureResource[]; live: boolean; note?: string | null; }
export interface AwsAgentCorePostureResponse { categories: AwsPostureCategory[]; live: boolean; source: string; note?: string | null; }

export interface AwsAgentRuntimeMetric { runtime_name: string; invocations: number; avg_latency_ms: number; errors: number; sessions: number; }
export interface AwsAgentRuntimeMetricsResponse { by_agent: AwsAgentRuntimeMetric[]; window_days: number; live: boolean; source: string; note?: string | null; }

export const governAgentCoreApi = {
  agents: async (): Promise<AwsDiscoveredAgentsResponse> =>
    (await client.get("/api/v1/govern/agentcore/agents")).data,
  posture: async (): Promise<AwsAgentCorePostureResponse> =>
    (await client.get("/api/v1/govern/agentcore/posture")).data,
  agentMetrics: async (days = 7): Promise<AwsAgentRuntimeMetricsResponse> =>
    (await client.get("/api/v1/govern/agentcore/agent-metrics", { params: { days } })).data,
};

// ─── Govern Security — unified posture from GuardDuty/Macie/Inspector/Access Analyzer ───
export interface AwsSecuritySeverityCount { severity: string; count: number; }
export interface AwsSecuritySourceSummary { source: string; label: string; dimension: string; total: number; critical: number; high: number; by_severity: AwsSecuritySeverityCount[]; top_types: string[]; live: boolean; note?: string | null; }
export interface AwsSecurityPostureResponse { sources: AwsSecuritySourceSummary[]; total_findings: number; critical: number; high: number; sources_live: number; sources_total: number; live: boolean; source: string; note?: string | null; }

export const governSecurityApi = {
  posture: async (): Promise<AwsSecurityPostureResponse> =>
    (await client.get("/api/v1/govern/security/posture")).data,
};

// ─── GuardDuty AI Protection — AI-related threat detection findings ───

export type GuardDutyAISeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export interface GuardDutyAIFinding {
  id: string;
  type: string;
  title: string;
  description: string;
  severity: GuardDutyAISeverity;
  resource_type: string;
  resource_id: string;
  region: string;
  service: string;
  created_at: string;
  updated_at: string;
  ai_category: 'prompt_injection' | 'data_exfiltration' | 'model_abuse' | 'credential_access' | 'unauthorized_access' | 'anomalous_behavior';
  confidence: number;
  account_id?: string;
  investigate_url?: string;
}

export interface GuardDutyAIFindingsResponse {
  findings: GuardDutyAIFinding[];
  total: number;
  by_severity: { severity: GuardDutyAISeverity; count: number }[];
  by_category: { category: string; count: number }[];
  live: boolean;
  source: string;
  note?: string | null;
}

export const guardDutyAIApi = {
  /** Get AI-related findings from GuardDuty AI Protection */
  findings: async (limit = 50): Promise<GuardDutyAIFindingsResponse> =>
    (await client.get("/api/v1/govern/guardduty-ai/findings", { params: { limit } })).data,
};

// ─── Govern Posture — live AWS Config compliance ───
export interface AwsConfigCompliance { compliant: number; non_compliant: number; insufficient_data: number; total_rules: number; pct_compliant: number; live: boolean; source: string; note?: string | null; }

export interface AwsFailingRule { rule_name: string; description?: string | null; managed_rule?: string | null; failing_resource_count: number; resource_types: string[]; last_evaluated?: string | null; }
export interface AwsConfigRuleDetail { failing_rules: AwsFailingRule[]; total_failing: number; live: boolean; source: string; note?: string | null; }

export const governPostureApi = {
  configCompliance: async (): Promise<AwsConfigCompliance> =>
    (await client.get("/api/v1/govern/posture/config-compliance")).data,
  configRuleDetail: async (): Promise<AwsConfigRuleDetail> =>
    (await client.get("/api/v1/govern/posture/config-rule-detail")).data,
};

export const governCostApi = {
  summary: async (months = 6, aiOnly = false): Promise<AwsCostSummary> =>
    (await client.get("/api/v1/govern/cost/summary", { params: { months, ai_only: aiOnly } })).data,
  byModel: async (months = 6): Promise<AwsCostModelBreakdown> =>
    (await client.get("/api/v1/govern/cost/by-model", { params: { months } })).data,
  byTag: async (key = "business-unit", months = 6): Promise<AwsCostTagBreakdown> =>
    (await client.get("/api/v1/govern/cost/by-tag", { params: { key, months } })).data,
  tagKeys: async (): Promise<AwsTagKeysResponse> =>
    (await client.get("/api/v1/govern/cost/tag-keys")).data,
  budgets: async (): Promise<AwsBudgetsResponse> =>
    (await client.get("/api/v1/govern/cost/budgets")).data,
  byUseCase: async (days = 30): Promise<AwsUseCaseSpendResponse> =>
    (await client.get("/api/v1/govern/cost/by-use-case", { params: { days } })).data,
  providerConnectors: async (): Promise<AwsProviderConnectorsResponse> =>
    (await client.get("/api/v1/govern/cost/provider-connectors")).data,
  trend: async (days = 30): Promise<AwsCostTrend> =>
    (await client.get("/api/v1/govern/cost/trend", { params: { days } })).data,
  forecast: async (months = 3): Promise<AwsCostForecast> =>
    (await client.get("/api/v1/govern/cost/forecast", { params: { months } })).data,
  anomalies: async (days = 60): Promise<AwsCostAnomalies> =>
    (await client.get("/api/v1/govern/cost/anomalies", { params: { days } })).data,
};

// Govern Data Sources API — unified sync status
export interface DataSourceInfo {
  name: string;
  status: 'connected' | 'partial' | 'error';
  live: boolean;
  source: string | null;
  note: string | null;
  latency_ms: number;
  metrics: Record<string, number> | null;
  error: string | null;
}

export interface DataSourcesStatus {
  summary: {
    connected: number;
    total: number;
    all_connected: boolean;
    timestamp: number;
  };
  sources: Record<string, DataSourceInfo>;
}

export const governDataSourcesApi = {
  status: async (): Promise<DataSourcesStatus> =>
    (await client.get("/api/v1/govern/data-sources/status")).data,
  refresh: async (): Promise<{ success: boolean; caches_cleared: number; guardrails_synced: number }> =>
    (await client.post("/api/v1/govern/data-sources/refresh")).data,
};

// Data Catalog types
export interface DataDomain {
  name: string;
  description: string;
  table_count: number;
  location: string | null;
  classification: string | null;
  quality_score: number | null;
}

export interface QualityRule {
  rule_name: string;
  dataset: string;
  status: 'pass' | 'fail';
  dimension: string;
  score: number | null;
  last_run: string | null;
}

export interface SensitivityBucket {
  category: string;
  count: number;
  color: string;
  examples: string[];
}

export interface SetupGuidance {
  service: string;
  docs_url: string;
  title: string;
  description?: string;
  steps: string[];
  cli_command?: string;
  iam_policy?: Record<string, unknown>;
  benefits?: string[];
}

export interface DataCatalogSummary {
  catalog: {
    live: boolean;
    source: string;
    note: string | null;
    domains: DataDomain[];
    quality_rules: QualityRule[];
    total_databases: number;
    total_tables: number;
    total_quality_rules: number;
    quality_rules_passing: number;
    setup_guidance: SetupGuidance | null;
  };
  sensitivity: {
    live: boolean;
    source: string;
    note: string | null;
    buckets_analyzed: number;
    buckets_with_sensitive: number;
    sensitivity_breakdown: SensitivityBucket[];
    bucket_classifications: Array<{
      bucket_name: string;
      sensitivity: string;
      object_count: number;
      sensitive_objects: number;
      top_detections: string[];
    }>;
    top_sensitive_types: string[];
    setup_guidance: SetupGuidance | null;
  };
}

export const governDataCatalogApi = {
  summary: async (): Promise<DataCatalogSummary> =>
    (await client.get("/api/v1/govern/data-catalog/summary")).data,
  domains: async () =>
    (await client.get("/api/v1/govern/data-catalog/domains")).data,
  quality: async () =>
    (await client.get("/api/v1/govern/data-catalog/quality")).data,
  sensitivity: async () =>
    (await client.get("/api/v1/govern/data-catalog/sensitivity")).data,
};

// ─── Govern Controls — live control evaluation from AWS sources ───
export interface ControlEvaluation {
  controlId: string;
  status: 'pass' | 'fail' | 'in-progress' | 'not-evaluated';
  evidence: string;
  lastEvaluated: string;
  confidence: number;
}

export interface EvaluateControlsResponse {
  live: boolean;
  evaluations: ControlEvaluation[];
  sources: Record<string, { live: boolean; latency_ms: number }>;
}

export interface ControlEvaluationRequest {
  id: string;
  autoDetectSource: string;
}

export const governControlsApi = {
  evaluate: async (controls: ControlEvaluationRequest[]): Promise<EvaluateControlsResponse> =>
    (await client.post("/api/v1/govern/controls/evaluate", { controls })).data,
};

// ─── Govern Fleet — server-side aggregation for 10k+ scale ───
export interface FleetGovernanceDistribution { compliant: number; review_needed: number; blocked: number; unknown: number; }
export interface FleetRiskDistribution { critical: number; high: number; medium: number; low: number; }
export interface FleetScopeDistribution { '1': number; '2': number; '3': number; '4': number; }
export interface FleetSummary {
  total: number;
  governance: FleetGovernanceDistribution;
  risk: FleetRiskDistribution;
  scope: FleetScopeDistribution;
  prod_full_agency: number;
  open_incidents: number;
  unprotected: number;
  needs_attention: number;
  pct_compliant: number;
  live: boolean;
  source: string;
  note?: string | null;
}
export interface FleetSummaryResponse { summary: FleetSummary; live: boolean; source: string; note?: string | null; }

export interface FleetSegmentRow { key: string; total: number; compliant: number; review_needed: number; blocked: number; critical: number; high: number; pct_compliant: number; }
export interface FleetSegmentsResponse { group_by: string; segments: FleetSegmentRow[]; live: boolean; source: string; note?: string | null; }

export interface FleetExceptionAgent {
  id: string;
  name: string;
  business_unit: string;
  environment: 'prod' | 'pilot' | 'dev';
  provider: string;
  scope_level: number;
  governance_status: string;
  risk_score: number;
  open_incidents: number;
  has_policy: boolean;
  attention_score: number;
  reasons: string[];
}
export interface FleetExceptionsResponse {
  queue: FleetExceptionAgent[];
  queue_size: number;
  total_needing_attention: number;
  limit: number;
  filter_key?: string | null;
  live: boolean;
  source: string;
  note?: string | null;
}

export interface FleetInventoryRow { key: string; count: number; pct_of_fleet: number; }
export interface FleetInventoryResponse { by_model: FleetInventoryRow[]; by_provider: FleetInventoryRow[]; live: boolean; source: string; note?: string | null; }

export const governFleetApi = {
  summary: async (): Promise<FleetSummaryResponse> =>
    (await client.get("/api/v1/govern/fleet/summary")).data,
  segments: async (groupBy: 'businessUnit' | 'provider' | 'environment' = 'businessUnit'): Promise<FleetSegmentsResponse> =>
    (await client.get("/api/v1/govern/fleet/segments", { params: { group_by: groupBy } })).data,
  exceptions: async (limit = 100, filterKey?: string): Promise<FleetExceptionsResponse> =>
    (await client.get("/api/v1/govern/fleet/exceptions", { params: { limit, filter_key: filterKey } })).data,
  inventory: async (): Promise<FleetInventoryResponse> =>
    (await client.get("/api/v1/govern/fleet/inventory")).data,
};

// ─────────────────────────── Compliance Attestation API ───────────────────────────

export type ControlStatus = 'pass' | 'in-progress' | 'fail' | 'not-started';
export type EvidenceType = 'document' | 'link' | 'screenshot' | 'api-check' | 'auto-detected';

export interface Evidence {
  id: string;
  type: EvidenceType;
  name: string;
  description?: string;
  url?: string;
  uploaded_at: string;
  uploaded_by: string;
}

export interface ControlAttestation {
  control_id: string;
  framework_id: string;
  status: ControlStatus;
  owner?: string;
  notes?: string;
  evidence: Evidence[];
  due_date?: string;
  last_reviewed?: string;
  reviewed_by?: string;
  auto_detected: boolean;
  auto_detection_source?: string;
  updated_at: string;
  updated_by: string;
}

export interface ControlAttestationUpdate {
  status?: ControlStatus;
  owner?: string;
  notes?: string;
  due_date?: string;
  reviewed_by?: string;
}

export interface EvidenceCreate {
  type: EvidenceType;
  name: string;
  description?: string;
  url?: string;
}

export interface FrameworkSummary {
  framework_id: string;
  framework_name: string;
  total_controls: number;
  pass_count: number;
  in_progress_count: number;
  fail_count: number;
  not_started_count: number;
  coverage_pct: number;
  last_updated?: string;
}

export interface CompliancePosture {
  frameworks: FrameworkSummary[];
  overall_coverage_pct: number;
  total_controls: number;
  total_pass: number;
  total_gaps: number;
  auto_detected_count: number;
  last_sync?: string;
}

export interface AutoDetectionResult {
  control_id: string;
  framework_id: string;
  detected_status: ControlStatus;
  source: string;
  confidence: number;
  details?: string;
}

export const complianceApi = {
  /** Get overall compliance posture across all frameworks. */
  getPosture: async (): Promise<CompliancePosture> =>
    (await client.get('/api/v1/govern/compliance/posture')).data,

  /** Get summary stats for a specific framework. */
  getFrameworkSummary: async (frameworkId: string): Promise<FrameworkSummary> =>
    (await client.get(`/api/v1/govern/compliance/frameworks/${frameworkId}/summary`)).data,

  /** List all attestations for a framework. */
  listAttestations: async (frameworkId: string): Promise<ControlAttestation[]> =>
    (await client.get(`/api/v1/govern/compliance/frameworks/${frameworkId}/attestations`)).data,

  /** Get a single control attestation. */
  getAttestation: async (frameworkId: string, controlId: string): Promise<ControlAttestation> =>
    (await client.get(`/api/v1/govern/compliance/frameworks/${frameworkId}/controls/${controlId}`)).data,

  /** Update a control attestation. */
  updateAttestation: async (
    frameworkId: string,
    controlId: string,
    update: ControlAttestationUpdate,
    updatedBy = 'user'
  ): Promise<ControlAttestation> =>
    (await client.put(
      `/api/v1/govern/compliance/frameworks/${frameworkId}/controls/${controlId}`,
      update,
      { params: { updated_by: updatedBy } }
    )).data,

  /** Add evidence to a control. */
  addEvidence: async (
    frameworkId: string,
    controlId: string,
    evidence: EvidenceCreate,
    uploadedBy = 'user'
  ): Promise<Evidence> =>
    (await client.post(
      `/api/v1/govern/compliance/frameworks/${frameworkId}/controls/${controlId}/evidence`,
      evidence,
      { params: { uploaded_by: uploadedBy } }
    )).data,

  /** List evidence for a control. */
  listEvidence: async (frameworkId: string, controlId: string): Promise<Evidence[]> =>
    (await client.get(`/api/v1/govern/compliance/frameworks/${frameworkId}/controls/${controlId}/evidence`)).data,

  /** Run auto-detection to update attestations from AWS services. */
  runAutoDetection: async (): Promise<AutoDetectionResult[]> =>
    (await client.post('/api/v1/govern/compliance/auto-detect')).data,

  /** Bulk update attestations (for imports/migrations). */
  bulkUpdate: async (attestations: Partial<ControlAttestation>[], updatedBy = 'bulk-import'): Promise<{ updated: number }> =>
    (await client.post('/api/v1/govern/compliance/bulk-update', attestations, { params: { updated_by: updatedBy } })).data,
};

// ─── Developer AI Usage API — usage metrics, anomalies, shadow AI detection ───

export interface DeveloperAiUsageOverview {
  tokens: number;
  cost: number;
  active_users: number;
  sessions: number;
}

export interface DeveloperAiTeamUsage {
  team: string;
  tokens: number;
  cost: number;
  users: number;
  pct_of_total: number;
}

export interface DeveloperAiTopUser {
  email: string;
  tokens: number;
  cost: number;
  sessions: number;
  last_active: string;
  anomaly: 'spend_spike' | 'runaway_loop' | 'off_hours' | null;
}

export interface DeveloperAiAnomaly {
  id: string;
  type: 'spend_spike' | 'runaway_loop' | 'off_hours';
  user: string;
  amount: number;
  baseline: number;
  timestamp: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
}

export interface ShadowAiUnapprovedUser {
  email: string;
  first_seen: string;
  tokens: number;
  source: string;
  recommended_action: string;
}

export interface ShadowAiUnknownTool {
  tool_name: string;
  first_seen: string;
  users: number;
  requests: number;
  evidence: string;
  recommended_action: string;
}

export interface ShadowAiUnapprovedModel {
  model_id: string;
  users: number;
  requests: number;
  cost: number;
  evidence: string;
  recommended_action: string;
}

export interface ShadowAiDetection {
  unapproved_users: ShadowAiUnapprovedUser[];
  unknown_tools: ShadowAiUnknownTool[];
  unapproved_models: ShadowAiUnapprovedModel[];
  total_shadow_events: number;
  shadow_cost_estimate: number;
}

export interface DeveloperAiUsageResponse {
  // Flat fields from backend (matches Pydantic DeveloperUsageResponse)
  total_input_tokens: number;
  total_output_tokens: number;
  total_tokens: number;
  total_cost_usd: number;
  total_sessions: number;
  active_users: number;
  by_user: Array<{ user: string; tokens: number; cost: number; sessions: number }>;
  by_team: DeveloperAiTeamUsage[];
  trend: Array<{ date: string; tokens: number; cost: number; sessions: number }>;
  period_start: string;
  period_end: string;
  shadow_ai?: ShadowAiDetection;
  live: boolean;
  source: string;
  note?: string | null;
}

export const governDeveloperAiApi = {
  /** Get developer AI usage overview, team breakdown, top users, anomalies, and shadow AI detection. */
  usage: async (): Promise<DeveloperAiUsageResponse> =>
    (await client.get('/api/v1/govern/developer-ai/usage')).data,

  /** Get anomaly alerts for developer AI usage. */
  anomalies: async (days = 30): Promise<{ anomalies: DeveloperAiAnomaly[]; live: boolean; source: string; note?: string | null }> =>
    (await client.get('/api/v1/govern/developer-ai/anomalies', { params: { days } })).data,

  /** Get shadow AI detection results. */
  shadowAi: async (): Promise<{ shadow_ai: ShadowAiDetection; live: boolean; source: string; note?: string | null }> =>
    (await client.get('/api/v1/govern/developer-ai/shadow-ai')).data,
};
